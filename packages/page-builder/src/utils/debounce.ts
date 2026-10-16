export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  wait: number,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let pending: Args | null = null;

  const debounced = function (...args: Args) {
    pending = args;
    clearTimeout(timeout);
    timeout = setTimeout(debounced.flush, wait);
  };

  /** Runs the call that is still waiting, if any, right away. */
  debounced.flush = () => {
    clearTimeout(timeout);
    if (!pending) return;
    const args = pending;
    pending = null;
    fn(...args);
  };

  return debounced;
}
