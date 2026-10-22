import { z } from "zod";
import {
  parse as parseJsonc,
  printParseErrorCode,
  type ParseError,
} from "jsonc-parser";
import {
  blockDefaults,
  blockSettingsSchemas,
  CHROME_BLOCK_NAMES,
  CONTENT_FEED_BLOCK,
  DATA_SLOT_BLOCK,
  type BlockName,
} from "./blocks";
import { exportKinds, fileKinds, fileMediaSchema } from "./fields";
import { themeStyleSchema } from "./theme-style";
import type { ThemeStyle } from "../models/theme-style";

export const PAGE_SCHEMA_URL = "https://frontlit.app/schema/page.v1.json";
export const SITE_SCHEMA_URL = "https://frontlit.app/schema/site.v1.json";

/** One problem in a page/site file or a submitted layout. `path` is a JSON
 * pointer (`/layout/2/settings/title`); `line`/`column` are set for JSON
 * syntax errors. */
export interface SchemaDiagnostic {
  path: string;
  message: string;
  line?: number;
  column?: number;
}

export class SchemaValidationError extends Error {
  readonly diagnostics: SchemaDiagnostic[];
  constructor(diagnostics: SchemaDiagnostic[]) {
    super(diagnostics.map(formatDiagnostic).join("\n"));
    this.name = "SchemaValidationError";
    this.diagnostics = diagnostics;
  }
}

export function formatDiagnostic(d: SchemaDiagnostic): string {
  const where = d.line ? `${d.line}:${d.column ?? 1}` : d.path || "/";
  return `${where} ${d.message}`;
}

/** A block in stored form, as in `pages.layout` minus builder bookkeeping. */
export interface StoredBlock {
  name: string;
  settings?: Record<string, unknown>;
}

/** Page content independent of storage: what a page file holds, with block
 * settings in stored form (TipTap rich text, media objects). */
export interface PageDocument {
  title?: string;
  description?: string;
  /** `{ url, alt }`; a stored MediaLit object is accepted when serializing. */
  socialImage?: { url: string; alt?: string } | Record<string, unknown>;
  robotsAllowed?: boolean;
  published?: boolean;
  layout: StoredBlock[];
}

export interface Redirect {
  from: string;
  to: string;
  permanent?: boolean;
}

/** Site chrome and theme, as held by `frontlit/site.json`. */
export interface SiteDocument {
  theme?: ThemeStyle;
  header?: Record<string, unknown>;
  footer?: Record<string, unknown>;
  redirects?: Redirect[];
}

const fileSettings = blockSettingsSchemas(fileKinds);
const exportSettings = blockSettingsSchemas(exportKinds);
const blockNames = Object.keys(fileSettings) as BlockName[];
const bodyBlockNames = blockNames.filter(
  (name) => !(CHROME_BLOCK_NAMES as readonly string[]).includes(name),
);

/** Built-in block defaults, in file form. */
export const fileBlockDefaults = Object.fromEntries(
  blockNames.map((name) => [name, exportSettings[name].parse(blockDefaults[name])]),
) as Record<BlockName, Record<string, unknown>>;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function toPointer(path: (string | number)[]): string {
  return path
    .map((part) => `/${String(part).replace(/~/g, "~0").replace(/\//g, "~1")}`)
    .join("");
}

function issuesToDiagnostics(error: z.ZodError, prefix: (string | number)[] = []) {
  return error.issues.map((issue) => ({
    path: toPointer([...prefix, ...issue.path]),
    message: issue.message,
  }));
}

function isBlockName(name: string): name is BlockName {
  return Object.hasOwn(fileSettings, name);
}

function stripDefaults(name: BlockName, settings: Record<string, unknown>) {
  const defaults = fileBlockDefaults[name];
  return Object.fromEntries(
    Object.entries(settings).filter(
      ([key, value]) => value !== undefined && !same(value, defaults[key]),
    ),
  );
}

/** Stored settings → file form: Markdown rich text, `{ url, alt }` media, no
 * list ids, schema key order, defaults omitted. Throws `SchemaValidationError`. */
export function toFileSettings(
  name: string,
  settings: Record<string, unknown> = {},
  path: (string | number)[] = [],
): Record<string, unknown> {
  if (!isBlockName(name)) {
    throw new SchemaValidationError([
      {
        path: toPointer([...path.slice(0, -1), "name"]),
        message: `Unknown block "${name}".`,
      },
    ]);
  }
  const result = exportSettings[name].safeParse(settings);
  if (!result.success)
    throw new SchemaValidationError(issuesToDiagnostics(result.error, path));
  return stripDefaults(name, result.data);
}

