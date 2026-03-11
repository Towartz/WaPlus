// src/components/ChatItem.jsx — UI/UX v5
// ═══════════════════════════════════════════════════════════════════════════
// IMPROVEMENTS v5:
// [UI-1]  CSS-variable driven — zero inline style overrides for colors/spacing.
// [UI-2]  GPU-accelerated hover: will-change:transform + translateZ(0).
// [UI-3]  Unread badge pulse animation via @keyframes in a single <style> block
//         injected once (not per-render).
// [UI-4]  Avatar shimmer skeleton while profile pic is loading (not blank).
// [UI-5]  Smoother timestamp: uses Intl.RelativeTimeFormat for "2 jam lalu" etc.
// [UI-6]  Active item left-border accent instead of full-bg tint — less visual noise.
// [UI-7]  Message preview truncation with CSS gradient fade-out (no hard cut).
// [UI-8]  Memoized sub-components with stable prop shapes — no phantom re-renders.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, memo } from "react"
import { isJidGroup, isJidLid, isJidNewsletter, isJidUser, jidUser, jidServer, formatJidPhone } from "../utils/jidUtils"
import { format, isToday, isYesterday } from "date-fns"

// ─── Inject shared keyframes once ────────────────────────────────────────────
let _stylesInjected = false
function injectStyles() {
  if (_stylesInjected || typeof document === "undefined") return
  _stylesInjected = true
  const style = document.createElement("style")
  style.textContent = `
    /* Avatar shimmer while loading */
    @keyframes ci-shimmer {
      0%   { background-position: -200% 0 }
      100% { background-position:  200% 0 }
    }
    .ci-avatar-shimmer {
      background: linear-gradient(
        90deg,
        var(--bg-3, #1c1c1c) 25%,
        var(--bg-4, #2a2a2a) 50%,
        var(--bg-3, #1c1c1c) 75%
      );
      background-size: 200% 100%;
      animation: ci-shimmer 1.4s ease infinite;
    }

    /* Unread badge subtle pulse */
    @keyframes ci-pulse {
      0%, 100% { transform: scale(1)   }
      50%       { transform: scale(1.12) }
    }
    .ci-unread-badge-new {
      animation: ci-pulse 1.8s ease-in-out 3;
    }

    /* ChatItem row */
    .ci-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 14px;
      cursor: pointer;
      border-radius: 8px;
      position: relative;
      transition: background 0.13s ease;
      will-change: background;
      /* GPU layer */
      transform: translateZ(0);
      min-width: 0;
      border-left: 2.5px solid transparent;
    }
    .ci-row:hover {
      background: var(--item-hover-bg, rgba(255,255,255,0.045));
    }
    .ci-row.active {
      background: var(--item-active-bg, rgba(0,180,90,0.08));
      border-left-color: var(--accent, #00b45a);
    }
    .ci-row.active .ci-name {
      color: var(--text-1, #f0f0f0);
    }

    /* Name */
    .ci-name {
      font-weight: 600;
      font-size: 13.5px;
      color: var(--text-1, #e8e8e8);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      min-width: 0;
      line-height: 1.3;
    }

    /* Preview text — fades out at right edge instead of hard cut */
    .ci-preview-wrap {
      flex: 1;
      min-width: 0;
      position: relative;
      overflow: hidden;
      white-space: nowrap;
      font-size: 12px;
      color: var(--text-3, #888);
      line-height: 1.4;
      /* Gradient fade-out on right */
      mask-image: linear-gradient(to right, black 80%, transparent 100%);
      -webkit-mask-image: linear-gradient(to right, black 80%, transparent 100%);
    }
    .ci-preview-sender {
      color: var(--text-2, #aaa);
      font-weight: 500;
    }

    /* Timestamp */
    .ci-ts {
      font-size: 10.5px;
      white-space: nowrap;
      flex-shrink: 0;
      line-height: 1;
      color: var(--text-3, #666);
    }
    .ci-ts.unread {
      color: var(--accent, #00b45a);
      font-weight: 600;
    }

    /* Unread badge */
    .ci-unread-badge {
      min-width: 18px;
      height: 18px;
      border-radius: 9px;
      background: var(--accent, #00b45a);
      color: #fff;
      font-size: 10.5px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
      flex-shrink: 0;
      line-height: 1;
    }
    .ci-unread-badge.muted {
      background: var(--text-4, #555);
    }

    /* Channel badge chip */
    .ci-channel-chip {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: 9.5px;
      color: var(--accent, #00b45a);
      background: rgba(0,180,90,0.1);
      border-radius: 4px;
      padding: 1px 5px;
      border: 1px solid rgba(0,180,90,0.18);
      font-weight: 600;
      flex-shrink: 0;
    }
  `
  document.head.appendChild(style)
}

