// src/components/bubble/utils.jsx
// ═══════════════════════════════════════════════════════════════════════════
// Shared utilities, hooks, dan helper components untuk semua bubble types.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, memo, useMemo } from "react"
import { format } from "date-fns"
import { prefetchChat } from "../../hooks/useMediaPrefetch"
import { useAppStore } from "../../store/app"
import { HiArrowDownTray, HiExclamationTriangle, HiPhoto, HiVideoCamera, HiMusicalNote, HiDocument, HiArchiveBox, HiForward } from "./icons"

// ════════════════════════════════════════════════════════════
// GLOBAL MEDIA DOWNLOAD LOADING STATE
// Tracks which msgIds are currently being downloaded.
// Updated via IPC events: media:download:start / media:download:error / media:updated
// ════════════════════════════════════════════════════════════
export const _dlLoading = new Set()
const _dlListeners = new Set()

function notifyDlListeners() {
  for (const fn of _dlListeners) fn()
}

if (typeof window !== "undefined") {
  window.api?.onMediaDownloadStart?.((e) => {
    if (e?.msgId) { _dlLoading.add(e.msgId); notifyDlListeners() }
  })
  window.api?.onMediaDownloadError?.((e) => {
    if (e?.msgId) { _dlLoading.delete(e.msgId); notifyDlListeners() }
  })
  window.api?.onMediaUpdated?.((e) => {
    if (e?.msgId) { _dlLoading.delete(e.msgId); notifyDlListeners() }
  })
}

export function useIsDownloading(msgId) {
  const [dl, setDl] = useState(() => _dlLoading.has(msgId))
  useEffect(() => {
    const fn = () => setDl(_dlLoading.has(msgId))
    _dlListeners.add(fn)
    return () => _dlListeners.delete(fn)
  }, [msgId])
  return dl
}

// ════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════
export const NO_PAD_TYPES = new Set([
  "imageMessage", "videoMessage", "stickerMessage",
  "viewOnceMessage", "viewOnceMessageV2",
])
export const SPEED_STEPS = [1, 1.5, 2]

// ════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════
export const toBool = (v) => v === 1 || v === true

/**
 * fmtPhone — convert JID ke human-readable phone/name.
 * TIDAK pernah return raw @lid, JID format, atau numeric LID ID ke UI.
 */
export function fmtPhone(raw) {
  if (!raw) return null
  if (raw === "__me__" || raw === "__self__") return "Kamu"
  const atIdx = raw.lastIndexOf("@")
  if (atIdx === -1) return /^\d{6,}$/.test(raw) ? `+${raw}` : raw
  const user   = raw.slice(0, atIdx).split(":")[0]
  const server = raw.slice(atIdx + 1)
  if (server === "g.us" || server === "newsletter") return ""
  // [FIX-LEAK] @lid is an opaque internal device ID — never show it in UI.
  // Return null so callers can show a fallback like "Kontak" instead.
  if (server === "lid") return null
  if (/^\d{6,}$/.test(user)) return `+${user}`
  return user || "?"
}

export function fmtTime(s) {
  if (!s || !isFinite(s)) return "0:00"
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, "0")}`
}

// ════════════════════════════════════════════════════════════
// MEDIA PATH → media:// URL CONVERTER
// [FIX-WEBSECURITY] Electron webSecurity:true blocks file:// from renderer.
// All local media must be served through the hardened media:// custom protocol
// registered in main.js (protocol.handle). This replaces the old file:// approach.
// ════════════════════════════════════════════════════════════
export function pathToFileUrl(rawPath) {
  if (!rawPath) return null
  // Already a protocol URL — convert file:// to media://, pass others through
  if (rawPath.startsWith("media://") || rawPath.startsWith("data:") || rawPath.startsWith("blob:")) {
    return rawPath
  }
  if (rawPath.startsWith("file://")) {
    // Strip file:// prefix and decode if needed, then re-wrap as media://
    let stripped = rawPath.replace(/^file:\/\/\/?/, "")
    if (stripped.includes("%3A") || stripped.includes("%3a")) {
      try { stripped = decodeURIComponent(stripped) } catch (_) {}
    }
    return pathToFileUrl(stripped)
  }
  let p = rawPath.replace(/\\/g, "/")
  const winDrive = /^([A-Za-z]):\//
  if (winDrive.test(p)) {
    // Windows: D:/path/to/file → media:///D:/path/to/file
    const clean = p.replace(winDrive, (_, letter) => `${letter.toUpperCase()}:/`)
    return `media:///${clean}`
  }
  // Unix absolute path
  const withSlash = p.startsWith("/") ? p : `/${p}`
  return `media://${withSlash}`
}

