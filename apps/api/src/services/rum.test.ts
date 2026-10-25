import { beforeEach, describe, expect, it } from "vitest";
import {
  allowRumBeacon,
  recordRumBeacon,
  renderRumMetrics,
  resetRumMetrics,
  rumBeaconSchema,
} from "./rum";

beforeEach(() => resetRumMetrics());

describe("RUM metrics", () => {
  it("records vitals as histograms by route and cache status", () => {
    recordRumBeacon(
      rumBeaconSchema.parse({
        metrics: [
          { name: "TTFB", value: 80 },
          { name: "LCP", value: 1200 },
          { name: "CLS", value: 0.02 },
        ],
        route: "docs",
        cache: "HIT",
      }),
    );
    const text = renderRumMetrics();
    expect(text).toContain(
      'site_web_vital_bucket{metric="TTFB",route="docs",cache="HIT",le="0.05"} 0',
    );
    expect(text).toContain(
      'site_web_vital_bucket{metric="TTFB",route="docs",cache="HIT",le="0.1"} 1',
    );
    expect(text).toContain(
      'site_web_vital_sum{metric="LCP",route="docs",cache="HIT"} 1.2',
    );
    expect(text).toContain(
      'site_web_vital_bucket{metric="CLS",route="docs",cache="HIT",le="0.05"} 1',
    );
    expect(text).toContain('site_page_loads_total{route="docs",cache="HIT"} 1');
  });

  it("keeps labels bounded: unknown route and cache values collapse", () => {
    const beacon = rumBeaconSchema.parse({
      metrics: [{ name: "TTFB", value: 10 }],
      route: "/some/customer/path",
      cache: "STALE",
    });
    expect(beacon).toMatchObject({ route: "other", cache: "unknown" });
    expect(
      rumBeaconSchema.safeParse({ metrics: [{ name: "FID", value: 1 }], route: "page" })
        .success,
    ).toBe(false);
  });

  it("limits beacons per client and minute", () => {
    for (let i = 0; i < 30; i++) expect(allowRumBeacon("1.2.3.4", 0)).toBe(true);
    expect(allowRumBeacon("1.2.3.4", 0)).toBe(false);
    expect(allowRumBeacon("5.6.7.8", 0)).toBe(true);
    expect(allowRumBeacon("1.2.3.4", 61_000)).toBe(true);
  });
});
