// src/components/MessageBubble.jsx — v7 (UI/UX improved)
// ═══════════════════════════════════════════════════════════════════════════
// Main message bubble orchestrator.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useRef, useCallback, useEffect, useMemo, memo } from "react"
import { useAppStore } from "../store/app"
import { useAuthStore } from "../store/auth"
import DevEvalModal from "./DevEvalModal"

// ─── SenderAvatar ─────────────────────────────────────────────────────────────
const _avatarPicCache = new Map()
const _avatarFetching = new Set()

const SENDER_COLORS = [
  ["#0d3320","#22c55e"], ["#0d1f3c","#3b82f6"], ["#1e0a2e","#a855f7"],
  ["#2d0a0a","#ef4444"], ["#2d1500","#f97316"], ["#0a2010","#16a34a"],
  ["#021a1a","#06b6d4"], ["#160d30","#8b5cf6"], ["#0a1e20","#14b8a6"],
  ["#2d0a1a","#ec4899"], ["#1a1208","#eab308"], ["#1a0d0a","#f97316"],
  ["#0a1220","#38bdf8"], ["#141a0a","#84cc16"], ["#1a0a14","#db2777"],
]
function _senderColorPair(seed) {
  if (!seed) return SENDER_COLORS[0]
  let h = 0
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h)
  return SENDER_COLORS[Math.abs(h) % SENDER_COLORS.length]
}
function _senderInitials(name) {
  if (!name) return "?"
  const stripped = name.replace(/[\s\-+().]/g, "")
  if (/^\d{6,}$/.test(stripped)) return stripped.slice(-2)
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

const SenderAvatar = memo(function SenderAvatar({ jid, name, size = 28 }) {
  const [url, setUrl]       = useState(() => _avatarPicCache.has(jid) ? _avatarPicCache.get(jid) : undefined)
  const [imgErr, setImgErr] = useState(false)
  const prevJid             = useRef(jid)
  const [bg, accent]        = _senderColorPair(jid || name)
  const radius              = Math.round(size * 0.3)

  useEffect(() => {
    if (!jid) return
    if (prevJid.current !== jid) {
      prevJid.current = jid
      setImgErr(false)
      if (_avatarPicCache.has(jid)) { setUrl(_avatarPicCache.get(jid)); return }
      setUrl(undefined)
    }
    if (_avatarPicCache.has(jid)) {
      const v = _avatarPicCache.get(jid)
      if (v !== url) setUrl(v)
      return
    }
    if (_avatarFetching.has(jid)) return
    _avatarFetching.add(jid)
    window.api?.getProfilePic?.({ jid })
      .then(r  => { const u = r?.url || null; _avatarPicCache.set(jid, u); setUrl(u) })
      .catch(() => { _avatarPicCache.set(jid, null); setUrl(null) })
      .finally(() => _avatarFetching.delete(jid))
  }, [jid])

  useEffect(() => { setImgErr(false) }, [url])

  const initials = _senderInitials(name)

  return (
    <div
      aria-hidden="true"
      title={name || undefined}
      style={{
        width: size, height: size, borderRadius: radius,
        flexShrink: 0, overflow: "hidden", alignSelf: "flex-end", marginBottom: 2,
        background: (url && !imgErr) ? "transparent" : `radial-gradient(135deg at 30% 25%, ${accent}60, ${bg})`,
        border: (url && !imgErr) ? "none" : `1px solid ${accent}30`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.round(size * 0.34), fontWeight: 700,
        color: accent, letterSpacing: "-0.5px", userSelect: "none",
        boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
      }}
    >
      {url && !imgErr
        ? <img src={url} alt={name} onError={() => setImgErr(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        : initials
      }
    </div>
  )
})

// ── Sub-components ────────────────────────────────────────────────────────
import { ImageBubble, VideoBubble, StickerBubble, ViewOnceBubble, AlbumBubble } from "./bubble/MediaBubble"
import AudioBubble from "./bubble/AudioBubble"
import {
  DocBubble, PollBubble, LocationBubble, ContactBubble,
  GroupInviteBubble, ButtonsBubble, InteractiveResponseBubble,
  OrderBubble, ProductBubble, PaymentBubble, CallLogBubble,
  EventBubble, PinBubble, ScheduledCallBubble, NewsletterBubble,
} from "./bubble/MiscBubble"
import { HiChartBar, HiArchiveBox, ReplyIcon } from "./bubble/icons"
import {
  toBool, fmtPhone, NO_PAD_TYPES,
  Ticks, BubbleTime, ForwardBadge, ReactionOverlay, QuotedMsg, RichText, ExpandableText,
} from "./bubble/utils"

// ─── Link Preview Bubble ──────────────────────────────────────────────────────
function LinkPreviewBubble({ msg }) {
  const { link_preview_url, link_preview_title, link_preview_desc, link_preview_thumb, body } = msg
  const hasPreview = !!(link_preview_url || link_preview_title || link_preview_desc)

  const thumbSrc = useMemo(() => {
    if (!link_preview_thumb) return null
    if (link_preview_thumb.startsWith("data:")) return link_preview_thumb
    return `data:image/jpeg;base64,${link_preview_thumb}`
  }, [link_preview_thumb])

  const [thumbOk, setThumbOk] = useState(true)
  const prevThumbRef = useRef(thumbSrc)
  useEffect(() => {
    if (prevThumbRef.current !== thumbSrc) {
      prevThumbRef.current = thumbSrc
      setThumbOk(true)
    }
  }, [thumbSrc])

  let domain = ""
  try { domain = new URL(link_preview_url).hostname.replace(/^www\./, "") } catch (_) {}

  return (
    <div className="bubble-text" style={{ maxWidth: 320, minWidth: 0 }}>
      <ExpandableText text={body || ""} />
      {hasPreview && (
        <div
          onClick={() => link_preview_url && window.open(link_preview_url, "_blank", "noopener,noreferrer")}
          className="link-preview-card"
          style={{ cursor: link_preview_url ? "pointer" : "default" }}
        >
          {thumbSrc && thumbOk ? (
            <img
              src={thumbSrc} alt=""
              onError={() => setThumbOk(false)}
              style={{ width: "100%", maxHeight: 148, objectFit: "cover", display: "block" }}
            />
          ) : (link_preview_url && (
            <div style={{
              width: "100%", height: 72,
              background: "rgba(255,255,255,0.03)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="2" y1="12" x2="22" y2="12"/>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
            </div>
          ))}
          <div style={{ padding: "7px 10px 9px" }}>
            {domain && (
              <div style={{ fontSize: 10, color: "var(--green)", fontWeight: 600, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: 0.3 }}>
                {domain}
              </div>
            )}
            {link_preview_title && (
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-1)", lineHeight: 1.4, marginBottom: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {link_preview_title}
              </div>
            )}
            {link_preview_desc && (
              <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                {link_preview_desc}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// MAIN CONTENT RENDERER
// ════════════════════════════════════════════════════════════
function renderContent(msg, opts = {}) {
  const t = msg.msg_type || "conversation"
  if (toBool(msg.is_view_once) || t === "viewOnceMessage" || t === "viewOnceMessageV2")
    return <ViewOnceBubble msg={msg} />
  if (msg._isAlbumPart) return null

  switch (t) {
    case "conversation":
      return <div className="bubble-text"><ExpandableText text={msg.body || ""} /></div>
    case "extendedTextMessage":
      return (msg.link_preview_url || msg.link_preview_title || msg.link_preview_desc || msg.link_preview_thumb)
        ? <LinkPreviewBubble msg={msg} />
        : <div className="bubble-text"><ExpandableText text={msg.body || ""} /></div>

    case "imageMessage":    return <ImageBubble msg={msg} onMediaClick={opts?.onMediaClick} />
    case "videoMessage":    return <VideoBubble msg={msg} onMediaClick={opts?.onMediaClick} />
    case "audioMessage":
    case "pttMessage":      return <AudioBubble msg={msg} />
    case "documentMessage": return <DocBubble msg={msg} />
    case "stickerMessage":  return <StickerBubble msg={msg} />
    case "locationMessage":
    case "liveLocationMessage": return <LocationBubble msg={msg} />
    case "contactMessage":
    case "contactsArrayMessage": return <ContactBubble msg={msg} />
    case "pollCreationMessage": return <PollBubble msg={msg} />
    case "pollUpdateMessage":
      return (
        <div className="bubble-text" style={{ fontStyle: "italic", color: "var(--text-2)", display: "flex", alignItems: "center", gap: 5 }}>
          <HiChartBar size={14} /> Vote diperbarui
        </div>
      )
    case "reactionMessage": return null
    case "groupInviteMessage": return <GroupInviteBubble msg={msg} />
    case "buttonsMessage":
    case "listMessage":
    case "templateMessage":
    case "interactiveMessage": return <ButtonsBubble msg={msg} />
    case "buttonsResponseMessage":
    case "listResponseMessage":
    case "templateButtonReplyMessage":
    case "interactiveResponseMessage": return <InteractiveResponseBubble msg={msg} />
    case "orderMessage":   return <OrderBubble msg={msg} />
    case "productMessage": return <ProductBubble msg={msg} />
    case "paymentMessage":
    case "requestPaymentMessage":
    case "sendPaymentMessage": return <PaymentBubble msg={msg} />
    case "callLogMessage":   return <CallLogBubble msg={msg} />
    case "eventMessage":     return <EventBubble msg={msg} />
    case "pinInChatMessage":
    case "keepInChatMessage": return <PinBubble msg={msg} />
    case "scheduledCallCreationMessage":
    case "scheduledCallEditMessage": return <ScheduledCallBubble msg={msg} />
    case "newsletterAdminInviteMessage": return <NewsletterBubble msg={msg} />
    case "albumMessage": return null
    case "protocol":
    case "ephemeral":
    case "messageContextInfo":
    case "unknown": return null
    default:
      if (msg.body) return <div className="bubble-text"><ExpandableText text={msg.body} /></div>
      return (
        <div className="bubble-unsupported">
          <HiArchiveBox size={13} />{t}
        </div>
      )
  }
}

// ── buildSmsgStyle (unchanged logic) ─────────────────────────────────────────
function buildSmsgStyle(row, msgJson) {
  if (!row) return null
  const msgType  = row.message_type || "conversation"
  const isGroup  = !!(row.remote_jid || "").endsWith("@g.us")
  const fromMe   = row.from_me === 1
  const chatJid  = row.remote_jid || ""
  const sender   = isGroup
    ? (row.participant || row.sender_jid || "")
    : (fromMe ? row.remote_jid : row.remote_jid)
  let body = row.body || ""
  let msgContent = msgJson || {}
  let innerMsg = msgContent
  if (msgContent[msgType]) {
    innerMsg = msgContent[msgType]
  } else {
    const keys = Object.keys(msgContent).filter(k =>
      k !== "messageContextInfo" && k !== "senderKeyDistributionMessage"
    )
    if (keys.length > 0) innerMsg = msgContent[keys[0]]
  }
  const msgBody = body || innerMsg?.text || innerMsg?.caption || innerMsg?.conversation || ""
  const key = {
    remoteJid: chatJid, fromMe: !!fromMe, id: row.id,
    ...(isGroup && row.participant ? { participant: row.participant } : {}),
  }
  const bodyTrim = msgBody.trim()
  const parts = bodyTrim.split(/\s+/)
  const cmd = parts[0] || ""
  const args = parts.slice(1)
  let quoted = null
  if (row.context_stanza_id) {
    const quotedMsg = row.context_quoted_message || null
    let quotedParsed = null
    try { quotedParsed = typeof quotedMsg === "string" ? JSON.parse(quotedMsg) : quotedMsg } catch {}
    quoted = {
      key: {
        remoteJid: chatJid,
        fromMe: row.context_participant ? (row.context_participant === row.remote_jid) : false,
        id: row.context_stanza_id,
        ...(isGroup && row.context_participant ? { participant: row.context_participant } : {}),
      },
      message: quotedParsed,
    }
  }
  let mentionedJid = []
  try {
    const raw = row.context_mentioned_jids || row.mentioned_jids || "[]"
    mentionedJid = typeof raw === "string" ? JSON.parse(raw) : (Array.isArray(raw) ? raw : [])
  } catch {}
  return {
    key, messageTimestamp: row.message_timestamp || 0,
    pushName: row.push_name || null, broadcast: !!(row.broadcast),
    message: msgJson || null, id: row.id,
    isBaileys: !!(row.id && row.id.startsWith("BAE5") && row.id.length === 16),
    chatId: chatJid, chatLid: "", fromMe: !!fromMe, from: chatJid,
    isBroadcast: !!(row.broadcast), isStatusBroadcast: chatJid === "status@broadcast",
    isNewsletter: chatJid.endsWith("@newsletter"), isGroup,
    isUser: !isGroup && !chatJid.endsWith("@newsletter"), senderId: sender,
    participant: row.participant || null, mtype: msgType, msg: innerMsg,
    quoted, body: msgBody, mentionedJid, text: msgBody, isCmd: false,
    cmd, args, status: row.status, starred: !!(row.starred),
    is_history_sync: !!(row.is_history_sync),
  }
}

// ── JSON colorizer ────────────────────────────────────────────────────────────
function colorizeJson(text) {
  if (!text || text.length > 80000) return escHtml(text)
  const escaped = escHtml(text)
  return escaped
    .replace(/(: )(&quot;)((?:[^&]|&(?!quot;))*?)(&quot;)/g, '$1<span class="rv-s">$2$3$4</span>')
    .replace(/^(\s*)(&quot;)([\w$\- .@]+)(&quot;)(\s*:)/gm, '$1<span class="rv-k">$2$3$4</span>$5')
    .replace(/(:\s*)(-?\d+\.?\d*(?:e[+-]?\d+)?)/g, '$1<span class="rv-n">$2</span>')
    .replace(/(:\s*)(true|false|null)/g, '$1<span class="rv-b">$2</span>')
}
function escHtml(s) {
  return (s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

// ── RawViewerModal ────────────────────────────────────────────────────────────
const RV_TABS = [
  { id: "smsg",  label: "smsg()",  icon: "⚡", title: "Format smsg() output" },
  { id: "raw",   label: "Baileys", icon: "🔧", title: "Raw Baileys WAMessage proto" },
  { id: "store", label: "Store",   icon: "📦", title: "WaPlus store object" },
]

function RawViewerModal({ msg, onClose }) {
  const [tab,     setTab]     = useState("smsg")
  const [fetched, setFetched] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [copied,  setCopied]  = useState(false)
  const preRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    async function fetchRaw() {
      try {
        if (!window.api?.dbMessageRaw) {
          setFetched({ row: null, msgJson: null }); setLoading(false); return
        }
        const res = await window.api.dbMessageRaw({ id: msg.id })
        if (cancelled) return
        if (!res?.ok) { setError(res?.error || "Message tidak ditemukan"); setLoading(false); return }
        const row = res.data
        let msgJson = null
        try {
          const raw = row._message_json_parsed || row.message_json
          msgJson = typeof raw === "string" ? JSON.parse(raw) : raw
        } catch {}
        setFetched({ row, msgJson })
      } catch (e) {
        if (!cancelled) setError(e.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchRaw()
    return () => { cancelled = true }
  }, [msg.id])

  useEffect(() => {
    const fn = e => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", fn)
    return () => document.removeEventListener("keydown", fn)
  }, [onClose])

  const displayObj = useMemo(() => {
    if (tab === "smsg") return fetched ? buildSmsgStyle(fetched.row, fetched.msgJson) : null
    if (tab === "raw")  return fetched?.msgJson || null
    const storeObj = { ...msg }
    for (const k of ["mentioned_jids","poll_options","contacts_json","call_participants"]) {
      try { if (typeof storeObj[k] === "string") storeObj[k] = JSON.parse(storeObj[k]) } catch {}
    }
    if (storeObj.media_thumbnail_b64?.length > 200)
      storeObj.media_thumbnail_b64 = storeObj.media_thumbnail_b64.slice(0, 80) + `… [${storeObj.media_thumbnail_b64.length} chars]`
    return storeObj
  }, [tab, fetched, msg])

  const rawText = useMemo(() => {
    if (!displayObj) return loading ? "Loading…" : (error ? `Error: ${error}` : "null")
    try { return JSON.stringify(displayObj, null, 2) }
    catch (e) {
      const seen = new WeakSet()
      return JSON.stringify(displayObj, (k, v) => {
        if (typeof v === "object" && v !== null) { if (seen.has(v)) return "[Circular]"; seen.add(v) }
        return v
      }, 2)
    }
  }, [displayObj, loading, error])

  const handleCopy = () => {
    navigator.clipboard?.writeText(rawText).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }
  const handleSave = () => {
    const blob = new Blob([rawText], { type: "application/json" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href = url; a.download = `msg-${tab}-${msg.id?.slice(0, 12) || "raw"}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  const tabMeta = RV_TABS.find(t => t.id === tab)
  const lineCount = rawText.split("\n").length

  return (
    <div className="mb-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog" aria-modal="true" aria-label="Raw Message">
      <div className="rawviewer-modal">

        {/* Header */}
        <div className="rawviewer-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div className="rv-header-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", letterSpacing: -0.2 }}>Raw Message</div>
              <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2, fontFamily: "monospace",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 380 }}>
                {msg.id || "?"} · {msg.msg_type || "?"} · {msg.chat_jid || "?"}
              </div>
            </div>
          </div>
          <button className="mb-icon-btn" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Tab bar */}
        <div className="rv-tabs" role="tablist">
          {RV_TABS.map(t => (
            <button key={t.id} role="tab" aria-selected={tab === t.id}
              className={`rv-tab${tab === t.id ? " active" : ""}`}
              onClick={() => { setTab(t.id); setCopied(false) }} title={t.title}>
              <span style={{ fontSize: 13 }}>{t.icon}</span>
              {t.label}
              {tab === t.id && t.id !== "store" && loading && <span className="rv-tab-spinner" />}
            </button>
          ))}
          {!loading && tab !== "store" && (
            <span className={`rv-status-tag${!displayObj ? " err" : ""}`}>
              {!displayObj ? (error ? "error" : "empty") : "ok"}
            </span>
          )}
        </div>

        {/* Toolbar */}
        <div className="rawviewer-toolbar">
          <div style={{ fontSize: 10.5, color: "var(--text-3)", fontFamily: "monospace", display: "flex", alignItems: "center", gap: 8 }}>
            {loading ? (
              <><span className="mb-spinner" /> Fetching…</>
            ) : (
              <>{lineCount} lines · {rawText.length.toLocaleString()} chars</>
            )}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className={`rv-toolbar-btn${copied ? " success" : ""}`}
              onClick={handleCopy} disabled={loading || !displayObj}>
              {copied ? (
                <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!</>
              ) : (
                <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy</>
              )}
            </button>
            <button className="rv-toolbar-btn" onClick={handleSave} disabled={loading || !displayObj}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Save .json
            </button>
          </div>
        </div>

        {/* Code area */}
        <div className="rawviewer-code-wrap">
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
              height: 200, gap: 10, color: "var(--text-3)", fontSize: 12 }}>
              <span className="mb-spinner" /> Memuat dari database…
            </div>
          ) : error && !displayObj ? (
            <div style={{ padding: "20px 24px" }}>
              <div style={{ fontSize: 12, color: "#ef5350", fontFamily: "monospace",
                background: "rgba(239,83,80,0.07)", border: "1px solid rgba(239,83,80,0.18)",
                borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "flex-start", gap: 8 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {error}
              </div>
            </div>
          ) : (
            <pre ref={preRef} className="rawviewer-code rv-code-colored"
              dangerouslySetInnerHTML={{ __html: colorizeJson(rawText) }} />
          )}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// CONTEXT MENU
// ════════════════════════════════════════════════════════════
function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const onKey = e => { if (e.key === "Escape") onClose() }
    document.addEventListener("mousedown", close, true)
    document.addEventListener("contextmenu", close, true)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", close, true)
      document.removeEventListener("contextmenu", close, true)
      document.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  useEffect(() => {
    if (!ref.current) return
    const el = ref.current
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight
    if (rect.right  > vw - 8) el.style.left = `${x - rect.width}px`
    if (rect.bottom > vh - 8) el.style.top  = `${y - rect.height}px`
  })

  return (
    <div ref={ref} className="ctx-menu" role="menu" aria-label="Opsi pesan"
      style={{ left: x, top: y }} onContextMenu={e => e.preventDefault()}>
      {items.map((item, i) => {
        if (item === "divider") return <div key={i} className="ctx-divider" role="separator" />
        const cls = ["ctx-item",
          item.danger ? "danger" : "",
          item.raw    ? "raw"    : "",
          item.muted  ? "muted"  : "",
        ].filter(Boolean).join(" ")
        return (
          <div key={i} className={cls} role="menuitem" tabIndex={0}
            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); item.action(); onClose() }}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { item.action(); onClose() } }}>
            <span className="ctx-icon" aria-hidden="true">{item.icon}</span>
            <span className="ctx-label">{item.label}</span>
            {item.badge && <span className="ctx-badge">{item.badge}</span>}
            {item.hint  && <span className="ctx-hint">{item.hint}</span>}
          </div>
        )
      })}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// FORWARD MODAL
// ════════════════════════════════════════════════════════════
function ForwardModal({ msg, onClose, showToast }) {
  const [chats,    setChats]    = useState([])
  const [search,   setSearch]   = useState("")
  const [selected, setSelected] = useState(new Set())
  const [loading,  setLoading]  = useState(true)
  const [sending,  setSending]  = useState(false)

  useEffect(() => {
    window.api?.dbChats?.({ limit: 200 })
      .then(r => { setChats(r?.data || r || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = chats.filter(c => {
    const n = (c.name || c.jid || "").toLowerCase()
    return !search || n.includes(search.toLowerCase())
  }).slice(0, 60)

  const toggle = (jid) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(jid) ? next.delete(jid) : next.add(jid)
      return next
    })
  }

  const handleSend = async () => {
    if (selected.size === 0) return
    setSending(true)
    const r = await window.api?.forwardMessage?.({ id: msg.id, chatJid: msg.chat_jid, targetJids: [...selected] })
    setSending(false); onClose()
    if (r?.ok || r?.results?.some(x => x.ok)) showToast(`✓ Diteruskan ke ${selected.size} chat`)
    else showToast("Gagal meneruskan: " + (r?.error || ""), false)
  }

  return (
    <div className="mb-backdrop" onMouseDown={onClose}>
      <div onMouseDown={e => e.stopPropagation()} className="mb-sheet" style={{ width: 340, maxHeight: "72vh" }}>

        <div className="mb-sheet-header">
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", letterSpacing: -0.2 }}>Teruskan Pesan</div>
          <button className="mb-icon-btn" onMouseDown={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ padding: "0 14px 12px" }}>
          <div className="mb-search-wrap">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: "var(--text-3)", flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input autoFocus placeholder="Cari chat…" value={search} onChange={e => setSearch(e.target.value)}
              className="mb-search-input" />
          </div>
        </div>

        <div style={{ overflowY: "auto", flex: 1, paddingBottom: 8 }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 24, color: "var(--text-3)", fontSize: 12 }}>
              <span className="mb-spinner" /> Memuat chats…
            </div>
          ) : filtered.map(c => {
            const sel = selected.has(c.jid)
            return (
              <div key={c.jid} onMouseDown={() => toggle(c.jid)} className={`mb-chat-row${sel ? " selected" : ""}`}>
                <div className={`mb-checkbox${sel ? " checked" : ""}`}>
                  {sel && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name || c.jid?.split("@")[0] || "?"}
                  </div>
                  {c.last_msg && (
                    <div style={{ fontSize: 11, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                      {c.last_msg}
                    </div>
                  )}
                </div>
                {c.is_group && <span className="mb-group-badge">Grup</span>}
              </div>
            )
          })}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "28px 24px", color: "var(--text-3)", fontSize: 12 }}>Tidak ada hasil</div>
          )}
        </div>

        <div className="mb-sheet-footer">
          <button onMouseDown={onClose} className="mb-btn-ghost">Batal</button>
          <button onMouseDown={handleSend} disabled={selected.size === 0 || sending}
            className="mb-btn-primary" style={{ flex: 2, opacity: selected.size === 0 ? 0.4 : 1 }}>
            {sending ? (
              <><span className="mb-spinner" style={{ borderTopColor: "#fff", borderColor: "rgba(255,255,255,0.25)" }} /> Mengirim…</>
            ) : `Teruskan${selected.size > 0 ? ` (${selected.size})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// ALBUM BUBBLE WRAPPER
// ════════════════════════════════════════════════════════════
function AlbumBubbleWrapper({ msgs, isMe, isGroup, onMediaClick, openMedia, onReply }) {
  const first = msgs[0]
  const isForwarded = toBool(first.is_forwarded)
  const [highlighted, setHighlighted] = useState(false)
  const [swiping, setSwiping] = useState(false)
  const wrapRef = useRef(null)
  const swipeStartX = useRef(null)
  const swipeTriggered = useRef(false)
  const mouseStartX = useRef(null)
  const mouseDown = useRef(false)

  useEffect(() => {
    if (!wrapRef.current) return
    const el = wrapRef.current
    const handler = () => { setHighlighted(true); setTimeout(() => setHighlighted(false), 1800) }
    el.addEventListener("msg-highlight", handler)
    return () => el.removeEventListener("msg-highlight", handler)
  }, [])

  const handleReply = useCallback(() => { if (onReply) onReply(first) }, [first, onReply])
  const onTouchStart = useCallback(e => { swipeStartX.current = e.touches[0].clientX; swipeTriggered.current = false }, [])
  const onTouchMove = useCallback(e => {
    if (swipeStartX.current === null) return
    const dx = e.touches[0].clientX - swipeStartX.current
    if ((isMe ? dx < -40 : dx > 40) && !swipeTriggered.current) { swipeTriggered.current = true; setSwiping(true); handleReply(); setTimeout(() => setSwiping(false), 400) }
  }, [isMe, handleReply])
  const onTouchEnd = useCallback(() => { swipeStartX.current = null }, [])
  const onMouseDown = useCallback(e => { if (e.button !== 0) return; mouseStartX.current = e.clientX; mouseDown.current = true; swipeTriggered.current = false }, [])
  const onMouseMove = useCallback(e => {
    if (!mouseDown.current || mouseStartX.current === null) return
    const dx = e.clientX - mouseStartX.current
    if ((isMe ? dx < -50 : dx > 50) && !swipeTriggered.current) { swipeTriggered.current = true; setSwiping(true); handleReply(); setTimeout(() => setSwiping(false), 400) }
  }, [isMe, handleReply])
  const onMouseUp = useCallback(() => { mouseDown.current = false; mouseStartX.current = null }, [])

  const albumSenderDisplay = (() => {
    if (!isGroup) return null
    if (first.sender_name && !first.sender_name.includes("@")) return first.sender_name
    const jidRaw = first.sender_jid || ""
    const isLid  = jidRaw.endsWith("@lid")
    const user   = jidRaw.includes("@") ? jidRaw.split("@")[0].split(":")[0] : jidRaw
    if (/^\d{6,}$/.test(user)) return `+${user}`
    if (isLid) { const num = user.replace(/\D/g, ""); return `~${num.length > 6 ? num.slice(-6) : num}` }
    if (first.sender_name?.includes("@")) {
      const u = first.sender_name.split("@")[0].split(":")[0]
      if (/^\d{6,}$/.test(u)) return `+${u}`
    }
    return first.sender_name || user || null
  })()

  const caption = msgs.map(m => m.body).filter(Boolean).join(" · ")

  return (
    <div ref={wrapRef} className={`msg-row-wrap ${isMe ? "me" : "them"}${swiping ? " swiping" : ""}`}
      style={{ position: "relative", display: "flex", alignItems: "center" }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>

      <button className="reply-btn" title="Balas" aria-label="Balas pesan"
        onMouseDown={e => { e.stopPropagation(); handleReply() }}>
        <ReplyIcon />
      </button>

      <div className={`msg-row${isMe ? " me" : " them"}${highlighted ? " highlighted" : ""}`} style={{ flex: 1, minWidth: 0 }}>
        {!isMe && isGroup && albumSenderDisplay && (
          <div className="msg-sender-name">{albumSenderDisplay}</div>
        )}
        <div className={`msg-inner${isMe ? " me" : ""}`}>
          {!isMe && isGroup && (
            <SenderAvatar jid={first.sender_jid || ""} name={albumSenderDisplay || "?"} size={28} />
          )}
          <div className="bubble-wrap" style={{ position: "relative" }}>
            <div className={`bubble no-pad${isMe ? " me" : ""}${highlighted ? " highlighted" : ""}`}
              style={{ position: "relative", padding: 0, overflow: "hidden" }}>
              {isForwarded && <div style={{ padding: "4px 10px 0" }}><ForwardBadge score={first.forwarding_score} /></div>}
              <AlbumBubble msgs={msgs} onMediaClick={onMediaClick} openMedia={openMedia} />
              {caption && <div className="media-caption" style={{ padding: "4px 10px 6px", fontSize: 13 }}><RichText text={caption} /></div>}
              <div className="media-time-overlay">
                <BubbleTime ts={first.timestamp} />
                {isMe && <Ticks status={first.status} />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export { AlbumBubbleWrapper }

// ════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════
const _MessageBubbleInner = function MessageBubble({ msg, onReply, onScrollToMsg, onMediaClick }) {
  const isMe        = toBool(msg.from_me)
  const isGroup     = toBool(msg.is_group)
  const isForwarded = toBool(msg.is_forwarded)
  const t           = msg.msg_type || "conversation"
  const isReaction  = t === "reactionMessage"
  const isSticker   = t === "stickerMessage"
  const hasNoPad    = NO_PAD_TYPES.has(t)
  const hasQuoted   = !!(msg.quoted_id || msg.quoted_body || msg.quoted_sender)

  const senderDisplay = (() => {
    if (!isGroup) return msg.sender_name || null
    if (msg.sender_name && !msg.sender_name.includes("@")) return msg.sender_name
    const jidRaw = msg.sender_jid || ""
    const isLid  = jidRaw.endsWith("@lid")
    const user   = jidRaw.includes("@") ? jidRaw.split("@")[0].split(":")[0] : jidRaw
    if (/^\d{6,}$/.test(user)) return `+${user}`
    if (isLid) {
      const numericPart = user.replace(/\D/g, "")
      if (numericPart.length >= 6) return `+${numericPart}`
      return msg.sender_name || `~${user.slice(0, 10)}`
    }
    if (msg.sender_name?.includes("@")) {
      const u = msg.sender_name.split("@")[0].split(":")[0]
      if (/^\d{6,}$/.test(u)) return `+${u}`
    }
    return msg.sender_name || user || "?"
  })()

  const ownJid = isMe && isGroup ? (useAuthStore.getState().connectedUser?.jid || null) : null

  const [highlighted,    setHighlighted]    = useState(false)
  const [swiping,        setSwiping]        = useState(false)
  const [ctxMenu,        setCtxMenu]        = useState(null)
  const [rawViewer,      setRawViewer]      = useState(false)
  const [devEvalOpen,    setDevEvalOpen]    = useState(false)
  const [emojiPickerOpen,setEmojiPickerOpen]= useState(false)
  const [forwardOpen,    setForwardOpen]    = useState(false)
  const [deleteOpen,     setDeleteOpen]     = useState(false)
  const [pinOpen,        setPinOpen]        = useState(false)
  const [actionToast,    setActionToast]    = useState(null)
  const [starredLocal,   setStarredLocal]   = useState(null)

  const swipeStartX    = useRef(null)
  const swipeTriggered = useRef(false)
  const wrapRef        = useRef(null)
  const mouseStartX    = useRef(null)
  const mouseDown      = useRef(false)

  const handleReply = useCallback(() => { if (onReply) onReply(msg) }, [msg, onReply])
  const onTouchStart = useCallback(e => { swipeStartX.current = e.touches[0].clientX; swipeTriggered.current = false }, [])
  const onTouchMove = useCallback(e => {
    if (swipeStartX.current === null) return
    const dx = e.touches[0].clientX - swipeStartX.current
    if ((isMe ? dx < -40 : dx > 40) && !swipeTriggered.current) { swipeTriggered.current = true; setSwiping(true); handleReply(); setTimeout(() => setSwiping(false), 400) }
  }, [isMe, handleReply])
  const onTouchEnd   = useCallback(() => { swipeStartX.current = null }, [])
  const onMouseDown  = useCallback(e => { if (e.button !== 0) return; mouseStartX.current = e.clientX; mouseDown.current = true; swipeTriggered.current = false }, [])
  const onMouseMove  = useCallback(e => {
    if (!mouseDown.current || mouseStartX.current === null) return
    const dx = e.clientX - mouseStartX.current
    if ((isMe ? dx < -50 : dx > 50) && !swipeTriggered.current) { swipeTriggered.current = true; setSwiping(true); handleReply(); setTimeout(() => setSwiping(false), 400) }
  }, [isMe, handleReply])
  const onMouseUp    = useCallback(() => { mouseDown.current = false; mouseStartX.current = null }, [])
  const onContextMenu= useCallback(e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }) }, [])

  useEffect(() => {
    if (!wrapRef.current) return
    const el = wrapRef.current
    const handler = () => { setHighlighted(true); setTimeout(() => setHighlighted(false), 1800) }
    el.addEventListener("msg-highlight", handler)
    return () => el.removeEventListener("msg-highlight", handler)
  }, [])

  const isTransparentSticker = isSticker && !hasQuoted
  const bubbleClass = ["bubble", isMe ? "me" : null, (isReaction || isTransparentSticker) ? "sticker" : null, hasNoPad ? "no-pad" : null, isSticker && hasQuoted ? "sticker-quoted" : null].filter(Boolean).join(" ")
  const content = renderContent(msg, { onMediaClick })
  if (content === null) return null

  const showToast = (message, ok = true) => {
    setActionToast({ message, ok })
    setTimeout(() => setActionToast(null), 2800)
  }

  const effectiveStarred = starredLocal !== null ? starredLocal : toBool(msg.starred)

  const getPreviewText = () => {
    if (t === "imageMessage") return "Foto"
    if (t === "videoMessage") return "Video"
    if (t === "audioMessage" || t === "pttMessage") return "Audio"
    if (t === "stickerMessage") return "Stiker"
    if (t === "documentMessage") return msg.media_filename || "Dokumen"
    return msg.body || "Pesan"
  }

  const isStarred          = effectiveStarred
  const hasBodyTxt         = !!(msg.body || t === "conversation" || t === "extendedTextMessage")
  const hasDownloadedMedia = toBool(msg.has_media) && !!msg.media_saved_path

  const ctxItems = [
    {
      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>,
      label: "Reply", action: handleReply,
    },
    ...(hasBodyTxt ? [{
      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
      label: "Copy", action: () => navigator.clipboard?.writeText(msg.body || getPreviewText()),
    }] : []),
    {
      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="3"/><line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="3"/></svg>,
      label: "React", action: () => setEmojiPickerOpen(true),
    },
    {
      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>,
      label: "Forward", action: () => setForwardOpen(true),
    },
    {
      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>,
      label: "Pin", action: () => setPinOpen(true),
    },
    {
      icon: <svg width="15" height="15" viewBox="0 0 24 24"
        fill={isStarred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        style={{ color: isStarred ? "#f59e0b" : undefined }}>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>,
      label: isStarred ? "Unstar" : "Star",
      action: async () => {
        const newStar = !isStarred
        setStarredLocal(newStar)
        const r = await window.api?.starMessage?.({ id: msg.id, chatJid: msg.chat_jid, star: newStar })
        if (r?.ok) showToast(newStar ? "⭐ Pesan di-bintangi" : "Bintang dihapus")
        else { setStarredLocal(isStarred); showToast("Gagal: " + (r?.error || "unknown"), false) }
      },
    },
    "divider",
    ...(hasQuoted && onScrollToMsg ? [{
      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>,
      label: "View Quoted", action: () => onScrollToMsg(msg.quoted_id),
    }] : []),
    ...(hasDownloadedMedia ? [{
      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
      label: "Save Media",
      action: async () => {
        const r = await window.api?.saveMediaFile?.({ srcPath: msg.media_saved_path, suggestedName: msg.media_filename || undefined })
        if (r?.ok) showToast("✓ Media tersimpan")
        else if (r?.reason !== "canceled") showToast("Gagal simpan: " + (r?.error || ""), false)
      },
    }] : []),
    "divider",
    {
      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
      label: "View Raw JSON", raw: true, hint: "JSON", action: () => setRawViewer(true),
    },
    {
      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
      label: "Dev Eval", raw: true, hint: "JS", action: () => setDevEvalOpen(true),
    },
    "divider",
    {
      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
      label: "Report", danger: true,
      action: async () => {
        showToast("Melaporkan pesan…")
        const r = await window.api?.forwardMessage?.({ id: msg.id, chatJid: msg.chat_jid, targetJids: ["0@s.whatsapp.net"] })
        if (r?.ok) showToast("✓ Pesan dilaporkan")
        else showToast("Laporan terkirim", true)
      },
    },
    {
      icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
      label: "Delete", danger: true, action: () => setDeleteOpen(true),
    },
  ]

  // ── Inline modals ──────────────────────────────────────────────────────────
  const actionModals = (<>

    {/* Toast */}
    {actionToast && (
      <div className={`mb-toast${actionToast.ok ? "" : " err"}`}>
        {actionToast.ok
          ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        }
        {actionToast.message}
      </div>
    )}

    {/* Emoji Reaction Picker */}
    {emojiPickerOpen && (
      <div className="mb-backdrop" onMouseDown={() => setEmojiPickerOpen(false)}>
        <div onMouseDown={e => e.stopPropagation()} className="mb-sheet" style={{ maxWidth: 316 }}>
          <div className="mb-sheet-header" style={{ paddingBottom: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", letterSpacing: 1, textTransform: "uppercase" }}>Pilih Reaksi</div>
            <button className="mb-icon-btn" onMouseDown={() => setEmojiPickerOpen(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div style={{ padding: "12px 14px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
              {["❤️","👍","😂","😮","😢","🙏","🔥","👏","🎉","💯","😍","😡","👎","🤣","😭","✅","🥰","😊","🤔","💪"].map(em => (
                <button key={em} className="mb-emoji-btn"
                  onMouseDown={async (e) => {
                    e.stopPropagation()
                    setEmojiPickerOpen(false)
                    const r = await window.api?.reactMessage?.({ id: msg.id, chatJid: msg.chat_jid, emoji: em })
                    if (r?.ok) showToast(`${em} Reaksi dikirim`)
                    else showToast("Gagal kirim reaksi: " + (r?.error || ""), false)
                  }}>
                  {em}
                </button>
              ))}
            </div>
            <button
              onMouseDown={async (e) => {
                e.stopPropagation(); setEmojiPickerOpen(false)
                const r = await window.api?.reactMessage?.({ id: msg.id, chatJid: msg.chat_jid, emoji: "" })
                if (r?.ok) showToast("Reaksi dihapus")
              }}
              className="mb-btn-ghost" style={{ width: "100%", marginTop: 10, fontSize: 12 }}>
              Hapus Reaksi
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Forward Modal */}
    {forwardOpen && <ForwardModal msg={msg} onClose={() => setForwardOpen(false)} showToast={showToast} />}

    {/* Delete Confirmation */}
    {deleteOpen && (
      <div className="mb-backdrop" onMouseDown={() => setDeleteOpen(false)}>
        <div onMouseDown={e => e.stopPropagation()} className="mb-sheet mb-confirm">
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
            <div className="mb-confirm-icon danger">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", marginBottom: 5 }}>Hapus Pesan?</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.55 }}>Pilih cara menghapus pesan ini.</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <button className="mb-confirm-btn" onMouseDown={async () => {
              setDeleteOpen(false)
              const r = await window.api?.deleteMessage?.({ id: msg.id, chatJid: msg.chat_jid, forEveryone: false })
              if (r?.ok) showToast("Pesan dihapus untuk kamu")
              else showToast("Gagal hapus: " + (r?.error || ""), false)
            }}>Hapus untuk Saya</button>
            {isMe && (
              <button className="mb-confirm-btn danger" onMouseDown={async () => {
                setDeleteOpen(false)
                const r = await window.api?.deleteMessage?.({ id: msg.id, chatJid: msg.chat_jid, forEveryone: true })
                if (r?.ok) showToast("Pesan dihapus untuk semua")
                else showToast("Gagal hapus: " + (r?.error || ""), false)
              }}>Hapus untuk Semua</button>
            )}
            <button className="mb-confirm-cancel" onMouseDown={() => setDeleteOpen(false)}>Batal</button>
          </div>
        </div>
      </div>
    )}

    {/* Pin Duration Modal */}
    {pinOpen && (
      <div className="mb-backdrop" onMouseDown={() => setPinOpen(false)}>
        <div onMouseDown={e => e.stopPropagation()} className="mb-sheet mb-confirm">
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
            <div className="mb-confirm-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", marginBottom: 5 }}>Pin Pesan</div>
              <div style={{ fontSize: 12, color: "var(--text-3)" }}>Pilih durasi pin</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {[{ label: "24 Jam", duration: 86400 }, { label: "7 Hari", duration: 604800 }, { label: "30 Hari", duration: 2592000 }].map(({ label, duration }) => (
              <button key={duration} className="mb-confirm-btn" onMouseDown={async () => {
                setPinOpen(false)
                const r = await window.api?.pinMessage?.({ id: msg.id, chatJid: msg.chat_jid, pin: true, duration })
                if (r?.ok) showToast(`📌 Pesan di-pin ${label}`)
                else showToast("Gagal pin: " + (r?.error || ""), false)
              }}>{label}</button>
            ))}
            <button className="mb-confirm-btn muted" onMouseDown={async () => {
              setPinOpen(false)
              const r = await window.api?.pinMessage?.({ id: msg.id, chatJid: msg.chat_jid, pin: false })
              if (r?.ok) showToast("📌 Pin dihapus")
              else showToast("Gagal unpin: " + (r?.error || ""), false)
            }}>Hapus Pin</button>
            <button className="mb-confirm-cancel" onMouseDown={() => setPinOpen(false)}>Batal</button>
          </div>
        </div>
      </div>
    )}
  </>)

  // Reaction float display
  if (isReaction) {
    const emoji = msg.body || msg.reaction_emoji || "❤️"
    return (
      <div ref={wrapRef} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", padding: "1px 14px", userSelect: "none" }} onContextMenu={onContextMenu}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start", gap: 2 }}>
          {!isMe && isGroup && senderDisplay && <div style={{ fontSize: 11, color: "var(--text-3)", paddingLeft: 2 }}>{senderDisplay}</div>}
          <div
            title={`Reaksi • ${senderDisplay || (isMe ? "Kamu" : "Mereka")}`}
            style={{ fontSize: 26, lineHeight: 1, cursor: "default", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.4))", transition: "transform 0.12s" }}
            onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.2)" }}
            onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)" }}
          >
            {emoji}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-3)", lineHeight: 1 }}>
            {msg.timestamp ? new Date(msg.timestamp * 1000).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : ""}
            {isMe && <span style={{ marginLeft: 3, opacity: 0.6 }}>{Number(msg.status) >= 3 ? "✓✓" : "✓"}</span>}
          </div>
        </div>
        {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems} onClose={() => setCtxMenu(null)} />}
        {rawViewer   && <RawViewerModal msg={msg} onClose={() => setRawViewer(false)} />}
        {devEvalOpen && <DevEvalModal   msg={msg} onClose={() => setDevEvalOpen(false)} />}
        {actionModals}
      </div>
    )
  }

  return (
    <div ref={wrapRef}
      className={`msg-row-wrap ${isMe ? "me" : "them"}${swiping ? " swiping" : ""}`}
      style={{ position: "relative", display: "flex", alignItems: "center" }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>

      <button className="reply-btn" title="Balas" aria-label="Balas pesan"
        onMouseDown={e => { e.stopPropagation(); handleReply() }}>
        <ReplyIcon />
      </button>

      {ctxMenu    && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxItems} onClose={() => setCtxMenu(null)} />}
      {rawViewer  && <RawViewerModal msg={msg} onClose={() => setRawViewer(false)} />}
      {devEvalOpen && <DevEvalModal  msg={msg} onClose={() => setDevEvalOpen(false)} />}
      {actionModals}

      <div className={`msg-row${isMe ? " me" : " them"}${highlighted ? " highlighted" : ""}`}
        onContextMenu={onContextMenu} style={{ flex: 1, minWidth: 0 }}>
        {!isMe && isGroup && senderDisplay && (
          <div className="msg-sender-name">{senderDisplay}</div>
        )}
        <div className={`msg-inner${isMe ? " me" : ""}`}>
          {!isMe && isGroup && (
            <SenderAvatar jid={msg.sender_jid || ""} name={senderDisplay || "?"} size={28} />
          )}
          {isMe && isGroup && ownJid && (
            <SenderAvatar jid={ownJid} name="Saya" size={24} />
          )}
          <div className="bubble-wrap" style={{ position: "relative" }}>
            <div className={bubbleClass} style={{ position: "relative" }}>
              {isForwarded && <ForwardBadge score={msg.forwarding_score} />}
              {hasQuoted && (
                <QuotedMsg
                  body={msg.quoted_body}
                  sender={msg.quoted_sender}
                  senderName={msg.quoted_sender_name}
                  type={msg.quoted_type}
                  hasMedia={toBool(msg.quoted_has_media)}
                  mimetype={msg.quoted_mimetype}
                  onClick={() => !toBool(msg.is_status_reply) && onScrollToMsg && msg.quoted_id && onScrollToMsg(msg.quoted_id)}
                  quotedFromMe={msg.quoted_sender === "__me__"}
                  isStatusReply={toBool(msg.is_status_reply)}
                  isViewOnce={toBool(msg.quoted_is_view_once)}
                  quotedThumbnail={msg.quoted_thumbnail_b64 || null}
                  statusMusic={msg.quoted_status_music || null}
                />
              )}
              {content}
              {!isReaction && !isSticker && (() => {
                const isImgVideo = t === "imageMessage" || t === "videoMessage"
                if (isImgVideo && !msg.body) {
                  return (
                    <div className="media-time-overlay">
                      <BubbleTime ts={msg.timestamp} />
                      {isMe && <Ticks status={msg.status} />}
                    </div>
                  )
                }
                return (
                  <div className={`bubble-footer${isMe ? " me" : ""}`}>
                    <BubbleTime ts={msg.timestamp} />
                    {isMe && <Ticks status={msg.status} />}
                  </div>
                )
              })()}
            </div>
            {msg.reactions && <ReactionOverlay reactions={msg.reactions} />}
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(_MessageBubbleInner, (prev, next) => {
  if (prev.msg !== next.msg) return false
  if (prev.onReply !== next.onReply) return false
  if (prev.onScrollToMsg !== next.onScrollToMsg) return false
  if (prev.onMediaClick !== next.onMediaClick) return false
  return true
})