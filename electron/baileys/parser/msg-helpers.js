"use strict"

// ════════════════════════════════════════════════════════════
// MSG HELPERS — message content helpers used by parsers/client
// ════════════════════════════════════════════════════════════
// Covers:
//   normalizeMessageContent  — unwrap all future-proof wrapper layers
//   extractMessageContent    — extract inner media/text from template/buttons
//   generateForwardMessageContent — prepare a message for forwarding
//   updateMessageWithReceipt — merge a read receipt into a WAMessage
//   updateMessageWithReaction — apply/remove an emoji reaction to a WAMessage
//   updateMessageWithPollUpdate — merge a poll vote into a WAMessage
//   extractDeviceJids        — extract list of {user,device} from usync result
//   getSenderInfo            — get { jid, lid } for a message

const { normalizeJid, isLidJid, resolveLid, jidDecode, jidEncode } = require("./jid-utils")
const { getRealContentType, normalizeMsgType } = require("./type-detection")
const { toNumber } = require("./proto-utils")

let _proto, _Boom
try { _proto = (await import("baileys")).proto } catch (_) {}
try { _Boom  = require("@hapi/boom").Boom } catch (_) {}

function _boom(msg, statusCode = 400) {
  if (_Boom) return new _Boom(msg, { statusCode })
  return Object.assign(new Error(msg), { statusCode })
}

// ── normalizeMessageContent ───────────────────────────────────────────────────

// Every wrapper type that Baileys might produce over time.
// We iterate up to 5 times to handle nested wrappers.
const WRAPPER_KEYS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
  "editedMessage",
  "groupMentionedMessage",
  "botInvokeMessage",
  "lottieStickerMessage",
  "eventCoverImage",
  "statusMentionMessage",
  "pollCreationOptionImageMessage",
  "associatedChildMessage",
  "groupStatusMentionMessage",
  "pollCreationMessageV4",
  "pollCreationMessageV5",
  "statusAddYours",
  "groupStatusMessage",
  "limitSharingMessage",
  "botTaskMessage",
  "questionMessage",
  "groupStatusMessageV2",
  "botForwardedMessage",
]

/**
 * normalizeMessageContent — unwrap any nested future-proof Baileys wrapper layers.
 *
 * Runs up to 5 iterations. Each iteration checks if the current content is a
 * known wrapper type and unwraps it. Stops early if no further unwrap is possible.
 *
 * @param {object|null} content
 * @returns {object|null}
 */
function normalizeMessageContent(content) {
  if (!content) return undefined

  for (let i = 0; i < 5; i++) {
    const inner = _getFutureProofMessage(content)
    if (!inner) break
    content = inner.message
  }
  return content
}

function _getFutureProofMessage(message) {
  if (!message) return null
  for (const key of WRAPPER_KEYS) {
    if (message[key]) return message[key]
  }
  return null
}

// ── extractMessageContent ─────────────────────────────────────────────────────

/**
 * extractMessageContent — extract the actual displayable content from template/buttons wrappers.
 *
 * Handles:
 *   - buttonsMessage → inner image/document/video/location, or conversation
 *   - templateMessage → hydratedFourRowTemplate / hydratedTemplate / fourRowTemplate
 *
 * @param {object} content
 * @returns {object}  WAMessage with the concrete message type
 */
function extractMessageContent(content) {
  const _extract = (msg) => {
    if (msg.imageMessage)    return { imageMessage: msg.imageMessage }
    if (msg.documentMessage) return { documentMessage: msg.documentMessage }
    if (msg.videoMessage)    return { videoMessage: msg.videoMessage }
    if (msg.locationMessage) return { locationMessage: msg.locationMessage }
    return {
      conversation: "contentText" in msg
        ? msg.contentText
        : ("hydratedContentText" in msg ? msg.hydratedContentText : "")
    }
  }

  content = normalizeMessageContent(content)
  if (!content) return content

  if (content?.buttonsMessage)
    return _extract(content.buttonsMessage)

  if (content?.templateMessage?.hydratedFourRowTemplate)
    return _extract(content.templateMessage.hydratedFourRowTemplate)

  if (content?.templateMessage?.hydratedTemplate)
    return _extract(content.templateMessage.hydratedTemplate)

  if (content?.templateMessage?.fourRowTemplate)
    return _extract(content.templateMessage.fourRowTemplate)

  return content
}

// ── generateForwardMessageContent ────────────────────────────────────────────

/**
 * generateForwardMessageContent — clone and prepare a message for forwarding.
 *
 * Increments the forwardingScore. Converts bare `conversation` to
 * `extendedTextMessage` (required for forwarded text to display correctly).
 *
 * @param {object} message      - WAMessage to forward
 * @param {boolean} forceForward - if true, always increment score (even fromMe)
 * @returns {object}  cloned WAMessage ready to send
 */
