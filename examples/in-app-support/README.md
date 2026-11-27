# In-app support example

A tiny "host app" that embeds the FrontLit chat the way a customer's product
would: its server mints a support session with an API key, and its
**Contact support** button opens the chat with that session. Use it to try or
debug in-app support locally without a real product.

See [Add in-app support to your product](../../frontlit/docs/developers/in-app-support.md)
for the integration guide and [docs/embedded-support.md](../../docs/embedded-support.md)
for the design.

## Run it

1. Start the API, web app and sites app (`bun run dev` at the repo root).
2. In the web app, turn on the chatbot for your team (**Settings → Chatbot**).
3. On the **Account** page, open **Manage API keys**, choose
   **Support sessions only**, and create a key.
4. Start the example:

   ```bash
   FRONTLIT_API_KEY=fl_live_... \
   FRONTLIT_TEAM_ID=team_... \
   bun run --filter @frontlit/in-app-support-example dev
   ```

5. Open http://localhost:3299, edit the signed-in user if you like, and click
   **Contact support**. Watch the ticket arrive in the web app's inbox with the
   user ID, account and context.

| Variable | Default | |
| --- | --- | --- |
| `FRONTLIT_API_KEY` | (required) | A **Support sessions only** API key. |
| `FRONTLIT_TEAM_ID` | (required) | Your team ID (`team_...`), shown on the Account page. |
| `FRONTLIT_API_URL` | `http://localhost:4000` | The FrontLit API. |
| `FRONTLIT_EMBED_URL` | `http://embed.localhost:3002` | The embed host (`EMBED_ORIGIN` in apps/sites). |
| `PORT` | `3299` | Port for this example. |

## What to try

- **New user:** change the user ID and email; the chat opens blank with the
  prefilled message, and the ticket is created on the first message.
- **Returning user:** click Contact support again (or reload); the open
  conversation comes back. Nothing is stored in the browser.
- **Agent reply:** answer from the inbox; the reply shows up in the open chat.
