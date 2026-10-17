import { z } from "zod";
import { documentationDiagnosticSchema } from "./documentation";

export const documentationGitErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
  diagnostics: z.array(documentationDiagnosticSchema).optional(),
  retryAt: z.string().optional(),
  retryAfter: z.number().int().positive().optional(),
});
export const documentationGitSetupBodySchema = z
  .object({
    purpose: z.enum(["connect", "reconnect", "upgrade"]).default("connect"),
    returnPath: z
      .enum(["/content?type=documentation", "/settings/integrations?tab=github"])
      .default("/settings/integrations?tab=github"),
  })
  .strict();
export const documentationGitSetupSchema = z.object({
  setupId: z.string(),
  authorizationUrl: z.string().url(),
  expiresAt: z.string(),
});
export const documentationGitCapabilitiesBodySchema = z
  .object({
    setupId: z.string().min(1).max(100),
    expectedConnectionGeneration: z.number().int().positive(),
    expectedGrantVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(1).max(100),
    consent: z
      .object({
        delegatePullRequests: z.boolean(),
        delegateDirectCommits: z.boolean(),
      })
      .strict(),
  })
  .strict();
export const documentationGitGrantSchema = z.object({
  grantId: z.string(),
  grantVersion: z.number().int(),
  connectionGeneration: z.number().int(),
  capabilities: z.object({
    read: z.boolean(),
    proposals: z.boolean(),
    directCommit: z.boolean(),
  }),
  grantedAt: z.string(),
});
const proposalDocumentSchema = z
  .object({
    documentId: z.string().min(1),
    expectedDraftVersion: z.number().int().positive(),
  })
  .strict();
export const documentationGitProposalBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    mode: z.enum(["pull_request", "direct"]).default("pull_request"),
    selected: z
      .array(
        proposalDocumentSchema
          .extend({ published: z.boolean().default(true) })
          .strict(),
      )
      .max(1000),
    removals: z.array(proposalDocumentSchema).max(1000).default([]),
    /** Append a commit to this proposal's open pull request instead of opening another. */
    updatesProposalId: z.string().min(1).max(100).optional(),
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict()
  .refine(
    (input) =>
      input.selected.length + input.removals.length > 0 &&
      input.selected.length + input.removals.length <= 1000,
    { message: "Select between one and one thousand documents." },
  );
