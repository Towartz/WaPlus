// src/store/chat.js
// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTION GRADE v4 — AuroraChat Chat Store
// ═══════════════════════════════════════════════════════════════════════════

import { create } from "zustand"
import { useAuthStore } from "./auth"
import { normalizeJid, isJidGroup, isJidLid, isJidNewsletter, isJidUser, jidUser } from "../utils/jidUtils"

// Helper: get own JID from auth store without subscribing
function getOwnJid() {
  try { return useAuthStore.getState().connectedUser?.jid || null } catch { return null }
}

// ════════════════════════════════════════════════════════════
// [FIX-DEDUP] Smart chat merge — prevents undefined/null from
// overwriting existing values when IPC payload has partial fields.
//
// Problem: { ...existingChat, ...{ name: undefined, last_msg: 'hi' } }
//           → name gets wiped to undefined even though existing had 'Budi'
//
// Rule: incoming value wins ONLY if it is not undefined.
//       'name' and 'profile_pic_url' are additionally protected:
//       they are NEVER overwritten by null — only a real string value wins.
// ════════════════════════════════════════════════════════════
function mergeChat(existing, incoming) {
  const PROTECT_FROM_NULL = new Set(['name', 'profile_pic_url'])
  const result = { ...existing }
  for (const [k, v] of Object.entries(incoming)) {
    if (v === undefined) continue                          // never overwrite with undefined
    if (v === null && PROTECT_FROM_NULL.has(k)) continue  // protect name from null wipe
    result[k] = v
  }
  return result
}
// [JID-UTILS] Replaced inline normalizeJid with shared module that mirrors
// Baileys jidNormalizedUser — single source of truth for JID normalization.
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

// [FIX-2] Resolve a quoted sender: raw JID → human-readable name
// DB stores quoted_sender as JID like "6285770017326@s.whatsapp.net"
// We want to show just the number or contact name, not the raw JID.
// [FIX-LID] @lid JIDs must be resolved — they look like "175784908046590@lid"
// [FIX-OWN] If sender JID matches our own JID, return "__me__" sentinel
function resolveQuotedSender(sender, contacts, ownJid) {
  if (!sender) return null
  // [FIX-DB-SELF] __self__ sentinel = DB detected this quoted msg was from_me=1
  if (sender === "__self__") return "__me__"
  // If it's already a name (no @), return as-is
  if (!sender.includes("@")) return sender

  const atIdx  = sender.lastIndexOf("@")
  const user   = sender.slice(0, atIdx)
  const server = sender.slice(atIdx + 1)

  // [FIX-LID] @lid JIDs are opaque device identifiers — not meaningful to show
  // Try to resolve via contacts, otherwise show as unknown number
  const isLid = server === "lid"

  // [FIX-OWN] Check if this is our own JID — return sentinel "__me__" (not null)
  // null means "unresolved/unknown", "__me__" means definitively our own message
  if (ownJid) {
    const ownUser    = ownJid.split("@")[0].split(":")[0]
    const senderUser = user.split(":")[0]
    if (ownUser === senderUser) return "__me__"
  }

  // Try to find in contacts — supports both Map (O(1)) and Array (O(n)) for compat
  if (contacts) {
    const cleanUser = user.split(":")[0]
    let c = null
    if (contacts instanceof Map) {
      c = contacts.get(cleanUser)
    } else if (Array.isArray(contacts)) {
      c = contacts.find(c => {
        if (!c.jid) return false
        const cUser = c.jid.split("@")[0].split(":")[0]
        return cUser === cleanUser || c.number === cleanUser
      })
    }
    if (c) return c.name || c.push_name || null
  }

  // @lid with no contact match — return null; QuotedMsg shows "Kontak"
  if (isLid) return null

  // [FIX-DISPLAY] No contact saved for this phone JID — return formatted number.
  // quoted_sender is used ONLY for identity checks (__me__, scroll-to-quoted).
  // quotedSenderName (resolved above in normalizeMsg) is what QuotedMsg actually
  // displays, so returning "+number" here is just a safe JID-as-display fallback.
  const cleanUser = user.split(":")[0]
  if (/^\d{6,}$/.test(cleanUser)) return `+${cleanUser}`
  return null
}
// [FIX-1] Normalize a DB row message — SQLite integers → JS types
// [PERF] quoted_sender_name is now resolved here (app layer) instead of via
// a per-row LEFT JOIN in the SQL query. The SQL JOIN was the primary cause of
// chat-switch lag: it fired a contacts table lookup for every single message row.
// Resolving in JS is faster because contacts are already in memory.
function normalizeMsg(m, contacts, ownJid, lidMap = null) {
  if (!m) return m
  // [FIX-FROM-ME] Normalize from_me to strict 0/1 integer
  // Incoming IPC may send boolean true/false, DB sends 0/1
  const fromMe = (m.from_me === 1 || m.from_me === true) ? 1 : 0

  // [PERF] Resolve sender_name using O(1) Map lookup (contacts is a Map when
  // loadContacts() ran, otherwise Array fallback). Avoids O(n) find() per message.
  let senderName = m.sender_name || null
  if (!senderName && !fromMe && m.sender_jid && contacts) {
    const sUser = m.sender_jid.split("@")[0].split(":")[0]
    const sc = (contacts instanceof Map)
      ? contacts.get(sUser)
      : contacts.find?.(c => c.jid && c.jid.split("@")[0].split(":")[0] === sUser)
    if (sc?.name || sc?.notify) senderName = sc.name || sc.notify
  }

  // [PERF] Resolve quoted_sender_name using same O(1) Map — replaces removed SQL JOIN.
  let quotedSenderName = m.quoted_sender_name || null
  if (!quotedSenderName && m.quoted_sender) {
    const qs = m.quoted_sender
    if (qs === "__self__" || qs === "__me__") {
      quotedSenderName = null  // rendered as "Kamu" by bubble
    } else if (!qs.includes("@")) {
      quotedSenderName = qs    // already a resolved name
    } else {
      const qUser = qs.split("@")[0].split(":")[0]
      const qServer = qs.slice(qs.lastIndexOf("@") + 1)
      const qc = (contacts instanceof Map)
        ? contacts.get(qUser)
        : (contacts && contacts.find?.(c => c.jid && c.jid.split("@")[0].split(":")[0] === qUser))
      if (qc?.name || qc?.notify) {
        // ✅ Contact name found directly via JID
        quotedSenderName = qc.name || qc.notify
      } else if (qServer === "lid") {
        // [FIX-LID-QUOTED] @lid — try resolve via lidMap: lid→phone→contact
        // lidMap: Map<lidUser, phoneUser> built from client lidMap in loadContacts()
        const resolvedPhoneUser = lidMap?.get(qUser) || null
        if (resolvedPhoneUser) {
          const rc = (contacts instanceof Map)
            ? contacts.get(resolvedPhoneUser)
            : contacts?.find?.(c => c.jid && c.jid.split("@")[0].split(":")[0] === resolvedPhoneUser)
          if (rc?.name || rc?.notify) {
            quotedSenderName = rc.name || rc.notify  // ✅ Resolved via lid→phone→contact
          } else if (/^\d{6,}$/.test(resolvedPhoneUser)) {
            quotedSenderName = `+${resolvedPhoneUser}`  // ✅ At least show the phone number
          } else {
            quotedSenderName = null
          }
        } else {
          // lidMap has no entry yet — keep null, QuotedMsg shows "Kontak"
          quotedSenderName = null
        }
      } else if (/^\d{6,}$/.test(qUser)) {
        // No contact saved — show formatted phone number (standard WA behavior)
        quotedSenderName = `+${qUser}`
      } else {
        quotedSenderName = null
      }
    }
  }

  return {
    ...m,
    from_me:          fromMe,
    sender_name:      senderName,
    quoted_sender_name: quotedSenderName,
    is_group:         m.is_group        != null ? Number(m.is_group)        : 0,
    is_forwarded:     m.is_forwarded    != null ? Number(m.is_forwarded)    : 0,
    is_ptt:           m.is_ptt          != null ? Number(m.is_ptt)          : 0,
    is_gif:           m.is_gif          != null ? Number(m.is_gif)          : 0,
    is_view_once:     m.is_view_once    != null ? Number(m.is_view_once)    : 0,
    is_animated:      m.is_animated     != null ? Number(m.is_animated)     : 0,
    has_media:        m.has_media       != null ? Number(m.has_media)       : 0,
    starred:          m.starred         != null ? Number(m.starred)         : 0,
    quoted_has_media: m.quoted_has_media!= null ? Number(m.quoted_has_media): 0,
    // Normalize media path
    media_saved_path: normalizeMediaPath(m.media_saved_path),
    // [FIX-2] Resolve quoted sender JID → display name
    // [FIX-OWN] Pass ownJid so we can detect "Kamu" (own message quoted)
    quoted_sender: resolveQuotedSender(m.quoted_sender, contacts, ownJid),
    // Parse JSON fields that may be strings from DB
    poll_options:   parseJson(m.poll_options, null),
    contacts_json:  parseJson(m.contacts_json, null),
    mentioned_jids: parseJson(m.mentioned_jids, []),
    // reactions are merged in separately via loadReactions() / updateReactions()
    reactions: m.reactions || [],
  }
}

