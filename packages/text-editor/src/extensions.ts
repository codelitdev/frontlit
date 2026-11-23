import type { Extensions } from "@tiptap/core";
import { createProfileExtensions } from "./core/extensions";
import { defaultProfile } from "./profiles";

interface ExtensionOptions {
  placeholder?: string;
}

/** Editing extensions of the default profile (schema-only, no node views). */
export const createExtensions = ({ placeholder }: ExtensionOptions = {}): Extensions =>
  createProfileExtensions(defaultProfile, { editing: true, placeholder });
