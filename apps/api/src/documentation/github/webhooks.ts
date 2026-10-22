import { Router, raw } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { createHash } from "node:crypto";
import { db } from "../../db/client";
import {
  documentationGitDeliveries as deliveries,
  documentationGitBindings as bindings,
  documentationGitSetups as setups,
  documentationGitProposals as proposals,
  documentationGitChecks as checks,
  documentationGitMigrations as migrations,
  documentationGitMigrationPrs as migrationPrs,
} from "../../db/schema";
import { lockSettings } from "../authoring";
import { schedulePagesPreview } from "../../pages/git-preview";
import { completeGitHubSetup } from "./setup";
import { getDocsGitHubAppConfig, GitHubDocsError, verifyGitHubSignature } from "./app";
import { canSync, enqueueGitSync, supersedeGitWork } from "./state";
import { enqueueGitPrCheck } from "./check-worker";
import { gitHubErrorResponse } from "./errors";
const id = z.number().int().positive().safe();
const repo = z.object({ id });
const payloadSchema = z.object({
  installation: z
    .object({ id, permissions: z.record(z.string()).optional() })
    .optional(),
  repository: repo.optional(),
  action: z.string().max(100).optional(),
  ref: z.string().max(1024).optional(),
  deleted: z.boolean().optional(),
  pull_request: z
    .object({
      number: id,
      merged: z.boolean(),
      base: z.object({ ref: z.string().min(1).max(255), repo }),
      head: z.object({
        ref: z.string().min(1).max(255),
        sha: z
          .string()
          .regex(/^[a-f0-9]{40}$/)
          .optional(),
        repo: repo.nullable(),
      }),
    })
    .optional(),
  check_run: z
    .object({
      id,
      name: z.string().max(200),
      head_sha: z.string().regex(/^[a-f0-9]{40}$/),
      external_id: z.string().max(200).nullable(),
      app: z.object({ id }),
    })
    .optional(),
  sender: z.object({ id }).optional(),
  repositories_removed: z.array(repo).max(1000).optional(),
  repositories_added: z.array(repo).max(1000).optional(),
});
const handledEvents = new Set([
  "push",
  "installation",
  "installation_repositories",
  "github_app_authorization",
  "pull_request",
  "check_run",
]);

