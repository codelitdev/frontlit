import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

interface Shared {
  client?: RedisClient | null;
  subscriber?: RedisClient | null;
}

// Next bundles the proxy and each route separately; one connection per
// process is shared through globalThis.
const shared = ((globalThis as { __frontlitRedis?: Shared }).__frontlitRedis ??= {});

/** Connects in the background (and keeps reconnecting); never blocks a
 * request on Redis. */
function connect(): RedisClient | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const client = createClient({
    url,
    // Fail fast while disconnected instead of queueing: callers fall back.
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 2000,
      reconnectStrategy: (retries) => Math.min(retries * 200, 5000),
    },
  });
  let lastLog = 0;
  client.on("error", (error) => {
    if (Date.now() - lastLog < 30_000) return;
    lastLog = Date.now();
    console.warn(
      "[sites] Redis unavailable, using memory:",
      String(error?.code ?? error),
    );
  });
  client.connect().catch(() => {});
  return client;
}

/** The shared Redis connection, or null when `REDIS_URL` is unset or Redis
 * is unreachable. Callers fall back to per-process memory. */
export function getRedis(): RedisClient | null {
  const client = (shared.client ??= connect());
  return client?.isReady ? client : null;
}

/** A dedicated connection for SUBSCRIBE (a subscribed client can't run
 * other commands). */
export function getRedisSubscriber(): RedisClient | null {
  return (shared.subscriber ??= connect());
}
