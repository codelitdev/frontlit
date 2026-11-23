import { describe, expect, it } from "vitest";
import {
  ContentError,
  defineProfile,
  embed,
  image,
  isAllowedImageUrl,
  isSafeUrl,
  parseMarkdown,
  parseVideoUrl,
  requireContent,
  serializeMarkdown,
  validateContent,
  video,
  videoEmbedUrl,
} from "./index";
import { defaultProfile } from "../profiles";
import { docsProfile } from "../docs/profile";

const doc = (...content: unknown[]) => ({ type: "doc", content });
const embedNode = (code = "<p>x</p>") => ({ type: "embed", attrs: { code } });
const errors = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ContentError);
    return (error as ContentError).diagnostics;
  }
  throw new Error("Expected failure");
};

describe("availability", () => {
  const profile = defineProfile({ blocks: [embed(), video()] });
  const unavailable = { embed: "plan_required" };

  it("refuses adding an unavailable block, with the reason", () => {
    const result = validateContent(profile, doc(embedNode()), {
      previous: doc(),
      unavailable,
    });
    expect(result.content).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "block_unavailable",
        reason: "plan_required",
        fieldPath: "content.content[0]",
      }),
    ]);
  });

  it("keeps existing ones valid and allows removing them", () => {
    const previous = doc(embedNode("<p>a</p>"), embedNode("<p>b</p>"));
    // Same count, edited code: allowed.
    expect(
      validateContent(profile, doc(embedNode("<p>c</p>"), embedNode("<p>d</p>")), {
        previous,
        unavailable,
      }).diagnostics,
    ).toEqual([]);
    // Fewer: allowed.
    expect(
      validateContent(profile, doc(embedNode()), { previous, unavailable }).diagnostics,
    ).toEqual([]);
    // More: the third one is refused and located.
    const more = validateContent(
      profile,
      doc(embedNode(), embedNode(), { type: "paragraph" }, embedNode()),
      {
        previous,
        unavailable,
      },
    );
    expect(more.diagnostics[0]).toMatchObject({
      code: "block_unavailable",
      fieldPath: "content.content[3]",
    });
  });

  it("counts against nothing when there is no previous version", () => {
    expect(
      validateContent(profile, doc(embedNode()), { unavailable }).diagnostics[0].code,
    ).toBe("block_unavailable");
  });

  it("reports a deeply nested document as too large instead of overflowing", () => {
    let node: Record<string, unknown> = { type: "paragraph" };
    for (let i = 0; i < 30000; i++) node = { type: "blockquote", content: [node] };
    const deep = doc(node);
    for (const previous of [undefined, deep]) {
      const { diagnostics } = validateContent(profile, deep, { previous, unavailable });
      expect(diagnostics.map((d) => d.code)).toContain("too_large");
    }
  });

  it("doesn't affect other blocks", () => {
    expect(
      validateContent(profile, doc({ type: "video", attrs: { media: "m1" } }), {
        previous: doc(),
        unavailable,
      }).diagnostics,
    ).toEqual([]);
  });

  it("uses the profile's diagnostic codes", () => {
    expect(
      validateContent(
        docsProfile,
        doc({ type: "callout", content: [{ type: "paragraph" }] }),
        {
          unavailable: { callout: "nope" },
        },
      ).diagnostics[0].code,
    ).toBe("BLOCK_UNAVAILABLE");
  });
});

