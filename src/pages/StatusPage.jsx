// src/pages/StatusPage.jsx
// ══════════════════════════════════════════════════════════════
// WhatsApp Stories viewer — Aurora WaPlus
//
// Improvements in this version:
//  ① fromMe detection: own JID matched via auth store so own
//    stories render as "My Status" card (not as another contact)
//  ② "My Status" card shows + button with dropdown (Photos & videos / Text)
//    Clicking card (not +) opens story viewer for own stories
//  ③ Upload tab removed — triggered via dropdown on My Status card
// ══════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from "react"
import { useChatStore } from "../store/chat"
import { useAuthStore } from "../store/auth"

// [FIX-LOCAL-MEDIA] Convert local file:// or absolute paths to media:// protocol
// so Electron webSecurity:true doesn't block them. CDN URLs pass through unchanged.
function safeMediaUrl(url) {
  if (!url) return url
  if (url.startsWith("https://") || url.startsWith("http://") || url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("media://")) return url
  // Convert file:// → media://
  if (url.startsWith("file://")) {
    let stripped = url.replace(/^file:\/\/\/?/, "")
    if (stripped.includes("%3A") || stripped.includes("%3a")) {
      try { stripped = decodeURIComponent(stripped) } catch (_) {}
    }
    return safeMediaUrl(stripped)
  }
  let p = url.replace(/\\/g, "/")
  const winDrive = /^([A-Za-z]):\//
  if (winDrive.test(p)) return `media:///${p.replace(winDrive, (_, l) => `${l.toUpperCase()}:/`)}`
  return `media://${p.startsWith("/") ? p : `/${p}`}`
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeJid(jid = "") {
  if (!jid) return ""
  const at = jid.lastIndexOf("@")
  if (at === -1) return jid
  let user = jid.slice(0, at), server = jid.slice(at + 1)
  user = user.split(":")[0]
  if (server === "c.us") server = "s.whatsapp.net"
  return `${user}@${server}`
}
function jidToPhone(jid = "") { return jid.split("@")[0] || jid }

function formatTime(ts) {
  if (!ts) return ""
  const d = new Date(ts * 1000)
  const now = new Date()
  const diffH = (now - d) / 3600000
  if (diffH < 1) return `${Math.max(1, Math.floor(diffH * 60))}m ago`
  if (diffH < 24) return `${Math.floor(diffH)}h ago`
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

const SEED_COLORS = ["#1a5c3e","#1565c0","#6a1b9a","#b71c1c","#e65100","#2e7d32","#00695c","#4527a0","#00838f","#ad1457"]
function seedColor(s) {
  if (!s) return SEED_COLORS[0]
  let h = 0; for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return SEED_COLORS[Math.abs(h) % SEED_COLORS.length]
}
function initials(name) {
  if (!name) return "?"
  const stripped = name.replace(/[\s\-+().]/g, "")
  if (/^\d{6,}$/.test(stripped)) return stripped.slice(-2)
  const words = name.trim().split(/\s+/)
  return words.length === 1 ? words[0].slice(0, 2).toUpperCase() : (words[0][0] + words[1][0]).toUpperCase()
}

// ── Avatar ────────────────────────────────────────────────────────────────────
const _picCache = new Map()
const _picPending = new Set()

function Avatar({ jid, name, size = 42, unseen = false, ring = true }) {
  const [url, setUrl] = useState(() => _picCache.has(jid) ? _picCache.get(jid) : null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    if (!jid || _picCache.has(jid) || _picPending.has(jid)) return
    _picPending.add(jid)
    window.api?.getProfilePic?.({ jid })
      .then(r => { const u = r?.url || null; _picCache.set(jid, u); setUrl(u) })
      .catch(() => { _picCache.set(jid, null) })
      .finally(() => _picPending.delete(jid))
  }, [jid])

  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: url && !err ? "transparent" : seedColor(jid),
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.round(size * 0.36), fontWeight: 700, color: "#fff",
      overflow: "hidden", userSelect: "none",
      outline: ring ? (unseen ? "2.5px solid #25d366" : "2px solid #374151") : "none",
      outlineOffset: ring ? 2 : 0,
      boxShadow: unseen ? "0 0 0 4px #0a1929, 0 0 0 6px #25d36640" : "none",
      transition: "box-shadow 0.3s",
    }}>
      {url && !err
        ? <img src={url} alt={name} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : initials(name)
      }
    </div>
  )
}

