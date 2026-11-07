import { generateOpenApi } from "@ts-rest/open-api";
import { contract } from "@frontlit/api-contract";

const isProduction = process.env.NODE_ENV === "production";
const localHost = `localhost:${process.env.PORT || 4000}`;

export const openApiDocument = generateOpenApi(
  contract,
  {
    info: {
      title: "FrontLit API",
      description:
        "FrontLit REST API for building and serving sites. Authenticate with a team-scoped API key or an OAuth2 bearer token. OAuth tokens belong to the user's account and work in every team they are a member of: choose the team per request with the `X-Frontlit-Team-Id` header (optional only when the user belongs to one team). Every request is limited to the user's role and permissions in that team. Team selection errors: `team_required` (409, lists your teams), `no_team` (409), `invalid_team_id` (400), `not_a_team_member` (403), `team_mismatch` (403, an API key used with another team).",
      version: "0.1.0",
    },
    servers: [
      {
        url: "{protocol}://{host}",
        description: "API Server",
        variables: {
          // Defaults to plain http/localhost outside production so
          // Swagger UI's "Try it out" works against a local server
          // without manually overriding the server variables first.
          protocol: {
            default: isProduction ? "https" : "http",
            enum: ["https", "http"],
          },
          host: {
            default: isProduction ? "api.frontlit.dev" : localHost,
          },
        },
      },
    ],
    tags: [
      {
        name: "Pages",
        description: "Pages built with the page-builder block layout.",
      },
      {
        name: "Themes",
        description: "Saved, reusable theme styles (colors, typography, structure).",
      },
      {
        name: "Teams",
        description:
          "Team management (list/create/rename/delete), per-team API keys, and server-to-server provisioning.",
      },
      {
        name: "Media",
        description:
          "Team media library, backed by MediaLit. FrontLit servers never receive file bytes — uploads go direct-to-MediaLit using a short-lived signature.",
      },
      {
        name: "Blog",
        description:
          "Blog posts — one of three kinds built on the shared documents engine (blog/doc/changelog), with draft/publish state.",
      },
      {
        name: "Public",
        description:
          "Unauthenticated, published-only reads for public site rendering. Resolved by a team's public id.",
      },
      {
        name: "Doc",
        description: "Private help-center document authoring and publishing.",
      },
      {
        name: "Docs",
        description: "Help-center section management and semantic search.",
      },
      {
        name: "Changelog",
        description: "Changelog authoring and publishing.",
      },
      {
        name: "Email",
        description:
          "SendLit-backed contacts, segments, settings, broadcasts, and analytics.",
      },
      { name: "Chatbot", description: "Team chatbot configuration." },
      {
        name: "Help Desk",
        description:
          "The team's unified support-ticket and chatbot-conversation inbox.",
      },
      {
        name: "Domains",
        description:
          "A team's default `<slug>.<PLATFORM_SITE_DOMAIN>` subdomain plus an optional attached, DNS-verified custom domain.",
      },
      {
        name: "Settings",
        description:
          "Per-team site-wide branding/code injection plus the SendLit-backed email delivery provider.",
      },
    ],
    components: {
      securitySchemes: {
        apiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-frontlit-apikey",
        },
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        provisioningSecretAuth: {
          type: "apiKey",
          in: "header",
          name: "X-Frontlit-Provisioning-Secret",
        },
      },
    },
    security: [{ apiKeyAuth: [] }, { bearerAuth: [] }],
  },
  {
    operationMapper: (operation, route) => {
      const path = (route as { path?: string }).path;

      return {
        ...operation,
        tags: (route.metadata as { tag?: string } | undefined)?.tag
          ? [(route.metadata as { tag: string }).tag]
          : operation.tags,
        security:
          path === "/provisioning/teams"
            ? [{ provisioningSecretAuth: [] }]
            : path?.startsWith("/public/")
              ? []
              : operation.security,
      };
    },
  },
);
