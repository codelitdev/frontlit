// @ts-check
/**
 * `"use cache"` handler for apps/sites (docs/site-delivery.md §4.1).
 *
 * Without `REDIS_URL` this is Next's default in-memory handler: one
 * container needs nothing else.
 *
 * With `REDIS_URL`, every replica shares one cache:
 * - Entries are kept in this process's memory and in Redis. A miss in
 *   memory reads Redis before the data is fetched again.
 * - A tag invalidation (`revalidateTag` on whichever replica received the
 *   webhook) is stored in Redis and published. Every replica applies it to
 *   Next's process-wide tag manifest as soon as the message arrives. That
 *   manifest is also what full-page (ISR) cache hits are checked against,
 *   so cached pages refresh everywhere without waiting for a render.
 *   `refreshTags()` re-reads Redis about once a second in case a message
 *   was missed (a reconnect, for example).
 *
 * Redis failures never fail a request: reads fall back to memory and
 * writes are skipped.
 */
const { createClient } = require("redis");
const {
  createDefaultCacheHandler,
} = require("next/dist/server/lib/cache-handlers/default");
const {
  tagsManifest,
  areTagsExpired,
  areTagsStale,
} = require("next/dist/server/lib/incremental-cache/tags-manifest.external");

/** @typedef {import("next/dist/server/lib/cache-handlers/types").CacheHandler} CacheHandler */
/** @typedef {import("next/dist/server/lib/cache-handlers/types").CacheEntry} CacheEntry */

const ENTRY_PREFIX = "fl:cache:";
const TAGS_HASH = "fl:tags";
const TAGS_BY_TIME = "fl:tags:by-time";
const TAGS_CHANNEL = "fl:tags";
const POLL_MS = 1000;
const COMMAND_TIMEOUT_MS = 500;

/** @param {Uint8Array} bytes */
function streamOf(bytes) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/** @param {ReadableStream<Uint8Array>} stream */
async function bytesOf(stream) {
  const chunks = [];
  const reader = stream.getReader();
  for (let chunk; !(chunk = await reader.read()).done; ) chunks.push(chunk.value);
  return Buffer.concat(chunks);
}

/** @template T @param {Promise<T>} promise @returns {Promise<T>} */
function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Redis timeout")), COMMAND_TIMEOUT_MS),
    ),
  ]);
}

/** Applies a tag invalidation seen on another replica to this process.
 * @param {string} tag @param {{ stale?: number; expired?: number }} update */
function applyTag(tag, update) {
  const current = tagsManifest.get(tag) ?? {};
  const next = { ...current };
  if (update.stale !== undefined && update.stale > (current.stale ?? 0))
    next.stale = update.stale;
  if (update.expired !== undefined && update.expired > (current.expired ?? 0))
    next.expired = update.expired;
  if (next.stale !== current.stale || next.expired !== current.expired)
    tagsManifest.set(tag, next);
}