export function useMediaSrc(msg) {
  // [FIX-FIELDNAME] main.js sends mediaSavedPath (camelCase) from DB messages IPC,
  // but media:download:complete sends media_saved_path (snake_case). Accept both.
  const rawPath = msg.media_saved_path || msg.mediaSavedPath || null
  const [verifiedSrc, setVerifiedSrc] = useState(() => rawPath ? pathToFileUrl(rawPath) : null)
  const [err, setErr] = useState(false)
  const prevRaw = useRef(rawPath)
  const checked = useRef(false)

  if (prevRaw.current !== rawPath) {
    prevRaw.current = rawPath
    const newSrc = rawPath ? pathToFileUrl(rawPath) : null
    setVerifiedSrc(newSrc)
    if (err) setErr(false)
    checked.current = false
  }

  useEffect(() => {
    if (!rawPath || checked.current) return
    if (!window.api?.fsExists) return
    checked.current = true
    window.api.fsExists({ rawPath })
      .then(exists => {
        if (!exists) {
          // [FIX-MISSING-FILE] File path in DB but file is gone (moved, deleted, external drive).
          // 1. Clear src so bubble switches to download-trigger mode (shows thumbnail + spinner)
          // 2. Trigger a re-download via mediaTriggerDownload so file comes back automatically
          setVerifiedSrc(null)
          const msgId = msg?.id
          if (msgId && window.api?.mediaTriggerDownload) {
            window.api.mediaTriggerDownload({ msgId }).catch(() => {})
          } else if (msg?.chat_jid) {
            // Fallback: re-prefetch the chat if no direct trigger available
            prefetchChat(msg.chat_jid, 30, true)
          }
        }
      })
      .catch(() => {})
  }, [rawPath])

  const src = verifiedSrc || msg.media_url || null
  const thumbnailSrc = msg.media_thumbnail_b64 || null
  return { src, thumbnailSrc, err, setErr }
}

// ════════════════════════════════════════════════════════════
// SHARED UI ATOMS
// ════════════════════════════════════════════════════════════

/** Loading spinner inside media area */
export function MediaLoadingSpinner({ label = "Mengunduh..." }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 80, padding: 16 }}>
      <div style={{ position: "relative", width: 40, height: 40 }}>
        <svg viewBox="0 0 40 40" width="40" height="40" style={{ transform: "rotate(-90deg)" }}>
          <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(37,211,102,0.15)" strokeWidth="3.5" />
          <circle cx="20" cy="20" r="16" fill="none" stroke="var(--green)" strokeWidth="3.5" strokeLinecap="round"
            strokeDasharray="100.5" strokeDashoffset="25"
            style={{ animation: "spin-progress 1.2s linear infinite" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <HiArrowDownTray size={14} />
        </div>
      </div>
      <span style={{ fontSize: 11, color: "var(--text-3)" }}>{label}</span>
    </div>
  )
}

/** Active download indicator with animated ring */
export function DownloadingPulse({ label = "Mengunduh..." }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{ position: "relative", width: 44, height: 44 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid var(--green)", animation: "dl-pulse-ring 1.4s ease-out infinite", opacity: 0.6 }} />
        <div style={{ position: "absolute", inset: 4, borderRadius: "50%", background: "rgba(37,211,102,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 3v12M7 14l5 5 5-5" style={{ animation: "dl-arrow-bounce 1s ease infinite" }} />
            <path d="M5 19h14" />
          </svg>
        </div>
        <svg viewBox="0 0 44 44" width="44" height="44" style={{ position: "absolute", inset: 0, animation: "spin 1.5s linear infinite" }}>
          <circle cx="22" cy="22" r="20" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeDasharray="31 95" />
        </svg>
      </div>
      <span style={{ fontSize: 10, color: "var(--green)", fontWeight: 500, letterSpacing: 0.3 }}>{label}</span>
      <style>{`
        @keyframes dl-pulse-ring { 0%{transform:scale(1);opacity:.6} 80%,100%{transform:scale(1.4);opacity:0} }
        @keyframes dl-arrow-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(3px)} }
      `}</style>
    </div>
  )
}

export function MediaErrorPlaceholder({ label = "Gagal memuat konten media" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 80, padding: 16 }}>
      <div style={{ color: "#ef4444", opacity: 0.8 }}><HiExclamationTriangle size={28} /></div>
      <span style={{ fontSize: 11, color: "var(--text-3)", textAlign: "center" }}>{label}</span>
    </div>
  )
}

