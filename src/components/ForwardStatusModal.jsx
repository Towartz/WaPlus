// src/components/ForwardStatusModal.jsx
// Forward Status — improved UI/UX redesign
//
// Changes from v1:
// [UX] Tabs: Semua / Kontak / Grup — no mixed, unsorted flat list
// [UX] Caption always visible (no hidden toggle) when recipients selected
// [UX] Per-recipient send-state feedback on avatars (sending spinner / sent tick / failed)
// [UX] Selected chips now show mini avatar + name, with individual ✕ remove
// [UX] Recipient counter + animated fill bar (turns red near max)
// [UX] Chip row auto-scrolls to newest chip
// [UX] Ctrl+Enter keyboard shortcut sends
// [UX] Empty state per-tab with icon
// [UX] Loading skeleton rows instead of bare spinner
// [UX] Success summary line before auto-close
// [UX] Send button scale/spring animation on enable
// [UX] Hover on close button
// [FIX] selectedItems resolved from full recentChats+contacts, not just displayList

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { normalizeJid, isJidGroup, isJidNewsletter } from "../utils/jidUtils"
import { pathToFileUrl } from "./bubble/utils"

// ─── safeMediaUrl — mirrors StatusView.jsx; converts any local path to media://
// so the Electron renderer can fetch it via the hardened media:// protocol handler.
function safeMediaUrl(url) {
  if (!url) return url
  if (url.startsWith("https://") || url.startsWith("http://") || url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("media://")) return url
  if (url.startsWith("file://")) {
    const withoutProto = url.slice("file://".length)
    const clean = withoutProto.startsWith("/") ? withoutProto : "/" + withoutProto
    return "media://" + clean
  }
  if (url.startsWith("/")) return "media://" + url
  return pathToFileUrl(url)
}

