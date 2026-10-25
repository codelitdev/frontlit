import { z } from "zod";
import {
  makeCreateDocumentBodySchema,
  makeDocumentSchema,
  makeUpdateDocumentBodySchema,
  textEditorContentSchema,
} from "./documents";

export const documentationMetaSchema = z.object({
  sectionId: z.string().nullable().optional(),
  order: z.number().default(0),
  /** When false, the published page stays live but is not chunked for
   * search or the chatbot. Defaults to true when omitted. */
  indexable: z.boolean().optional(),
  frontmatter: z.record(z.unknown()).optional(),
});

export const documentationIndexSchema = z.object({
  state: z.enum(["pending", "indexed", "failed", "excluded"]),
  lastError: z.string().nullable().optional(),
});
export type DocumentationIndex = z.infer<typeof documentationIndexSchema>;

export const documentationSchema = makeDocumentSchema(documentationMetaSchema).extend({
  index: documentationIndexSchema.nullable().optional(),
  draftVersion: z.number().int(),
  draftSlug: z.string().nullable(),
  draftMarkdown: z.string().nullable(),
  draftHash: z.string().nullable(),
  draftGitSource: z
    .object({
      sourcePath: z.string(),
      base: z
        .object({
          commitSha: z.string(),
          sourcePath: z.string(),
          sourceHash: z.string(),
        })
        .nullable(),
    })
    .nullable()
    .optional(),
  source: z.enum(["editor", "git"]).optional(),
  saved: z.boolean().optional(),
  publishable: z.boolean().optional(),
  diagnostics: z.array(z.any()).optional(),
  validatedAgainstPublicationId: z.string().nullable().optional(),
});
/** DM-VALIDATE: preserve content fields until the headless validator can reject them. */
export const documentationContentInputSchema = textEditorContentSchema.passthrough();
export const documentationDiagnosticSchema = z.object({
  code: z.string(),
  severity: z.enum(["error", "warning"]),
  blocksSave: z.boolean(),
  blocksPublish: z.boolean(),
  message: z.string(),
  fieldPath: z.string().optional(),
  documentId: z.string().optional(),
  file: z.string().optional(),
  line: z.number().int().optional(),
  column: z.number().int().optional(),
  route: z.string().optional(),
  relatedFiles: z.array(z.string()).optional(),
});
export const documentationValidationErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
  diagnostics: z.array(documentationDiagnosticSchema),
  currentDraftVersion: z.number().int().optional(),
  retryAfter: z.number().int().positive().optional(),
});
export const createDocumentationBodySchema = makeCreateDocumentBodySchema(
  documentationMetaSchema.strict(),
)
  .extend({
    title: z.string().trim().min(1),
    slug: z.string().max(512).optional(),
    content: documentationContentInputSchema.optional(),
    markdown: z.string().optional(),
    gitSourcePath: z.string().min(1).max(1024).optional(),
  })
  .strict();
export const updateDocumentationBodySchema = makeUpdateDocumentBodySchema(
  documentationMetaSchema.partial().strict(),
)
  .extend({
    slug: z.string().max(512).optional(),
    expectedDraftVersion: z.number().int().positive(),
    title: z.string().optional(),
    excerpt: z.string().nullable().optional(),
    content: documentationContentInputSchema.optional(),
    markdown: z.string().optional(),
    gitSourcePath: z.string().min(1).max(1024).optional(),
  })
  .strict();

