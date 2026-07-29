import { cookies } from "next/headers";
import { API_URL } from "./config";

type SessionResponse = { user?: unknown };

function hasUserSession(body: unknown): body is SessionResponse {
    return (
        typeof body === "object" &&
        body !== null &&
        "user" in body &&
        Boolean((body as SessionResponse).user)
    );
}

export async function hasServerSession(
    cookieHeaderOverride?: string,
): Promise<boolean> {
    const cookieHeader = cookieHeaderOverride ?? (await cookies()).toString();
    if (!cookieHeader) return false;

    try {
        const response = await fetch(`${API_URL}/api/auth/get-session`, {
            headers: { Cookie: cookieHeader },
            cache: "no-store",
        });
        if (!response.ok) return false;
        return hasUserSession(await response.json());
    } catch {
        // Authentication is an availability boundary: an unreachable API
        // must fail closed without turning a page render into a 500.
        return false;
    }
}
