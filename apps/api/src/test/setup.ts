import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

// Every test file gets independent real ledger storage; never use operator data.
const ledgerRoot = mkdtempSync(join(tmpdir(), "frontlit-test-ledger-"));
process.env.DOCS_DELETION_LEDGER_DIR = ledgerRoot;
afterAll(() => rmSync(ledgerRoot, { recursive: true, force: true }));

// Runs before each test file (see vitest.config.ts `setupFiles`).
// Modules under src/config and src/auth read these at import/call time, so
// they must exist before any app module loads.
process.env.BETTER_AUTH_SECRET ||= "test-auth-secret-at-least-32-bytes-long";
process.env.API_PUBLIC_URL ||= "http://localhost:4000";
process.env.WEB_CLIENT ||= "http://localhost:3001";
process.env.PROVISIONING_SECRET ||= "test-provisioning-secret";
process.env.NODE_ENV ||= "test";