export const documentationSectionSchema = z.object({
  sectionId: z.string(),
  name: z.string(),
  slug: z.string(),
  order: z.number(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

export const createDocumentationSectionBodySchema = z.object({
  expectedDocsDraftVersion: z.number().int().positive(),
  name: z.string().min(1),
  order: z.number().optional(),
});

export const updateDocumentationSectionBodySchema = z.object({
  expectedDocsDraftVersion: z.number().int().positive(),
  name: z.string().optional(),
  order: z.number().optional(),
});

export const searchDocumentationQuerySchema = z.object({
  q: z.string().min(1),
  k: z.coerce.number().int().min(1).max(20).optional(),
});

export const documentationSearchResultSchema = z.object({
  documentId: z.string(),
  slug: z.string(),
  title: z.string().nullable(),
  heading: z.string().nullable(),
  anchor: z.string().nullable(),
  content: z.string(),
  similarity: z.number(),
  kind: z.enum(["blog", "doc", "changelog", "api-operation"]).optional(),
});

export const documentationVersionBodySchema = z
  .object({ expectedDraftVersion: z.number().int().positive() })
  .strict();
export const documentationPublishBodySchema = documentationVersionBodySchema
  .extend({
    expectedDocsDraftVersion: z.number().int().positive(),
    expectedPublicationId: z.string().nullable(),
  })
  .strict();
export const documentationValidationBodySchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("document"),
      documentId: z.string().optional(),
      draft: updateDocumentationBodySchema.omit({ expectedDraftVersion: true }),
    })
    .strict(),
  z
    .object({
      mode: z.literal("publication"),
      selected: z.array(
        z
          .object({
            documentId: z.string(),
            expectedDraftVersion: z.number().int().positive(),
          })
          .strict(),
      ),
      removals: z.array(z.string()).default([]),
      includeSectionChanges: z.boolean().default(true),
    })
    .strict(),
]);
export const documentationValidationReportSchema = z.object({
  saved: z.boolean(),
  publishable: z.boolean(),
  diagnostics: z.array(documentationDiagnosticSchema),
  validatedAgainstPublicationId: z.string().nullable(),
});
export const documentationSettingsSchema = z.object({
  navigationPending: z.boolean().optional(),
  publishedNavigation: z
    .array(
      z.object({
        sectionId: z.string(),
        name: z.string(),
        slug: z.string(),
        order: z.number(),
      }),
    )
    .optional(),
  source: z.enum(["editor", "git"]),
  draftVersion: z.number().int(),
  activePublicationId: z.string().nullable(),
  indexing: z.object({
    enabled: z.boolean(),
    mode: z.enum(["lexical", "semantic"]).optional(),
  }),
  policyEpoch: z.number().int(),
  requestedGeneration: z.number().int(),
  purgeGeneration: z.number().int(),
});
export const updateDocumentationSettingsBodySchema = z
  .object({
    expectedDocsDraftVersion: z.number().int().positive(),
    indexing: z
      .object({
        enabled: z.boolean(),
        mode: z.enum(["lexical", "semantic"]).optional(),
      })
      .strict(),
  })
  .strict();

