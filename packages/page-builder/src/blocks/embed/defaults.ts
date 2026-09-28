import type { EmbedSettings } from "./settings";

export const embedDefaults: Partial<EmbedSettings> = {
  contentType: "url",
  content: "",
  aspectRatio: "default",
  height: 500,
};
