"use strict"

// ════════════════════════════════════════════════════════════
// JID UTILS — powered by Baileys native JID functions
// ════════════════════════════════════════════════════════════
//
// All JID type checks, normalization, and validation now delegate
// to Baileys' own functions (wileys) instead of manual string ops.
// This ensures 100% consistency with how Baileys handles JIDs.
//
// LID resolution chain (strictest-first, @s.whatsapp.net ONLY output):
//   1. Baileys lidToJid(sock, lid)   — live WA lookup (async, most accurate)
//   2. _globalLidMap                 — contacts.upsert / disk seed
//   3. lidMapOverride                — caller-supplied fallback
//   4. Keep @lid as-is if ALL fail   — never silently drop sender
//
// Baileys functions used:
//   jidNormalizedUser   — strip :device suffix, normalize @c.us→@s.whatsapp.net
//   jidDecode           — parse JID into { user, server, device, domainType }
//   jidEncode           — build JID from parts
//   areJidsSameUser     — compare JIDs ignoring device suffix
//   isJidGroup          — is @g.us
//   isJidUser           — is @s.whatsapp.net (real user)
//   isLidUser           — is @lid
//   isJidBroadcast      — is broadcast (status@broadcast etc)
//   isJidStatusBroadcast— is status@broadcast specifically
//   isJidNewsletter     — is @newsletter
//   isJidMetaAi         — is Meta AI JID
//   isJidBot            — is bot JID
//   getSenderLid        — get @lid from a message key
//   lidToJid            — convert lid → jid (Baileys live lookup, most accurate)
// ════════════════════════════════════════════════════════════

const {
  jidNormalizedUser,
  jidDecode,
  jidEncode,
  areJidsSameUser,
  isJidGroup,
  isJidUser,
  isLidUser,
  isJidBroadcast,
  isJidStatusBroadcast,
  isJidNewsletter,
  isJidMetaAi,
  isJidBot,
  getSenderLid,
  lidToJid,
} = require("baileys")

// ── Module-level LID map ─────────────────────────────────────
// Set once via initLidMap(), auto-used by normalizeJid() and resolveLid().
let _globalLidMap = new Map()

// ── Baileys sock reference ───────────────────────────────────
// Set via initSock() to enable Baileys' own lidToJid() live lookup.
// This is the most accurate resolver — it asks WhatsApp directly.
let _sock = null

/**
 * initSock — register the active Baileys socket instance.
 *
 * WAJIB dipanggil setelah sock terbentuk agar resolveLidAsync() bisa
 * menggunakan Baileys' native lidToJid() untuk lookup langsung ke WA.
 *
 *   sock.ev.on("connection.update", () => initSock(sock))
 *   // or simply once after makeWASocket():
 *   initSock(sock)
 */
function initSock(sock) {
  _sock = sock
}

// ── initLidMap / seedLidMap / updateLidMap ───────────────────

/**
 * initLidMap — set global LID map from Baileys contacts array.
 * WAJIB dipanggil saat handler contacts.upsert / contacts sync.
 */
function initLidMap(contacts) {
  _globalLidMap = buildLidMap(contacts)
}

/**
 * seedLidMap — merge a pre-built Map (loaded from lid_map.json on disk)
 * into the global lid map. Call in loadLidMapFromDisk().
 */
function seedLidMap(map) {
  if (!map || !(map instanceof Map)) return
  for (const [k, v] of map) _globalLidMap.set(k, v)
}

/**
 * updateLidMap — incremental update without full rebuild.
 */
function updateLidMap(contacts) {
  if (!Array.isArray(contacts)) return
  const patch = buildLidMap(contacts)
  for (const [k, v] of patch) _globalLidMap.set(k, v)
}

// ── Internal helpers ─────────────────────────────────────────

// _normalizeBase: normalize without @lid resolve (used by buildLidMap to avoid
// circular dependency — buildLidMap must not resolve lids while building them)
function _normalizeBase(jid) {
  if (!jid || typeof jid !== "string") return ""
  jid = jid.trim()
  if (!jid) return ""
  try {
    return jidNormalizedUser(jid) || jid
  } catch (_) {
    const atIdx = jid.lastIndexOf("@")
    if (atIdx === -1) return jid
    let user   = jid.slice(0, atIdx)
    let server = jid.slice(atIdx + 1)
    const colonIdx = user.indexOf(":")
    if (colonIdx !== -1) user = user.slice(0, colonIdx)
    if (server === "c.us") server = "s.whatsapp.net"
    return `${user}@${server}`
  }
}

