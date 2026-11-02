import { AsyncLocalStorage } from "node:async_hooks";

/** The OAuth client acting on the current request, so authorization audit
 * events can name the app. OAuth tokens are account-wide and reach teams the
 * user joins later; team owners need to see which app acted. */
const storage = new AsyncLocalStorage<{ oauthClientId: string }>();

export function runWithOAuthClient<T>(oauthClientId: string, fn: () => T): T {
  return storage.run({ oauthClientId }, fn);
}

export function currentOAuthClientId(): string | undefined {
  return storage.getStore()?.oauthClientId;
}
