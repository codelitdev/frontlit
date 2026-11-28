// FrontLit service worker: shows Web Push notifications for new customer
// messages (sent by the API, see apps/api/src/push/send.ts) and opens the
// ticket when one is clicked. It does no caching.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  event.waitUntil(showPush(event));
});

async function showPush(event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  // Always show it. Safari cancels the subscription of a worker that gets
  // pushes without showing them, and an iPhone Home Screen app can report
  // itself focused while it is in the background.
  await self.registration.showNotification(data.title || "New message", {
    body: data.body || "",
    tag: data.tag || undefined,
    data: { url: data.url || "/" },
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(openUrl(url));
});

async function openUrl(url) {
  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  const existing = windows.find(
    (client) => new URL(client.url).origin === self.location.origin,
  );
  if (existing) {
    await existing.focus();
    // navigate() only works on pages this worker controls.
    const navigated = await existing.navigate(url).catch(() => null);
    if (navigated) return;
  }
  await self.clients.openWindow(url);
}
