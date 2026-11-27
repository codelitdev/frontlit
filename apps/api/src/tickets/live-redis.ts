import { createClient } from "redis";
import { logger } from "../services/log";
import type { LiveBus } from "./live";

const CHANNEL = "frontlit:live";

/** A Redis pub/sub backplane so live events reach sockets held by other API
 * instances. Connects in the background and keeps reconnecting; publishing
 * never blocks or fails a request while Redis is down (local sockets still
 * get every event). */
export function createRedisLiveBus(url: string): LiveBus {
  let lastWarn = 0;
  const warn = (error: unknown) => {
    if (Date.now() - lastWarn < 30_000) return;
    lastWarn = Date.now();
    logger.warn(
      { error: String((error as { code?: string })?.code ?? error) },
      "Live backplane: Redis unavailable, other API instances miss live events",
    );
  };
  const options = {
    url,
    socket: {
      connectTimeout: 2000,
      reconnectStrategy: (retries: number) => Math.min(retries * 200, 5000),
    },
  };

  // Fail fast while disconnected instead of queueing stale signals.
  const publisher = createClient({ ...options, disableOfflineQueue: true });
  // A subscribed connection can't run other commands. It re-subscribes by
  // itself after a reconnect.
  const subscriber = createClient(options);
  publisher.on("error", warn);
  subscriber.on("error", warn);
  publisher.connect().catch(warn);
  // `connect` resolves once Redis is first reachable (it keeps retrying).
  const subscriberReady = subscriber.connect();

  return {
    publish(message) {
      if (!publisher.isReady) return;
      publisher.publish(CHANNEL, message).catch(warn);
    },
    subscribe(onMessage) {
      subscriberReady
        .then(() => subscriber.subscribe(CHANNEL, (message) => onMessage(message)))
        .catch(warn);
    },
  };
}