/** @param {string} url @returns {CacheHandler} */
function createRedisCacheHandler(url) {
  const local = createDefaultCacheHandler(50 * 1024 * 1024);
  const options = {
    url,
    // Fail fast while disconnected instead of queueing commands.
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 2000,
      /** @param {number} retries */
      reconnectStrategy: (retries) => Math.min(retries * 200, 5000),
    },
  };
  const client = createClient(options);
  const subscriber = createClient(options);
  let lastLog = 0;
  for (const connection of [client, subscriber]) {
    connection.on("error", (error) => {
      if (Date.now() - lastLog < 30_000) return;
      lastLog = Date.now();
      console.warn("[sites] Redis cache unavailable, using memory:", String(error?.code ?? error));
    });
  }
  let lastSync = 0;
  let lastPoll = 0;

  /** Reads invalidations recorded since the last sync. */
  async function sync() {
    const since = lastSync;
    const tags = await withTimeout(client.zRangeByScore(TAGS_BY_TIME, since, "+inf"));
    lastSync = Date.now() - 5000; // overlap a little: clocks and races
    if (!tags.length) return;
    const values = await withTimeout(client.hmGet(TAGS_HASH, tags));
    tags.forEach((tag, index) => {
      const value = values[index];
      if (value) applyTag(tag, JSON.parse(value));
    });
  }

  // Connect (and keep reconnecting) in the background: a request never
  // waits for Redis. After every (re)connect, catch up on invalidations
  // that were published while this process wasn't listening.
  client.on("ready", () => {
    sync().catch(() => {});
  });
  subscriber.on("ready", () => {
    sync().catch(() => {});
  });
  client.connect().catch(() => {});
  subscriber
    .connect()
    .then(() =>
      subscriber.subscribe(TAGS_CHANNEL, (message) => {
        const { tags } = JSON.parse(message);
        for (const [tag, update] of Object.entries(tags)) applyTag(tag, update);
      }),
    )
    .catch(() => {});

  const usable = () => client.isReady;

  return {
    async get(cacheKey, softTags) {
      const hit = await local.get(cacheKey, softTags);
      if (hit || !usable()) return hit;
      let raw;
      try {
        raw = await withTimeout(client.get(ENTRY_PREFIX + cacheKey));
      } catch {
        return undefined;
      }
      if (!raw) return undefined;
      const stored = JSON.parse(raw);
      const now = performance.timeOrigin + performance.now();
      if (now > stored.timestamp + stored.revalidate * 1000) return undefined;
      if (areTagsExpired(stored.tags, stored.timestamp)) return undefined;
      const bytes = Buffer.from(stored.value, "base64");
      /** @type {CacheEntry} */
      const entry = { ...stored, value: streamOf(bytes) };
      await local.set(cacheKey, Promise.resolve({ ...stored, value: streamOf(bytes) }));
      if (areTagsStale(stored.tags, stored.timestamp)) entry.revalidate = -1;
      return entry;
    },

    async set(cacheKey, pendingEntry) {
      const entry = await pendingEntry;
      const [forLocal, forRedis] = entry.value.tee();
      await local.set(cacheKey, Promise.resolve({ ...entry, value: forLocal }));
      // `expire: 0` is uncacheable (see Next's default handler).
      if (entry.expire === 0 || !usable()) {
        await bytesOf(forRedis).catch(() => {});
        return;
      }
      try {
        const value = (await bytesOf(forRedis)).toString("base64");
        await withTimeout(
          client.set(ENTRY_PREFIX + cacheKey, JSON.stringify({ ...entry, value }), {
            EX: Math.max(1, Math.ceil(entry.expire)),
          }),
        );
      } catch {
        // The entry stays in memory; another replica just misses it.
      }
    },

    async refreshTags() {
      if (Date.now() - lastPoll < POLL_MS || !usable()) return;
      lastPoll = Date.now();
      await sync().catch(() => {});
    },

    getExpiration(tags) {
      return local.getExpiration(tags);
    },

    async updateTags(tags, durations) {
      await local.updateTags(tags, durations);
      if (!usable()) return;
      /** @type {Record<string, { stale?: number; expired?: number }>} */
      const updates = {};
      for (const tag of tags) {
        const { stale, expired } = tagsManifest.get(tag) ?? {};
        updates[tag] = { stale, expired };
      }
      try {
        const now = Date.now();
        await withTimeout(
          client
            .multi()
            .hSet(
              TAGS_HASH,
              Object.fromEntries(
                Object.entries(updates).map(([tag, value]) => [tag, JSON.stringify(value)]),
              ),
            )
            .zAdd(
              TAGS_BY_TIME,
              tags.map((tag) => ({ score: now, value: tag })),
            )
            // Entries live at most 30 days, so older invalidations are moot.
            .zRemRangeByScore(TAGS_BY_TIME, 0, now - 31 * 86_400_000)
            .publish(TAGS_CHANNEL, JSON.stringify({ tags: updates }))
            .exec(),
        );
      } catch (error) {
        console.warn(
          "[sites] Redis cache: tag invalidation not shared:",
          error instanceof Error ? error.message : error,
        );
      }
    },
  };
}

module.exports = process.env.REDIS_URL
  ? createRedisCacheHandler(process.env.REDIS_URL)
  : createDefaultCacheHandler(50 * 1024 * 1024);
