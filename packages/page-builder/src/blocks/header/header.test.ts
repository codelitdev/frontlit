import { describe, expect, it } from "vitest";
import { headerDefaults } from "./defaults";
import { roundedMap } from "../../components/image";
import type { HeaderSettings } from "./settings";

describe("header block logoCorners settings", () => {
  it("defaults logoCorners to 2", () => {
    expect(headerDefaults.logoCorners).toBe(2);
  });

  it("maps 0 to rounded-none (square)", () => {
    expect(roundedMap[0]).toBe("rounded-none");
  });

  it("maps 8 to rounded-full", () => {
    expect(roundedMap[8]).toBe("rounded-full");
  });

  it("maps 1 through 7 to progressive rounded steps", () => {
    expect(roundedMap[1]).toBe("rounded-sm");
    expect(roundedMap[2]).toBe("rounded");
    expect(roundedMap[3]).toBe("rounded-md");
    expect(roundedMap[4]).toBe("rounded-lg");
    expect(roundedMap[5]).toBe("rounded-xl");
    expect(roundedMap[6]).toBe("rounded-2xl");
    expect(roundedMap[7]).toBe("rounded-3xl");
  });

  it("allows setting logoCorners from 0 to 8 in HeaderSettings", () => {
    const settings: HeaderSettings = {
      logoText: "FrontLit",
      logoImage: "https://example.com/logo.png",
      logoCorners: 0,
    };
    expect(settings.logoCorners).toBe(0);

    const fullRounded: HeaderSettings = {
      ...settings,
      logoCorners: 8,
    };
    expect(fullRounded.logoCorners).toBe(8);
  });

  it("provides designEditor on Header definition for the Design tab", async () => {
    const { Header } = await import("./index");
    expect(Header.designEditor).toBeDefined();
  });
});
