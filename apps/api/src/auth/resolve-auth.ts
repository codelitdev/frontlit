import { fromNodeHeaders } from "better-auth/node";
import {
    createCentralAuthResolver,
    sendCentralAuthError,
    verifyOAuthBearerToken,
    type CentralAuthInput,
    type CentralAuthResult,
} from "@codelitdev/oauth-server-kit";
import {
    ensureFrontLitAccountForBetterAuthUserId,
    ensureFrontLitAccountForUser,
    type Account,
} from "../account/queries";
import {
    getApiKeyBySecret,
    type ApiKey,
} from "../apikey/queries";
import { getTeamMembership } from "../team/queries";
import {
    auth,
    authIssuer,
    mcpResourceUrl,
    oauthResourceClient,
    validOAuthAudiences,
} from "./better-auth";

export type AuthInput = CentralAuthInput;
export type AuthResult = CentralAuthResult<Account>;

export type AuthDependencies = {
    getApiKeyBySecret: (secret: string) => Promise<ApiKey | null>;
    getBetterAuthSession: (
        headers: Record<string, string | string[] | undefined>,
    ) => Promise<{
        user: { id?: string; email: string; name?: string | null };
    } | null>;
    verifyBetterAuthBearerToken: (
        token: string,
    ) => Promise<{
        sub?: string;
        azp?: string;
        scope?: string;
        team_id?: string;
    } | null>;
    ensureAccountForBetterAuthUserId: (
        userId: string,
    ) => Promise<Account | null>;
    ensureAccountForUser: (user: {
        id?: string;
        email: string;
        name?: string | null;
    }) => Promise<Account>;
    getTeamMembership: (
        teamId: string,
        accountId: string,
    ) => Promise<unknown | null>;
};

const defaultDependencies: AuthDependencies = {
    getApiKeyBySecret,
    async getBetterAuthSession(headers) {
        return auth.api.getSession({
            headers: fromNodeHeaders(headers),
        }) as Promise<{
            user: { id?: string; email: string; name?: string | null };
        } | null>;
    },
    verifyBetterAuthBearerToken: (token) =>
        verifyOAuthBearerToken(
            {
                oauthResourceClient,
                validAudiences: validOAuthAudiences,
                issuer: authIssuer,
                mcpResourceUrl,
            },
            token,
        ),
    ensureAccountForBetterAuthUserId:
        ensureFrontLitAccountForBetterAuthUserId,
    ensureAccountForUser: ensureFrontLitAccountForUser,
    getTeamMembership,
};

function resolver(dependencies: AuthDependencies) {
    return createCentralAuthResolver<Account, ApiKey>({
        verifyBearerToken: dependencies.verifyBetterAuthBearerToken,
        getApiKeyBySecret: dependencies.getApiKeyBySecret,
        getApiKeyTeamId: (apiKey) => apiKey.teamId,
        getSession: dependencies.getBetterAuthSession,
        ensureAccountForBearerSubject:
            dependencies.ensureAccountForBetterAuthUserId,
        ensureAccountForSessionUser: dependencies.ensureAccountForUser,
        hasTeamMembership: async (teamId, accountId) =>
            Boolean(
                await dependencies.getTeamMembership(teamId, accountId),
            ),
    });
}

export function resolveAuth(
    input: AuthInput,
    dependencies: AuthDependencies = defaultDependencies,
): Promise<AuthResult> {
    return resolver(dependencies)(input);
}

export function sendAuthError(
    res: any,
    result: AuthResult,
    resourceMetadataUrl?: string,
): boolean {
    return sendCentralAuthError(res, result, {
        resourceMetadataUrl,
        apiKeyHeaderName: "x-frontlit-apikey",
    });
}