/** Message status ticks */
export const Ticks = memo(function Ticks({ status }) {
  const s = Number(status)
  if (s === 0) return <span className="tick tick-pending" aria-label="Pending" style={{ fontSize: 10 }}>⏱</span>
  if (s === 1) return <span className="tick tick-sent" aria-label="Sent">✓</span>
  if (s === 2) return <span className="tick tick-delivered" aria-label="Delivered">✓✓</span>
  return <span className="tick tick-read" aria-label="Read">✓✓</span>
})

export const BubbleTime = memo(function BubbleTime({ ts }) {
  if (!ts) return null
  return <span className="bubble-time">{format(new Date(ts * 1000), "HH:mm")}</span>
})

/** Forwarded message badge */
export function ForwardBadge({ score }) {
  if (!score) return null
  return (
    <div className="forward-badge">
      <HiForward size={12} />
      <span>{score >= 5 ? "Sering diteruskan" : "Diteruskan"}</span>
    </div>
  )
}

/** Reaction overlay grouped by emoji */
export const ReactionOverlay = memo(function ReactionOverlay({ reactions }) {
  const grouped = useMemo(() => {
    if (!reactions?.length) return null
    const g = {}
    for (const r of reactions) g[r.text] = (g[r.text] || 0) + 1
    return g
  }, [reactions])
  if (!grouped) return null
  return (
    <div className="reaction-row" role="img" aria-label="Reactions">
      {Object.entries(grouped).map(([e, n]) => (
        <div key={e} className="reaction-chip">
          <span>{e}</span>
          {n > 1 && <span className="reaction-chip-count">{n}</span>}
        </div>
      ))}
    </div>
  )
})

// ── Sender color palette (WhatsApp-style, consistent per JID) ────────────────
const QUOTED_SENDER_COLORS = [
  "#00a884", // WA green
  "#53bdeb", // light blue
  "#7bc15e", // muted green
  "#fc644c", // coral red
  "#d4a843", // amber
  "#bf7bc1", // lavender purple
  "#fc7f7f", // salmon pink
  "#67c2a3", // seafoam
  "#5ca7d8", // sky blue
  "#e07fb5", // rose
]

function _quotedSenderColor(seed) {
  if (!seed) return QUOTED_SENDER_COLORS[0]
  let h = 0
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h)
  return QUOTED_SENDER_COLORS[Math.abs(h) % QUOTED_SENDER_COLORS.length]
}

