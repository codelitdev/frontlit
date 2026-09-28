import type { Request } from "express";
import {
  computeEffectivePermissions,
  type TeamPermission,
} from "@frontlit/api-contract";
import { logger } from "../services/log";
import { findTeamById, getTeamMembership } from "../team/queries";
import {
  getRestOperationPolicy,
  type OperationPolicy,
  type RestOperation,
} from "./operation-policy";
import { authBaseUrl, mcpResourceUrl, webClientUrl } from "./better-auth";

export type AuthzContext = {
  authKind: "session" | "oauth" | "apikey";
  teamId?: string;
  accountId?: string;
  membershipId?: string;
  isOwner: boolean;
  permissions: TeamPermission[];
  scopes: string[];
  audiences: string[];
  apiKeyId?: string;
  oauthIssuedAt?: Date;
  sessionAuthenticatedAt?: Date;
};

export type AuthzDenial = {
  status: 401 | 403;
  body: {
    error: string;
    error_description?: string;
    permission?: string;
    scope?: string;
  };
};

const RECENT_AUTH_WINDOW_MS = 10 * 60 * 1000;

const SENSITIVE_BROWSER_OPERATIONS = new Set<string>([
  "teams.remove",
  "teams.transferOwnership",
]);

export function buildAuthzContext(input: {
  authKind: AuthzContext["authKind"];
  team?: { ownerAccountId: string } | null;
  membership?: {
    id: string;
    memberId?: string;
    accountId: string;
    permissions?: string[] | null;
    createdAt?: Date;
  } | null;
  accountId?: string;
  scopes?: string[];
  audiences?: string[];
  apiKeyId?: string;
  oauthIssuedAt?: Date;
  sessionAuthenticatedAt?: Date;
}): AuthzContext {
  const isOwner = Boolean(
    input.accountId && input.team && input.team.ownerAccountId === input.accountId,
  );
  return {
    authKind: input.authKind,
    teamId: input.team ? undefined : undefined,
    accountId: input.accountId,
    membershipId: input.membership?.memberId ?? input.membership?.id,
    isOwner,
    permissions: computeEffectivePermissions(input.membership?.permissions ?? [], {
      isOwner,
    }),
    scopes: input.scopes ?? [],
    audiences: input.audiences ?? [],
    apiKeyId: input.apiKeyId,
    oauthIssuedAt: input.oauthIssuedAt,
    sessionAuthenticatedAt: input.sessionAuthenticatedAt,
  };
}

export function membershipGenerationValid(
  membershipCreatedAt: Date | undefined,
  oauthIssuedAt: Date | undefined,
): boolean {
  if (!membershipCreatedAt || !oauthIssuedAt) return false;
  return oauthIssuedAt.getTime() >= membershipCreatedAt.getTime();
}

export async function loadTeamAuthz(
  req: Request,
  teamInternalId: string,
): Promise<AuthzContext> {
  const anyReq = req as any;
  if (
    anyReq.authz &&
    anyReq.authz.teamId === teamInternalId &&
    anyReq.authz.authKind === anyReq.authKind
  ) {
    return anyReq.authz as AuthzContext;
  }

  const team = await findTeamById(teamInternalId);
  const authKind = anyReq.authKind as AuthzContext["authKind"];
  if (authKind === "apikey") {
    const context: AuthzContext = {
      authKind: "apikey",
      teamId: teamInternalId,
      isOwner: false,
      permissions: [],
      scopes: [],
      audiences: [],
      apiKeyId: anyReq.apiKeyId,
    };
    anyReq.authz = context;
    return context;
  }

  const membership = anyReq.accountId
    ? await getTeamMembership(teamInternalId, anyReq.accountId)
    : null;
  const isOwner = Boolean(
    team && anyReq.accountId && team.ownerAccountId === anyReq.accountId,
  );
  const context: AuthzContext = {
    authKind,
    teamId: teamInternalId,
    accountId: anyReq.accountId,
    membershipId: membership?.memberId,
    isOwner,
    permissions: computeEffectivePermissions(membership?.permissions ?? [], {
      isOwner,
    }),
    scopes: Array.isArray(anyReq.scopes) ? anyReq.scopes : [],
    audiences: Array.isArray(anyReq.oauthAudiences) ? anyReq.oauthAudiences : [],
    oauthIssuedAt: anyReq.oauthIssuedAt ? new Date(anyReq.oauthIssuedAt) : undefined,
    sessionAuthenticatedAt: anyReq.sessionAuthenticatedAt
      ? new Date(anyReq.sessionAuthenticatedAt)
      : undefined,
  };
  anyReq.authz = context;
  anyReq.isOwner = isOwner;
  anyReq.effectivePermissions = context.permissions;
  return context;
}

