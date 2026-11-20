import { defineProfile, isProfile } from "./core/profile";
import {
  accordion,
  button,
  callout,
  h5p,
  image,
  steps,
  tabs,
  webPreview,
} from "./core/library";
import type { BlockSchema, Profile } from "./core/types";
import { CodeMirrorNode } from "./components/custom-code-mirror";
import { cards, codeGroup, typeTable } from "./docs/blocks";
import { docsProfile } from "./docs/profile";

/** Legacy code node kept so old content still loads. No Markdown form. */
const codeMirror: BlockSchema = {
  name: "codeMirror",
  content: "block+",
  attrs: {},
  extension: () => CodeMirrorNode,
  docs: { summary: "Legacy code block.", example: "" },
};

/**
 * The default editor: every base node and mark, base64 and resizable images,
 * rich tables. It also holds the docs blocks, because articles and product
 * updates take Markdown converted by the docs parser; only Image is offered
 * in its insert menus.
 */
export const defaultProfile: Profile = defineProfile({
  blocks: [
    image({ allowBase64: true, resize: true }),
    codeMirror,
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
  options: {
    name: "default",
    tables: "rich",
    requireContent: true,
    headingAnchors: "legacy",
    menu: ["image"],
  },
});

export { docsProfile };

export type ProfileInput = "default" | "documentation" | Profile;

/** Resolves the `profile` prop of the editor and renderer. */
export function resolveProfile(profile: ProfileInput | undefined): Profile {
  if (isProfile(profile)) return profile;
  return profile === "documentation" ? docsProfile : defaultProfile;
}
