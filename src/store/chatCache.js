/**
 * chatCache.js — Stale-Seq Message Cache Fix
 *
 * ╔══════════════════════════════════════════════════════════╗
 * ║  BUG: Stale sequence cache silently drops messages       ║
 * ╠══════════════════════════════════════════════════════════╣
 * ║  Symptom: new messages appear briefly then vanish,       ║
 * ║  or only appear after navigating away and back.          ║
 * ║                                                          ║
 * ║  Log:                                                    ║
 * ║    [AuroraChat] loadMessages stale for ...@g.us          ║
 * ║    (seq=1, current=2) — returning cached                 ║
 * ║                                                          ║
 * ║  Root cause: loadMessages() detected a stale cache       ║
 * ║  (seq < current) and returned the cached snapshot, but   ║
 * ║  never scheduled a re-fetch. The new message that        ║
 * ║  triggered the seq bump was silently dropped.            ║
 * ╠══════════════════════════════════════════════════════════╣
 * ║  Fix: return cached immediately (no flash), then         ║
 * ║  invalidate + re-fetch in the next microtask.            ║
 * ║  Events: 'messages:refreshed' → ChatWindow re-renders.   ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * HOW TO INTEGRATE
 * ────────────────
 * This file exports a drop-in replacement for the loadMessages function
 * and the message cache. In your chat.js (renderer), replace:
 *
 *   import { loadMessages, _messageCache } from './chatCache'
 *
 * Or copy the relevant sections directly into your existing chat.js.
 *
 * The backend already provides:
 *   - db:messages:list response includes `seq` field  (main.js fix)
 *   - db:messages:seq  lightweight poll IPC           (main.js fix)
 *   - messages:new IPC event carries chat_jid         (always did)
 */

// ── Simple EventBus (use your existing one if available) ─────────────────────
const eventBus = (() => {
  const listeners = new Map()
  return {
    on:   (evt, fn) => { if (!listeners.has(evt)) listeners.set(evt, []); listeners.get(evt).push(fn) },
    off:  (evt, fn) => { listeners.set(evt, (listeners.get(evt) || []).filter(f => f !== fn)) },
    emit: (evt, data) => { (listeners.get(evt) || []).forEach(fn => { try { fn(data) } catch (_) {} }) },
  }
})()

// ── Message cache ─────────────────────────────────────────────────────────────
// Map<jid, { messages: [], seq: number, fetchedAt: number }>
const _messageCache = new Map()

// ── IPC bridge (Electron renderer) ────────────────────────────────────────────
const ipc = window.electron?.ipcRenderer ?? window.ipcRenderer ?? null

async function _ipcInvoke(channel, args) {
  if (!ipc) throw new Error("IPC not available")
  return ipc.invoke(channel, args)
}

// ── loadMessages ──────────────────────────────────────────────────────────────
/**
 * loadMessages — fetch messages for a JID, with stale-seq recovery.
 *
 * On stale detection (cached.seq < db.seq):
 *   1. Return cached immediately — no flash or blank state.
 *   2. In the next microtask: invalidate cache + re-fetch.
 *   3. Emit 'messages:refreshed' so ChatWindow re-renders.
 *
 * @param {string}  jid
 * @param {number}  [offset=0]
 * @param {number}  [limit=50]
 * @returns {Promise<Array>}
 */
async function loadMessages(jid, offset = 0, limit = 50) {
  if (!jid) return []

  const cached = _messageCache.get(jid)

  // ── Fast path: get current DB seq (cheap — just a Map lookup on main process) ──
  let dbSeq = 0
  try {
    const seqRes = await _ipcInvoke("db:messages:seq", { jid })
    dbSeq = seqRes?.seq ?? 0
  } catch (_) {}

  // ── Cache hit, seq matches → return immediately ────────────────────────────
  if (cached && cached.seq === dbSeq && offset === 0) {
    console.log(`[AuroraChat] loadMessages cache hit for ${jid}: ${cached.messages.length} msgs (seq=${dbSeq})`)
    return cached.messages
  }

  // ── Stale cache detected → return cached NOW, schedule re-fetch ───────────
  if (cached && cached.seq < dbSeq && offset === 0) {
    console.log(
      `[AuroraChat] loadMessages stale for ${jid}` +
      ` (seq=${cached.seq}, current=${dbSeq}) — returning cached, scheduling refresh`
    )

    // Return cached synchronously so the UI doesn't flash
    const snapshot = cached.messages

    // Invalidate and re-fetch in next microtask (after current render completes)
    Promise.resolve().then(async () => {
      try {
        _messageCache.delete(jid)             // bust stale entry
        await loadMessages(jid, offset, limit) // re-fetch (will populate fresh)
        eventBus.emit("messages:refreshed", { jid })  // signal ChatWindow
      } catch (_) {}
    })

    return snapshot
  }

  // ── Cache miss or pagination → fetch from DB ───────────────────────────────
  try {
    const res = await _ipcInvoke("db:messages:list", { jid, limit, offset })
    if (!res?.ok) throw new Error(res?.error || "IPC error")

    const messages = res.data || []
    const freshSeq = res.seq ?? dbSeq

    // Only cache the first page (offset=0) to keep memory bounded
    if (offset === 0) {
      _messageCache.set(jid, { messages, seq: freshSeq, fetchedAt: Date.now() })
    }

    console.log(`[AuroraChat] loadMessages OK for ${jid}: ${messages.length} msgs (seq=${freshSeq})`)
    return messages
  } catch (err) {
    console.error(`[AuroraChat] loadMessages error for ${jid}:`, err.message)
    return cached?.messages || []  // safe fallback to stale cache on error
  }
}

// ── messages:new IPC listener ─────────────────────────────────────────────────
// When a new message arrives, append it to the cache immediately so
// loadMessages returns it without a full re-fetch.
// Also bumps the cache seq so the stale guard passes.
if (ipc) {
  ipc.on("messages:new", (_, msg) => {
    if (!msg?.chat_jid) return
    const jid    = msg.chat_jid
    const cached = _messageCache.get(jid)
    if (cached) {
      // Prepend (newest first — matches ORDER BY timestamp DESC in getMessagesByJid)
      // Deduplicate by id in case IPC fires twice on reconnect
      const exists = cached.messages.some(m => m.id === msg.id)
      if (!exists) {
        cached.messages = [msg, ...cached.messages]
        cached.seq += 1  // advance local seq to match DB
        eventBus.emit("messages:refreshed", { jid })
      }
    }
    // If no cache entry exists for this chat, no action needed —
    // next loadMessages() call will fetch fresh from DB.
  })

  // Handle background media download completion — update existing msg in cache
  ipc.on("media:updated", (_, { id, chat_jid, media_saved_path }) => {
    if (!chat_jid || !id) return
    const cached = _messageCache.get(chat_jid)
    if (!cached) return
    const msg = cached.messages.find(m => m.id === id)
    if (msg) {
      msg.media_saved_path = media_saved_path || msg.media_saved_path
      eventBus.emit("messages:refreshed", { jid: chat_jid })
    }
  })
}

// ── Exports ───────────────────────────────────────────────────────────────────
export { loadMessages, _messageCache, eventBus }
