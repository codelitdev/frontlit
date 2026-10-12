/**
 * Minimal in-process Prometheus counter registry (architecture.md §13.6) —
 * no client library dependency, since the metric set is small and fixed:
 * rate-limit hits, CAPTCHA failures, webhook signature failures. Queue
 * depth/age are computed live from the database instead (see
 * `email/outbox.ts`'s `getOutboxQueueStats`), not counted here.
 *
 * Counts reset on process restart — acceptable for a scrape-based exporter
 * (Prometheus itself tracks rate-of-increase across restarts via the
 * counter reset it detects from a value that drops to zero).
 */
type Labels = Record<string, string>;

const counters = new Map<string, Map<string, number>>();

function labelKey(labels: Labels): string {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}="${labels[k]}"`).join(",");
}

export function incrementCounter(name: string, labels: Labels = {}): void {
  if (!counters.has(name)) counters.set(name, new Map());
  const byLabels = counters.get(name)!;
  const key = labelKey(labels);
  byLabels.set(key, (byLabels.get(key) ?? 0) + 1);
}

/** Renders every registered counter in Prometheus text exposition format. */
export function renderCounters(): string {
  const lines: string[] = [];
  for (const [name, byLabels] of counters) {
    lines.push(`# TYPE ${name} counter`);
    for (const [key, value] of byLabels) {
      lines.push(key ? `${name}{${key}} ${value}` : `${name} ${value}`);
    }
  }
  return lines.join("\n");
}

/** Test-only: clears all counters between test files/cases. */
export function resetCounters(): void {
  counters.clear();
}
