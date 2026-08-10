import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

const bodyForbiddenResponseStatuses = new Set([204, 205, 304]);
const vscodeClientMetadataUrl = "https://vscode.dev/oauth/client-metadata.json";
const claudeClientMetadataUrl =
    "https://claude.ai/oauth/mcp-oauth-client-metadata";
const deviceCodeGrantType = "urn:ietf:params:oauth:grant-type:device_code";
const jwtBearerGrantType = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const metadataTimeoutMs = 10_000;
const maximumMetadataBytes = 1_048_576;
const ignoredGrantTypesByClientMetadataUrl = new Map<string, Set<string>>([
    [vscodeClientMetadataUrl, new Set([deviceCodeGrantType])],
    [claudeClientMetadataUrl, new Set([jwtBearerGrantType])],
]);

/** Permit only globally routable unicast addresses after DNS resolution. */
function isPublicRoutableAddress(address: string): boolean {
    const family = isIP(address);
    if (family === 4) {
        const [a, b, c] = address.split(".").map(Number);
        if (
            a === 0 ||
            a === 10 ||
            a === 127 ||
            a >= 224 ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 0 && (c === 0 || c === 2 || c === 88)) ||
            (a === 192 && b === 168) ||
            (a === 198 && (b === 18 || b === 19)) ||
            (a === 198 && b === 51 && c === 100) ||
            (a === 203 && b === 0 && c === 113)
        ) {
            return false;
        }
        return true;
    }

    if (family === 6) {
        // Global-unicast IPv6 is 2000::/3. This excludes loopback, mapped,
        // unique-local, link-local, multicast, documentation, and reserved.
        const firstHextet = Number.parseInt(address.split(":")[0] || "0", 16);
        return firstHextet >= 0x2000 && firstHextet <= 0x3fff;
    }
    return false;
}

function toResponseHeaders(
    headers: Record<string, string | string[] | undefined>,
) {
    const result = new Headers();
    for (const [name, value] of Object.entries(headers)) {
        if (Array.isArray(value)) {
            for (const item of value) result.append(name, item);
        } else if (value !== undefined) {
            result.append(name, value);
        }
    }
    return result;
}

/**
 * Fetches one CIMD document without redirects or DNS rebinding. This also
 * works around Better Auth 1.7.0-rc.4's Node 24 lookup(all=true) mismatch.
 */
const fetchPinnedClientMetadataResource: ClientMetadataResourceFetch = async (
    input,
    init,
) => {
    const webRequest = new Request(input, init);
    const url = new URL(webRequest.url);
    if (url.protocol !== "https:") {
        throw new TypeError("CIMD Node transport requires an HTTPS URL");
    }
    if (webRequest.method !== "GET" && webRequest.method !== "HEAD") {
        throw new TypeError("CIMD Node transport supports only GET and HEAD");
    }

    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (addresses.length === 0) {
        throw new TypeError("metadata hostname returned no DNS addresses");
    }
    for (const address of addresses) {
        if (!isPublicRoutableAddress(address.address)) {
            throw new TypeError(
                "metadata hostname must resolve only to public-routable addresses",
            );
        }
    }

    const pinnedAddress = addresses[0];
    const headers = Object.fromEntries(webRequest.headers.entries());
    headers.host = url.host;
    const upstreamSignal =
        init?.signal ??
        (input instanceof Request ? input.signal : webRequest.signal);

    return new Promise<Response>((resolve, reject) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            controller.abort(new TypeError("CIMD metadata fetch timed out"));
        }, metadataTimeoutMs);
        timeout.unref();

        const abortFromUpstream = () =>
            controller.abort(upstreamSignal?.reason);
        if (upstreamSignal?.aborted) abortFromUpstream();
        else
            upstreamSignal?.addEventListener("abort", abortFromUpstream, {
                once: true,
            });

        let settled = false;
        const finish = (
            result: { response: Response } | { error: unknown },
        ) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            upstreamSignal?.removeEventListener("abort", abortFromUpstream);
            if ("response" in result) resolve(result.response);
            else reject(result.error);
        };

        const nodeRequest = request(
            url,
            {
                agent: false,
                headers,
                method: webRequest.method,
                servername:
                    isIP(url.hostname.replace(/^\[|\]$/g, "")) === 0
                        ? url.hostname
                        : undefined,
                signal: controller.signal,
                lookup: (_hostname, options, callback) => {
                    if (options.all) {
                        callback(null, [pinnedAddress]);
                        return;
                    }
                    callback(null, pinnedAddress.address, pinnedAddress.family);
                },
            },
            (response) => {
                const status = response.statusCode ?? 500;
                const responseHeaders = toResponseHeaders(response.headers);
                if (
                    webRequest.method === "HEAD" ||
                    bodyForbiddenResponseStatuses.has(status)
                ) {
                    response.resume();
                    finish({
                        response: new Response(null, {
                            headers: responseHeaders,
                            status,
                            statusText: response.statusMessage,
                        }),
                    });
                    return;
                }

                const chunks: Buffer[] = [];
                let bytes = 0;
                response.on("data", (chunk: Buffer | string) => {
                    const buffer = Buffer.isBuffer(chunk)
                        ? chunk
                        : Buffer.from(chunk);
                    bytes += buffer.byteLength;
                    if (bytes > maximumMetadataBytes) {
                        response.destroy(
                            new TypeError(
                                "CIMD metadata response is too large",
                            ),
                        );
                        return;
                    }
                    chunks.push(buffer);
                });
                response.once("error", (error) => finish({ error }));
                response.once("end", () =>
                    finish({
                        response: new Response(Buffer.concat(chunks), {
                            headers: responseHeaders,
                            status,
                            statusText: response.statusMessage,
                        }),
                    }),
                );
            },
        );
        nodeRequest.once("error", (error) => finish({ error }));
        nodeRequest.end();
    });
};

/**
 * VS Code and Claude advertise optional grants that FrontLit's OAuth provider
 * does not implement, although both use Authorization Code + PKCE here. Keep
 * these compatibility exceptions exact; every other CIMD document remains
 * subject to the provider's normal strict validation.
 */
export const fetchClientMetadataResource: ClientMetadataResourceFetch = async (
    input,
    init,
) => {
    const response = await fetchPinnedClientMetadataResource(input, init);
    const requestUrl = input instanceof Request ? input.url : String(input);
    const ignoredGrantTypes = ignoredGrantTypesByClientMetadataUrl.get(
        new URL(requestUrl).href,
    );
    if (!ignoredGrantTypes || response.status !== 200) return response;

    const metadata = (await response.json()) as {
        grant_types?: unknown;
        [key: string]: unknown;
    };
    if (!Array.isArray(metadata.grant_types)) return response;

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("content-length");
    return new Response(
        JSON.stringify({
            ...metadata,
            grant_types: metadata.grant_types.filter(
                (grantType) =>
                    typeof grantType !== "string" ||
                    !ignoredGrantTypes.has(grantType),
            ),
        }),
        {
            headers: responseHeaders,
            status: response.status,
            statusText: response.statusText,
        },
    );
};