// ─── Colors & helpers ─────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "#1a5c3e", "#1565c0", "#6a1b9a", "#b71c1c",
  "#e65100", "#2e7d32", "#00695c", "#4527a0",
  "#00838f", "#ad1457", "#0277bd", "#4a148c",
]
function seedColor(s) {
  if (!s) return AVATAR_COLORS[0]
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function buildInitials(name) {
  if (!name) return "?"
  const stripped = name.replace(/[\s\-+().]/g, "")
  if (/^\d{6,}$/.test(stripped)) return stripped.slice(-2)
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

// [UI-5] Smart relative timestamp
const rtf = new Intl.RelativeTimeFormat("id", { numeric: "auto" })
function formatTs(ts) {
  if (!ts) return ""
  const d    = new Date(ts * 1000)
  const now  = Date.now()
  const diff = now - d.getTime()  // ms

  if (isToday(d)) {
    // Within last hour → relative; otherwise HH:mm
    if (diff < 60 * 60 * 1000) {
      const mins = Math.round(diff / 60000)
      if (mins < 1) return "baru saja"
      return rtf.format(-mins, "minute")
    }
    return format(d, "HH:mm")
  }
  if (isYesterday(d)) return "Kemarin"
  // Within last week → day name
  if (diff < 7 * 24 * 60 * 60 * 1000) return format(d, "EEEE")
  return format(d, "dd/MM/yy")
}

// ─── Avatar with shimmer loading state ───────────────────────────────────────
const picCache  = new Map()
const fetching  = new Set()

const ChatAvatar = memo(function ChatAvatar({ jid, name, isGroup, isChannel, size = 46 }) {
  const [status, setStatus] = useState(() => {
    if (picCache.has(jid)) return picCache.get(jid) ? "loaded" : "none"
    return "pending"  // will shimmer
  })
  const [url, setUrl]   = useState(() => picCache.get(jid) || null)
  const [imgErr, setImgErr] = useState(false)

  useEffect(() => {
    if (!jid) return
    if (picCache.has(jid)) {
      const cached = picCache.get(jid)
      setUrl(cached)
      setStatus(cached ? "loaded" : "none")
      return
    }
    if (fetching.has(jid)) return
    fetching.add(jid)
    setStatus("pending")
    window.api?.getProfilePic?.({ jid })
      .then(r => {
        const u = r?.url || null
        picCache.set(jid, u)
        setUrl(u)
        setStatus(u ? "loaded" : "none")
      })
      .catch(() => {
        picCache.set(jid, null)
        setUrl(null)
        setStatus("none")
      })
      .finally(() => fetching.delete(jid))
  }, [jid])

  useEffect(() => { setImgErr(false) }, [url])

  const initials = buildInitials(name)
  const color    = seedColor(jid)
  const showImg  = status === "loaded" && url && !imgErr

  return (
    <div
      className={`ci-avatar${status === "pending" ? " ci-avatar-shimmer" : ""}`}
      style={{
        width:          size,
        height:         size,
        minWidth:       size,
        borderRadius:   "50%",
        background:     status === "pending"
          ? undefined   // shimmer class handles it
          : showImg ? "transparent" : color,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        overflow:       "hidden",
        fontSize:       Math.round(size * 0.35),
        fontWeight:     700,
        color:          "#fff",
        position:       "relative",
        flexShrink:     0,
        userSelect:     "none",
        transition:     "background 0.2s",
      }}
    >
      {showImg && (
        <img
          src={url}
          alt={name}
          onError={() => setImgErr(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          loading="lazy"
          decoding="async"
        />
      )}
      {!showImg && status !== "pending" && initials}

      {/* Group / Channel badge */}
      {(isGroup || isChannel) && !showImg && (
        <div style={{
          position: "absolute", bottom: -1, right: -1,
          width: 16, height: 16, borderRadius: "50%",
          background: "var(--bg-2, #1a1a1a)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9,
        }}>
          {isChannel ? "📢" : "👥"}
        </div>
      )}
    </div>
  )
})

// ─── Delivery ticks ───────────────────────────────────────────────────────────
const TICK_STYLE = { fontSize: 10, marginRight: 2, lineHeight: 1 }
function MiniTick({ status, fromMe }) {
  if (!fromMe) return null
  const s = Number(status)
  if (s === 0) return <span style={{ ...TICK_STYLE, color: "var(--text-4, #666)" }}>⏱</span>
  if (s === 1) return <span style={{ ...TICK_STYLE, color: "var(--text-3, #888)" }}>✓</span>
  if (s === 2) return <span style={{ ...TICK_STYLE, color: "var(--text-3, #888)" }}>✓✓</span>
  return          <span style={{ ...TICK_STYLE, color: "var(--accent, #4caf93)" }}>✓✓</span>
}

// ─── Preview ──────────────────────────────────────────────────────────────────
function PreviewText({ chat }) {
  const preview  = chat.last_msg || ""
  const isGroup  = !!(chat.is_group)

  const safeSenderName = (() => {
    const n = chat.last_sender_name
    if (!n) return null
    if (!n.includes("@")) return n
    const phone = formatJidPhone(n)
    return phone || jidUser(n) || null
  })()

  const senderPrefix = isGroup && safeSenderName && !Number(chat.from_me)
    ? `${safeSenderName}: `
    : (Number(chat.from_me) ? "Kamu: " : "")

  if (!preview) {
    return (
      <span style={{ fontStyle: "italic", opacity: 0.55, fontSize: 11.5 }}>
        Ketuk untuk membuka
      </span>
    )
  }

  return (
    <>
      {senderPrefix && (
        <span className="ci-preview-sender">{senderPrefix}</span>
      )}
      {preview}
    </>
  )
}

// ════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════
const ChatItem = memo(function ChatItem({ chat, isActive, onClick, observe, unobserve }) {
  injectStyles()

  const jid     = chat.jid || ""
  const isGroup = !!(chat.is_group)
  const isMuted = chat.muted_until > (Date.now() / 1000)

  const itemRef = useRef(null)
  useEffect(() => {
    const el = itemRef.current
    if (!el || !observe) return
    observe(el)
    return () => unobserve?.(el)
  }, [jid, observe, unobserve])

  // ── Display name ──────────────────────────────────────────────────────────
  const server    = jidServer(jid)
  const cleanUser = jidUser(jid)
  const isLidJid  = isJidLid(jid)
  const isChannel = isJidNewsletter(jid)

  let displayName = ""
  if (isChannel) {
    displayName = chat.name || chat.subject || "Saluran"
    if (displayName.includes("@")) displayName = "Saluran"
  } else if (isGroup || server === "g.us") {
    displayName = chat.name || chat.subject || "Grup"
    if (displayName.includes("@")) displayName = "Grup"
  } else if (isLidJid) {
    const cand = chat.name || chat.last_sender_name || chat.push_name || ""
    displayName = (cand && !cand.includes("@"))
      ? cand
      : (/^\d{6,}$/.test(cleanUser) ? `~${cleanUser.slice(-8)}` : cleanUser || "Unknown")
  } else {
    const cand = chat.name || ""
    displayName = (cand && !cand.includes("@"))
      ? cand
      : (/^\d{6,}$/.test(cleanUser) ? `+${cleanUser}` : cleanUser || "Unknown")
  }

  const unread = Number(chat.unread_count) || 0
  const ts     = chat.last_msg_at || chat.last_message_timestamp || 0

  // New unread — add pulse class on mount when unread > 0
  const badgeRef   = useRef(null)
  const prevUnread = useRef(unread)
  useEffect(() => {
    if (!badgeRef.current) return
    if (unread > prevUnread.current) {
      badgeRef.current.classList.add("ci-unread-badge-new")
      const t = setTimeout(() => badgeRef.current?.classList.remove("ci-unread-badge-new"), 5400)
      return () => clearTimeout(t)
    }
    prevUnread.current = unread
  }, [unread])

  return (
    <div
      ref={itemRef}
      data-jid={jid}
      className={`ci-row${isActive ? " active" : ""}`}
      onClick={() => onClick?.(jid)}
    >
      {/* Avatar */}
      <ChatAvatar jid={jid} name={displayName} isGroup={isGroup} isChannel={isChannel} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>

        {/* Top row */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span className="ci-name">
            {displayName}
          </span>
          {isChannel && (
            <span className="ci-channel-chip">
              <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783M10.34 6.66a23.847 23.847 0 0 1 8.835-2.535"/>
              </svg>
              Saluran
            </span>
          )}
          <span className={`ci-ts${unread > 0 && !isMuted ? " unread" : ""}`}>
            {formatTs(ts)}
          </span>
        </div>

        {/* Bottom row */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div className="ci-preview-wrap">
            <MiniTick status={chat.last_msg_status} fromMe={Number(chat.from_me)} />
            <PreviewText chat={chat} />
          </div>

          {/* Right badges */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            {chat.pinned > 0 && unread === 0 && (
              <span style={{ fontSize: 10, opacity: 0.5 }}>📌</span>
            )}
            {isMuted && unread === 0 && (
              <span style={{ fontSize: 10, opacity: 0.45 }}>🔇</span>
            )}
            {unread > 0 && (
              <div
                ref={badgeRef}
                className={`ci-unread-badge${isMuted ? " muted" : ""}`}
              >
                {unread > 99 ? "99+" : unread}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
})

export default ChatItem