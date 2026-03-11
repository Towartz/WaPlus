// src/components/MediaViewer.jsx
// ═══════════════════════════════════════════════════════════════════════════
// AuroraChat — Media Viewer Dialog
// Full-featured media viewer for images, videos, and WhatsApp albums.
//
// FIXED: Sub-components extracted to MODULE LEVEL so React never unmounts them
//        on parent re-render (was causing mute state reset on Linux).
// FIXED: Video mute controlled imperatively via useEffect + onVolumeChange
//        to survive Chromium's autoplay-policy DOM overrides on Linux.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useRef } from "react"
import { createPortal } from "react-dom"
import { useAppStore } from "../store/app"

// ── Icons ─────────────────────────────────────────────────────────────────
function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
function DownloadIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
function ChevronLeft() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}
function ChevronRight() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

// ── Download helper ──────────────────────────────────────────────────────
function downloadMedia(item) {
  if (!item?.src) return
  if (window.api?.saveMedia) {
    window.api.saveMedia({ src: item.src, filename: item.filename || "media" })
    return
  }
  const a = document.createElement("a")
  a.href = item.src
  a.download = item.filename || (item.type === "video" ? "video.mp4" : "image.jpg")
  a.click()
}

// ════════════════════════════════════════════════════════════════════════════
// IMAGE DISPLAY — module-level so React identity is stable across re-renders.
// Putting this inside MediaViewer's render body would create a NEW component
// type on every render, causing React to unmount + remount and lose all state.
// ════════════════════════════════════════════════════════════════════════════
function ImageDisplay({ src, caption }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const imgRef = useRef(null)
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 })

  const doZoom = useCallback((delta) => {
    setZoom(z => {
      const next = Math.min(5, Math.max(1, z + delta))
      if (next === 1) setPan({ x: 0, y: 0 })
      return next
    })
  }, [])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    doZoom(e.deltaY < 0 ? 0.3 : -0.3)
  }, [doZoom])

  const handleDoubleClick = useCallback(() => {
    setZoom(z => {
      const next = z === 1 ? 2.5 : 1
      if (next === 1) setPan({ x: 0, y: 0 })
      return next
    })
  }, [])

  const handleMouseDown = useCallback((e) => {
    if (zoom <= 1) return
    dragging.current = true
    dragStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
    e.preventDefault()
  }, [zoom, pan])

  const handleMouseMove = useCallback((e) => {
    if (!dragging.current) return
    setPan({
      x: dragStart.current.px + (e.clientX - dragStart.current.x),
      y: dragStart.current.py + (e.clientY - dragStart.current.y),
    })
  }, [])

  const handleMouseUp = useCallback(() => { dragging.current = false }, [])

  useEffect(() => {
    setLoaded(false)
    setError(false)
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [src])

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: "rgba(255,255,255,0.5)" }}>
        <span style={{ fontSize: 48 }}>🖼️</span>
        <span style={{ fontSize: 13 }}>Gagal memuat gambar</span>
      </div>
    )
  }

  return (
    <div
      style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", overflow: "hidden" }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {!loaded && (
        <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div className="spinner" style={{ width: 36, height: 36, borderTopColor: "var(--green)", borderColor: "rgba(37,211,102,.2)" }} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Memuat...</span>
        </div>
      )}
      <img
        ref={imgRef}
        src={src}
        alt={caption || "Foto"}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        onDoubleClick={handleDoubleClick}
        draggable={false}
        style={{
          maxWidth: "88vw", maxHeight: "78vh",
          objectFit: "contain",
          transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
          transition: dragging.current ? "none" : "transform 0.2s ease",
          transformOrigin: "center center",
          cursor: zoom > 1 ? (dragging.current ? "grabbing" : "grab") : "zoom-in",
          opacity: loaded ? 1 : 0,
          userSelect: "none",
          borderRadius: 6,
        }}
      />
      {zoom > 1 && (
        <div style={{
          position: "absolute", bottom: 12, right: 12,
          background: "rgba(0,0,0,0.6)", borderRadius: 8, padding: "3px 8px",
          fontSize: 12, color: "rgba(255,255,255,0.7)", pointerEvents: "none",
        }}>
          {Math.round(zoom * 100)}%
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// VIDEO DISPLAY — Full Custom Controls
//
// BUG FIX (Linux / Electron / Chromium autoplay policy):
//   React's `muted={muted}` JSX prop calls setAttribute("muted", ...) which is
//   unreliable — Chromium uses the IDL attribute (.muted property), not the
//   HTML content attribute. Additionally, autoplay policy on Linux can force-mute
//   the video element WITHOUT updating React state, creating a desync.
//
//   Fix 1: Remove `muted={muted}` from JSX entirely.
//   Fix 2: useEffect imperatively sets videoRef.current.muted = muted whenever
//           React muted state changes — bypasses React's attribute reconciler.
//   Fix 3: onVolumeChange syncs DOM → React when the browser mutates muted/volume
//           (autoplay policy, user OS media keys, etc.).
// ════════════════════════════════════════════════════════════════════════════
function VideoDisplay({ src }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [buffering, setBuffering] = useState(false)
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const rafRef = useRef(null)
  const hideTimer = useRef(null)

  useEffect(() => { setReady(false); setError(false); setPlaying(false); setProgress(0); setElapsed(0) }, [src])

  // [FIX-MUTE-LINUX] Imperatively sync muted state → DOM property.
  // React's setAttribute("muted") is ignored by Chromium's IDL — must use .muted directly.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = muted
    // Also sync volume slider so it doesn't show 0 when just muted
    if (!muted && v.volume === 0) v.volume = volume > 0 ? volume : 1
  }, [muted, volume])

  // [FIX-MUTE-LINUX] Sync DOM → React when browser auto-mutates (autoplay policy,
  // OS media keys, fullscreen change, etc.). Without this the button icon desynchs.
  const handleVolumeChange = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    setMuted(v.muted)
    if (!v.muted && v.volume > 0) setVolume(v.volume)
  }, [])

  // Auto-hide controls
  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      if (playing) setShowControls(false)
    }, 2800)
  }, [playing])

  useEffect(() => { return () => { if (hideTimer.current) clearTimeout(hideTimer.current) } }, [])

  const startRaf = useCallback(() => {
    const tick = () => {
      const v = videoRef.current
      if (!v) return
      setElapsed(v.currentTime)
      setProgress(v.currentTime / (v.duration || 1))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [])
  const stopRaf = useCallback(() => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  const togglePlay = useCallback(() => {
    const v = videoRef.current; if (!v) return
    if (playing) { v.pause(); stopRaf(); setPlaying(false) }
    else { v.play().then(() => { setPlaying(true); startRaf() }).catch(() => {}) }
    resetHideTimer()
  }, [playing, startRaf, stopRaf, resetHideTimer])

  const handleEnded = useCallback(() => {
    setPlaying(false); setProgress(0); setElapsed(0); stopRaf()
    const v = videoRef.current; if (v) v.currentTime = 0
  }, [stopRaf])

  const handleSeek = useCallback((e) => {
    const bar = e.currentTarget
    const rect = bar.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const v = videoRef.current; if (!v?.duration) return
    v.currentTime = frac * v.duration
    setProgress(frac); setElapsed(v.currentTime)
    resetHideTimer()
  }, [resetHideTimer])

  const handleVolumeSlider = useCallback((e) => {
    const v = parseFloat(e.target.value)
    setVolume(v)
    const nextMuted = v === 0
    setMuted(nextMuted)
    if (videoRef.current) {
      videoRef.current.volume = v
      videoRef.current.muted = nextMuted
    }
  }, [])

  const toggleMute = useCallback(() => {
    // Just flip React state — the useEffect above will imperatively apply to DOM
    setMuted(prev => {
      const next = !prev
      const v = videoRef.current
      if (v) {
        v.muted = next
        // Restore volume if unmuting from 0
        if (!next && v.volume === 0) { v.volume = volume > 0 ? volume : 1 }
      }
      return next
    })
  }, [volume])

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current; if (!el) return
    if (!document.fullscreenElement) { el.requestFullscreen?.(); setFullscreen(true) }
    else { document.exitFullscreen?.(); setFullscreen(false) }
  }, [])

  const skip = useCallback((sec) => {
    const v = videoRef.current; if (!v) return
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + sec))
    resetHideTimer()
  }, [resetHideTimer])

  const fmtTime = (s) => {
    if (!s || isNaN(s)) return "0:00"
    const m = Math.floor(s / 60), ss = Math.floor(s % 60)
    return `${m}:${ss.toString().padStart(2, "0")}`
  }

  if (error) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: "rgba(255,255,255,0.5)" }}>
      <span style={{ fontSize: 48 }}>🎬</span>
      <span style={{ fontSize: 13 }}>Gagal memuat video</span>
    </div>
  )

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", background: "#000", cursor: showControls ? "default" : "none" }}
      onMouseMove={resetHideTimer}
      onClick={togglePlay}
    >
      {/* Loading spinner */}
      {(!ready || buffering) && (
        <div style={{ position: "absolute", zIndex: 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, pointerEvents: "none" }}>
          <div className="spinner" style={{ width: 40, height: 40, borderTopColor: "var(--green)", borderColor: "rgba(37,211,102,.2)" }} />
          {!ready && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Memuat video...</span>}
        </div>
      )}

      {/* [FIX] No muted={muted} prop — controlled imperatively via useEffect above */}
      <video
        ref={videoRef}
        src={src}
        preload="auto"
        onCanPlay={() => { setReady(true); setBuffering(false) }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration || 0)}
        onEnded={handleEnded}
        onError={() => setError(true)}
        onVolumeChange={handleVolumeChange}
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: "88vw", maxHeight: "78vh", borderRadius: 4, outline: "none", opacity: ready ? 1 : 0, transition: "opacity 0.2s", display: "block" }}
      />

      {/* Big play/pause center overlay */}
      {ready && !playing && !buffering && (
        <div style={{ position: "absolute", pointerEvents: "none", zIndex: 3, width: 72, height: 72, borderRadius: "50%", background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(6px)", border: "2px solid rgba(255,255,255,0.3)" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><polygon points="8,5 20,12 8,19" /></svg>
        </div>
      )}

      {/* Controls overlay */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 5,
          background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
          padding: "32px 16px 12px",
          opacity: showControls ? 1 : 0,
          transition: "opacity 0.25s",
          pointerEvents: showControls ? "auto" : "none",
        }}
      >
        {/* Progress bar */}
        <div
          onClick={handleSeek}
          style={{ width: "100%", height: 4, background: "rgba(255,255,255,0.2)", borderRadius: 2, cursor: "pointer", marginBottom: 10, position: "relative" }}
        >
          <div style={{ width: `${progress * 100}%`, height: "100%", background: "var(--green)", borderRadius: 2, position: "relative", transition: "width 0.1s linear" }}>
            <div style={{ position: "absolute", right: -6, top: -5, width: 14, height: 14, borderRadius: "50%", background: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.5)" }} />
          </div>
        </div>

        {/* Bottom controls row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Play/Pause */}
          <button onClick={togglePlay} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}>
            {playing
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
            }
          </button>
          {/* Skip -10 */}
          <button onClick={() => skip(-10)} title="-10s" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 11, padding: 4 }}>-10s</button>
          {/* Skip +10 */}
          <button onClick={() => skip(10)} title="+10s" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 11, padding: 4 }}>+10s</button>

          {/* Time */}
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", minWidth: 80 }}>{fmtTime(elapsed)} / {fmtTime(duration)}</span>

          <div style={{ flex: 1 }} />

          {/* Mute toggle + volume slider */}
          <button onClick={toggleMute} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4, display: "flex" }}>
            {muted || volume === 0
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
            }
          </button>
          <input type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} onChange={handleVolumeSlider}
            style={{ width: 70, accentColor: "var(--green)", cursor: "pointer" }} />

          {/* Fullscreen */}
          <button onClick={toggleFullscreen} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4, display: "flex" }}>
            {fullscreen
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// THUMBNAIL STRIP — module-level with explicit props (no closure dependency)
// ════════════════════════════════════════════════════════════════════════════
function ThumbnailStrip({ items, resolvedItems, index, openMedia, setCurrentZoom }) {
  const stripRef = useRef(null)

  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    const thumb = el.children[index]
    if (thumb) thumb.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" })
  }, [index])

  return (
    <div
      ref={stripRef}
      style={{
        display: "flex", gap: 6, padding: "10px 16px",
        justifyContent: "center", overflowX: "auto",
        scrollbarWidth: "none",
        maxWidth: "100vw",
      }}
      className="thumb-strip"
    >
      {items.map((item, i) => {
        const rItem = resolvedItems[i]
        return (
        <div
          key={i}
          onClick={() => { setCurrentZoom(1); openMedia(items, i) }}
          style={{
            width: 52, height: 52, flexShrink: 0,
            borderRadius: 6, overflow: "hidden",
            cursor: "pointer",
            border: i === index ? "2.5px solid var(--green)" : "2.5px solid rgba(255,255,255,0.1)",
            transition: "border-color 0.15s, transform 0.1s",
            transform: i === index ? "scale(1.05)" : "scale(1)",
            background: "#1a1a1a",
          }}
        >
          {rItem.type === "image" && rItem.src ? (
            <img src={rItem.src} alt={`Slide ${i + 1}`}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : rItem.thumbnailSrc ? (
            <img src={rItem.thumbnailSrc} alt={`Slide ${i + 1}`}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "blur(3px)" }} />
          ) : rItem.type === "video" ? (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#222" }}>
              <span style={{ fontSize: 20 }}>🎬</span>
            </div>
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1a1a1a" }}>
              <DownloadIcon />
            </div>
          )}
        </div>
      )})}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// MAIN MEDIA VIEWER