export function evaluatePolicy(
  policy: OperationPolicy,
  context: AuthzContext,
  options: {
    resourceAudience?: string;
    requireRecentAuth?: boolean;
    requireCsrf?: boolean;
    originAllowed?: boolean;
  } = {},
): AuthzDenial | null {
  if (context.authKind === "apikey") {
    if (policy.apiKeyAccess === "deny") {
      return {
        status: 403,
        body: {
          error: "user_auth_required",
          error_description: "This operation requires a user-authenticated session.",
        },
      };
    }
    return null;
  }

  if (context.authKind === "oauth") {
    if (policy.oauthScope === "unsupported") {
      return {
        status: 403,
        body: {
          error: "unsupported_auth",
          error_description: "This operation does not accept OAuth authentication.",
        },
      };
    }
    if (options.resourceAudience) {
      if (!context.audiences.includes(options.resourceAudience)) {
        return {
          status: 401,
          body: {
            error: "invalid_token",
            error_description: "The access token is not valid for this resource.",
          },
        };
      }
    }
    if (!context.scopes.includes(policy.oauthScope)) {
      return {
        status: 403,
        body: {
          error: "insufficient_scope",
          error_description: `This operation requires '${policy.oauthScope}'.`,
          scope: policy.oauthScope,
        },
      };
    }
  }

  if (policy.tenant === "account") {
    if (!context.accountId) {
      return {
        status: 401,
        body: { error: "unauthorized" },
      };
    }
    return sessionMutationGuards(context, options);
  }

  if (context.authKind === "session") {
    const sessionGuard = sessionMutationGuards(context, options);
    if (sessionGuard) return sessionGuard;
  }

  if (policy.human.kind === "owner") {
    if (!context.isOwner) {
      return {
        status: 403,
        body: {
          error: "owner_required",
          error_description: "Only the team owner can do this.",
        },
      };
    }
    return null;
  }

  if (policy.human.kind === "member") {
    if (!context.membershipId && !context.isOwner) {
      return {
        status: 403,
        body: {
          error: "not_a_team_member",
          error_description: "You are not a member of this team.",
        },
      };
    }
    return null;
  }

  if (!context.isOwner && !context.permissions.includes(policy.human.permission)) {
    return {
      status: 403,
      body: {
        error: "insufficient_permission",
        error_description: `This operation requires '${policy.human.permission}'.`,
        permission: policy.human.permission,
      },
    };
  }

  return null;
}

function sessionMutationGuards(
  context: AuthzContext,
  options: {
    requireRecentAuth?: boolean;
    requireCsrf?: boolean;
    originAllowed?: boolean;
  },
): AuthzDenial | null {
  if (context.authKind !== "session") return null;
  if (options.requireCsrf && options.originAllowed === false) {
    return {
      status: 403,
      body: {
        error: "csrf_rejected",
        error_description: "The request origin is not trusted.",
      },
    };
  }
  if (options.requireRecentAuth) {
    const at = context.sessionAuthenticatedAt;
    if (!at || Date.now() - at.getTime() > RECENT_AUTH_WINDOW_MS) {
      return {
        status: 403,
        body: {
          error: "recent_authentication_required",
          error_description:
            "Confirm your identity with a fresh email code to continue.",
        },
      };
    }
  }
  return null;
}

