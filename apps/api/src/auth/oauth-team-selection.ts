import { ensureFrontLitAccountForBetterAuthUserId } from "../account/queries";
import {
    getOAuthTeamSelection,
    listTeamsForAccount,
    setOAuthTeamSelection,
} from "../team/queries";

export type FrontLitOAuthTeam = {
    id: string;
    publicId: string;
    name: string;
};

export interface FrontLitOAuthTeamSelectionAdapter {
    listTeamsForUser(userId: string): Promise<FrontLitOAuthTeam[]>;
    getSelectedTeamId(sessionId: string): Promise<string | null>;
    setSelectedTeamId(sessionId: string, teamId: string): Promise<void>;
}

export const oauthTeamSelectionAdapter: FrontLitOAuthTeamSelectionAdapter = {
    async listTeamsForUser(userId) {
        const account = await ensureFrontLitAccountForBetterAuthUserId(userId);
        if (!account) return [];
        const teams = await listTeamsForAccount(account.id);
        return teams.map((team) => ({
            id: team.id,
            publicId: team.teamId,
            name: team.name,
        }));
    },
    getSelectedTeamId: getOAuthTeamSelection,
    setSelectedTeamId: setOAuthTeamSelection,
};

async function resolveSelection(
    adapter: FrontLitOAuthTeamSelectionAdapter,
    userId: string,
    sessionId: string,
) {
    const teams = await adapter.listTeamsForUser(userId);
    if (teams.length === 0) {
        // Stop before consent/token issuance so generic MCP clients do not hide
        // a later `409 no_team` behind a vague connection failure.
        return { requiresSelection: true, selectedTeamId: null };
    }
    if (teams.length === 1) {
        // A single-team user does not need an interaction, but the selected
        // tenant must still be bound to consent and the issued access token.
        return { requiresSelection: false, selectedTeamId: teams[0].id };
    }
    const selectedTeamId = await adapter.getSelectedTeamId(sessionId);
    const valid =
        selectedTeamId !== null &&
        teams.some((team) => team.id === selectedTeamId);
    return {
        requiresSelection: !valid,
        selectedTeamId: valid ? selectedTeamId : null,
    };
}

/** FrontLit-owned OAuth tenant selection and custom token claim. */
export function createFrontLitOAuthTeamSelectionHooks(options: {
    page: string;
    adapter: FrontLitOAuthTeamSelectionAdapter;
}) {
    return {
        postLogin: {
            page: options.page,
            async shouldRedirect(input: {
                user: { id: string };
                session: { id: string };
            }) {
                return (
                    await resolveSelection(
                        options.adapter,
                        input.user.id,
                        input.session.id,
                    )
                ).requiresSelection;
            },
            async consentReferenceId(input: {
                user: { id: string };
                session: { id: string };
            }) {
                return (
                    (
                        await resolveSelection(
                            options.adapter,
                            input.user.id,
                            input.session.id,
                        )
                    ).selectedTeamId ?? undefined
                );
            },
        },
        async customAccessTokenClaims(input: { referenceId?: string | null }) {
            return input.referenceId ? { team_id: input.referenceId } : {};
        },
    };
}
