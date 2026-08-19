import { config as loadDotFile } from "dotenv";
loadDotFile();

import { logger } from "./services/log";
import { checkDatabaseConnection } from "./db/client";
import { createSuperAdminIfMissing } from "./bootstrap";
import { createApp } from "./app";
import { startOutboxWorker } from "./email/worker";
import { describeChatProvider } from "./ai/provider";
import { startAuthorizationMaintenance } from "./team/maintenance";
import { attachInboxLive } from "./tickets/live-server";
import { startInboxAiWorker } from "./inbox-ai/worker";
import { startDocumentIndexWorker } from "./documentation/worker";

const app = createApp();
const port = process.env.PORT || 4000;

checkConfig()
    .then(checkDatabaseConnection)
    .then(createSuperAdminIfMissing)
    .then(() => {
        const server = app.listen(port, () => {
            logger.info(`FrontLit API running at ${port}`);
            logger.info(describeChatProvider());
        });
        attachInboxLive(server);
        startOutboxWorker();
        startInboxAiWorker();
        startDocumentIndexWorker();
        startAuthorizationMaintenance();
    })
    .catch((err) => {
        logger.error({ error: err.message }, "Failed to start FrontLit API");
        process.exit(1);
    });

async function checkConfig() {
    if (!process.env.DB_CONNECTION_STRING) {
        throw new Error("DB_CONNECTION_STRING is not set");
    }
    const authSecret = process.env.BETTER_AUTH_SECRET;
    if (!authSecret || Buffer.byteLength(authSecret, "utf8") < 32) {
        throw new Error(
            "BETTER_AUTH_SECRET is required and must be at least 32 bytes (256 bits). " +
                "Generate one with: openssl rand -base64 48",
        );
    }
    if (!process.env.PROVISIONING_SECRET) {
        throw new Error("PROVISIONING_SECRET is not set");
    }
}
