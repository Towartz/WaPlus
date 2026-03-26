"use strict"

// ════════════════════════════════════════════════════════════
// PROTO UTILS — helpers for WAProto Long fields & message IDs
// ════════════════════════════════════════════════════════════

// ── toNumber ─────────────────────────────────────────────────────────────────
/**
 * toNumber — safely convert a proto Long (or any numeric-ish value) to a JS number.
 *
 * WAProto encodes 64-bit integers as proto.Long objects with { low, high, toNumber() }.
 * Plain numbers, null, and undefined are also handled gracefully.
 *
 * @param {proto.Long|number|null|undefined} t
 * @returns {number}
 */
function toNumber(t) {
  if (typeof t === "object" && t) {
    if (typeof t.toNumber === "function") return t.toNumber()
    if (typeof t.low === "number")        return t.low
  }
  return t || 0
}

// ── generateMessageIDV2 ───────────────────────────────────────────────────────
const { randomBytes, createHash } = require("crypto")
let _jidDecode
try { _jidDecode = (await import("baileys")).jidDecode } catch (_) {}

/**
 * generateMessageIDV2 — generate a Baileys-compatible message ID.
 *
 * Format: "3EB0" + first 18 hex chars of SHA256( timestamp + userId + random16 )
 * Compatible with the Baileys generateMessageIDV2() function used internally.
 *
 * @param {string} [userId] - optional JID of the sending user (for entropy)
 * @returns {string}  e.g. "3EB0A1B2C3D4E5F607080"
 */
function generateMessageIDV2(userId) {
  const data = Buffer.alloc(8 + 20 + 16)
  data.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000)))
  if (userId && _jidDecode) {
    try {
      const id = _jidDecode(userId)
      if (id?.user) {
        data.write(id.user, 8)
        data.write("@c.us", 8 + id.user.length)
      }
    } catch (_) {}
  }
  const random = randomBytes(16)
  random.copy(data, 28)
  const hash = createHash("sha256").update(data).digest()
  return "3EB0" + hash.toString("hex").toUpperCase().substring(0, 18)
}

// ── getStatusFromType ─────────────────────────────────────────────────────────

// WAProto.WebMessageInfo.Status enum values
const STATUS_MAP = {
  error:        0,
  pending:      1,
  server_ack:   2,
  delivery_ack: 3,
  read:         4,
  played:       5,
}

let _proto
try { _proto = (await import("baileys")).proto } catch (_) {}

const WA_STATUS = _proto?.WebMessageInfo?.Status || {
  ERROR:        0,
  PENDING:      1,
  SERVER_ACK:   2,
  DELIVERY_ACK: 3,
  READ:         4,
  PLAYED:       5,
}

/**
 * getStatusFromType — convert a Baileys message status string to proto enum value.
 *
 * @param {string|undefined} type
 * @returns {number}  WA status enum, defaults to DELIVERY_ACK (3) if unknown
 */
function getStatusFromType(type) {
  if (typeof type === "undefined") return WA_STATUS.DELIVERY_ACK
  const status = STATUS_MAP[type]
  return status !== undefined ? status : WA_STATUS.DELIVERY_ACK
}

// ── getCallStatusFromNode ─────────────────────────────────────────────────────

/**
 * getCallStatusFromNode — parse WA binary node tag into a human-readable call status.
 *
 * @param {{ tag: string, attrs: Record<string, string> }} node
 * @returns {"offer"|"ringing"|"accept"|"reject"|"terminate"|"timeout"}
 */
function getCallStatusFromNode({ tag, attrs }) {
  switch (tag) {
    case "offer":
    case "offer_notice":
      return "offer"
    case "terminate":
      return attrs?.reason === "timeout" ? "timeout" : "terminate"
    case "reject":
      return "reject"
    case "accept":
      return "accept"
    default:
      return "ringing"
  }
}

// ── getUrlFromDirectPath ──────────────────────────────────────────────────────

const WA_MMG_BASE = "https://mmg.whatsapp.net"

/**
 * getUrlFromDirectPath — build a full WhatsApp CDN URL from a directPath.
 *
 * @param {string|null|undefined} directPath
 * @returns {string|null}
 */
function getUrlFromDirectPath(directPath) {
  if (!directPath) return null
  if (directPath.startsWith("https://")) return directPath
  const slash = directPath.startsWith("/") ? "" : "/"
  return `${WA_MMG_BASE}${slash}${directPath}`
}

// ── extractURL ────────────────────────────────────────────────────────────────
let _URL_REGEX
try {
  _URL_REGEX = (await import("baileys")).URL_REGEX
} catch (_) {
  // Fallback regex if Baileys doesn't export it
  _URL_REGEX = /https?:\/\/[^\s/$.?#].[^\s]*/i
}
/**
 * extractURL — extract the first URL from a text string.
 *
 * @param {string} text
 * @returns {string|undefined}
 */
function extractURL(text) {
  return text?.match(_URL_REGEX)?.[0]
}

module.exports = {
  toNumber,
  generateMessageIDV2,
  getStatusFromType,
  getCallStatusFromNode,
  getUrlFromDirectPath,
  extractURL,
}
