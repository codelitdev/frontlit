import { getSendlitApiKey } from "../integrations/queries";
import { SendlitApiError } from "./sendlit-client";

const NOT_CONNECTED = {
    status: 409 as const,
    body: { error: "SendLit is not connected for this team yet" },
};

/** Runs a team-scoped SendLit request without ever exposing the stored
 * SendLit API key to the browser, REST consumer, or MCP client. */
export async function withSendlitKey<T>(
    teamId: string,
    fn: (apiKey: string) => Promise<T>,
): Promise<{ status: number; body: unknown }> {
    const apiKey = await getSendlitApiKey(teamId);
    if (!apiKey) return NOT_CONNECTED;
    try {
        return { status: 200, body: await fn(apiKey) };
    } catch (err) {
        if (err instanceof SendlitApiError && err.status) {
            return { status: err.status, body: { error: err.message } };
        }
        throw err;
    }
}
