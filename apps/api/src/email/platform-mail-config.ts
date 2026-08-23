import { logger } from "../services/log";

export type PlatformMailMode = "console" | "sendlit";

export type PlatformMailConfig = {
    mode: PlatformMailMode;
    apiUrl: string | undefined;
    platformTeamApiKey: string | undefined;
    requestTimeoutMs: number;
};

function parseTimeoutMs(raw: string | undefined): number {
    if (raw === undefined || raw === "") return 5000;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(
            "SENDLIT_PLATFORM_REQUEST_TIMEOUT_MS must be a positive integer",
        );
    }
    return value;
}

export function getPlatformMailConfig(): PlatformMailConfig {
    const platformTeamApiKey =
        process.env.SENDLIT_PLATFORM_TEAM_API_KEY || undefined;
    return {
        mode: platformTeamApiKey ? "sendlit" : "console",
        apiUrl: process.env.SENDLIT_API_URL || undefined,
        platformTeamApiKey,
        requestTimeoutMs: parseTimeoutMs(
            process.env.SENDLIT_PLATFORM_REQUEST_TIMEOUT_MS,
        ),
    };
}

/** Validates the timeout and URL needed when a platform key is configured. */
export function assertPlatformMailConfig(): PlatformMailConfig {
    const config = getPlatformMailConfig();
    if (config.mode === "console") {
        if (process.env.NODE_ENV === "production") {
            logger.warn(
                "SENDLIT_PLATFORM_TEAM_API_KEY is unset in production; platform emails, OTPs, and invitation URLs are written to process logs",
            );
        }
        return config;
    }

    if (!config.apiUrl) {
        throw new Error(
            "SENDLIT_API_URL is required when SENDLIT_PLATFORM_TEAM_API_KEY is set",
        );
    }
    return config;
}
