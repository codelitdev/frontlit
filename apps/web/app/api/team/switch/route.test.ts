import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/server-session", () => ({
    hasServerSession: vi.fn().mockResolvedValue(true),
}));

import { POST } from "./route";

describe("POST /api/team/switch", () => {
    it("uses a GET redirect after the form POST", async () => {
        const form = new FormData();
        form.set("teamId", "team_new");
        form.set("redirectTo", "/teams");
        const request = new NextRequest("http://localhost:3000/api/team/switch", {
            method: "POST",
            body: form,
        });

        const response = await POST(request);

        expect(response.status).toBe(303);
        expect(response.headers.get("location")).toBe("http://localhost:3000/teams");
        expect(response.cookies.get("frontlit_team_id")?.value).toBe("team_new");
    });
});
