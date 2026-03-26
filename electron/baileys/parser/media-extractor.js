"use strict"

import { getContentType } from "baileys"

// Pull Baileys thumbnail generators — used as fallback when jpegThumbnail is absent.
let _extractImageThumb, _extractVideoThumb, _generateThumbnail
try {
  const baileys = await import("baileys")
  _extractImageThumb = baileys.extractImageThumb
  _extractVideoThumb = baileys.extractVideoThumb
  _generateThumbnail = baileys.generateThumbnail
} catch (_) {}
// Jimp for thumbnail resizing — already a project dependency.
// Loaded lazily so parse errors don't crash the whole module.
let Jimp = null
try { Jimp = require("jimp") } catch (_) {}

// ════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════

const MEDIA_TYPES = new Set([
  "imageMessage", "videoMessage", "audioMessage", "pttMessage",
  "documentMessage", "stickerMessage",
  "viewOnceMessage", "viewOnceMessageV2",
])

// [FIX-THUMBNAIL-SIZE] Max INPUT bytes before resize (5 MB guard).
// After resize output is always <15 KB.
const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024
// Target thumbnail dimensions and quality — matches WhatsApp's own preview size
const THUMB_SIZE    = 100   // px, longest side
const THUMB_QUALITY = 60    // JPEG quality 0-100

// ════════════════════════════════════════════════════════════
// BUFFER HELPERS
// ════════════════════════════════════════════════════════════

/**
 * _toBuffer — coerce any buffer-like value to a Node Buffer.
 * Handles Buffer, Uint8Array, ArrayBuffer, base64 string, byte array.
 * Never throws. Returns null on empty/falsy/unconvertible input.
 */
function _toBuffer(raw) {
  if (!raw) return null
  try {
    if (Buffer.isBuffer(raw))       return raw.length > 0 ? raw : null
    if (raw instanceof Uint8Array)  return raw.length > 0 ? Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength) : null
    if (raw instanceof ArrayBuffer) return raw.byteLength > 0 ? Buffer.from(new Uint8Array(raw)) : null
    if (typeof raw === "string" && raw.length > 0) {
      const buf = Buffer.from(raw, "base64"); return buf.length > 0 ? buf : null
    }
    if (Array.isArray(raw) && raw.length > 0) {
      const buf = Buffer.from(raw); return buf.length > 0 ? buf : null
    }
  } catch (_) {}
  return null
}

/**
 * _detectMime — sniff MIME from magic bytes. Falls back to image/jpeg.
 */
function _detectMime(buf) {
  if (!buf || buf.length < 4) return "image/jpeg"
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png"
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "image/gif"
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return "image/webp"
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg"
  if (buf[0] === 0x42 && buf[1] === 0x4d) return "image/bmp"
  return "image/jpeg"
}

/**
 * _resizeThumb — resize a raw image buffer to THUMB_SIZE px using Jimp.
 * Returns a small JPEG Buffer. Falls back to the original if Jimp fails.
 * Never throws.
 */
async function _resizeThumb(buf) {
  if (!Jimp || !buf || buf.length === 0) return buf
  try {
    const img    = await Jimp.read(buf)
    const w      = img.getWidth()
    const h      = img.getHeight()
    // Only downscale — never upscale tiny thumbnails
    if (w <= THUMB_SIZE && h <= THUMB_SIZE) {
      return await img.getBufferAsync(Jimp.MIME_JPEG)
    }
    const scale  = THUMB_SIZE / Math.max(w, h)
    const resized = img.resize(Math.round(w * scale), Math.round(h * scale))
    resized.quality(THUMB_QUALITY)
    return await resized.getBufferAsync(Jimp.MIME_JPEG)
  } catch (_) {
    return buf  // fall back to original on any error
  }
}

/**
 * _bufToDataUrl — Buffer → data: URI.
 * Synchronous fast-path (no resize) — used for already-small jpegThumbnail fields.
 * For full pipeline with resize use _bufToDataUrlResized.
 *
 * [FIX-IMAGEBUBBLE] Always returns null (never undefined/throws).
 */
function _bufToDataUrl(buf) {
  try {
    const b = _toBuffer(buf)
    if (!b || b.length === 0) return null
    if (b.length > MAX_THUMBNAIL_BYTES) {
      console.warn(`[media-extractor] thumbnail too large (${b.length} bytes) — dropped`)
      return null
    }
    return `data:${_detectMime(b)};base64,${b.toString("base64")}`
  } catch (_) { return null }
}

/**
 * _bufToDataUrlResized — async version: resizes to THUMB_SIZE before encoding.
 * Output is always a small JPEG data: URI regardless of input size.
 */
