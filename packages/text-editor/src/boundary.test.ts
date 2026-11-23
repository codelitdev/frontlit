import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const src = resolve(dirname(new URL(import.meta.url).pathname));
const IMPORT =
  /(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|^import\s+["']([^"']+)["']/gm;

function specifiers(file: string): string[] {
  const code = readFileSync(file, "utf8");
  return [...code.matchAll(IMPORT)].map((match) => match[1] ?? match[2] ?? match[3]);
}

function resolveRelative(from: string, specifier: string): string | null {
  const base = resolve(dirname(from), specifier.replace(/\.js$/, ""));
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ])
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return null;
}

/** Every file reachable from an entry, with the import chain that reached it. */
function graph(entry: string) {
  const seen = new Map<string, string[]>([[entry, [entry]]]);
  const queue = [entry];
  while (queue.length) {
    const file = queue.shift()!;
    for (const specifier of specifiers(file)) {
      if (!specifier.startsWith(".")) continue;
      const target = resolveRelative(file, specifier);
      if (target && !seen.has(target)) {
        seen.set(target, [...seen.get(file)!, target]);
        queue.push(target);
      }
    }
  }
  return seen;
}

const isDocs = (file: string) => {
  const path = relative(src, file);
  return (
    path.startsWith("docs/") ||
    path === "docs.ts" ||
    path.startsWith("components/docs-blocks") ||
    path.startsWith("components/docs-block-views")
  );
};

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)],
  );

describe("package boundary", () => {
  it.each(["core/index.ts", "ui/index.ts"])(
    "the generic core (%s) never imports from src/docs/",
    (entry) => {
      const reached = graph(join(src, entry));
      const leaks = [...reached.entries()]
        .filter(([file]) => isDocs(file))
        .map(([, chain]) => chain.map((file) => relative(src, file)).join(" → "));
      expect(leaks).toEqual([]);
      expect(reached.size).toBeGreaterThan(5);
    },
  );

  it("the server-safe core imports no React", () => {
    const reached = graph(join(src, "core/index.ts"));
    const react = [...reached.keys()].filter((file) =>
      specifiers(file).some((specifier) =>
        /^(react|react-dom|@tiptap\/react)(\/|$)/.test(specifier),
      ),
    );
    expect(react.map((file) => relative(src, file))).toEqual([]);
  });

  it("the docs profile reaches no React either", () => {
    const reached = graph(join(src, "docs.ts"));
    const react = [...reached.keys()].filter((file) =>
      specifiers(file).some((specifier) =>
        /^(react|react-dom|@tiptap\/react)(\/|$)/.test(specifier),
      ),
    );
    expect(react.map((file) => relative(src, file))).toEqual([]);
  });

  it("no dangerouslySetInnerHTML anywhere (embeds use a srcdoc string)", () => {
    const offenders = files(src)
      .filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith(".test.ts"))
      .filter((file) => readFileSync(file, "utf8").includes("dangerouslySetInnerHTML"));
    expect(offenders.map((file) => relative(src, file))).toEqual([]);
  });
});
