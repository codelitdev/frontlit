import { createObservability } from "@codelitdev/observability";

const otlpEndpoint = process.env.OTLP_LOGS_ENDPOINT;
const otlpAuthorization = process.env.OTLP_LOGS_AUTHORIZATION;
const posthogApiKey = process.env.POSTHOG_API_KEY;
const posthogHost = process.env.POSTHOG_HOST;

export const observability = createObservability({
  serviceName: "frontlit-api",
  environment: process.env.NODE_ENV ?? "development",
  logs: {
    level: process.env.LOG_LEVEL ?? "info",
    ...(otlpEndpoint
      ? {
          otlp: {
            endpoint: otlpEndpoint,
            ...(otlpAuthorization
              ? { headers: { authorization: otlpAuthorization } }
              : {}),
          },
        }
      : {}),
  },
  ...(posthogApiKey
    ? {
        posthog: {
          apiKey: posthogApiKey,
          ...(posthogHost ? { host: posthogHost } : {}),
        },
      }
    : {}),
  contextPolicy: {
    propertyAllowlist: new Set([
      "path",
      "method",
      "teamId",
      "requestId",
      "operation",
      "authKind",
      "job_id",
    ]),
  },
});

export const logger = observability.logger;