function parseJson(v, fallback) {
  if (v == null) return fallback
  if (typeof v !== "string") return v  // already parsed
  try { return JSON.parse(v) } catch { return fallback }
}

// ── normalizeMediaPath ────────────────────────────────────────────────────────
// IMPORTANT: Store raw paths as-is from SQLite. Do NOT convert to file:// here.
// Conversion to file:// URL happens exactly once in MessageBubble.pathToFileUrl()
// which correctly handles Windows drive letters, Unix paths, and already-encoded URLs.
// Pre-converting here caused D: → D%3A corruption on Windows.
function normalizeMediaPath(p) {
  if (!p) return null
  return p  // pass through raw — MessageBubble.pathToFileUrl handles conversion
}

// ════════════════════════════════════════════════════════════
// STORE
// ════════════════════════════════════════════════════════════

export const useChatStore = create((set, get) => ({
  // ── Chat list ───────────────────────────────────────────────────────────
  chats: [],
  chatsTotal: 0,
  chatsLoading: false,
  _chatsLoadedAt: 0, // [PERF] timestamp of last successful loadChats

  groups: [],
  groupsTotal: 0,

  communities: [],
  communitiesTotal: 0,
  channels: [],
  channelsTotal: 0,

  // ── Messages ─────────────────────────────────────────────────────────────
  // Keyed by JID — only loaded chats are kept in memory
  messages: {},
  messagesLoading: false,

  // [FIX-3] Sequence counter per JID — cancel stale requests
  _seq: {},

  // [PERF-CACHE] Per-JID last-load timestamp — skip redundant DB fetches
  // within MSG_CACHE_FRESH_MS if messages already in store
  _msgLoadedAt: {},  // jid → Date.now()
  _MSG_CACHE_FRESH_MS: 120_000, // ↑ 8s→120s: revisiting a chat within 2min is instant (matches DB cache TTL)

  // [PERF] O(1) contacts lookup map — built lazily, used by normalizeMsg
  // Avoids O(n) Array.find() on every single message row during load
  _contactsMap: null,  // Map<jid_user, contact> | null
  // [FIX-LID-QUOTED] Secondary lid→phone lookup — Map<lidUser, phoneUser>
  // Built from client.js lidMap after loadContacts(). Used by normalizeMsg to
  // resolve @lid quoted_sender to @s.whatsapp.net before contacts lookup.
  _lidMap: null,  // Map<lidUser, phoneUser> | null
  // [FIX-MEDIA-UPDATE] Buffer for media updates that arrive before a chat's messages
  // are loaded into state. Flushed when loadMessages() runs for that chat.
  // Map<cleanJid, Map<msgId, { media_saved_path, has_media }>>
  _pendingMediaUpdates: new Map(),

  // [FIX-4] Active JID tracked here for auto-refresh
  activeJid: null,

  // ── Contacts ─────────────────────────────────────────────────────────────
  contacts: [],
  contactsTotal: 0,

  // ── Sync ─────────────────────────────────────────────────────────────────
  syncStatus: "idle",
  syncProgress: 0,      // 0-100 from sync:status progress field
  syncStats:   null,    // { chats, messages } from sync:status stats
  _backfillDone: false,

  // ════════════════════════════════════════════════════════════
  // CHAT ACTIONS
  // ════════════════════════════════════════════════════════════

  setChats:        (chats, total) => set({ chats, chatsTotal: total }),
  setChatsLoading: (v)            => set({ chatsLoading: v }),
  // Accept either a string ("idle"/"syncing"/"done") OR the full sync:status payload object
  setSyncStatus: (v) => {
    if (typeof v === "string") {
      set({ syncStatus: v })
    } else if (v && typeof v === "object") {
      // Full payload from sync:status IPC event: { isSyncing, progress, stats, isComplete }
      const status = v.isComplete ? "done" : v.isSyncing ? "syncing" : "idle"
      set({
        syncStatus:   status,
        syncProgress: typeof v.progress === "number" ? v.progress : (v.isComplete ? 100 : 0),
        syncStats:    v.stats || null,
      })
    }
  },

  loadChats: async () => {
    set({ chatsLoading: true })
    try {
      const result = await window.api?.dbChats?.({ limit: 300, offset: 0 })
      if (result?.ok) {
        const raw = result.data || []

        // ══════════════════════════════════════════════════════════
        // [FIX-DEDUP-v2] Deduplicate chats — handles ALL duplicate sources:
        //
        // Problem 1: DB returns @lid AND @s.whatsapp.net for same person.
        //   WA creates two "chat" rows for same contact when @lid is used —
        //   one from message history (@lid), one from contact store (@s.whatsapp.net).
        //   These must be merged into a single chat item.
        //
        // Problem 2: Name conflicts — pushname vs phonebook name vs @lid alias.
        //   Resolution priority: phonebook name > pushname > phone number > lid alias.
        //
        // Problem 3: @c.us vs @s.whatsapp.net duplicates (legacy history sync).
        //
        // Strategy:
        //   Pass 1 — bucket by normalized JID. Merge duplicate JIDs (P3 above).
        //   Pass 2 — detect @lid ↔ phone number correspondence via phone digits.
        //            If lid user matches a phone user's number → merge into phone entry.
        //   Pass 3 — resolve displayName using priority chain.
        // ══════════════════════════════════════════════════════════

        // ── Pass 1: Bucket by normalized JID ──────────────────
        const byJid = {}
        for (const c of raw) {
          const jid = normalizeJid(c.jid)
          if (!jid) continue
          const norm = { ...c, jid }
          const prev = byJid[jid]
          if (!prev) {
            byJid[jid] = norm
          } else {
            // Merge — keep richer data. Newer timestamp wins for msg preview fields.
            const isNewer = (norm.last_msg_at || 0) >= (prev.last_msg_at || 0)
            byJid[jid] = mergeChat(isNewer ? prev : norm, isNewer ? norm : prev)
          }
        }

        // ── Pass 2: Cross-resolve @lid ↔ @s.whatsapp.net ─────────────────────
        // Build phone → key map for non-lid entries so we can detect phone matches
        const phoneToKey = {}   // "628xxx" → "@s.whatsapp.net key"
        for (const [key, c] of Object.entries(byJid)) {
          if (isJidLid(key) || isJidGroup(key) || isJidNewsletter(key)) continue
          const user = key.split("@")[0].split(":")[0]
          if (/^\d{6,}$/.test(user)) phoneToKey[user] = key
        }

        const lidKeysToRemove = []
        for (const [key, c] of Object.entries(byJid)) {
          if (!isJidLid(key)) continue

          // Try to find the phone-based entry that this @lid maps to.
          // The DB should have stored the resolved phone in c.phone or c.contact_phone,
          // or we can look it up via name/pushname cross-reference.
          const lidUser  = key.split("@")[0]
          const resolved =
            // 1. DB stored resolved phone
            (c.phone && phoneToKey[c.phone])       ||
            (c.contact_phone && phoneToKey[c.contact_phone]) ||
            // 2. The name field IS a phone number (stored as +628xxx)
            (c.name && /^\+?\d{6,}$/.test(c.name.replace(/[\s\-]/g, "")) &&
              phoneToKey[c.name.replace(/[^\d]/g, "")]) ||
            // 3. Lid user digits happen to match known phone (rare but can occur
            //    when lid is derived from phone in some WA regions)
            (/^\d{10,}$/.test(lidUser) && phoneToKey[lidUser])

          if (resolved && byJid[resolved]) {
            // Merge @lid data into the phone entry — phone entry is canonical.
            // @lid entry usually has more recent messages; phone entry has phonebook name.
            const existing  = byJid[resolved]
            const lidEntry  = c
            const lidNewer  = (lidEntry.last_msg_at || 0) >= (existing.last_msg_at || 0)
            // Name from phone entry wins over @lid if phone entry has a real name
            const mergedName = (
              (existing.name && !existing.name.includes("@"))
                ? existing.name                                // phonebook name wins
                : (lidEntry.name && !lidEntry.name.includes("@"))
                    ? lidEntry.name                            // lid name fallback
                    : existing.name || lidEntry.name
            )
            byJid[resolved] = {
              ...mergeChat(lidNewer ? existing : lidEntry, lidNewer ? lidEntry : existing),
              name: mergedName,
              jid: resolved,   // always keep canonical phone JID
              // Preserve unread count — take max (both entries may have unread)
              unread_count: Math.max(
                Number(existing.unread_count) || 0,
                Number(lidEntry.unread_count)  || 0,
              ),
            }
            lidKeysToRemove.push(key)
          }
        }
        // Remove merged @lid entries
        for (const k of lidKeysToRemove) delete byJid[k]

        // ── Pass 3: Name resolution ────────────────────────────
        // Ensure every chat has a human-readable displayName.
        // The DB name field should already be resolved by the backend,
        // but defend against any gaps (raw JIDs, missing pushnames, etc.)
        for (const [key, c] of Object.entries(byJid)) {
          if (c.name && !c.name.includes("@")) continue // already resolved
          const server  = key.split("@")[1] || ""
          const user    = key.split("@")[0].split(":")[0]
          if (server === "g.us") {
            byJid[key] = { ...c, name: c.name || c.subject || "Grup" }
          } else if (server === "lid") {
            // @lid with no resolved name — show partial number as last resort
            byJid[key] = { ...c, name: c.push_name || c.last_sender_name || `~${user.slice(-8)}` }
          } else if (/^\d{6,}$/.test(user)) {
            byJid[key] = { ...c, name: c.push_name || c.name || `+${user}` }
          }
        }
        const allRaw      = Object.values(byJid)
        const channels    = allRaw.filter(c => isJidNewsletter(c.jid || ""))
        const allChats    = allRaw
          .filter(c => !c.is_community && !isJidNewsletter(c.jid || ""))
          .map(c => ({ ...c, from_me: c.from_me != null ? Number(c.from_me) : 0 }))
        const groups      = allChats.filter(c => c.is_group)
        const communities = allRaw.filter(c => c.is_community)

        // [FIX-CHAT-POS] Preserve in-memory timestamps that are NEWER than DB.
        // appendMessage() updates last_msg_at optimistically in the store.
        // If loadChats() fires before the DB write lands (race condition), the DB
        // row still has the old timestamp — which would sort this chat back down.
        // Solution: for each chat, keep whichever timestamp is larger.
        const currentChats = get().chats || []
        const currentByJid = {}
        for (const c of currentChats) if (c.jid) currentByJid[c.jid] = c

        const mergedChats = allChats.map(c => {
          const inMem = currentByJid[c.jid]
          if (!inMem) return c
          const dbTs  = c.last_msg_at || c.last_message_timestamp || 0
          const memTs = inMem.last_msg_at || inMem.last_message_timestamp || 0
          if (memTs > dbTs) {
            // In-memory is fresher — keep its timestamp + preview fields
            return {
              ...c,
              last_msg_at:  inMem.last_msg_at,
              last_msg:     inMem.last_msg     || c.last_msg,
              from_me:      inMem.from_me      ?? c.from_me,
            }
          }
          return c
        })

        // Sort AFTER merge so preserved timestamps are reflected
        const getTs = c => c.last_msg_at || c.last_message_timestamp || 0
        mergedChats.sort((a, b) => (b.pinned - a.pinned) || (getTs(b) - getTs(a)))
        const mergedGroups = mergedChats.filter(c => c.is_group)

        set({
          chats:            mergedChats,
          chatsTotal:       result.total || mergedChats.length,
          groups:           mergedGroups,
          groupsTotal:      mergedGroups.length,
          communities,
          communitiesTotal: communities.length,
          channels,
          channelsTotal:    channels.length,
          chatsLoading:     false,
          _chatsLoadedAt:   Date.now(),  // [PERF-LOW-END] gate for 30s skip on chat switch
        })

        // [FIX-HISTORY-PREVIEW] Jika ada chat tanpa last_message preview
        // (last_msg null — umum untuk history sync chats), trigger DB backfill
        // yang mengisi last_message_body dari tabel messages, lalu reload.
        // [FIX-BACKFILL-SPAM] Hanya backfill SEKALI per session — mencegah loop:
        // loadChats → backfill → db:chats:updated → loadChats → backfill → ...
        const hasBlankPreviews = allChats.some(c => !c.last_msg)
        const alreadyBackfilled = get()._backfillDone
        if (hasBlankPreviews && !alreadyBackfilled) {
          set({ _backfillDone: true })
          window.api?.dbBackfillPreviews?.().then(() => {
            window.api?.dbChats?.({ limit: 300, offset: 0 }).then(r2 => {
              if (!r2?.ok) return
              const raw2 = r2.data || []
              // [FIX-DEDUP-v2] Same dedup as primary load — normalize + merge @lid
              const byJid2 = {}
              for (const c of raw2) {
                const jid2 = normalizeJid(c.jid)
                if (!jid2) continue
                const norm2 = { ...c, jid: jid2 }
                const prev2 = byJid2[jid2]
                if (!prev2) {
                  byJid2[jid2] = norm2
                } else {
                  const newer = (norm2.last_msg_at || 0) >= (prev2.last_msg_at || 0)
                  byJid2[jid2] = mergeChat(newer ? prev2 : norm2, newer ? norm2 : prev2)
                }
              }
              // Cross-resolve @lid ↔ phone — reuse same logic as primary pass
              const phoneToKey2 = {}
              for (const [k, c] of Object.entries(byJid2)) {
                if (isJidLid(k) || isJidGroup(k)) continue
                const u = k.split("@")[0].split(":")[0]
                if (/^\d{6,}$/.test(u)) phoneToKey2[u] = k
              }
              const lidDel2 = []
              for (const [k, c] of Object.entries(byJid2)) {
                if (!isJidLid(k)) continue
                const lu = k.split("@")[0]
                const res2 = (c.phone && phoneToKey2[c.phone]) ||
                  (/^\d{10,}$/.test(lu) && phoneToKey2[lu])
                if (res2 && byJid2[res2]) {
                  const e2 = byJid2[res2], li2 = c
                  const ln2 = (li2.last_msg_at || 0) >= (e2.last_msg_at || 0)
                  byJid2[res2] = { ...mergeChat(ln2 ? e2 : li2, ln2 ? li2 : e2), jid: res2,
                    name: (e2.name && !e2.name.includes("@")) ? e2.name : li2.name || e2.name,
                    unread_count: Math.max(Number(e2.unread_count)||0, Number(li2.unread_count)||0) }
                  lidDel2.push(k)
                }
              }
              for (const k of lidDel2) delete byJid2[k]
              const all2 = Object.values(byJid2)
                .filter(c => !c.is_community)
                .map(c => ({ ...c, from_me: c.from_me != null ? Number(c.from_me) : 0 }))
              const grp2 = all2.filter(c => c.is_group)
              const comm2 = Object.values(byJid2).filter(c => c.is_community)
              set({
                chats: all2, chatsTotal: r2.total || all2.length,
                groups: grp2, groupsTotal: grp2.length,
                communities: comm2, communitiesTotal: comm2.length,
                chatsLoading: false, _chatsLoadedAt: Date.now(),
              })
            }).catch(() => {})
          }).catch(() => {})
        }
      } else {
        set({ chatsLoading: false })
      }
    } catch (err) {
      console.error("[AuroraChat] loadChats error:", err)
      set({ chatsLoading: false })
    }
  },

  loadContacts: async () => {
    try {
      const result = await window.api?.dbContacts?.({ limit: 500, offset: 0 })
      if (result?.ok) {
        const contactsList = result.data || []
        // [PERF] Build O(1) lookup Map: user-part of JID → contact
        // Used by normalizeMsg to avoid O(n) Array.find() on every message row
        const map = new Map()
        for (const c of contactsList) {
          if (!c.jid) continue
          const user = c.jid.split("@")[0].split(":")[0]
          if (user) map.set(user, c)
        }
        // [FIX-LID-QUOTED] Fetch lid→phone map from client for quoted sender resolution.
        // Build Map<lidUser, phoneUser> so normalizeMsg can resolve @lid quoted senders.
        let lidMap = null
        try {
          const lidResult = await window.api?.lidGetMap?.()
          if (lidResult?.ok && lidResult.data) {
            lidMap = new Map()
            for (const [lidUser, phoneJid] of Object.entries(lidResult.data)) {
              // phoneJid is like "628xxx@s.whatsapp.net" — extract user part
              const phoneUser = phoneJid.split("@")[0].split(":")[0]
              if (lidUser && phoneUser) lidMap.set(lidUser, phoneUser)
            }
          }
        } catch (_) {}
        set({ contacts: contactsList, contactsTotal: result.total || 0, _contactsMap: map, _lidMap: lidMap })
      }
    } catch (err) {
      console.error("[AuroraChat] loadContacts error:", err)
    }
  },

  upsertChat: (chat) => set((s) => {
    // [FIX-SPLIT-CHAT] Normalize JID before any store operation
    const normalJid = normalizeJid(chat.jid)
    if (!normalJid) return s
    const normalizedChat = { ...chat, jid: normalJid }

    // [FIX-LID-UPSERT] If an @lid JID arrives via IPC and we already have the
    // phone-based entry, merge into the phone entry rather than adding a duplicate.
    const isLidIncoming = isJidLid(normalJid)
    if (isLidIncoming) {
      const lidUser = normalJid.split("@")[0]
      // Try to find a matching @s.whatsapp.net entry
      const phoneMatch = s.chats.find(c => {
        if (!c.jid || isJidLid(c.jid) || isJidGroup(c.jid)) return false
        const cUser = c.jid.split("@")[0].split(":")[0]
        return (
          (normalizedChat.phone && cUser === normalizedChat.phone) ||
          (/^\d{10,}$/.test(lidUser) && cUser === lidUser)
        )
      })
      if (phoneMatch) {
        // Merge incoming @lid data into existing phone entry
        const idx2 = s.chats.findIndex(c => c.jid === phoneMatch.jid)
        if (idx2 >= 0) {
          const newChats2 = [...s.chats]
          newChats2[idx2] = mergeChat(newChats2[idx2], {
            ...normalizedChat,
            jid: phoneMatch.jid, // keep canonical phone JID
            name: phoneMatch.name || normalizedChat.name, // phonebook name wins
          })
          const getTs2 = c => c.last_msg_at || c.last_message_timestamp || 0
          newChats2.sort((a, b) => (b.pinned - a.pinned) || (getTs2(b) - getTs2(a)))
          return { chats: newChats2, groups: newChats2.filter(c => c.is_group) }
        }
      }
    }

    // [FIX-LID-UPSERT-REVERSE] If phone JID arrives and we have @lid version,
    // replace the @lid entry with the canonical phone entry.
    if (!isLidIncoming) {
      const inUser = normalJid.split("@")[0].split(":")[0]
      if (/^\d{6,}$/.test(inUser)) {
        const lidIdx = s.chats.findIndex(c => {
          if (!isJidLid(c.jid)) return false
          const lu = c.jid.split("@")[0]
          return lu === inUser || (normalizedChat.phone && lu === normalizedChat.phone)
        })
        if (lidIdx >= 0) {
          // Replace @lid entry with phone entry, merging data
          const newChats3 = [...s.chats]
          newChats3[lidIdx] = mergeChat(newChats3[lidIdx], { ...normalizedChat })
          // Also check if phone entry already exists somewhere else → remove duplicate
          const dupIdx = newChats3.findIndex((c, i) => i !== lidIdx && c.jid === normalJid)
          if (dupIdx >= 0) {
            newChats3[lidIdx] = mergeChat(newChats3[dupIdx], newChats3[lidIdx])
            newChats3.splice(dupIdx, 1)
          } else {
            newChats3[lidIdx] = { ...newChats3[lidIdx], jid: normalJid }
          }
          const getTs3 = c => c.last_msg_at || c.last_message_timestamp || 0
          newChats3.sort((a, b) => (b.pinned - a.pinned) || (getTs3(b) - getTs3(a)))
          return { chats: newChats3, groups: newChats3.filter(c => c.is_group) }
        }
      }
    }

    const idx = s.chats.findIndex(c => c.jid === normalJid)
    let newChats
    if (idx >= 0) {
      newChats = [...s.chats]
      // [FIX-DEDUP] Use mergeChat — never let undefined/null wipe existing name or pic.
      newChats[idx] = mergeChat(newChats[idx], normalizedChat)
    } else {
      newChats = [normalizedChat, ...s.chats]
    }
    // [FIX-SORT] Pinned always first, then by timestamp (check both field names)
    const getTs = c => c.last_msg_at || c.last_message_timestamp || 0
    newChats = newChats.sort(
      (a, b) => (b.pinned - a.pinned) || (getTs(b) - getTs(a))
    )
    return { chats: newChats, groups: newChats.filter(c => c.is_group) }
  }),

  // ════════════════════════════════════════════════════════════
  // MESSAGE ACTIONS
  // ════════════════════════════════════════════════════════════

  // [FIX-4] Set active JID — called by ChatWindow on mount
  setActiveJid: (jid) => set({ activeJid: normalizeJid(jid) }),

  loadMessages: async (jid, limit = 50, offset = 0) => {
    if (!jid) return []
    // [FIX-SPLIT-CHAT] Normalize before using as store key and IPC arg
    const cleanJid = normalizeJid(jid)

    // [PERF-CACHE] If messages already loaded fresh and this is initial fetch (offset=0),
    // return cached immediately — avoids blocking IPC round-trip on fast chat switching.
    // This is the primary fix for chat-click freeze: stale cache returns synchronously.
    if (offset === 0) {
      const state = get()
      const cached = state.messages[cleanJid]
      const loadedAt = state._msgLoadedAt[cleanJid] || 0
      const age = Date.now() - loadedAt
      if (cached?.length > 0 && age < state._MSG_CACHE_FRESH_MS) {
        // Already fresh — skip IPC entirely, just update seq so stale calls abort
        set(s => ({ _seq: { ...s._seq, [cleanJid]: (s._seq[cleanJid] || 0) + 1 }, messagesLoading: false }))
        return cached
      }
    }

    // [FIX-3] Sequence counter — only the LATEST call for a given JID wins.
    // IMPORTANT: do NOT clear messages[cleanJid] here — keep showing old messages
    // while the new fetch is in-flight. This prevents blank flash on chat switch.
    const seq = (get()._seq[cleanJid] || 0) + 1
    set(s => ({
      _seq:            { ...s._seq, [cleanJid]: seq },
      messagesLoading: true,
      // [FIX-BLANK-FLASH] Tidak clear messages di sini — tampilkan pesan lama
      // selama fetch berjalan. Blank flash terjadi karena clear ke [] lalu tunggu IPC.
    }))

    try {
      const result = await window.api?.dbMessages?.({ jid: cleanJid, limit, offset })

      if (get()._seq[cleanJid] !== seq) {
        // A newer loadMessages() call already completed for this JID — its result
        // is already in state. Safe to discard this stale response.
        console.debug(`[AuroraChat] loadMessages stale for ${cleanJid} (seq=${seq}, current=${get()._seq[cleanJid]}) — discarding`)
        return get().messages[cleanJid] || []
      }

      if (result?.ok) {
        const contacts = get()._contactsMap || get().contacts
        const ownJid = getOwnJid()
        const lidMap = get()._lidMap
        const msgs = (result.data || []).slice().reverse().map(m => normalizeMsg(m, contacts, ownJid, lidMap))
        console.log(`[AuroraChat] loadMessages OK for ${cleanJid}: ${msgs.length} msgs (offset=${offset})`)

        // [FIX-MEDIA-FLUSH] Apply any pending media updates that arrived while this
        // chat wasn't loaded in state (background downloads completed out-of-view).
        set(s => {
          let finalMsgs = msgs
          const chatPending = s._pendingMediaUpdates.get(cleanJid)
          if (chatPending && chatPending.size > 0) {
            finalMsgs = msgs.map(m => {
              const patch = chatPending.get(m.id)
              return patch ? { ...m, ...patch } : m
            })
            // Clear flushed entries
            const pending = new Map(s._pendingMediaUpdates)
            pending.delete(cleanJid)
            return {
              messages:             { ...s.messages, [cleanJid]: finalMsgs },
              messagesLoading:      false,
              _msgLoadedAt:         { ...s._msgLoadedAt, [cleanJid]: Date.now() },
              _pendingMediaUpdates: pending,
            }
          }
          return {
            messages:        { ...s.messages, [cleanJid]: finalMsgs },
            messagesLoading: false,
            _msgLoadedAt:    { ...s._msgLoadedAt, [cleanJid]: Date.now() },
          }
        })
        return msgs
      } else {
        console.error(`[AuroraChat] loadMessages FAILED for ${cleanJid}:`, result)
      }
    } catch (err) {
      console.error("[AuroraChat] loadMessages error:", err)
    }

    if (get()._seq[cleanJid] === seq) set({ messagesLoading: false })
    console.warn(`[AuroraChat] loadMessages returning cached for ${cleanJid}`)
    return get().messages[cleanJid] || []
  },

  // [FIX-4] Refresh active chat messages silently (no loading spinner)
  // Called when "db:chats:updated" fires and activeJid is set.
  // Kept intentionally simple — complex guards caused switch-back blank screen bugs.
  refreshActiveChat: async () => {
    const { activeJid, _contactsMap, contacts } = get()
    if (!activeJid) return
    const cleanJid = normalizeJid(activeJid)
    if (!cleanJid) return

    try {
      const result = await window.api?.dbMessages?.({ jid: cleanJid, limit: 50, offset: 0 })
      if (!result?.ok) return

      // Guard: bail if user switched away while IPC was in-flight
      if (normalizeJid(get().activeJid) !== cleanJid) return

      const ownJid = getOwnJid()
      const contactsLookup = _contactsMap || contacts
      const lidMap = get()._lidMap
      const msgs    = (result.data || []).slice().reverse().map(m => normalizeMsg(m, contactsLookup, ownJid, lidMap))
      const existing = get().messages[cleanJid] || []

      // [FIX-PAGINATE] Jika user sudah scroll up dan load lebih dari 50 msgs,
      // jangan wipe scroll position — hanya append pesan baru di tail.
      if (existing.length > msgs.length) {
        const existingIds = new Set(existing.map(m => m.id))
        const newTail = msgs.filter(m => !existingIds.has(m.id))
        if (newTail.length > 0) {
          set(s => ({
            messages: { ...s.messages, [cleanJid]: [...(s.messages[cleanJid] || []), ...newTail] }
          }))
        }
        return
      }

      // Normal case: update hanya jika ada perubahan
      if (msgs.length > 0 && (
        msgs.length !== existing.length ||
        msgs[msgs.length - 1]?.id !== existing[existing.length - 1]?.id
      )) {
        set(s => ({
          messages: { ...s.messages, [cleanJid]: msgs },
        }))
      }
    } catch (err) {
      console.error("[AuroraChat] refreshActiveChat error:", err)
    }
  },

  setMessages: (jid, msgs) => set(s => {
    const cleanJid = normalizeJid(jid)
    if (!cleanJid) return s
    return { messages: { ...s.messages, [cleanJid]: msgs } }
  }),

  // [FIX-5] appendMessage — normalized + cross-chat dedup guard + bubble chat to top
  //
  // [PERF-VIOLATION-FIX] Split into two steps to eliminate 'message' handler violation:
  //
  //   Step 1 (sync, current microtask): append the normalized message to state.
  //     normalizeMsg() is O(1) Map lookups — fast enough to stay synchronous.
  //
  //   Step 2 (queueMicrotask): update chat list preview + sort.
  //     [...300 chats].sort() + .filter() is ~30-60ms of sync work.
  //     Running this inside the IPC 'message' callback is what Chrome flags as
  //     a Violation. Deferring it one microtask tick moves it out of that frame.
  //     The chat list re-sorts <1ms after the message appears — imperceptible to users.
  //
  appendMessage: (jid, msg) => {
    // [FIX-SPLIT-CHAT] Normalize store key — IPC may deliver different JID forms
    const cleanJid = normalizeJid(jid)
    if (!cleanJid) return

    // Guard: don't append to wrong chat
    if (msg.chat_jid && normalizeJid(msg.chat_jid) !== cleanJid) return

    const state = useChatStore.getState()
    const existing = state.messages[cleanJid] || []
    // Dedup by message ID
    if (existing.some(m => m.id === msg.id)) return

    const contacts = state._contactsMap || state.contacts
    const normalized = normalizeMsg(msg, contacts, getOwnJid(), state._lidMap)

    // ── Step 1: append message immediately (sync) ────────────────────────
    set(s => ({
      messages: {
        ...s.messages,
        [cleanJid]: [...(s.messages[cleanJid] || []), normalized],
      },
    }))

    // ── Step 2: update chat list preview + re-sort (deferred) ────────────
    // queueMicrotask runs after the current call stack unwinds, so Chrome no
    // longer attributes the sort cost to the IPC 'message' handler frame.
    queueMicrotask(() => {
      set(s => {
        let newChats = s.chats ? [...s.chats] : []
        const chatIdx = newChats.findIndex(c => c.jid === cleanJid)
        const getTs   = c => c.last_msg_at || c.last_message_timestamp || 0
        const newTs   = msg.timestamp || msg.message_timestamp || Math.floor(Date.now() / 1000)

        if (chatIdx >= 0) {
          newChats[chatIdx] = {
            ...newChats[chatIdx],
            last_msg:     msg.body || (msg.msg_type ? `[${msg.msg_type}]` : ""),
            last_msg_at:  newTs,
            from_me:      normalized.from_me,
            // Increment unread only for incoming messages while chat is NOT active
            unread_count: normalized.from_me ? 0
              : (newChats[chatIdx].unread_count || 0) + 1,
          }
        }
        // Re-sort: pinned first, then by timestamp desc
        newChats.sort((a, b) => (b.pinned - a.pinned) || (getTs(b) - getTs(a)))
        return { chats: newChats, groups: newChats.filter(c => c.is_group) }
      })
    })
  },

  setMessagesLoading: (v) => set({ messagesLoading: v }),

  // [FIX-MEDIA-GLOBAL] Update media for ANY chat — not just the active one.
  // If the chat's messages aren't loaded in state yet, buffer the update so it's
  // applied when loadMessages() runs for that chat (flush on load).
  updateMessageMedia: ({ id, chat_jid, media_saved_path }) => set(s => {
    const cleanJid = normalizeJid(chat_jid)
    if (!cleanJid || !id || !media_saved_path) return s

    const normalizedPath = normalizeMediaPath(media_saved_path)
    const msgs = s.messages[cleanJid]

    if (msgs) {
      // Chat is loaded in state — update immediately
      const idx = msgs.findIndex(m => m.id === id)
      if (idx < 0) return s
      const updated = [...msgs]
      updated[idx] = {
        ...updated[idx],
        media_saved_path: normalizedPath,
        media_is_downloaded: 1,
        has_media: 1,  // ensure has_media is set so bubble renders correctly
      }
      return { messages: { ...s.messages, [cleanJid]: updated } }
    }

    // Chat not yet loaded — stash in pending buffer for flush on loadMessages()
    const pending = new Map(s._pendingMediaUpdates)
    const chatPending = new Map(pending.get(cleanJid) || [])
    chatPending.set(id, { media_saved_path: normalizedPath, media_is_downloaded: 1, has_media: 1 })
    pending.set(cleanJid, chatPending)
    return { _pendingMediaUpdates: pending }
  }),

  // [FIX-SCROLL] Prepend older messages saat user scroll ke atas (pagination)
  prependMessages: async (jid, limit = 30, offset = 0) => {
    if (!jid) return []
    const cleanJid = normalizeJid(jid)
    try {
      const result = await window.api?.dbMessages?.({ jid: cleanJid, limit, offset })
      if (!result?.ok) return []
      const contacts = useChatStore.getState()._contactsMap || useChatStore.getState().contacts
      const ownJid = getOwnJid()
      const lidMap = useChatStore.getState()._lidMap
      const older = (result.data || []).slice().reverse().map(m => normalizeMsg(m, contacts, ownJid, lidMap))
      const existing = useChatStore.getState().messages[cleanJid] || []
      // Dedup by id
      const existingIds = new Set(existing.map(m => m.id))
      const newMsgs = older.filter(m => !existingIds.has(m.id))
      if (newMsgs.length > 0) {
        set(s => ({
          messages: { ...s.messages, [cleanJid]: [...newMsgs, ...(s.messages[cleanJid] || [])] }
        }))
      }
      return newMsgs
    } catch (err) {
      console.error("[AuroraChat] prependMessages error:", err)
      return []
    }
  },

  // [FIX-REACTIONS] Load semua reactions untuk chat dan merge ke message objects.
  // Dipanggil setelah loadMessages() — query terpisah agar tidak block tampilan pesan.
  loadReactions: async (jid) => {
    if (!jid || !window.api?.dbReactions) return
    const cleanJid = normalizeJid(jid)
    try {
      const result = await window.api.dbReactions({ jid: cleanJid })
      if (!result?.ok || !result.data?.length) return

      // Group by target message id: { [msgId]: [{text, sender_jid}] }
      const byTarget = {}
      for (const r of result.data) {
        if (!r.reaction_target_id || !r.text) continue
        if (!byTarget[r.reaction_target_id]) byTarget[r.reaction_target_id] = []
        // Deduplicate same sender (keep last)
        const existing = byTarget[r.reaction_target_id]
        const idx = existing.findIndex(x => x.sender === r.sender_jid)
        if (idx >= 0) existing.splice(idx, 1)
        existing.push({ text: r.text, sender: r.sender_jid })
      }

      set(s => {
        const msgs = s.messages[cleanJid]
        if (!msgs?.length) return s
        const updated = msgs.map(m => {
          const reactions = byTarget[m.id]
          if (!reactions) return m
          return { ...m, reactions }
        })
        return { messages: { ...s.messages, [cleanJid]: updated } }
      })
    } catch (err) {
      console.error("[AuroraChat] loadReactions error:", err)
    }
  },

  // [FIX-REACTIONS] Update reactions array pada pesan tertentu
  // Dipanggil saat messages:reaction IPC masuk
  updateReactions: (chatJid, targetMsgId, reactorJid, emoji) => set((s) => {
    const cleanJid = normalizeJid(chatJid)
    if (!cleanJid) return s
    const msgs = s.messages[cleanJid]
    if (!msgs) return s
    const idx = msgs.findIndex(m => m.id === targetMsgId)
    if (idx < 0) return s

    const updated = [...msgs]
    const msg = { ...updated[idx] }
    const reactions = [...(msg.reactions || [])]

    // Remove existing reaction dari sender yang sama
    const existingIdx = reactions.findIndex(r => r.sender === reactorJid)
    if (existingIdx >= 0) reactions.splice(existingIdx, 1)

    // Add new reaction (empty emoji = unreact)
    if (emoji) reactions.push({ text: emoji, sender: reactorJid })

    msg.reactions = reactions
    updated[idx] = msg
    return { messages: { ...s.messages, [cleanJid]: updated } }
  }),

  // ── Contact actions ─────────────────────────────────────────────────────
  setContacts: (contacts, total) => set({ contacts, contactsTotal: total }),
}))