/** File-form settings → stored settings. Throws `SchemaValidationError`. */
export function fromFileSettings(
  name: BlockName,
  settings: unknown,
  path: (string | number)[] = [],
): Record<string, unknown> {
  const result = fileSettings[name].safeParse(settings ?? {});
  if (!result.success)
    throw new SchemaValidationError(issuesToDiagnostics(result.error, path));
  return result.data;
}

/** Validates stored settings and rewrites them in canonical form (what a
 * page file would import as). Builder, REST and MCP saves all go through
 * this, so stored content always equals its exported file. */
export function canonicalizeSettings(
  name: string,
  settings: Record<string, unknown> = {},
  path: (string | number)[] = [],
): Record<string, unknown> {
  const fileForm = toFileSettings(name, settings, path);
  return fromFileSettings(name as BlockName, fileForm, path);
}

/** Canonicalizes every block of a stored layout. Data slots are host-owned
 * and settings-free blocks (e.g. chrome placeholders) pass through untouched. Collects diagnostics across all blocks. */
export function canonicalizeLayout<T extends StoredBlock>(layout: T[]): T[] {
  const diagnostics: SchemaDiagnostic[] = [];
  const output = layout.map((block, index) => {
    if (block.name === DATA_SLOT_BLOCK) return block;
    // Settings-free chrome placeholders stay as they are; any other block,
    // with or without settings, must be a known block.
    if (
      block.settings === undefined &&
      (CHROME_BLOCK_NAMES as readonly string[]).includes(block.name)
    )
      return block;
    try {
      return {
        ...block,
        settings: canonicalizeSettings(block.name, block.settings, [
          "layout",
          index,
          "settings",
        ]),
      };
    } catch (error) {
      if (!(error instanceof SchemaValidationError)) throw error;
      diagnostics.push(...error.diagnostics);
      return block;
    }
  });
  if (diagnostics.length) throw new SchemaValidationError(diagnostics);
  return output;
}

// ---------------------------------------------------------------------------
// Page files
// ---------------------------------------------------------------------------

const fileBlockSchema = z.discriminatedUnion("name", [
  ...bodyBlockNames.map((name) =>
    z
      .object({ name: z.literal(name), settings: fileSettings[name].optional() })
      .strict(),
  ),
  z
    .object({ name: z.literal(CONTENT_FEED_BLOCK) })
    .strict()
    .describe(
      "The blog, docs or changelog feed. Only on the blog, docs and changelog pages.",
    ),
] as unknown as [
  z.ZodDiscriminatedUnionOption<"name">,
  ...z.ZodDiscriminatedUnionOption<"name">[],
]);

export const pageFileSchema = z
  .object({
    $schema: z.string().optional(),
    title: z
      .string()
      .optional()
      .describe("Page title for search results and the browser tab."),
    description: z
      .string()
      .optional()
      .describe("Short summary for search results and link previews."),
    socialImage: fileMediaSchema.optional().describe("Open Graph image."),
    robotsAllowed: z
      .boolean()
      .optional()
      .describe("false asks search engines not to index the page. Default true."),
    published: z
      .boolean()
      .optional()
      .describe("false imports the page as a draft. Default true."),
    layout: z
      .array(fileBlockSchema)
      .describe(
        "Blocks, top to bottom. The site header and footer come from site.json.",
      ),
  })
  .strict();

const pageKeyOrder = [
  "title",
  "description",
  "socialImage",
  "robotsAllowed",
  "published",
] as const;

function parseJson(source: string | unknown): unknown {
  if (typeof source !== "string") return source;
  const errors: ParseError[] = [];
  const value = parseJsonc(source, errors, {
    disallowComments: true,
    allowTrailingComma: false,
  });
  if (!errors.length) return value;
  throw new SchemaValidationError(
    errors.map((error) => {
      const before = source.slice(0, error.offset).split("\n");
      return {
        path: "",
        message: `Invalid JSON: ${printParseErrorCode(error.error)}.`,
        line: before.length,
        column: before[before.length - 1].length + 1,
      };
    }),
  );
}

/** Parses a page file (text or parsed JSON) into a canonical `PageDocument`.
 * Throws `SchemaValidationError` with every problem found. */
