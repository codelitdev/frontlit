import type { AddressInfo } from "node:net";
import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./better-auth", () => ({
  webClientUrl: "http://localhost:3000",
  authBasePath: "/api/auth",
  hostedLoginMethods: [{ type: "email-otp" }],
}));
vi.mock("better-auth/node", () => ({
  fromNodeHeaders: (headers: unknown) => headers,
}));

import oauthPagesRoutes from "./oauth-pages.js";

describe("FrontLit OAuth pages", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(oauthPagesRoutes);
    app.use(
      (
        error: Error,
        _request: express.Request,
        response: express.Response,
        _next: express.NextFunction,
      ) => response.status(503).json({ error: error.message }),
    );
  });

  async function request(path: string, init: RequestInit = {}) {
    const server = app.listen(0, "127.0.0.1");
    try {
      await new Promise<void>((resolve) => server.once("listening", resolve));
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        redirect: "manual",
        ...init,
      });
      const body = await response.text();
      return {
        status: response.status,
        headers: response.headers,
        body,
        json: () => JSON.parse(body),
      };
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }

  it("mounts the shared hosted login with FrontLit configuration", async () => {
    const response = await request("/login?redirect=http://localhost:3000/pages/foo");
    expect(response.status).toBe(200);
    expect(response.body).toContain("Sign in to FrontLit");
    expect(response.body).toContain('var authBasePath="/api/auth"');
    expect(response.body).toContain("http://localhost:3000/pages/foo");
    expect(response.body).not.toContain("Continue with Google");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });

  it("brands the hosted login with the FrontLit logo, favicon, and color", async () => {
    const response = await request("/login?redirect=http://localhost:3000/pages/foo");
    expect(response.body).toContain('src="http://localhost:3000/icon.svg"');
    expect(response.body).toContain('href="http://localhost:3000/icon.svg"');
    expect(response.body).toContain("html{--brand-primary:oklch(0.47 0.14 230)}");
  });

  it("no longer serves an OAuth team picker", async () => {
    const response = await request("/oauth/select-team?client_id=abc");
    expect(response.status).toBe(404);
  });
});
