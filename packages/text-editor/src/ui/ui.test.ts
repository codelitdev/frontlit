import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defineProfile } from "../core/profile";
import { audio, callout, embed, file, image, pdf, video } from "../core/library";
import {
  EMBED_MAX_HEIGHT,
  EMBED_MIN_HEIGHT,
  EMBED_SANDBOX,
} from "../core/library/embed";
import { EmbedFrame, embedHeightFromMessage } from "./embed-frame";
import { ContentRenderer } from "./renderer";
import { filterInsertItems, getInsertItems } from "./insert-items";
import { collectBlockUi } from "./editor-extensions";
import { TextRenderer } from "../text-renderer";

const lesson = defineProfile({
  base: { exclude: ["table"], headings: { levels: [2, 3] } },
  blocks: [
    image({ media: true, hosts: ["images.unsplash.com"] }),
    video(),
    audio(),
    pdf(),
    file(),
    embed(),
    callout(),
  ],
});
const render = (json: unknown, props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    React.createElement(ContentRenderer, {
      profile: lesson,
      json: json as never,
      ...props,
    }),
  );
const doc = (...content: unknown[]) => ({ type: "doc", content });

describe("embed sandbox", () => {
  it("renders author code only in a srcdoc frame without allow-same-origin", () => {
    const html = renderToStaticMarkup(
      React.createElement(EmbedFrame, {
        code: "<script>parent.document.cookie</script>",
        title: "Form",
      }),
    );
    expect(EMBED_SANDBOX).toBe("allow-scripts allow-popups allow-forms");
    expect(html).toContain(`sandbox="${EMBED_SANDBOX}"`);
    expect(html).not.toContain("allow-same-origin");
    expect(html).toContain('srcDoc="&lt;script&gt;');
    expect(html).not.toMatch(/<script/);
    expect(render(doc({ type: "embed", attrs: { code: "<b>x</b>" } }))).toContain(
      `sandbox="${EMBED_SANDBOX}"`,
    );
  });

  it("only resizes for finite numbers from its own frame, capped", () => {
    const frame = {} as Window;
    const other = {} as Window;
    expect(
      embedHeightFromMessage({ source: other, data: { height: 500 } }, frame),
    ).toBeNull();
    expect(
      embedHeightFromMessage({ source: frame, data: { height: 500 } }, null),
    ).toBeNull();
    expect(
      embedHeightFromMessage({ source: frame, data: { height: 500 } }, frame),
    ).toBe(500);
    expect(embedHeightFromMessage({ source: frame, data: 320.2 }, frame)).toBe(321);
    expect(
      embedHeightFromMessage({ source: frame, data: { height: 1e9 } }, frame),
    ).toBe(EMBED_MAX_HEIGHT);
    expect(embedHeightFromMessage({ source: frame, data: { height: -5 } }, frame)).toBe(
      EMBED_MIN_HEIGHT,
    );
    for (const data of [
      { height: Number.NaN },
      { height: Number.POSITIVE_INFINITY },
      { height: "500" },
      "500",
      null,
    ])
      expect(embedHeightFromMessage({ source: frame, data }, frame)).toBeNull();
  });
});

describe("renderer", () => {
  const resolveMedia = (id: string) =>
    id === "med_pdf"
      ? { url: "https://cdn.example.com/a.pdf", name: "a.pdf" }
      : `https://cdn.example.com/${id}`;

  it("renders hosted videos from a fixed provider URL, never author input", () => {
    const html = render(
      doc({
        type: "video",
        attrs: { provider: "youtube", videoId: "dQw4w9WgXcQ", caption: "Hi" },
      }),
    );
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(html).toContain("<figcaption");
    const vimeo = render(
      doc({ type: "video", attrs: { provider: "vimeo", videoId: "1" } }),
    );
    expect(vimeo).toContain('src="https://player.vimeo.com/video/1"');
  });

  it("resolves media IDs through the host and skips empty or unresolved blocks", () => {
    const html = render(
      doc(
        { type: "image", attrs: { media: "med_img", alt: "A" } },
        { type: "video", attrs: { media: "med_vid" } },
        { type: "audio", attrs: { media: "med_aud" } },
        { type: "pdf", attrs: { media: "med_pdf", title: "Workbook" } },
        { type: "file", attrs: { media: "med_file", label: "Worksheet" } },
        { type: "audio", attrs: { media: null } },
      ),
      { resolveMedia },
    );
    expect(html).toContain('src="https://cdn.example.com/med_img"');
    expect(html).toContain(
      '<video class="te-video__file" src="https://cdn.example.com/med_vid"',
    );
    expect(html).toContain(
      '<audio class="te-audio" src="https://cdn.example.com/med_aud"',
    );
    expect(html).toContain('data="https://cdn.example.com/a.pdf"');
    expect(html).toContain('href="https://cdn.example.com/med_file"');
    expect(html).toContain("Worksheet");
    expect(render(doc({ type: "audio", attrs: { media: "x" } }))).not.toContain(
      "<audio",
    );
  });

  it("uses host components per block", () => {
    const Learner = ({ attrs }: { attrs: Record<string, unknown> }) =>
      React.createElement("section", { "data-host": attrs.type }, "host");
    const html = render(
      doc({
        type: "callout",
        attrs: { type: "tip" },
        content: [{ type: "paragraph" }],
      }),
      {
        blocks: { callout: Learner },
      },
    );
    expect(html).toContain('<section data-host="tip">host</section>');
    // The root TextRenderer takes a profile object and host blocks too.
    expect(
      renderToStaticMarkup(
        React.createElement(TextRenderer, {
          profile: lesson,
          json: doc({
            type: "callout",
            attrs: { type: "tip" },
            content: [{ type: "paragraph" }],
          }) as never,
          blocks: { callout: Learner },
        }),
      ),
    ).toContain("data-host");
  });

  it("never renders unsafe link schemes and adds rel to links", () => {
    const link = (href: string) =>
      doc({
        type: "paragraph",
        content: [
          { type: "text", text: "x", marks: [{ type: "link", attrs: { href } }] },
        ],
      });
    expect(render(link("javascript:alert(1)"))).not.toContain("<a");
    expect(render(link("https://example.com"))).toContain('rel="noopener noreferrer"');
  });

  it("uses real heading levels with unique anchors for new profiles", () => {
    const html = render(
      doc(
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Same" }],
        },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Same" }],
        },
      ),
    );
    expect(html).toContain('<h3 id="same">');
    expect(html).toContain('<h3 id="same-2">');
  });
});