export async function receiveGitHubDelivery(
  deliveryId: string,
  event: string,
  input: unknown,
) {
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(deliveryId)
  )
    throw new GitHubDocsError("GITHUB_INVALID_DELIVERY", 400);
  if (!/^[a-z_]{1,100}$/.test(event))
    throw new GitHubDocsError("GITHUB_INVALID_DELIVERY", 400);
  const payload = payloadSchema.safeParse(input);
  if (!payload.success) throw new GitHubDocsError("GITHUB_INVALID_DELIVERY", 400);
  const data = payload.data;
  if (
    (event === "push" && (!data.installation || !data.repository || !data.ref)) ||
    (["installation", "installation_repositories"].includes(event) &&
      (!data.installation || !data.action)) ||
    (event === "github_app_authorization" &&
      (!data.sender || data.action !== "revoked")) ||
    (event === "check_run" &&
      (!data.installation || !data.repository || !data.action || !data.check_run)) ||
    (event === "pull_request" &&
      (!data.installation ||
        !data.repository ||
        !data.action ||
        !data.pull_request ||
        data.pull_request.base.repo.id !== data.repository.id))
  )
    throw new GitHubDocsError("GITHUB_INVALID_DELIVERY", 400);
  const result: {
    duplicate: boolean;
    relevant: boolean;
    previews?: { teamId: string; number: number; headSha: string }[];
  } = await db.transaction(async (tx) => {
    const [receipt] = await tx
      .insert(deliveries)
      .values({
        deliveryId,
        event,
        action: data.action ?? null,
        payload: {
          ...(data.ref ? { ref: data.ref } : {}),
          ...(data.deleted !== undefined ? { deleted: data.deleted } : {}),
          ...(event === "pull_request" && data.pull_request
            ? {
                pullRequestNumber: data.pull_request.number,
                baseBranch: data.pull_request.base.ref,
                headBranch: data.pull_request.head.ref,
                merged: data.pull_request.merged,
              }
            : {}),
          ...(event === "check_run" && data.check_run
            ? {
                checkRunId: data.check_run.id,
                externalId: data.check_run.external_id,
                headSha: data.check_run.head_sha,
              }
            : {}),
          ...(event === "github_app_authorization" && data.sender
            ? { senderId: String(data.sender.id) }
            : {}),
          ...(data.repositories_removed
            ? {
                removedRepositoryIds: data.repositories_removed.map((r) =>
                  String(r.id),
                ),
              }
            : {}),
          ...(data.repositories_added
            ? { addedRepositoryIds: data.repositories_added.map((r) => String(r.id)) }
            : {}),
          ...(data.installation?.permissions?.contents
            ? {
                contentsPermission: data.installation.permissions.contents.slice(
                  0,
                  100,
                ),
              }
            : {}),
        },
        installationId: data.installation ? String(data.installation.id) : null,
        repositoryId: data.repository ? String(data.repository.id) : null,
      })
      .onConflictDoNothing()
      .returning();
    if (!receipt) {
      const prior = await tx.query.documentationGitDeliveries.findFirst({
        where: eq(deliveries.deliveryId, deliveryId),
      });
      return { duplicate: true, relevant: prior?.outcome !== "ignored" };
    }
    if (!handledEvents.has(event)) return { duplicate: false, relevant: false };
    if (event === "github_app_authorization") {
      const cleared = await tx
        .update(setups)
        .set({ status: "failed", encryptedVerifier: null, encryptedUserToken: null })
        .where(
          and(
            eq(setups.githubUserId, String(data.sender!.id)),
            inArray(setups.status, ["pending", "verifying", "authorized"]),
          ),
        )
        .returning({ setupId: setups.setupId });
      await tx
        .update(deliveries)
        .set({ outcome: cleared.length ? "processed" : "ignored" })
        .where(eq(deliveries.deliveryId, deliveryId));
      return { duplicate: false, relevant: cleared.length > 0 };
    }
    const candidates = await tx.query.documentationGitBindings.findMany({
      where: eq(bindings.installationId, String(data.installation!.id)),
    });
    let relevant = false;
    if (
      (event === "pull_request" &&
        data.pull_request!.head.repo?.id === data.repository!.id) ||
      (event === "push" && !data.deleted)
    ) {
      const plans = await tx.query.documentationGitMigrations.findMany({
        where: and(
          sql`${migrations.selection}->>'installationId' = ${String(data.installation!.id)}`,
          sql`${migrations.selection}->>'repositoryId' = ${String(data.repository!.id)}`,
        ),
      });
      for (const plan of plans.sort((a, b) => a.teamId.localeCompare(b.teamId))) {
        if (
          event === "pull_request"
            ? plan.selection.branch !== data.pull_request!.base.ref
            : data.ref !== `refs/heads/${plan.selection.branch}`
        )
          continue;
        await lockSettings(tx, plan.teamId);
        const updated = await tx
          .update(migrationPrs)
          .set({ nextAttemptAt: new Date(0) })
          .where(
            and(
              eq(migrationPrs.planId, plan.planId),
              eq(migrationPrs.status, "open"),
              event === "pull_request"
                ? eq(migrationPrs.pullRequestNumber, data.pull_request!.number)
                : undefined,
              event === "pull_request"
                ? eq(migrationPrs.branch, data.pull_request!.head.ref)
                : undefined,
            ),
          )
          .returning({ planId: migrationPrs.planId });
        relevant ||= updated.length > 0;
      }
    }
    const runIds: string[] = [];
    const previews: { teamId: string; number: number; headSha: string }[] = [];
    // Stable lock ordering for a shared installation spanning several teams.
    for (const before of candidates.sort((a, b) => a.teamId.localeCompare(b.teamId))) {
      if (["paused", "disconnected"].includes(before.status)) continue;
      if (
        event === "push" &&
        (before.repositoryId !== String(data.repository!.id) ||
          data.ref !== `refs/heads/${before.branch}`)
      )
        continue;
      if (
        event === "pull_request" &&
        (before.repositoryId !== String(data.repository!.id) ||
          before.branch !== data.pull_request!.base.ref ||
          !["opened", "synchronize", "reopened", "closed", "edited"].includes(
            data.action!,
          ))
      )
        continue;
      if (
        event === "check_run" &&
        (before.repositoryId !== String(data.repository!.id) ||
          data.action !== "rerequested" ||
          !["FrontLit / docs validation", "FrontLit / docs publication"].includes(
            data.check_run!.name,
          ) ||
          String(data.check_run!.app.id) !== getDocsGitHubAppConfig().appId)
      )
        continue;
      if (
        event === "installation_repositories" &&
        data.action === "removed" &&
        !data.repositories_removed?.some((r) => String(r.id) === before.repositoryId)
      )
        continue;
      if (
        event === "installation_repositories" &&
        data.action === "added" &&
        !data.repositories_added?.some((r) => String(r.id) === before.repositoryId)
      )
        continue;
      await lockSettings(tx, before.teamId);
      const current = await tx.query.documentationGitBindings.findFirst({
        where: eq(bindings.teamId, before.teamId),
      });
      if (!current || ["paused", "disconnected"].includes(current.status)) continue;
      // A reconnect can change the binding while this delivery waits for the lock.
      // Never apply an event selected using the previous installation/repository.
      if (
        current.installationId !== before.installationId ||
        current.repositoryId !== before.repositoryId ||
        current.generation !== before.generation
      )
        continue;
      if (event === "check_run") {
        if (current.status !== "connected" || !current.capabilities.read) continue;
        const externalId = data.check_run!.external_id;
        if (data.check_run!.name === "FrontLit / docs publication") {
          if (!externalId?.startsWith("frontlit:publication:gcheck_")) continue;
          const checkId = externalId.slice("frontlit:publication:".length);
          const prior = await tx.query.documentationGitChecks.findFirst({
            where: and(
              eq(checks.checkId, checkId),
              eq(checks.teamId, current.teamId),
              eq(checks.connectionGeneration, current.generation),
            ),
          });
          if (
            !prior?.syncRunId ||
            !prior.publicationResult ||
            prior.publicationResult.commitSha !== data.check_run!.head_sha ||
            (prior.checkRunId !== null && prior.checkRunId !== data.check_run!.id)
          )
            continue;
          await tx
            .update(checks)
            .set({
              status: "reporting",
              finishedAt: null,
              leaseToken: null,
              leaseExpiresAt: null,
              nextAttemptAt: new Date(),
            })
            .where(eq(checks.checkId, checkId));
          runIds.push(checkId);
          relevant = true;
          continue;
        }
        if (!externalId?.startsWith("frontlit:validation:gcheck_")) continue;
        const checkId = externalId.slice("frontlit:validation:".length);
        const prior = await tx.query.documentationGitChecks.findFirst({
          where: and(
            eq(checks.checkId, checkId),
            eq(checks.teamId, current.teamId),
            eq(checks.connectionGeneration, current.generation),
          ),
        });
        if (
          !prior?.result ||
          prior.pullRequestNumber === null ||
          prior.result.headSha !== data.check_run!.head_sha ||
          (prior.checkRunId !== null && prior.checkRunId !== data.check_run!.id)
        )
          continue;
        const job = await enqueueGitPrCheck(
          current.teamId,
          prior.pullRequestNumber,
          tx,
        );
        runIds.push(job.checkId);
        relevant = true;
      } else if (event === "pull_request") {
        if (current.status !== "connected" || !current.capabilities.read) continue;
        const pr = data.pull_request!;
        // Signed delivery is a scheduling hint. The review worker reads current
        // provider state; an old close delivery cannot close a reopened PR.
        const eligible = await tx
          .update(proposals)
          .set({ nextAttemptAt: new Date() })
          .where(
            and(
              eq(proposals.teamId, current.teamId),
              eq(proposals.status, "open"),
              eq(proposals.connectionGeneration, current.generation),
              eq(proposals.pullRequestNumber, pr.number),
              eq(proposals.branch, pr.head.ref),
            ),
          )
          .returning({ proposalId: proposals.proposalId });
        relevant ||= eligible.length > 0;
        // Docs PR checks only apply when docs come from this repository.
        if (
          current.docsEnabled &&
          (await lockSettings(tx, current.teamId)).source === "git"
        ) {
          const checkJob = await enqueueGitPrCheck(current.teamId, pr.number, tx);
          runIds.push(checkJob.checkId);
          relevant = true;
        }
        // Only same-repository branches: a fork's PR must not get a preview
        // served from the team's domain (or have its images uploaded).
        if (
          current.pagesDirectory &&
          pr.head.sha &&
          pr.head.repo?.id === data.repository!.id &&
          ["opened", "synchronize", "reopened"].includes(data.action!)
        ) {
          previews.push({
            teamId: current.teamId,
            number: pr.number,
            headSha: pr.head.sha,
          });
          relevant = true;
        }
        if (data.action === "closed" && pr.merged && (await canSync(tx, current))) {
          const job = await enqueueGitSync(current.teamId, { trigger: "webhook" }, tx);
          runIds.push(job.runId);
          relevant = true;
        }
      } else if (event === "push") {
        if (current.status !== "connected") continue;
        const known = await tx
          .selectDistinct({ number: checks.pullRequestNumber })
          .from(checks)
          .where(
            and(
              eq(checks.teamId, current.teamId),
              eq(checks.connectionGeneration, current.generation),
            ),
          )
          .limit(1001);
        const open = await tx.query.documentationGitProposals.findMany({
          where: and(
            eq(proposals.teamId, current.teamId),
            eq(proposals.connectionGeneration, current.generation),
            eq(proposals.status, "open"),
          ),
          limit: 1001,
        });
        const numbers = new Set([
          ...known.flatMap((row) => (row.number === null ? [] : [row.number])),
          ...open.flatMap((row) =>
            row.pullRequestNumber === null ? [] : [row.pullRequestNumber],
          ),
        ]);
        if (numbers.size > 1000)
          throw new GitHubDocsError("GITHUB_RECONCILIATION_LIMIT", 409);
        if (current.docsEnabled)
          for (const number of numbers) {
            const checkJob = await enqueueGitPrCheck(current.teamId, number, tx);
            runIds.push(checkJob.checkId);
          }
        if (await canSync(tx, current)) {
          const job = await enqueueGitSync(current.teamId, { trigger: "webhook" }, tx);
          runIds.push(job.runId);
        }
        if (data.deleted)
          await tx
            .update(bindings)
            .set({ lastDiagnostic: "GITHUB_BRANCH_UNAVAILABLE" })
            .where(eq(bindings.teamId, current.teamId));
        relevant = true;
      } else {
        const lost =
          (event === "installation" && ["deleted", "suspend"].includes(data.action!)) ||
          (event === "installation_repositories" && data.action === "removed");
        const restored =
          (event === "installation" &&
            ["unsuspend", "new_permissions_accepted", "created"].includes(
              data.action!,
            )) ||
          (event === "installation_repositories" && data.action === "added");
        if (lost && current.status === "connected") {
          await supersedeGitWork(tx, current.teamId);
          await tx
            .update(bindings)
            .set({
              status: "access_lost",
              generation: current.generation + 1,
              lastDiagnostic: "GITHUB_ACCESS_LOST",
              updatedAt: new Date(),
            })
            .where(eq(bindings.teamId, current.teamId));
          relevant = true;
        } else if (
          restored &&
          current.status === "access_lost" &&
          current.capabilities.read &&
          (!data.installation!.permissions ||
            ["read", "write"].includes(data.installation!.permissions.contents))
        ) {
          await tx
            .update(bindings)
            .set({
              status: "connected",
              generation: current.generation + 1,
              lastDiagnostic: null,
              updatedAt: new Date(),
            })
            .where(eq(bindings.teamId, current.teamId));
          if (await canSync(tx, current)) {
            const job = await enqueueGitSync(
              current.teamId,
              { trigger: "webhook" },
              tx,
            );
            runIds.push(job.runId);
          }
          relevant = true;
        }
      }
    }
    await tx
      .update(deliveries)
      .set({
        outcome: runIds.length ? "queued" : relevant ? "processed" : "ignored",
        runIds,
      })
      .where(eq(deliveries.deliveryId, deliveryId));
    return { duplicate: false, relevant, previews };
  });
  // After commit: preview builds read GitHub and can take a while.
  for (const preview of result.previews ?? [])
    schedulePagesPreview(preview.teamId, preview);
  return { duplicate: result.duplicate, relevant: result.relevant };
}

