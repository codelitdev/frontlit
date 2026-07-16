// Runs before each test file (see vitest.config.ts `setupFiles`).
// Modules under src/config and src/auth read these at import/call time, so
// they must exist before any app module loads.
process.env.BETTER_AUTH_SECRET ||= "test-auth-secret-at-least-32-bytes-long";
process.env.API_PUBLIC_URL ||= "http://localhost:4000";
process.env.WEB_CLIENT ||= "http://localhost:3001";
process.env.PROVISIONING_SECRET ||= "test-provisioning-secret";
process.env.NODE_ENV ||= "test";