// ── Icon button helper ────────────────────────────────────────────────────────
function IconBtn({ onClick, title, children }) {
  const [hov, setHov] = useState(false)
  return (
    <button onClick={onClick} title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? "rgba(37,211,102,0.15)" : "rgba(37,211,102,0.07)",
        border: "1px solid rgba(37,211,102,0.25)",
        borderRadius: 10, color: "#25d366",
        width: 36, height: 36, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.15s, transform 0.12s",
        transform: hov ? "scale(1.1)" : "scale(1)",
        flexShrink: 0,
      }}>
      {children}
    </button>
  )
}

// ── Vertical scrollable grid — 7 columns, auto rows ──────────────────────────
// Cards fill left-to-right then wrap downward. Page scrolls vertically with
// the main container. No arrows needed — just scroll up/down.
function CardGrid({ cards }) {
  return (
    <div className="status-grid">
      {cards}
    </div>
  )
}

// ── Story thumbnail card ──────────────────────────────────────────────────────
function StoryCard({ senderJid, entries, contactName, onClick }) {
  const latest = entries[entries.length - 1]
  const unseenCount = entries.filter(e => !e.seen).length
  const hasMedia = !!latest?.mediaUrl
  const isText = latest?.sourceType === "text"

  return (
    <div onClick={onClick} style={{
      width: "100%", aspectRatio: "9/16", borderRadius: 14, overflow: "hidden",
      cursor: "pointer", position: "relative", background: "#0f1923",
      border: "1px solid rgba(255,255,255,0.07)",
      transition: "transform 0.18s ease, box-shadow 0.18s ease",
      boxShadow: "0 4px 16px #0005",
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px) scale(1.02)"; e.currentTarget.style.boxShadow = "0 12px 32px #0008" }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 4px 16px #0005" }}
    >
      {hasMedia && (latest.sourceType === "video" || latest.sourceType === "gif") ? (
        <video src={safeMediaUrl(latest.mediaUrl)} autoPlay muted loop playsInline
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : hasMedia ? (
        <img src={safeMediaUrl(latest.mediaUrl)} alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : isText ? (
        <div style={{
          position: "absolute", inset: 0,
          background: latest.backgroundColor || "#1a7a3c",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 12,
        }}>
          <p style={{ color: "#fff", fontSize: 13, textAlign: "center", fontFamily: "Georgia,serif",
            lineHeight: 1.5, wordBreak: "break-word", margin: 0,
            overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical" }}>
            {latest.text || ""}
          </p>
        </div>
      ) : (
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg,#1a2d1e,#0f1923)",
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 32, opacity: 0.5 }}>📷</span>
        </div>
      )}

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "58%",
        background: "linear-gradient(to top,#000000e0,transparent)" }} />

      {unseenCount > 0 && (
        <div style={{ position: "absolute", top: 8, right: 8,
          background: "#25d366", color: "#000", borderRadius: 10,
          padding: "1px 6px", fontSize: 11, fontWeight: 800, lineHeight: 1.6 }}>
          {unseenCount}
        </div>
      )}

      {entries.length > 1 && (
        <div style={{ position: "absolute", top: 8, left: 8, right: unseenCount > 0 ? 32 : 8, display: "flex", gap: 3 }}>
          {entries.map((e, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2,
              background: e.seen ? "#ffffff55" : "#25d366" }} />
          ))}
        </div>
      )}

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
        padding: "8px 10px 10px", display: "flex", alignItems: "center", gap: 7 }}>
        <Avatar jid={senderJid} name={contactName} size={30} unseen={unseenCount > 0} />
        <div style={{ overflow: "hidden" }}>
          <p style={{ color: "#fff", fontSize: 11, fontWeight: 600, margin: 0,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {contactName}
          </p>
          <p style={{ color: "#aaa", fontSize: 10, margin: 0 }}>
            {formatTime(latest.timestamp)}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Story Viewer Modal ────────────────────────────────────────────────────────
function StoryViewer({ senderJid, entries, contactName, onClose, onSeen }) {
  const [idx, setIdx] = useState(() => {
    const first = entries.findIndex(e => !e.seen)
    return first === -1 ? 0 : first
  })
  const [progress, setProgress] = useState(0)
  const timerRef = useRef(null)
  const DURATION = 5000
  const entry = entries[idx]

  const goNext = useCallback(() => {
    setProgress(0)
    if (idx < entries.length - 1) setIdx(i => i + 1)
    else onClose()
  }, [idx, entries.length, onClose])

  const goPrev = useCallback(() => {
    setProgress(0)
    if (idx > 0) setIdx(i => i - 1)
  }, [idx])

  useEffect(() => {
    if (entry && !entry.seen) onSeen(senderJid, entry.id)
  }, [entry?.id])

  useEffect(() => {
    setProgress(0)
    const start = Date.now()
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - start
      const pct = Math.min(100, (elapsed / DURATION) * 100)
      setProgress(pct)
      if (elapsed >= DURATION) { clearInterval(timerRef.current); goNext() }
    }, 50)
    return () => clearInterval(timerRef.current)
  }, [idx])

  if (!entry) return null

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000ee",
      zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div onClick={e => e.stopPropagation()} style={{
        width: 380, height: 680, borderRadius: 20, overflow: "hidden",
        position: "relative", background: "#111", boxShadow: "0 24px 80px #000a",
      }}>
        <div style={{ position: "absolute", top: 12, left: 12, right: 12,
          display: "flex", gap: 4, zIndex: 10 }}>
          {entries.map((e, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: "#ffffff22", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 2, background: "#fff",
                width: i < idx ? "100%" : i === idx ? `${progress}%` : "0%" }} />
            </div>
          ))}
        </div>

        <div style={{ position: "absolute", top: 24, left: 12, right: 12,
          display: "flex", alignItems: "center", gap: 10, zIndex: 10 }}>
          <Avatar jid={senderJid} name={contactName} size={38} ring={false} />
          <div>
            <p style={{ color: "#fff", fontSize: 14, fontWeight: 700, margin: 0 }}>{contactName}</p>
            <p style={{ color: "#ffffffaa", fontSize: 11, margin: 0 }}>{formatTime(entry.timestamp)}</p>
          </div>
          <button onClick={onClose} style={{ marginLeft: "auto",
            background: "none", border: "none", color: "#fff", fontSize: 24, cursor: "pointer", padding: "4px 8px" }}>
            ×
          </button>
        </div>

        {entry.sourceType === "video" || entry.sourceType === "gif" ? (
          <video key={entry.id} src={safeMediaUrl(entry.mediaUrl)} autoPlay muted loop playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : entry.sourceType === "image" ? (
          <img key={entry.id} src={safeMediaUrl(entry.mediaUrl)} alt=""
            style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }} />
        ) : entry.sourceType === "text" ? (
          <div style={{ width: "100%", height: "100%", background: entry.backgroundColor || "#1a7a3c",
            display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 24px" }}>
            <p style={{ color: "#fff", fontSize: 22, textAlign: "center",
              fontFamily: "Georgia,serif", lineHeight: 1.6, margin: 0 }}>
              {entry.text}
            </p>
          </div>
        ) : (
          <div style={{ width: "100%", height: "100%", background: "#1a2332",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#666", fontSize: 14 }}>Media tidak tersedia</span>
          </div>
        )}

        {entry.caption && (
          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0,
            padding: "40px 16px 20px", background: "linear-gradient(to top,#000000cc,transparent)" }}>
            <p style={{ color: "#fff", margin: 0, fontSize: 14, lineHeight: 1.5 }}>{entry.caption}</p>
          </div>
        )}

        {entry.sourceType && (
          <div style={{ position: "absolute", bottom: 60, right: 14,
            background: "#ffffff18", color: "#fff", borderRadius: 8, padding: "3px 8px",
            fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1,
            backdropFilter: "blur(4px)" }}>
            {entry.sourceType}
          </div>
        )}

        <div style={{ position: "absolute", inset: 0, top: 80, display: "flex", zIndex: 5 }}>
          <div style={{ flex: 1, cursor: "pointer" }} onClick={goPrev} />
          <div style={{ flex: 1, cursor: "pointer" }} onClick={goNext} />
        </div>
      </div>

      {idx > 0 && (
        <button onClick={e => { e.stopPropagation(); goPrev() }} style={arrowStyle("left")}>‹</button>
      )}
      {idx < entries.length - 1 && (
        <button onClick={e => { e.stopPropagation(); goNext() }} style={arrowStyle("right")}>›</button>
      )}
    </div>
  )
}