async function _bufToDataUrlResized(buf) {
  try {
    const b = _toBuffer(buf)
    if (!b || b.length === 0) return null
    if (b.length > MAX_THUMBNAIL_BYTES) {
      console.warn(`[media-extractor] thumbnail input too large (${b.length} bytes) — dropped`)
      return null
    }
    const resized = await _resizeThumb(b)
    if (!resized || resized.length === 0) return null
    return `data:image/jpeg;base64,${resized.toString("base64")}`
  } catch (_) { return null }
}

/**
 * _thumbFromJpegField — extract thumbnail from mediaObj.jpegThumbnail.
 *
 * [FIX-IMAGEBUBBLE] Returns null on any failure — never throws and never
 * returns undefined. The old code propagated exceptions up through
 * extractMediaInfo → parseMessage → IPC → renderer, arriving at ImageBubble
 * as undefined which triggered the "Rendered fewer hooks" React crash when
 * an early guard `if (!thumb) return` fired before all hook calls.
 */
function _thumbFromJpegField(mediaObj) {
  if (!mediaObj) return null
  try {
    const raw = mediaObj.jpegThumbnail
    if (!raw) return null
    return _bufToDataUrl(_toBuffer(raw))
  } catch (_) { return null }
}

// ════════════════════════════════════════════════════════════
// ASYNC THUMBNAIL PIPELINE
// ════════════════════════════════════════════════════════════

/**
 * _generateThumbAsync — produce thumbnail with full Baileys pipeline.
 * Order: jpegThumbnail → extractImageThumb → extractVideoThumb → generateThumbnail.
 * Each step individually try/caught. Returns null if all fail.
 */
async function _generateThumbAsync(mediaObj, actualType, fileBuf) {
  // [FIX-THUMB-RESIZE] All paths now go through _bufToDataUrlResized which
  // resizes to THUMB_SIZE px JPEG before encoding — output is always <15 KB.

  // Step 1: jpegThumbnail from proto (already a small JPEG from WA server, but resize anyway)
  const rawJpeg = mediaObj?.jpegThumbnail ? _toBuffer(mediaObj.jpegThumbnail) : null
  if (rawJpeg && rawJpeg.length > 0) {
    const d = await _bufToDataUrlResized(rawJpeg)
    if (d) return d
  }

  const fb = _toBuffer(fileBuf)
  if (!fb || fb.length === 0) return null

  const isImage = actualType === "imageMessage" || (actualType || "").startsWith("viewOnce_image")
  const isVideo = actualType === "videoMessage" || (actualType || "").startsWith("viewOnce_video")

  // Step 2: Baileys image extractor
  if (isImage && typeof _extractImageThumb === "function") {
    try {
      const r = await _extractImageThumb(fb)
      const d = await _bufToDataUrlResized(_toBuffer(r))
      if (d) return d
    } catch (_) {}
  }

  // Step 3: Baileys video frame extractor
  if (isVideo && typeof _extractVideoThumb === "function") {
    try {
      const r = await _extractVideoThumb(fb)
      const d = await _bufToDataUrlResized(_toBuffer(r))
      if (d) return d
    } catch (_) {}
  }

  // Step 4: Baileys generic thumbnail generator
  if (typeof _generateThumbnail === "function") {
    try {
      const result = await _generateThumbnail(fb, mediaObj?.mimetype || "")
      const raw    = _toBuffer(result?.thumbnail ?? result)
      const d      = await _bufToDataUrlResized(raw)
      if (d) return d
    } catch (_) {}
  }

  // Step 5: Last resort — resize raw file bytes directly (images only)
  if (isImage) {
    const d = await _bufToDataUrlResized(fb)
    if (d) return d
  }

  return null
}

// ════════════════════════════════════════════════════════════
// CORE EXTRACTOR
// ════════════════════════════════════════════════════════════

function hasMediaContent(msgType) { return MEDIA_TYPES.has(msgType) }

