import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { documentationGitBindings as bindings } from "../db/schema";
import { DocsGitHubApp, getDocsGitHubAppConfig } from "../documentation/github/app";
import { logger } from "../services/log";
import { siteOriginForTeam } from "../utils/site-url";
import {
  createPagesRelease,
  importPagesTree,
  pagesSourceKey,
  PagesImportError,
} from "./git-import";

const PREVIEW_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function previewSecret() {
  const secret = process.env.PREVIEW_SIGNING_SECRET || process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("PREVIEW_SIGNING_SECRET is not set");
  return secret;
}

const mac = (releaseId: string, expires: number) =>
  createHmac("sha256", previewSecret()).update(`${releaseId}.${expires}`).digest("hex");

/** `<expiry>.<hmac>`: unguessable, expiring access to one preview release. */
export function signPreview(releaseId: string, now = Date.now()) {
  const expires = now + PREVIEW_TTL_MS;
  return `${expires}.${mac(releaseId, expires)}`;
}

export function verifyPreview(
  releaseId: string,
  token: string | undefined,
  now = Date.now(),
) {
  const [expiresText, signature] = (token ?? "").split(".");
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires < now || !signature) return false;
  const expected = Buffer.from(mac(releaseId, expires));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Builds an unactivated release from a pull request's head and reports it
 * as the "FrontLit / pages preview" check, linking a signed, no-index
 * preview. Skipped when the PR doesn't touch the pages folder or site.json.
 */
export async function buildPagesPreview(
  teamId: string,
  pr: { number: number; headSha: string },
  app = new DocsGitHubApp(getDocsGitHubAppConfig()),
) {
  const binding = await db.query.documentationGitBindings.findFirst({
    where: eq(bindings.teamId, teamId),
  });
  if (!binding?.pagesDirectory || binding.status !== "connected") return null;
  const { token } = await app.installationToken(
    Number(binding.installationId),
    Number(binding.repositoryId),
    "checks",
  );
  const owner = binding.ownerLogin;
  const name = binding.repositoryName;
  const entries = await app.commitTree(token, owner, name, pr.headSha);
  if (pagesSourceKey(entries, binding.pagesDirectory) === binding.pagesSourceKey)
    return null;
  try {
    const manifest = await importPagesTree({
      teamId,
      commitSha: pr.headSha,
      directory: binding.pagesDirectory,
      entries,
      readBlob: (sha) => app.blob(token, owner, name, sha),
    });
    const release = await createPagesRelease(teamId, manifest, { preview: pr });
    const url = `${await siteOriginForTeam(teamId)}/_preview/${release.releaseId}/?token=${signPreview(release.releaseId)}`;
    const routes = manifest.pages
      .filter((page) => page.published)
      .map((page) => `- [/${page.slug}](${url.replace("/?", `/${page.slug}?`)})`);
    const warnings = manifest.diagnostics.map(
      (d) => `- ⚠️ \`${d.file}${d.fieldPath ? ` ${d.fieldPath}` : ""}\` ${d.message}`,
    );
    await app.createPagesCheckRun(token, owner, name, {
      headSha: pr.headSha,
      conclusion: "success",
      detailsUrl: url,
      title: `Preview ready: ${routes.length} page(s)`,
      summary: [
        `[Open the preview](${url}). It isn't indexed by search engines and isn't live.`,
        "",
        ...routes,
        ...(warnings.length ? ["", "Warnings:", ...warnings] : []),
      ].join("\n"),
    });
    return release;
  } catch (error) {
    if (!(error instanceof PagesImportError)) throw error;
    await app.createPagesCheckRun(token, owner, name, {
      headSha: pr.headSha,
      conclusion: "failure",
      title: `${error.diagnostics.length} problem(s) in the pages`,
      summary: [
        "Merging this pull request would not publish. Fix these and push again:",
        "",
        ...error.diagnostics.map(
          (d) =>
            `- \`${d.file ?? ""}${d.fieldPath ? ` ${d.fieldPath}` : ""}${d.line ? `:${d.line}:${d.column ?? 1}` : ""}\` ${d.message}`,
        ),
      ].join("\n"),
    });
    return null;
  }
}

/** Fire-and-forget from the webhook; the next push to the PR retries. */
export function schedulePagesPreview(
  teamId: string,
  pr: { number: number; headSha: string },
) {
  setImmediate(() => {
    buildPagesPreview(teamId, pr).catch((error) =>
      logger.warn({ err: error, teamId, pr: pr.number }, "pages preview failed"),
    );
  });
}
