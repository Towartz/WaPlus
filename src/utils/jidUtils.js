// ════════════════════════════════════════════════════════════
// src/utils/jidUtils.js
// Frontend JID utilities — mirrors electron/baileys/parser/jid-utils.js
// but runs in the renderer process (no access to wileys/Node requires).
//
// The backend normalizes all JIDs before they reach the frontend,
// so these functions handle display + simple classification only.
//
// Naming mirrors Baileys exports so callers are consistent:
//   jidNormalizedUser  → normalizeJid (Baileys fn not available in renderer)
//   isJidGroup         → isJidGroup
//   isLidUser          → isJidLid
//   isJidNewsletter    → isJidNewsletter
//   isJidUser          → isJidUser
//   isJidStatusBroadcast → isJidStatusBroadcast
//   isJidBroadcast     → isJidBroadcast
//   areJidsSameUser    → areJidsSameUser
// ════════════════════════════════════════════════════════════

/**
 * normalizeJid — strip :device suffix, @c.us → @s.whatsapp.net.
 * Pure-JS mirror of Baileys jidNormalizedUser for the renderer process.
 */
export function normalizeJid(jid) {
  if (!jid || typeof jid !== 'string') return ''
  jid = jid.trim()
  if (!jid) return ''
  const atIdx = jid.lastIndexOf('@')
  if (atIdx === -1) return jid
  let user   = jid.slice(0, atIdx)
  let server = jid.slice(atIdx + 1)
  const colonIdx = user.indexOf(':')
  if (colonIdx !== -1) user = user.slice(0, colonIdx)
  if (server === 'c.us') server = 's.whatsapp.net'
  return `${user}@${server}`
}

/** @returns {string} user part of JID (phone number for real users) */
export function jidUser(jid) {
  if (!jid) return ''
  const n = normalizeJid(jid)
  const atIdx = n.lastIndexOf('@')
  return atIdx === -1 ? n : n.slice(0, atIdx)
}

/** @returns {string} server part of JID (e.g. "s.whatsapp.net", "g.us") */
export function jidServer(jid) {
  if (!jid) return ''
  const n = normalizeJid(jid)
  const atIdx = n.lastIndexOf('@')
  return atIdx === -1 ? '' : n.slice(atIdx + 1)
}

// ── Type checks (mirror Baileys export names) ─────────────────

/** true for @g.us group JIDs — mirrors Baileys isJidGroup */
export function isJidGroup(jid) {
  if (!jid) return false
  return normalizeJid(jid).endsWith('@g.us')
}

/** true for @lid opaque device JIDs — mirrors Baileys isLidUser */
export function isJidLid(jid) {
  if (!jid) return false
  return normalizeJid(jid).endsWith('@lid')
}

/** true for @newsletter community JIDs — mirrors Baileys isJidNewsletter */
export function isJidNewsletter(jid) {
  if (!jid) return false
  return normalizeJid(jid).endsWith('@newsletter')
}

/** true for @s.whatsapp.net real user JIDs — mirrors Baileys isJidUser */
export function isJidUser(jid) {
  if (!jid) return false
  return normalizeJid(jid).endsWith('@s.whatsapp.net')
}

/** true for status@broadcast — mirrors Baileys isJidStatusBroadcast */
export function isJidStatusBroadcast(jid) {
  return jid === 'status@broadcast'
}

/** true for any @broadcast JID — mirrors Baileys isJidBroadcast */
export function isJidBroadcast(jid) {
  return typeof jid === 'string' && jid.includes('@broadcast')
}

/**
 * areJidsSameUser — compare two JIDs ignoring device suffix.
 * Mirrors Baileys areJidsSameUser.
 */
export function areJidsSameUser(jid1, jid2) {
  if (!jid1 || !jid2) return false
  return normalizeJid(jid1) === normalizeJid(jid2)
}

// ── Display helpers ──────────────────────────────────────────

/**
 * formatJidPhone — returns "+628xxx" string for real user JIDs, null otherwise.
 * Safe to call on any JID type.
 */
export function formatJidPhone(jid) {
  if (!jid) return null
  const n      = normalizeJid(jid)
  const user   = jidUser(n)
  const server = jidServer(n)
  if (!user) return null
  if (server === 'g.us' || server === 'newsletter' || server === 'broadcast') return null
  if (server === 'lid') return `+${user} (unresolved)`
  return /^\d+$/.test(user) ? `+${user}` : user
}

/**
 * jidDisplayName — best-effort human display string for a JID.
 * Priority: provided name > phone number > raw user part.
 */
export function jidDisplayName(jid, name) {
  if (name && !name.includes('@')) return name
  const phone = formatJidPhone(jid)
  if (phone) return phone
  const user = jidUser(jid)
  return user || jid || ''
}

export default {
  normalizeJid, jidUser, jidServer,
  isJidGroup, isJidLid, isJidNewsletter, isJidUser,
  isJidStatusBroadcast, isJidBroadcast,
  areJidsSameUser,
  formatJidPhone, jidDisplayName,
}
