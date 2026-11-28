"use client";

import { deletePushSubscription, getPushConfig, savePushSubscription } from "./api";

/** Web Push for support agents: this browser's subscription to new customer
 * message alerts, shown by `public/sw.js` even with no FrontLit tab open. */

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** iPhone/iPad Safari only allows push once FrontLit is on the Home Screen. */
export function needsHomeScreenInstall(): boolean {
  if (typeof window === "undefined") return false;
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac with touch.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !installed;
}

export function registerServiceWorker() {
  return navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
}

let publicKeyRequest: Promise<string | null> | null = null;

/** The server's VAPID key, fetched once per page load. */
export function pushPublicKey(): Promise<string | null> {
  publicKeyRequest ??= getPushConfig()
    .then((config) => config.publicKey)
    .catch(() => {
      publicKeyRequest = null;
      return null;
    });
  return publicKeyRequest;
}

export async function currentPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

function toBody(subscription: PushSubscription) {
  const json = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
  };
}

/** Whether a subscription was made with this VAPID public key. Push
 * services reject sends signed with any other key, so a subscription from
 * before a key change is dead. Unknown (no key exposed) counts as a match. */
function madeWithKey(subscription: PushSubscription, publicKey: string): boolean {
  const current = subscription.options?.applicationServerKey;
  if (!current) return true;
  const expected = urlBase64ToUint8Array(publicKey);
  const actual = new Uint8Array(current);
  return (
    actual.length === expected.length && actual.every((byte, i) => byte === expected[i])
  );
}

/** This browser's subscription for `publicKey`: the existing one, or a new
 * one replacing a subscription made with an older key. */
async function subscriptionFor(publicKey: string): Promise<PushSubscription> {
  await registerServiceWorker();
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing && madeWithKey(existing, publicKey)) return existing;
  if (existing) {
    await deletePushSubscription(existing.endpoint).catch(() => undefined);
    await existing.unsubscribe();
  }
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
}

/** Asks for permission, subscribes this browser and saves it for the signed
 * in account. Returns false when permission was not granted. */
export async function turnOnPush(publicKey: string): Promise<boolean> {
  const permission =
    Notification.permission === "default"
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== "granted") return false;
  await savePushSubscription(toBody(await subscriptionFor(publicKey)));
  return true;
}

/** Stops push on this browser and forgets it on the server. */
export async function turnOffPush(): Promise<void> {
  const subscription = await currentPushSubscription();
  if (!subscription) return;
  await deletePushSubscription(subscription.endpoint).catch(() => undefined);
  await subscription.unsubscribe();
}

/** Re-saves this browser's subscription on page load, so the server knows
 * it now belongs to whoever is signed in. If the server's key changed since
 * it subscribed, it subscribes again with the new key, so a key rotation
 * needs nothing from the user. */
export async function syncPushSubscription(publicKey: string): Promise<boolean> {
  const subscription = await currentPushSubscription();
  if (!subscription || Notification.permission !== "granted") return false;
  await savePushSubscription(toBody(await subscriptionFor(publicKey)));
  return true;
}
