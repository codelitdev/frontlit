import { getApiSpecResponse } from "@/lib/api";

/** The team's OpenAPI spec as published with its API reference
 * (docs/openapi-support.md). Open to any origin so tools can fetch it. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await params;
  const upstream = await getApiSpecResponse(
    teamId,
    request.headers.get("if-none-match"),
  );
  const headers = new Headers({
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=0, must-revalidate",
  });
  const etag = upstream.headers.get("etag");
  if (etag) headers.set("etag", etag);
  if (upstream.status === 304) return new Response(null, { status: 304, headers });
  if (!upstream.ok) return new Response("Not found", { status: 404, headers });
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(await upstream.text(), { status: 200, headers });
}
