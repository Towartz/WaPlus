// src/components/MessageInput.jsx
// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTION GRADE v3 — AuroraChat Message Input
// [F-1] Reply preview
// [F-2] Drag & Drop file/image → album preview
// [F-3] Paste image (screenshot) → preview + caption
// [F-4] Album mode — stack multiple, each with own caption
// [F-5] Send media via IPC sendMedia
// [F-6] WhatsApp-style attach menu (+ button popup)
// [F-7] Sticker panel — scans ALL .webp from media/stickers/ recursively
//        Groups by sub-folder (pack tabs). Sends via IPC sticker:send.
//        Reference: Yumi index.js sendImageAsSticker / sendFile pattern —
//        sock.sendMessage(jid, { sticker: buffer }, { quoted })
// [F-8] Improved UI/UX — pill input, smooth animations
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { useChatStore } from "../store/chat"

// ─── Icons ───────────────────────────────────────────────────────────────────
const EmojiIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/>
    <line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
  </svg>
)
const StickerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z"/>
    <polyline points="15 3 15 9 21 9"/>
    <circle cx="9" cy="13" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="15" cy="13" r="1.5" fill="currentColor" stroke="none"/>
    <path d="M9 18c.83.63 1.94 1 3 1s2.17-.37 3-1"/>
  </svg>
)
const PlusIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const MicIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
)
const SendIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
  </svg>
)
const SearchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)
const ImageIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
    <polyline points="21 15 16 10 5 21"/>
  </svg>
)
const CameraIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
)
const AudioIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
  </svg>
)
const ContactIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
)
const PollIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/>
  </svg>
)
const EventIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
)
const NewStickerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
)

