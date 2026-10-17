/** Runs `callback` when the browser is idle (or after `timeout` ms). Returns a canceller. */
export function runWhenIdle(callback: () => void, timeout: number): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(callback, Math.min(timeout, 1000));
  return () => window.clearTimeout(handle);
}