describe("URL rules", () => {
  const profile = defineProfile({});
  const link = (href: string) =>
    doc({
      type: "paragraph",
      content: [
        { type: "text", text: "x", marks: [{ type: "link", attrs: { href } }] },
      ],
    });

  it.each([
    "https://example.com",
    "http://example.com/a",
    "mailto:a@example.com",
    "/docs/x",
    "../x.md#a",
    "#top",
  ])("allows %s", (href) => {
    expect(validateContent(profile, link(href)).diagnostics).toEqual([]);
    expect(isSafeUrl(href)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:x",
    "//evil.com",
    "https://user:pass@example.com",
    "file:///etc/passwd",
  ])("refuses %j in JSON and Markdown", (href) => {
    expect(validateContent(profile, link(href)).diagnostics[0].code).toBe("unsafe_url");
    if (!/\s/.test(href))
      expect(errors(() => parseMarkdown(profile, `[x](${href})`))[0].code).toBe(
        "unsafe_url",
      );
  });

  it("image URLs: https only, host allowlist, base64 only where allowed", () => {
    expect(
      isAllowedImageUrl("http://images.unsplash.com/a.png", ["images.unsplash.com"]),
    ).toBe(false);
    expect(
      isAllowedImageUrl("https://IMAGES.unsplash.com/a.png", ["images.unsplash.com"]),
    ).toBe(true);
    expect(isAllowedImageUrl("https://evil.com/a.png", ["images.unsplash.com"])).toBe(
      false,
    );
    const base64 = doc({ type: "image", attrs: { src: "data:image/png;base64,AAAA" } });
    expect(validateContent(defaultProfile, base64).diagnostics).toEqual([]);
    expect(validateContent(docsProfile, base64).diagnostics[0].code).toBe("UNSAFE_URL");
    expect(
      validateContent(defineProfile({ blocks: [image()] }), base64).diagnostics[0].code,
    ).toBe("unsafe_url");
    // Only raster data URLs, never SVG or HTML.
    const svg = doc({
      type: "image",
      attrs: { src: "data:image/svg+xml;base64,AAAA" },
    });
    expect(validateContent(defaultProfile, svg).diagnostics[0].code).toBe("unsafe_url");
  });

  it("video URLs reduce to provider + ID and render only fixed embed URLs", () => {
    expect(parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1")).toEqual({
      provider: "youtube",
      videoId: "dQw4w9WgXcQ",
    });
    expect(parseVideoUrl("https://vimeo.com/channels/staff/76979871")).toEqual({
      provider: "vimeo",
      videoId: "76979871",
    });
    for (const bad of [
      "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=<script>",
      "javascript:alert(1)//youtube.com",
      "https://vimeo.com/abc",
      "ftp://youtu.be/dQw4w9WgXcQ",
    ])
      expect(parseVideoUrl(bad)).toBeNull();
    expect(videoEmbedUrl("youtube", "dQw4w9WgXcQ")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(videoEmbedUrl("vimeo", "76979871")).toBe(
      "https://player.vimeo.com/video/76979871",
    );
    expect(videoEmbedUrl("youtube", '"><script>')).toBeNull();
  });
});

describe("Markdown safety", () => {
  const profile = defineProfile({ blocks: [embed(), video()] });
  it.each([
    ["<div>raw</div>", "unsupported_syntax"],
    ["<script>alert(1)</script>", "unsupported_syntax"],
    ["Text <b>bold</b>", "unsupported_syntax"],
    ["<Video media={window.x} />", "unsupported_attribute"],
    ["<Video {...props} />", "unsupported_attribute"],
    ['<Video media="m" onLoad="x" />', "unsupported_attribute"],
    ["<Widget />", "block_not_allowed"],
    ["import x from 'y'", "unsupported_syntax"],
  ])("refuses %j", (markdown, code) => {
    expect(errors(() => parseMarkdown(profile, markdown))[0]).toMatchObject({
      code,
      line: 1,
    });
  });

  it("caps raw input bytes before parsing", () => {
    const small = defineProfile({ limits: { bytes: 100 } });
    expect(errors(() => parseMarkdown(small, "a".repeat(101)))[0].code).toBe(
      "too_large",
    );
    expect(
      validateContent(
        small,
        JSON.stringify(
          doc({
            type: "paragraph",
            content: [{ type: "text", text: "a".repeat(200) }],
          }),
        ),
      ).diagnostics[0].code,
    ).toBe("too_large");
    expect(validateContent(small, "{not json").diagnostics[0].code).toBe(
      "invalid_document",
    );
  });

  it("enforces node and depth limits", () => {
    const tight = defineProfile({ limits: { nodes: 5, depth: 3 } });
    expect(
      errors(() => parseMarkdown(tight, "a\n\nb\n\nc\n\nd\n\ne\n\nf"))[0].code,
    ).toBe("too_large");
    const deep = doc({
      type: "blockquote",
      content: [
        {
          type: "blockquote",
          content: [{ type: "blockquote", content: [{ type: "paragraph" }] }],
        },
      ],
    });
    expect(validateContent(tight, deep).diagnostics[0].code).toBe("too_large");
  });

  it("parses raw JSON text through the same checks", () => {
    expect(requireContent(profile, JSON.stringify(doc(embedNode())))).toEqual({
      type: "doc",
      content: [
        { type: "embed", attrs: { code: "<p>x</p>", title: null, height: null } },
      ],
    });
  });

  it("refuses Markdown for marks without a Markdown form", () => {
    const marked = doc({
      type: "paragraph",
      content: [{ type: "text", text: "x", marks: [{ type: "highlight" }] }],
    });
    expect(errors(() => serializeMarkdown(defaultProfile, marked))[0].code).toBe(
      "unsupported_syntax",
    );
  });
});

describe("default profile", () => {
  it("validates what the default editor saves", () => {
    const content = doc(
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Title" }],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "u", marks: [{ type: "underline" }, { type: "bold" }] },
          {
            type: "text",
            text: "l",
            marks: [
              {
                type: "link",
                attrs: {
                  href: "https://x.com",
                  target: "_blank",
                  rel: "noopener noreferrer nofollow",
                  class: null,
                },
              },
            ],
          },
        ],
      },
      {
        type: "image",
        attrs: {
          src: "https://cdn.example.com/a.png",
          alt: "a",
          title: null,
          width: 200,
          height: 100,
        },
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableHeader",
                attrs: { colspan: 1, rowspan: 1, colwidth: [150] },
                content: [{ type: "paragraph" }],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [
                  {
                    type: "bulletList",
                    content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    );
    expect(validateContent(defaultProfile, content).diagnostics).toEqual([]);
  });
});