describe("insert items", () => {
  const ui = collectBlockUi(lesson);
  it("offers base nodes and blocks the profile holds; greys out unavailable ones", () => {
    const items = getInsertItems(lesson, {
      ui,
      unavailable: { embed: "Upgrade to add embeds" },
    });
    const names = items.map((item) => item.name);
    expect(names).not.toContain("table");
    expect(
      items.filter((item) => item.name === "heading").map((item) => item.label),
    ).toEqual(["Heading 2", "Heading 3"]);
    expect(names).toEqual(
      expect.arrayContaining([
        "image",
        "video",
        "audio",
        "pdf",
        "file",
        "embed",
        "callout",
      ]),
    );
    expect(items.find((item) => item.name === "embed")?.unavailable).toBe(
      "Upgrade to add embeds",
    );
    expect(items.find((item) => item.name === "video")?.unavailable).toBeUndefined();
  });

  it("filters as you type by label and keywords", () => {
    const items = getInsertItems(lesson, { ui });
    expect(filterInsertItems(items, "you").map((item) => item.name)).toEqual(["video"]);
    expect(filterInsertItems(items, "head 3").map((item) => item.label)).toEqual([
      "Heading 3",
    ]);
    expect(filterInsertItems(items, "").length).toBe(items.length);
  });

  it("honours the profile menu", () => {
    const narrow = defineProfile({
      blocks: [embed(), callout()],
      options: { menu: ["callout"] },
    });
    const names = getInsertItems(narrow, { ui: collectBlockUi(narrow) }).map(
      (item) => item.name,
    );
    expect(names).toContain("callout");
    expect(names).not.toContain("embed");
  });

  it("creates valid empty blocks", async () => {
    const { validateContent } = await import("../core/validate");
    for (const name of ["video", "audio", "pdf", "file", "embed", "callout"]) {
      const created = ui.get(name)!.insert.create();
      expect(validateContent(lesson, doc(created)).diagnostics, name).toEqual([]);
    }
  });
});

describe("slash menu", () => {
  const items = getInsertItems(lesson, { ui: collectBlockUi(lesson) });
  it("filters across words and steps aside for prose after a slash", async () => {
    const { isProseAfterSlash } = await import("./slash-command");
    expect(isProseAfterSlash(items, "heading 2")).toBe(false);
    expect(isProseAfterSlash(items, "heading ")).toBe(false);
    expect(isProseAfterSlash(items, "vid")).toBe(false);
    // One unmatched word keeps the menu open ("No matching blocks").
    expect(isProseAfterSlash(items, "xyz")).toBe(false);
    expect(isProseAfterSlash(items, "then continue")).toBe(true);
    expect(isProseAfterSlash(items, " see below")).toBe(true);
    // Substring matching keeps short words alive: "or" is in "ordered".
    expect(isProseAfterSlash(items, " or")).toBe(false);
  });
});

