import page from "@frontlit/page-builder/schema/page.v1.json";
import site from "@frontlit/page-builder/schema/site.v1.json";
import content from "@frontlit/text-editor/schema/content.v1.json";

const schemas: Record<string, unknown> = {
  "page.v1.json": page,
  "site.v1.json": site,
};
/** Not a JSON Schema: a reference of the Markdown format for agents. */
const references: Record<string, unknown> = {
  "content.v1.json": content,
};

/** The `$schema` targets of page and site files, for editor validation and
 * autocomplete, and the content format reference that API and MCP field
 * descriptions point to. Served on every host, canonically at frontlit.app. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const file = (await params).file;
  const body = schemas[file] ?? references[file];
  if (!body) return new Response(null, { status: 404 });
  return Response.json(body, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
      "Content-Type": schemas[file] ? "application/schema+json" : "application/json",
    },
  });
}