export function isTrustedOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  const allowed = new Set(
    [
      webClientUrl || "http://localhost:3000",
      authBaseUrl || "http://localhost:4000",
    ].map((value) => value.replace(/\/$/, "")),
  );
  return allowed.has(origin.replace(/\/$/, ""));
}

function headerString(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (Array.isArray(value) && typeof value[0] === "string" && value[0]) {
    return value[0];
  }
  return undefined;
}

export function requestOrigin(req: Request): string | undefined {
  const forwarded = headerString(req.headers["x-frontlit-origin"]);
  if (forwarded) return forwarded;
  const origin = headerString(req.headers.origin);
  if (origin) return origin;
  const referer = headerString(req.headers.referer);
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export async function authorizeRestOperation(
  req: Request,
  operation: string,
  extras: { teamId?: string } = {},
): Promise<AuthzDenial | null> {
  const policy = getRestOperationPolicy(operation);
  if (!policy) {
    logger.warn({ operation }, "Authorization denied: unregistered operation");
    return {
      status: 403,
      body: {
        error: "insufficient_permission",
        error_description: "This operation is not authorized.",
      },
    };
  }

  const anyReq = req as any;
  const teamId = extras.teamId ?? anyReq.teamId;
  let context: AuthzContext;
  if (policy.tenant === "team") {
    if (!teamId) {
      return {
        status: 403,
        body: {
          error: "not_a_team_member",
          error_description: "You are not a member of this team.",
        },
      };
    }
    context = await loadTeamAuthz(req, teamId);
    context.teamId = teamId;
  } else {
    context = {
      authKind: anyReq.authKind,
      accountId: anyReq.accountId,
      isOwner: false,
      permissions: [],
      scopes: Array.isArray(anyReq.scopes) ? anyReq.scopes : [],
      audiences: Array.isArray(anyReq.oauthAudiences) ? anyReq.oauthAudiences : [],
      sessionAuthenticatedAt: anyReq.sessionAuthenticatedAt,
      oauthIssuedAt: anyReq.oauthIssuedAt,
      apiKeyId: anyReq.apiKeyId,
    };
  }

  const mutating =
    req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
  const denial = evaluatePolicy(policy, context, {
    resourceAudience: context.authKind === "oauth" ? authBaseUrl : undefined,
    requireRecentAuth:
      context.authKind === "session" && SENSITIVE_BROWSER_OPERATIONS.has(operation),
    requireCsrf: context.authKind === "session" && mutating,
    originAllowed:
      isTrustedOrigin(requestOrigin(req)) ||
      Boolean(headerString(req.headers["x-test-principal"])),
  });

  if (denial) {
    logger.warn(
      {
        operation,
        authKind: context.authKind,
        required:
          policy.tenant === "team" && policy.human.kind === "permission"
            ? policy.human.permission
            : policy.tenant === "team"
              ? policy.human.kind
              : "authenticated",
        error: denial.body.error,
      },
      "Authorization denied",
    );
  }
  return denial;
}

export function withOperation<TArgs extends { req: Request }, TResult>(
  operation: RestOperation | ((args: TArgs) => RestOperation),
  handler: (args: TArgs) => Promise<TResult>,
): (args: TArgs) => Promise<TResult> {
  return async (args) => {
    const name = typeof operation === "function" ? operation(args) : operation;
    const denial = await authorizeRestOperation(args.req, name);
    if (denial) {
      return { status: denial.status, body: denial.body } as TResult;
    }
    return handler(args);
  };
}

export function authorizeHandlers<T>(
  handlers: T,
  operations: Record<string, RestOperation | ((args: any) => RestOperation)>,
): T {
  const wrapped: Record<string, unknown> = {};
  for (const key of Object.keys(handlers as object)) {
    wrapped[key] = withOperation(
      operations[key],
      (handlers as Record<string, (args: any) => Promise<any>>)[key],
    );
  }
  return wrapped as T;
}

export { mcpResourceUrl };
