import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/config";
import { TEAM_ID_COOKIE } from "@/lib/tokens";

async function forward(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
    const { path } = await params;
    const cookieHeader = req.headers.get("cookie");
    const targetUrl = `${API_URL}/${path.join("/")}${req.nextUrl.search}`;
    const method = req.method;
    const hasBody = method !== "GET" && method !== "HEAD" && method !== "DELETE";
    const body = hasBody ? await req.text() : undefined;
    const isTeamManagementRoute = path[0] === "teams";
    const teamId = isTeamManagementRoute ? undefined : req.cookies.get(TEAM_ID_COOKIE)?.value;

    const upstream = await fetch(targetUrl, {
        method,
        headers: {
            ...(teamId ? { "X-Frontlit-Team-Id": teamId } : {}),
            ...(body ? { "Content-Type": "application/json" } : {}),
            // Never relay the browser's own `X-Forwarded-For` verbatim: this
            // app is the trusted intermediary between the browser and the
            // API, so a client-supplied value here is unverified and would
            // let a caller spoof the IP the API's rate limiter keys on.
            ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        body,
        cache: "no-store",
    });

    const responseText = await upstream.text();
    const nullBodyStatuses = new Set([101, 103, 204, 205, 304]);
    const hasNullBody = nullBodyStatuses.has(upstream.status);
    const res = new NextResponse(hasNullBody ? null : responseText, {
        status: upstream.status,
        headers: hasNullBody
            ? {}
            : {
                  "Content-Type": upstream.headers.get("Content-Type") || "application/json",
              },
    });

    if (upstream.status === 401) {
        res.headers.set("X-Auth-Error", "session_expired");
    }
    return res;
}

export { forward as GET, forward as POST, forward as PATCH, forward as PUT, forward as DELETE };
