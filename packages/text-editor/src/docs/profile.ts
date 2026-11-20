import { defineProfile } from "../core/profile";
import {
  accordion,
  button,
  callout,
  h5p,
  image,
  steps,
  tabs,
  webPreview,
} from "../core/library";
import { cards, codeGroup, typeTable } from "./blocks";
import { isPublicDocsUrl } from "./urls";

export const DOCS_LIMITS = {
  bytes: 1024 * 1024,
  nodes: 20000,
  depth: 64,
  metadataBytes: 32768,
} as const;

/** The docs API predates the generic codes; keep its names. */
export const DOCS_DIAGNOSTIC_CODES: Record<string, string> = {
  block_not_allowed: "UNSUPPORTED_NODE",
  mark_not_allowed: "UNSUPPORTED_MARK",
  block_unavailable: "BLOCK_UNAVAILABLE",
  unsupported_syntax: "UNSUPPORTED_NODE",
  unsupported_attribute: "UNSUPPORTED_ATTRIBUTE",
  invalid_document: "INVALID_DOCUMENT",
  too_large: "INVALID_DOCUMENT",
  unsafe_url: "UNSAFE_URL",
  unmanaged_binary: "UNMANAGED_BINARY",
  broken_link: "BROKEN_LINK",
};

/**
 * The documentation profile: every base node, no underline or highlight,
 * simple (Markdown) tables, https images, the docs blocks, and Button,
 * WebPreview and H5P. Articles and product updates are parsed with it too.
 */
export const docsProfile = defineProfile({
  base: { marks: { exclude: ["underline", "highlight"] } },
  blocks: [
    image(),
    callout(),
    tabs(),
    steps(),
    cards(),
    accordion(),
    codeGroup(),
    typeTable(),
    button(),
    webPreview(),
    h5p(),
  ],
  limits: {
    bytes: DOCS_LIMITS.bytes,
    nodes: DOCS_LIMITS.nodes,
    depth: DOCS_LIMITS.depth,
  },
  options: {
    name: "documentation",
    tables: "simple",
    requireContent: false,
    diagnosticCodes: DOCS_DIAGNOSTIC_CODES,
    isAllowedUrl: (url) => isPublicDocsUrl(url),
    codeBlockFields: true,
  },
});