// ─── fetchMediaAsBase64 — fetch media bytes in the renderer (the only process
// that can resolve media:// URLs) and return base64 string.
// Mirrors the fetch logic in StatusView.jsx handleSaveMedia exactly.
async function fetchMediaAsBase64(mediaUrl) {
  const fetchUrl = safeMediaUrl(mediaUrl)
  const res = await fetch(fetchUrl)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const ab    = await res.arrayBuffer()
  const uint8 = new Uint8Array(ab)
  let bin = ""
  for (let i = 0; i < uint8.length; i++) bin += String.fromCharCode(uint8[i])
  return btoa(bin)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "#1a5c3e","#1565c0","#6a1b9a","#b71c1c","#e65100",
  "#2e7d32","#00695c","#4527a0","#00838f","#ad1457",
]
function seedColor(s) {
  if (!s) return AVATAR_COLORS[0]
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function initials(name) {
  if (!name) return "?"
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}
function fmtJid(jid) {
  if (!jid) return ""
  const u = jid.split("@")[0].split(":")[0]
  return /^\d{6,}$/.test(u) ? `+${u}` : u
}

const MAX_SELECT = 10

// ─── Profile picture cache (module-level, persists across modal open/close) ───
const picCache = new Map()

// ─── MiniAvatar ───────────────────────────────────────────────────────────────
function MiniAvatar({ jid, name, size = 42 }) {
  const [url, setUrl] = useState(() => picCache.get(jid) ?? null)
  useEffect(() => {
    if (!jid || picCache.has(jid)) return
    window.api?.getProfilePic?.({ jid })
      .then(r => {
        const u = r?.url || (typeof r === "string" ? r : null)
        picCache.set(jid, u)
        if (u) setUrl(u)
      })
      .catch(() => picCache.set(jid, null))
  }, [jid])

  const isGrp = isJidGroup(jid)
  const bg    = seedColor(jid || name)
  return (
    <div style={{
      width: size, height: size,
      borderRadius: isGrp ? "32%" : "50%",
      background: bg, flexShrink: 0, overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.36, fontWeight: 700, color: "#fff",
      letterSpacing: "-0.5px", userSelect: "none",
    }}>
      {url
        ? <img src={url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} onError={() => setUrl(null)} />
        : isGrp
          ? <svg width={size*0.46} height={size*0.46} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.1">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          : initials(name || fmtJid(jid))
      }
    </div>
  )
}

// ─── Status preview card (header) ────────────────────────────────────────────
function StatusPreview({ story }) {
  if (!story) return null
  const isVid  = story.sourceType === "video" || story.sourceType === "gif"
  const isText = story.sourceType === "text"
  const isAudio = story.sourceType === "audio"

  // Type badge colors
  const badgeCfg = {
    video:  { label: "VIDEO",  bg: "#6366f1" },
    gif:    { label: "GIF",    bg: "#6366f1" },
    image:  { label: "FOTO",   bg: "#0ea5e9" },
    audio:  { label: "AUDIO",  bg: "#eab308" },
    text:   { label: "TEKS",   bg: "#22c55e" },
  }
  const badge = badgeCfg[story.sourceType] || badgeCfg.image

  return (
    <div style={{
      width: 48, height: 68, borderRadius: 10, overflow: "hidden",
      flexShrink: 0, position: "relative",
      background: isText ? "linear-gradient(150deg,#16a34a,#0e6b45)" : "#111",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: "0 2px 12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)",
    }}>
      {/* Thumbnail */}
      {story.thumbnailBase64 && (
        <img src={story.thumbnailBase64} alt=""
          style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
      )}
      {/* Video play icon overlay */}
      {isVid && (
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.38)" }}>
          <div style={{ width:20, height:20, borderRadius:"50%", background:"rgba(255,255,255,0.92)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="#000"><polygon points="5,3 19,12 5,21"/></svg>
          </div>
        </div>
      )}
      {/* Audio icon */}
      {isAudio && !story.thumbnailBase64 && (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8">
          <path d="M9 18V5l12-2v13"/>
          <circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
      )}
      {/* Text preview */}
      {isText && !story.thumbnailBase64 && (
        <span style={{ fontSize:9, color:"#fff", padding:"0 4px", textAlign:"center", fontWeight:600, lineHeight:1.3, zIndex:1, wordBreak:"break-word" }}>
          {(story.text||"").slice(0,28)}
        </span>
      )}
      {/* Type badge */}
      <div style={{
        position:"absolute", bottom:4, left:"50%", transform:"translateX(-50%)",
        background: badge.bg, borderRadius:4,
        fontSize:8, fontWeight:800, color:"#fff",
        padding:"1px 5px", letterSpacing:"0.04em", whiteSpace:"nowrap",
        boxShadow:"0 1px 4px rgba(0,0,0,0.4)",
      }}>
        {badge.label}
      </div>
    </div>
  )
}

// ─── Checkmark circle ─────────────────────────────────────────────────────────
function CheckCircle({ checked }) {
  return (
    <div style={{
      width: 23, height: 23, borderRadius: "50%", flexShrink: 0,
      border: checked ? "none" : "1.5px solid rgba(255,255,255,0.22)",
      background: checked ? "#25d366" : "rgba(255,255,255,0.03)",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.17s cubic-bezier(.34,1.56,.64,1)",
      boxShadow: checked ? "0 0 0 4px rgba(37,211,102,0.16)" : "none",
      transform: checked ? "scale(1.1)" : "scale(1)",
    }}>
      {checked && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <polyline points="2,6.2 5,9.2 10,2.8" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
  )
}

// ─── Skeleton loading row ─────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", margin:"1px 8px" }}>
      <div className="fwd-skel" style={{ width:42, height:42, borderRadius:"50%", flexShrink:0 }} />
      <div style={{ flex:1, display:"flex", flexDirection:"column", gap:6 }}>
        <div className="fwd-skel" style={{ height:13, width:"55%", borderRadius:6 }} />
        <div className="fwd-skel" style={{ height:10, width:"35%", borderRadius:6 }} />
      </div>
    </div>
  )
}

// ─── Recipient chip (selected strip) ─────────────────────────────────────────
function RecipientChip({ jid, name, onRemove }) {
  return (
    <div className="fwd-chip" style={{ display:"inline-flex", alignItems:"center", gap:5, flexShrink:0 }}>
      <MiniAvatar jid={jid} name={name} size={20} />
      <span style={{ maxWidth:68, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontSize:11, fontWeight:600 }}>
        {(name || fmtJid(jid)).slice(0, 14)}
      </span>
      <button
        onClick={e => { e.stopPropagation(); onRemove(jid) }}
        style={{
          background:"rgba(255,255,255,0.18)", border:"none", borderRadius:"50%",
          width:15, height:15, display:"flex", alignItems:"center", justifyContent:"center",
          cursor:"pointer", flexShrink:0, padding:0, transition:"background 0.12s",
        }}
        onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,0.32)"}
        onMouseLeave={e => e.currentTarget.style.background="rgba(255,255,255,0.18)"}
      >
        <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  )
}

