/** Lets a request that just queued work start the documentation worker
 * now instead of on its next poll, so a publish goes live in well under
 * a second. A no-op until the worker has started. */
let wake: (() => void) | null = null;

export function onDocumentationWorkerWake(handler: (() => void) | null) {
  wake = handler;
}

export function wakeDocumentationWorker() {
  wake?.();
}
