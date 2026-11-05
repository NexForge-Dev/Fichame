"use strict";
/**
 * NexForge analytics client — copy this file into a product (server side only).
 *
 *   const { createNexforge } = require("./nexforge-client.cjs");      // CommonJS
 *   import { createNexforge } from "./nexforge-client.cjs";            // ESM / TypeScript
 *
 *   const nf = createNexforge({
 *     endpoint: process.env.NEXFORGE_ENDPOINT,          // https://painel.../api/ingest
 *     ingestKey: process.env.NEXFORGE_INGEST_KEY,       // nfk_... (never in the browser)
 *     pseudonymSecret: process.env.NEXFORGE_PSEUDONYM_SECRET, // random, per product, never shared
 *   });
 *   nf.track("feature_used", { userId: user.id, properties: { feature: "analise_executada" } });
 *
 * Guarantees:
 *  - user ids are HMAC-SHA256'd with the product's own secret before leaving the server; the panel
 *    never sees the real id, e-mail or any content (only `feedback()` carries free text);
 *  - fire-and-forget: never throws, never blocks the request; failures are dropped after retries;
 *  - batching (every 5 s or 50 events) and `flush()` for serverless handlers.
 */
const crypto = require("node:crypto");

function createNexforge(opts) {
  const endpoint = opts && opts.endpoint;
  const ingestKey = opts && opts.ingestKey;
  const secret = opts && opts.pseudonymSecret;
  const enabled = Boolean(endpoint && ingestKey && secret) && opts.enabled !== false;
  const flushInterval = (opts && opts.flushIntervalMs) || 5000;
  const maxBatch = 50;
  const timeoutMs = (opts && opts.timeoutMs) || 3000;
  const retries = opts && Number.isInteger(opts.retries) ? opts.retries : 2;
  const onError = (opts && opts.onError) || (() => {});
  let queue = [];
  let timer = null;
  let inflight = Promise.resolve();

  /** Stable pseudonymous id for this product. Same input → same id; irreversible without the secret. */
  function pseudonym(id) {
    return crypto.createHmac("sha256", secret || "disabled").update(String(id)).digest("hex").slice(0, 40);
  }

  async function send(events, attempt) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${ingestKey}` },
        body: JSON.stringify({ events }),
        signal: controller.signal,
      });
      if (res.status >= 500 || res.status === 429) throw new Error(`nexforge ${res.status}`);
      if (!res.ok) onError(new Error(`nexforge rejected batch: ${res.status}`));
      else {
        const body = await res.json().catch(() => null);
        if (body && body.rejected && body.rejected.length) onError(new Error(`nexforge rejected ${body.rejected.length} event(s): ${JSON.stringify(body.rejected.slice(0, 3))}`));
      }
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        return send(events, attempt + 1);
      }
      onError(err);
    } finally {
      clearTimeout(t);
    }
  }

  /**
   * Deterministic event id (UUID-shaped) from stable parts, e.g. onceId("onboarding", accountId).
   * The panel drops events whose id it already has, so one-time events can be sent repeatedly.
   */
  function onceId(...parts) {
    const h = crypto.createHmac("sha256", secret || "disabled").update(parts.map(String).join("\u0000")).digest("hex");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${"89ab"[parseInt(h[16], 16) % 4]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
  }

  /**
   * Sends what is queued. With `maxWaitMs`, resolves after at most that long even if the request
   * is still in flight — use it in request handlers so analytics never slows a response down.
   */
  function flush(maxWaitMs) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (queue.length) {
      const batch = queue;
      queue = [];
      inflight = inflight.then(() => send(batch, 0));
    }
    if (!maxWaitMs) return inflight;
    return Promise.race([inflight, new Promise((r) => setTimeout(r, maxWaitMs))]);
  }

  /**
   * @param {string} event      one of the panel's allowlisted events
   * @param {{ userId?: string|number, anonymousId?: string, properties?: object, occurredAt?: Date, eventId?: string }} data
   *        userId: the product's internal account id (hashed here). For visitors before signup,
   *        pass a random id kept in a first-party cookie and call `link(visitorId, userId)` after signup.
   */
  function track(event, data) {
    if (!enabled) return;
    try {
      const d = data || {};
      const raw = d.userId !== undefined && d.userId !== null ? d.userId : d.anonymousId;
      if (raw === undefined || raw === null) return;
      queue.push({
        event_id: d.eventId || crypto.randomUUID(),
        event,
        anonymous_id: pseudonym(raw),
        occurred_at: (d.occurredAt || new Date()).toISOString(),
        properties: d.properties || {},
      });
      if (queue.length >= maxBatch) flush();
      else if (!timer) {
        timer = setTimeout(flush, flushInterval);
        if (timer.unref) timer.unref();
      }
    } catch (err) {
      onError(err);
    }
  }

  /** Joins the pre-signup visitor history to the new account so the funnel stays whole. */
  function link(previousId, userId) {
    if (!enabled) return;
    track("identity_linked", { userId, properties: { previous_id: pseudonym(previousId) } });
  }

  /**
   * Forwards one suggestion or problem report the product has ALREADY saved in its own database.
   * This is the only call that sends free text: never pass the author's name, e-mail or id.
   * `externalId` is the product's row id, so sending twice keeps one copy. Await it in the request
   * handler; it never throws and gives up after `maxWaitMs`. Resolves to whether the panel took it.
   *
   * @param {{ externalId: string|number, kind: "suggestion"|"problem", message: string, page?: string, occurredAt?: Date }} item
   * @param {number} [maxWaitMs]
   */
  async function feedback(item, maxWaitMs) {
    if (!enabled) return false;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), maxWaitMs || 2500);
    try {
      const res = await fetch(String(endpoint).replace(/\/api\/ingest\/?$/, "/api/feedback"), {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${ingestKey}` },
        body: JSON.stringify({
          external_id: String(item.externalId),
          kind: item.kind,
          message: item.message,
          page: String(item.page || "").split(/[?#]/, 1)[0].replace(/\/[^/]*\d[^/]*/g, "/:id"),
          occurred_at: (item.occurredAt || new Date()).toISOString(),
        }),
        signal: controller.signal,
      });
      if (!res.ok) onError(new Error(`nexforge rejected feedback: ${res.status}`));
      return res.ok;
    } catch (err) {
      onError(err);
      return false;
    } finally {
      clearTimeout(t);
    }
  }

  return { track, link, flush, pseudonym, onceId, feedback, enabled };
}

module.exports = { createNexforge };