function generateForwardMessageContent(message, forceForward) {
  let content = message.message
  if (!content) throw _boom("no content in message", 400)

  // Deep clone via proto encode/decode
  content = normalizeMessageContent(content)
  if (_proto?.Message) {
    content = _proto.Message.decode(_proto.Message.encode(content).finish())
  } else {
    content = JSON.parse(JSON.stringify(content))
  }

  let key = Object.keys(content)[0]
  let score = content[key]?.contextInfo?.forwardingScore || 0
  score += (message.key?.fromMe && !forceForward) ? 0 : 1

  if (key === "conversation") {
    content.extendedTextMessage = { text: content[key] }
    delete content.conversation
    key = "extendedTextMessage"
  }

  content[key].contextInfo = score > 0
    ? { forwardingScore: score, isForwarded: true }
    : {}

  return content
}

// ── updateMessageWithReceipt ──────────────────────────────────────────────────

/**
 * updateMessageWithReceipt — merge a user receipt into msg.userReceipt array.
 * Matches Baileys' own updateMessageWithReceipt implementation.
 *
 * @param {object} msg     - WAMessage (mutable)
 * @param {object} receipt - UserReceipt (has .userJid)
 */
function updateMessageWithReceipt(msg, receipt) {
  msg.userReceipt = msg.userReceipt || []
  const existing = msg.userReceipt.find(m => m.userJid === receipt.userJid)
  if (existing) {
    Object.assign(existing, receipt)
  } else {
    msg.userReceipt.push(receipt)
  }
}

// ── updateMessageWithReaction ─────────────────────────────────────────────────

/**
 * updateMessageWithReaction — apply or remove an emoji reaction.
 * One reaction per author — new emoji replaces old; empty emoji removes it.
 *
 * @param {object} msg      - WAMessage (mutable)
 * @param {object} reaction - WAMessageReaction ({ key, text })
 */
function updateMessageWithReaction(msg, reaction) {
  const authorID = _getKeyAuthor(reaction.key)
  const reactions = (msg.reactions || [])
    .filter(r => _getKeyAuthor(r.key) !== authorID)
  reaction.text = reaction.text || ""
  reactions.push(reaction)
  msg.reactions = reactions
}

// ── updateMessageWithPollUpdate ───────────────────────────────────────────────

/**
 * updateMessageWithPollUpdate — merge a poll vote update into msg.pollUpdates.
 * Replaces any prior vote from the same sender.
 *
 * @param {object} msg    - WAMessage (mutable)
 * @param {object} update - PollUpdateMessage
 */
function updateMessageWithPollUpdate(msg, update) {
  const authorID = _getKeyAuthor(update.pollUpdateMessageKey)
  const reactions = (msg.pollUpdates || [])
    .filter(r => _getKeyAuthor(r.pollUpdateMessageKey) !== authorID)
  if (update.vote?.selectedOptions?.length) {
    reactions.push(update)
  }
  msg.pollUpdates = reactions
}

function _getKeyAuthor(key) {
  return key?.participant || key?.remoteJid || ""
}

// ── extractDeviceJids ─────────────────────────────────────────────────────────

/**
 * extractDeviceJids — extract a flat list of {user, device} pairs from a
 * Baileys usync devicelist result.
 *
 * Used when building the list of devices to encrypt a message for.
 * Zero-device entries are filtered unless excludeZeroDevices=false.
 *
 * @param {Array}  result            - usync result array
 * @param {string} myJid             - own JID
 * @param {boolean} excludeZeroDevices
 * @returns {{ user: string, device: number|undefined }[]}
 */
function extractDeviceJids(result, myJid, excludeZeroDevices) {
  let _jidDecodeLocal
  try { _jidDecodeLocal = (await import("baileys")).jidDecode } catch (_) { _jidDecodeLocal = jidDecode }

  const { user: myUser, device: myDevice } = (_jidDecodeLocal(myJid) || {})
  const extracted = []

  for (const userResult of result) {
    const { devices, id } = userResult
    const { user } = (_jidDecodeLocal(id) || {})
    const deviceList = devices?.deviceList

    if (Array.isArray(deviceList)) {
      for (const { id: device, keyIndex } of deviceList) {
        if (
          (!excludeZeroDevices || device !== 0) &&
          (myUser !== user || myDevice !== device) &&
          (device === 0 || !!keyIndex)
        ) {
          extracted.push({ user, device })
        }
      }
    }
  }

  return extracted
}

// ── getSenderInfo ─────────────────────────────────────────────────────────────

/**
 * getSenderInfo — get sender { jid, lid } from a message.
 *
 * lid is the sender's opaque @lid identifier (if they are known by lid).
 * jid is the resolved @s.whatsapp.net form.
 *
 * @param {object} message - WAMessage
 * @returns {{ jid: string, lid: string|null }}
 */
function getSenderInfo(message) {
  const sender = message.key?.participant || message.key?.remoteJid
  const jid    = sender ? normalizeJid(sender) : ""

  let lid = null
  try {
    const decoded = jidDecode(sender || "")
    if (decoded?.user) {
      lid = jidEncode(decoded.user, "lid")
    }
  } catch (_) {}

  return { jid, lid }
}

module.exports = {
  normalizeMessageContent,
  extractMessageContent,
  generateForwardMessageContent,
  updateMessageWithReceipt,
  updateMessageWithReaction,
  updateMessageWithPollUpdate,
  extractDeviceJids,
  getSenderInfo,
}
