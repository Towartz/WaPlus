// src/components/ProfilePanel.jsx
// ═══════════════════════════════════════════════════════════════════════════
// Profile panel — click avatar in Sidebar to open.
// Features:
//   • Edit display name (updateProfileName via IPC)
//   • Change / remove profile picture
//     ─ Picker: View / Upload / Remove
//     ─ Crop mode (circular crop, drag + zoom) OR Full image mode
//   • Masked phone number (+62 831-****-8175) with click-to-reveal
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useRef, useCallback, useEffect } from "react"
import { useAuthStore } from "../store/auth"
import { invalidateSelfPicCache } from "./Sidebar"

// ── Helpers ───────────────────────────────────────────────────────────────
const COLORS = [
  ["#0d3320","#22c55e"], ["#0d1f3c","#3b82f6"], ["#1e0a2e","#a855f7"],
  ["#2d0a0a","#ef4444"], ["#2d1500","#f97316"], ["#0a2010","#16a34a"],
  ["#021a1a","#06b6d4"], ["#160d30","#8b5cf6"], ["#0a1e20","#14b8a6"],
  ["#2d0a1a","#ec4899"],
]
function getColorPair(s) {
  if (!s) return COLORS[0]
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return COLORS[Math.abs(h) % COLORS.length]
}
function initials(n) {
  if (!n) return "?"
  return n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase()
}

function maskPhone(phone) {
  if (!phone) return ""
  const digits = phone.replace(/\D/g, "")
  if (digits.length < 6) return "••••••"
  const ccLen = digits.length >= 11 ? 2 : 1
  const cc = digits.slice(0, ccLen)
  const last2 = digits.slice(-2)
  const hiddenCount = digits.length - ccLen - 2
  const hidden = "•".repeat(Math.max(hiddenCount, 4))
  return `+${cc} ${hidden}${last2}`
}

function revealPhone(phone) {
  if (!phone) return ""
  const digits = phone.replace(/\D/g, "")
  if (!digits) return phone
  return "+" + digits
}

