"use client";

import { useEffect, useRef } from "react";
import { useReportWebVitals } from "next/web-vitals";

type Metric = { name: string; value: number };

const REPORTED = new Set(["TTFB", "FCP", "LCP", "CLS", "INP"]);

/** Route kind only, never the URL: metrics stay anonymous and bounded. */
function routeKind(pathname: string) {
  const first = pathname.split("/")[1] ?? "";
  return ["docs", "blog", "changelog"].includes(first) ? first : "page";
}

/** The edge cache's verdict for this page load, when the edge tells us
 * through `Server-Timing` (deploy/edge-cache adds `edge;desc=HIT`). */
function cacheStatus() {
  const [navigation] = performance.getEntriesByType(
    "navigation",
  ) as PerformanceNavigationTiming[];
  const entry = navigation?.serverTiming?.find(
    (timing) => timing.name === "edge" || timing.name === "cfCacheStatus",
  );
  const value = entry?.description?.toUpperCase();
  return value === "HIT" || value === "MISS" ? value : "unknown";
}

/**
 * Real-user Web Vitals (docs/site-delivery.md §9). Collects the page's
 * Core Web Vitals and sends them in one beacon when the page is hidden.
 * No cookies, no identifiers, no URL.
 */
export function WebVitalsBeacon({ endpoint }: { endpoint: string }) {
  const pending = useRef<Metric[]>([]);

  useReportWebVitals((metric) => {
    if (!REPORTED.has(metric.name)) return;
    pending.current = [
      ...pending.current.filter((item) => item.name !== metric.name),
      { name: metric.name, value: metric.value },
    ];
  });

  useEffect(() => {
    const flush = () => {
      if (!pending.current.length) return;
      const body = JSON.stringify({
        metrics: pending.current,
        route: routeKind(location.pathname),
        cache: cacheStatus(),
      });
      pending.current = [];
      // text/plain keeps this a simple request: no CORS preflight.
      navigator.sendBeacon?.(endpoint, new Blob([body], { type: "text/plain" }));
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", flush);
    };
  }, [endpoint]);

  return null;
}
