import { NextRequest, NextResponse } from "next/server";
import { API_URL, WEB_CLIENT } from "@/lib/config";

async function proxyAuth(req: NextRequest, path: string[]) {
  const upstreamUrl = new URL(
    `/api/auth/${path.map(encodeURIComponent).join("/")}`,
    API_URL,
  );
  req.nextUrl.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.append(key, value);
  });

  const headers = new Headers(req.headers);
  headers.set("host", upstreamUrl.host);
  headers.set("x-forwarded-host", req.headers.get("host") || "");
  headers.set("x-forwarded-proto", req.nextUrl.protocol.replace(":", ""));
  // Never relay the browser's own `X-Forwarded-For` verbatim: this app is
  // the trusted intermediary between the browser and the API, so a
  // client-supplied value here is unverified and would let a caller spoof
  // the IP the API's rate limiter (e.g. auth OTP attempts) keys on.
  headers.delete("x-forwarded-for");

  const body =
    req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();

  const upstream = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body,
    redirect: "manual",
  });

  const responseHeaders = new Headers(upstream.headers);
  const location = responseHeaders.get("location");
  if (location?.startsWith(API_URL)) {
    responseHeaders.set("location", location.replace(API_URL, WEB_CLIENT));
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: RouteContext) {
  return proxyAuth(req, (await ctx.params).path);
}
export async function POST(req: NextRequest, ctx: RouteContext) {
  return proxyAuth(req, (await ctx.params).path);
}
export async function PUT(req: NextRequest, ctx: RouteContext) {
  return proxyAuth(req, (await ctx.params).path);
}
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  return proxyAuth(req, (await ctx.params).path);
}
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  return proxyAuth(req, (await ctx.params).path);
}
