import { beforeEach, describe, expect, it } from "vitest";
import { incrementCounter, renderCounters, resetCounters } from "./metrics";

describe("metrics registry", () => {
    beforeEach(() => resetCounters());

    it("renders nothing when no counters have been touched", () => {
        expect(renderCounters()).toBe("");
    });

    it("counts increments per unique label set", () => {
        incrementCounter("rate_limit_hits_total", { route: "leads" });
        incrementCounter("rate_limit_hits_total", { route: "leads" });
        incrementCounter("rate_limit_hits_total", { route: "tickets" });

        const output = renderCounters();
        expect(output).toContain('rate_limit_hits_total{route="leads"} 2');
        expect(output).toContain('rate_limit_hits_total{route="tickets"} 1');
    });

    it("renders a label-less counter without braces", () => {
        incrementCounter("captcha_failures_total");
        incrementCounter("captcha_failures_total");
        expect(renderCounters()).toContain("captcha_failures_total 2");
    });

    it("emits a TYPE line per metric name", () => {
        incrementCounter("webhook_signature_failures_total");
        expect(renderCounters()).toContain("# TYPE webhook_signature_failures_total counter");
    });
});