// ════════════════════════════════════════════════════════════
export default function MediaViewer() {
  // ✅ ALL hooks unconditionally — before any conditional return
  const { mediaViewer, closeMedia, openMedia } = useAppStore()
  const [currentZoom, setCurrentZoom] = useState(1)
  const [sliding, setSliding] = useState(false)
  const [dlState, setDlState] = useState({})
  const [srcOverride, setSrcOverride] = useState({})

  const items = mediaViewer?.items || []
  const index = mediaViewer?.index || 0
  const current = items[index] || null
  const isAlbum = items.length > 1
  const canPrev = index > 0
  const canNext = index < items.length - 1

  const resolvedItems = items.map(item => ({
    ...item,
    src: srcOverride[item.msgId] || item.src || null,
  }))
  const resolvedCurrent = resolvedItems[index] || null

  useEffect(() => {
    if (!window.api?.onMediaUpdated) return
    const unsub = window.api.onMediaUpdated?.((payload) => {
      if (!payload?.id || !payload?.media_saved_path) return
      let p = payload.media_saved_path.replace(/\\/g, "/")
      if (p.startsWith("media://")) { /* already correct */ }
      else if (/^[A-Za-z]:\//.test(p)) p = `media:///${p}`
      else { const w = p.startsWith("/") ? p : `/${p}`; p = `media://${w}` }
      setSrcOverride(prev => ({ ...prev, [payload.id]: p }))
      setDlState(prev => ({ ...prev, [payload.id]: null }))
    })
    return () => { try { unsub?.() } catch (_) {} }
  }, [])

  const handleViewerDownload = useCallback(async (item) => {
    if (!item?.msgId || dlState[item.msgId] === "pending") return
    setDlState(prev => ({ ...prev, [item.msgId]: "pending" }))
    try {
      const res = await window.api?.mediaTriggerDownload?.({ msgId: item.msgId })
      if (res?.ok === false) {
        setDlState(prev => ({ ...prev, [item.msgId]: "failed" }))
      }
    } catch (_) {
      setDlState(prev => ({ ...prev, [item.msgId]: "failed" }))
    }
  }, [dlState])

  const navigate = useCallback((dir) => {
    if (sliding) return
    const next = index + dir
    if (next < 0 || next >= items.length) return
    setSliding(true)
    setCurrentZoom(1)
    setTimeout(() => {
      openMedia(items, next)
      setSliding(false)
    }, 80)
  }, [sliding, index, items, openMedia])

  const handleKeyDown = useCallback((e) => {
    if (e.key === "Escape") { closeMedia(); return }
    if (e.key === "ArrowLeft") { navigate(-1); return }
    if (e.key === "ArrowRight") { navigate(1); return }
  }, [navigate, closeMedia])

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  useEffect(() => {
    if (!mediaViewer) { document.body.style.overflow = ""; return }
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [mediaViewer])

  useEffect(() => { setCurrentZoom(1) }, [index])

  // ✅ Conditional return ONLY after all hooks
  if (!mediaViewer) return null

  // ── Button style helpers ─────────────────────────────────────────────────
  const topBtnStyle = {
    background: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "50%",
    width: 36, height: 36,
    color: "#fff",
    cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "background 0.15s, transform 0.1s",
    flexShrink: 0,
  }

  const navBtnStyle = {
    position: "absolute",
    top: "50%", transform: "translateY(-50%)",
    background: "rgba(0,0,0,0.45)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "50%",
    width: 48, height: 48,
    color: "#fff",
    cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "background 0.15s, transform 0.12s",
    zIndex: 10,
    backdropFilter: "blur(4px)",
  }

  const topBtn = (onClick, title, children) => (
    <button
      onClick={onClick}
      title={title}
      style={topBtnStyle}
      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.22)"}
      onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
    >
      {children}
    </button>
  )

  // ── Render ──
  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(8,8,8,0.97)",
        display: "flex", flexDirection: "column",
        animation: "mediaViewerIn 0.18s ease",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) closeMedia() }}
    >
      <style>{`
        @keyframes mediaViewerIn { from { opacity: 0 } to { opacity: 1 } }
        .thumb-strip::-webkit-scrollbar { display: none }
      `}</style>

      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px",
        background: "linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)",
        flexShrink: 0,
      }}>
        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 500, minWidth: 60 }}>
          {isAlbum && `${index + 1} / ${items.length}`}
        </div>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, letterSpacing: 0.5 }}>
          {current?.type === "video" ? "Video" : isAlbum ? "Album" : "Foto"}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {current?.type !== "video" && currentZoom > 1 && (
            topBtn(() => setCurrentZoom(1), "Reset zoom", <span style={{ fontSize: 12, fontWeight: 600 }}>1:1</span>)
          )}
          {resolvedCurrent?.src
            ? topBtn(() => downloadMedia(resolvedCurrent), "Unduh media", <DownloadIcon />)
            : resolvedCurrent?.msgId
              ? topBtn(
                  () => handleViewerDownload(resolvedCurrent),
                  "Unduh media",
                  dlState[resolvedCurrent.msgId] === "pending"
                    ? <span className="spinner spinner-sm" style={{ borderTopColor: "#fff", borderColor: "rgba(255,255,255,.3)", width: 15, height: 15 }} />
                    : <DownloadIcon />
                )
              : null
          }
          {topBtn(closeMedia, "Tutup (Esc)", <CloseIcon />)}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0, overflow: "hidden" }}>
        {isAlbum && canPrev && (
          <button onClick={(e) => { e.stopPropagation(); navigate(-1) }} style={{ ...navBtnStyle, left: 14 }}>
            <ChevronLeft />
          </button>
        )}

        <div style={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: sliding ? 0 : 1,
          transition: "opacity 0.08s",
        }}>
          {resolvedCurrent?.type === "video" && resolvedCurrent?.src ? (
            <VideoDisplay src={resolvedCurrent.src} />
          ) : resolvedCurrent?.src ? (
            <ImageDisplay src={resolvedCurrent.src} caption={resolvedCurrent.caption} />
          ) : dlState[resolvedCurrent?.msgId] === "pending" ? (
            <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, width: "100%", height: "100%", justifyContent: "center" }}>
              {resolvedCurrent?.thumbnailSrc && (
                <img src={resolvedCurrent.thumbnailSrc} alt="" draggable={false}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(20px)", transform: "scale(1.1)", opacity: 0.3, pointerEvents: "none" }} />
              )}
              <div className="spinner" style={{ width: 44, height: 44, borderTopColor: "var(--green)", borderColor: "rgba(37,211,102,.2)", position: "relative" }} />
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", position: "relative" }}>Mengunduh media...</span>
            </div>
          ) : dlState[resolvedCurrent?.msgId] === "failed" ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 48 }}>⚠️</span>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>Gagal mengunduh media</span>
              <button
                onClick={() => handleViewerDownload(resolvedCurrent)}
                style={{ padding: "8px 20px", borderRadius: 20, background: "rgba(37,211,102,0.85)", border: "none", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500 }}
              >Coba lagi</button>
            </div>
          ) : resolvedCurrent?.msgId ? (
            <div
              onClick={() => handleViewerDownload(resolvedCurrent)}
              style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, cursor: "pointer", width: "100%", height: "100%", justifyContent: "center" }}
            >
              {resolvedCurrent?.thumbnailSrc && (
                <img src={resolvedCurrent.thumbnailSrc} alt="" draggable={false}
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "blur(22px)", transform: "scale(1.1)", opacity: 0.28, pointerEvents: "none" }} />
              )}
              <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(37,211,102,0.85)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}>
                  <DownloadIcon />
                </div>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)" }}>Klik untuk unduh media</span>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, color: "rgba(255,255,255,0.4)" }}>
              <div className="spinner" style={{ width: 36, height: 36, borderTopColor: "var(--green)", borderColor: "rgba(37,211,102,.2)" }} />
              <span style={{ fontSize: 12 }}>Memuat...</span>
            </div>
          )}
        </div>

        {isAlbum && canNext && (
          <button onClick={(e) => { e.stopPropagation(); navigate(1) }} style={{ ...navBtnStyle, right: 14 }}>
            <ChevronRight />
          </button>
        )}
      </div>

      {/* Caption */}
      {resolvedCurrent?.caption && (
        <div style={{
          padding: "10px 24px 4px",
          color: "rgba(255,255,255,0.75)",
          fontSize: 13, textAlign: "center", lineHeight: 1.5,
          textShadow: "0 1px 4px rgba(0,0,0,0.8)",
          flexShrink: 0,
        }}>
          {resolvedCurrent.caption}
        </div>
      )}

      {/* Thumbnail strip */}
      {isAlbum && (
        <div style={{ flexShrink: 0, paddingBottom: 6 }}>
          <ThumbnailStrip
            items={items}
            resolvedItems={resolvedItems}
            index={index}
            openMedia={openMedia}
            setCurrentZoom={setCurrentZoom}
          />
        </div>
      )}

      {/* Keyboard hint */}
      <div style={{ textAlign: "center", padding: isAlbum ? "4px 0 8px" : "6px 0 10px", fontSize: 11, color: "rgba(255,255,255,0.2)", flexShrink: 0 }}>
        {isAlbum ? "← → untuk navigasi · Esc untuk tutup" : "Esc untuk tutup"}
      </div>
    </div>,
    document.body
  )
}