// _assertUserJid: ensure a resolved JID is strictly @s.whatsapp.net.
// Rejects groups, newsletters, broadcasts, and any remaining @lid.
// Returns the jid if valid, otherwise null.
function _assertUserJid(jid) {
  if (!jid || typeof jid !== "string") return null
  try {
    return isJidUser(jid) ? jid : null
  } catch (_) {
    return jid.endsWith("@s.whatsapp.net") ? jid : null
  }
}

// ── Core normalizer ──────────────────────────────────────────

/**
 * normalizeJid — canonical JID form used throughout DB and store.
 *
 * Uses Baileys' jidNormalizedUser as the core normalizer, then adds:
 *   - @lid resolution via global map (sync path)
 *   - Safe fallback for any edge cases Baileys can't handle
 *
 * For the most complete resolution (including Baileys live lookup),
 * use normalizeJidAsync() when you have async context.
 *
 * Handles every variant WhatsApp/Baileys can produce:
 *   @c.us        → @s.whatsapp.net   (via jidNormalizedUser)
 *   :device      → stripped          (via jidNormalizedUser)
 *   @lid         → resolved if in global map, else kept as @lid
 *   @g.us        → kept as-is        (jidNormalizedUser preserves groups)
 *   @newsletter  → kept as-is        (jidNormalizedUser preserves newsletters)
 *   null/""      → ""               (safe fallback)
 */
function normalizeJid(jid) {
  if (!jid || typeof jid !== "string") return ""
  jid = jid.trim()
  if (!jid) return ""

  let normalized
  try {
    normalized = jidNormalizedUser(jid)
    if (!normalized) normalized = jid
  } catch (_) {
    const atIdx = jid.lastIndexOf("@")
    if (atIdx === -1) return jid
    let user   = jid.slice(0, atIdx)
    let server = jid.slice(atIdx + 1)
    const colonIdx = user.indexOf(":")
    if (colonIdx !== -1) user = user.slice(0, colonIdx)
    if (server === "c.us") server = "s.whatsapp.net"
    normalized = `${user}@${server}`
  }

  // @lid sync resolution via global map
  if (isLidJid(normalized)) {
    const user     = normalized.split("@")[0]
    const resolved = _globalLidMap.get(user) || _globalLidMap.get(normalized)
    // Only accept @s.whatsapp.net results — reject anything else silently
    const safe = resolved ? _assertUserJid(resolved) : null
    return safe || normalized  // keep @lid if not yet resolved
  }

  return normalized
}

/**
 * normalizeJidAsync — like normalizeJid but with Baileys live lookup as first step.
 *
 * Resolution chain:
 *   1. If not @lid → fast-path to sync normalizeJid (no await cost)
 *   2. Baileys lidToJid(sock, lid) — asks WhatsApp directly
 *   3. _globalLidMap lookup
 *   4. Keep @lid if everything fails
 *
 * Use this in message handlers where you have async context and want
 * zero missed lids (group messages, DMs from new contacts, etc.)
 *
 * @param {string} jid
 * @param {Map}    [lidMapOverride]
 * @returns {Promise<string>}
 */
async function normalizeJidAsync(jid, lidMapOverride) {
  const synced = normalizeJid(jid)

  // If sync already resolved it → done (no async cost)
  if (!isLidJid(synced)) return synced

  // Sync resolution failed — try Baileys live lookup first
  const liveResult = await _tryBaileysLidToJid(synced)
  if (liveResult) return liveResult

  // Try override map
  if (lidMapOverride) {
    const user     = synced.split("@")[0]
    const resolved = lidMapOverride.get(user) || lidMapOverride.get(synced)
    const safe     = resolved ? _assertUserJid(resolved) : null
    if (safe) return safe
  }

  // Keep @lid — caller must handle unresolved case
  return synced
}

/**
 * decodeJid — sync alias for normalizeJid, compatible with smsg / Baileys decodeJid().
 */
function decodeJid(jid) {
  return normalizeJid(jid)
}

// ── JID type checks — delegate to Baileys ───────────────────

/**
 * isLidJid — check if JID is a @lid (opaque device identifier).
 * Uses Baileys' isLidUser internally.
 */
function isLidJid(jid) {
  if (!jid || typeof jid !== "string") return false
  try {
    return isLidUser(jid) === true
  } catch (_) {
    return jid.endsWith("@lid")
  }
}

function isGroupJid(jid) {
  if (!jid) return false
  try { return isJidGroup(jid) === true } catch (_) { return jid.endsWith("@g.us") }
}