// ── ImageCropper ──────────────────────────────────────────────────────────
function ImageCropper({ src, onConfirm, onReupload }) {
  const canvasRef = useRef(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const lastPos = useRef(null)
  const imgRef = useRef(null)
  const [imgLoaded, setImgLoaded] = useState(false)

  useEffect(() => {
    const img = new Image()
    img.onload = () => { imgRef.current = img; setImgLoaded(true) }
    img.src = src
  }, [src])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !imgRef.current) return
    const ctx = canvas.getContext("2d")
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)
    const img = imgRef.current
    const iw = img.naturalWidth * scale
    const ih = img.naturalHeight * scale
    const cx = W / 2 + offset.x
    const cy = H / 2 + offset.y
    ctx.drawImage(img, cx - iw / 2, cy - ih / 2, iw, ih)
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, W, H)
    ctx.arc(W / 2, H / 2, Math.min(W, H) / 2 - 2, 0, Math.PI * 2, true)
    ctx.fillStyle = "rgba(10,10,15,0.75)"
    ctx.fill()
    ctx.restore()
    ctx.beginPath()
    ctx.arc(W / 2, H / 2, Math.min(W, H) / 2 - 2, 0, Math.PI * 2)
    ctx.strokeStyle = "rgba(255,255,255,0.15)"
    ctx.lineWidth = 1.5
    ctx.stroke()
  }, [scale, offset, imgLoaded])

  useEffect(() => { draw() }, [draw])

  const onMouseDown = e => { dragging.current = true; lastPos.current = { x: e.clientX, y: e.clientY } }
  const onMouseMove = e => {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setOffset(o => ({ x: o.x + dx, y: o.y + dy }))
  }
  const onMouseUp = () => { dragging.current = false }
  const handleWheel = e => {
    e.preventDefault()
    setScale(s => Math.max(0.3, Math.min(4, s - e.deltaY * 0.001)))
  }

  const cropAndConfirm = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !imgRef.current) return
    const size = 640
    const out = document.createElement("canvas")
    out.width = size; out.height = size
    const ctx = out.getContext("2d")
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.clip()
    const src = imgRef.current
    const iw = src.naturalWidth * scale
    const ih = src.naturalHeight * scale
    const W = canvas.width, H = canvas.height
    const cx = W / 2 + offset.x
    const cy = H / 2 + offset.y
    const radius = Math.min(W, H) / 2 - 2
    const factor = size / (radius * 2)
    const sx = (cx - iw / 2 - (W / 2 - radius)) * factor
    const sy = (cy - ih / 2 - (H / 2 - radius)) * factor
    ctx.drawImage(src, sx, sy, iw * factor, ih * factor)
    out.toBlob(blob => {
      if (!blob) return
      blob.arrayBuffer().then(ab => onConfirm(new Uint8Array(ab)))
    }, "image/jpeg", 0.9)
  }, [scale, offset, imgLoaded, onConfirm])

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
        <span style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: 0.3 }}>Drag to reposition · Scroll to zoom</span>
        <button onClick={onReupload} className="pp-ghost-btn" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Reupload
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={300} height={300}
        style={{ borderRadius: "50%", cursor: "grab", userSelect: "none", background: "#0a0a0f", display: "block" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={handleWheel}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => setScale(s => Math.max(0.3, s - 0.1))} className="pp-zoom-btn">−</button>
        <div style={{
          fontSize: 11, color: "var(--text-3)", minWidth: 44, textAlign: "center",
          background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "3px 0",
          fontFamily: "monospace", letterSpacing: 0.5,
        }}>
          {Math.round(scale * 100)}%
        </div>
        <button onClick={() => setScale(s => Math.min(4, s + 0.1))} className="pp-zoom-btn">+</button>
      </div>

      <button onClick={cropAndConfirm} className="pp-primary-btn" style={{ width: "100%" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Simpan Foto Profil
      </button>
    </div>
  )
}

// ── FullImageConfirm ──────────────────────────────────────────────────────
function FullImageConfirm({ src, onConfirm, onReupload }) {
  const handleConfirm = useCallback(() => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement("canvas")
      const max = 720
      let w = img.naturalWidth, h = img.naturalHeight
      if (w > max || h > max) {
        const ratio = Math.min(max / w, max / h)
        w = Math.round(w * ratio); h = Math.round(h * ratio)
      }
      canvas.width = w; canvas.height = h
      canvas.getContext("2d").drawImage(img, 0, 0, w, h)
      canvas.toBlob(blob => {
        if (!blob) return
        blob.arrayBuffer().then(ab => onConfirm(new Uint8Array(ab)))
      }, "image/jpeg", 0.9)
    }
    img.src = src
  }, [src, onConfirm])

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
        <span style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: 0.3 }}>Full image, no crop</span>
        <button onClick={onReupload} className="pp-ghost-btn" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Reupload
        </button>
      </div>
      <img src={src} alt="preview" style={{
        width: 260, height: 260, objectFit: "contain",
        borderRadius: 12, background: "#0a0a0f",
        border: "1px solid rgba(255,255,255,0.07)",
      }} />
      <button onClick={handleConfirm} className="pp-primary-btn" style={{ width: "100%" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Simpan Foto Profil
      </button>
    </div>
  )
}

