import { describe, expect, it, vi } from "vitest";
import { persistCustomThemes, resolveEditorTheme } from "./page-theme";

describe("resolveEditorTheme", () => {
  it("loads built-in themes without requesting a saved theme", async () => {
    const getSavedTheme = vi.fn();

    const theme = await resolveEditorTheme("learning", getSavedTheme);

    expect(theme?.id).toBe("learning");
    expect(getSavedTheme).not.toHaveBeenCalled();
  });

  it("maps a saved theme response into the page-builder shape", async () => {
    const getSavedTheme = vi.fn().mockResolvedValue({
      themeId: "thm_custom",
      name: "Custom",
      style: { colors: {} },
    });

    const theme = await resolveEditorTheme("thm_custom", getSavedTheme);

    expect(theme).toEqual({
      id: "thm_custom",
      name: "Custom",
      theme: { colors: {} },
    });
  });

  it("returns undefined when the page has no explicit theme", async () => {
    const getSavedTheme = vi.fn();

    expect(await resolveEditorTheme(null, getSavedTheme)).toBeUndefined();
    expect(getSavedTheme).not.toHaveBeenCalled();
  });
});

describe("persistCustomThemes", () => {
  it("creates a newly copied system theme once and records its server id", async () => {
    const create = vi.fn().mockResolvedValue({
      themeId: "thm_saved",
      name: "Learning - Copy",
      style: { colors: {} },
    });
    const update = vi.fn();
    const aliases = new Map<string, string>();
    const knownIds = new Set<string>();
    const snapshots = new Map<string, string>();

    await persistCustomThemes(
      [
        {
          id: "local-copy",
          name: "Learning - Copy",
          theme: { colors: {} } as any,
        },
      ],
      { aliases, knownIds, snapshots, create, update },
    );

    expect(create).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    expect(aliases.get("local-copy")).toBe("thm_saved");
    expect(knownIds.has("thm_saved")).toBe(true);
  });

  it("updates an existing saved theme only when its content changes", async () => {
    const create = vi.fn();
    const update = vi.fn().mockResolvedValue({});
    const aliases = new Map<string, string>();
    const knownIds = new Set(["thm_saved"]);
    const original = {
      id: "thm_saved",
      name: "Custom",
      theme: { colors: { light: {} } } as any,
    };
    const snapshots = new Map([
      [
        "thm_saved",
        JSON.stringify({ name: original.name, theme: original.theme }),
      ],
    ]);

    await persistCustomThemes([original], {
      aliases,
      knownIds,
      snapshots,
      create,
      update,
    });
    expect(update).not.toHaveBeenCalled();

    const changed = {
      ...original,
      theme: { colors: { light: { primary: "#2563eb" } } } as any,
    };
    await persistCustomThemes([changed], {
      aliases,
      knownIds,
      snapshots,
      create,
      update,
    });

    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith("thm_saved", {
      name: "Custom",
      style: changed.theme,
    });
  });
});