export function parsePageFile(source: string | unknown): PageDocument {
  const result = pageFileSchema.safeParse(parseJson(source));
  if (!result.success)
    throw new SchemaValidationError(issuesToDiagnostics(result.error));
  const { layout, ...meta } = result.data;
  const page: PageDocument = { layout: [] };
  for (const key of pageKeyOrder) {
    if (meta[key] !== undefined) (page as any)[key] = meta[key];
  }
  page.layout = (layout as { name: string; settings?: Record<string, unknown> }[]).map(
    (block, index) =>
      block.name === CONTENT_FEED_BLOCK
        ? { name: DATA_SLOT_BLOCK, settings: { slot: CONTENT_FEED_BLOCK } }
        : {
            name: block.name,
            settings: canonicalizeSettings(block.name, block.settings, [
              "layout",
              index,
              "settings",
            ]),
          },
  );
  return page;
}

/** Serializes a page in canonical form: schema key order, 2-space indent,
 * trailing newline, unset and default values omitted. Header/footer are
 * site chrome and are left out. Throws `SchemaValidationError`. */
export function serializePageFile(page: PageDocument): string {
  const diagnostics: SchemaDiagnostic[] = [];
  const layout = page.layout
    .filter((block) => !(CHROME_BLOCK_NAMES as readonly string[]).includes(block.name))
    .map((block, index) => {
      if (block.name === DATA_SLOT_BLOCK) return { name: CONTENT_FEED_BLOCK };
      try {
        const settings = toFileSettings(block.name, block.settings, [
          "layout",
          index,
          "settings",
        ]);
        return Object.keys(settings).length
          ? { name: block.name, settings }
          : { name: block.name };
      } catch (error) {
        if (!(error instanceof SchemaValidationError)) throw error;
        diagnostics.push(...error.diagnostics);
        return { name: block.name };
      }
    });
  if (diagnostics.length) throw new SchemaValidationError(diagnostics);
  const socialImage = page.socialImage
    ? exportKinds.media.parse(page.socialImage)
    : undefined;
  const file = {
    $schema: PAGE_SCHEMA_URL,
    title: page.title || undefined,
    description: page.description || undefined,
    socialImage,
    robotsAllowed: page.robotsAllowed === false ? false : undefined,
    published: page.published === false ? false : undefined,
    layout,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// Site file
// ---------------------------------------------------------------------------

const redirectSchema = z
  .object({
    from: z.string().regex(/^\/\S*$/, 'Must be a site path starting with "/".'),
    to: z.string().min(1).describe("A site path or absolute URL."),
    permanent: z
      .boolean()
      .optional()
      .describe("308 when true (default), 307 when false."),
  })
  .strict();

export const siteFileSchema = z
  .object({
    $schema: z.string().optional(),
    theme: themeStyleSchema.optional().describe("The site theme."),
    header: fileSettings.header
      .optional()
      .describe("Site header, shown on every page."),
    footer: fileSettings.footer
      .optional()
      .describe("Site footer, shown on every page."),
    redirects: z.array(redirectSchema).optional(),
  })
  .strict();

/** Parses `site.json` into a canonical `SiteDocument`. */
export function parseSiteFile(source: string | unknown): SiteDocument {
  const result = siteFileSchema.safeParse(parseJson(source));
  if (!result.success)
    throw new SchemaValidationError(issuesToDiagnostics(result.error));
  const { theme, header, footer, redirects } = result.data;
  const site: SiteDocument = {};
  if (theme) site.theme = theme as ThemeStyle;
  if (header) site.header = canonicalizeSettings("header", header, ["header"]);
  if (footer) site.footer = canonicalizeSettings("footer", footer, ["footer"]);
  if (redirects) site.redirects = redirects as Redirect[];
  return site;
}

/** Serializes site chrome in canonical form. */
export function serializeSiteFile(site: SiteDocument): string {
  let theme: unknown;
  if (site.theme) {
    const result = themeStyleSchema.safeParse(site.theme);
    if (!result.success) {
      throw new SchemaValidationError(issuesToDiagnostics(result.error, ["theme"]));
    }
    theme = result.data;
  }
  const header = site.header
    ? toFileSettings("header", site.header, ["header"])
    : undefined;
  const footer = site.footer
    ? toFileSettings("footer", site.footer, ["footer"])
    : undefined;
  const redirects = site.redirects?.length
    ? site.redirects.map(({ from, to, permanent }) => ({
        from,
        to,
        permanent: permanent === false ? false : undefined,
      }))
    : undefined;
  const file = {
    $schema: SITE_SCHEMA_URL,
    theme,
    header: header && Object.keys(header).length ? header : undefined,
    footer: footer && Object.keys(footer).length ? footer : undefined,
    redirects,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}