// ── AvatarPickerMenu ──────────────────────────────────────────────────────
function AvatarPickerMenu({ picUrl, name, colorPair, onView, onUpload, onRemove }) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const menuRef = useRef(null)
  const [bg, accent] = colorPair
  // imgKey increments on every render so the <img> re-mounts when picUrl changes,
  // busting the browser's in-memory cache even if the URL string is identical.
  const imgKey = useRef(0)
  const prevPicUrl = useRef(picUrl)
  if (picUrl !== prevPicUrl.current) {
    imgKey.current += 1
    prevPicUrl.current = picUrl
  }

  useEffect(() => {
    if (!open) return
    const handler = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <div style={{ position: "relative" }} ref={menuRef}>
      <div
        onClick={() => setOpen(o => !o)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: "pointer", position: "relative", width: 88, height: 88 }}
        title="Change profile photo"
      >
        {picUrl ? (
          <img key={imgKey.current} src={picUrl} alt={name} style={{
            width: 88, height: 88, borderRadius: "50%", objectFit: "cover", display: "block",
            boxShadow: `0 0 0 2px ${open || hovered ? accent : "rgba(255,255,255,0.08)"}`,
            transition: "box-shadow 0.2s",
          }} />
        ) : (
          <div style={{
            width: 88, height: 88, borderRadius: "50%",
            background: `radial-gradient(135deg at 30% 30%, ${accent}40, ${bg})`,
            border: `2px solid ${open || hovered ? accent : "rgba(255,255,255,0.08)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, fontWeight: 700, color: accent, letterSpacing: 1,
            transition: "border-color 0.2s",
            fontFamily: "system-ui, sans-serif",
          }}>
            {initials(name)}
          </div>
        )}
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: "rgba(0,0,0,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: open || hovered ? 1 : 0,
          transition: "opacity 0.18s",
          backdropFilter: "blur(2px)",
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="3"/>
            <circle cx="12" cy="12" r="4"/>
            <circle cx="17.5" cy="6.5" r="1"/>
          </svg>
        </div>
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 10px)", left: "50%", transform: "translateX(-50%)",
          background: "var(--bg-panel)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 12, overflow: "hidden",
          boxShadow: "0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)",
          zIndex: 100, minWidth: 172,
          animation: "ppDropIn 0.15s cubic-bezier(0.34,1.56,0.64,1)",
        }}>
          {picUrl && <MenuItem icon={<IconEye />} label="Lihat foto" onClick={() => { setOpen(false); onView() }} />}
          <MenuItem icon={<IconUpload />} label="Upload foto" onClick={() => { setOpen(false); onUpload() }} />
          {picUrl && <MenuItem icon={<IconTrash />} label="Hapus foto" onClick={() => { setOpen(false); onRemove() }} danger />}
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon, label, onClick, danger }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "9px 14px", cursor: "pointer",
        background: hover
          ? danger ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.055)"
          : "transparent",
        color: danger ? "#f87171" : "var(--text-1)",
        fontSize: 13, transition: "background 0.12s",
        borderLeft: hover ? `2px solid ${danger ? "#ef4444" : "rgba(255,255,255,0.15)"}` : "2px solid transparent",
      }}
    >
      <span style={{ opacity: 0.7, display: "flex" }}>{icon}</span>
      {label}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────
const IconEye    = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
const IconUpload = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
const IconTrash  = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
const IconPencil = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
const IconCopy   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
const IconEye2   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
const IconCheck  = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>

// ── Section label ─────────────────────────────────────────────────────────
function FieldLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: "var(--text-3)",
      textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 7,
    }}>
      {children}
    </div>
  )
}

// ── Main ProfilePanel ─────────────────────────────────────────────────────
export default function ProfilePanel({ onClose }) {
  const { connectedUser } = useAuthStore()
  const name  = connectedUser?.name || connectedUser?.pushName || "Me"
  const jid   = connectedUser?.jid  || ""
  const phone = connectedUser?.phone || (jid ? jid.split("@")[0] : "")
  const colorPair = getColorPair(name)
  const [, accent] = colorPair

  const [picUrl, setPicUrl]         = useState(null)
  const [picLoading, setPicLoading] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal]         = useState(name)
  const [nameSaving, setNameSaving]   = useState(false)
  const [nameError, setNameError]     = useState("")
  const [phoneRevealed, setPhoneRevealed] = useState(false)
  const [pickerMode, setPickerMode]   = useState(null)
  const [pickerSrc, setPickerSrc]     = useState(null)
  const [useCrop, setUseCrop]         = useState(true)
  const [uploading, setUploading]     = useState(false)
  const [toast, setToast]             = useState(null)
  const [viewingPic, setViewingPic]   = useState(false)
  const [copied, setCopied]           = useState(false)
  const fileInputRef = useRef(null)

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2800)
  }

  useEffect(() => {
    if (!jid) { setPicLoading(false); return }
    window.api?.getProfilePic?.({ jid })
      .then(res => setPicUrl(res?.url || null))
      .catch(() => setPicUrl(null))
      .finally(() => setPicLoading(false))
  }, [jid])

  // Stay in sync with Sidebar's SelfAvatar — if the cache is invalidated from
  // any source (IPC push, remove, upload), reflect it here immediately.
  useEffect(() => {
    const onPicChanged = () => {
      // _selfPicCache is module-private in Sidebar; re-fetch local path ourselves
      window.api?.getOwnPic?.()
        .then(r => {
          if (r?.ok && r.path) setPicUrl(r.path + "?t=" + Date.now())
          // if no local path, leave current picUrl — avoid flickering to remote stale URL
        })
        .catch(() => {})
    }
    window.addEventListener("aurora:self-pic-changed", onPicChanged)
    return () => window.removeEventListener("aurora:self-pic-changed", onPicChanged)
  }, [])

  const handleSaveName = async () => {
    if (!nameVal.trim() || nameVal.trim() === name) { setEditingName(false); return }
    setNameSaving(true); setNameError("")
    try {
      const res = await window.api?.updateProfileName?.({ name: nameVal.trim() })
      if (res?.ok) {
        showToast("Name updated")
        setEditingName(false)
      } else {
        setNameError(res?.error || "Failed to save name")
      }
    } catch (e) {
      setNameError("Error: " + e.message)
    }
    setNameSaving(false)
  }

  const openFilePicker = () => fileInputRef.current?.click()

  const handleFileChange = e => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    const reader = new FileReader()
    reader.onload = ev => { setPickerSrc(ev.target.result); setPickerMode("picker") }
    reader.readAsDataURL(file)
  }

  const handleConfirmPic = async (uint8arr) => {
    setPickerMode(null); setPickerSrc(null)
    setUploading(true)
    try {
      const res = await window.api?.updateProfilePicture?.({ buffer: Array.from(uint8arr) })
      if (res?.ok) {
        showToast("Profile photo updated")
        // Prefer local file path (cache-busted) — same strategy as SelfAvatar in Sidebar.
        // Only fall back to remote getProfilePic if local path unavailable.
        let freshUrl = null
        try {
          const localRes = await window.api?.getOwnPic?.()
          if (localRes?.ok && localRes.path) {
            freshUrl = localRes.path + "?t=" + Date.now()
          }
        } catch (_) {}

        if (!freshUrl) {
          try {
            const r2 = await window.api?.getProfilePic?.({ jid })
            freshUrl = r2?.url || null
          } catch (_) {}
        }

        setPicUrl(freshUrl)
        invalidateSelfPicCache(freshUrl || "")
      } else {
        showToast(res?.error || "Upload failed", "err")
      }
    } catch (e) {
      showToast("Error: " + e.message, "err")
    }
    setUploading(false)
  }

  const handleRemovePic = async () => {
    if (!window.confirm("Remove profile photo?")) return
    setUploading(true)
    setPicUrl(null)
    invalidateSelfPicCache("")
    try {
      const res = await window.api?.removeProfilePicture?.()
      if (res?.ok) {
        showToast("Profile photo removed")
      } else {
        showToast(res?.error || "Remove failed", "err")
        try {
          const r2 = await window.api?.getProfilePic?.({ jid })
          const restored = r2?.url || null
          setPicUrl(restored)
          invalidateSelfPicCache(restored || "")
        } catch (_) {}
      }
    } catch (e) {
      showToast("Error: " + e.message, "err")
    }
    setUploading(false)
  }

  const handleCopyPhone = () => {
    const raw = phone.replace(/\D/g, "")
    navigator.clipboard?.writeText("+" + raw).then(() => {
      setCopied(true)
      showToast("Number copied")
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
    >
      <div style={{
        width: 400, borderRadius: 18,
        background: "var(--bg-panel)",
        border: "1px solid rgba(255,255,255,0.07)",
        boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03) inset",
        overflow: "hidden",
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        animation: "ppSlideIn 0.22s cubic-bezier(0.34,1.2,0.64,1)",
      }}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px 14px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: `${accent}18`,
              border: `1px solid ${accent}30`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", letterSpacing: -0.2 }}>Profile</span>
          </div>
          <button
            onClick={onClose}
            className="pp-close-btn"
            title="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 20px 18px", overflowY: "auto", flex: 1 }}>

          {/* Avatar section */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 22 }}>
            {pickerMode === "picker" && pickerSrc ? (
              <div style={{ width: "100%" }}>
                {/* Crop / Full toggle */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  marginBottom: 16,
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 10, padding: 4,
                }}>
                  {[{ label: "Crop Circle", val: true }, { label: "Full Image", val: false }].map(({ label, val }) => (
                    <button
                      key={String(val)}
                      onClick={() => setUseCrop(val)}
                      style={{
                        flex: 1, padding: "5px 0", borderRadius: 7, fontSize: 12, cursor: "pointer",
                        border: "none",
                        background: useCrop === val ? accent : "transparent",
                        color: useCrop === val ? "#fff" : "var(--text-3)",
                        fontWeight: useCrop === val ? 600 : 400,
                        transition: "background 0.15s, color 0.15s",
                      }}
                    >{label}</button>
                  ))}
                  <button
                    onClick={() => { setPickerMode(null); setPickerSrc(null) }}
                    style={{
                      padding: "5px 12px", borderRadius: 7, fontSize: 12,
                      cursor: "pointer", border: "none",
                      background: "transparent", color: "var(--text-3)",
                      transition: "color 0.15s",
                    }}
                  >Cancel</button>
                </div>

                {useCrop ? (
                  <ImageCropper src={pickerSrc} onConfirm={handleConfirmPic} onReupload={openFilePicker} />
                ) : (
                  <FullImageConfirm src={pickerSrc} onConfirm={handleConfirmPic} onReupload={openFilePicker} />
                )}
              </div>
            ) : (
              <>
                {picLoading ? (
                  <div style={{
                    width: 88, height: 88, borderRadius: "50%",
                    background: "rgba(255,255,255,0.05)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: "50%",
                      border: `2.5px solid ${accent}`,
                      borderTopColor: "transparent",
                      animation: "spin 0.7s linear infinite",
                    }} />
                  </div>
                ) : (
                  <AvatarPickerMenu
                    picUrl={picUrl}
                    name={name}
                    colorPair={colorPair}
                    onView={() => setViewingPic(true)}
                    onUpload={openFilePicker}
                    onRemove={handleRemovePic}
                  />
                )}

                {/* Name display under avatar */}
                {!picLoading && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-1)", letterSpacing: -0.3 }}>{name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
                      {maskPhone(phone)}
                    </div>
                  </div>
                )}

                {uploading && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 7,
                    fontSize: 11, color: accent,
                    background: `${accent}12`,
                    padding: "5px 12px", borderRadius: 20,
                  }}>
                    <div style={{
                      width: 9, height: 9, borderRadius: "50%",
                      border: `2px solid ${accent}`, borderTopColor: "transparent",
                      animation: "spin 0.7s linear infinite",
                    }} />
                    Uploading photo…
                  </div>
                )}
              </>
            )}
          </div>

          {pickerMode !== "picker" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Divider */}
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

              {/* Name field */}
              <div>
                <FieldLabel>Display Name</FieldLabel>
                <div style={{
                  display: "flex", alignItems: "center",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 10, padding: "9px 10px", gap: 6,
                  transition: "border-color 0.15s",
                }}>
                  {editingName ? (
                    <>
                      <input
                        autoFocus
                        value={nameVal}
                        onChange={e => setNameVal(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") handleSaveName()
                          if (e.key === "Escape") setEditingName(false)
                        }}
                        style={{
                          flex: 1, background: "transparent", border: "none", outline: "none",
                          color: "var(--text-1)", fontSize: 13, letterSpacing: -0.1,
                        }}
                        maxLength={25}
                      />
                      <div style={{ display: "flex", gap: 5 }}>
                        <button
                          onClick={handleSaveName}
                          disabled={nameSaving}
                          className="pp-accent-btn"
                          style={{ fontSize: 11, padding: "4px 12px", opacity: nameSaving ? 0.6 : 1 }}
                        >
                          {nameSaving ? "…" : "Save"}
                        </button>
                        <button
                          onClick={() => { setEditingName(false); setNameVal(name); setNameError("") }}
                          className="pp-ghost-btn"
                          style={{ fontSize: 11, padding: "4px 10px" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: 13, color: "var(--text-1)", letterSpacing: -0.1 }}>{name}</span>
                      <button
                        onClick={() => { setEditingName(true); setNameVal(name) }}
                        className="pp-icon-btn"
                        title="Edit name"
                      >
                        <IconPencil />
                      </button>
                    </>
                  )}
                </div>
                {nameError && (
                  <div style={{
                    fontSize: 11, color: "#f87171", marginTop: 5, paddingLeft: 2,
                    display: "flex", alignItems: "center", gap: 5,
                  }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {nameError}
                  </div>
                )}
              </div>

              {/* Phone field */}
              <div>
                <FieldLabel>Phone Number</FieldLabel>
                <div style={{
                  display: "flex", alignItems: "center",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 10, padding: "9px 10px", gap: 6,
                }}>
                  <div style={{ opacity: 0.4, display: "flex" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-1)" strokeWidth="2">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.53 2 2 0 0 1 3.55 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 5.93 5.93l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                  </div>
                  <span
                    onClick={() => setPhoneRevealed(r => !r)}
                    title={phoneRevealed ? "Click to hide" : "Click to reveal"}
                    style={{
                      flex: 1, fontSize: 13,
                      color: phoneRevealed ? "var(--text-1)" : "var(--text-2)",
                      cursor: "pointer",
                      letterSpacing: phoneRevealed ? -0.1 : 1.5,
                      userSelect: phoneRevealed ? "text" : "none",
                      fontFamily: !phoneRevealed ? "monospace" : "inherit",
                      transition: "letter-spacing 0.2s",
                    }}
                  >
                    {phoneRevealed ? revealPhone(phone) : maskPhone(phone)}
                  </span>
                  <div style={{ display: "flex", gap: 3 }}>
                    <button
                      onClick={() => setPhoneRevealed(r => !r)}
                      className="pp-icon-btn"
                      title={phoneRevealed ? "Hide" : "Reveal"}
                      style={{ color: phoneRevealed ? accent : undefined }}
                    >
                      {phoneRevealed ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      ) : (
                        <IconEye2 />
                      )}
                    </button>
                    <button
                      onClick={handleCopyPhone}
                      className="pp-icon-btn"
                      title="Copy number"
                      style={{ color: copied ? accent : undefined, transition: "color 0.2s" }}
                    >
                      {copied ? <IconCheck /> : <IconCopy />}
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 5, paddingLeft: 2 }}>
                  {phoneRevealed ? "Click to mask again" : "Click to reveal your number"}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {/* Fullscreen photo viewer */}
      {viewingPic && picUrl && (
        <div
          onClick={() => setViewingPic(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 10001,
            background: "rgba(0,0,0,0.9)", backdropFilter: "blur(12px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-out",
            animation: "ppFadeIn 0.18s ease",
          }}
        >
          <img
            src={picUrl}
            alt="Profile photo"
            style={{
              maxWidth: "75vw", maxHeight: "75vh",
              borderRadius: 16,
              boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
            }}
          />
          <div style={{
            position: "absolute", top: 20, right: 20,
            background: "rgba(255,255,255,0.1)",
            backdropFilter: "blur(8px)",
            borderRadius: "50%", width: 36, height: 36,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: toast.type === "err"
            ? "rgba(239,68,68,0.15)"
            : "rgba(255,255,255,0.08)",
          backdropFilter: "blur(16px)",
          color: toast.type === "err" ? "#f87171" : "var(--text-1)",
          fontSize: 12, fontWeight: 500,
          padding: "8px 16px", borderRadius: 20,
          border: `1px solid ${toast.type === "err" ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.12)"}`,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          zIndex: 10002, pointerEvents: "none",
          display: "flex", alignItems: "center", gap: 7,
          animation: "ppToastIn 0.22s cubic-bezier(0.34,1.2,0.64,1)",
        }}>
          {toast.type === "err" ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          )}
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes ppSlideIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97) }
          to   { opacity: 1; transform: translateY(0)    scale(1)    }
        }
        @keyframes ppFadeIn {
          from { opacity: 0 } to { opacity: 1 }
        }
        @keyframes ppDropIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-6px) scale(0.96) }
          to   { opacity: 1; transform: translateX(-50%) translateY(0)     scale(1)    }
        }
        @keyframes ppToastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(8px) }
          to   { opacity: 1; transform: translateX(-50%) translateY(0)   }
        }
        .pp-close-btn {
          width: 30px; height: 30px; border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.08);
          background: transparent;
          color: var(--text-3); cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.15s, color 0.15s;
        }
        .pp-close-btn:hover {
          background: rgba(255,255,255,0.07);
          color: var(--text-1);
        }
        .pp-icon-btn {
          padding: 5px 6px; border-radius: 7px;
          border: 1px solid rgba(255,255,255,0.07);
          background: transparent; color: var(--text-3);
          cursor: pointer; display: flex; align-items: center;
          transition: background 0.13s, color 0.13s;
        }
        .pp-icon-btn:hover {
          background: rgba(255,255,255,0.06);
          color: var(--text-1);
        }
        .pp-ghost-btn {
          padding: 5px 11px; border-radius: 7px;
          border: 1px solid rgba(255,255,255,0.08);
          background: transparent; color: var(--text-2);
          cursor: pointer; font-size: 12px;
          transition: background 0.13s, color 0.13s;
          display: flex; align-items: center;
        }
        .pp-ghost-btn:hover {
          background: rgba(255,255,255,0.06);
          color: var(--text-1);
        }
        .pp-accent-btn {
          padding: 5px 14px; border-radius: 7px;
          border: none;
          background: var(--green); color: #fff;
          cursor: pointer; font-size: 12px; font-weight: 600;
          transition: opacity 0.13s;
        }
        .pp-accent-btn:hover { opacity: 0.88; }
        .pp-primary-btn {
          padding: 9px 0; border-radius: 9px;
          border: none; background: var(--green);
          color: #fff; font-size: 13px; font-weight: 600;
          cursor: pointer; display: flex;
          align-items: center; justify-content: center; gap: 7px;
          transition: opacity 0.15s, transform 0.1s;
        }
        .pp-primary-btn:hover { opacity: 0.9; }
        .pp-primary-btn:active { transform: scale(0.99); }
        .pp-zoom-btn {
          width: 28px; height: 28px; border-radius: 7px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.04);
          color: var(--text-1); font-size: 16px; line-height: 1;
          cursor: pointer; display: flex;
          align-items: center; justify-content: center;
          transition: background 0.13s;
        }
        .pp-zoom-btn:hover { background: rgba(255,255,255,0.09); }
      `}</style>
    </div>
  )
}