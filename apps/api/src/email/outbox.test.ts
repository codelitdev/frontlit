import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, truncateAll, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { db as testDb } from "../db/client";
import { outboxJobs } from "../db/schema";
import {
  claimNextOutboxJob,
  enqueueOutboxJob,
  getOutboxQueueStats,
  markOutboxJobDone,
  markOutboxJobFailed,
  provisionRetryForeverEnabled,
  requeueFailedProvisionJobs,
  requeueTeamProvisionJob,
} from "./outbox";

describe("email outbox lifecycle", () => {
  const db = testDb as unknown as TestDb;
  let teamId: string;

  beforeEach(async () => {
    await truncateAll(db);
    const seeded = await seedTeam(db);
    teamId = seeded.team.id;
  });

  it("enqueues, claims, and marks jobs done", async () => {
    const job = await enqueueOutboxJob(teamId, "contact_sync", {
      email: "lead@example.com",
      sourcePath: "/blog",
    });
    expect(job.status).toBe("pending");
    expect(job.type).toBe("contact_sync");
    expect(job.payload).toEqual({
      email: "lead@example.com",
      sourcePath: "/blog",
    });

    const claimed = await claimNextOutboxJob();
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe("processing");
    // A second claim must not re-take a processing job.
    expect(await claimNextOutboxJob()).toBeNull();

    await markOutboxJobDone(job.id);
    const done = await db.query.outboxJobs.findFirst({
      where: eq(outboxJobs.id, job.id),
    });
    expect(done?.status).toBe("done");
    expect(await claimNextOutboxJob()).toBeNull();
  });

  it("retries with backoff then permanently fails after max attempts", async () => {
    const job = await enqueueOutboxJob(teamId, "contact_sync", {
      email: "retry@example.com",
    });

    const claimed = await claimNextOutboxJob();
    expect(claimed?.id).toBe(job.id);

    await markOutboxJobFailed(job.id, 0, "SendLit down");
    const retried = await db.query.outboxJobs.findFirst({
      where: eq(outboxJobs.id, job.id),
    });
    expect(retried?.status).toBe("pending");
    expect(retried?.attempts).toBe(1);
    expect(retried?.lastError).toBe("SendLit down");
    expect(retried!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    // Make the job claimable again immediately.
    await db
      .update(outboxJobs)
      .set({ nextAttemptAt: new Date(Date.now() - 1000) })
      .where(eq(outboxJobs.id, job.id));

    const reclaimed = await claimNextOutboxJob();
    expect(reclaimed?.id).toBe(job.id);

    // Force permanent failure: attempts + 1 >= 8 when attempts is 7.
    await markOutboxJobFailed(job.id, 7, "still down");
    const failed = await db.query.outboxJobs.findFirst({
      where: eq(outboxJobs.id, job.id),
    });
    expect(failed?.status).toBe("failed");
    expect(failed?.attempts).toBe(8);
  });

  it("never permanently fails SendLit provision jobs", async () => {
    const job = await enqueueOutboxJob(teamId, "provision_sendlit", {
      ownerEmail: "owner@example.com",
    });
    await markOutboxJobFailed(job.id, 7, "unauthorized", {
      retryForever: true,
    });
    const retried = await db.query.outboxJobs.findFirst({
      where: eq(outboxJobs.id, job.id),
    });
    expect(retried?.status).toBe("pending");
    expect(retried?.attempts).toBe(8);
  });

  it("requeues exhausted provision jobs so a fixed org key can recover", async () => {
    const job = await enqueueOutboxJob(teamId, "provision_sendlit", {
      ownerEmail: "owner@example.com",
    });
    await markOutboxJobFailed(job.id, 7, "unauthorized");
    const failed = await db.query.outboxJobs.findFirst({
      where: eq(outboxJobs.id, job.id),
    });
    expect(failed?.status).toBe("failed");

    expect(await requeueFailedProvisionJobs()).toBe(1);
    const pending = await db.query.outboxJobs.findFirst({
      where: eq(outboxJobs.id, job.id),
    });
    expect(pending?.status).toBe("pending");
    expect(pending?.attempts).toBe(0);
    expect(pending!.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(await requeueFailedProvisionJobs()).toBe(0);
  });

  it("treats SENDLIT_PROVISION_RETRY_FOREVER as on unless set false", () => {
    const previous = process.env.SENDLIT_PROVISION_RETRY_FOREVER;
    delete process.env.SENDLIT_PROVISION_RETRY_FOREVER;
    expect(provisionRetryForeverEnabled()).toBe(true);
    process.env.SENDLIT_PROVISION_RETRY_FOREVER = "false";
    expect(provisionRetryForeverEnabled()).toBe(false);
    process.env.SENDLIT_PROVISION_RETRY_FOREVER = "true";
    expect(provisionRetryForeverEnabled()).toBe(true);
    if (previous === undefined) delete process.env.SENDLIT_PROVISION_RETRY_FOREVER;
    else process.env.SENDLIT_PROVISION_RETRY_FOREVER = previous;
  });

  it("requeues a team's unfinished provision job for a manual retry", async () => {
    const job = await enqueueOutboxJob(teamId, "provision_sendlit", {
      ownerEmail: "old@example.com",
    });
    await markOutboxJobFailed(job.id, 7, "unauthorized");
    const reset = await requeueTeamProvisionJob(teamId, {
      ownerEmail: "owner@example.com",
    });
    expect(reset.id).toBe(job.id);
    const pending = await db.query.outboxJobs.findFirst({
      where: eq(outboxJobs.id, job.id),
    });
    expect(pending?.status).toBe("pending");
    expect(pending?.attempts).toBe(0);
    expect(pending?.payload).toEqual({ ownerEmail: "owner@example.com" });
  });

  it("reports pending queue stats for metrics", async () => {
    expect(await getOutboxQueueStats()).toEqual({
      pendingCount: 0,
      oldestPendingAgeSeconds: null,
    });

    await enqueueOutboxJob(teamId, "provision_sendlit", {
      ownerEmail: "owner@example.com",
    });
    const stats = await getOutboxQueueStats();
    expect(stats.pendingCount).toBe(1);
    expect(stats.oldestPendingAgeSeconds).toEqual(expect.any(Number));
    expect(stats.oldestPendingAgeSeconds!).toBeGreaterThanOrEqual(0);
  });
});