function isNewsletterJid(jid) {
  if (!jid) return false
  try { return isJidNewsletter(jid) === true } catch (_) { return jid.endsWith("@newsletter") }
}

function isUserJid(jid) {
  if (!jid) return false
  try { return isJidUser(jid) === true } catch (_) { return jid.endsWith("@s.whatsapp.net") }
}

function isBroadcastJid(jid) {
  if (!jid) return false
  try { return isJidBroadcast(jid) === true } catch (_) { return jid.includes("broadcast") }
}

function isStatusBroadcastJid(jid) {
  if (!jid) return false
  try { return isJidStatusBroadcast(jid) === true } catch (_) { return jid === "status@broadcast" }
}

/**
 * sameUser — compare two JIDs ignoring device suffix.
 * Wraps Baileys areJidsSameUser.
 */
function sameUser(jid1, jid2) {
  if (!jid1 || !jid2) return false
  try { return areJidsSameUser(jid1, jid2) } catch (_) {
    return normalizeJid(jid1) === normalizeJid(jid2)
  }
}

/**
 * parseJid — decode JID into parts using Baileys jidDecode.
 * Returns { user, server, device, domainType } or null.
 */
function parseJid(jid) {
  if (!jid) return null
  try { return jidDecode(jid) || null } catch (_) { return null }
}

/**
 * buildJid — encode JID parts using Baileys jidEncode.
 */
function buildJid(user, server, device) {
  try { return jidEncode(user, server, device) } catch (_) {
    return device ? `${user}:${device}@${server}` : `${user}@${server}`
  }
}

// ── LID resolution helpers ───────────────────────────────────

/**
 * _tryBaileysLidToJid — attempt Baileys' native lidToJid() async lookup.
 *
 * This is the MOST ACCURATE resolver — it calls WhatsApp's own server
 * mapping API via the active socket. Returns @s.whatsapp.net or null.
 *
 * Internal use only. Public API: resolveLidAsync(), normalizeJidAsync().
 *
 * @param {string} lidJid   — must be @lid form
 * @returns {Promise<string|null>}
 */
async function _tryBaileysLidToJid(lidJid) {
  if (!_sock || !lidJid) return null
  try {
    const result = await lidToJid(_sock, lidJid)
    if (!result) return null
    // lidToJid may return { jid } object or bare string depending on Baileys version
    const raw = typeof result === "string" ? result : (result.jid || result.user || null)
    if (!raw) return null
    const normalized = _normalizeBase(raw)
    // Strict guard: only accept @s.whatsapp.net — reject groups, @lid, etc.
    const safe = _assertUserJid(normalized)
    if (safe) {
      // Cache in global map so next sync call resolves without a round-trip
      const lidUser = lidJid.split("@")[0]
      if (lidUser) {
        _globalLidMap.set(lidUser, safe)
        _globalLidMap.set(`${lidUser}@lid`, safe)
      }
    }
    return safe
  } catch (_) {
    return null
  }
}

/**
 * resolveLid — sync resolve @lid → real @s.whatsapp.net JID.
 *
 * Checks global map first, then optional override map.
 * Only returns @s.whatsapp.net JIDs — rejects anything else.
 * Returns original @lid if not resolved (never empty string).
 *
 * For async (Baileys live) resolution use resolveLidAsync().
 */
function resolveLid(lidJid, lidMapOverride) {
  if (!lidJid) return ""
  if (!isLidJid(lidJid)) return lidJid

  const user = lidJid.split("@")[0]

  const fromGlobal = _globalLidMap.get(user) || _globalLidMap.get(lidJid)
  const safeglobal = fromGlobal ? _assertUserJid(fromGlobal) : null
  if (safeglobal) return safeglobal

  if (lidMapOverride) {
    const fromOverride = lidMapOverride.get(user) || lidMapOverride.get(lidJid)
    const safeOverride = fromOverride ? _assertUserJid(fromOverride) : null
    if (safeOverride) return safeOverride
  }

  return lidJid  // unresolved — keep @lid, never return ""
}

/**
 * resolveLidAsync — full resolution chain with Baileys live lookup.
 *
 * Chain:
 *   1. _globalLidMap  (instant, sync)
 *   2. lidMapOverride (instant, sync)
 *   3. Baileys lidToJid() via _sock (async, asks WhatsApp directly)
 *
 * Always returns @s.whatsapp.net on success, or original @lid on failure.
 *
 * @param {string} lidJid
 * @param {Map}    [lidMapOverride]
 * @returns {Promise<string>}
 */
