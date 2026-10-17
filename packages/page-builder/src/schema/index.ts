/** React-free schemas and canonical serializers for page and site files.
 * Safe to import from servers (`@frontlit/page-builder/schema`). */
export * from "./files";
export {
  blockDefaults,
  blockSettingsSchemas,
  CHROME_BLOCK_NAMES,
  CONTENT_FEED_BLOCK,
  DATA_SLOT_BLOCK,
  type BlockName,
} from "./blocks";
export { exportKinds, fileKinds, fileMediaSchema, type FieldKinds } from "./fields";
export { themeStyleSchema } from "./theme-style";
