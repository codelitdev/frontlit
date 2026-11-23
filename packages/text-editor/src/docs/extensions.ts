import type { Extensions } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import { createProfileExtensions, getProfileSchema } from "../core/extensions";
import { docsProfile } from "./profile";

/** DM-VALIDATE: schema-only extensions; no React, upload controls, or node views. */
export function createDocsExtensions(): Extensions {
  return createProfileExtensions(docsProfile);
}

export const docsSchema: Schema = getProfileSchema(docsProfile);
export const DOCS_SCHEMA_VERSION = 1;
