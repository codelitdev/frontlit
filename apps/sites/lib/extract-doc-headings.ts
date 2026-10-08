/** DM-CONVERT: navigation uses the renderer's server-safe heading policy. */
export { extractDocsHeadings as extractDocHeadings } from "@frontlit/text-editor/headings";
export type DocHeading = { level: number; text: string; id: string };