function arrowStyle(side) {
  return {
    position: "absolute", [side]: 24, top: "50%", transform: "translateY(-50%)",
    background: "#ffffff18", border: "none", color: "#fff", fontSize: 32,
    width: 44, height: 44, borderRadius: "50%", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    backdropFilter: "blur(4px)", zIndex: 10000,
  }
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function StatusView({ onOpenUploader }) {
  const [storyMap, setStoryMap] = useState({})
  const [contactNames, setContactNames] = useState({})
  const [viewer, setViewer] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  const { contacts, chats } = useChatStore()
  const { connectedUser } = useAuthStore()

  // ── Own JID — single source of truth from the backend ────────────────────
  // The backend (status:get-all response + connection:open event) is the ONLY
  // reliable source. connectedUser.jid is set once on connection:open and is
  // the normalized sock.user.id. We also accept it from status:get-all.
  // We never guess from entry.fromMe because entries loaded from DB may not
  // have that field on old rows.
  const [apiMyJid, setApiMyJid] = useState(null)
  const myJid = apiMyJid
    || (connectedUser?.jid ? normalizeJid(connectedUser.jid) : null)
    || null
  const myName = connectedUser?.name || "Me"

  // ── Resolve best display name ─────────────────────────────────────────────
  const resolveName = useCallback((jid, entries = []) => {
    // Own JID → always "My Status"
    if (myJid && normalizeJid(jid) === myJid) return "My Status"

    const nJid = normalizeJid(jid)
    if (contactNames[nJid]) return contactNames[nJid]
    const ct = contacts?.find(c => normalizeJid(c.jid || "") === nJid)
    if (ct?.name || ct?.push_name) return ct.name || ct.push_name
    const ch = chats?.find(c => normalizeJid(c.jid || "") === nJid)
    if (ch?.name) return ch.name
    for (const e of entries) {
      const n = e.senderName || e.pushname
      if (n && n !== jidToPhone(jid)) return n
    }
    return jidToPhone(jid)
  }, [contactNames, contacts, chats, myJid])

  // ── Load contact names ────────────────────────────────────────────────────
  const loadContactNames = useCallback(async () => {
    try {
      const res = await window.api?.contactsList?.({ limit: 5000, offset: 0 })
        ?? await window.api?.invoke?.("db:contacts:list", { limit: 5000, offset: 0 })
      if (res?.ok && Array.isArray(res.data)) {
        const map = {}
        for (const c of res.data) {
          const jid = normalizeJid(c.jid || c.id || "")
          if (jid) map[jid] = c.name || c.push_name || c.pushname || null
        }
        setContactNames(map)
      }
    } catch (_) {}
  }, [])

  // ── Load all statuses ─────────────────────────────────────────────────────
  const loadStatuses = useCallback(async () => {
    try {
      const res = await window.api?.statusGetAll?.()
        ?? await window.api?.invoke?.("status:get-all")
      if (res?.ok && res.data && typeof res.data === "object") {
        // Capture myJid from the API response — this is the most reliable source
        // because it comes directly from sock.user.id inside the Baileys process
        if (res.myJid) setApiMyJid(normalizeJid(res.myJid))

        const next = {}
        for (const [jid, entries] of Object.entries(res.data)) {
          if (!Array.isArray(entries) || entries.length === 0) continue
          const nJid = normalizeJid(jid)
          next[nJid] = [...entries].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
        }
        setStoryMap(next)
        setLastUpdated(Date.now())
      }
    } catch (_) {}
    setLoading(false)
  }, [])

  useEffect(() => {
    loadContactNames()
    loadStatuses()
  }, [])

  // ── Live: status:new ──────────────────────────────────────────────────────
  useEffect(() => {
    const process = (data) => {
      if (!data?.senderJid || !data?.entry) return
      const jid = normalizeJid(data.senderJid)
      const entry = { ...data.entry, senderName: data.senderName || data.entry?.senderName }
      // If the backend sends fromMe on a live entry, capture jid as myJid
      if (entry.fromMe && !apiMyJid) setApiMyJid(jid)
      setStoryMap(prev => {
        const existing = prev[jid] || []
        if (existing.find(e => e.id === entry.id)) return prev
        const sorted = [...existing, entry].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
        return { ...prev, [jid]: sorted }
      })
      setLastUpdated(Date.now())
    }

    const handler = (evtOrPayload, maybePayload) => {
      const data = maybePayload ?? evtOrPayload
      process(data)
    }

    const ceHandler = (e) => process(e.detail)
    window.addEventListener("aurora:status:new", ceHandler)

    const ipcR = window.electron?.ipcRenderer ?? window.ipcRenderer
    if (ipcR?.on) ipcR.on("status:new", handler)
    if (window.api?.onStatusNew) window.api.onStatusNew(handler)

    return () => {
      window.removeEventListener("aurora:status:new", ceHandler)
      ipcR?.removeListener?.("status:new", handler)
      window.api?.removeStatusNew?.(handler)
    }
  }, [loadStatuses])

  useEffect(() => {
    const handler = () => loadContactNames()
    window.api?.onContactsUpdated?.(handler)
    return () => window.api?.removeContactsUpdated?.(handler)
  }, [loadContactNames])

  // ── Mark seen ─────────────────────────────────────────────────────────────
  const handleMarkSeen = useCallback(async (senderJid, statusId) => {
    const jid = normalizeJid(senderJid)
    setStoryMap(prev => ({
      ...prev,
      [jid]: (prev[jid] || []).map(e => e.id === statusId ? { ...e, seen: true } : e),
    }))
    try {
      await window.api?.statusMarkSeen?.({ senderJid: jid, statusId })
        ?? await window.api?.invoke?.("status:mark-seen", { senderJid: jid, statusId })
    } catch (_) {}
  }, [])

  // ── Separate own stories from contacts ────────────────────────────────────
  // Own JID should NOT appear in the contact list — it shows as "My Status" card
  const ownEntries = myJid ? (storyMap[myJid] || []) : []

  const contactJids = Object.keys(storyMap).filter(jid => !myJid || jid !== myJid)

  const sortedJids = contactJids.sort((a, b) => {
    const aU = storyMap[a]?.some(e => !e.seen)
    const bU = storyMap[b]?.some(e => !e.seen)
    if (aU !== bU) return bU ? 1 : -1
    const aT = Math.max(...(storyMap[a] || []).map(e => e.timestamp || 0))
    const bT = Math.max(...(storyMap[b] || []).map(e => e.timestamp || 0))
    return bT - aT
  })

  const unseenJids = sortedJids.filter(j => storyMap[j]?.some(e => !e.seen))
  const seenJids   = sortedJids.filter(j => !storyMap[j]?.some(e => !e.seen))

  const viewerEntries = viewer ? storyMap[viewer] : null

  return (
    <div style={{ height: "100%", overflowY: "auto",
      background: "var(--bg-1)", color: "var(--text-1)",
      fontFamily: "var(--font-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)" }}>
      <style>{`
        .status-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; }
        @media (max-width: 900px)  { .status-grid { grid-template-columns: repeat(5, 1fr); } }
        @media (max-width: 640px)  { .status-grid { grid-template-columns: repeat(4, 1fr); } }
        @media (max-width: 420px)  { .status-grid { grid-template-columns: repeat(3, 1fr); } }
      `}</style>

      {/* Header */}
      <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--border)",
        position: "sticky", top: 0, background: "var(--bg-1)", zIndex: 10,
        display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>Status Stories</div>
          {sortedJids.length > 0 && (
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
              {sortedJids.length} kontak · {lastUpdated ? formatTime(Math.floor(lastUpdated / 1000)) : ""}
            </div>
          )}
        </div>

        {/* Photo/video icon */}
        <IconBtn onClick={() => onOpenUploader("media")} title="Add photo or video status">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </IconBtn>

        {/* Pencil / text icon */}
        <IconBtn onClick={() => onOpenUploader("text")} title="Add text status">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </IconBtn>

        <button onClick={() => { setLoading(true); loadStatuses() }}
          style={{ background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.2)",
            borderRadius: 8, color: "var(--green)", padding: "5px 12px",
            fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-3.08"/>
          </svg>
          Refresh
        </button>
      </div>

      <div style={{ padding: "16px 18px 40px" }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 60, gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%",
              border: "3px solid var(--bg-3)", borderTop: "3px solid var(--green)",
              animation: "spin 0.8s linear infinite" }} />
            <span style={{ fontSize: 13, color: "var(--text-3)" }}>Memuat status…</span>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : (
          <>
            {/* ── My Status row ── */}
            <section style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
                  color: "var(--green)", textTransform: "uppercase", flex: 1 }}>
                  My Status
                  {ownEntries.length > 0 && (
                    <span style={{ marginLeft: 8, background: "#25d36622", color: "#25d366",
                      borderRadius: 8, padding: "1px 7px", fontSize: 10, fontWeight: 800 }}>
                      {ownEntries.length}
                    </span>
                  )}
                </div>
                {/* Click card to view own stories */}
                {ownEntries.length > 0 && (
                  <button onClick={() => setViewer(myJid)}
                    style={{ background: "none", border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 8, color: "var(--text-2)", padding: "4px 10px",
                      fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                    View mine
                  </button>
                )}
              </div>

              {/* Own story card — shown in grid with other cards */}
              {ownEntries.length > 0 ? (
                <div className="status-grid">
                  <StoryCard key={myJid} senderJid={myJid} entries={ownEntries}
                    contactName="My Status"
                    onClick={() => setViewer(myJid)} />
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 16px", borderRadius: 12,
                  background: "rgba(37,211,102,0.05)", border: "1px dashed rgba(37,211,102,0.2)" }}>
                  <span style={{ fontSize: 22 }}>📸</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>No status yet</div>
                    <div style={{ fontSize: 11, color: "var(--text-3)" }}>Use the 🖼️ or ✏️ buttons above to share one</div>
                  </div>
                </div>
              )}
            </section>

            {sortedJids.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
                paddingTop: 30, gap: 10, color: "var(--text-3)" }}>
                <span style={{ fontSize: 44 }}>👁</span>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-2)" }}>Belum ada status kontak</div>
                <div style={{ fontSize: 12, textAlign: "center", maxWidth: 280, lineHeight: 1.7 }}>
                  Status foto, video, dan teks dari kontak akan muncul di sini secara otomatis.
                </div>
              </div>
            ) : (
              <>
                {unseenJids.length > 0 && (
                  <section style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
                      color: "var(--green)", textTransform: "uppercase", marginBottom: 12 }}>
                      Terbaru · {unseenJids.length}
                    </div>
                    <CardGrid cards={unseenJids.map(jid => (
                      <StoryCard key={jid} senderJid={jid} entries={storyMap[jid]}
                        contactName={resolveName(jid, storyMap[jid])}
                        onClick={() => setViewer(jid)} />
                    ))} />
                  </section>
                )}

                {seenJids.length > 0 && (
                  <section>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
                      color: "var(--text-3)", textTransform: "uppercase", marginBottom: 12 }}>
                      Sudah dilihat · {seenJids.length}
                    </div>
                    <CardGrid cards={seenJids.map(jid => (
                      <StoryCard key={jid} senderJid={jid} entries={storyMap[jid]}
                        contactName={resolveName(jid, storyMap[jid])}
                        onClick={() => setViewer(jid)} />
                    ))} />
                  </section>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Story viewer modal */}
      {viewer && viewerEntries && (
        <StoryViewer
          senderJid={viewer}
          entries={viewerEntries}
          contactName={resolveName(viewer, viewerEntries)}
          onClose={() => setViewer(null)}
          onSeen={handleMarkSeen}
        />
      )}
    </div>
  )
}