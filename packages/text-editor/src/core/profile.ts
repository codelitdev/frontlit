import {
  BASE_MARKS,
  BASE_NODES,
  DEFAULT_LIMITS,
  type BaseMark,
  type BaseNode,
  type BlockSchema,
  type HeadingLevel,
  type Profile,
  type ProfileDefinition,
} from "./types";

const FIXED = ["doc", "paragraph", "text"];
const CHILDREN: Record<string, string[]> = {
  table: ["tableRow", "tableHeader", "tableCell"],
};
const LEVELS: HeadingLevel[] = [1, 2, 3, 4, 5, 6];

function unknown(kind: string, name: string): never {
  throw new Error(`defineProfile: unknown ${kind} "${name}".`);
}

/** Collects a block and the child nodes it owns. */
function flatten(block: BlockSchema, parent?: BlockSchema) {
  const out: { schema: BlockSchema; parent?: BlockSchema }[] = [
    { schema: block, parent },
  ];
  for (const child of block.children ?? []) out.push(...flatten(child, block));
  return out;
}

/**
 * Builds a profile: base nodes and marks minus `exclude`, plus the listed
 * blocks. `doc`, `paragraph` and `text` can't be excluded; excluding a parent
 * removes its children (lists their items, tables their rows and cells);
 * unknown names throw.
 */
export function defineProfile(definition: ProfileDefinition = {}): Profile {
  const excluded = new Set<string>();
  for (const name of definition.base?.exclude ?? []) {
    if (FIXED.includes(name))
      throw new Error(`defineProfile: "${name}" can't be excluded.`);
    if (name === "listItem")
      throw new Error(
        'defineProfile: "listItem" goes with its lists; exclude "bulletList" and "orderedList".',
      );
    if (Object.values(CHILDREN).some((children) => children.includes(name)))
      throw new Error(
        `defineProfile: "${name}" goes with its parent; exclude "table".`,
      );
    if (!BASE_NODES.includes(name as BaseNode)) unknown("base node", name);
    excluded.add(name);
  }
  const excludedMarks = new Set<string>();
  for (const name of definition.base?.marks?.exclude ?? []) {
    if (!BASE_MARKS.includes(name as BaseMark)) unknown("mark", name);
    excludedMarks.add(name);
  }
  const levels = definition.base?.headings?.levels ?? LEVELS;
  if (!levels.length || levels.some((level) => !LEVELS.includes(level)))
    throw new Error("defineProfile: heading levels must be 1–6.");

  const baseNodes = BASE_NODES.filter((name) => !excluded.has(name));
  const nodeNames = new Set<string>([...FIXED, ...baseNodes]);
  if (baseNodes.includes("bulletList") || baseNodes.includes("orderedList"))
    nodeNames.add("listItem");
  for (const [parent, children] of Object.entries(CHILDREN))
    if (nodeNames.has(parent)) for (const child of children) nodeNames.add(child);

  const blocks: BlockSchema[] = [];
  const ui = new Map<string, unknown>();
  const blockSchemas = new Map<string, BlockSchema>();
  const tags = new Map<string, { schema: BlockSchema; parent?: BlockSchema }>();
  for (const entry of definition.blocks ?? []) {
    const schema = "schema" in entry ? entry.schema : entry;
    if (!schema || typeof schema.name !== "string")
      throw new Error("defineProfile: blocks must be block schemas.");
    if ("schema" in entry) ui.set(schema.name, entry);
    blocks.push(schema);
    for (const item of flatten(schema)) {
      if (nodeNames.has(item.schema.name))
        throw new Error(`defineProfile: duplicate node "${item.schema.name}".`);
      const tag = item.schema.tag;
      if (tag && tags.has(tag))
        throw new Error(`defineProfile: duplicate Markdown tag <${tag}>.`);
      nodeNames.add(item.schema.name);
      blockSchemas.set(item.schema.name, item.schema);
      if (tag) tags.set(tag, item);
    }
  }
  for (const name of definition.options?.menu ?? [])
    if (!blocks.some((block) => block.name === name)) unknown("menu block", name);

  return {
    kind: "frontlit.profile",
    baseNodes,
    marks: BASE_MARKS.filter((name) => !excludedMarks.has(name)),
    headingLevels: [...levels].sort(),
    blocks,
    nodeNames,
    blockSchemas,
    tags,
    limits: { ...DEFAULT_LIMITS, ...definition.limits },
    options: {
      tables: "rich",
      requireContent: false,
      headingAnchors: "unique",
      ...definition.options,
    },
    ui,
  };
}

export function isProfile(value: unknown): value is Profile {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as Profile).kind === "frontlit.profile"
  );
}

/** Maps a generic diagnostic code to the profile's name for it. */
export function codeFor(profile: Profile, code: string): string {
  return profile.options.diagnosticCodes?.[code] ?? code;
}
