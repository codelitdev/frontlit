---
title: Add in-app support to your product
description: Embed the FrontLit chat in your app so signed-in users reach support with who they are and what went wrong attached.
nav_order: 35
---

Put FrontLit's chat inside your own product. When a signed-in user clicks
**Contact support**, the conversation reaches your FrontLit inbox already
knowing who they are, which account they belong to, and what just failed. No
one has to ask "which school are you from?".

It takes three pieces:

1. A small route on **your server** that starts a support session.
2. The chat snippet in **your frontend**.
3. A button that opens the chat with the session.

The chatbot must be turned on for your team (**Settings → Chatbot**).

## 1. Create a support sessions API key

On the **Teams** page, open **Manage API keys** for your team, pick
**Support sessions only**, and create the key. This key can only start
support sessions. It can't read or change your inbox, so a leak can't expose
your tickets.

Keep the key on your server. Never put it in browser code.

## 2. Start a session from your server

When the user asks for help, call `POST /support-sessions` from your backend.
You already know who is signed in and what they were doing, so you send it:

```ts
// e.g. POST /api/support-session in your app
const response = await fetch("https://api.frontlit.app/support-sessions", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-frontlit-apikey": process.env.FRONTLIT_SUPPORT_KEY,
  },
  body: JSON.stringify({
    contact: {
      email: user.email,
      name: user.name,
      externalId: user.id, // your user ID
    },
    account: {
      id: school.id, // the customer account the user belongs to
      name: school.name,
      url: school.url,
    },
    context: {
      page: "/dashboard/media",
      error: "Image upload failed: 413",
      requestId: "req_42",
    },
    message: "My image upload failed", // optional, prefilled in the chat
  }),
});
const { token } = await response.json(); // hand this to the browser
```

| Field | Required | What it's for |
| --- | --- | --- |
| `contact.email` | yes | Who to reply to. Also used to find their earlier chats. |
| `contact.name` | no | Shown in the inbox and greets the user. |
| `contact.externalId` | no | Your user ID. Shown on the ticket and searchable in the inbox. |
| `account` | no | The customer account (`id`, `name`, `url`), e.g. a school or workspace. |
| `context` | no | Anything that helps support: page, error, request ID, app version. Up to 8 KB of JSON. |
| `message` | no | Prefills the chat box. The user still decides to send it. |

The response is `{ token, url, expiresAt }`. The token is valid for about an
hour. Starting a session creates nothing in your inbox. A ticket appears only
when the user sends a message.

## 3. Add the chat snippet

Add this to every page of your app, once:

```html
<script>
  window.FrontLit = window.FrontLit || { q: [], push(...a) { this.q.push(a); } };
  FrontLit.push("init", { teamId: "team_...", launcher: false });
</script>
<script async src="https://embed.frontlit.app/chat.js"></script>
```

Your team ID is on the **Teams** page. `launcher: false` hides the floating
chat bubble, because your own button opens the chat. Leave it out to show the
bubble as well.

The loader is about 2 KB and loads nothing else until the chat is opened.

## 4. Open the chat from your button

```ts
async function contactSupport() {
  const { token } = await fetch("/api/support-session", { method: "POST" }).then(
    (r) => r.json(),
  );
  FrontLit.open({ token });
}
```

Start a fresh session on every click. If the user already has an open chat,
they see it again instead of a new one.

`FrontLit.close()` closes the chat. Calls made before the loader has finished
loading are queued and run in order.

A runnable version of all three pieces is in the FrontLit repository at
`examples/in-app-support`.

## What your team sees

The ticket shows the user's name and email, your user ID, their account (with
a link), and every `context` field. Search the inbox by your user ID to find
all of a user's chats. If SendLit is connected, the contact is created or
updated there with `externalId`, `accountId`, `accountName` and `accountUrl`
custom fields and the `source:in-app` tag.

## Privacy

- Session chats are never stored in the browser. Someone who uses the same
  computer later can't see them.
- Identity and context come only from your server, so a user can't pretend to
  be someone else.
- `context` is treated as data. It is shown to your team as plain text.
