# In-app support example

A fake SaaS dashboard, "Acme Academy", that embeds the FrontLit chat the way
a customer's product would. Its server mints a support session with an API
key, and its **Help** and **Contact support** buttons open the chat with that
session. Use it to try or debug in-app support without a real product.

See [Add in-app support to your product](../../frontlit/docs/developers/in-app-support.md)
for the integration guide and [docs/embedded-support.md](../../docs/embedded-support.md)
for the design.

## Run it

1. Start the API, web app and sites app (`bun run dev` at the repo root).
2. In the web app, turn on the chatbot for your team (**Website → Chatbot**).
3. On the **Account** page, open **Manage API keys**, choose
   **Support sessions only**, and create a key.
4. Start the example:

   ```bash
   FRONTLIT_API_KEY=fl_live_... \
   FRONTLIT_TEAM_ID=team_... \
   bun run --filter @frontlit/in-app-support-example dev
   ```

5. Open http://localhost:3299.

| Variable | Default | |
| --- | --- | --- |
| `FRONTLIT_API_KEY` | (required) | A **Support sessions only** API key. |
| `FRONTLIT_TEAM_ID` | (required) | Your team ID (`team_...`), shown on the Account page. |
| `FRONTLIT_API_URL` | `http://localhost:4000` | The FrontLit API. |
| `FRONTLIT_EMBED_URL` | `http://embed.localhost:3002` | The embed host (`EMBED_ORIGIN` in apps/sites). |
| `PORT` | `3299` | Port for this example. |

### Against QA

The same app works against QA. Create the key on QA, then:

```bash
FRONTLIT_API_KEY=fl_live_... \
FRONTLIT_TEAM_ID=team_... \
FRONTLIT_API_URL=https://api.frontlit.cluster.clqa.site \
FRONTLIT_EMBED_URL=https://embed.frontlit.cluster.clqa.site \
bun run --filter @frontlit/in-app-support-example dev
```

## What's on the page

- **User picker** (top right): three preset users, each in a different
  account. Switching user closes the chat, like logging out. Open
  **Signed-in user and test settings** to edit any field.
- **Sidebar pages:** the current page goes to FrontLit as `context.page`.
- **Trigger random error:** shows one of five product errors with a request
  ID. The banner's **Contact support** sends the error as `context.error`
  and prefills a message in the user's words.
- **Help** (header) and **Contact support** (sidebar): start a chat with no
  error attached. The Help button shows the unread reply count
  (`onUnreadCountChange`).
- **Show FrontLit's chat bubble too:** reloads with `launcher: true`, to test
  the bubble next to your own buttons.

## What to try

- **Error the docs don't explain:** trigger an error, then Contact support and
  send. With AI auto-reply on, the AI hands the chat to your team straight
  away, with the reason "The app reported an error the docs don't explain".
- **Error the docs do explain:** publish a doc page on your team that covers
  one of the errors (for example, "Payment declined: card_expired means the
  card on file has expired; update it under Billing"). The AI answers from it
  instead of handing off.
- **Plain question:** click Help and ask something. It's an ordinary chat.
- **Returning user:** click Help again or reload; the open conversation comes
  back. Nothing is stored in the browser.
- **Different users:** switch user; each gets their own chats, and the inbox
  shows their user ID and account.
- **Agent reply:** answer from the inbox; the reply shows up in the open chat,
  or as an unread count on Help when the chat is closed.
- **Phone:** open the page on a phone (or a narrow window); the chat opens
  full screen.