// D3 commands capture immutable input; retries reuse the same idempotency key.
export const queueDocumentationPublicationSchema = z
  .object({
    selected: z
      .array(
        z
          .object({
            documentId: z.string(),
            expectedDraftVersion: z.number().int().positive(),
          })
          .strict(),
      )
      .max(1000),
    removals: z.array(z.string()).max(1000).default([]),
    includeSectionChanges: z.boolean().default(true),
    expectedPublicationId: z.string().nullable(),
    expectedDocsDraftVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict();
export const documentationPublicationSchema = z.object({
  publicationId: z.string(),
  basePublicationId: z.string().nullable(),
  source: z.enum(["editor", "git"]),
  generation: z.number(),
  docsDraftVersion: z.number(),
  status: z.enum([
    "queued",
    "preparing",
    "prepared",
    "active",
    "archived",
    "failed",
    "superseded",
  ]),
  diagnostics: z.array(documentationDiagnosticSchema),
  attempts: z.number(),
  createdAt: z.string(),
  activatedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export const preflightDocumentationPurgeSchema = z
  .object({ documentIds: z.array(z.string()).min(1).max(1000) })
  .strict();
export const commitDocumentationPurgeSchema = z
  .object({
    planId: z.string(),
    planHash: z.string(),
    acknowledgment: z.literal("irreversible-deletion"),
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict();
export const documentationPurgeSchema = z.object({
  purgeId: z.string(),
  planHash: z.string(),
  manifest: z.record(z.unknown()),
  status: z.enum(["preflight", "completed"]),
  expiresAt: z.string(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
  /** When every cache (site and, if configured, edge) dropped the purged
   * content. Null while delivery is pending. */
  deliveredAt: z.string().nullable(),
});
export const documentationLiveIdentitySchema = z.object({
  publicationId: z.string().nullable(),
  policyEpoch: z.number().int(),
});
export const documentationExpectedIdentitySchema = z.object({
  expectedPublicationId: z.string().optional(),
  expectedPolicyEpoch: z.coerce.number().int().nonnegative().optional(),
});

export const documentationHistoryQuerySchema = z
  .object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    state: documentationPublicationSchema.shape.status.optional(),
  })
  .strict();
export const documentationHistorySchema = z.object({
  items: z.array(documentationPublicationSchema),
  nextCursor: z.string().nullable(),
});
export const documentationPreviewSchema = z.object({
  documentId: z.string(),
  draftVersion: z.number(),
  title: z.string(),
  slug: z.string(),
  content: textEditorContentSchema,
  excerpt: z.string().nullable(),
  markdown: z.string().nullable(),
  navigation: z.array(
    z.object({ sectionId: z.string(), name: z.string(), slug: z.string() }),
  ),
  shell: z.object({
    siteName: z.string(),
    themeId: z.string().nullable(),
    themeStyle: z.record(z.unknown()).nullable(),
  }),
  unpublished: z.literal(true),
  publishable: z.boolean(),
  diagnostics: z.array(documentationDiagnosticSchema),
});
export const documentationRevisionSchema = z.object({
  revisionId: z.string(),
  documentId: z.string(),
  publicationId: z.string(),
  revisionHash: z.string(),
  title: z.string(),
  slug: z.string(),
  excerpt: z.string().nullable(),
  featuredImage: z.record(z.unknown()).nullable(),
  meta: documentationMetaSchema,
  content: textEditorContentSchema,
  markdown: z.string(),
  createdAt: z.string(),
});
export const documentationRevisionReceiptSchema = documentationRevisionSchema.omit({
  content: true,
  markdown: true,
});
export const unpublishDocumentationBodySchema = z
  .object({
    expectedPublicationId: z.string().nullable(),
    expectedDocsDraftVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict();
export const retryDocumentationPublicationBodySchema = z
  .object({ idempotencyKey: z.string().min(1).max(200) })
  .strict();

export const documentationImprovementQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  state: z.enum(["open", "dismissed", "draft_created", "published"]).optional(),
});
const approvedDocumentationSummarySchema = z.object({
  version: z.number().int(),
  title: z.string(),
  description: z.string(),
  correction: z.string(),
  actorAccountId: z.string(),
  approvedAt: z.string(),
  noCustomerDetails: z.literal(true),
});
export const documentationImprovementSchema = z.object({
  itemId: z.string(),
  version: z.number().int(),
  state: z.enum(["open", "dismissed", "draft_created", "published"]),
  approved: approvedDocumentationSummarySchema.nullable(),
  reason: z.string().optional(),
  targetDocumentId: z.string().nullable().optional(),
  predecessorId: z.string().nullable().optional(),
  mergedIntoId: z.string().nullable().optional(),
  draftDocumentId: z.string().nullable().optional(),
  draftVersion: z.number().nullable().optional(),
  revisionId: z.string().nullable().optional(),
  publicationId: z.string().nullable().optional(),
  evidenceCount: z.number().int().optional(),
  evidence: z
    .array(
      z.object({
        evidenceId: z.string(),
        trigger: z.string(),
        ticketId: z.string(),
        messageId: z.string(),
        question: z.string(),
        retrieved: z.array(
          z.object({
            documentId: z.string(),
            revisionId: z.string().optional(),
            publicationId: z.string().nullable().optional(),
            anchor: z.string().nullable().optional(),
          }),
        ),
        createdAt: z.string(),
      }),
    )
    .optional(),
});
export const documentationImprovementsSchema = z.object({
  items: z.array(documentationImprovementSchema),
  nextCursor: z.string().nullable(),
});
export const reviewDocumentationImprovementSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("dismiss"),
      expectedVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      action: z.literal("reopen"),
      expectedVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      action: z.literal("merge"),
      expectedVersion: z.number().int().positive(),
      targetItemId: z.string(),
      expectedTargetVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      action: z.literal("approve-summary"),
      expectedVersion: z.number().int().positive(),
      title: z.string().trim().min(1).max(200),
      description: z.string().trim().min(1).max(1000),
      correction: z.string().trim().min(1).max(16000),
      noCustomerDetails: z.literal(true),
    })
    .strict(),
]);
export const createDocumentationImprovementDraftSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    approvedSummaryVersion: z.number().int().positive(),
    targetDocumentId: z.string().optional(),
    expectedDraftVersion: z.number().int().positive().optional(),
    idempotencyKey: z.string().min(1).max(128),
  })
  .strict()
  .refine((v) => !v.targetDocumentId || !!v.expectedDraftVersion, {
    message: "An existing target requires its draft version.",
  });
export const documentationImprovementDraftSchema = z.object({
  itemId: z.string(),
  documentId: z.string(),
  draftVersion: z.number().int(),
});
