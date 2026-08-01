import { describe, expect, it, vi } from "vitest";
import {
    createFrontLitOAuthTeamSelectionHooks,
    type FrontLitOAuthTeamSelectionAdapter,
} from "./oauth-team-selection.js";

function adapter(overrides: Partial<FrontLitOAuthTeamSelectionAdapter> = {}) {
    return {
        listTeamsForUser: vi.fn(async () => []),
        getSelectedTeamId: vi.fn(async () => null),
        setSelectedTeamId: vi.fn(async () => {}),
        ...overrides,
    };
}

const input = { user: { id: "user-1" }, session: { id: "session-1" } };

describe("FrontLit-owned OAuth team selection", () => {
    it("does not interrupt users with zero or one team", async () => {
        for (const teams of [
            [],
            [{ id: "internal-a", publicId: "team_a", name: "A" }],
        ]) {
            const hooks = createFrontLitOAuthTeamSelectionHooks({
                page: "https://frontlit.test/oauth/select-team",
                adapter: adapter({
                    listTeamsForUser: vi.fn(async () => teams),
                }),
            });
            await expect(hooks.postLogin.shouldRedirect(input)).resolves.toBe(
                false,
            );
            await expect(
                hooks.postLogin.consentReferenceId(input),
            ).resolves.toBeUndefined();
        }
    });

    it("requires a valid selection for multi-team users", async () => {
        const teams = [
            { id: "internal-a", publicId: "team_a", name: "A" },
            { id: "internal-b", publicId: "team_b", name: "B" },
        ];
        const selection = adapter({
            listTeamsForUser: vi.fn(async () => teams),
            getSelectedTeamId: vi.fn(async () => "removed-team"),
        });
        const hooks = createFrontLitOAuthTeamSelectionHooks({
            page: "https://frontlit.test/oauth/select-team",
            adapter: selection,
        });
        expect(hooks.postLogin.page).toBe(
            "https://frontlit.test/oauth/select-team",
        );
        await expect(hooks.postLogin.shouldRedirect(input)).resolves.toBe(true);
        await expect(
            hooks.postLogin.consentReferenceId(input),
        ).resolves.toBeUndefined();

        vi.mocked(selection.getSelectedTeamId).mockResolvedValue("internal-b");
        await expect(hooks.postLogin.shouldRedirect(input)).resolves.toBe(
            false,
        );
        await expect(hooks.postLogin.consentReferenceId(input)).resolves.toBe(
            "internal-b",
        );
    });

    it("adds only the FrontLit-owned team claim when selected", async () => {
        const hooks = createFrontLitOAuthTeamSelectionHooks({
            page: "https://frontlit.test/oauth/select-team",
            adapter: adapter(),
        });
        await expect(
            hooks.customAccessTokenClaims({ referenceId: "internal-a" }),
        ).resolves.toEqual({ team_id: "internal-a" });
        await expect(hooks.customAccessTokenClaims({})).resolves.toEqual({});
    });
});
