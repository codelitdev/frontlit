import { z } from "zod";
import { documentationDiagnosticSchema } from "./documentation";

/**
 * API reference generated from a team's OpenAPI spec
 * (docs/openapi-support.md). Everything here is computed once at import;
 * the public site only maps it to page-builder primitives.
 */

/** Operation and landing-page descriptions: TipTap JSON when the Markdown is
 * supported, else plain text. Schema and parameter descriptions are always
 * plain text. */
export type ApiRichText =
  | { kind: "doc"; content: Record<string, unknown> }
  | { kind: "text"; text: string };

/** A JSON Schema object from the spec. `$ref`s to `#/components/schemas/*`
 * stay as references and resolve against `ApiOperationSlice.schemas`. */
export type ApiSchema = Record<string, unknown>;

export type ApiParameterLocation = "path" | "query" | "header" | "cookie";

export interface ApiParameter {
  name: string;
  in: ApiParameterLocation;
  required: boolean;
  deprecated: boolean;
  description?: string;
  schema?: ApiSchema;
}

export interface ApiMediaContent {
  contentType: string;
  schema?: ApiSchema;
  /** Pretty-printed example: the spec's own, else generated from the schema. */
  example?: string;
}

export interface ApiRequestBody {
  required: boolean;
  description?: string;
  content: ApiMediaContent[];
}

export interface ApiResponse {
  status: string;
  description?: string;
  content: ApiMediaContent[];
}

export interface ApiSecurityScheme {
  key: string;
  type: "apiKey" | "http" | "oauth2" | "openIdConnect" | "mutualTLS";
  in?: "header" | "query" | "cookie";
  name?: string;
  /** For `http`: `bearer`, `basic`, ... */
  scheme?: string;
  bearerFormat?: string;
  description?: string;
}

/** Scheme keys that must all be sent together. An operation's requirements
 * are alternatives: any one of them is enough; none means public. */
export type ApiSecurityRequirement = string[];

export interface ApiServerVariable {
  name: string;
  default: string;
  enum?: string[];
  description?: string;
}

export interface ApiServer {
  url: string;
  description?: string;
  variables: ApiServerVariable[];
}

export interface ApiCodeSample {
  label: string;
  lang: string;
  source: string;
}

export type ApiPlaygroundAuth =
  | { kind: "apiKey"; key: string; in: "header" | "query"; name: string }
  | { kind: "bearer"; key: string }
  | { kind: "basic"; key: string }
  | { kind: "unsupported"; key: string; reason: string };

export interface ApiPlaygroundField {
  name: string;
  required: boolean;
  binary: boolean;
  description?: string;
  enum?: string[];
  example?: string;
}

/** The small model the "Try it" panel is built from. */
export interface ApiPlaygroundModel {
  method: string;
  path: string;
  servers: ApiServer[];
  /** Why "Try it" is unavailable for this operation, if it is. */
  unavailable?: string;
  parameters: (ApiPlaygroundField & { in: ApiParameterLocation })[];
  body?: {
    mediaType: string;
    kind: "json" | "multipart" | "form" | "text";
    required: boolean;
    example?: string;
    fields: ApiPlaygroundField[];
  };
  /** Alternatives; each lists the schemes to send together. Empty: public. */
  auth: ApiPlaygroundAuth[][];
}

export interface ApiOperationSlice {
  method: string;
  path: string;
  operationId?: string;
  title: string;
  description?: ApiRichText;
  group: string;
  deprecated: boolean;
  parameters: ApiParameter[];
  requestBody?: ApiRequestBody;
  responses: ApiResponse[];
  /** `null` when the spec doesn't describe authentication for this operation. */
  security: ApiSecurityRequirement[] | null;
  securitySchemes: ApiSecurityScheme[];
  servers: ApiServer[];
  /** Components this operation references, keyed by `#/components/schemas/X`. */
  schemas: Record<string, ApiSchema>;
  codeSamples: ApiCodeSample[];
  playground: ApiPlaygroundModel;
}

export interface ApiReferenceInfo {
  title: string;
  version: string;
  description?: ApiRichText;
  servers: ApiServer[];
  securitySchemes: ApiSecurityScheme[];
}

export const apiReferenceOperationSummarySchema = z.object({
  route: z.string(),
  title: z.string(),
  method: z.string(),
  path: z.string(),
  deprecated: z.boolean(),
});
export const apiReferenceGroupSchema = z.object({
  name: z.string(),
  operations: z.array(apiReferenceOperationSummarySchema),
});
/** Navigation and landing-page data for the live API reference. */
export const publicApiReferenceSchema = z.object({
  mount: z.string(),
  commitSha: z.string(),
  info: z.custom<ApiReferenceInfo>(),
  groups: z.array(apiReferenceGroupSchema),
});
export const publicApiOperationSchema = z.object({
  route: z.string(),
  mount: z.string(),
  operation: z.custom<ApiOperationSlice>(),
});

/** Admin settings and status of the API reference on a Git connection. */
export const apiReferenceSettingsBodySchema = z
  .object({
    /** Repo-relative path of the spec file; null turns the API reference off. */
    specPath: z.string().max(500).nullable(),
    mount: z.string().max(60).optional(),
  })
  .strict();
export const apiReferenceStatusSchema = z.object({
  specPath: z.string().nullable(),
  mount: z.string(),
  live: z
    .object({
      commitSha: z.string(),
      sourcePath: z.string(),
      title: z.string(),
      version: z.string(),
      operationCount: z.number().int(),
      createdAt: z.string(),
    })
    .nullable(),
  lastFailure: z
    .object({
      commitSha: z.string(),
      sourcePath: z.string(),
      createdAt: z.string(),
    })
    .nullable(),
  diagnostics: z.array(documentationDiagnosticSchema),
});
export const apiReferencePreviewSchema = z.object({
  commitSha: z.string(),
  specPath: z.string(),
  mount: z.string(),
  publishable: z.boolean(),
  title: z.string().nullable(),
  routes: z.array(
    z.object({ route: z.string(), method: z.string(), path: z.string() }),
  ),
  diagnostics: z.array(documentationDiagnosticSchema),
});

export const DEFAULT_API_MOUNT = "api-reference";