describe("drag handle moves", () => {
  it("moves a top-level block in one undoable step and refuses no-op moves", async () => {
    const { EditorState } = await import("@tiptap/pm/state");
    const { moveBlock } = await import("./drag-handle");
    const { getProfileSchema } = await import("../core/extensions");
    const schema = getProfileSchema(lesson);
    const p = (text: string) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    });
    const state = EditorState.create({
      doc: schema.nodeFromJSON(
        doc(p("A"), { type: "video", attrs: { media: "m1" } }, p("C")),
      ),
    });
    const texts = (s: InstanceType<typeof EditorState>) => {
      const out: string[] = [];
      s.doc.forEach((node) =>
        out.push(node.type.name === "video" ? "video" : node.textContent),
      );
      return out;
    };
    // Positions: A at 0 (size 3), video at 3 (size 1), C at 4.
    const down = moveBlock(state, 0, state.doc.content.size);
    expect(texts(state.apply(down!))).toEqual(["video", "C", "A"]);
    const up = moveBlock(state, 3, 0);
    expect(texts(state.apply(up!))).toEqual(["video", "A", "C"]);
    expect(moveBlock(state, 0, 0)).toBeNull();
    expect(moveBlock(state, 0, 3)).toBeNull();
  });
});

describe("keyboard block moves", () => {
  it("moves the block at the cursor one place and keeps the cursor in it", async () => {
    const { EditorState, TextSelection } = await import("@tiptap/pm/state");
    const { moveBlockBy } = await import("./drag-handle");
    const { getProfileSchema } = await import("../core/extensions");
    const schema = getProfileSchema(lesson);
    const p = (text: string) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    });
    const base = EditorState.create({
      doc: schema.nodeFromJSON(doc(p("Alpha"), p("Beta"), p("Gamma"))),
    });
    const texts = (s: InstanceType<typeof EditorState>) => {
      const out: string[] = [];
      s.doc.forEach((node) => out.push(node.textContent));
      return out;
    };
    // Cursor after "Be" in Beta (Alpha is 0..7, Beta starts at 7; text at 8).
    const state = base.apply(base.tr.setSelection(TextSelection.create(base.doc, 10)));
    const up = state.apply(moveBlockBy(state, -1)!);
    expect(texts(up)).toEqual(["Beta", "Alpha", "Gamma"]);
    expect(up.selection.$from.parent.textContent).toBe("Beta");
    expect(up.selection.$from.parentOffset).toBe(2);
    const down = state.apply(moveBlockBy(state, 1)!);
    expect(texts(down)).toEqual(["Alpha", "Gamma", "Beta"]);
    expect(down.selection.$from.parentOffset).toBe(2);
    // Nothing above the first block or below the last one.
    expect(moveBlockBy(up, -1)).toBeNull();
    expect(moveBlockBy(down, 1)).toBeNull();
  });
});

describe("/ menu keys", () => {
  it("maps the common list keys and skips unavailable entries", async () => {
    const { menuKeyStep, nextMenuIndex } = await import("./slash-command");
    const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
      menuKeyStep({
        key: k,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        ...mods,
      });
    expect(key("ArrowDown")).toBe(1);
    expect(key("ArrowUp")).toBe(-1);
    expect(key("Tab")).toBe(1);
    expect(key("Tab", { shiftKey: true })).toBe(-1);
    expect(key("n", { ctrlKey: true })).toBe(1);
    expect(key("p", { ctrlKey: true })).toBe(-1);
    expect(key("Home")).toBe("first");
    expect(key("End")).toBe("last");
    expect(key("PageDown")).toBe(5);
    expect(key("a")).toBeNull();
    expect(key("ArrowDown", { metaKey: true })).toBeNull();

    const items = [{}, { unavailable: "Upgrade" }, {}, {}, {}, {}, {}, {}];
    expect(nextMenuIndex(items, 0, 1)).toBe(2); // skips the unavailable one
    expect(nextMenuIndex(items, 2, -1)).toBe(0);
    expect(nextMenuIndex(items, 0, -1)).toBe(7); // arrows wrap
    expect(nextMenuIndex(items, 7, 1)).toBe(0);
    expect(nextMenuIndex(items, 0, 5)).toBe(6); // pages stop at the ends
    expect(nextMenuIndex(items, 6, 5)).toBe(7);
    expect(nextMenuIndex(items, 3, "first")).toBe(0);
    expect(nextMenuIndex(items, 3, "last")).toBe(7);
    expect(nextMenuIndex([{ unavailable: "x" }, {}], -1, "first")).toBe(1);
  });
});

describe("/ menu sections", () => {
  it("groups entries by section in first-seen order, with descriptions", () => {
    const mixed = defineProfile({ blocks: [callout(), video(), embed(), image()] });
    const items = getInsertItems(mixed, { ui: collectBlockUi(mixed) });
    const groups = [...new Set(items.map((item) => item.group))];
    expect(groups).toEqual(["Text", "Layout", "Media"]);
    // Each section is contiguous.
    const order = items.map((item) => item.group);
    expect(order).toEqual(
      [...order].sort((a, b) => groups.indexOf(a) - groups.indexOf(b)),
    );
    expect(items.find((item) => item.name === "video")?.description).toMatch(/video/i);
    expect(items.every((item) => item.description)).toBe(true);
  });
});
