import { createOAuthPagesRouter } from "@codelitdev/oauth-server-kit";
import { webClientUrl } from "./better-auth";

export default createOAuthPagesRouter({ appName: "FrontLit", webClientUrl });