/** Infrastructure router is mounted before global JSON parsing. */
const router = Router();
router.get(
  ["/integrations/github/callback", "/integrations/github/docs/callback"],
  async (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    res.set("X-Robots-Tag", "noindex");
    try {
      const config = getDocsGitHubAppConfig();
      const state = typeof req.query.state === "string" ? req.query.state : "";
      // Installation-triggered authorization has no FrontLit state/PKCE proof.
      // Return to the authenticated dashboard to start that proof; never trust
      // the installation ID or exchange an unbound code to select a workspace.
      if (
        req.query.state === undefined &&
        typeof req.query.installation_id === "string" &&
        /^[1-9][0-9]*$/.test(req.query.installation_id) &&
        ["install", "update", "request"].includes(String(req.query.setup_action))
      ) {
        const url = new URL("/settings/integrations?tab=github", config.webOrigin);
        url.searchParams.set("githubInstallationReturned", "1");
        res.redirect(303, url.toString());
        return;
      }
      if (req.query.error && /^[A-Za-z0-9_-]{43}$/.test(state)) {
        await db
          .update(setups)
          .set({ status: "failed", encryptedVerifier: null, encryptedUserToken: null })
          .where(
            and(
              eq(setups.stateHash, createHash("sha256").update(state).digest("hex")),
              eq(setups.status, "pending"),
            ),
          );
        const url = new URL("/settings/integrations?tab=github", config.webOrigin);
        url.searchParams.set("githubError", "GITHUB_AUTHORIZATION_DENIED");
        res.redirect(303, url.toString());
        return;
      }
      const result = await completeGitHubSetup(
        state,
        typeof req.query.code === "string" ? req.query.code : "",
        config,
      );
      const url = new URL(result.returnPath, config.webOrigin);
      url.searchParams.set("githubSetup", result.setupId);
      res.redirect(303, url.toString());
    } catch (error) {
      const result = gitHubErrorResponse(error);
      if (result) {
        res.status(result.status).json(result.body);
        return;
      }
      next(error);
    }
  },
);
router.post(
  ["/integrations/github/webhook", "/integrations/github/docs/webhook"],
  raw({ type: "*/*", limit: "2mb" }),
  async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const secret = getDocsGitHubAppConfig().webhookSecret;
      const signature =
        typeof req.headers["x-hub-signature-256"] === "string"
          ? req.headers["x-hub-signature-256"]
          : undefined;
      if (
        !Buffer.isBuffer(req.body) ||
        !verifyGitHubSignature(req.body, signature, secret)
      ) {
        res.status(401).json({ error: "Invalid webhook signature." });
        return;
      }
      const event = req.header("x-github-event") ?? "";
      let payload: unknown;
      try {
        payload = JSON.parse(req.body.toString("utf8"));
      } catch {
        res.status(400).json({ error: "Malformed webhook payload." });
        return;
      }
      const result = await receiveGitHubDelivery(
        req.header("x-github-delivery") ?? "",
        event,
        payload,
      );
      res.status(result.relevant ? 202 : 204).end();
    } catch (error) {
      if (error instanceof GitHubDocsError && error.status === 400) {
        res.status(400).json({ error: "Malformed webhook payload." });
        return;
      }
      // Never acknowledge durable admission on a database/configuration failure.
      res.status(503).json({ error: "Webhook admission is temporarily unavailable." });
    }
  },
);
router.use(
  ["/integrations/github/webhook", "/integrations/github/docs/webhook"],
  (error: any, _req: any, res: any, next: any) => {
    if (error?.type === "entity.too.large") {
      res.status(413).json({ error: "Webhook payload exceeds 2 MiB." });
      return;
    }
    next(error);
  },
);
export default router;
