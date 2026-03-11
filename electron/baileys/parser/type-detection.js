"use strict"

const { getContentType } = require("baileys")

// ════════════════════════════════════════════════════════════
// TYPE DETECTION
// ════════════════════════════════════════════════════════════

// ── ViewOnce unwrap ──────────────────────────────────────────────────────────
// All three viewOnce variants share the same inner structure.
// Returns { wrapper, inner } or null if not a viewOnce message.
//   wrapper = "viewOnceMessage" | "viewOnceMessageV2" | "viewOnceMessageV2Extension"
//   inner   = the unwrapped inner message object
function unwrapViewOnce(message) {
  if (!message) return null
  if (message.viewOnceMessage?.message)
    return { wrapper: "viewOnceMessage",           inner: message.viewOnceMessage.message }
  if (message.viewOnceMessageV2?.message)
    return { wrapper: "viewOnceMessageV2",          inner: message.viewOnceMessageV2.message }
  if (message.viewOnceMessageV2Extension?.message)
    return { wrapper: "viewOnceMessageV2Extension", inner: message.viewOnceMessageV2Extension.message }
  return null
}

/**
 * getRealContentType — unwrap all wrapper layers (ephemeral, all viewOnce variants)
 * and return the true inner content type.
 *
 * For viewOnce returns:  "viewOnceMessage:<innerType>"
 *   e.g. "viewOnceMessage:imageMessage"
 *        "viewOnceMessage:videoMessage"
 *        "viewOnceMessage:audioMessage"
 *
 * The wrapper variant (v1/v2/v2Extension) is collapsed into the same
 * "viewOnceMessage" prefix — distinction is only relevant for download.
 */
function getRealContentType(message) {
  if (!message) return null

  // Unwrap ephemeral first
  if (message.ephemeralMessage?.message)
    return getRealContentType(message.ephemeralMessage.message)

  // Unwrap any viewOnce variant (v1, v2, v2Extension)
  const vo = unwrapViewOnce(message)
  if (vo) {
    const innerType = getContentType(vo.inner)
    return innerType ? `viewOnceMessage:${innerType}` : "viewOnceMessage"
  }

  if (message.documentWithCaptionMessage?.message?.documentMessage)
    return "documentMessage"

  if (message.highlyStructuredMessage) return "templateMessage"
  if (message.interactiveResponseMessage) return "interactiveResponseMessage"

  return getContentType(message) || null
}

// Alias map: raw proto type → canonical DB type
const TYPE_ALIASES = {
  conversation:                      "conversation",
  extendedTextMessage:               "extendedTextMessage",
  imageMessage:                      "imageMessage",
  videoMessage:                      "videoMessage",
  audioMessage:                      "audioMessage",
  pttMessage:                        "pttMessage",
  documentMessage:                   "documentMessage",
  documentWithCaptionMessage:        "documentMessage",
  stickerMessage:                    "stickerMessage",
  locationMessage:                   "locationMessage",
  liveLocationMessage:               "liveLocationMessage",
  contactMessage:                    "contactMessage",
  contactsArrayMessage:              "contactsArrayMessage",
  pollCreationMessage:               "pollCreationMessage",
  pollCreationMessageV2:             "pollCreationMessage",
  pollCreationMessageV3:             "pollCreationMessage",
  pollUpdateMessage:                 "pollUpdateMessage",
  reactionMessage:                   "reactionMessage",
  groupInviteMessage:                "groupInviteMessage",
  buttonsMessage:                    "buttonsMessage",
  buttonsResponseMessage:            "buttonsResponseMessage",
  listMessage:                       "listMessage",
  listResponseMessage:               "listResponseMessage",
  templateMessage:                   "templateMessage",
  templateButtonReplyMessage:        "templateButtonReplyMessage",
  interactiveMessage:                "interactiveMessage",
  interactiveResponseMessage:        "interactiveResponseMessage",
  orderMessage:                      "orderMessage",
  productMessage:                    "productMessage",
  paymentMessage:                    "paymentMessage",
  requestPaymentMessage:             "requestPaymentMessage",
  sendPaymentMessage:                "sendPaymentMessage",
  declinePaymentRequestMessage:      "paymentMessage",
  cancelPaymentRequestMessage:       "paymentMessage",
  callLogMessage:                    "callLogMessage",
  scheduledCallCreationMessage:      "scheduledCallCreationMessage",
  scheduledCallEditMessage:          "scheduledCallEditMessage",
  eventMessage:                      "eventMessage",
  keepInChatMessage:                 "keepInChatMessage",
  pinInChatMessage:                  "pinInChatMessage",
  newsletterAdminInviteMessage:      "newsletterAdminInviteMessage",
  protocolMessage:                   "protocol",
  messageContextInfo:                "messageContextInfo",
  ephemeralMessage:                  "ephemeral",
  viewOnceMessage:                   "viewOnceMessage",
  viewOnceMessageV2:                 "viewOnceMessageV2",
  viewOnceMessageV2Extension:        "viewOnceMessageV2",
  albumMessage:                      "albumMessage",
  encCommentMessage:                 "encCommentMessage",
  statusMentionMessage:              "statusMentionMessage",
  groupMentionedMessage:             "groupMentionedMessage",
  bcallMessage:                      "bcallMessage",
  placeholderMessage:                "placeholderMessage",
  encEventUpdateMessage:             "encEventUpdateMessage",
  botInvokeMessage:                  "botInvokeMessage",
  encReactionMessage:                "encReactionMessage",
  messageHistoryBundle:              "messageHistoryBundle",
  invoiceMessage:                    "invoiceMessage",
  productCatalogMessage:             "productCatalogMessage",
  paymentInviteMessage:              "paymentInviteMessage",
  callToAction:                      "callToAction",
  nativeFlowMessage:                 "nativeFlowMessage",
}

/**
 * normalizeMsgType — normalize raw content type to canonical DB type.
 */
function normalizeMsgType(rawType) {
  if (!rawType) return "unknown"
  // "viewOnceMessage:imageMessage" → "viewOnceMessage"
  if (rawType.startsWith("viewOnceMessage:")) return "viewOnceMessage"
  return TYPE_ALIASES[rawType] || rawType
}

/**
 * isViewOnceType — true for any viewOnce normalized type.
 */
function isViewOnceType(msgType) {
  return msgType === "viewOnceMessage" || msgType === "viewOnceMessageV2"
}

module.exports = { getRealContentType, normalizeMsgType, isViewOnceType, unwrapViewOnce, TYPE_ALIASES }
