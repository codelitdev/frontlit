export { default as Editor } from "./editor";
export type { EditorProps } from "./editor";
export {
  defaultTextEditorLabels,
  resolveTextEditorLabels,
  type TextEditorLabels,
} from "./labels";
export {
  ImagePickerContextProvider,
  useImagePicker,
  type PickedImage,
} from "./image-picker";
export { default as emptyDoc } from "./empty-doc";
export * from "./extract-headings";
export * from "./extensions";
export * from "./create-id";
export * from "./extract-text-from-node";

export * from "./text-editor-content";
export * from "./text-renderer";
export * from "./normalize-text-editor-content";
export * from "./extract-text-from-text-editor-content";
export * from "./truncate-text-editor-content";
export * from "./renderer-theme";

// Pluggable blocks: browser half (the server-safe half is `@frontlit/text-editor/blocks`).
export * from "./ui";
export {
  defaultProfile,
  docsProfile,
  resolveProfile,
  type ProfileInput,
} from "./profiles";
export { defineProfile } from "./core/profile";
export type { BlockSchema, Profile, ProfileDefinition } from "./core/types";
export {
  image,
  video,
  audio,
  pdf,
  file,
  embed,
  callout,
  tabs,
  accordion,
  steps,
  button,
  webPreview,
  h5p,
} from "./core/library";