/** Quoted/replied-to message preview — WhatsApp accurate style */
export const QuotedMsg = memo(function QuotedMsg({
  body, sender, senderName, type, hasMedia, mimetype, onClick, quotedFromMe,
  isStatusReply, quotedThumbnail, statusMusic, isViewOnce,
}) {
  if (!sender && !senderName && !body && !hasMedia && !quotedFromMe && !isStatusReply) return null

  const mediaIcon = (() => {
    if (isViewOnce) return <span style={{ fontSize: 10 }}>👁</span>
    if (!hasMedia) return null
    if (type === "pttMessage")                return <HiMusicalNote size={12} />
    if (type === "stickerMessage")            return <span style={{ fontSize: 10 }}>🎴</span>
    if (mimetype?.startsWith("image"))        return <HiPhoto size={12} />
    if (mimetype?.startsWith("video"))        return <HiVideoCamera size={12} />
    if (mimetype?.startsWith("audio"))        return <HiMusicalNote size={12} />
    if (mimetype?.includes("pdf"))            return <HiDocument size={12} />
    return <HiArchiveBox size={12} />
  })()

  // displaySender resolution — priority chain:
  //   1. Sentinels: "Kamu" for own messages
  //   2. senderName (already resolved from contacts/push_name in normalizeMsg)
  //   3. fmtPhone(sender JID)
  //   4. "Kontak" — final fallback
  let displaySender = null
  const isOwnQuote = sender === "__me__" || sender === "__self__" || quotedFromMe
  if (isOwnQuote) {
    displaySender = "Kamu"
  } else if (senderName && !senderName.includes("@")) {
    displaySender = senderName
  } else if (sender && !sender.includes("@") && /^\d{6,}$/.test(sender)) {
    displaySender = `+${sender}`
  } else if (sender) {
    const phone = fmtPhone(sender)
    displaySender = phone || "Kontak"
  }

  // Determine accent color — "Kamu" always gets WA green; others get a stable color per JID/name
  const accentColor = isOwnQuote
    ? "#00a884"
    : _quotedSenderColor(sender || senderName || displaySender || "")

  // Shared inner content layout (text + optional thumbnail on right)
  const hasThumbnail = !!(quotedThumbnail && (
    type === "imageMessage" || type === "videoMessage" ||
    isStatusReply
  ))
  const isVideo = type === "videoMessage" || (isStatusReply && mimetype?.startsWith("video"))
  const isImage = type === "imageMessage" || (isStatusReply && mimetype?.startsWith("image"))

  const quotedLabel = (() => {
    if (isStatusReply)             return isVideo ? "Video" : isImage ? "Foto" : "Media"
    if (isViewOnce)                return "Pesan Sekali Lihat"
    if (type === "pttMessage")     return "🎤 Pesan Suara"
    if (type === "stickerMessage") return "🎴 Stiker"
    if (type === "audioMessage")   return "🎵 Audio"
    if (hasMedia)                  return "Pesan media"
    return null
  })()

  // Status reply music info
  let parsedMusic = null
  if (isStatusReply && statusMusic) {
    try { parsedMusic = typeof statusMusic === "string" ? JSON.parse(statusMusic) : statusMusic } catch (_) {}
  }

  const senderLabel = isStatusReply
    ? (displaySender ? `Status ${displaySender}` : "Status")
    : displaySender

  const bodyText = body || quotedLabel

  return (
    <div
      className="quoted"
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        cursor: onClick ? "pointer" : undefined,
        // Override default border-left with accent color
        borderLeftColor: accentColor,
        borderLeftWidth: 4,
        padding: 0,
        overflow: "hidden",
        background: "rgba(0,0,0,0.18)",
        borderRadius: "0 8px 8px 0",
        marginBottom: 7,
      }}
    >
      <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
        {/* Main text area */}
        <div style={{ flex: 1, minWidth: 0, padding: "5px 8px 6px 8px" }}>
          {/* Sender name row */}
          {senderLabel && (
            <div style={{
              fontSize: 12,
              fontWeight: 700,
              color: accentColor,
              marginBottom: 2,
              lineHeight: 1.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}>
              {isStatusReply && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10"/>
                  <circle cx="12" cy="8" r="2" fill="currentColor"/>
                  <line x1="12" y1="12" x2="12" y2="16"/>
                </svg>
              )}
              {senderLabel}
            </div>
          )}

          {/* Body / label row */}
          <div style={{
            fontSize: 12,
            color: "rgba(255,255,255,0.65)",
            WebkitLineClamp: hasThumbnail ? 1 : 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            lineHeight: 1.35,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}>
            {mediaIcon}
            {bodyText
              ? <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bodyText}</span>
              : <span style={{ fontStyle: "italic", opacity: 0.5 }}>Pesan</span>
            }
          </div>

          {/* Status music */}
          {parsedMusic?.title && (
            <div style={{
              fontSize: 10.5, color: "rgba(255,255,255,0.4)", marginTop: 2,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              display: "flex", alignItems: "center", gap: 3,
            }}>
              <HiMusicalNote size={9} />
              {parsedMusic.title}{parsedMusic.author ? ` · ${parsedMusic.author}` : ""}
            </div>
          )}
        </div>

        {/* Thumbnail on the right (WhatsApp style) */}
        {hasThumbnail && (
          <div style={{
            width: 52, height: 52, flexShrink: 0,
            position: "relative", overflow: "hidden",
            background: "rgba(0,0,0,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {quotedThumbnail ? (
              <img
                src={quotedThumbnail}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }}
              />
            ) : (
              <span style={{ fontSize: 20, opacity: 0.4 }}>{isVideo ? "🎬" : "🖼️"}</span>
            )}
            {isVideo && (
              <div style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(0,0,0,0.3)",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

// ════════════════════════════════════════════════════════════
// RICH TEXT RENDERER
// ════════════════════════════════════════════════════════════
const RICH_RE = new RegExp(
  "(" +
  "```[\\s\\S]+?```" +
  "|" +
  "`[^`\\n]+`" +
  "|" +
  "\\*[^*\\n]+\\*" +
  "|" +
  "_[^_\\n]+_" +
  "|" +
  "~[^~\\n]+~" +
  ")" +
  "|" +
  "(" +
  "https?:\\/\\/[^\\s<>\"')\\]]+|www\\.[^\\s<>\"')\\]]+\\.[^\\s<>\"')\\]]+" +
  ")",
  "gi"
)

function linkifyText(text) {
  if (!text) return null
  const segments = []
  let key = 0, lastIdx = 0
  RICH_RE.lastIndex = 0
  let m
  while ((m = RICH_RE.exec(text)) !== null) {
    if (m.index > lastIdx) segments.push(text.slice(lastIdx, m.index))
    const token = m[0]
    if (m[1]) {
      if (token.startsWith("```")) segments.push(<code key={key++} className="bubble-code-block">{token.slice(3, -3)}</code>)
      else if (token.startsWith("`")) segments.push(<code key={key++} className="bubble-code-inline">{token.slice(1, -1)}</code>)
      else if (token.startsWith("*")) segments.push(<strong key={key++}>{token.slice(1, -1)}</strong>)
      else if (token.startsWith("_")) segments.push(<em key={key++}>{token.slice(1, -1)}</em>)
      else if (token.startsWith("~")) segments.push(<s key={key++}>{token.slice(1, -1)}</s>)
    } else if (m[2]) {
      let href = token
      if (!href.startsWith("http")) href = "https://" + href
      href = href.replace(/[.,;:!?)\]]+$/, "")
      const display = href.replace(/^https?:\/\//, "").replace(/\/$/, "")
      segments.push(
        <a key={key++} href={href}
          onClick={e => { e.preventDefault(); e.stopPropagation(); window.api?.openExternal?.(href) ?? window.open(href, "_blank") }}
          title={href} className="bubble-link">
          {display}
        </a>
      )
    }
    lastIdx = m.index + token.length
  }
  if (lastIdx < text.length) segments.push(text.slice(lastIdx))
  if (!segments.length) return text
  if (segments.length === 1 && typeof segments[0] === "string") return segments[0]
  return segments
}

// ════════════════════════════════════════════════════════════
// EXPANDABLE TEXT — "Lihat Selengkapnya" / "Sembunyikan"
// Truncates long messages to CHAR_LIMIT chars + LINE_LIMIT lines.
// User can expand inline without leaving the chat.
// ════════════════════════════════════════════════════════════
const CHAR_LIMIT = 600   // chars before truncation kicks in
const LINE_LIMIT = 10    // newline count before truncation kicks in

function needsTruncation(text) {
  if (!text) return false
  if (text.length > CHAR_LIMIT) return true
  let nl = 0
  for (let i = 0; i < text.length; i++) { if (text[i] === "\n") nl++ }
  return nl >= LINE_LIMIT
}

/** Clips text at CHAR_LIMIT chars or LINE_LIMIT lines, whichever is hit first */
function clipText(text) {
  // Clip by lines first
  let nl = 0, lineEnd = text.length
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      nl++
      if (nl >= LINE_LIMIT) { lineEnd = i; break }
    }
  }
  const byLine = text.slice(0, lineEnd)
  // Then clip by chars
  if (byLine.length <= CHAR_LIMIT) return byLine
  // Try to clip at last word boundary near CHAR_LIMIT
  let cut = CHAR_LIMIT
  while (cut > CHAR_LIMIT - 40 && text[cut] && text[cut] !== " " && text[cut] !== "\n") cut--
  return text.slice(0, cut)
}

