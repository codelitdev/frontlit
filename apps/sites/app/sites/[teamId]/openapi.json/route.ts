import { getApiSpec } from "@/lib/api";

/** The team's OpenAPI spec as published with its API reference
 * (docs/openapi-support.md). Open to any origin so tools can fetch it. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const live = await getApiSpec(teamId);
  const headers = new Headers({
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=0, must-revalidate",
  });
  if (!live) return new Response("Not found", { status: 404, headers });
  if (live.etag) headers.set("etag", live.etag);
  if (live.etag && request.headers.get("if-none-match") === live.etag)
    return new Response(null, { status: 304, headers });
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(live.spec, { status: 200, headers });
}
