"use strict"

const { normalizeJid, isLidJid, resolveLid } = require("./jid-utils")
const { getRealContentType, normalizeMsgType, unwrapViewOnce } = require("./type-detection")
const { extractBody } = require("./body-extractor")
const { hasMediaContent, _toBuffer, _bufToDataUrl } = require("./media-extractor")

// ════════════════════════════════════════════════════════════
// QUOTED MESSAGE EXTRACTOR
// ════════════════════════════════════════════════════════════

/**
 * extractQuoted — extract quoted/reply metadata from contextInfo.
 *
 * [FIX-IMAGEBUBBLE] quotedThumbnailB64 is ALWAYS null (never undefined).
 *
 * Original bug: the variable was declared inside the try block without an
 * initialiser, so any exception before the assignment left it as `undefined`.
 * That undefined propagated into the parsed object, through IPC, and arrived
 * in the renderer as `msg.quoted_thumbnail_b64 === undefined`. When the
 * QuotedMessage component checked `if (!thumb)` before a hook call, React
 * crashed with "Rendered fewer hooks than expected".
 *
 * Fix: assign `null` as the default value BEFORE the try block. The try block
 * can only set it to a real data: URI or leave it as null — never undefined.
 */
function extractQuoted(message, msgType, lidMapOverride) {
  if (!message) return null

  let m = message.ephemeralMessage?.message || message
  const vo = unwrapViewOnce(m)
  if (vo?.inner) m = vo.inner

  // ── Find contextInfo ─────────────────────────────────────
  let contextInfo = null

  if (m.extendedTextMessage?.contextInfo) {
    contextInfo = m.extendedTextMessage.contextInfo
  } else if (
    msgType !== "conversation" && msgType !== "viewOnceMessage" && msgType !== "viewOnceMessageV2" &&
    m[msgType]?.contextInfo
  ) {
    contextInfo = m[msgType].contextInfo
  }

  if (!contextInfo) {
    for (const key of Object.keys(m)) {
      const val = m[key]
      if (val && typeof val === "object" && !Array.isArray(val) && val.contextInfo) {
        contextInfo = val.contextInfo; break
      }
    }
  }

  if (!contextInfo?.quotedMessage) return null

  const qMsg = contextInfo.quotedMessage

  // ── Unwrap viewOnce inside quoted ─────────────────────────
  let qEffective  = qMsg
  let qIsViewOnce = false
  const qVo = unwrapViewOnce(qMsg)
  if (qVo?.inner) { qEffective = qVo.inner; qIsViewOnce = true }

  const qRawType   = getRealContentType(qEffective)
  const qActualKey = qRawType?.includes(":") ? qRawType.split(":")[1] : (qRawType || "")
  let   qMsgType   = normalizeMsgType(qActualKey || qRawType)

  // [FIX-PTT] Detect PTT in quoted audio
  if (qMsgType === "audioMessage" && qEffective[qActualKey]?.ptt === true) qMsgType = "pttMessage"

  const qMsgTypeForDB = qIsViewOnce ? "viewOnceMessage" : qMsgType
  const qBody = extractBody(qEffective, qMsgType)

  // ── STATUS-REPLY detection ────────────────────────────────
  const isStatusReply = contextInfo.remoteJid === "status@broadcast"

  // ── Thumbnail ─────────────────────────────────────────────
  // [FIX-IMAGEBUBBLE] DEFAULT null BEFORE try block — guaranteed to be null on
  // any failure path, never undefined. This is the critical fix.
  let quotedThumbnailB64 = null
  try {
    const qMediaObj = qEffective[qActualKey]
    if (qMediaObj?.jpegThumbnail) {
      // _bufToDataUrl already enforces MAX_THUMBNAIL_BYTES guard
      quotedThumbnailB64 = _bufToDataUrl(_toBuffer(qMediaObj.jpegThumbnail)) || null
    }
  } catch (_) {
    quotedThumbnailB64 = null  // explicit reassign so the value is always null not undefined
  }

  // ── Status music attribution ─────────────────────────────
  let statusMusicInfo = null
  try {
    if (isStatusReply) {
      const qMediaObj = qEffective[qActualKey]
      const ann = qMediaObj?.annotations?.[0]
      const music = ann?.embeddedContent?.embeddedMusic || ann?.music
      if (music?.title) statusMusicInfo = { title: music.title, author: music.author || music.authorName || null }
    }
  } catch (_) {}

  // ── Quoted sender ─────────────────────────────────────────
  let qSender = contextInfo.participant || null
  if (!isStatusReply && !qSender) qSender = contextInfo.remoteJid || null
  if (qSender) {
    qSender = normalizeJid(qSender)
    if (isLidJid(qSender) && lidMapOverride) qSender = resolveLid(qSender, lidMapOverride)
  }

  return {
    id:                 contextInfo.stanzaId  || null,
    sender:             qSender               || null,
    body:               qBody                 || null,
    msgType:            qMsgTypeForDB         || null,
    hasMedia:           hasMediaContent(qMsgType),
    mimetype:           qEffective[qActualKey]?.mimetype || null,
    mentionedJid:       contextInfo.mentionedJid || [],
    isViewOnce:         qIsViewOnce,
    isStatusReply,
    // [FIX-IMAGEBUBBLE] Always null (never undefined) — guaranteed by default above
    quotedThumbnailB64,
    statusMusicInfo:    statusMusicInfo || null,
  }
}

module.exports = { extractQuoted }