export function ExpandableText({ text, className, style }) {
  const shouldTruncate = needsTruncation(text)
  const [expanded, setExpanded] = useState(false)

  const displayText = shouldTruncate && !expanded ? clipText(text) : text

  return (
    <span className={className} style={style}>
      {displayText.split("\n").map((line, i, arr) => (
        <span key={i}>{linkifyText(line)}{i < arr.length - 1 && <br />}</span>
      ))}
      {shouldTruncate && !expanded && (
        <>
          <span style={{ color: "var(--text-3)" }}>…</span>
          {" "}
          <button
            onClick={e => { e.stopPropagation(); setExpanded(true) }}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 0,
              color: "var(--green)", fontSize: "inherit", fontWeight: 600,
              lineHeight: "inherit", display: "inline",
            }}
          >
            Lihat Selengkapnya
          </button>
        </>
      )}
      {shouldTruncate && expanded && (
        <>
          {" "}
          <button
            onClick={e => { e.stopPropagation(); setExpanded(false) }}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 0,
              color: "var(--text-3)", fontSize: "0.9em", fontWeight: 500,
              lineHeight: "inherit", display: "inline",
            }}
          >
            Sembunyikan
          </button>
        </>
      )}
    </span>
  )
}

export const RichText = memo(function RichText({ text, className, style }) {
  if (!text) return null
  const lines = text.split("\n")
  return (
    <span className={className} style={style}>
      {lines.map((line, i) => (
        <span key={i}>{linkifyText(line)}{i < lines.length - 1 && <br />}</span>
      ))}
    </span>
  )
})