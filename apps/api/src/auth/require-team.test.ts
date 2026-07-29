import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireTeam } from "./require-team";

const mocks = vi.hoisted(() => ({
    getTeamByTeamId: vi.fn(),
    getTeamMembership: vi.fn(),
    listTeamsForAccount: vi.fn(),
}));

vi.mock("../team/queries", () => mocks);

function response() {
    return {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
    };
}

describe("requireTeam", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getTeamByTeamId.mockImplementation(async (teamId: string) => ({
            id: `internal-${teamId}`,
            teamId,
        }));
    });

    it("passes through fixed API-key and OAuth-claim teams", async () => {
        const next = vi.fn();
        await requireTeam(
            { teamId: "team-internal-1", headers: {} } as any,
            response() as any,
            next,
        );
        expect(next).toHaveBeenCalledOnce();
        expect(mocks.listTeamsForAccount).not.toHaveBeenCalled();
    });

    it("translates a public team header and validates membership", async () => {
        mocks.getTeamMembership.mockResolvedValue({ role: "owner" });
        const req = {
            accountId: "account-1",
            headers: { "x-frontlit-team-id": "team_public_1" },
        } as any;
        const next = vi.fn();
        await requireTeam(req, response() as any, next);

        expect(req.teamId).toBe("internal-team_public_1");
        expect(mocks.getTeamMembership).toHaveBeenCalledWith(
            "internal-team_public_1",
            "account-1",
        );
        expect(next).toHaveBeenCalledOnce();
    });

    it("auto-selects one team and requires an explicit choice for many", async () => {
        mocks.listTeamsForAccount.mockResolvedValueOnce([
            { id: "team-internal-1", teamId: "team_public_1", name: "Solo" },
        ]);
        const req = { accountId: "account-1", headers: {} } as any;
        const next = vi.fn();
        await requireTeam(req, response() as any, next);
        expect(req.teamId).toBe("team-internal-1");
        expect(next).toHaveBeenCalledOnce();

        mocks.listTeamsForAccount.mockResolvedValueOnce([
            { id: "one", teamId: "team_one", name: "One" },
            { id: "two", teamId: "team_two", name: "Two" },
        ]);
        const res = response();
        await requireTeam(
            { accountId: "account-1", headers: {} } as any,
            res as any,
            vi.fn(),
        );
        expect(res.status).toHaveBeenCalledWith(409);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                error: "team_required",
                teams: [
                    { teamId: "team_one", name: "One" },
                    { teamId: "team_two", name: "Two" },
                ],
            }),
        );
    });
});
