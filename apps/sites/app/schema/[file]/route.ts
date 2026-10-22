import page from "@frontlit/page-builder/schema/page.v1.json";
import site from "@frontlit/page-builder/schema/site.v1.json";

const schemas: Record<string, unknown> = {
  "page.v1.json": page,
  "site.v1.json": site,
};

/** The `$schema` targets of page and site files, for editor validation and
 * autocomplete. Served on every host, canonically at frontlit.app. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const schema = schemas[(await params).file];
  if (!schema) return new Response(null, { status: 404 });
  return Response.json(schema, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/schema+json",
    },
  });
}
