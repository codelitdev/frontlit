import { DocsContentError } from "@frontlit/text-editor/docs";
import {
  documentationErrorBody,
  documentationErrorStatus,
} from "../content-validation";
import { GitHubDocsError } from "./app";
const messages: Record<string, string> = {
  PAGES_ALREADY_SYNCED: "Pages already sync from this repository.",
  GITHUB_NOTHING_TO_SYNC:
    "Choose docs, landing pages or both to sync from the repository.",
  PAGES_DIRECTORY_EXISTS:
    "That folder already exists on the branch. Choose a new folder, or preview and sync the existing one.",
  NOTHING_TO_PROPOSE:
    "The draft matches the repository already, so there's nothing to put in a pull request.",
  PAGE_UPSTREAM_CHANGED:
    "This page changed in GitHub since FrontLit last synced it. Sync the repository, redo your edit and try again.",
  PROPOSAL_NOT_OPEN:
    "That pull request is no longer open, so it can't be updated. Create a new pull request instead.",
  PROPOSAL_ALREADY_OPEN:
    "One of these documents is already in an open pull request. Merge or close that pull request first, then submit again.",
  GITHUB_CHECK_NOT_FOUND: "This documentation check is unavailable.",
  GITHUB_PROPOSAL_NOT_FOUND: "This documentation proposal is unavailable.",
  GITHUB_PROPOSAL_RECOVERY_CONFLICT:
    "The remote pull request does not uniquely match this proposal and repository. Review it before retrying.",
  GITHUB_WRITE_REJECTED:
    "GitHub rejected the write. Refresh the branch and review repository rules before retrying; no force update was attempted.",
  UPSTREAM_CHANGED:
    "The publishing branch changed. Refresh the source and review the captured draft before retrying.",
  GITHUB_SUPERSEDED:
    "The source, grant or worker lease changed. This operation can no longer write to GitHub.",
  GITHUB_PROPOSAL_UNAVAILABLE:
    "A captured document is unavailable or restricted. Review its current status before submitting again.",
  GITHUB_UPGRADE_REQUIRED:
    "Start a fresh GitHub permission review before changing this workspace's write delegation.",
  GITHUB_GRANT_STALE:
    "The source or delegated grant changed during review. Refresh it and review again.",
  GITHUB_WRITE_PERMISSION_REQUIRED:
    "Approve the documentation App's Contents and Checks write permissions, plus Pull requests write for PR mode, then retry the workspace permission review.",
  GITHUB_SETUP_LIMIT:
    "Ten setup or adoption plans are outstanding. Cancel an unused adoption plan or wait for authorization expiry before starting another.",
  MIGRATION_STALE:
    "Documentation changed after export. Create a new adoption plan to preserve the latest editor work.",
  MIGRATION_EXPIRED:
    "This adoption plan is canceled, expired, or no longer available. Create a new plan.",
  MIGRATION_HEAD_CHANGED:
    "The selected branch changed after verification. Verify the committed export again before adopting.",
  MIGRATION_ALREADY_ACTIVATED: "This adoption plan has already been activated.",
  GITHUB_SETUP_PR_REQUIRED:
    "Create the reviewed setup PR in FrontLit before verifying adoption.",
  GITHUB_REPOSITORY_INITIALIZATION_CONSENT_REQUIRED:
    "Review and acknowledge placeholder-only initialization for this empty repository before creating the setup PR.",
  GITHUB_REPOSITORY_INITIALIZATION_CONFLICT:
    "Select the default branch for an empty repository. A nonempty repository cannot be initialized; review its existing branches instead.",
  GITHUB_SETUP_PR_NOT_MERGED:
    "Review and merge the setup PR in GitHub, then verify the merged setup here.",
  GITHUB_WRITE_IN_PROGRESS:
    "Setup PR creation is still running. Wait for the current attempt before renewing its authorization.",
  PUBLICATION_PENDING:
    "Wait for pending documentation publication work before creating or activating the adoption plan.",
  SOURCE_MIGRATION_REQUIRED:
    "Existing documentation requires reviewed adoption. Create a Git migration plan.",
  SOURCE_REQUIRES_GIT:
    "Connect or resume the GitHub documentation source before submitting or syncing.",
  GITHUB_APP_NOT_CONFIGURED: "The documentation GitHub App has not been configured.",
  GITHUB_SETUP_EXPIRED:
    "Restart GitHub setup. This setup has expired or is no longer usable.",
  GITHUB_REPOSITORY_ADMIN_REQUIRED:
    "A repository administrator must approve this workspace's documentation access.",
  GITHUB_OWNER_CHANGED:
    "The repository owner changed. Fresh administrator approval is required.",
  GITHUB_ACCESS_LOST:
    "GitHub installation or repository access is unavailable. Reauthorize the source.",
  GITHUB_USER_AUTH_REQUIRED:
    "This action requires the original authorized workspace account. Final connection requires its browser session and manage/publish permissions.",
  GITHUB_RATE_LIMITED:
    "GitHub's rate limit was reached. Retry after the provider reset window.",
  GITHUB_REFERENCE_UNAVAILABLE:
    "The selected repository or branch is unavailable. Check its name and access.",
  STALE_DOCS_DRAFT: "Documentation changed after review. Run preflight again.",
  GITHUB_PREFLIGHT_EXPIRED:
    "The reviewed preflight is unavailable or expired. Run preflight again.",
};
export function gitHubErrorResponse(error: unknown) {
  if (error instanceof DocsContentError)
    return {
      status: documentationErrorStatus(error),
      body: documentationErrorBody(error),
    };
  if (!(error instanceof GitHubDocsError)) return null;
  const status = ["GITHUB_PROPOSAL_NOT_FOUND", "GITHUB_CHECK_NOT_FOUND"].includes(
    error.code,
  )
    ? 404
    : error.code === "GITHUB_RATE_LIMITED"
      ? 429
      : error.code === "GITHUB_APP_NOT_CONFIGURED" ||
          error.code === "GITHUB_UNAVAILABLE"
        ? 503
        : error.status === 400 ||
            error.status === 403 ||
            error.status === 409 ||
            error.status === 429
          ? error.status
          : 409;
  return {
    status,
    body: {
      error: messages[error.code] ?? "GitHub documentation operation did not succeed.",
      code: error.code,
      ...(error.retryAt ? { retryAt: error.retryAt.toISOString() } : {}),
    },
  };
}