// ─── Reply Preview Bar ────────────────────────────────────────────────────────
function ReplyPreviewBar({ replyTo, onCancel, chatName }) {
  if (!replyTo) return null
  const isMe    = replyTo.from_me === 1 || replyTo.from_me === true
  const isGroup = replyTo.is_group === 1 || replyTo.is_group === true
  const senderName = isMe
    ? "Kamu"
    : isGroup
      ? (replyTo.sender_name || chatName || "Anggota")
      : (chatName || replyTo.sender_name || "Mereka")

  const getPreviewText = () => {
    const t = replyTo.msg_type
    if (t === "imageMessage")   return "\uD83D\uDCF7 Foto"
    if (t === "videoMessage")   return "\uD83C\uDFAC Video"
    if (t === "audioMessage" || t === "pttMessage") return "\uD83C\uDFB5 Audio"
    if (t === "stickerMessage") return "\uD83C\uDFAD Stiker"
    if (t === "documentMessage") return "\uD83D\uDCC4 " + (replyTo.media_filename || "Dokumen")
    return replyTo.body || "Pesan"
  }

  return (
    <div className="reply-preview-bar">
      <span className="reply-preview-icon">&#8617;</span>
      <div className="reply-preview-content">
        <div className="reply-preview-name">{senderName}</div>
        <div className="reply-preview-text">{getPreviewText()}</div>
      </div>
      {replyTo.media_thumbnail_b64 && (
        <img src={replyTo.media_thumbnail_b64} alt=""
          style={{ width: 38, height: 38, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
      )}
      <button className="reply-preview-close" onClick={onCancel} title="Batalkan balasan">&#215;</button>
    </div>
  )
}

// ─── Attach Menu ──────────────────────────────────────────────────────────────
const ATTACH_ITEMS = [
  { id: "media",   label: "Photos & videos", icon: <ImageIcon />,      color: "#a855f7", accept: "image/*,video/*" },
  { id: "camera",  label: "Camera",          icon: <CameraIcon />,     color: "#ef4444" },
  { id: "audio",   label: "Audio",           icon: <AudioIcon />,      color: "#3b82f6", accept: "audio/*" },
  { id: "contact", label: "Contact",         icon: <ContactIcon />,    color: "#f97316" },
  { id: "poll",    label: "Poll",            icon: <PollIcon />,       color: "#22d3ee" },
  { id: "event",   label: "Event",           icon: <EventIcon />,      color: "#f43f5e" },
  { id: "sticker", label: "New sticker",     icon: <NewStickerIcon />, color: "#84cc16" },
]

function AttachMenu({ open, onClose, onSelect }) {
  useEffect(() => {
    if (!open) return
    const h = e => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", h)
    return () => document.removeEventListener("keydown", h)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 98 }} onClick={onClose} />
      <div className="attach-menu-popup">
        {ATTACH_ITEMS.map((item, i) => (
          <button
            key={item.id}
            className="attach-menu-item"
            style={{ "--item-color": item.color, "--delay": `${i * 28}ms` }}
            onClick={() => { onSelect(item); onClose() }}
          >
            <span className="attach-menu-icon" style={{ background: item.color + "22", color: item.color }}>
              {item.icon}
            </span>
            <span className="attach-menu-label">{item.label}</span>
          </button>
        ))}
      </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════
// STICKER PANEL
// ─ IPC flow ─────────────────────────────────────────────────
//   1. window.api.listStickers()
//      → main.js "sticker:list" handler
//      → fs.readdirSync(media/stickers/) recursively
//      → returns { ok, stickers: [{ name, filename, absPath, packFolder }] }
//
//   2. window.api.getStickerData({ absPath })
//      → main.js "sticker:data" handler
//      → fs.readFileSync(absPath).toString("base64")
//      → returns { ok, data: "data:image/webp;base64,..." }
//      (lazy — only fetched when thumb enters viewport via IntersectionObserver)
//
//   3. window.api.sendSticker({ jid, absPath, quotedMsgId })
//      → main.js "sticker:send" handler
//      → buf = fs.readFileSync(absPath)
//      → baileysClient.sendSticker(jid, buf, quotedWAMsg)
//      → sock.sendMessage(jid, { sticker: buf }, { quoted })
//      ★ Exact same pattern as Yumi's sendImageAsSticker:
//        dims.sendMessage(jid, { sticker: { url: buffer } }, { quoted })
// ════════════════════════════════════════════════════════════
// STICKER PANEL — expandable, virtualized, animated-webp optimized
// ════════════════════════════════════════════════════════════

// ── Virtual grid constants ────────────────────────────────
const COLS_COLLAPSED  = 4
const COLS_EXPANDED   = 6
const THUMB_COLLAPSED = 72
const THUMB_EXPANDED  = 80
const ROW_GAP         = 4
const OVERSCAN_ROWS   = 3
const LOAD_CONCURRENCY = 6

// ── Concurrency-limited IPC loader ───────────────────────
const _loaderQueue  = []
let   _loaderActive = 0
function _enqueueLoad(fn) {
  return new Promise((resolve, reject) => {
    _loaderQueue.push({ fn, resolve, reject })
    _drainQueue()
  })
}
function _drainQueue() {
  while (_loaderActive < LOAD_CONCURRENCY && _loaderQueue.length > 0) {
    const { fn, resolve, reject } = _loaderQueue.shift()
    _loaderActive++
    fn().then(r  => { _loaderActive--; resolve(r); _drainQueue() })
        .catch(e => { _loaderActive--; reject(e);  _drainQueue() })
  }
}

// ── Module-level data cache (survives panel re-mounts) ────
// absPath → base64 dataUrl. Never evicted.
const _stickerDataCache = {}

// ── Expand icon ───────────────────────────────────────────
const ExpandIcon = ({ expanded }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    {expanded
      ? <><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></>
      : <><polyline points="9 3 3 3 3 9"/><polyline points="15 21 21 21 21 15"/><line x1="3" y1="3" x2="10" y2="10"/><line x1="21" y1="21" x2="14" y2="14"/></>
    }
  </svg>
)

function StickerPanel({ open, onClose, chatJid, replyTo, onSend }) {
  const [allStickers, setAllStickers] = useState([])
  const [loading,     setLoading]     = useState(false)
  const [search,      setSearch]      = useState("")
  const [expanded,    setExpanded]    = useState(false)
  const [scrollTop,   setScrollTop]   = useState(0)
  const [gridH,       setGridH]       = useState(320)
  const [cacheVer,    setCacheVer]    = useState(0)   // bump to re-render when cache fills

  const panelRef  = useRef(null)
  const gridRef   = useRef(null)
  const loadedRef = useRef(false)

  const cols      = expanded ? COLS_EXPANDED  : COLS_COLLAPSED
  const thumbSize = expanded ? THUMB_EXPANDED : THUMB_COLLAPSED
  const rowH      = thumbSize + ROW_GAP

  // ── Load list once ──────────────────────────────────────
  useEffect(() => {
    if (!open || loadedRef.current) return
    loadedRef.current = true
    setLoading(true)
    ;(async () => {
      try {
        const res = await window.api?.listStickers?.()
        setAllStickers(res?.ok ? (res.stickers || []) : [])
      } catch { setAllStickers([]) }
      finally   { setLoading(false) }
    })()
  }, [open])

  useEffect(() => { if (!open) return; setSearch(""); setScrollTop(0) }, [open])

  // ── Outside click close ─────────────────────────────────
  useEffect(() => {
    if (!open) return
    const h = e => { if (panelRef.current && !panelRef.current.contains(e.target)) onClose() }
    const t = setTimeout(() => document.addEventListener("mousedown", h), 80)
    return () => { clearTimeout(t); document.removeEventListener("mousedown", h) }
  }, [open, onClose])

  // ── Measure grid height ─────────────────────────────────
  useEffect(() => {
    if (!gridRef.current) return
    const ro = new ResizeObserver(([e]) => setGridH(e.contentRect.height))
    ro.observe(gridRef.current)
    return () => ro.disconnect()
  }, [open])

  // ── Filtered list ───────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search.trim()) return allStickers
    const q = search.toLowerCase()
    return allStickers.filter(s => s.name.toLowerCase().includes(q))
  }, [allStickers, search])

  // ── Virtual rows ────────────────────────────────────────
  const totalRows  = Math.ceil(filtered.length / cols)
  const totalH     = totalRows * rowH
  const firstRow   = Math.max(0, Math.floor(scrollTop / rowH) - OVERSCAN_ROWS)
  const visibleRows = Math.ceil(gridH / rowH) + OVERSCAN_ROWS * 2
  const lastRow    = Math.min(totalRows - 1, firstRow + visibleRows)

  const visibleItems = useMemo(() => {
    const items = []
    for (let row = firstRow; row <= lastRow; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col
        if (idx < filtered.length) items.push({ sticker: filtered[idx], row, col })
      }
    }
    return items
  }, [filtered, firstRow, lastRow, cols])

  // ── Lazy load visible thumbnails (concurrency-limited) ──
  useEffect(() => {
    if (!open || !visibleItems.length) return
    const toLoad = visibleItems
      .map(v => v.sticker.absPath)
      .filter(p => !_stickerDataCache[p])
    if (!toLoad.length) return
    toLoad.forEach(absPath => {
      _enqueueLoad(async () => {
        const res = await window.api?.getStickerData?.({ absPath })
        if (res?.ok && res.data) {
          _stickerDataCache[absPath] = res.data
          setCacheVer(v => v + 1)
        }
      }).catch(() => {})
    })
  // Stringify keys to avoid infinite loop — only re-run when visible set changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, visibleItems.map(v => v.sticker.absPath).join("|")])

  if (!open) return null

  const panelW = expanded ? 560 : 340

  return (
    <div
      ref={panelRef}
      className={`sticker-panel ${expanded ? "sticker-panel-expanded" : ""}`}
      style={{ width: panelW }}
    >
      {/* Header */}
      <div className="sticker-panel-header">
        <div className="sticker-search-wrap">
          <SearchIcon />
          <input
            className="sticker-search"
            placeholder={`Cari dari ${allStickers.length} stiker...`}
            value={search}
            onChange={e => { setSearch(e.target.value); setScrollTop(0) }}
            autoFocus
          />
          {search && (
            <button className="sticker-clear-btn" onClick={() => { setSearch(""); setScrollTop(0) }}>
              &#215;
            </button>
          )}
        </div>
        <button
          className="sticker-expand-btn"
          onClick={() => setExpanded(v => !v)}
          title={expanded ? "Perkecil panel" : "Perbesar panel"}
        >
          <ExpandIcon expanded={expanded} />
        </button>
      </div>

      {/* Virtual grid */}
      <div
        ref={gridRef}
        className="sticker-grid-wrap"
        onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
      >
        {loading ? (
          <div className="sticker-empty">
            <span className="spinner spinner-green" style={{ width: 24, height: 24 }} />
            <span style={{ fontSize: 12, color: "var(--text-3)", marginTop: 8 }}>
              Memuat stiker...
            </span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="sticker-empty">
            <span style={{ fontSize: 32 }}>🎭</span>
            <span style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>
              {allStickers.length === 0 ? "Belum ada stiker" : "Tidak ditemukan"}
            </span>
          </div>
        ) : (
          <div style={{ position: "relative", height: totalH, width: "100%" }}>
            {visibleItems.map(({ sticker, row, col }) => (
              <StickerThumb
                key={sticker.absPath}
                sticker={sticker}
                dataUrl={_stickerDataCache[sticker.absPath] || null}
                size={thumbSize}
                top={row * rowH}
                left={col * (thumbSize + ROW_GAP)}
                onSend={() => { onSend(sticker); onClose() }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="sticker-footer">
        <span>
          {search ? `${filtered.length} / ${allStickers.length}` : allStickers.length} stiker
          {" · "}
          <code style={{ fontFamily: "var(--font-mono)", fontSize: 9 }}>media/stickers/</code>
        </span>
        <span style={{ color: "var(--text-3)", fontSize: 9.5 }}>
          {cols} kolom · animasi saat hover
        </span>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// STICKER THUMB
// Performance strategy for 1375+ animated .webp:
//   IDLE  → draw frame-0 to canvas (static, zero GPU cost)
//   HOVER → show full <img> (animated webp plays)
//   This avoids Chromium running 1375 animation timers at once.
// ════════════════════════════════════════════════════════════
function StickerThumb({ sticker, dataUrl, size, top, left, onSend }) {
  const [err,        setErr]        = useState(false)
  const [hovered,    setHovered]    = useState(false)
  const [firstFrame, setFirstFrame] = useState(null)

  // Extract static first frame from webp when dataUrl arrives
  useEffect(() => {
    if (!dataUrl || firstFrame || err) return
    const img = new Image()
    img.onload = () => {
      try {
        const c   = document.createElement("canvas")
        c.width   = img.naturalWidth  || size
        c.height  = img.naturalHeight || size
        c.getContext("2d").drawImage(img, 0, 0)
        setFirstFrame(c.toDataURL("image/webp", 0.75))
      } catch { setFirstFrame(dataUrl) }
    }
    img.onerror = () => setFirstFrame(dataUrl)
    img.src = dataUrl
  }, [dataUrl, firstFrame, err, size])

  const posStyle = {
    position: "absolute",
    top,
    left,
    width:  size,
    height: size,
  }

  // No data yet — skeleton
  if (!dataUrl) {
    return (
      <button className="sticker-thumb" style={posStyle} disabled title={sticker.name}>
        <span className="sticker-thumb-skeleton" />
      </button>
    )
  }

  if (err) {
    return (
      <button className="sticker-thumb" style={posStyle} onClick={onSend} title={sticker.name}>
        <span style={{ fontSize: 20 }}>🎭</span>
      </button>
    )
  }

  return (
    <button
      className="sticker-thumb"
      style={posStyle}
      onClick={onSend}
      title={sticker.name}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* IDLE: static first frame (canvas snapshot — no animation cost) */}
      {!hovered && firstFrame && (
        <img src={firstFrame} alt="" draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
      )}
      {/* IDLE before first frame ready: show img dimmed (will trigger onLoad for canvas) */}
      {!hovered && !firstFrame && (
        <img
          src={dataUrl}
          alt=""
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", opacity: 0.7 }}
          onLoad={e => {
            try {
              const c = document.createElement("canvas")
              c.width  = e.target.naturalWidth  || size
              c.height = e.target.naturalHeight || size
              c.getContext("2d").drawImage(e.target, 0, 0)
              setFirstFrame(c.toDataURL("image/webp", 0.75))
            } catch { setFirstFrame(dataUrl) }
          }}
          onError={() => setErr(true)}
        />
      )}
      {/* HOVER: full animated webp */}
      {hovered && (
        <img src={dataUrl} alt={sticker.name} draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          onError={() => setErr(true)} />
      )}
    </button>
  )
}

// ─── Media Preview Card ───────────────────────────────────────────────────────
function MediaPreviewCard({ item, index, total, onRemove, onCaptionChange }) {
  const isGif   = item.isGif || item.mimeType === "image/gif"
  const isImage = !isGif && item.mimeType?.startsWith("image/")
  const isVideo = !isGif && item.mimeType?.startsWith("video/")
  return (
    <div style={{
      position: "relative", display: "flex", flexDirection: "column", gap: 6,
      background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 8,
      border: "1px solid rgba(255,255,255,0.1)", minWidth: 140, maxWidth: 180, flexShrink: 0,
    }}>
      <div style={{ position: "relative", lineHeight: 0 }}>
        {isGif ? (
          <div style={{ position: "relative" }}>
            <img src={item.dataUrl} alt="GIF preview"
              style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 7, display: "block" }} />
            <div style={{ position: "absolute", bottom: 4, left: 4, background: "rgba(0,0,0,0.72)", color: "#fff",
              borderRadius: 4, fontSize: 10, fontWeight: 700, padding: "1px 5px", letterSpacing: 0.5 }}>GIF</div>
          </div>
        ) : isImage ? (
          <img src={item.dataUrl} alt="preview"
            style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 7, display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: 110, borderRadius: 7, background: "#1a1a2a",
            display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 28 }}>{isVideo ? "🎬" : "📄"}</span>
            <span style={{ fontSize: 10, color: "var(--text-3)", textOverflow: "ellipsis",
              overflow: "hidden", whiteSpace: "nowrap", maxWidth: "90%", padding: "0 4px" }}>
              {item.fileName || "File"}
            </span>
          </div>
        )}
        <button onClick={() => onRemove(index)} style={{
          position: "absolute", top: 4, right: 4, width: 20, height: 20,
          borderRadius: "50%", background: "rgba(0,0,0,0.75)", border: "none",
          color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, lineHeight: 1,
        }} title="Hapus">&#215;</button>
        {total > 1 && (
          <div style={{ position: "absolute", top: 4, left: 4, background: "rgba(0,180,90,0.85)",
            color: "#fff", borderRadius: 8, fontSize: 10, fontWeight: 700, padding: "1px 6px" }}>
            {index + 1}/{total}
          </div>
        )}
      </div>
      <input type="text" value={item.caption || ""} onChange={e => onCaptionChange(index, e.target.value)}
        placeholder="Keterangan..." style={{
          background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 6, color: "var(--text-1)", fontSize: 11.5, padding: "4px 8px",
          outline: "none", width: "100%", boxSizing: "border-box",
        }} />
    </div>
  )
}

// ─── Album Strip ──────────────────────────────────────────────────────────────
function MediaPreviewStrip({ items, onRemove, onCaptionChange, onAddMore }) {
  if (!items.length) return null
  return (
    <div style={{ borderTop: "1px solid var(--border)", padding: "10px 14px 8px", background: "var(--bg-sidebar)" }}>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, alignItems: "flex-start" }}>
        {items.map((item, i) => (
          <MediaPreviewCard key={i} item={item} index={i} total={items.length}
            onRemove={onRemove} onCaptionChange={onCaptionChange} />
        ))}
        <button onClick={onAddMore} style={{
          minWidth: 60, height: 110, borderRadius: 10,
          border: "2px dashed rgba(255,255,255,0.2)", background: "transparent",
          color: "var(--text-3)", cursor: "pointer", display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 4, flexShrink: 0, fontSize: 11,
        }} title="Tambah file">
          <span style={{ fontSize: 20 }}>+</span><span>Tambah</span>
        </button>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
        {items.length > 1 ? `${items.length} file (album)` : "1 file"}
        {" "}&#8212; keterangan per gambar opsional
      </div>
    </div>
  )
}

// ─── Drag Overlay ─────────────────────────────────────────────────────────────
function DragOverlay() {
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 50, background: "rgba(0,180,90,0.15)",
      border: "2px dashed var(--green)", borderRadius: 12, display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, pointerEvents: "none",
    }}>
      <span style={{ fontSize: 32 }}>&#128206;</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--green)" }}>Lepas untuk lampirkan</span>
    </div>
  )
}