export const documentationGitProposalSchema = z.object({
  proposalId: z.string(),
  mode: z.enum(["pull_request", "direct"]),
  title: z.string(),
  status: z.enum([
    "queued",
    "validating",
    "prepared",
    "writing",
    "open",
    "updated",
    "merged",
    "published",
    "closed",
    "failed",
    "conflict",
    "canceled",
  ]),
  baseSha: z.string().nullable(),
  commitSha: z.string().nullable(),
  mergedCommitSha: z.string().nullable(),
  branch: z.string().nullable(),
  pullRequestNumber: z.number().int().positive().nullable(),
  pullRequestUrl: z.string().url().nullable(),
  diagnostics: z.array(
    z.object({ code: z.string(), message: z.string().optional() }).passthrough(),
  ),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  captured: z.array(
    z.object({
      documentId: z.string(),
      draftVersion: z.number().int().positive(),
      sourcePath: z.string().nullable(),
      targetPath: z.string().nullable(),
    }),
  ),
});
export const documentationGitRepositoriesQuerySchema = z
  .object({
    installationId: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();
export const documentationGitProposalListQuerySchema = z
  .object({
    cursor: z.string().min(1).max(100).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const documentationGitProposalListSchema = z.object({
  items: z.array(documentationGitProposalSchema),
  nextCursor: z.string().nullable(),
});
export const documentationGitRepositoriesSchema = z.object({
  installations: z.array(
    z.object({
      installationId: z.number().int().positive(),
      accountLogin: z.string().min(1),
      accountType: z.enum(["User", "Organization"]),
    }),
  ),
  installationId: z.number().int().positive().optional(),
  repositories: z.array(
    z.object({
      repositoryId: z.number().int().positive(),
      ownerId: z.number().int().positive(),
      owner: z.string(),
      name: z.string(),
      fullName: z.string(),
      private: z.boolean(),
      defaultBranch: z.string(),
    }),
  ),
  nextPage: z.number().int().positive().nullable(),
  installUrl: z.string().url().nullable(),
});
export const documentationGitSelectionSchema = z
  .object({
    setupId: z.string().min(1).max(100),
    installationId: z.number().int().positive().safe(),
    repositoryId: z.number().int().positive().safe(),
    branch: z.string().min(1).max(255),
    directory: z.string().min(1).max(512),
    /** false connects the repository for pages only (docs stay in FrontLit). */
    docsEnabled: z.boolean().optional(),
  })
  .strict();
export const documentationGitPreflightSchema = z.union([
  z.object({
    preflightId: z.null(),
    commitSha: z.string(),
    publishable: z.literal(false),
    diagnostics: z.array(documentationDiagnosticSchema),
  }),
  z.object({
    preflightId: z.string(),
    setupId: z.string(),
    commitSha: z.string(),
    docsDraftVersion: z.number().int(),
    manifestHash: z.string(),
    expiresAt: z.string(),
    repositoryId: z.string(),
    repositoryPrivate: z.boolean(),
    branch: z.string(),
    directory: z.string(),
    fileCount: z.number().int(),
    publishedCount: z.number().int(),
    excludedFiles: z.array(z.string()),
    sections: z.array(
      z.object({ folder: z.string(), name: z.string(), order: z.number().int() }),
    ),
    routes: z.array(z.object({ path: z.string(), route: z.string() })),
    publishedDefaultsToTrue: z.literal(true),
    selectedDocsWillBePublic: z.literal(true),
    publishable: z.literal(true),
    diagnostics: z.array(documentationDiagnosticSchema),
  }),
]);
export const documentationGitConnectBodySchema = z
  .object({
    preflightId: z.string().min(1).max(100),
    commitSha: z.string().regex(/^[a-f0-9]{40}$/),
    manifestHash: z.string().regex(/^[a-f0-9]{64}$/),
    expectedDocsDraftVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(1).max(200),
    consent: z
      .object({
        publishSelectedDocsPublicly: z.literal(true),
        automaticallyPublishFuturePushes: z.literal(true),
        delegateToWorkspacePublishers: z.literal(true),
      })
      .strict(),
  })
  .strict();
export const documentationGitSourceSchema = z.object({
  configured: z.boolean(),
  pendingMigrationId: z.string().nullable().optional(),
  source: z.enum(["editor", "git"]),
  status: z.enum([
    "unconfigured",
    "pending_setup",
    "connected",
    "paused",
    "access_lost",
    "disconnected",
  ]),
  binding: z
    .object({
      repositoryId: z.string(),
      owner: z.string(),
      repository: z.string(),
      private: z.boolean(),
      branch: z.string(),
      directory: z.string(),
      generation: z.number().int(),
      grantVersion: z.number().int(),
      capabilities: z.object({
        read: z.boolean(),
        proposals: z.boolean(),
        directCommit: z.boolean(),
      }),
      observedSha: z.string().nullable(),
      validatedSha: z.string().nullable(),
      liveSha: z.string().nullable(),
      lastSuccessfulSyncAt: z.string().nullable(),
      lastDiagnostic: z.string().nullable(),
      nextPrReconcileAt: z.string(),
      lastPrReconcileError: z.string().nullable(),
      /** Whether this repo feeds docs (`directory`). */
      docsEnabled: z.boolean(),
      /** Pages folder (`frontlit/pages`); null while pages are builder-owned. */
      pagesDirectory: z.string().nullable(),
      /** Errors (or warnings) from the last pages import. */
      pagesDiagnostics: z.array(documentationDiagnosticSchema).nullable(),
    })
    .nullable(),
  sync: z
    .object({
      runId: z.string(),
      status: z.string(),
      publicationId: z.string().nullable(),
      commitSha: z.string().nullable(),
      diagnostic: z.string().nullable(),
      diagnostics: z.array(documentationDiagnosticSchema),
      nextAttemptAt: z.string(),
    })
    .nullable(),
});
export const documentationGitSyncSchema = z.object({
  runId: z.string(),
  status: z.string(),
  connectionGeneration: z.number().int(),
  requestGeneration: z.number().int(),
});

export const documentationGitMigrationPlanBodySchema = documentationGitSelectionSchema
  .extend({
    expectedDocsDraftVersion: z.number().int().positive(),
    expectedPublicationId: z.string().nullable(),
  })
  .strict();
export const documentationGitMigrationQuerySchema = z
  .object({
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();
export const documentationGitMigrationPrBodySchema = z
  .object({
    setupId: z.string().min(1).max(100),
    planHash: z.string().regex(/^[a-f0-9]{64}$/),
    expectedDocsDraftVersion: z.number().int().positive(),
    expectedPublicationId: z.string().nullable(),
    acknowledgeExport: z.literal(true),
    initializeEmptyRepository: z.boolean().default(false),
    idempotencyKey: z.string().trim().min(1).max(200),
  })
  .strict();
export const documentationGitMigrationPrSchema = z.object({
  planId: z.string(),
  status: z.enum([
    "queued",
    "writing",
    "open",
    "merged",
    "closed",
    "failed",
    "canceled",
  ]),
  branch: z.string(),
  commitSha: z.string().nullable(),
  bootstrapSha: z.string().nullable(),
  pullRequestNumber: z.number().int().positive().nullable(),
  pullRequestUrl: z.string().url().nullable(),
  mergedCommitSha: z.string().nullable(),
  diagnostic: z.string().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
});
export const documentationGitMigrationSchema = z.object({
  planId: z.string(),
  status: z.enum(["planned", "verified", "activated", "canceled", "expired"]),
  setupId: z.string(),
  selection: documentationGitSelectionSchema.omit({ setupId: true }),
  docsDraftVersion: z.number().int(),
  activePublicationId: z.string().nullable(),
  planHash: z.string(),
  verifiedSha: z.string().nullable(),
  expiresAt: z.string(),
  sections: z.array(
    z
      .object({
        sectionId: z.string(),
        name: z.string(),
        slug: z.string(),
        order: z.number().int(),
      })
      .passthrough(),
  ),
  total: z.number().int(),
  files: z
    .array(
      z.object({
        path: z.string(),
        documentId: z.string().nullable(),
        draftVersion: z.number().int().nullable(),
        markdown: z.string(),
        hash: z.string(),
      }),
    )
    .max(50),
  nextOffset: z.number().int().nullable(),
  pullRequest: documentationGitMigrationPrSchema.nullable().default(null),
  requiresManualCommit: z.literal(false),
  repositoryPrivate: z.boolean().nullable(),
  repositoryName: z.string().nullable(),
  unpublishedDraftCount: z.number().int().nonnegative(),
  initializeEmptyRepositoryRequired: z.boolean(),
  diagnostics: z.array(documentationDiagnosticSchema),
});
export const documentationGitMigrationVerifyBodySchema = z
  .object({ setupId: z.string().min(1).max(100).optional() })
  .strict();
export const documentationGitMigrationVerificationSchema = z.object({
  planId: z.string(),
  commitSha: z.string(),
  planHash: z.string(),
  verified: z.boolean(),
  diagnostics: z.array(documentationDiagnosticSchema),
});
export const documentationGitMigrationActivateBodySchema =
  documentationGitConnectBodySchema
    .omit({ preflightId: true, manifestHash: true })
    .extend({
      planHash: z.string().regex(/^[a-f0-9]{64}$/),
      expectedPublicationId: z.string().nullable(),
      setupId: z.string().min(1).max(100).optional(),
    })
    .strict();
export const documentationGitMigrationCancellationSchema = z.object({
  planId: z.string(),
  status: z.literal("canceled"),
});

export const documentationGitCheckSchema = z.object({
  checkId: z.string(),
  kind: z.enum(["validation", "publication"]),
  pullRequestNumber: z.number().int().positive().nullable(),
  syncRunId: z.string().nullable(),
  publicationResult: z
    .object({
      commitSha: z.string(),
      publicationId: z.string().nullable(),
      outcome: z.enum(["published", "failed", "superseded"]),
      publishedCount: z.number().int().nonnegative(),
      diagnostics: z.array(documentationDiagnosticSchema),
      redacted: z.boolean(),
    })
    .nullable(),
  status: z.enum(["queued", "validating", "reporting", "delivered", "superseded"]),
  checkRunId: z.number().int().positive().nullable(),
  lastError: z.string().nullable(),
  errorPhase: z.enum(["validation", "delivery"]).nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  result: z
    .object({
      headSha: z.string(),
      baseSha: z.string(),
      mergeSha: z.string().nullable(),
      outcome: z.enum(["valid", "invalid", "incomplete"]),
      fileCount: z.number().int().nonnegative(),
      publishedCount: z.number().int().nonnegative(),
      diagnostics: z.array(documentationDiagnosticSchema),
      redacted: z.boolean(),
    })
    .nullable(),
});
export const documentationGitCheckListQuerySchema =
  documentationGitProposalListQuerySchema;
export const documentationGitCheckListSchema = z.object({
  items: z.array(documentationGitCheckSchema),
  nextCursor: z.string().nullable(),
});

export const gitPagesPreviewBodySchema = z.object({
  directory: z.string().min(1).max(200),
});

/** Dry run of a pages folder at the branch head: what would go live. */
export const gitPagesPreviewSchema = z.object({
  commitSha: z.string(),
  directory: z.string(),
  siteFile: z.string(),
  hasSiteFile: z.boolean(),
  publishable: z.boolean(),
  pages: z.array(
    z.object({
      path: z.string(),
      route: z.string(),
      title: z.string().nullable(),
      published: z.boolean(),
    }),
  ),
  /** Live builder pages with no file in the folder; they go offline. */
  removedPages: z.array(z.object({ name: z.string(), route: z.string() })),
  diagnostics: z.array(documentationDiagnosticSchema),
});

export const gitPagesEnableBodySchema = z.object({
  directory: z.string().min(1).max(200),
  /** The previewed commit; enabling fails if the branch moved. */
  commitSha: z.string(),
});
