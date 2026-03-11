"use strict"

const { unwrapViewOnce } = require("./type-detection")
const { normalizeJid, isLidJid, resolveLid } = require("./jid-utils")

// ════════════════════════════════════════════════════════════
// MISC EXTRACTORS
// Mentions, Poll, Location, Contact, Reaction, ForwardInfo
// ════════════════════════════════════════════════════════════

// ── Shared inner-message resolver ─────────────────────────────────────────────
// Since messageParser.js already unwraps viewOnce before calling extractors for
// live messages, this is mainly a safety net for DB re-hydration and direct calls.
function resolveInner(message) {
  if (!message) return message
  const base = message.ephemeralMessage?.message || message
  const vo = unwrapViewOnce(base)
  return vo?.inner || base
}

// ── Mentions ──────────────────────────────────────────────────────────────────

/**
 * extractMentions — extract all @mention JIDs from contextInfo.mentionedJid.
 * Works for both live (already unwrapped) and DB-re-hydrated messages.
 */
function extractMentions(message, msgType) {
  if (!message) return []

  const m = resolveInner(message)

  const mentions = []
  const tryPush = (obj) => {
    if (obj?.contextInfo?.mentionedJid?.length) {
      mentions.push(...obj.contextInfo.mentionedJid)
    }
  }

  tryPush(m.extendedTextMessage)
  tryPush(m.imageMessage)
  tryPush(m.videoMessage)
  tryPush(m.documentMessage)
  tryPush(m.audioMessage)
  tryPush(m.buttonsMessage)
  tryPush(m.listMessage)
  tryPush(m.interactiveMessage)

  // Generic scan for any contextInfo with mentionedJid (covers edge cases)
  if (mentions.length === 0) {
    for (const key of Object.keys(m)) {
      const val = m[key]
      if (val && typeof val === "object" && !Array.isArray(val) && val.contextInfo?.mentionedJid?.length) {
        mentions.push(...val.contextInfo.mentionedJid)
      }
    }
  }

  return [...new Set(mentions)].map(jid => {
    const norm = normalizeJid(jid)
    // normalizeJid already resolves @lid via _globalLidMap — but double-check
    // in case the map wasn't seeded yet (race on first startup)
    if (isLidJid(norm)) return resolveLid(norm)
    return norm
  }).filter(Boolean)
}

// ── Poll ──────────────────────────────────────────────────────────────────────

function extractPollOptions(message) {
  if (!message) return []

  const pm = message.pollCreationMessageV3
    || message.pollCreationMessageV2
    || message.pollCreationMessage

  if (!pm?.options) return []

  return pm.options.map((opt, idx) => ({
    idx,
    name:  opt.optionName || opt.name || `Opsi ${idx + 1}`,
    votes: 0,
  }))
}

// ── Location ──────────────────────────────────────────────────────────────────

function extractLocation(message, msgType) {
  if (msgType !== "locationMessage" && msgType !== "liveLocationMessage") return null

  const loc = message.locationMessage || message.liveLocationMessage
  if (!loc) return null

  return {
    lat:      loc.degreesLatitude  || null,
    lng:      loc.degreesLongitude || null,
    name:     loc.name             || null,
    address:  loc.address          || null,
    url:      loc.url              || null,
    accuracy: loc.accuracyInMeters || null,
    isLive:   msgType === "liveLocationMessage",
    speed:    loc.speedInMps       || null,
  }
}

// ── Contact ───────────────────────────────────────────────────────────────────

function extractContacts(message, msgType) {
  if (msgType === "contactMessage") {
    const c = message.contactMessage
    return [{ displayName: c?.displayName || "", vcard: c?.vcard || "" }]
  }
  if (msgType === "contactsArrayMessage") {
    return (message.contactsArrayMessage?.contacts || []).map(c => ({
      displayName: c.displayName || "",
      vcard:       c.vcard       || "",
    }))
  }
  return []
}

// ── Reaction ──────────────────────────────────────────────────────────────────

function extractReaction(message) {
  const r = message.reactionMessage
  if (!r) return null
  return {
    text:     r.text    || "",
    targetId: r.key?.id || null,
    isRemove: !r.text,
  }
}

// ── Forward info ──────────────────────────────────────────────────────────────

/**
 * extractForwardInfo — extract isForwarded and forwardingScore.
 * Handles all message types including viewOnce (v1/v2/v2Extension).
 * Live messages arrive already unwrapped, but we also handle raw for safety.
 */
function extractForwardInfo(message, msgType) {
  const m = resolveInner(message)

  // Fast paths for common types
  let contextInfo = null
  if (m.extendedTextMessage?.contextInfo) {
    contextInfo = m.extendedTextMessage.contextInfo
  } else if (msgType !== "conversation" && msgType !== "viewOnceMessage" && msgType !== "viewOnceMessageV2" && m[msgType]?.contextInfo) {
    contextInfo = m[msgType].contextInfo
  }

  // Generic scan — needed when msgType is mismatched after viewOnce unwrap
  if (!contextInfo) {
    for (const key of Object.keys(m)) {
      const val = m[key]
      if (val && typeof val === "object" && !Array.isArray(val) && val.contextInfo) {
        contextInfo = val.contextInfo
        break
      }
    }
  }

  if (!contextInfo) return { isForwarded: false, forwardingScore: 0 }

  return {
    isForwarded:     contextInfo.isForwarded || (contextInfo.forwardingScore > 0) || false,
    forwardingScore: contextInfo.forwardingScore || 0,
  }
}

module.exports = {
  extractMentions,
  extractPollOptions,
  extractLocation,
  extractContacts,
  extractReaction,
  extractForwardInfo,
}