function fileToMediaItem(file) {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      const mime = file.type || "application/octet-stream"
      resolve({ dataUrl: e.target.result, mimeType: mime, fileName: file.name, caption: "", isGif: mime === "image/gif" })
    }
    reader.readAsDataURL(file)
  })
}

// ════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════
export default function MessageInput({ chatJid, chatName, replyTo, onCancelReply }) {
  const [text, setText]               = useState("")
  const [sending, setSending]         = useState(false)
  const [mediaItems, setMediaItems]   = useState([])
  const [isDragOver, setIsDragOver]   = useState(false)
  const [attachOpen, setAttachOpen]   = useState(false)
  const [stickerOpen, setStickerOpen] = useState(false)

  const ref     = useRef(null)
  const fileRef = useRef(null)
  const wrapRef = useRef(null)
  const { appendMessage } = useChatStore()

  const hasText  = text.trim().length > 0
  const hasMedia = mediaItems.length > 0
  const canSend  = (hasText || hasMedia) && !sending

  useEffect(() => { if (replyTo) ref.current?.focus() }, [replyTo])

  useEffect(() => {
    const handler = e => {
      if (e.key === "Escape") {
        if (stickerOpen) { setStickerOpen(false); return }
        if (attachOpen)  { setAttachOpen(false);  return }
        if (hasMedia)    { setMediaItems([]);       return }
        if (replyTo)     onCancelReply?.()
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [replyTo, onCancelReply, hasMedia, stickerOpen, attachOpen])

  const handleChange = e => {
    setText(e.target.value)
    const el = e.target; el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 130) + "px"
  }

  const addFiles = useCallback(async files => {
    const arr = Array.from(files)
    if (!arr.length) return
    const items = await Promise.all(arr.map(fileToMediaItem))
    setMediaItems(prev => [...prev, ...items])
  }, [])

  useEffect(() => {
    const handlePaste = async e => {
      const items = e.clipboardData?.items
      if (!items) return
      const files = []
      for (const item of items) {
        if (item.kind === "file") { const f = item.getAsFile(); if (f) files.push(f) }
      }
      if (files.length) { e.preventDefault(); await addFiles(files) }
    }
    window.addEventListener("paste", handlePaste)
    return () => window.removeEventListener("paste", handlePaste)
  }, [addFiles])

  const onDragOver  = useCallback(e => { e.preventDefault(); setIsDragOver(true) }, [])
  const onDragLeave = useCallback(e => {
    if (!wrapRef.current?.contains(e.relatedTarget)) setIsDragOver(false)
  }, [])
  const onDrop = useCallback(async e => {
    e.preventDefault(); setIsDragOver(false)
    if (e.dataTransfer.files.length) await addFiles(e.dataTransfer.files)
  }, [addFiles])

  const removeMedia    = useCallback(i => setMediaItems(p => p.filter((_, idx) => idx !== i)), [])
  const updateCaption  = useCallback((i, cap) => setMediaItems(p => p.map((m, idx) => idx === i ? { ...m, caption: cap } : m)), [])
  const openFilePicker = useCallback(() => fileRef.current?.click(), [])

  const handleAttachSelect = useCallback(async (item) => {
    if (item.id === "media") {
      fileRef.current?.click()
    } else if (item.id === "audio") {
      const inp = document.createElement("input")
      inp.type = "file"; inp.accept = "audio/*"; inp.multiple = true
      inp.onchange = async e => { if (e.target.files?.length) await addFiles(e.target.files) }
      inp.click()
    } else if (item.id === "sticker") {
      setStickerOpen(true)
    } else if (window.api?.openAttachMenu) {
      window.api.openAttachMenu({ type: item.id, jid: chatJid })
    }
  }, [addFiles, chatJid])

  // ── Send sticker ──────────────────────────────────────────────────────────
  // Yumi reference:
  //   dims.sendImageAsSticker(jid, path, m, { packname, author })
  //   → writeExifImg(buff) → sock.sendMessage(jid, { sticker: { url: buffer } }, { quoted })
  //
  // Aurora equivalent (client.js):
  //   sendSticker(jid, Buffer, quotedWAMsg)
  //   → sock.sendMessage(jid, { sticker: buf }, quoted ? { quoted } : {})
  //
  // IPC chain: sticker:send → fs.readFileSync(absPath) → sendSticker(jid, buf, quoted)
  const sendSticker = useCallback(async (sticker) => {
    if (!chatJid || sending) return
    setSending(true)
    try {
      const res = await window.api?.sendSticker?.({
        jid:         chatJid,
        absPath:     sticker.absPath,
        quotedMsgId: replyTo?.id || null,
      })
      if (res?.ok) {
        appendMessage(chatJid, {
          id:               res.id || "sticker-" + Date.now(),
          chat_jid:         chatJid,
          body:             "",
          msg_type:         "stickerMessage",
          has_media:        1,
          media_saved_path: sticker.absPath,
          timestamp:        Math.floor(Date.now() / 1000),
          from_me:          1,
          status:           1,
          quoted_id:        replyTo?.id           || null,
          quoted_body:      replyTo?.body         || null,
          quoted_sender:    replyTo?.sender_name  || replyTo?.sender_jid || null,
          quoted_type:      replyTo?.msg_type     || null,
          quoted_has_media: replyTo?.has_media    || 0,
        })
        onCancelReply?.()
      }
    } catch (e) { console.error("Send sticker error:", e) }
    finally { setSending(false) }
  }, [chatJid, sending, replyTo, appendMessage, onCancelReply])

  const sendText = useCallback(async () => {
    const body = text.trim()
    if (!body || sending) return
    const quotedMsg = replyTo || null
    setText(""); if (ref.current) ref.current.style.height = "42px"
    setSending(true); onCancelReply?.()
    try {
      if (window.api?.sendMessage) {
        const res = await window.api.sendMessage({ jid: chatJid, body, quotedMsgId: quotedMsg?.id || null })
        if (res?.ok) {
          const msgId = res.message?.key?.id ?? res.message?.id ?? "local-" + Date.now()
          appendMessage(chatJid, {
            id: msgId, chat_jid: chatJid, body, msg_type: "conversation",
            timestamp: Math.floor(Date.now() / 1000), from_me: 1, status: 1,
            quoted_id: quotedMsg?.id || null, quoted_body: quotedMsg?.body || null,
            quoted_sender: quotedMsg?.sender_name || quotedMsg?.sender_jid || null,
            quoted_type: quotedMsg?.msg_type || null, quoted_has_media: quotedMsg?.has_media || 0,
          })
        }
      } else {
        appendMessage(chatJid, {
          id: "dev-" + Date.now(), chat_jid: chatJid, body, msg_type: "conversation",
          timestamp: Math.floor(Date.now() / 1000), from_me: 1, status: 1,
        })
      }
    } catch (e) { console.error("Send error:", e) }
    finally { setSending(false); ref.current?.focus() }
  }, [text, chatJid, sending, replyTo, onCancelReply, appendMessage])

  const sendMedia = useCallback(async () => {
    if (!mediaItems.length || sending) return
    const quotedMsg = replyTo || null
    setSending(true); onCancelReply?.()
    try {
      if (window.api?.sendMedia) {
        const res = await window.api.sendMedia({ jid: chatJid, items: mediaItems, quotedMsgId: quotedMsg?.id || null })
        const results = res?.results || []
        const now = Math.floor(Date.now() / 1000)
        mediaItems.forEach((item, idx) => {
          const msgId  = results[idx]?.id || ("local-media-" + Date.now() + "-" + idx)
          const isGif  = item.isGif || item.mimeType === "image/gif"
          const isVid  = !isGif && item.mimeType?.startsWith("video/")
          appendMessage(chatJid, {
            id: msgId, chat_jid: chatJid, body: item.caption || "",
            msg_type: (isGif || isVid) ? "videoMessage" : "imageMessage",
            has_media: 1, mimetype: isGif ? "video/mp4" : (item.mimeType || null),
            media_saved_path: null,
            media_thumbnail_b64: isGif || isVid ? null : item.dataUrl,
            is_gif: isGif ? 1 : 0, timestamp: now + idx, from_me: 1, status: 1,
            quoted_id: idx === 0 ? (quotedMsg?.id || null) : null,
            quoted_body: idx === 0 ? (quotedMsg?.body || null) : null,
            quoted_sender: idx === 0 ? (quotedMsg?.sender_name || quotedMsg?.sender_jid || null) : null,
            quoted_type: idx === 0 ? (quotedMsg?.msg_type || null) : null,
            quoted_has_media: idx === 0 ? (quotedMsg?.has_media || 0) : 0,
          })
        })
      }
      setMediaItems([])
      if (text.trim() && window.api?.sendMessage) {
        await window.api.sendMessage({ jid: chatJid, body: text.trim() })
        setText(""); if (ref.current) ref.current.style.height = "42px"
      }
    } catch (e) { console.error("Send media error:", e) }
    finally { setSending(false); ref.current?.focus() }
  }, [mediaItems, chatJid, sending, replyTo, onCancelReply, text, appendMessage])

  const send = useCallback(() => {
    if (hasMedia) return sendMedia()
    if (hasText)  return sendText()
  }, [hasMedia, hasText, sendMedia, sendText])

  return (
    <div ref={wrapRef} className="input-area-wrap" style={{ position: "relative" }}
      onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>

      {isDragOver && <DragOverlay />}
      <ReplyPreviewBar replyTo={replyTo} onCancel={onCancelReply} chatName={chatName} />
      {hasMedia && (
        <MediaPreviewStrip items={mediaItems} onRemove={removeMedia}
          onCaptionChange={updateCaption} onAddMore={openFilePicker} />
      )}

      <AttachMenu open={attachOpen} onClose={() => setAttachOpen(false)} onSelect={handleAttachSelect} />

      <StickerPanel
        open={stickerOpen}
        onClose={() => setStickerOpen(false)}
        chatJid={chatJid}
        replyTo={replyTo}
        onSend={sendSticker}
      />

      <div className="input-area">
        <button
          className={`input-action-btn input-plus-btn ${attachOpen ? "active" : ""}`}
          title="Lampiran"
          onClick={() => { setAttachOpen(v => !v); setStickerOpen(false) }}
        >
          <span className={`plus-icon-wrap ${attachOpen ? "rotated" : ""}`}><PlusIcon /></span>
        </button>

        <button className="input-action-btn" title="Emoji"
          onClick={() => {
            ref.current?.focus()
            if (window.api?.openEmojiPicker) window.api.openEmojiPicker()
            else if (window.api?.triggerEmojiPicker) window.api.triggerEmojiPicker()
          }}>
          <EmojiIcon />
        </button>

        <input ref={fileRef} type="file" multiple
          accept="image/*,video/*,application/pdf,application/zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
          style={{ display: "none" }}
          onChange={async e => { if (e.target.files?.length) await addFiles(e.target.files); e.target.value = "" }}
        />

        <textarea ref={ref} className="msg-textarea" rows={1} value={text}
          onChange={handleChange}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder={replyTo ? "Ketik balasan..." : hasMedia ? "Keterangan tambahan (opsional)..." : "Type a message"}
          disabled={sending}
        />

        <button
          className={`input-action-btn input-sticker-btn ${stickerOpen ? "active" : ""}`}
          title="Stiker"
          onClick={() => { setStickerOpen(v => !v); setAttachOpen(false) }}
        >
          <StickerIcon />
        </button>

        {canSend ? (
          <button className="send-btn" onClick={send} disabled={sending} title="Kirim">
            {sending ? <span className="spinner spinner-black spinner-sm" /> : <SendIcon />}
          </button>
        ) : (
          <button className="input-action-btn" title="Rekam Suara"><MicIcon /></button>
        )}
      </div>
    </div>
  )
}