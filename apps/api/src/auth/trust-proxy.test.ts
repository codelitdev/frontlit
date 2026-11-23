import { describe, expect, it } from "vitest";
import { trustProxySetting } from "./trust-proxy";

describe("trustProxySetting", () => {
  it("keeps the ENABLE_TRUST_PROXY behaviour when TRUST_PROXY is unset", () => {
    expect(trustProxySetting({})).toBe(false);
    expect(trustProxySetting({ ENABLE_TRUST_PROXY: "false" })).toBe(false);
    expect(trustProxySetting({ ENABLE_TRUST_PROXY: "true" })).toBe(1);
    expect(trustProxySetting({ ENABLE_TRUST_PROXY: "true", TRUST_PROXY: " " })).toBe(1);
  });

  it("lets TRUST_PROXY win and accepts hops, booleans and subnets", () => {
    expect(trustProxySetting({ ENABLE_TRUST_PROXY: "true", TRUST_PROXY: "2" })).toBe(2);
    expect(trustProxySetting({ TRUST_PROXY: "false" })).toBe(false);
    expect(trustProxySetting({ TRUST_PROXY: "true" })).toBe(true);
    expect(trustProxySetting({ TRUST_PROXY: "10.0.0.0/8, loopback" })).toBe(
      "10.0.0.0/8, loopback",
    );
  });
});
