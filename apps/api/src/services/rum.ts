import { z } from "zod";

/**
 * Real-user monitoring for the public sites (docs/site-delivery.md §9):
 * Core Web Vitals from visitors' browsers, kept as Prometheus histograms
 * next to the API's other metrics (`/metrics`). Per route kind and edge
 * cache status, never per team or URL, so the series stay bounded.
 */
const METRICS = ["TTFB", "FCP", "LCP", "CLS", "INP"] as const;
const ROUTES = ["page", "docs", "blog", "changelog", "other"] as const;
const CACHE = ["HIT", "MISS", "unknown"] as const;

// Seconds for timings, unitless for CLS. Edges bracket the targets
// (TTFB 0.1 s, LCP 1.5 s / 2.5 s, INP 0.2 s, CLS 0.1).
const BUCKETS: Record<(typeof METRICS)[number], number[]> = {
  TTFB: [0.025, 0.05, 0.1, 0.2, 0.4, 0.8, 1.6, 3.2],
  FCP: [0.5, 1, 1.5, 2, 2.5, 3, 4, 6],
  LCP: [0.5, 1, 1.5, 2, 2.5, 3, 4, 6],
  INP: [0.05, 0.1, 0.2, 0.3, 0.5, 1],
  CLS: [0.01, 0.05, 0.1, 0.15, 0.25, 0.5],
};

export const rumBeaconSchema = z
  .object({
    metrics: z
      .array(
        z.object({
          name: z.enum(METRICS),
          // Milliseconds for timings (web-vitals' unit), unitless for CLS.
          value: z.number().finite().nonnegative().max(600_000),
        }),
      )
      .min(1)
      .max(10),
    route: z.enum(ROUTES).catch("other"),
    cache: z.enum(CACHE).catch("unknown"),
  })
  .strip();

type Series = { buckets: number[]; sum: number; count: number };
const histograms = new Map<string, Series>();
const loads = new Map<string, number>();

function key(...parts: string[]) {
  return parts.join("\u0000");
}

export function recordRumBeacon(beacon: z.infer<typeof rumBeaconSchema>): void {
  for (const { name, value } of beacon.metrics) {
    const observed = name === "CLS" ? value : value / 1000;
    const id = key(name, beacon.route, beacon.cache);
    const series = histograms.get(id) ?? {
      buckets: BUCKETS[name].map(() => 0),
      sum: 0,
      count: 0,
    };
    BUCKETS[name].forEach((edge, index) => {
      if (observed <= edge) series.buckets[index]! += 1;
    });
    series.sum += observed;
    series.count += 1;
    histograms.set(id, series);
    // One TTFB per page load: count loads by cache status for hit ratio.
    if (name === "TTFB") {
      const loadKey = key(beacon.route, beacon.cache);
      loads.set(loadKey, (loads.get(loadKey) ?? 0) + 1);
    }
  }
}

export function renderRumMetrics(): string {
  const lines: string[] = [];
  if (histograms.size) {
    lines.push(
      "# HELP site_web_vital Core Web Vitals from public-site visitors (seconds; CLS unitless)",
      "# TYPE site_web_vital histogram",
    );
  }
  for (const [id, series] of histograms) {
    const [name, route, cache] = id.split("\u0000") as [
      keyof typeof BUCKETS,
      string,
      string,
    ];
    const labels = `metric="${name}",route="${route}",cache="${cache}"`;
    BUCKETS[name].forEach((edge, index) => {
      lines.push(
        `site_web_vital_bucket{${labels},le="${edge}"} ${series.buckets[index]}`,
      );
    });
    lines.push(`site_web_vital_bucket{${labels},le="+Inf"} ${series.count}`);
    lines.push(`site_web_vital_sum{${labels}} ${series.sum}`);
    lines.push(`site_web_vital_count{${labels}} ${series.count}`);
  }
  if (loads.size) {
    lines.push(
      "# HELP site_page_loads_total Public-site page loads by edge cache status",
      "# TYPE site_page_loads_total counter",
    );
  }
  for (const [id, count] of loads) {
    const [route, cache] = id.split("\u0000");
    lines.push(`site_page_loads_total{route="${route}",cache="${cache}"} ${count}`);
  }
  return lines.join("\n");
}

/** Beacons per client and minute; a page load sends one or two. */
const LIMIT = 30;
const windows = new Map<string, { start: number; count: number }>();

export function allowRumBeacon(client: string, now = Date.now()): boolean {
  const window = windows.get(client);
  if (!window || now - window.start > 60_000) {
    if (windows.size > 50_000) windows.clear();
    windows.set(client, { start: now, count: 1 });
    return true;
  }
  window.count += 1;
  return window.count <= LIMIT;
}

/** Test-only. */
export function resetRumMetrics(): void {
  histograms.clear();
  loads.clear();
  windows.clear();
}