async function resolveLidAsync(lidJid, lidMapOverride) {
  // Sync fast-path first (no await cost for already-known lids)
  const synced = resolveLid(lidJid, lidMapOverride)
  if (!isLidJid(synced)) return synced

  // Sync failed → Baileys live lookup
  const live = await _tryBaileysLidToJid(synced)
  return live || synced  // keep @lid if everything failed
}

/**
 * tryResolveLid — resolve @lid if possible (sync), no-op otherwise.
 */
function tryResolveLid(jid, lidMapOverride) {
  if (!isLidJid(jid)) return jid
  return resolveLid(jid, lidMapOverride)
}

/**
 * tryResolveLidAsync — async version of tryResolveLid.
 * Uses full chain including Baileys live lookup.
 */
async function tryResolveLidAsync(jid, lidMapOverride) {
  if (!isLidJid(jid)) return jid
  return resolveLidAsync(jid, lidMapOverride)
}

/**
 * buildLidMap — build lid → real JID lookup map from Baileys contacts array.
 * Uses Baileys jidNormalizedUser for consistent normalization.
 *
 * Only stores @s.whatsapp.net JIDs as values — strict guard applied.
 */
function buildLidMap(contacts) {
  const map = new Map()
  if (!Array.isArray(contacts)) return map

  for (const c of contacts) {
    if (!c.id) continue
    const realJid = _normalizeBase(c.id)
    if (!realJid) continue

    // Skip if c.id itself is a @lid (we need the phone-side JID as map value)
    if (isLidJid(realJid)) continue

    // Strict: only store real @s.whatsapp.net JIDs as values
    if (!_assertUserJid(realJid)) continue

    if (c.lid) {
      let lidJid
      try { lidJid = _normalizeBase(c.lid) } catch (_) { lidJid = c.lid }
      const lidUser = lidJid.split("@")[0]
      if (lidUser) {
        map.set(lidUser, realJid)
        map.set(`${lidUser}@lid`, realJid)
        // Also map lid-number@s.whatsapp.net → realJid (Baileys sometimes uses this form)
        map.set(`${lidUser}@s.whatsapp.net`, realJid)
      }
    }

    const phone = realJid.split("@")[0]
    if (phone && /^\d+$/.test(phone)) {
      map.set(`phone:${phone}`, realJid)
    }
  }
  return map
}

// ── Display helpers ───────────────────────────────────────────

/**
 * formatJidAsPhone — human-readable phone number from JID.
 * Returns null for groups/newsletters/lid.
 */
function formatJidAsPhone(jid) {
  if (!jid) return null
  const n = normalizeJid(jid)
  const decoded = parseJid(n)
  if (!decoded) return null
  const { user, server } = decoded
  if (server === "g.us" || server === "newsletter" || server === "broadcast") return null
  if (server === "lid") return `+${user} (unresolved)`
  if (/^\d+$/.test(user)) return `+${user}`
  return user
}

/**
 * getJidDisplayPhone — alias formatJidAsPhone, returns "" instead of null.
 */
function getJidDisplayPhone(jid) {
  return formatJidAsPhone(jid) ?? ""
}

module.exports = {
  // Init (WAJIB di contacts.upsert handler)
  initLidMap,
  updateLidMap,
  seedLidMap,

  // Sock init (WAJIB untuk Baileys live lid lookup)
  initSock,

  // Core — sync
  normalizeJid,
  decodeJid,

  // Core — async (with Baileys live lidToJid lookup)
  normalizeJidAsync,

  // JID type checks (Baileys-backed)
  isLidJid,
  isGroupJid,
  isNewsletterJid,
  isUserJid,
  isBroadcastJid,
  isStatusBroadcastJid,
  sameUser,

  // JID parsing/building (Baileys-backed)
  parseJid,
  buildJid,

  // Raw Baileys pass-through exports (for callers that want direct access)
  jidNormalizedUser,
  jidDecode,
  jidEncode,
  areJidsSameUser,
  isJidGroup,
  isJidUser,
  isLidUser,
  isJidBroadcast,
  isJidStatusBroadcast,
  isJidNewsletter,
  isJidMetaAi,
  isJidBot,
  getSenderLid,
  lidToJid,

  // LID — sync
  resolveLid,
  tryResolveLid,
  buildLidMap,

  // LID — async (with Baileys live lookup via sock)
  resolveLidAsync,
  tryResolveLidAsync,

  // Display
  formatJidAsPhone,
  getJidDisplayPhone,
}
