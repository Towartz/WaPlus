// src/components/StatusView.jsx
// Instagram-style Status/Story UI — full redesign with:
// [INSTA] Instagram-style fullscreen viewer with arrow navigation
// [RESUME] Continue from last seen story per contact
// [REPLY] Reply to status per contact
// [VIDEO] Enhanced video playback with controls
import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { normalizeJid, isJidGroup, isJidNewsletter, isJidLid, jidUser, areJidsSameUser } from "../utils/jidUtils"
import { useChatStore } from "../store/chat"
import { useAppStore } from "../store/app"
import ForwardStatusModal from "./ForwardStatusModal"
import { pathToFileUrl } from "./bubble/utils"

// [FIX-LOCAL-MEDIA] Convert any local file:// or absolute path in a status entry's
// mediaUrl to the hardened media:// protocol so Electron webSecurity:true doesn't
// block it. CDN https:// URLs and data: URLs are passed through unchanged.
// [FIX-PROTOCOL] file:///home/... must become media:///home/... (3 slashes, not 2).
// pathToFileUrl has an off-by-one on the slash stripping so we handle file:// here directly.
function safeMediaUrl(url) {
  if (!url) return url
  // Already safe protocols — pass through unchanged
  if (url.startsWith("https://") || url.startsWith("http://") || url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("media://")) return url
  // file:///absolute/path → media:///absolute/path  (keep exactly 3 slashes for Unix absolute)
  if (url.startsWith("file://")) {
    // Strip file:// (2 slashes only) — leaves /absolute/path with its leading slash
    const withoutProto = url.slice("file://".length)
    // withoutProto is now /home/... (Unix) or /C:/... (Windows file:///C:/...)
    // Normalize: ensure single leading slash
    const clean = withoutProto.startsWith("/") ? withoutProto : "/" + withoutProto
    return "media://" + clean  // media:// + /home/... = media:///home/...
  }
  // Absolute Unix path /home/...
  if (url.startsWith("/")) return "media://" + url  // media:///home/...
  // Fallback
  return pathToFileUrl(url)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
// [JID-UTILS] normalizeJid imported from shared jidUtils module

function tsToMs(ts) {
  if (!ts) return 0
  const n = typeof ts === "object" && ts.toNumber ? ts.toNumber() : Number(ts)
  return n < 1e12 ? n * 1000 : n
}
function timeAgo(ts) {
  const diff = Date.now() - tsToMs(ts)
  const m = Math.floor(diff / 60000)
  if (m < 1) return "Baru saja"
  if (m < 60) return `${m} menit lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  return `${Math.floor(h / 24)} hari lalu`
}
const AVATAR_COLORS = ["#1a5c3e","#1565c0","#6a1b9a","#b71c1c","#e65100","#2e7d32","#00695c","#4527a0","#00838f","#ad1457"]
function seedColor(s) {
  if (!s) return AVATAR_COLORS[0]
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function initials(name) {
  if (!name) return "?"
  const stripped = name.replace(/[\s\-+().]/g, "")
  if (/^\d{6,}$/.test(stripped)) return stripped.slice(-2)
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

// [FIX-STATUS-BG] WhatsApp sends backgroundColor as a 32-bit ARGB integer.
// 0x00000000 (=0) means "no color set" — DO NOT render as black.
// Valid colors have alpha > 0, e.g. 0xFF1DA462 (green), 0xFF6B2FA0 (purple).
// This helper converts ARGB → CSS hex or returns null for "no color".
function parseWaBgColor(rawColor) {
  if (rawColor == null || rawColor === 0) return null
  // Handle string hex like "#1DA462" passed directly
  if (typeof rawColor === "string") {
    const s = rawColor.trim()
    if (s.startsWith("#")) return s.length === 7 ? s : null
    // Numeric string
    const n = parseInt(s, 10)
    if (isNaN(n) || n === 0) return null
    rawColor = n
  }
  // 32-bit ARGB — mask to RGB (drop alpha byte)
  const argb = rawColor >>> 0  // unsigned
  const alpha = (argb >>> 24) & 0xFF
  if (alpha === 0) return null  // fully transparent = no color
  const r = (argb >>> 16) & 0xFF
  const g = (argb >>> 8)  & 0xFF
  const b = argb & 0xFF
  return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`
}

// WA text status gradient palettes — used when no explicit backgroundColor set
const TEXT_STATUS_GRADIENTS = [
  "linear-gradient(135deg,#1DA462,#0E6B45)",
  "linear-gradient(135deg,#0078D4,#004A8F)",
  "linear-gradient(135deg,#6B2FA0,#3D1460)",
  "linear-gradient(135deg,#C62828,#7B1717)",
  "linear-gradient(135deg,#E65100,#8D3200)",
  "linear-gradient(135deg,#00695C,#003D35)",
  "linear-gradient(135deg,#283593,#0D1A5E)",
]
function getTextStatusBg(story, fallbackSeed) {
  const color = parseWaBgColor(story?.backgroundColor)
  if (color) return color
  // Derive a consistent gradient from story ID for visual variety
  const seed = story?.id || fallbackSeed || ""
  let h = 0
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h)
  return TEXT_STATUS_GRADIENTS[Math.abs(h) % TEXT_STATUS_GRADIENTS.length]
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
const picCache = new Map()
const picFetching = new Set()
function Avatar({ jid, name, size = 46, ring = false, ringColor = "#25d366", unseen = false }) {
  const [url, setUrl] = useState(() => picCache.has(jid) ? picCache.get(jid) : undefined)
  const [err, setErr] = useState(false)
  useEffect(() => {
    if (!jid) return
    if (picCache.has(jid)) { const c = picCache.get(jid); if (c !== url) setUrl(c); return }
    if (picFetching.has(jid)) return
    picFetching.add(jid)
    window.api?.getProfilePic?.({ jid })
      .then(r => { const u = r?.url || null; picCache.set(jid, u); setUrl(u) })
      .catch(() => { picCache.set(jid, null); setUrl(null) })
      .finally(() => picFetching.delete(jid))
  }, [jid])
  const ringW = ring ? 3 : 0
  const pad = ring ? 3 : 0
  const total = size + (ringW + pad) * 2
  return (
    <div style={{ position: "relative", width: total, height: total, flexShrink: 0 }}>
      {ring && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          border: `${ringW}px solid ${unseen ? ringColor : "rgba(255,255,255,0.25)"}`,
          background: "transparent",
        }} />
      )}
      <div style={{
        position: "absolute",
        top: ring ? pad + ringW : 0, left: ring ? pad + ringW : 0,
        width: size, height: size, borderRadius: "50%",
        background: url && !err ? "transparent" : seedColor(jid),
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.round(size * 0.36), fontWeight: 700, color: "#fff",
        overflow: "hidden", userSelect: "none",
      }}>
        {url && !err
          ? <img src={url} alt={name} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : initials(name)
        }
      </div>
    </div>
  )
}

// ─── Progress Bars ────────────────────────────────────────────────────────────
function StoryProgress({ total, current, playing, duration, onDone }) {
  const [progress, setProgress] = useState(0)
  const rafRef = useRef(null)
  const startRef = useRef(null)
  useEffect(() => {
    setProgress(0)
    if (!playing) return
    startRef.current = Date.now()
    const tick = () => {
      const p = Math.min((Date.now() - startRef.current) / duration, 1)
      setProgress(p)
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
      else onDone()
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, current, duration])
  return (
    <div style={{ display: "flex", gap: 3, padding: "0 14px" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ flex: 1, height: 2.5, borderRadius: 2, background: "rgba(255,255,255,0.3)", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 2, background: "#fff",
            width: i < current ? "100%" : i === current ? `${progress * 100}%` : "0%",
          }} />
        </div>
      ))}
    </div>
  )
}

// ─── [NAV] Navigation is snapshot-based inside StoryViewer ───────────────────
// The viewer takes a frozen deep-copy of allContacts at mount time (navContacts ref).
// All next/prev logic reads from that snapshot — immune to live storiesMap mutations
// caused by onMarkSeen firing during playback. No global mutable map needed.