// ─── Tab button ───────────────────────────────────────────────────────────────
function TabBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex:1, background:"none", border:"none", cursor:"pointer",
      padding:"9px 4px 8px",
      color: active ? "#25d366" : "rgba(255,255,255,0.38)",
      fontSize:12, fontWeight: active ? 700 : 500,
      borderBottom: active ? "2px solid #25d366" : "2px solid transparent",
      transition:"color 0.15s, border-color 0.15s",
      letterSpacing:"0.01em",
    }}>
      {label}
    </button>
  )
}

// ─── Contact row ──────────────────────────────────────────────────────────────
function ContactRow({ chat, isChecked, onToggle, sendState }) {
  const jid         = normalizeJid(chat.jid)
  const isGrp       = isJidGroup(jid)
  const displayName = chat.name || chat.push_name || fmtJid(jid)
  const sub         = isGrp ? "Grup" : fmtJid(jid)

  return (
    <div
      className="fwd-row"
      onClick={() => onToggle(jid)}
      role="checkbox"
      aria-checked={isChecked}
    >
      {/* Avatar with send-state overlay */}
      <div style={{ position:"relative", flexShrink:0 }}>
        <MiniAvatar jid={jid} name={displayName} size={43} />
        {sendState === "sending" && (
          <div style={{
            position:"absolute", inset:0, borderRadius: isGrp ? "32%" : "50%",
            background:"rgba(0,0,0,0.55)",
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            <div style={{ width:15, height:15, borderRadius:"50%", border:"2px solid rgba(255,255,255,0.25)", borderTopColor:"#fff", animation:"fwdSpin 0.65s linear infinite" }} />
          </div>
        )}
        {sendState === "sent" && (
          <div style={{
            position:"absolute", inset:0, borderRadius: isGrp ? "32%" : "50%",
            background:"rgba(37,211,102,0.88)",
            display:"flex", alignItems:"center", justifyContent:"center",
            animation:"fwdFadeIn 0.2s ease",
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="20,6 9,17 4,12"/>
            </svg>
          </div>
        )}
        {sendState === "failed" && (
          <div style={{
            position:"absolute", inset:0, borderRadius: isGrp ? "32%" : "50%",
            background:"rgba(239,68,68,0.85)",
            display:"flex", alignItems:"center", justifyContent:"center",
            animation:"fwdFadeIn 0.2s ease",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </div>
        )}
      </div>

      {/* Name + sub */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:600, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {displayName}
        </div>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.36)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:4, marginTop:1 }}>
          {isGrp && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            </svg>
          )}
          {sendState === "sent"    ? <span style={{ color:"#4ade80", fontWeight:600 }}>✓ Terkirim</span>
           : sendState === "failed" ? <span style={{ color:"#f87171", fontWeight:600 }}>Gagal terkirim</span>
           : sub}
        </div>
      </div>

      {/* Checkmark (hidden during send) */}
      {!sendState && <CheckCircle checked={isChecked} />}
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────
export default function ForwardStatusModal({ story, senderName, onClose }) {
  const [query, setQuery]           = useState("")
  const [selected, setSelected]     = useState(new Set())
  const [caption, setCaption]       = useState("")
  const [tab, setTab]               = useState("all")   // all | contacts | groups
  const [recentChats, setRecentChats] = useState([])
  const [contacts, setContacts]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [sending, setSending]       = useState(false)
  const [fetchingMedia, setFetchingMedia] = useState(false)  // true while pre-fetching buffer
  const [sendStates, setSendStates] = useState({})      // jid → "sending" | "sent" | "failed"
  const [allDone, setAllDone]       = useState(false)
  const [searchResults, setSearchResults] = useState(null)

  const searchTimer = useRef(null)
  const inputRef    = useRef(null)
  const chipRowRef  = useRef(null)

  // Autofocus search
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 90) }, [])

  // Load data
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [chatsRes, contactsRes] = await Promise.all([
          window.api?.dbChats?.({ limit: 30, offset: 0 }),
          window.api?.dbContacts?.({ limit: 200 }),
        ])
        const rawChats  = chatsRes?.data  || chatsRes?.chats    || (Array.isArray(chatsRes)    ? chatsRes    : [])
        const rawCtcts  = contactsRes?.data || contactsRes?.contacts || (Array.isArray(contactsRes) ? contactsRes : [])
        setRecentChats(rawChats.filter(c => c.jid && !isJidNewsletter(c.jid)).slice(0, 30))
        setContacts(rawCtcts.filter(c => c.jid && !isJidNewsletter(c.jid)))
      } catch (_) {}
      setLoading(false)
    }
    load()
  }, [])

  // Live search with debounce
  useEffect(() => {
    clearTimeout(searchTimer.current)
    if (!query.trim()) { setSearchResults(null); return }
    searchTimer.current = setTimeout(async () => {
      try {
        const [chatsRes, ctctsRes] = await Promise.all([
          window.api?.dbSearchChats?.(query),
          window.api?.dbSearchContacts?.(query),
        ])
        const chats = (chatsRes?.data || chatsRes?.chats    || (Array.isArray(chatsRes)    ? chatsRes    : [])).filter(c => !isJidNewsletter(c.jid))
        const ctcts = (ctctsRes?.data || ctctsRes?.contacts || (Array.isArray(ctctsRes)    ? ctctsRes    : [])).filter(c => !isJidNewsletter(c.jid))
        const seen = new Set()
        const merged = [...chats, ...ctcts].filter(c => {
          const j = normalizeJid(c.jid)
          if (seen.has(j)) return false
          seen.add(j); return true
        })
        setSearchResults(merged)
      } catch (_) { setSearchResults([]) }
    }, 170)
  }, [query])

  // Escape to close
  useEffect(() => {
    const h = e => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [onClose])

  // Auto-scroll chip strip to newest
  useEffect(() => {
    if (chipRowRef.current) chipRowRef.current.scrollLeft = chipRowRef.current.scrollWidth
  }, [selected.size])

  // ── Derived display lists ──────────────────────────────────────────────────
  const allItems = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const c of [...recentChats, ...contacts]) {
      const j = normalizeJid(c.jid)
      if (!seen.has(j)) { seen.add(j); out.push(c) }
    }
    return out
  }, [recentChats, contacts])

  const displayList = useMemo(() => {
    if (searchResults !== null) return searchResults
    if (tab === "all")      return allItems
    if (tab === "contacts") return allItems.filter(c => !isJidGroup(c.jid))
    if (tab === "groups")   return allItems.filter(c =>  isJidGroup(c.jid))
    return []
  }, [searchResults, tab, allItems])

  // ── Selection toggle ───────────────────────────────────────────────────────
  const toggle = useCallback((jid) => {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(jid)) n.delete(jid)
      else if (n.size < MAX_SELECT) n.add(jid)
      return n
    })
  }, [])

  // selectedItems resolved from all known items (not just current tab/search)
  const selectedItems = useMemo(() =>
    [...selected].map(jid => {
      const found = allItems.find(c => normalizeJid(c.jid) === jid)
      return found
        ? { jid, name: found.name || found.push_name || fmtJid(jid) }
        : { jid, name: fmtJid(jid) }
    }),
  [selected, allItems])

  // ── Send ───────────────────────────────────────────────────────────────────
  //
  // KEY FIX: story.mediaUrl is a local media:// path that only the renderer can
  // fetch. main.js (Node) cannot resolve media:// — it would get a silent 404.
  // So we fetch the bytes HERE in the renderer (same as handleSaveMedia in
  // StatusView.jsx does for saving), convert to base64, and pass mediaBuffer
  // to the IPC call. main.js then just does Buffer.from(base64, "base64").
  //
  const handleSend = useCallback(async () => {
    if (selected.size === 0 || sending || allDone) return
    setSending(true)
    const targetJids = [...selected]
    setSendStates(Object.fromEntries(targetJids.map(j => [j, "sending"])))

    const isText  = story.sourceType === "text"
    const isAudio = story.sourceType === "audio"
    const isVideo = story.sourceType === "video" || story.sourceType === "gif"
    const isImage = story.sourceType === "image"
    const msgCaption = caption.trim() || story.caption || ""

    // Resolve mimetype with same fallbacks as StatusView handleSaveMedia
    const rawMime = story.mediaMimetype || ""
    const mime = rawMime || (
      isVideo ? "video/mp4" :
      isAudio ? "audio/ogg; codecs=opus" :
      isImage ? "image/jpeg" : ""
    )
    const baseMime = mime.split(";")[0].trim().toLowerCase() || mime

    // ── Pre-fetch media buffer in renderer ──────────────────────────────────
    // Only needed for image / video / gif / audio — not for text statuses.
    // Try mediaUrl first (local file or CDN), fall back to thumbnailBase64.
    let mediaBuffer = null   // base64 string to send over IPC

    if (!isText) {
      if (story.mediaUrl) {
        setFetchingMedia(true)
        try {
          mediaBuffer = await fetchMediaAsBase64(story.mediaUrl)
        } catch (fetchErr) {
          console.warn("[ForwardStatusModal] mediaUrl fetch failed:", fetchErr.message)
        } finally {
          setFetchingMedia(false)
        }
      }
      // Fallback: thumbnail base64 (renderer already has this — no fetch needed)
      if (!mediaBuffer && story.thumbnailBase64) {
        const b64raw = story.thumbnailBase64
        mediaBuffer = b64raw.includes(",") ? b64raw.split(",")[1] : b64raw
      }
    }

    // ── Send to each recipient ───────────────────────────────────────────────
    await Promise.allSettled(
      targetJids.map(async jid => {
        try {
          const res = await window.api?.statusForward?.({
            targetJid: jid,
            entry: {
              sourceType:   story.sourceType,
              mimetype:     baseMime,
              caption:      msgCaption || story.text || null,
              // Pre-fetched buffer — main.js does Buffer.from(mediaBuffer, "base64")
              mediaBuffer:  mediaBuffer || null,
              // thumbnailBase64 kept as fallback inside main.js if mediaBuffer is null
              thumbnailBase64: (!mediaBuffer && story.thumbnailBase64) ? story.thumbnailBase64 : null,
            },
          })
          if (res?.ok === false) throw new Error(res.error || "Gagal")
          setSendStates(prev => ({ ...prev, [jid]: "sent" }))
        } catch (err) {
          console.error("[ForwardStatusModal] send failed for", jid, err.message)
          setSendStates(prev => ({ ...prev, [jid]: "failed" }))
        }
      })
    )

    setSending(false)
    setAllDone(true)
    setTimeout(onClose, 1500)
  }, [selected, story, caption, sending, allDone, onClose])

  // ── Derived stats ──────────────────────────────────────────────────────────
  const sentCount   = Object.values(sendStates).filter(v => v === "sent").length
  const failedCount = Object.values(sendStates).filter(v => v === "failed").length
  const fillPct     = (selected.size / MAX_SELECT) * 100
  const typeLabel   = { video:"Video", gif:"GIF", image:"Foto", audio:"Audio", text:"Teks" }[story?.sourceType] ?? "Media"

  const sendReady = selected.size > 0 && !sending && !fetchingMedia && !allDone

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        onClick={onClose}
        style={{
          position:"fixed", inset:0, zIndex:10100,
          background:"rgba(0,0,0,0.74)",
          backdropFilter:"blur(8px)",
          animation:"fwdBd 0.2s ease",
        }}
      />

      {/* ── Sheet ── */}
      <div style={{
        position:"fixed", zIndex:10101,
        bottom:0, left:"50%", transform:"translateX(-50%)",
        width:"min(490px, 100vw)",
        maxHeight:"91vh",
        background:"linear-gradient(180deg, #161c24 0%, #0d1117 100%)",
        border:"1px solid rgba(255,255,255,0.08)",
        borderBottom:"none",
        borderRadius:"22px 22px 0 0",
        boxShadow:"0 -16px 60px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.07)",
        display:"flex", flexDirection:"column",
        overflow:"hidden",
        animation:"fwdUp 0.3s cubic-bezier(.32,.72,0,1)",
      }}
      onClick={e => e.stopPropagation()}
      >
        <style>{`
          @keyframes fwdBd  { from { opacity:0 } to { opacity:1 } }
          @keyframes fwdUp  { from { transform:translateX(-50%) translateY(72px); opacity:0 } to { transform:translateX(-50%) translateY(0); opacity:1 } }
          @keyframes fwdPop { 0%{transform:scale(0.65);opacity:0} 70%{transform:scale(1.05)} 100%{transform:scale(1);opacity:1} }
          @keyframes fwdSpin { to { transform:rotate(360deg) } }
          @keyframes fwdFadeIn { from{opacity:0} to{opacity:1} }
          @keyframes fwdSkel { 0%,100%{opacity:.45} 50%{opacity:.2} }
          @keyframes fwdCheckBounce { 0%{transform:scale(.5);opacity:0} 65%{transform:scale(1.18)} 100%{transform:scale(1);opacity:1} }

          .fwd-row {
            display:flex; align-items:center; gap:12px;
            padding:9px 16px; cursor:pointer;
            border-radius:11px; margin:1px 8px;
            transition:background 0.1s;
          }
          .fwd-row:hover  { background:rgba(255,255,255,0.055) }
          .fwd-row:active { background:rgba(255,255,255,0.09) }

          .fwd-chip {
            background:rgba(37,211,102,0.13);
            border:1px solid rgba(37,211,102,0.28);
            border-radius:22px; padding:4px 7px 4px 5px;
            color:#25d366; white-space:nowrap;
            animation:fwdPop 0.2s cubic-bezier(.32,.72,0,1);
          }

          .fwd-skel {
            background:rgba(255,255,255,0.08);
            animation:fwdSkel 1.4s ease-in-out infinite;
          }

          .fwd-search::placeholder { color:rgba(255,255,255,0.28) }
          .fwd-search:focus { outline:none }
          .fwd-cap { font-family:inherit }
          .fwd-cap::placeholder { color:rgba(255,255,255,0.22) }
          .fwd-cap:focus { outline:none; border-color:rgba(37,211,102,0.38) !important }

          ::-webkit-scrollbar       { width:3px; height:3px }
          ::-webkit-scrollbar-track { background:transparent }
          ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:4px }
        `}</style>

        {/* ── Drag handle ── */}
        <div style={{ display:"flex", justifyContent:"center", padding:"11px 0 5px", flexShrink:0 }}>
          <div style={{ width:38, height:4, borderRadius:2, background:"rgba(255,255,255,0.13)" }} />
        </div>

        {/* ══ HEADER ══ */}
        <div style={{ padding:"4px 16px 12px", borderBottom:"1px solid rgba(255,255,255,0.07)", flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <StatusPreview story={story} />

            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:15.5, fontWeight:700, color:"#fff", marginBottom:3 }}>
                Teruskan {typeLabel}
              </div>
              <div style={{ fontSize:12, color:"rgba(255,255,255,0.42)", display:"flex", alignItems:"center", gap:5, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="12" cy="8" r="4"/>
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                </svg>
                {senderName || "Kontak"}
              </div>
            </div>

            <button
              onClick={onClose}
              style={{
                background:"rgba(255,255,255,0.07)", border:"none", borderRadius:"50%",
                width:32, height:32, cursor:"pointer", flexShrink:0,
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"background 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.14)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.07)"}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* ══ SELECTED RECIPIENTS STRIP ══ */}
        {selectedItems.length > 0 && (
          <div style={{ flexShrink:0, borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
            {/* Counter + fill bar */}
            <div style={{ padding:"7px 16px 3px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ fontSize:11, fontWeight:600, color: fillPct >= 90 ? "#f87171" : "rgba(255,255,255,0.35)" }}>
                {selected.size} / {MAX_SELECT} dipilih
              </span>
              <div style={{ width:60, height:3, borderRadius:2, background:"rgba(255,255,255,0.09)", overflow:"hidden" }}>
                <div style={{
                  height:"100%", borderRadius:2,
                  width:`${fillPct}%`,
                  background: fillPct >= 90 ? "#f87171" : "#25d366",
                  transition:"width 0.22s ease, background 0.3s ease",
                }} />
              </div>
            </div>
            {/* Chips */}
            <div
              ref={chipRowRef}
              style={{ display:"flex", gap:6, padding:"3px 16px 10px", overflowX:"auto", flexWrap:"nowrap" }}
            >
              {selectedItems.map(c => (
                <RecipientChip key={c.jid} jid={c.jid} name={c.name} onRemove={toggle} />
              ))}
            </div>
          </div>
        )}

        {/* ══ SEARCH BAR ══ */}
        <div style={{ padding:"10px 16px 6px", flexShrink:0 }}>
          <div style={{
            display:"flex", alignItems:"center", gap:8,
            background:"rgba(255,255,255,0.055)",
            border:"1px solid rgba(255,255,255,0.09)",
            borderRadius:13, padding:"8px 12px",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2.2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              ref={inputRef}
              className="fwd-search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Cari nama atau nomor…"
              style={{ flex:1, background:"none", border:"none", color:"#fff", fontSize:13.5, caretColor:"#25d366" }}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                style={{ background:"none", border:"none", cursor:"pointer", padding:0, display:"flex", opacity:0.45, transition:"opacity 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0.45}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* ══ TABS (hidden during search) ══ */}
        {!query && (
          <div style={{
            display:"flex", padding:"0 12px",
            borderBottom:"1px solid rgba(255,255,255,0.07)",
            flexShrink:0,
          }}>
            <TabBtn label="Semua"   active={tab === "all"}      onClick={() => setTab("all")} />
            <TabBtn label="Kontak"  active={tab === "contacts"} onClick={() => setTab("contacts")} />
            <TabBtn label="Grup"    active={tab === "groups"}   onClick={() => setTab("groups")} />
          </div>
        )}

        {/* Search result label */}
        {query && searchResults !== null && (
          <div style={{ padding:"5px 20px 2px", fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.28)", textTransform:"uppercase", letterSpacing:"0.07em", flexShrink:0 }}>
            {searchResults.length === 0 ? "Tidak ditemukan" : `${searchResults.length} hasil`}
          </div>
        )}

        {/* ══ LIST ══ */}
        <div style={{ flex:1, overflowY:"auto", padding:"4px 0 4px" }}>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
          ) : displayList.length === 0 ? (
            <div style={{ textAlign:"center", padding:"40px 20px", color:"rgba(255,255,255,0.22)" }}>
              <div style={{ fontSize:34, marginBottom:10, opacity:0.5 }}>
                {query ? "🔍" : tab === "groups" ? "👥" : "👤"}
              </div>
              <div style={{ fontSize:13 }}>
                {query
                  ? `Tidak ada hasil untuk "${query}"`
                  : tab === "groups" ? "Tidak ada grup" : "Belum ada kontak"}
              </div>
            </div>
          ) : (
            displayList.map(chat => {
              const jid = normalizeJid(chat.jid)
              return (
                <ContactRow
                  key={jid}
                  chat={chat}
                  isChecked={selected.has(jid)}
                  onToggle={toggle}
                  sendState={sendStates[jid] ?? null}
                />
              )
            })
          )}
        </div>

        {/* ══ CAPTION — always visible when recipients selected & not done ══ */}
        {selected.size > 0 && !allDone && (
          <div style={{
            flexShrink:0,
            borderTop:"1px solid rgba(255,255,255,0.07)",
            padding:"10px 16px 8px",
          }}>
            <div style={{ position:"relative" }}>
              <textarea
                className="fwd-cap"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                onKeyDown={e => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSend()
                }}
                placeholder="Tambahkan pesan… (opsional)"
                rows={2}
                style={{
                  width:"100%",
                  background:"rgba(255,255,255,0.05)",
                  border:"1px solid rgba(255,255,255,0.09)",
                  borderRadius:11, color:"#fff", fontSize:13,
                  padding:"9px 36px 9px 12px",
                  resize:"none", lineHeight:1.55,
                  boxSizing:"border-box", caretColor:"#25d366",
                  transition:"border-color 0.15s",
                }}
              />
              {caption && (
                <button
                  onClick={() => setCaption("")}
                  style={{ position:"absolute", right:10, top:10, background:"none", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.3)", padding:2, lineHeight:1 }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.18)", marginTop:4, textAlign:"right" }}>
              Ctrl+Enter untuk kirim
            </div>
          </div>
        )}

        {/* ══ SEND SUCCESS SUMMARY ══ */}
        {allDone && (
          <div style={{
            flexShrink:0, padding:"12px 20px",
            borderTop:"1px solid rgba(255,255,255,0.07)",
            display:"flex", alignItems:"center", gap:10,
            animation:"fwdFadeIn 0.22s ease",
          }}>
            <div style={{
              width:30, height:30, borderRadius:"50%",
              background:"rgba(37,211,102,0.15)",
              display:"flex", alignItems:"center", justifyContent:"center",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#25d366" strokeWidth="2.5" strokeLinecap="round"
                style={{ animation:"fwdCheckBounce 0.35s ease" }}>
                <polyline points="20,6 9,17 4,12"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color:"#fff" }}>
                {sentCount > 0 ? `Terkirim ke ${sentCount} tujuan` : "Selesai"}
              </div>
              {failedCount > 0 && (
                <div style={{ fontSize:11, color:"#f87171", marginTop:1 }}>{failedCount} gagal</div>
              )}
            </div>
          </div>
        )}

        {/* ══ FOOTER ══ */}
        <div style={{
          flexShrink:0,
          padding:"10px 16px 20px",
          borderTop: (selected.size === 0 || allDone) ? "1px solid rgba(255,255,255,0.07)" : "none",
          display:"flex", alignItems:"center", gap:10,
        }}>
          {/* Hint */}
          <div style={{ flex:1, fontSize:12, color:"rgba(255,255,255,0.24)", fontWeight:500 }}>
            {allDone ? "" : selected.size === 0
              ? "Pilih tujuan (maks. 10)"
              : selected.size === MAX_SELECT
              ? <span style={{ color:"#f87171" }}>Maks. {MAX_SELECT} terpilih</span>
              : `${MAX_SELECT - selected.size} slot tersisa`
            }
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!sendReady}
            style={{
              background: allDone
                ? "rgba(37,211,102,0.12)"
                : sendReady
                ? "linear-gradient(135deg, #25d366 0%, #128c4a 100%)"
                : (sending || fetchingMedia)
                ? "rgba(37,211,102,0.55)"
                : "rgba(255,255,255,0.06)",
              border: allDone ? "1px solid rgba(37,211,102,0.3)" : "none",
              borderRadius:14, padding:"11px 26px",
              color: selected.size === 0 && !allDone ? "rgba(255,255,255,0.2)" : "#fff",
              fontSize:14, fontWeight:700,
              cursor: sendReady ? "pointer" : "not-allowed",
              display:"flex", alignItems:"center", gap:8,
              transition:"all 0.22s cubic-bezier(.34,1.56,.64,1)",
              boxShadow: sendReady ? "0 4px 20px rgba(37,211,102,0.32)" : "none",
              transform: sendReady ? "scale(1.02)" : "scale(0.97)",
              minWidth:108, justifyContent:"center",
            }}
          >
            {allDone ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#25d366" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20,6 9,17 4,12"/>
                </svg>
                <span style={{ color:"#4ade80" }}>Terkirim</span>
              </>
            ) : fetchingMedia ? (
              <>
                <div style={{ width:14, height:14, borderRadius:"50%", border:"2px solid rgba(255,255,255,0.3)", borderTopColor:"#fff", animation:"fwdSpin 0.6s linear infinite" }} />
                Memuat…
              </>
            ) : sending ? (
              <>
                <div style={{ width:14, height:14, borderRadius:"50%", border:"2px solid rgba(255,255,255,0.3)", borderTopColor:"#fff", animation:"fwdSpin 0.6s linear infinite" }} />
                Mengirim…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
                Kirim{selected.size > 1 ? ` (${selected.size})` : ""}
              </>
            )}
          </button>
        </div>

      </div>
    </>
  )
}