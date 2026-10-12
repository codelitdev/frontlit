import { describe, expect, it } from "vitest";
import { isSafeDocsUrl } from "./urls";

describe("DM-VALIDATE/DM-MEDIA URL syntax", () => {
  it.each([
    "../setup.md#setup",
    "/docs/setup",
    "#世界",
    "mailto:help@example.com",
    "https://example.com/manual?q=help",
  ])("allows safe authored links: %s", (url) => {
    expect(isSafeDocsUrl(url)).toBe(true);
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,example",
    "blob:https://example.com/id",
    "file:/tmp/image.png",
    "java\nscript:alert(1)",
    "java%0ascript:alert(1)",
    "//example.com/image.png",
    "\\example.com",
    "https://user:password@example.com/image.png",
    "https://example.com/private/image.png",
    "/api/attachments/file",
    "/api/%70rivate/file",
    "https://example.com/image?X-Amz-Signature=abc",
    "https://example.com/file?token=private",
    "/download?expires=10",
    "https://example.com/%ZZ",
  ])("V26: rejects unsafe, known private, or signed URLs: %s", (url) => {
    expect(isSafeDocsUrl(url)).toBe(false);
  });
  it("V26: image sources require HTTPS while external privacy is not asserted", () => {
    expect(isSafeDocsUrl("http://example.com/image.png", true)).toBe(false);
    expect(isSafeDocsUrl("image.png", true)).toBe(false);
    expect(isSafeDocsUrl("https://example.com/image.png", true)).toBe(true);
  });
});