// ─── [INSTA] Fullscreen Instagram-style Story Viewer ─────────────────────────
//
// [PROD-FIX] Navigation correctness architecture:
//
//  PROBLEM: allContacts is a live prop — it recomputes every time the parent's
//  storiesMap changes (e.g. when onMarkSeen fires and marks a story seen).
//  This mutates `stories` mid-session, causing stale useCallback closures to
//  compute wrong next/prev indices and skip stories.
//
//  SOLUTION: Snapshot allContacts into a ref at mount. All navigation logic
//  reads from the frozen snapshot (navContacts). Only display data (avatar,
//  name) uses the live prop. The seen-mark updates the live grid cards without
//  ever touching the viewer's nav state.
//
function StoryViewer({ contact, allContacts, startIndex = 0, onClose, onMarkSeen }) {
  // ── Frozen navigation snapshot — stable for entire viewer session ──────────
  // Deep-clone stories arrays so live storiesMap mutations don't bleed in
  const navContacts = useRef(
    allContacts.map(c => ({ ...c, stories: (c.stories || []).map(s => ({ ...s })) }))
  )

  const [storyIdx, setStoryIdx] = useState(startIndex)
  const [currentJid, setCurrentJid] = useState(contact.jid)
  const [playing, setPlaying] = useState(true)
  const [mediaLoaded, setMediaLoaded] = useState(false)
  const mediaLoadedRef = useRef(false)
  const [videoProgress, setVideoProgress] = useState(0)
  const [replyText, setReplyText] = useState("")
  const [showReply, setShowReply] = useState(false)
  const [replySent, setReplySent] = useState(false)
  const [muteVideo, setMuteVideo] = useState(false)
  const [volume, setVolume] = useState(1)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const [showMenu, setShowMenu]     = useState(false)
  const [toast, setToast]           = useState(null)
  const [showForward, setShowForward] = useState(false)
  const videoRef = useRef(null)
  const playingRef = useRef(true)
  const replyInputRef = useRef(null)
  const menuRef = useRef(null)
  const volumeRef = useRef(null)
  const volumeHideTimer = useRef(null)

  // ── Derive from FROZEN snapshot — immune to live storiesMap updates ─────────
  const snap = navContacts.current
  const contactIdx = snap.findIndex(c => c.jid === currentJid)
  const currentContact = contactIdx >= 0 ? snap[contactIdx] : null
  const stories = currentContact?.stories || []
  const story = stories[storyIdx]
  const isVideo = story?.sourceType === "video" || story?.sourceType === "gif"
  const DURATION = isVideo ? 30000 : 5000

  const showToast = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 2800) }

  // [FIX-LEAK] useCallback so keyboard useEffect does not re-register on every
  // playing state change. Reads current state via playingRef (always fresh).
  const togglePlay = useCallback(() => {
    const next = !playingRef.current
    playingRef.current = next
    setPlaying(next)
    if (videoRef.current) { if (next) videoRef.current.play().catch(() => {}); else videoRef.current.pause() }
  }, [])  // stable: reads ref, sets state — no captured deps

  // ── Volume control ─────────────────────────────────────────────────────────
  const handleVolumeChange = useCallback((newVol) => {
    const v = Math.max(0, Math.min(1, newVol))
    setVolume(v)
    setMuteVideo(v === 0)
    if (videoRef.current) {
      videoRef.current.volume = v
      videoRef.current.muted = v === 0
    }
  }, [])

  const handleMuteToggle = useCallback(() => {
    if (muteVideo || volume === 0) {
      // Unmute — restore to last non-zero volume or default 0.8
      const restore = volume > 0 ? volume : 0.8
      setMuteVideo(false)
      setVolume(restore)
      if (videoRef.current) { videoRef.current.muted = false; videoRef.current.volume = restore }
    } else {
      setMuteVideo(true)
      if (videoRef.current) videoRef.current.muted = true
    }
  }, [muteVideo, volume])

  const openVolumeSlider = useCallback(() => {
    clearTimeout(volumeHideTimer.current)
    setShowVolumeSlider(true)
  }, [])

  const scheduleHideVolume = useCallback(() => {
    volumeHideTimer.current = setTimeout(() => setShowVolumeSlider(false), 1800)
  }, [])

  // Volume synced in onCanPlay handler on the video element

  const goNext = useCallback(() => {
    // Read from frozen snapshot — immune to live storiesMap mutations
    const s = navContacts.current
    const cIdx = s.findIndex(c => c.jid === currentJid)
    const cContact = cIdx >= 0 ? s[cIdx] : null
    const cStories = cContact?.stories || []

    if (storyIdx < cStories.length - 1) {
      // Move to next story in same contact — always sequential, never skip
      setStoryIdx(storyIdx + 1)
      setMediaLoaded(false)
    } else if (cIdx < s.length - 1) {
      // Last story of this contact → move to next contact
      const nc = s[cIdx + 1]
      // Find first unseen in snapshot (snapshot reflects state at viewer open)
      const firstUnseen = nc.stories.findIndex(st => !st.seen)
      const si = firstUnseen >= 0 ? firstUnseen : 0
      setCurrentJid(nc.jid)
      setStoryIdx(si)
      setMediaLoaded(false)
    } else {
      onClose()
    }
    setShowReply(false); setReplyText(""); setShowMenu(false)
  }, [storyIdx, currentJid, onClose])

  const goPrev = useCallback(() => {
    const s = navContacts.current
    const cIdx = s.findIndex(c => c.jid === currentJid)
    const cContact = cIdx >= 0 ? s[cIdx] : null

    if (storyIdx > 0) {
      // Move to previous story in same contact
      setStoryIdx(storyIdx - 1)
      setMediaLoaded(false)
    } else if (cIdx > 0) {
      // First story of this contact → move to last story of previous contact
      const nc = s[cIdx - 1]
      const si = Math.max(0, (nc.stories?.length || 1) - 1)
      setCurrentJid(nc.jid)
      setStoryIdx(si)
      setMediaLoaded(false)
    }
    setShowReply(false); setReplyText(""); setShowMenu(false)
  }, [storyIdx, currentJid])

  // Mark seen + reset media state
  useEffect(() => {
    if (story && !story.seen) onMarkSeen?.(currentContact?.jid, story.id)
    setPlaying(true); playingRef.current = true; setReplySent(false); setShowMenu(false)
    const isText = story?.sourceType === "text"
    const hasMedia = !isText && !!story?.mediaUrl
    // Always start loading state for media — onLoadedData/onLoad will reveal it
    mediaLoadedRef.current = false
    setMediaLoaded(!hasMedia)
    // Fallback timeout in case canplay never fires
    if (hasMedia) {
      const t = setTimeout(() => setMediaLoaded(true), 4000)
      return () => clearTimeout(t)
    }
  }, [storyIdx, contactIdx])

  // Video reset on story change
  useEffect(() => {
    if (videoRef.current) { videoRef.current.currentTime = 0; playingRef.current = true; setPlaying(true) }
  }, [storyIdx, contactIdx])

  // Keyboard
  useEffect(() => {
    const h = (e) => {
      if (showReply) return
      if (e.key === "ArrowRight") goNext()
      else if (e.key === "ArrowLeft") goPrev()
      else if (e.key === "Escape") { if (showMenu) setShowMenu(false); else if (showReply) setShowReply(false); else onClose() }
      else if (e.key === " ") { e.preventDefault(); togglePlay() }
      else if (e.key === "r" || e.key === "R") { setShowReply(true); setTimeout(() => replyInputRef.current?.focus(), 50) }
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [goNext, goPrev, togglePlay, showReply, showMenu])  // playing removed: togglePlay reads playingRef directly

  // Pause when menu/reply open
  useEffect(() => {
    if (showReply || showMenu) { playingRef.current = false; setPlaying(false) }
    else { playingRef.current = true; setPlaying(true) }
  }, [showReply, showMenu])

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [showMenu])

  // [FIX] Reply to status — uses status:reply which builds proper quoted WAMessage
  // so recipient sees the quoted status bubble (image/video/text/emoji all work)
  const handleSendReply = async () => {
    const text = replyText.trim()
    if (!text || !currentContact?.jid) return
    try {
      const res = await window.api?.statusReply?.({
        senderJid: currentContact.jid,
        statusId:  story.id,
        body:      text,
        // Pass serializable entry fields so main.js can reconstruct if rawMsg evicted
        entry: {
          sourceType:      story.sourceType,
          mediaUrl:        story.mediaUrl        || null,
          mediaMimetype:   story.mediaMimetype   || null,
          thumbnailBase64: story.thumbnailBase64 || null,
          text:            story.text            || null,
          caption:         story.caption         || null,
          backgroundColor: story.backgroundColor ?? null,
          font:            story.font            ?? null,
          audioDuration:   story.audioDuration   ?? null,
          timestamp:       story.timestamp       || null,
          senderName:      currentContact.name   || null,
        }
      })
      if (res?.ok === false) throw new Error(res.error)
      setReplySent(true); setReplyText(""); setShowReply(false)
      showToast("ok", `Terkirim ke ${currentContact.name}`)
      setTimeout(() => setReplySent(false), 2000)
    } catch (e) { showToast("err", `Gagal: ${e.message}`) }
  }

  // [FIX] sendReaction — also uses status:reply so emoji reactions show quoted context
  const sendReaction = async (emoji) => {
    try {
      const res = await window.api?.statusReply?.({
        senderJid: currentContact.jid,
        statusId:  story.id,
        body:      emoji,
        entry: {
          sourceType:      story.sourceType,
          mediaUrl:        story.mediaUrl        || null,
          mediaMimetype:   story.mediaMimetype   || null,
          thumbnailBase64: story.thumbnailBase64 || null,
          text:            story.text            || null,
          caption:         story.caption         || null,
          backgroundColor: story.backgroundColor ?? null,
          font:            story.font            ?? null,
          audioDuration:   story.audioDuration   ?? null,
          timestamp:       story.timestamp       || null,
          senderName:      currentContact.name   || null,
        }
      })
      if (res?.ok === false) throw new Error(res.error)
      showToast("ok", `${emoji} Terkirim`)
    } catch (e) { showToast("err", "Gagal") }
  }

  // [FIX] Save media — use status:save-media handler with proper binary write + mime-aware filters
  const handleSaveMedia = async () => {
    setShowMenu(false)
    const mediaUrl  = story?.mediaUrl
    const thumbB64  = story?.thumbnailBase64
    const mimetype  = story?.mediaMimetype || (
      story.sourceType === "video" ? "video/mp4" :
      story.sourceType === "gif"   ? "video/mp4" :
      story.sourceType === "audio" ? "audio/ogg" : "image/jpeg"
    )
    if (!mediaUrl && !thumbB64) { showToast("err", "Tidak ada media"); return }
    showToast("info", "Menyimpan…")
    try {
      // Derive clean extension from mimetype
      const extMap = {
        "image/jpeg":"jpg","image/jpg":"jpg","image/png":"png","image/gif":"gif","image/webp":"webp",
        "video/mp4":"mp4","video/3gpp":"3gp","video/quicktime":"mov","video/webm":"webm",
        "audio/ogg":"ogg","audio/mpeg":"mp3","audio/mp4":"m4a","audio/aac":"aac","audio/opus":"opus",
      }
      const baseMime = mimetype.split(";")[0].trim().toLowerCase()
      const ext = extMap[baseMime] || (story.sourceType === "video" || story.sourceType === "gif" ? "mp4" : story.sourceType === "audio" ? "ogg" : "jpg")
      const safeName = (currentContact.name || "unknown").replace(/[^a-z0-9]/gi, "_")
      const suggestedName = `status_${safeName}_${Date.now()}.${ext}`

      let base64Data = null
      if (mediaUrl) {
        // Fetch actual file — convert local paths to media:// so Electron can serve it
        const fetchUrl = safeMediaUrl(mediaUrl)
        const res = await fetch(fetchUrl)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const ab = await res.arrayBuffer()
        const uint8 = new Uint8Array(ab)
        let bin = ""
        for (let i = 0; i < uint8.length; i++) bin += String.fromCharCode(uint8[i])
        base64Data = btoa(bin)
      } else if (thumbB64) {
        base64Data = thumbB64.includes(",") ? thumbB64.split(",")[1] : thumbB64
      }

      if (!base64Data) throw new Error("Gagal decode media")

      const result = await window.api?.statusSaveMedia?.({ base64Data, mimetype: baseMime, suggestedName })
      if (result?.ok === false && result?.reason !== "canceled") throw new Error(result?.error || "Gagal")
      if (result?.ok) showToast("ok", "Tersimpan ✓")
    } catch (e) { showToast("err", `Gagal: ${e.message}`) }
  }

  const handleCopyText = () => {
    const text = story?.text || story?.caption || ""
    if (!text) { showToast("err", "Tidak ada teks"); setShowMenu(false); return }
    navigator.clipboard?.writeText(text).then(() => showToast("ok", "Teks disalin")).catch(() => showToast("err", "Gagal menyalin"))
    setShowMenu(false)
  }

  // [FIX-ELECTRON] openChat — use app store navigation (setNavTab + setActiveJid)
  const handleOpenChat = () => {
    setShowMenu(false)
    onClose()
    // Dispatch a custom event that Main.jsx / ChatList can listen to
    window.dispatchEvent(new CustomEvent("aurora:open-chat", { detail: { jid: currentContact.jid } }))
  }

  

  if (!story) return null
  const isMedia = story.sourceType === "image" || story.sourceType === "gif" || story.sourceType === "video"
  const isText  = story.sourceType === "text"
  const textBg  = isText ? (getTextStatusBg(story) || "#1a2b3c") : "#000"

  const BtnStyle = (extra = {}) => ({
    background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%",
    width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", color: "#fff", backdropFilter: "blur(8px)", flexShrink: 0,
    transition: "background 0.15s", ...extra
  })

  return (
    // [FIX-OVERLAP] Fixed overlay — sidebars are children here, positioned relative to viewport center
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.96)" }} onClick={onClose}>
      <style>{`
        @keyframes slideUp   { from { transform:translateY(16px);opacity:0 } to { transform:translateY(0);opacity:1 } }
        @keyframes fadeIn    { from { opacity:0 } to { opacity:1 } }
        @keyframes vspin     { to { transform:rotate(360deg) } }
        @keyframes toastIn   { from { transform:translateX(-50%) translateY(-8px);opacity:0 } to { transform:translateX(-50%) translateY(0);opacity:1 } }
        @keyframes emojiPop  { 0%{transform:scale(1)} 40%{transform:scale(1.35)} 100%{transform:scale(1)} }
        .sv-hdr-btn:hover    { background:rgba(255,255,255,0.18)!important }
        .sv-menu-item:hover  { background:rgba(255,255,255,0.07)!important }
        .sv-menu-item-red:hover { background:rgba(255,60,60,0.1)!important }
        .sv-sidebar:hover    { filter:brightness(0.9)!important; }
        .sv-emoji:hover      { transform:scale(1.25)!important;background:rgba(255,255,255,0.18)!important }
        input[type=range][style*="slider-vertical"]::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:#fff; cursor:pointer; }
        input[type=range][style*="slider-vertical"]::-moz-range-thumb { width:14px; height:14px; border-radius:50%; background:#fff; cursor:pointer; border:none; }
      `}</style>

      {/* ── Prev sidebars — 2 cards to the LEFT, anchored from viewport center ── */}
      {contactIdx > 0 && (() => {
        const c1 = snap[contactIdx - 1]
        const c2 = contactIdx > 1 ? snap[contactIdx - 2] : null
        const navTo = (c) => {
          const fi = c.stories.findIndex(st => !st.seen)
          const si = fi >= 0 ? fi : 0
          setCurrentJid(c.jid); setStoryIdx(si); setMediaLoaded(false); setShowReply(false)
        }
        return (<>
          <div className="sv-sidebar"
            onClick={e=>{e.stopPropagation(); navTo(c1)}}
            style={{
              position:"fixed", right:"calc(50% + 218px)", top:"50%", transform:"translateY(-50%)",
              width:112, height:180, borderRadius:16, overflow:"hidden", cursor:"pointer", zIndex:10000,
              background:"#0e0e0e", border:"1.5px solid rgba(255,255,255,0.13)",
              boxShadow:"0 8px 32px rgba(0,0,0,0.9)", transition:"filter 0.15s", filter:"brightness(0.68)",
            }}>
            <ContactMiniCard contact={c1}/>
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"flex-start", paddingLeft:10, zIndex:2, background:"linear-gradient(90deg,rgba(0,0,0,0.55),transparent)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </div>
          </div>
          {c2 && (
            <div className="sv-sidebar"
              onClick={e=>{e.stopPropagation(); navTo(c2)}}
              style={{
                position:"fixed", right:"calc(50% + 340px)", top:"50%", transform:"translateY(-50%)",
                width:78, height:126, borderRadius:12, overflow:"hidden", cursor:"pointer", zIndex:9999,
                background:"#0e0e0e", border:"1.5px solid rgba(255,255,255,0.07)",
                boxShadow:"0 4px 18px rgba(0,0,0,0.7)", transition:"filter 0.15s", filter:"brightness(0.38)",
              }}>
              <ContactMiniCard contact={c2}/>
            </div>
          )}
        </>)
      })()}

      {/* ── Main card — centered in viewport ── */}
      <div style={{
        position:"fixed",
        left:"50%", top:"50%", transform:"translate(-50%,-50%)",
        width:"min(420px,100vw)", height:"min(750px,100vh)",
        background: isText ? textBg : "#000",
        borderRadius: window.innerWidth > 500 ? 22 : 0,
        overflow:"hidden", display:"flex", flexDirection:"column",
        boxShadow:"0 40px 120px rgba(0,0,0,0.98)",
        isolation:"isolate", animation:"fadeIn 0.18s ease",
        zIndex:10000,
      }} onClick={e=>e.stopPropagation()}>

        {/* Progress bars */}
        <div style={{ position:"absolute", top:10, left:0, right:0, zIndex:10, padding:"0 10px" }}>
          <StoryProgress total={stories.length} current={storyIdx} playing={playing&&(isText||mediaLoaded)} duration={DURATION} onDone={goNext}/>
        </div>

        {/* ── Header ── */}
        <div style={{ position:"absolute", top:22, left:0, right:0, zIndex:10, display:"flex", alignItems:"center", gap:9, padding:"0 12px" }}>
          <Avatar jid={currentContact.jid} name={currentContact.name} size={36} ring={false}/>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontWeight:700, fontSize:14, color:"#fff", textShadow:"0 1px 8px rgba(0,0,0,0.9)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{currentContact.name}</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.65)", marginTop:1 }}>{timeAgo(story.timestamp)}{stories.length>1?` · ${storyIdx+1}/${stories.length}`:""}</div>
          </div>

          {/* Volume — video only: inline horizontal slider that expands in-place */}
          {isVideo && (
            <div
              ref={volumeRef}
              onMouseEnter={openVolumeSlider}
              onMouseLeave={scheduleHideVolume}
              style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}
            >
              {/* Mute/unmute icon button */}
              <button className="sv-hdr-btn"
                onClick={handleMuteToggle}
                title={muteVideo ? "Unmute" : "Mute"}
                style={BtnStyle()}
              >
                {(muteVideo || volume === 0)
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                  : volume < 0.5
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                }
              </button>

              {/* Horizontal slider — slides in when hovered */}
              <div style={{
                width: showVolumeSlider ? 72 : 0,
                overflow: "hidden",
                transition: "width 0.2s ease",
                display: "flex", alignItems: "center",
              }}>
                <div style={{ position:"relative", width:72, height:20, display:"flex", alignItems:"center", flexShrink:0 }}>
                  {/* Track bg */}
                  <div style={{ position:"absolute", left:0, right:0, height:3, borderRadius:3, background:"rgba(255,255,255,0.2)" }}/>
                  {/* Track fill */}
                  <div style={{
                    position:"absolute", left:0, height:3, borderRadius:3,
                    width:`${(muteVideo ? 0 : volume) * 100}%`,
                    background:"linear-gradient(to right,#1fa855,#25d366)",
                    transition:"width 0.06s ease",
                  }}/>
                  {/* Thumb dot */}
                  <div style={{
                    position:"absolute",
                    left:`calc(${(muteVideo ? 0 : volume) * 100}% - 6px)`,
                    width:12, height:12, borderRadius:"50%",
                    background:"#fff",
                    boxShadow:"0 0 0 2px #25d366, 0 1px 4px rgba(0,0,0,0.6)",
                    transition:"left 0.06s ease",
                    pointerEvents:"none",
                  }}/>
                  {/* Invisible range input on top */}
                  <input
                    type="range" min="0" max="1" step="0.02"
                    value={muteVideo ? 0 : volume}
                    onChange={e => handleVolumeChange(parseFloat(e.target.value))}
                    style={{
                      position:"absolute", inset:0, width:"100%", height:"100%",
                      opacity:0, cursor:"pointer", margin:0, padding:0,
                    }}
                  />
                </div>
              </div>

              {/* Volume % label */}
              {showVolumeSlider && (
                <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.65)", userSelect:"none", whiteSpace:"nowrap", minWidth:26 }}>
                  {Math.round((muteVideo ? 0 : volume) * 100)}%
                </span>
              )}
            </div>
          )}

          {/* Play/Pause */}
          <button className="sv-hdr-btn" onClick={togglePlay} style={BtnStyle()}>
            {playing
              ? <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
            }
          </button>

          {/* ⋯ Menu */}
          <div ref={menuRef} style={{ position:"relative", flexShrink:0 }}>
            <button className="sv-hdr-btn" onClick={()=>setShowMenu(m=>!m)} style={BtnStyle({ background: showMenu ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.5)" })}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
            </button>
            {showMenu && (
              <div style={{ position:"absolute", top:"calc(100% + 8px)", right:0, background:"rgba(16,16,16,0.97)", borderRadius:16, border:"1px solid rgba(255,255,255,0.1)", boxShadow:"0 16px 48px rgba(0,0,0,0.85)", backdropFilter:"blur(24px)", minWidth:210, overflow:"hidden", animation:"slideUp 0.14s ease", zIndex:30 }}>

                {/* Save media */}
                {isMedia && (
                  <button className="sv-menu-item" onClick={handleSaveMedia} style={{ width:"100%", background:"none", border:"none", padding:"13px 16px", display:"flex", alignItems:"center", gap:12, color:"#fff", fontSize:14, cursor:"pointer", textAlign:"left" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Simpan {story.sourceType === "video" ? "Video" : "Foto"}
                  </button>
                )}

                {/* Copy text */}
                {(story.text || story.caption) && (
                  <button className="sv-menu-item" onClick={handleCopyText} style={{ width:"100%", background:"none", border:"none", padding:"13px 16px", display:"flex", alignItems:"center", gap:12, color:"#fff", fontSize:14, cursor:"pointer", textAlign:"left" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    Salin Teks
                  </button>
                )}

                {/* Open chat */}
                <button className="sv-menu-item" onClick={handleOpenChat} style={{ width:"100%", background:"none", border:"none", padding:"13px 16px", display:"flex", alignItems:"center", gap:12, color:"#fff", fontSize:14, cursor:"pointer", textAlign:"left" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  Buka Chat
                </button>

                {/* Forward */}
                <button className="sv-menu-item" onClick={()=>{setShowMenu(false);setShowForward(true)}} style={{ width:"100%", background:"none", border:"none", padding:"13px 16px", display:"flex", alignItems:"center", gap:12, color:"#fff", fontSize:14, cursor:"pointer", textAlign:"left" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
                  Teruskan
                </button>

                <div style={{ height:1, background:"rgba(255,255,255,0.07)", margin:"3px 0" }}/>

                {/* Mute contact — not available via Baileys API, show info */}
                <button className="sv-menu-item-red" onClick={()=>{setShowMenu(false);showToast("info","Buka WhatsApp untuk membisukan status")}} style={{ width:"100%", background:"none", border:"none", padding:"13px 16px", display:"flex", alignItems:"center", gap:12, color:"rgba(255,85,85,0.95)", fontSize:14, cursor:"pointer", textAlign:"left" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                  Bisukan Status
                </button>
              </div>
            )}
          </div>

          {/* Close */}
          <button className="sv-hdr-btn" onClick={onClose} style={BtnStyle()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* ── Toast ── */}
        {toast && (
          <div style={{ position:"absolute", top:76, left:"50%", transform:"translateX(-50%)", background: toast.type==="ok" ? "rgba(37,211,102,0.93)" : toast.type==="err" ? "rgba(220,55,55,0.93)" : "rgba(30,30,30,0.93)", color:"#fff", borderRadius:24, padding:"8px 18px", fontSize:13, fontWeight:600, zIndex:20, backdropFilter:"blur(14px)", boxShadow:"0 4px 20px rgba(0,0,0,0.5)", animation:"toastIn 0.18s ease", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:7 }}>
            {toast.type==="ok"   && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
            {toast.type==="err"  && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}
            {toast.type==="info" && <div style={{ width:10, height:10, borderRadius:"50%", border:"2px solid rgba(255,255,255,0.3)", borderTop:"2px solid #fff", animation:"vspin 0.7s linear infinite" }}/>}
            {toast.msg}
          </div>
        )}

        {/* ── Content ── */}
        <div style={{ flex:1, position:"relative", background:"#000", overflow:"hidden" }}>
          {/* Blurred ambient bg — only while loading, hidden once media is ready */}
          {isMedia && story.thumbnailBase64 && !mediaLoaded && (
            <img src={story.thumbnailBase64} style={{ position:"absolute", inset:"-5%", width:"110%", height:"110%", objectFit:"cover", filter:"blur(28px) brightness(0.28)", zIndex:0 }} alt=""/>
          )}
          {/* Sharp thumbnail preview — shown while loading, fades out when ready */}
          {isMedia && story.thumbnailBase64 && (
            <img src={story.thumbnailBase64}
              style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"contain", zIndex:1, opacity: mediaLoaded ? 0 : 0.9, transition:"opacity 0.35s ease", pointerEvents:"none" }} alt=""
            />
          )}
          {/* Loading spinner */}
          {isMedia && !mediaLoaded && (
            <div style={{ position:"absolute", inset:0, zIndex:2, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10,
              background: story.thumbnailBase64 ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.8)" }}>
              <div style={{ width:38, height:38, borderRadius:"50%", border:"3px solid rgba(255,255,255,0.18)", borderTop:"3px solid #fff", animation:"vspin 0.7s linear infinite" }}/>
              <span style={{ color:"rgba(255,255,255,0.65)", fontSize:12, fontWeight:500 }}>{isVideo ? "Memuat video…" : "Memuat gambar…"}</span>
            </div>
          )}
          {/* Video — zIndex:3 so it's above thumbnail/spinner. black background fills letterbox bars.
              Use onLoadedData (not onCanPlay) — guarantees ≥1 decoded frame before revealing. */}
          {isMedia && isVideo && story.mediaUrl && (
            <video key={story.id} ref={videoRef} src={safeMediaUrl(story.mediaUrl)}
              style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"contain", zIndex:3, background:"#000", opacity:mediaLoaded?1:0, transition:"opacity 0.3s ease" }}
              loop={false} muted={muteVideo} playsInline preload="auto"
              onCanPlay={()=>{
                setMediaLoaded(true)
                if (playingRef.current) videoRef.current?.play().catch(()=>{})
              }}
              onTimeUpdate={e=>setVideoProgress(e.target.duration>0?e.target.currentTime/e.target.duration:0)}
              onEnded={goNext}
              onError={()=>setMediaLoaded(true)}
            />
          )}
          {/* Image — zIndex:3, sits above spinner/thumbnail */}
          {isMedia && story.sourceType==="image" && story.mediaUrl && (
            <img key={story.id} src={safeMediaUrl(story.mediaUrl)} alt=""
              style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"contain", zIndex:3, background:"#000" }}
              onLoad={()=>setMediaLoaded(true)} onError={()=>setMediaLoaded(true)}/>
          )}
          {/* [FIX-TEXT-BG] Text status — background already set on parent card via textBg.
              No extra background div needed; color shows through correctly now. */}
          {isText && (
            <div style={{ position:"absolute", inset:0, zIndex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"56px 28px", textAlign:"center", fontSize:story.text?.length>80?20:story.text?.length>40?26:32, fontWeight:700, color:"#fff", lineHeight:1.4, textShadow:"0 2px 14px rgba(0,0,0,0.5)", wordBreak:"break-word" }}>
              {story.text || <span style={{opacity:0.5}}>Status kosong</span>}
            </div>
          )}
          {/* No media */}
          {isMedia && !story.mediaUrl && !story.thumbnailBase64 && (
            <div style={{ position:"absolute", inset:0, zIndex:2, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8, color:"rgba(255,255,255,0.35)" }}>
              <span style={{fontSize:44}}>{isVideo?"🎬":"🖼️"}</span>
              <span style={{fontSize:13}}>Media tidak tersedia</span>
            </div>
          )}

          {/* Prev/Next story arrows inside card */}
          {storyIdx > 0 && (
            <button onClick={e=>{e.stopPropagation();goPrev()}} style={{ position:"absolute", left:10, top:"50%", marginTop:-18, width:36, height:36, borderRadius:"50%", background:"rgba(0,0,0,0.5)", border:"none", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#fff", zIndex:5, backdropFilter:"blur(6px)", transition:"background 0.15s" }}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(0,0,0,0.8)"}
              onMouseLeave={e=>e.currentTarget.style.background="rgba(0,0,0,0.5)"}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
          )}
          {storyIdx < stories.length - 1 && (
            <button onClick={e=>{e.stopPropagation();goNext()}} style={{ position:"absolute", right:10, top:"50%", marginTop:-18, width:36, height:36, borderRadius:"50%", background:"rgba(0,0,0,0.5)", border:"none", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#fff", zIndex:5, backdropFilter:"blur(6px)", transition:"background 0.15s" }}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(0,0,0,0.8)"}
              onMouseLeave={e=>e.currentTarget.style.background="rgba(0,0,0,0.5)"}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          )}
        </div>

        {/* Caption */}
        {story.caption && isMedia && (
          <div style={{ position:"absolute", bottom:showReply?88:70, left:0, right:0, background:"linear-gradient(transparent,rgba(0,0,0,0.82))", padding:"28px 16px 10px", color:"#fff", fontSize:14, lineHeight:1.5, zIndex:5 }}>
            {story.caption}
          </div>
        )}

        {/* ── Reply / action bar ── */}
        <div style={{ position:"absolute", bottom:0, left:0, right:0, zIndex:8, padding:"10px 12px 14px", background: showReply ? "rgba(0,0,0,0.9)" : "linear-gradient(transparent,rgba(0,0,0,0.6))", backdropFilter: showReply ? "blur(18px)" : "none", transition:"background 0.2s" }}>
          {showReply ? (
            <div style={{ display:"flex", gap:8, alignItems:"center", animation:"slideUp 0.16s ease" }}>
              <input ref={replyInputRef} value={replyText} onChange={e=>setReplyText(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleSendReply()}if(e.key==="Escape")setShowReply(false)}}
                placeholder={`Balas ke ${currentContact.name}…`}
                style={{ flex:1, background:"rgba(255,255,255,0.1)", border:"1.5px solid rgba(255,255,255,0.2)", borderRadius:26, padding:"11px 18px", color:"#fff", fontSize:14, outline:"none" }}
              />
              <button onClick={handleSendReply} disabled={!replyText.trim()} style={{ background:replyText.trim()?"#25d366":"rgba(255,255,255,0.12)", border:"none", borderRadius:"50%", width:42, height:42, display:"flex", alignItems:"center", justifyContent:"center", cursor:replyText.trim()?"pointer":"default", color:"#fff", flexShrink:0, transition:"background 0.15s" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              </button>
              <button onClick={()=>setShowReply(false)} style={{ background:"rgba(255,255,255,0.1)", border:"none", borderRadius:"50%", width:42, height:42, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"rgba(255,255,255,0.7)", flexShrink:0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ) : (
            <div style={{ display:"flex", gap:7, alignItems:"center" }}>
              <button onClick={()=>setShowReply(true)} style={{ flex:1, background:"rgba(255,255,255,0.08)", border:"1.5px solid rgba(255,255,255,0.16)", borderRadius:26, padding:"10px 16px", color:"rgba(255,255,255,0.65)", fontSize:13.5, cursor:"pointer", display:"flex", alignItems:"center", gap:8, transition:"background 0.15s", textAlign:"left" }}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.14)"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.08)"}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Balas ke {currentContact.name}…
              </button>
              {["❤️","😂","😮","😢","👏"].map(emoji=>(
                <button key={emoji} className="sv-emoji" onClick={()=>sendReaction(emoji)} style={{ background:"rgba(255,255,255,0.08)", border:"none", borderRadius:"50%", width:38, height:38, fontSize:17, cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", transition:"transform 0.12s, background 0.12s" }}>
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Next sidebars — 2 cards to the RIGHT, anchored from viewport center ── */}
      {contactIdx < snap.length - 1 && (() => {
        const c1 = snap[contactIdx + 1]
        const c2 = contactIdx < snap.length - 2 ? snap[contactIdx + 2] : null
        // Helper: navigate directly to a contact from snap (first unseen in snapshot)
        const navTo = (c) => {
          const fi = c.stories.findIndex(st => !st.seen)
          const si = fi >= 0 ? fi : 0
          setCurrentJid(c.jid); setStoryIdx(si); setMediaLoaded(false); setShowReply(false)
        }
        return (<>
          <div className="sv-sidebar"
            onClick={e=>{e.stopPropagation(); navTo(c1)}}
            style={{
              position:"fixed", left:"calc(50% + 218px)", top:"50%", transform:"translateY(-50%)",
              width:112, height:180, borderRadius:16, overflow:"hidden", cursor:"pointer", zIndex:10000,
              background:"#0e0e0e", border:"1.5px solid rgba(255,255,255,0.13)",
              boxShadow:"0 8px 32px rgba(0,0,0,0.9)", transition:"filter 0.15s", filter:"brightness(0.68)",
            }}>
            <ContactMiniCard contact={c1}/>
            <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"flex-end", paddingRight:10, zIndex:2, background:"linear-gradient(270deg,rgba(0,0,0,0.55),transparent)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </div>
          {c2 && (
            <div className="sv-sidebar"
              onClick={e=>{e.stopPropagation(); navTo(c2)}}
              style={{
                position:"fixed", left:"calc(50% + 340px)", top:"50%", transform:"translateY(-50%)",
                width:78, height:126, borderRadius:12, overflow:"hidden", cursor:"pointer", zIndex:9999,
                background:"#0e0e0e", border:"1.5px solid rgba(255,255,255,0.07)",
                boxShadow:"0 4px 18px rgba(0,0,0,0.7)", transition:"filter 0.15s", filter:"brightness(0.38)",
              }}>
              <ContactMiniCard contact={c2}/>
            </div>
          )}
        </>)
      })()}

      {/* ── Outer arrow buttons — fixed positioned, use snap ── */}
      {contactIdx > 0 && (() => {
        const p = snap[contactIdx - 1]
        const fi = p.stories.findIndex(st => !st.seen)
        const si = fi >= 0 ? fi : 0
        return (
          <button onClick={e=>{e.stopPropagation();setCurrentJid(p.jid);setStoryIdx(si);setMediaLoaded(false)}}
            style={{ position:"fixed", left:"calc(50% - 380px)", top:"50%", transform:"translateY(-50%)", background:"rgba(255,255,255,0.1)", border:"none", borderRadius:"50%", width:40, height:40, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#fff", backdropFilter:"blur(6px)", zIndex:10001, transition:"background 0.15s" }}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.25)"}
            onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        )
      })()}
      {contactIdx < snap.length - 1 && (() => {
        const n = snap[contactIdx + 1]
        const fi = n.stories.findIndex(st => !st.seen)
        const si = fi >= 0 ? fi : 0
        return (
          <button onClick={e=>{e.stopPropagation();setCurrentJid(n.jid);setStoryIdx(si);setMediaLoaded(false)}}
            style={{ position:"fixed", right:"calc(50% - 380px)", top:"50%", transform:"translateY(-50%)", background:"rgba(255,255,255,0.1)", border:"none", borderRadius:"50%", width:40, height:40, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", color:"#fff", backdropFilter:"blur(6px)", zIndex:10001, transition:"background 0.15s" }}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.25)"}
            onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        )
      })()}

      {/* Forward Status Modal */}
      {showForward && story && (
        <ForwardStatusModal
          story={story}
          senderName={currentContact?.name}
          onClose={() => { setShowForward(false) }}
        />
      )}
    </div>
  )
}

// ─── Mini card for sidebar preview ───────────────────────────────────────────
function ContactMiniCard({ contact }) {
  const latest = contact.stories?.[contact.stories.length - 1]
  const hasUnseen = contact.stories?.some(s => !s.seen)
  const thumbSrc = latest?.thumbnailBase64 || (!latest?.sourceType?.includes("text") ? safeMediaUrl(latest?.mediaUrl) : null)
  const isText = latest?.sourceType === "text"
  const textBg = isText ? (getTextStatusBg(latest) || "#1a3a2a") : "#1a3a2a"
  return (
    <div style={{ width: "100%", height: "100%", background: isText ? textBg : "#111", position: "relative" }}>
      {!isText && thumbSrc && (
        <img src={thumbSrc} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.7 }} />
      )}
      {isText && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "8px", textAlign: "center", fontSize: 10, fontWeight: 700, color: "#fff", wordBreak: "break-word" }}>
          {(latest?.text || "").slice(0, 30)}
        </div>
      )}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.8))", padding: "12px 6px 6px" }}>
        <Avatar jid={contact.jid} name={contact.name} size={22} ring unseen={hasUnseen} ringColor="#25d366" />
        <div style={{ fontSize: 9, color: "#fff", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contact.name}</div>
      </div>
    </div>
  )
}

// ─── Story Card (horizontal scroll) ──────────────────────────────────────────
function StoryCard({ contact, onClick }) {
  const latest = contact.stories?.[contact.stories.length - 1]
  const hasUnseen = contact.stories?.some(s => !s.seen)
  const unseenCount = contact.stories?.filter(s => !s.seen).length || 0
  const isText = latest?.sourceType === "text"
  const isVideo = latest?.sourceType === "video" || latest?.sourceType === "gif"
  const thumbSrc = latest?.thumbnailBase64 || (!isText ? safeMediaUrl(latest?.mediaUrl) : null) || null
  const textBg = isText ? (getTextStatusBg(latest) || "#1a3a2a") : "#1a3a2a"
  const [imgOk, setImgOk] = useState(true)
  return (
    <div onClick={onClick} style={{ flexShrink: 0, width: 112, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, userSelect: "none" }}>
      <style>{`.sc-card { transition: transform 0.15s ease, box-shadow 0.15s ease; } .sc-card:hover { transform: scale(1.05) translateY(-2px) !important; }`}</style>
      <div className="sc-card" style={{
        width: 108, height: 170, borderRadius: 14, overflow: "hidden", position: "relative",
        background: isText ? textBg : "#111824",
        border: `2px solid ${hasUnseen ? "#25d366" : "rgba(255,255,255,0.12)"}`,
        boxShadow: hasUnseen ? "0 0 0 2px #25d366aa, 0 6px 20px rgba(37,211,102,0.25)" : "0 4px 14px rgba(0,0,0,0.5)",
      }}>
        {!isText && thumbSrc && imgOk && (
          <img src={thumbSrc} alt="" onError={() => setImgOk(false)} style={{ position: "absolute", inset: "-4px", width: "calc(100% + 8px)", height: "calc(100% + 8px)", objectFit: "cover", filter: "blur(6px) brightness(0.6)" }} />
        )}
        {!isText && thumbSrc && imgOk && (
          <img src={thumbSrc} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", zIndex: 1 }} />
        )}
        {isText && (
          <div style={{ position: "absolute", inset: 0, zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "12px 8px", textAlign: "center", fontSize: (latest?.text?.length || 0) > 40 ? 11 : 14, fontWeight: 700, color: "#fff", wordBreak: "break-word", textShadow: "0 1px 6px rgba(0,0,0,0.6)" }}>
            {(latest?.text || "").slice(0, 80)}{(latest?.text?.length || 0) > 80 ? "…" : ""}
          </div>
        )}
        {!isText && (!thumbSrc || !imgOk) && (
          <div style={{ position: "absolute", inset: 0, zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "rgba(255,255,255,0.3)" }}>
            <span style={{ fontSize: 28 }}>{isVideo ? "🎬" : "🖼️"}</span>
          </div>
        )}
        <div style={{ position: "absolute", inset: 0, zIndex: 2, background: "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 35%, rgba(0,0,0,0.7) 100%)", pointerEvents: "none" }} />
        {isVideo && <div style={{ position: "absolute", top: 8, right: 8, zIndex: 3, background: "rgba(0,0,0,0.6)", borderRadius: 6, padding: "2px 6px", fontSize: 11, color: "#fff" }}>▶</div>}
        {contact.stories?.length > 1 && <div style={{ position: "absolute", top: 8, left: 8, zIndex: 3, background: "rgba(0,0,0,0.6)", borderRadius: 6, padding: "2px 6px", fontSize: 10, fontWeight: 700, color: "#fff" }}>{contact.stories.length}</div>}
        {/* Unseen indicator dots */}
        {unseenCount > 0 && (
          <div style={{ position: "absolute", top: 8, right: isVideo ? 32 : 8, zIndex: 3, display: "flex", gap: 2 }}>
            {Array.from({ length: Math.min(unseenCount, 3) }).map((_, i) => (
              <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#25d366" }} />
            ))}
          </div>
        )}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 3, padding: "6px 8px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Avatar jid={contact.jid} name={contact.name} size={28} ring unseen={hasUnseen} ringColor="#25d366" />
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.8)" }}>{timeAgo(latest?.timestamp)}</span>
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: hasUnseen ? 700 : 500, color: hasUnseen ? "var(--text-1)" : "var(--text-2)", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: 108 }}>
        {contact.name}
      </div>
    </div>
  )
}

// ─── Grid Story Card (2-col grid version) ────────────────────────────────────
function GridStoryCard({ contact, onClick }) {
  const latest = contact.stories?.[contact.stories.length - 1]
  const hasUnseen = contact.stories?.some(s => !s.seen)
  const unseenCount = contact.stories?.filter(s => !s.seen).length || 0
  // For progress bar display: first unseen index, or 0 if all seen
  const firstUnseenIdx = contact.stories?.findIndex(s => !s.seen) ?? -1
  const resumeIdx = firstUnseenIdx >= 0 ? firstUnseenIdx : 0
  const isText = latest?.sourceType === "text"
  const isVideo = latest?.sourceType === "video" || latest?.sourceType === "gif"
  const thumbSrc = latest?.thumbnailBase64 || (!isText ? safeMediaUrl(latest?.mediaUrl) : null) || null
  const textBg = isText ? (getTextStatusBg(latest) || "#1a3a2a") : "#1a3a2a"
  const [imgOk, setImgOk] = useState(true)

  return (
    <div onClick={onClick} className="sv-grid-item" style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 5, userSelect: "none", minWidth: 0 }}>
      <div style={{
        width: "100%", aspectRatio: "9/14", borderRadius: 12, overflow: "hidden", position: "relative",
        background: isText ? textBg : "#111824",
        border: `2px solid ${hasUnseen ? "#25d366" : "rgba(255,255,255,0.1)"}`,
        boxShadow: hasUnseen ? "0 0 0 2px #25d366aa, 0 6px 20px rgba(37,211,102,0.2)" : "0 4px 14px rgba(0,0,0,0.4)",
      }}>
        {/* Blurred bg */}
        {!isText && thumbSrc && imgOk && (
          <img src={thumbSrc} alt="" onError={() => setImgOk(false)}
            style={{ position: "absolute", inset: "-4px", width: "calc(100% + 8px)", height: "calc(100% + 8px)", objectFit: "cover", filter: "blur(6px) brightness(0.55)" }} />
        )}
        {/* Sharp thumbnail */}
        {!isText && thumbSrc && imgOk && (
          <img src={thumbSrc} alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", zIndex: 1 }} />
        )}
        {/* Text status */}
        {isText && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "10px 7px", textAlign: "center",
            fontSize: (latest?.text?.length || 0) > 40 ? 10 : 12,
            fontWeight: 700, color: "#fff", wordBreak: "break-word",
            textShadow: "0 1px 6px rgba(0,0,0,0.6)",
          }}>
            {(latest?.text || "").slice(0, 80)}{(latest?.text?.length || 0) > 80 ? "…" : ""}
          </div>
        )}
        {/* No thumbnail fallback */}
        {!isText && (!thumbSrc || !imgOk) && (
          <div style={{ position: "absolute", inset: 0, zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.25)" }}>
            <span style={{ fontSize: 22 }}>{isVideo ? "🎬" : "🖼️"}</span>
          </div>
        )}
        {/* Gradient overlay */}
        <div style={{ position: "absolute", inset: 0, zIndex: 2, background: "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 35%, rgba(0,0,0,0.72) 100%)", pointerEvents: "none" }} />
        {/* Top badges */}
        {isVideo && <div style={{ position: "absolute", top: 6, right: 6, zIndex: 3, background: "rgba(0,0,0,0.6)", borderRadius: 5, padding: "2px 5px", fontSize: 10, color: "#fff" }}>▶</div>}
        {contact.stories?.length > 1 && <div style={{ position: "absolute", top: 6, left: 6, zIndex: 3, background: "rgba(0,0,0,0.6)", borderRadius: 5, padding: "2px 5px", fontSize: 9, fontWeight: 700, color: "#fff" }}>{contact.stories.length}</div>}
        {/* Progress bars */}
        {contact.stories?.length > 1 && (
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 4, display: "flex", gap: 2, padding: "4px 4px 0" }}>
            {contact.stories.map((s, i) => (
              <div key={i} style={{ flex: 1, height: 2, borderRadius: 2, background: i < resumeIdx ? "var(--green)" : s.seen ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.55)" }} />
            ))}
          </div>
        )}
        {/* Bottom strip */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 3, padding: "5px 6px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Avatar jid={contact.jid} name={contact.name} size={22} ring={true} unseen={hasUnseen} ringColor="#25d366" />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
            <span style={{ fontSize: 8, color: "rgba(255,255,255,0.75)" }}>{timeAgo(latest?.timestamp)}</span>
            {unseenCount > 0 && (
              <div style={{ background: "#25d366", color: "#fff", borderRadius: 8, minWidth: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, padding: "0 3px" }}>
                {unseenCount}
              </div>
            )}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, fontWeight: hasUnseen ? 700 : 500, color: hasUnseen ? "var(--text-1)" : "var(--text-2)", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {contact.name}
      </div>
    </div>
  )
}

// ─── My Status Card (Grid version) ───────────────────────────────────────────
// [FIX-FROMME] When we have our own stories, render them just like a GridStoryCard.
// When empty, render the "add status" upload prompt.
function MyStatusCard({ onUpload, myStories, myJid, onView }) {
  const hasStories = myStories && myStories.length > 0
  const latest = hasStories ? myStories[myStories.length - 1] : null
  const unseenCount = hasStories ? myStories.filter(s => !s.seen).length : 0
  const firstUnseenIdx = hasStories ? myStories.findIndex(s => !s.seen) : -1
  const resumeIdx = firstUnseenIdx >= 0 ? firstUnseenIdx : 0
  const isText = latest?.sourceType === "text"
  const isVideo = latest?.sourceType === "video" || latest?.sourceType === "gif"
  const thumbSrc = latest?.thumbnailBase64 || (!isText ? safeMediaUrl(latest?.mediaUrl) : null) || null
  const textBg = isText ? (getTextStatusBg(latest) || "#1a3a2a") : "#1a3a2a"
  const [imgOk, setImgOk] = useState(true)

  // Empty state — upload prompt
  if (!hasStories) {
    return (
      <div onClick={onUpload} className="sv-grid-item" style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 5, minWidth: 0 }}>
        <div style={{ width: "100%", aspectRatio: "9/14", borderRadius: 12, overflow: "hidden", position: "relative", background: "var(--bg-card)", border: "2px dashed rgba(37,211,102,0.4)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#25d366"; e.currentTarget.style.background = "rgba(37,211,102,0.07)" }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(37,211,102,0.4)"; e.currentTarget.style.background = "var(--bg-card)" }}
        >
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </div>
          <div style={{ fontSize: 10, color: "var(--text-2)", textAlign: "center", padding: "0 6px" }}>Tambah status</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Status saya</div>
      </div>
    )
  }

  // Has own stories — render like a real story card, with an add-more "+" badge
  return (
    <div className="sv-grid-item" style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 5, userSelect: "none", minWidth: 0 }}>
      <div
        onClick={onView}
        style={{
          width: "100%", aspectRatio: "9/14", borderRadius: 12, overflow: "hidden", position: "relative",
          background: isText ? textBg : "#111824",
          border: "2px solid #25d366",
          boxShadow: "0 0 0 2px #25d366aa, 0 6px 20px rgba(37,211,102,0.2)",
        }}>
        {/* Blurred bg */}
        {!isText && thumbSrc && imgOk && (
          <img src={thumbSrc} alt="" onError={() => setImgOk(false)}
            style={{ position: "absolute", inset: "-4px", width: "calc(100% + 8px)", height: "calc(100% + 8px)", objectFit: "cover", filter: "blur(6px) brightness(0.55)" }} />
        )}
        {/* Sharp thumbnail */}
        {!isText && thumbSrc && imgOk && (
          <img src={thumbSrc} alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", zIndex: 1 }} />
        )}
        {/* Text status */}
        {isText && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 1,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "10px 7px", textAlign: "center",
            fontSize: (latest?.text?.length || 0) > 40 ? 10 : 12,
            fontWeight: 700, color: "#fff", wordBreak: "break-word",
            textShadow: "0 1px 6px rgba(0,0,0,0.6)",
          }}>
            {(latest?.text || "").slice(0, 80)}{(latest?.text?.length || 0) > 80 ? "…" : ""}
          </div>
        )}
        {/* No thumbnail fallback */}
        {!isText && (!thumbSrc || !imgOk) && (
          <div style={{ position: "absolute", inset: 0, zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.25)" }}>
            <span style={{ fontSize: 22 }}>{isVideo ? "🎬" : "🖼️"}</span>
          </div>
        )}
        {/* Gradient overlay */}
        <div style={{ position: "absolute", inset: 0, zIndex: 2, background: "linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, transparent 35%, rgba(0,0,0,0.72) 100%)", pointerEvents: "none" }} />
        {/* Video badge */}
        {isVideo && <div style={{ position: "absolute", top: 6, right: 6, zIndex: 3, background: "rgba(0,0,0,0.6)", borderRadius: 5, padding: "2px 5px", fontSize: 10, color: "#fff" }}>▶</div>}
        {/* Story count badge */}
        {myStories.length > 1 && <div style={{ position: "absolute", top: 6, left: 6, zIndex: 3, background: "rgba(0,0,0,0.6)", borderRadius: 5, padding: "2px 5px", fontSize: 9, fontWeight: 700, color: "#fff" }}>{myStories.length}</div>}
        {/* Progress bars */}
        {myStories.length > 1 && (
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 4, display: "flex", gap: 2, padding: "4px 4px 0" }}>
            {myStories.map((s, i) => (
              <div key={i} style={{ flex: 1, height: 2, borderRadius: 2, background: i < resumeIdx ? "var(--green)" : s.seen ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.55)" }} />
            ))}
          </div>
        )}
        {/* Bottom strip */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 3, padding: "5px 6px 6px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Avatar jid={myJid} name="Saya" size={22} ring={true} unseen={unseenCount > 0} ringColor="#25d366" />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
            <span style={{ fontSize: 8, color: "rgba(255,255,255,0.75)" }}>{timeAgo(latest?.timestamp)}</span>
            {unseenCount > 0 && (
              <div style={{ background: "#25d366", color: "#fff", borderRadius: 8, minWidth: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, padding: "0 3px" }}>
                {unseenCount}
              </div>
            )}
          </div>
        </div>
        {/* Add-more "+" button overlay (tap top-right corner) */}
        <div
          onClick={e => { e.stopPropagation(); onUpload() }}
          title="Tambah status baru"
          style={{ position: "absolute", bottom: 30, right: 6, zIndex: 5, width: 20, height: 20, borderRadius: "50%", background: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.5)", cursor: "pointer" }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-1)", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        Status saya
      </div>
    </div>
  )
}

// ─── Main StatusView ──────────────────────────────────────────────────────────
export default function StatusView({ onOpenUploader }) {
  const { contacts, chats } = useChatStore()
  const [storiesMap, setStoriesMap] = useState({})
  const [viewer, setViewer] = useState(null)
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)
  // [FIX-FROMME] Own JID — used to exclude self from contact list and storiesMap
  const [myJid, setMyJid] = useState(null)

  // Fetch own JID once on mount. Re-run fetchStories after it resolves so own
  // entries (keyed under our JID) get correctly bucketed into myStories.
  useEffect(() => {
    window.api?.getMyJid?.().then(jid => {
      if (!jid) return
      const norm = normalizeJid(jid)
      setMyJid(norm)
      // Re-fetch now that we know our JID — storiesMap may already hold our
      // entries under a raw JID that couldn't be matched before
      setFetched(false)
    }).catch(() => {})
  }, [])

  // [FIX-BUG1+BUG2] Memoize allContacts — only recompute when chats/contacts/myJid change
  // [FIX-FROMME] Exclude own JID so we never render ourselves as a contact card
  const allContacts = useMemo(() => {
    const seen = new Set()
    // Always exclude own JID from the contact list
    if (myJid) seen.add(myJid)
    const list = []
    for (const c of (chats || [])) {
      const jid = normalizeJid(c.jid || "")
      if (!jid || isJidGroup(jid) || isJidNewsletter(jid) || seen.has(jid)) continue
      seen.add(jid)
      list.push({ jid, name: c.name || c.subject || jidUser(jid) })
    }
    for (const ct of (contacts || [])) {
      const jid = normalizeJid(ct.jid || "")
      if (!jid || seen.has(jid)) continue
      seen.add(jid)
      list.push({ jid, name: ct.name || ct.push_name || jidUser(jid) })
    }
    return list
  }, [chats, contacts, myJid])

  // [FIX-FROMME] Own stories — pulled from storiesMap under myJid.
  // Also scan for any bucket where all entries are fromMe (handles pre-myJid fetch).
  const myStories = useMemo(() => {
    if (myJid) return storiesMap[myJid] || []
    // myJid not resolved yet — find bucket where every entry is fromMe
    for (const [, entries] of Object.entries(storiesMap)) {
      if (entries.length && entries.every(e => e.fromMe)) return entries
    }
    return []
  }, [myJid, storiesMap])
  // This prevents stale array on every render which caused wrong contactIdx lookups
  // [FIX-FROMME] Also exclude any bucket where all entries are fromMe — own JID guard
  // that works even before myJid resolves (first-fetch race condition safety net)
  const contactsWithStories = useMemo(() => {
    return allContacts
      .filter(c => {
        const stories = storiesMap[c.jid]
        if (!stories?.length) return false
        // If every entry is fromMe it's our own bucket leaked in — exclude it
        if (stories.every(e => e.fromMe)) return false
        // Also explicitly exclude if JID matches ours (belt-and-suspenders)
        if (myJid && areJidsSameUser(c.jid, myJid)) return false
        return true
      })
      .map(c => ({ ...c, stories: storiesMap[c.jid] }))
      .sort((a, b) => {
        const aUnseen = a.stories.some(s => !s.seen)
        const bUnseen = b.stories.some(s => !s.seen)
        if (aUnseen !== bUnseen) return aUnseen ? -1 : 1
        const aTs = Math.max(...a.stories.map(s => tsToMs(s.timestamp)))
        const bTs = Math.max(...b.stories.map(s => tsToMs(s.timestamp)))
        return bTs - aTs
      })
  }, [allContacts, storiesMap])

  // Real-time new status
  // [FIX-FROMME] Own status push → store under myJid (feeds myStories), not contact grid
  useEffect(() => {
    if (!window.api) return
    const cleanup = window.api.onStatusNew?.((data) => {
      if (!data?.senderJid || !data?.entry) return
      const jid = normalizeJid(data.senderJid)
      // Detect own entry by fromMe flag first, then JID match
      const isOwn = data.entry?.fromMe || (myJid && areJidsSameUser(jid, myJid))
      // storeJid: use resolved myJid if known, else raw jid (we'll remap after myJid resolves)
      const storeJid = isOwn ? (myJid || jid) : jid
      // For foreign contacts, reject entries wrongly tagged fromMe
      if (!isOwn && data.entry?.fromMe) return
      setStoriesMap(prev => {
        const existing = prev[storeJid] || []
        if (existing.find(e => e.id === data.entry.id)) return prev
        return { ...prev, [storeJid]: [...existing, data.entry].sort((a, b) => tsToMs(a.timestamp) - tsToMs(b.timestamp)) }
      })
    })
    return () => cleanup?.()
  }, [myJid])

  useEffect(() => { if (!fetched && !loading) fetchStories() }, [fetched, myJid])

  const fetchStories = async () => {
    if (loading) return
    setLoading(true)
    try {
      const res = await window.api?.statusGetAll?.()
      if (res?.ok && res.data) {
        const newMap = {}
        for (const [rawJid, entries] of Object.entries(res.data)) {
          if (!Array.isArray(entries) || !entries.length) continue
          const jid = normalizeJid(rawJid)

          // [FIX-FROMME] Detect own bucket: either JID matches ours (if known)
          // OR every entry in the bucket is fromMe (works even before myJid resolves)
          const isOwnBucket =
            (myJid && areJidsSameUser(jid, myJid)) ||
            entries.every(e => e.fromMe)

          if (isOwnBucket) {
            // Store under resolved myJid (or raw jid as fallback) so myStories picks it up
            const ownKey = myJid || jid
            newMap[ownKey] = entries
            continue
          }

          // Foreign contact — strip any stray fromMe entries
          const filtered = entries.filter(e => !e.fromMe)
          if (filtered.length) newMap[jid] = filtered
        }
        setStoriesMap(prev => ({ ...prev, ...newMap }))
      }
      setFetched(true)
    } catch (e) { console.error("fetchStories:", e) }
    finally { setLoading(false) }
  }

  const handleMarkSeen = async (jid, storyId) => {
    setStoriesMap(prev => ({ ...prev, [jid]: (prev[jid] || []).map(s => s.id === storyId ? { ...s, seen: true } : s) }))
    try { await window.api?.statusMarkSeen?.({ senderJid: jid, statusId: storyId }) } catch(_) {}
  }

  const openViewer = (contactJid) => {
    const contact = contactsWithStories.find(c => c.jid === contactJid)
    if (!contact) return
    // Start from first unseen story; fall back to 0 (rewatch)
    const firstUnseen = contact.stories.findIndex(s => !s.seen)
    const si = firstUnseen >= 0 ? firstUnseen : 0
    setViewer({ contactJid, storyIdx: si })
  }

  // [FIX-FROMME] Open StoryViewer for own stories — works even before myJid resolves
  const openMyStories = () => {
    if (!myStories.length) return
    // Resolve the key under which own stories are stored (myJid or raw JID fallback)
    const ownJid = myJid || (() => {
      for (const [jid, entries] of Object.entries(storiesMap)) {
        if (entries.length && entries.every(e => e.fromMe)) return jid
      }
      return null
    })()
    if (!ownJid) return
    const firstUnseen = myStories.findIndex(s => !s.seen)
    const si = firstUnseen >= 0 ? firstUnseen : 0
    setViewer({ contactJid: ownJid, storyIdx: si })
  }

  // [FIX-BUG2] viewerContact: always look up by JID from current contactsWithStories
  // [FIX-FROMME] Also handle own JID as a synthetic contact — works before myJid resolves
  const viewerContact = useMemo(() => {
    if (!viewer) return null
    const vJid = viewer.contactJid
    // Check if this is our own JID bucket (by direct match OR by fromMe flag on stored entries)
    const isOwnViewer =
      (myJid && areJidsSameUser(vJid, myJid)) ||
      (storiesMap[vJid]?.length && storiesMap[vJid].every(e => e.fromMe))
    if (isOwnViewer) {
      return { jid: vJid, name: "Status saya", stories: myStories }
    }
    return contactsWithStories.find(c => c.jid === vJid) || null
  }, [viewer, contactsWithStories, myJid, myStories, storiesMap])

  // allContacts passed to StoryViewer — includes own if we have stories (for nav)
  const allContactsForViewer = useMemo(() => {
    if (!myStories.length) return contactsWithStories
    // Use myJid if resolved, otherwise find the raw JID key for own stories
    const ownJid = myJid || (() => {
      for (const [jid, entries] of Object.entries(storiesMap)) {
        if (entries.length && entries.every(e => e.fromMe)) return jid
      }
      return null
    })()
    if (!ownJid) return contactsWithStories
    const myContact = { jid: ownJid, name: "Status saya", stories: myStories }
    return [myContact, ...contactsWithStories]
  }, [contactsWithStories, myJid, myStories, storiesMap])

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-1)" }}>
      {/* Header */}
      <div style={{ padding: "14px 16px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)" }}>Status</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span className="spinner spinner-sm" style={{ width: 14, height: 14, borderTopColor: "var(--green)", borderColor: "rgba(37,211,102,.2)" }} />}
          <button onClick={fetchStories} disabled={loading} title="Refresh" style={{ background: "none", border: "none", cursor: loading ? "wait" : "pointer", color: "var(--text-3)", padding: 4, display: "flex", alignItems: "center" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.08-3.08"/></svg>
          </button>
        </div>
      </div>

      {/* Card grid — 8 columns fixed, larger cards */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 16px", scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
        <style>{`
          .sv-grid-item { transition: transform 0.14s ease; }
          .sv-grid-item:hover { transform: scale(1.04) translateY(-3px) !important; }
          .sv-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 10px; }
        `}</style>

        <div className="sv-grid">
          <MyStatusCard
            onUpload={onOpenUploader}
            myStories={myStories}
            myJid={myJid}
            onView={openMyStories}
          />
          {contactsWithStories.map(contact => (
            <GridStoryCard key={contact.jid} contact={contact} onClick={() => openViewer(contact.jid)} />
          ))}
        </div>

        {/* Empty state */}
        {!loading && contactsWithStories.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", color: "var(--text-3)", gap: 12 }}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" style={{ opacity: 0.35 }}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="8" r="2"/><path d="M12 14v4"/></svg>
            <div style={{ fontSize: 13, textAlign: "center", lineHeight: 1.6 }}>
              Belum ada status terbaru.<br/>
              <span style={{ color: "var(--green)", cursor: "pointer" }} onClick={fetchStories}>Refresh</span>
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen viewer */}
      {viewer && viewerContact && (
        <StoryViewer
          key={viewer.contactJid}
          contact={viewerContact}
          allContacts={allContactsForViewer}
          startIndex={viewer.storyIdx}
          onClose={() => setViewer(null)}
          onMarkSeen={handleMarkSeen}
        />
      )}
    </div>
  )
}