function _extractCore(message, msgType, isViewOnce) {
  if (!message || !hasMediaContent(msgType)) return null
  const m = message.ephemeralMessage?.message || message.documentWithCaptionMessage?.message || message
  let mediaObj = null, actualType = msgType

  switch (msgType) {
    case "imageMessage":    mediaObj = m.imageMessage;  break
    case "videoMessage":    mediaObj = m.videoMessage;  actualType = "videoMessage"; break
    case "audioMessage":    mediaObj = m.audioMessage;  actualType = m.audioMessage?.ptt ? "pttMessage" : "audioMessage"; break
    case "pttMessage":      mediaObj = m.audioMessage || m.pttMessage; actualType = "pttMessage"; break
    case "documentMessage": mediaObj = m.documentWithCaptionMessage?.message?.documentMessage || m.documentMessage; break
    case "stickerMessage":  mediaObj = m.stickerMessage; break
    case "viewOnceMessage": {
      const inner = m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || m.viewOnceMessageV2Extension?.message
      if (!inner) return null
      const t = getContentType(inner); mediaObj = inner[t]; actualType = `viewOnce_${t}`; isViewOnce = true; break
    }
    case "viewOnceMessageV2": {
      const inner = m.viewOnceMessageV2?.message || m.viewOnceMessageV2Extension?.message || m.viewOnceMessage?.message
      if (!inner) return null
      const t = getContentType(inner); mediaObj = inner[t]; actualType = `viewOnce_${t}`; isViewOnce = true; break
    }
    default: return null
  }
  if (!mediaObj) return null
  return { mediaObj, actualType, isViewOnce }
}

function _encodeBytes(raw) {
  const buf = _toBuffer(raw); return buf ? buf.toString("base64") : null
}

/**
 * _buildResult — construct final media info object.
 *
 * [FIX-IMAGEBUBBLE] thumbnailDataUrl is always explicitly null when absent.
 * A field arriving as undefined in the IPC payload causes React ImageBubble's
 * early guard to fire before all hooks are called, crashing with
 * "Rendered fewer hooks than expected". Coercing to null here is the
 * definitive backend fix — the frontend fix (hooks-before-returns) is defense-in-depth.
 */
function _buildResult(mediaObj, actualType, isViewOnce, thumbnailDataUrl, msgType) {
  return {
    actualType,
    mimetype:         mediaObj.mimetype    || null,
    fileSize:         mediaObj.fileLength  ? Number(mediaObj.fileLength) : null,
    duration:         mediaObj.seconds     || mediaObj.duration || null,
    fileName:         mediaObj.fileName    || null,
    width:            mediaObj.width       || null,
    height:           mediaObj.height      || null,
    url:              mediaObj.url         || null,
    // [FIX-EXPIRED-CDN] Crypto fields for re-download after CDN URL expiry
    mediaKey:         _encodeBytes(mediaObj.mediaKey),
    directPath:       mediaObj.directPath  || null,
    encSha256:        _encodeBytes(mediaObj.fileEncSha256),
    // [FIX-IMAGEBUBBLE] EXPLICIT null — never undefined
    thumbnailDataUrl: thumbnailDataUrl || null,
    isAnimated:       mediaObj.isAnimated  || false,
    isPtt:            actualType === "pttMessage",
    isGif:            (msgType === "videoMessage") && (
                        mediaObj.gifPlayback === true || !!mediaObj.gifAttribution ||
                        mediaObj.mimetype === "image/gif"
                      ),
    isViewOnce,
  }
}

// ════════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════════

/**
 * extractMediaInfo — synchronous extraction with jpegThumbnail only.
 *
 * [FIX-IMAGEBUBBLE] Wrapped in try/catch — any proto parsing error returns null
 * instead of propagating to IPC handler and arriving at renderer as an exception
 * that breaks React hooks invariants.
 */
function extractMediaInfo(message, msgType, isViewOnce = false) {
  try {
    const core = _extractCore(message, msgType, isViewOnce)
    if (!core) return null
    const { mediaObj, actualType, isViewOnce: voFlag } = core
    return _buildResult(mediaObj, actualType, voFlag, _thumbFromJpegField(mediaObj), msgType)
  } catch (err) {
    console.warn("[media-extractor] extractMediaInfo error:", err?.message)
    return null
  }
}

/**
 * extractMediaInfoAsync — full async extraction with Baileys thumbnail pipeline.
 * Async errors caught — Promise always resolves to null on failure, never rejects.
 */
async function extractMediaInfoAsync(message, msgType, isViewOnce = false, fileBuf = null) {
  try {
    const core = _extractCore(message, msgType, isViewOnce)
    if (!core) return null
    const { mediaObj, actualType, isViewOnce: voFlag } = core
    const thumb = await _generateThumbAsync(mediaObj, actualType, _toBuffer(fileBuf))
    return _buildResult(mediaObj, actualType, voFlag, thumb, msgType)
  } catch (err) {
    console.warn("[media-extractor] extractMediaInfoAsync error:", err?.message)
    return null
  }
}

module.exports = {
  extractMediaInfo, extractMediaInfoAsync,
  hasMediaContent, MEDIA_TYPES, MAX_THUMBNAIL_BYTES,
  _toBuffer, _bufToDataUrl, _bufToDataUrlResized, _detectMime, _generateThumbAsync,
}