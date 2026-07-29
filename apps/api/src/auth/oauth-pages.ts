import { createOAuthPagesRouter } from "@codelitdev/oauth-server-kit";
import { auth, oauthTeamSelectionAdapter, webClientUrl } from "./better-auth";

export default createOAuthPagesRouter({
    appName: "FrontLit",
    webClientUrl,
    auth,
    teamSelection: oauthTeamSelectionAdapter,
    defaultRedirectPath: "/",
});
