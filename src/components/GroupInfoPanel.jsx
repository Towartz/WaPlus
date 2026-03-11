// src/components/GroupInfoPanel.jsx
// ═══════════════════════════════════════════════════════════════════════════
// Group Info Panel — WhatsApp-style right panel.
// Full metadata: avatar, subject, desc, participants with profile pics,
// group settings badges, invite link.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback, useRef } from "react"
import { useAppStore } from "../store/app"
import { useChatStore } from "../store/chat"
import { useAuthStore } from "../store/auth"
import { isJidGroup } from "../utils/jidUtils"

// ─── Helpers ────────────────────────────────────────────────────────────────

const COLORS = ["#1a5c3e","#1565c0","#6a1b9a","#b71c1c","#e65100","#2e7d32","#00695c","#4527a0","#00838f","#ad1457"]
function getColor(s) {
  if (!s) return COLORS[0]
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return COLORS[Math.abs(h) % COLORS.length]
}
function initials(n) {
  if (!n) return "?"
  const stripped = n.replace(/[\s\-+().]/g, "")
  if (/^\d{6,}$/.test(stripped)) return stripped.slice(-2)
  return n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase()
}
function fmtDate(ts) {
  if (!ts) return "—"
  const d = new Date(ts * 1000)
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })
}
function jidToPhone(jid) {
  if (!jid) return "?"
  const user = jid.split("@")[0]
  return /^\d+$/.test(user) ? `+${user}` : user
}
// Sensor nomor HP: tampilkan 4 digit awal + **** + 2 digit akhir
// e.g. +6281234567890 → +6281 **** 90
function maskPhone(phone) {
  if (!phone || phone === "?") return phone
  const digits = phone.replace(/\D/g, "")
  if (digits.length < 6) return phone
  const prefix = phone.startsWith("+") ? "+" : ""
  return `${prefix}${digits.slice(0, 4)} **** ${digits.slice(-2)}`
}
function normalizeJid(jid) {
  if (!jid) return ""
  return jid.split(":")[0] + "@" + jid.split("@")[1]
}

// ─── Member Avatar with profile pic fetch ───────────────────────────────────

const _picCache = new Map()

function MemberAvatar({ jid, name, size = 40 }) {
  const [url, setUrl] = useState(() => _picCache.get(jid) ?? null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    if (!jid || _picCache.has(jid)) return
    window.api?.getProfilePic?.({ jid })
      .then(r => { const u = r?.url || null; _picCache.set(jid, u); setUrl(u) })
      .catch(() => _picCache.set(jid, null))
  }, [jid])

  const color = getColor(jid || name)
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: color, overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 700, color: "#fff",
    }}>
      {url && !err
        ? <img src={url} alt={name} onError={() => setErr(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : initials(name)
      }
    </div>
  )
}

// ─── Group Avatar (larger, for header) — click to change if admin ────────────
// Setelah pilih foto: muncul modal crop dengan 2 mode:
//   • "Crop Circle" — circular crop, drag + zoom
//   • "Full Image"  — gunakan seluruh gambar tanpa crop (sama persis ProfilePanel)
// Kedua mode export ke JPEG → upload via IPC.

function GroupCropCircle({ src, onConfirm, onReupload }) {
  const canvasRef  = useRef(null)
  const imgRef     = useRef(null)
  const dragging   = useRef(false)
  const lastPos    = useRef(null)
  const [scale, setScale]   = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const img = new Image()
    img.onload = () => { imgRef.current = img; setLoaded(true) }
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
    // Dark overlay outside circle
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, W, H)
    ctx.arc(W / 2, H / 2, Math.min(W, H) / 2 - 2, 0, Math.PI * 2, true)
    ctx.fillStyle = "rgba(10,15,20,0.72)"
    ctx.fill()
    ctx.restore()
    // Circle border
    ctx.beginPath()
    ctx.arc(W / 2, H / 2, Math.min(W, H) / 2 - 2, 0, Math.PI * 2)
    ctx.strokeStyle = "rgba(37,211,102,0.55)"
    ctx.lineWidth = 1.5
    ctx.stroke()
  }, [scale, offset, loaded])

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
  const onWheel   = e => { e.preventDefault(); setScale(s => Math.max(0.3, Math.min(4, s - e.deltaY * 0.001))) }

  const confirm = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !imgRef.current) return
    const SIZE = 640
    const out = document.createElement("canvas")
    out.width = SIZE; out.height = SIZE
    const ctx = out.getContext("2d")
    ctx.beginPath(); ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2); ctx.clip()
    const src = imgRef.current
    const iw = src.naturalWidth * scale
    const ih = src.naturalHeight * scale
    const W = canvas.width, H = canvas.height
    const cx = W / 2 + offset.x, cy = H / 2 + offset.y
    const radius = Math.min(W, H) / 2 - 2
    const factor = SIZE / (radius * 2)
    const sx = (cx - iw / 2 - (W / 2 - radius)) * factor
    const sy = (cy - ih / 2 - (H / 2 - radius)) * factor
    ctx.drawImage(src, sx, sy, iw * factor, ih * factor)
    out.toBlob(blob => {
      if (!blob) return
      blob.arrayBuffer().then(ab => onConfirm(new Uint8Array(ab)))
    }, "image/jpeg", 0.92)
  }, [scale, offset, loaded, onConfirm])

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
        <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)", letterSpacing: 0.3 }}>
          Drag geser · Scroll / slider zoom
        </span>
        <button onClick={onReupload} style={{
          background: "none", border: "none", cursor: "pointer",
          color: "rgba(37,211,102,0.7)", fontSize: 11, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 4, padding: "2px 0",
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Ganti Foto
        </button>
      </div>

      <canvas
        ref={canvasRef} width={280} height={280}
        style={{ borderRadius: "50%", cursor: "grab", userSelect: "none", background: "#0a0f14", display: "block" }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onWheel={onWheel}
      />

      {/* Zoom row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
        <button onClick={() => setScale(s => Math.max(0.3, s - 0.1))} style={{
          width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)", fontSize: 16,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
        }}>−</button>
        <input type="range" min="0.3" max="4" step="0.01" value={scale}
          onChange={e => setScale(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: "#25d366" }}
        />
        <button onClick={() => setScale(s => Math.min(4, s + 0.1))} style={{
          width: 28, height: 28, borderRadius: 7, border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.7)", fontSize: 16,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
        }}>+</button>
        <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)", minWidth: 34, textAlign: "right", fontFamily: "monospace" }}>
          {Math.round(scale * 100)}%
        </span>
      </div>

      <button onClick={confirm} style={{
        width: "100%", padding: "10px 0", borderRadius: 11,
        background: "linear-gradient(135deg, rgba(37,211,102,0.22), rgba(37,211,102,0.1))",
        border: "1.5px solid rgba(37,211,102,0.45)", color: "#25d366",
        fontSize: 13, fontWeight: 700, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        Simpan Foto Grup
      </button>
    </div>
  )
}

function GroupCropFull({ src, onConfirm, onReupload }) {
  const [previewLoaded, setPreviewLoaded] = useState(false)

  const confirm = useCallback(() => {
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
      }, "image/jpeg", 0.92)
    }
    img.src = src
  }, [src, onConfirm])

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
        <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)", letterSpacing: 0.3 }}>
          Gambar penuh, tanpa crop
        </span>
        <button onClick={onReupload} style={{
          background: "none", border: "none", cursor: "pointer",
          color: "rgba(37,211,102,0.7)", fontSize: 11, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 4, padding: "2px 0",
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Ganti Foto
        </button>
      </div>

      <div style={{
        width: 280, height: 280, borderRadius: 14, overflow: "hidden",
        background: "#0a0f14", border: "1.5px solid rgba(37,211,102,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative",
      }}>
        {!previewLoaded && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid rgba(37,211,102,0.15)", borderTopColor: "#25d366", animation: "grp-spin 0.7s linear infinite" }} />
          </div>
        )}
        <img src={src} alt="preview" onLoad={() => setPreviewLoaded(true)}
          style={{ width: "100%", height: "100%", objectFit: "contain", display: previewLoaded ? "block" : "none" }}
        />
      </div>

      <button onClick={confirm} style={{
        width: "100%", padding: "10px 0", borderRadius: 11,
        background: "linear-gradient(135deg, rgba(37,211,102,0.22), rgba(37,211,102,0.1))",
        border: "1.5px solid rgba(37,211,102,0.45)", color: "#25d366",
        fontSize: 13, fontWeight: 700, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        Simpan Foto Grup
      </button>
    </div>
  )
}

function GroupAvatarPicker({ jid, name, size = 80, isAdmin, onPicChanged }) {
  const [url, setUrl]             = useState(() => _picCache.get(jid) ?? null)
  const [err, setErr]             = useState(false)
  const [hovered, setHovered]     = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast]         = useState(null)
  const fileRef                   = useRef(null)

  // ── Crop modal state ──────────────────────────────────────────────────────
  const [cropSrc, setCropSrc]   = useState(null)     // objectURL gambar asli
  const [cropMode, setCropMode] = useState("circle") // "circle" | "full"

  useEffect(() => {
    if (!jid) return
    if (_picCache.has(jid) && _picCache.get(jid) !== undefined) {
      setUrl(_picCache.get(jid)); return
    }
    window.api?.getProfilePic?.({ jid })
      .then(r => { const u = r?.url || null; _picCache.set(jid, u); setUrl(u) })
      .catch(() => { _picCache.set(jid, null) })
  }, [jid])

  const showToast = (msg, type = "ok") => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 2800)
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""
    const objUrl = URL.createObjectURL(file)
    setCropSrc(objUrl)
    setCropMode("circle")
  }

  const openFilePicker = () => {
    if (cropSrc) { URL.revokeObjectURL(cropSrc); setCropSrc(null) }
    setTimeout(() => fileRef.current?.click(), 60)
  }

  // ── Upload setelah crop/confirm ────────────────────────────────────────────
  const handleConfirm = useCallback(async (bytes) => {
    setUploading(true)
    try {
      const res = await window.api?.groupUpdatePicture?.({ jid, buffer: Array.from(bytes) })
      if (res?.ok) {
        showToast("Foto grup berhasil diubah ✓")
        _picCache.delete(jid)
        await new Promise(r => setTimeout(r, 1000))
        try {
          const r2 = await window.api?.getProfilePic?.({ jid })
          const newUrl = r2?.url || null
          _picCache.set(jid, newUrl); setUrl(newUrl); setErr(false)
          onPicChanged?.(newUrl)
        } catch (_) {}
        URL.revokeObjectURL(cropSrc)
        setCropSrc(null)
      } else {
        showToast(res?.error || "Gagal ubah foto grup", "err")
      }
    } catch (ex) {
      showToast("Error: " + ex.message, "err")
    }
    setUploading(false)
  }, [jid, cropSrc, onPicChanged])

  const handleCancel = () => { URL.revokeObjectURL(cropSrc); setCropSrc(null) }

  const color = getColor(jid || name)

  return (
    <>
      {/* ── Avatar + camera overlay ── */}
      <div
        style={{ position: "relative", width: size, height: size, cursor: isAdmin ? "pointer" : "default" }}
        onMouseEnter={() => isAdmin && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => isAdmin && !uploading && !cropSrc && fileRef.current?.click()}
        title={isAdmin ? "Klik untuk ganti foto grup" : undefined}
      >
        <div style={{
          width: size, height: size, borderRadius: "50%",
          background: color, overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: size * 0.35, fontWeight: 800, color: "#fff",
          boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
        }}>
          {url && !err
            ? <img src={url} alt={name} onError={() => setErr(true)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : initials(name)
          }
        </div>
        {isAdmin && (
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: uploading ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.5)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            opacity: (hovered || uploading) ? 1 : 0,
            transition: "opacity 0.18s", gap: 4,
          }}>
            {uploading
              ? <div style={{ width: 22, height: 22, borderRadius: "50%", border: "2.5px solid #fff", borderTopColor: "transparent", animation: "grp-spin 0.7s linear infinite" }}/>
              : <>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                  <span style={{ fontSize: 9, color: "#fff", fontWeight: 700, letterSpacing: 0.3 }}>UBAH FOTO</span>
                </>
            }
          </div>
        )}
      </div>

      {isAdmin && (
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
      )}

      {/* ── Crop Modal ── */}
      {cropSrc && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 99999,
          background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "linear-gradient(180deg, #1a2733 0%, #111c24 100%)",
            borderRadius: 18, padding: "22px 22px 20px",
            boxShadow: "0 12px 50px rgba(0,0,0,0.7), 0 0 0 1px rgba(37,211,102,0.1)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
            width: 340, maxWidth: "95vw",
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#f0f4f8", letterSpacing: -0.2 }}>Sesuaikan Foto Grup</div>
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>Pilih mode lalu konfirmasi</div>
              </div>
              <button onClick={handleCancel} style={{
                width: 30, height: 30, borderRadius: 9, border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
              }}>✕</button>
            </div>

            {/* Mode toggle — Crop Circle / Full Image */}
            <div style={{
              display: "flex", width: "100%",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 11, padding: 3, gap: 3,
            }}>
              {[
                { val: "circle", icon: "⬤", label: "Crop Bulat" },
                { val: "full",   icon: "▪", label: "Full Image" },
              ].map(({ val, icon, label }) => (
                <button key={val} onClick={() => setCropMode(val)} style={{
                  flex: 1, padding: "7px 0", borderRadius: 9, border: "none",
                  background: cropMode === val
                    ? "linear-gradient(135deg, rgba(37,211,102,0.22), rgba(37,211,102,0.09))"
                    : "transparent",
                  color: cropMode === val ? "#25d366" : "rgba(255,255,255,0.35)",
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  boxShadow: cropMode === val ? "0 2px 8px rgba(37,211,102,0.12)" : "none",
                  outline: cropMode === val ? "1px solid rgba(37,211,102,0.22)" : "1px solid transparent",
                  transition: "all 0.18s",
                }}>
                  <span style={{ fontSize: val === "circle" ? 11 : 14, lineHeight: 1 }}>{icon}</span>
                  {label}
                </button>
              ))}
            </div>

            {/* Crop content */}
            {cropMode === "circle"
              ? <GroupCropCircle src={cropSrc} onConfirm={handleConfirm} onReupload={openFilePicker} />
              : <GroupCropFull   src={cropSrc} onConfirm={handleConfirm} onReupload={openFilePicker} />
            }

            {/* Upload overlay */}
            {uploading && (
              <div style={{
                position: "absolute", inset: 0, borderRadius: 18,
                background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12,
              }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", border: "3px solid rgba(37,211,102,0.15)", borderTopColor: "#25d366", animation: "grp-spin 0.7s linear infinite" }} />
                <span style={{ fontSize: 13, color: "#25d366", fontWeight: 700 }}>Mengupload foto...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: toast.type === "err" ? "#ef4444" : "#25d366",
          color: "#fff", fontSize: 13, fontWeight: 600,
          padding: "9px 20px", borderRadius: 10,
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          zIndex: 99999, pointerEvents: "none",
          display: "flex", alignItems: "center", gap: 8,
          animation: "grp-fadeup 0.25s ease",
        }}>
          {toast.type === "err"
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          }
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes grp-spin    { to { transform: rotate(360deg) } }
        @keyframes grp-fadeup  { from { opacity:0; transform:translateX(-50%) translateY(10px) } to { opacity:1; transform:translateX(-50%) translateY(0) } }
      `}</style>
    </>
  )
}

// ─── Participant Row ─────────────────────────────────────────────────────────

function ParticipantRow({ p, contacts, chats, isMe }) {
  const phone = jidToPhone(p.jid || p.id || "")
  const normUser = (p.jid || p.id || "").split("@")[0].split(":")[0]
  const participantJid = p.jid || p.id || ""
  const isLid = participantJid.includes("@lid")
  const contact = contacts?.find(c => (c.jid || "").split("@")[0].split(":")[0] === normUser)
  const chatEntry = chats?.find(c => (c.jid || "").split("@")[0].split(":")[0] === normUser)
  const participantMeta = p.name || p.notify || p.pushName || p.verifiedName || null
  const displayName = isMe ? "Kamu"
    : contact?.name || contact?.push_name
    || chatEntry?.name || chatEntry?.push_name
    || (typeof participantMeta === "string" && !participantMeta.includes("@") ? participantMeta : null)
    || (isLid ? null : phone) || phone

  const isSuperAdmin = p.admin === "superadmin"
  const isAdminRole  = p.admin === "admin"
  const adminLabel   = isSuperAdmin ? "Pembuat" : isAdminRole ? "Admin" : null
  const adminColor   = isSuperAdmin ? "#f59e0b" : "#25d366"
  const adminBg      = isSuperAdmin ? "rgba(245,158,11,0.1)" : "rgba(37,211,102,0.1)"
  const adminBorder  = isSuperAdmin ? "rgba(245,158,11,0.25)" : "rgba(37,211,102,0.25)"

  return (
    <div className="gip-member-row">
      <div style={{ position: "relative", flexShrink: 0 }}>
        <MemberAvatar jid={p.jid || p.id} name={displayName} size={40} />
        {adminLabel && (
          <div style={{
            position: "absolute", bottom: -1, right: -1,
            width: 14, height: 14, borderRadius: "50%",
            background: adminColor,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 8, border: "2px solid #0d1519",
          }}>
            {isSuperAdmin ? "★" : "✓"}
          </div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: isMe ? 700 : 600,
          color: isMe ? "#25d366" : "rgba(255,255,255,0.88)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          letterSpacing: -0.1,
        }}>
          {displayName}
        </div>
        {displayName !== phone && (
          <div style={{
            fontSize: 10.5, color: "rgba(255,255,255,0.3)", marginTop: 1.5,
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.3,
          }}>
            {maskPhone(phone)}
          </div>
        )}
      </div>
      {adminLabel && (
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
          background: adminBg, color: adminColor, border: `1px solid ${adminBorder}`,
          flexShrink: 0, letterSpacing: 0.3,
        }}>
          {adminLabel}
        </span>
      )}
    </div>
  )
}

// ─── Invite Link Section ─────────────────────────────────────────────────────

function InviteLinkRow({ jid }) {
  const [link, setLink] = useState(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const fetchLink = async () => {
    if (link || loading) return
    setLoading(true)
    try {
      const r = await window.api?.groupGetInviteLink?.({ jid })
      if (r?.ok) setLink(r.link)
    } catch (_) {}
    finally { setLoading(false) }
  }

  const copy = () => {
    if (!link) return
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="gip-invite-row" onClick={link ? copy : fetchLink}>
      <div style={{
        width: 38, height: 38, borderRadius: 11, flexShrink: 0,
        background: copied ? "rgba(37,211,102,0.2)" : "rgba(37,211,102,0.1)",
        border: `1px solid ${copied ? "rgba(37,211,102,0.4)" : "rgba(37,211,102,0.2)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.2s",
      }}>
        {copied
          ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#25d366" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          : loading
            ? <div style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid rgba(37,211,102,0.15)", borderTopColor: "#25d366", animation: "gip-spin 0.7s linear infinite" }} />
            : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#25d366" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        }
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: copied ? "#25d366" : "rgba(255,255,255,0.8)", transition: "color 0.2s" }}>
          {copied ? "✓ Link disalin!" : loading ? "Mengambil link..." : link ? "Salin link undangan" : "Lihat link undangan grup"}
        </div>
        {link && !copied && (
          <div style={{
            fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.2,
          }}>
            {link}
          </div>
        )}
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </div>
  )
}


// ── WA Story color & font palettes ───────────────────────────────────────────
const STORY_COLORS_UI = [
  "#7ACAA7","#6E257E","#5796FF","#7E90A4","#736769",
  "#57C9FF","#25C3DC","#FF7B6C","#55C265","#FF898B",
  "#8C6991","#C69FCC","#B8B226","#EFB32F","#AD8774",
  "#792139","#C1A03F","#8FA842","#A52C71","#8394CA","#243640",
]
const STORY_FONTS_UI = [0, 1, 2, 6, 7, 8, 9, 10]
const FONT_NAMES = { 0:"Sans", 1:"Serif", 2:"Mono", 6:"Cursive", 7:"Bold", 8:"Script", 9:"Brush", 10:"Ink" }



// ── OGG/Opus → MP4/AAC converter ─────────────────────────────────────────────
// Strategy: decode via AudioContext → encode via MediaRecorder (audio/webm atau audio/mp4)
// Fallback: kirim as-is dengan mimetype audio/ogg jika browser tidak support encoding
async function convertOggToMp4(arrayBuffer) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) throw new Error("no AudioContext")
    const ctx = new AudioCtx()
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0))
    await ctx.close()

    // Render ke offline context untuk dapat AudioBuffer bersih
    const offline = new OfflineAudioContext(
      decoded.numberOfChannels,
      decoded.length,
      decoded.sampleRate
    )
    const src = offline.createBufferSource()
    src.buffer = decoded
    src.connect(offline.destination)
    src.start(0)
    const rendered = await offline.startRendering()

    // Encode ke WAV dulu (paling kompatibel sebagai container)
    // lalu kirim ke WA dengan mimetype audio/mp4 — WA server akan handle
    const wavBuf = audioBufferToWav(rendered)

    // Return sebagai Uint8Array + mimetype yang WA bisa putar
    // audio/mp4 mimetype dengan WAV data — WA server converts anyway
    return { buffer: new Uint8Array(wavBuf), mimetype: "audio/mp4", converted: true }
  } catch (e) {
    console.warn("[StatusUpload] OGG convert failed, sending as-is:", e.message)
    return null // caller akan kirim file asli
  }
}

function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels
  const sampleRate  = buffer.sampleRate
  const length      = buffer.length * numChannels * 2
  const arrayBuffer = new ArrayBuffer(44 + length)
  const view        = new DataView(arrayBuffer)

  const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)) }
  const write32  = (offset, v) => view.setUint32(offset, v, true)
  const write16  = (offset, v) => view.setUint16(offset, v, true)

  writeStr(0, "RIFF"); write32(4, 36 + length); writeStr(8, "WAVE")
  writeStr(12, "fmt "); write32(16, 16); write16(20, 1) // PCM
  write16(22, numChannels); write32(24, sampleRate)
  write32(28, sampleRate * numChannels * 2); write16(32, numChannels * 2); write16(34, 16)
  writeStr(36, "data"); write32(40, length)

  let offset = 44
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
      offset += 2
    }
  }
  return arrayBuffer
}

// ── Animated Waveform Bar component ──────────────────────────────────────────
function WaveformBar({ index, playing, progress, total }) {
  const filled = index / total <= progress
  const isHead  = Math.abs(index / total - progress) < 0.04
  const h = 20 + Math.sin(index * 0.7) * 10 + Math.sin(index * 1.3) * 8
  return (
    <div style={{
      width: 2.5, borderRadius: 2,
      height: `${h}%`,
      minHeight: 4,
      background: filled
        ? (isHead ? "#25d366" : "rgba(37,211,102,0.6)")
        : "rgba(255,255,255,0.12)",
      transition: "background 0.1s",
      transform: (isHead && playing) ? "scaleY(1.4)" : "scaleY(1)",
      transformOrigin: "center",
    }} />
  )
}

function AudioPreviewPlayer({ src, fileName, onReset, uploading }) {
  const audioRef   = useRef(null)
  const rafRef     = useRef(null)
  const [playing, setPlaying]   = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [elapsed,  setElapsed]  = useState(0)
  const BARS = 36

  useEffect(() => {
    const a = new Audio(src)
    a.preload = "metadata"
    audioRef.current = a
    a.addEventListener("loadedmetadata", () => setDuration(a.duration || 0))
    a.addEventListener("ended", () => {
      setPlaying(false); setProgress(0); setElapsed(0)
      a.currentTime = 0
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    })
    return () => { a.pause(); a.src = ""; if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [src])

  const tick = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    setProgress(a.currentTime / (a.duration || 1))
    setElapsed(a.currentTime)
    rafRef.current = requestAnimationFrame(tick)
  }, [])

  const togglePlay = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) {
      a.pause()
      setPlaying(false)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    } else {
      a.play().then(() => { setPlaying(true); rafRef.current = requestAnimationFrame(tick) }).catch(() => {})
    }
  }

  const fmtTime = s => { if (!s || !isFinite(s)) return "0:00"; const m = Math.floor(s/60); return `${m}:${Math.floor(s%60).toString().padStart(2,"0")}` }

  return (
    <div style={{
      borderRadius: 14, background: "linear-gradient(135deg, rgba(37,211,102,0.08) 0%, rgba(0,0,0,0.3) 100%)",
      border: "1px solid rgba(37,211,102,0.18)", padding: "14px 14px 12px",
      marginBottom: 10, position: "relative",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Play button */}
        <button
          onClick={togglePlay}
          disabled={uploading}
          style={{
            width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
            background: playing ? "rgba(37,211,102,0.25)" : "rgba(37,211,102,0.15)",
            border: "1.5px solid rgba(37,211,102,0.4)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.15s", color: "#25d366",
          }}
        >
          {playing
            ? <svg width="13" height="13" viewBox="0 0 24 24" fill="#25d366"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            : <svg width="13" height="13" viewBox="0 0 24 24" fill="#25d366"><polygon points="5,3 19,12 5,21"/></svg>
          }
        </button>

        {/* Waveform */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 2, height: 36 }}>
          {Array.from({ length: BARS }, (_, i) => (
            <WaveformBar key={i} index={i} playing={playing} progress={progress} total={BARS} />
          ))}
        </div>

        {/* Time */}
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", minWidth: 32, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          {fmtTime(playing ? elapsed : duration)}
        </span>
      </div>

      {/* File name */}
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        🎵 {fileName}
      </div>

      {/* Close button */}
      {!uploading && (
        <button onClick={onReset} style={{
          position: "absolute", top: 8, right: 8,
          background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%",
          width: 22, height: 22, cursor: "pointer", color: "rgba(255,255,255,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11,
        }}>✕</button>
      )}

      {/* Upload overlay */}
      {uploading && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: 14, background: "rgba(0,0,0,0.55)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
        }}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid rgba(37,211,102,0.2)", borderTopColor: "#25d366", animation: "gspin 0.7s linear infinite" }} />
          <span style={{ fontSize: 12, color: "#25d366", fontWeight: 700, letterSpacing: 0.3 }}>Mengupload...</span>
        </div>
      )}
    </div>
  )
}

function GroupStatusUpload({ jid }) {
  const fileRef  = useRef(null)
  const videoRef = useRef(null)

  const [tab,     setTab]     = useState("media") // "media" | "text"
  const [file,    setFile]    = useState(null)
  const [preview, setPreview] = useState(null) // { src, type: "image"|"video"|"audio" }
  const [state,   setState]   = useState("idle") // idle | converting | uploading | ok | err
  const [errMsg,  setErrMsg]  = useState("")
  const [caption, setCaption] = useState("")

  // ── Text status state ────────────────────────────────────────────────────
  const [textBody,    setTextBody]    = useState("")
  const [textBg,      setTextBg]      = useState("#1a7c4a")
  const [textFont,    setTextFont]    = useState(0)

  const TEXT_BG_PRESETS = ["#1a7c4a","#1565c0","#6a1b9a","#b71c1c","#e65100","#25C3DC","#000000","#f59e0b","#ec4899","#0f172a"]
  const TEXT_FONT_LABELS = ["Sans","Serif","Mono","Cursive","Bold"]

  const reset = () => {
    if (preview?.src) URL.revokeObjectURL(preview.src)
    setFile(null); setPreview(null); setState("idle"); setErrMsg(""); setCaption("")
    setTextBody(""); setTextBg("#1a7c4a"); setTextFont(0)
    if (fileRef.current) fileRef.current.value = ""
  }

  const handleTextUpload = async () => {
    if (!textBody.trim()) { setErrMsg("Teks tidak boleh kosong"); setState("err"); return }
    setState("uploading")
    try {
      const r = await window.api?.groupSendStatusV2?.({
        jid,
        content: {
          _isText:          true,
          _text:            textBody.trim(),
          _backgroundColor: textBg,
          _font:            textFont,
        },
      })
      if (r?.ok) { setState("ok"); setTimeout(reset, 3500) }
      else        { setErrMsg(r?.error || "Upload gagal"); setState("err") }
    } catch (ex) {
      setErrMsg(ex.message || "Terjadi kesalahan"); setState("err")
    }
  }

  const handlePick = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    e.target.value = ""

    const isVideo = f.type.startsWith("video/")
    const isImage = f.type.startsWith("image/")
    const isAudio = f.type.startsWith("audio/")

    if (!isVideo && !isImage && !isAudio) {
      setErrMsg("Format tidak didukung. Gunakan foto, video, atau audio.")
      setState("err"); return
    }
    if (f.size > 32 * 1024 * 1024) {
      setErrMsg("Ukuran maks 32 MB.")
      setState("err"); return
    }

    const type = isVideo ? "video" : isImage ? "image" : "audio"
    setFile(f)
    setPreview({ src: URL.createObjectURL(f), type })
    setState("idle")
    setErrMsg("")
  }

  const handleUpload = async () => {
    if (!file) return
    const isOggOpus = file.type === "audio/ogg" || file.type === "audio/opus" || file.name.endsWith(".ogg") || file.name.endsWith(".opus")

    setState(isOggOpus ? "converting" : "uploading")
    try {
      let bytes, mimetype

      if (isOggOpus) {
        // Decode ogg/opus → WAV PCM → kirim sebagai audio/mp4
        const ab = await file.arrayBuffer()
        const converted = await convertOggToMp4(ab)
        if (converted) {
          bytes    = Array.from(converted.buffer)
          mimetype = converted.mimetype
        } else {
          // Fallback: kirim ogg as-is
          bytes    = Array.from(new Uint8Array(ab))
          mimetype = file.type
        }
        setState("uploading")
      } else {
        const ab = await file.arrayBuffer()
        bytes    = Array.from(new Uint8Array(ab))
        mimetype = file.type
      }

      const r = await window.api?.groupSendStatusV2?.({
        jid,
        content: {
          _buffer:   bytes,
          _mimetype: mimetype,
          _isImage:  file.type.startsWith("image/"),
          _isVideo:  file.type.startsWith("video/"),
          _isAudio:  file.type.startsWith("audio/"),
          _caption:  caption.trim() || "",
        },
      })
      if (r?.ok) { setState("ok"); setTimeout(reset, 3500) }
      else        { setErrMsg(r?.error || "Upload gagal"); setState("err") }
    } catch (ex) {
      setErrMsg(ex.message || "Terjadi kesalahan")
      setState("err")
    }
  }

  const isUploading  = state === "uploading"
  const isConverting = state === "converting"
  const isBusy       = isUploading || isConverting

  // ── Media type helpers ────────────────────────────────────────────────────
  const typeLabel = preview?.type === "video" ? "Video" : preview?.type === "audio" ? "Audio" : "Foto"
  const typeIcon  = preview?.type === "video" ? "🎬" : preview?.type === "audio" ? "🎵" : "🖼"
  const typeColor = preview?.type === "video" ? "#60a5fa" : preview?.type === "audio" ? "#a78bfa" : "#86efac"

  // ── Drag & drop support ───────────────────────────────────────────────────
  const [dragOver, setDragOver] = useState(false)
  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) { const fe = { target: { files: [f], value: "" } }; fe.target.value = ""; handlePick({ target: { files: [f], value: "" } }) }
  }

  return (
    <div style={{ padding: "12px 14px 10px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: "linear-gradient(135deg, rgba(37,211,102,0.25), rgba(37,211,102,0.08))",
          border: "1px solid rgba(37,211,102,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#25d366" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polygon points="10 8 16 12 10 16 10 8" fill="#25d366" stroke="none"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", letterSpacing: 0.2 }}>Upload Status Grup</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>Foto · Video · Audio · Teks</div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div style={{
        display: "flex", background: "rgba(255,255,255,0.04)",
        borderRadius: 10, padding: 3, marginBottom: 12, gap: 3,
        border: "1px solid rgba(255,255,255,0.06)",
      }}>
        {[["media","🖼 Media"],["text","📝 Teks"]].map(([t, label]) => (
          <button key={t} onClick={() => { setTab(t); setState("idle"); setErrMsg("") }} style={{
            flex: 1, padding: "6px 0", borderRadius: 8, border: "none",
            background: tab === t ? "rgba(37,211,102,0.18)" : "transparent",
            color: tab === t ? "#25d366" : "rgba(255,255,255,0.4)",
            fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
            borderBottom: tab === t ? "1.5px solid rgba(37,211,102,0.5)" : "1.5px solid transparent",
          }}>{label}</button>
        ))}
      </div>

      {/* ── TEXT TAB ── */}
      {tab === "text" && (<>
        {/* Live preview */}
        <div style={{
          borderRadius: 14, marginBottom: 10, overflow: "hidden",
          background: textBg, minHeight: 100,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "18px 16px", textAlign: "center",
          fontFamily: ["sans-serif","serif","monospace","cursive","sans-serif"][textFont],
          fontWeight: textFont === 4 ? 900 : 500,
          fontSize: Math.min(28, Math.max(14, 200 / Math.max(textBody.length, 5))),
          color: "#ffffff",
          wordBreak: "break-word", lineHeight: 1.35,
          boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.1)",
        }}>
          {textBody || <span style={{ opacity: 0.35, fontSize: 13 }}>Preview teks status...</span>}
        </div>

        {/* Text input */}
        <textarea
          placeholder="Tulis status teks kamu..."
          value={textBody}
          onChange={e => setTextBody(e.target.value)}
          maxLength={700}
          rows={3}
          style={{
            width: "100%", padding: "10px 12px", borderRadius: 10, marginBottom: 8,
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            color: "#e2e8f0", fontSize: 13, outline: "none", resize: "vertical",
            boxSizing: "border-box", fontFamily: "inherit", lineHeight: 1.5,
          }}
        />
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginBottom: 10, textAlign: "right" }}>{textBody.length}/700</div>

        {/* Background presets */}
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>Warna Latar</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          {TEXT_BG_PRESETS.map(c => (
            <button key={c} onClick={() => setTextBg(c)} style={{
              width: 28, height: 28, borderRadius: 8, background: c, border: "none",
              cursor: "pointer", outline: textBg === c ? "2.5px solid #25d366" : "2px solid transparent",
              outlineOffset: 2, flexShrink: 0, transition: "outline 0.1s",
            }} />
          ))}
          <input type="color" value={textBg} onChange={e => setTextBg(e.target.value)} style={{
            width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.06)", cursor: "pointer", padding: 2, boxSizing: "border-box",
          }} title="Warna kustom" />
        </div>

        {/* Font selector */}
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>Gaya Teks</div>
        <div style={{ display: "flex", gap: 5, marginBottom: 12, flexWrap: "wrap" }}>
          {TEXT_FONT_LABELS.map((label, i) => (
            <button key={i} onClick={() => setTextFont(i)} style={{
              padding: "4px 10px", borderRadius: 7, border: `1px solid ${textFont === i ? "rgba(37,211,102,0.5)" : "rgba(255,255,255,0.1)"}`,
              background: textFont === i ? "rgba(37,211,102,0.12)" : "rgba(255,255,255,0.03)",
              color: textFont === i ? "#25d366" : "rgba(255,255,255,0.45)",
              fontSize: 11, cursor: "pointer",
              fontFamily: ["sans-serif","serif","monospace","cursive","sans-serif"][i],
              fontWeight: i === 4 ? 900 : 400,
            }}>{label}</button>
          ))}
        </div>

        {/* Status feedback */}
        {state === "ok" && (
          <div style={{ fontSize: 12, color: "#25d366", fontWeight: 600, padding: "8px 12px", borderRadius: 10, marginBottom: 8, background: "rgba(37,211,102,0.09)", border: "1px solid rgba(37,211,102,0.18)", display: "flex", alignItems: "center", gap: 7 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#25d366" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Berhasil diupload ke status grup!
          </div>
        )}
        {state === "err" && (
          <div style={{ fontSize: 11, color: "#f87171", padding: "7px 12px", borderRadius: 10, marginBottom: 8, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.18)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span>{errMsg}</span>
            <button onClick={() => { setState("idle"); setErrMsg("") }} style={{ background: "none", border: "none", cursor: "pointer", color: "#25d366", fontSize: 11, fontWeight: 600 }}>Reset</button>
          </div>
        )}
        {state === "uploading" && (
          <div style={{ fontSize: 11, color: "#25d366", padding: "6px 12px", background: "rgba(37,211,102,0.07)", borderRadius: 8, marginBottom: 8, display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", border: "1.5px solid rgba(37,211,102,0.2)", borderTopColor: "#25d366", animation: "gspin 0.7s linear infinite" }} />
            Mengupload teks status...
          </div>
        )}

        <button
          onClick={handleTextUpload}
          disabled={state === "uploading" || !textBody.trim()}
          style={{
            width: "100%", padding: "10px 0", borderRadius: 11,
            background: (state === "uploading" || !textBody.trim())
              ? "rgba(37,211,102,0.05)"
              : "linear-gradient(135deg, rgba(37,211,102,0.22) 0%, rgba(37,211,102,0.1) 100%)",
            border: `1.5px solid ${(state === "uploading" || !textBody.trim()) ? "rgba(37,211,102,0.15)" : "rgba(37,211,102,0.45)"}`,
            color: (state === "uploading" || !textBody.trim()) ? "rgba(37,211,102,0.3)" : "#25d366",
            fontSize: 13, fontWeight: 700, cursor: (state === "uploading" || !textBody.trim()) ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          {state === "uploading" ? "Mengupload..." : "Upload Teks Status"}
        </button>
      </>)}

      {/* ── MEDIA TAB ── */}
      {tab === "media" && (<>

      {/* ── Drop zone (saat belum pilih file) ── */}
      {!preview && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            borderRadius: 14,
            border: `1.5px dashed ${dragOver ? "rgba(37,211,102,0.7)" : "rgba(255,255,255,0.1)"}`,
            background: dragOver ? "rgba(37,211,102,0.06)" : "rgba(255,255,255,0.02)",
            padding: "24px 16px", textAlign: "center", cursor: "pointer",
            transition: "all 0.2s",
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 10 }}>
            {["🖼", "🎬", "🎵"].map((icon, i) => (
              <div key={i} style={{
                width: 38, height: 38, borderRadius: 10,
                background: ["rgba(134,239,172,0.1)","rgba(96,165,250,0.1)","rgba(167,139,250,0.1)"][i],
                border: `1px solid ${["rgba(134,239,172,0.2)","rgba(96,165,250,0.2)","rgba(167,139,250,0.2)"][i]}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16,
              }}>{icon}</div>
            ))}
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>
            Klik atau seret file ke sini
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)" }}>
            JPG · PNG · MP4 · OGG · MP3 · Maks 32 MB
          </div>
        </div>
      )}

      {/* ── Audio preview player ── */}
      {preview?.type === "audio" && (
        <AudioPreviewPlayer
          src={preview.src}
          fileName={file?.name || "audio"}
          onReset={reset}
          uploading={isBusy}
        />
      )}

      {/* ── Image / Video preview ── */}
      {preview && preview.type !== "audio" && (
        <div style={{
          borderRadius: 12, overflow: "hidden", marginBottom: 10,
          background: "#0a0f14", position: "relative",
          border: "1px solid rgba(255,255,255,0.07)",
        }}>
          {preview.type === "video"
            ? <video ref={videoRef} src={preview.src} controls style={{ width: "100%", maxHeight: 200, display: "block" }} />
            : <img src={preview.src} alt="preview" style={{ width: "100%", maxHeight: 200, objectFit: "contain", display: "block" }} />
          }
          {isBusy && (
            <div style={{
              position: "absolute", inset: 0, background: "rgba(0,0,0,0.58)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
            }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", border: "2.5px solid rgba(37,211,102,0.15)", borderTopColor: "#25d366", animation: "gspin 0.7s linear infinite" }} />
              <span style={{ fontSize: 11, color: "#25d366", fontWeight: 700, letterSpacing: 0.5 }}>
                {isConverting ? "Mengkonversi..." : "Mengupload..."}
              </span>
            </div>
          )}
          {!isBusy && (
            <button onClick={reset} style={{
              position: "absolute", top: 7, right: 7,
              background: "rgba(0,0,0,0.65)", border: "none", borderRadius: "50%",
              width: 26, height: 26, cursor: "pointer", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
            }}>✕</button>
          )}
        </div>
      )}

      {/* ── File info pill ── */}
      {file && !isBusy && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
          padding: "5px 10px", borderRadius: 20,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}>
          <span style={{ fontSize: 12 }}>{typeIcon}</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: typeColor }}>{typeLabel}</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{file.name}</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", flexShrink: 0 }}>{(file.size / 1024 / 1024).toFixed(1)} MB</span>
        </div>
      )}

      {/* ── Caption input (foto & video only) ── */}
      {preview && preview.type !== "audio" && !isBusy && (
        <input
          type="text"
          placeholder="Tambah caption... (opsional)"
          value={caption}
          onChange={e => setCaption(e.target.value)}
          maxLength={200}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 10, marginBottom: 10,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
            color: "#e2e8f0", fontSize: 12, outline: "none",
            boxSizing: "border-box",
          }}
        />
      )}

      {/* ── Status: converting badge ── */}
      {isConverting && (
        <div style={{
          fontSize: 11, color: "#a78bfa", padding: "6px 12px",
          background: "rgba(167,139,250,0.08)", borderRadius: 8, marginBottom: 8,
          display: "flex", alignItems: "center", gap: 7,
        }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", border: "1.5px solid rgba(167,139,250,0.2)", borderTopColor: "#a78bfa", animation: "gspin 0.7s linear infinite" }} />
          Mengkonversi OGG/Opus → MP4...
        </div>
      )}

      {/* ── Status: success ── */}
      {state === "ok" && (
        <div style={{
          fontSize: 12, color: "#25d366", fontWeight: 600,
          padding: "8px 12px", borderRadius: 10, marginBottom: 8,
          background: "rgba(37,211,102,0.09)", border: "1px solid rgba(37,211,102,0.18)",
          display: "flex", alignItems: "center", gap: 7,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#25d366" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Berhasil diupload ke status grup!
        </div>
      )}

      {/* ── Status: error ── */}
      {state === "err" && (
        <div style={{
          fontSize: 11, color: "#f87171",
          padding: "7px 12px", borderRadius: 10, marginBottom: 8,
          background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.18)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/></svg>
            {errMsg}
          </span>
          <button onClick={reset} style={{ background: "none", border: "none", cursor: "pointer", color: "#25d366", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>Reset</button>
        </div>
      )}

      {/* Hidden input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/3gpp,video/quicktime,audio/ogg,audio/opus,audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/flac"
        style={{ display: "none" }}
        onChange={handlePick}
      />

      {/* ── Buttons ── */}
      {!preview ? (
        <button
          onClick={() => fileRef.current?.click()}
          style={{
            width: "100%", padding: "10px 0", borderRadius: 11,
            background: "linear-gradient(135deg, rgba(37,211,102,0.18) 0%, rgba(37,211,102,0.08) 100%)",
            border: "1.5px solid rgba(37,211,102,0.3)",
            color: "#25d366", fontSize: 13, fontWeight: 700, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            transition: "all 0.2s", letterSpacing: 0.3,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "linear-gradient(135deg, rgba(37,211,102,0.28) 0%, rgba(37,211,102,0.14) 100%)"; e.currentTarget.style.borderColor = "rgba(37,211,102,0.5)" }}
          onMouseLeave={e => { e.currentTarget.style.background = "linear-gradient(135deg, rgba(37,211,102,0.18) 0%, rgba(37,211,102,0.08) 100%)"; e.currentTarget.style.borderColor = "rgba(37,211,102,0.3)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Pilih Media
        </button>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => { reset(); setTimeout(() => fileRef.current?.click(), 60) }}
            disabled={isBusy}
            style={{
              flex: 1, padding: "9px 0", borderRadius: 10, fontSize: 12, fontWeight: 600,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)",
              cursor: isBusy ? "not-allowed" : "pointer", transition: "all 0.15s",
            }}
            onMouseEnter={e => { if (!isBusy) e.currentTarget.style.background = "rgba(255,255,255,0.08)" }}
            onMouseLeave={e => { if (!isBusy) e.currentTarget.style.background = "rgba(255,255,255,0.04)" }}
          >Ganti</button>
          <button
            onClick={handleUpload}
            disabled={isBusy}
            style={{
              flex: 2.2, padding: "9px 0", borderRadius: 10, fontSize: 12, fontWeight: 700,
              border: `1.5px solid ${isBusy ? "rgba(37,211,102,0.2)" : "rgba(37,211,102,0.45)"}`,
              background: isBusy
                ? "rgba(37,211,102,0.04)"
                : "linear-gradient(135deg, rgba(37,211,102,0.22) 0%, rgba(37,211,102,0.1) 100%)",
              color: isBusy ? "rgba(37,211,102,0.35)" : "#25d366",
              cursor: isBusy ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
              transition: "all 0.2s",
            }}
            onMouseEnter={e => { if (!isBusy) e.currentTarget.style.background = "linear-gradient(135deg, rgba(37,211,102,0.32) 0%, rgba(37,211,102,0.16) 100%)" }}
            onMouseLeave={e => { if (!isBusy) e.currentTarget.style.background = "linear-gradient(135deg, rgba(37,211,102,0.22) 0%, rgba(37,211,102,0.1) 100%)" }}
          >
            {isBusy ? (
              <>
                <div style={{ width: 12, height: 12, borderRadius: "50%", border: "1.5px solid rgba(37,211,102,0.15)", borderTopColor: "rgba(37,211,102,0.4)", animation: "gspin 0.7s linear infinite" }}/>
                {isConverting ? "Konversi..." : "Upload..."}
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/>
                </svg>
                Upload Status
              </>
            )}
          </button>
        </div>
      )}

      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 8, textAlign: "center", letterSpacing: 0.3 }}>
        Foto · Video · OGG · MP3 · Maks 32 MB · Admin only
      </div>

      </>)} {/* end tab === "media" */}

      <style>{`
        @keyframes gspin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}

// ─── CSS Keyframes & Global Styles ──────────────────────────────────────────

const GIP_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

  .gip-root * { box-sizing: border-box; }

  .gip-root {
    font-family: 'DM Sans', system-ui, sans-serif;
  }

  .gip-scroll::-webkit-scrollbar { width: 3px; }
  .gip-scroll::-webkit-scrollbar-track { background: transparent; }
  .gip-scroll::-webkit-scrollbar-thumb { background: rgba(37,211,102,0.2); border-radius: 2px; }
  .gip-scroll::-webkit-scrollbar-thumb:hover { background: rgba(37,211,102,0.4); }

  @keyframes gip-spin  { to { transform: rotate(360deg); } }
  @keyframes gip-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
  @keyframes gip-slide-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes gip-fade-in  { from { opacity: 0; } to { opacity: 1; } }
  @keyframes gip-glow-pulse { 0%,100% { box-shadow: 0 0 20px rgba(37,211,102,0.15); } 50% { box-shadow: 0 0 32px rgba(37,211,102,0.3); } }

  .gip-hero-avatar { animation: gip-glow-pulse 3s ease-in-out infinite; }

  .gip-section { animation: gip-slide-in 0.25s ease both; }

  .gip-member-row {
    display: flex; align-items: center; gap: 11px;
    padding: 9px 16px;
    border-radius: 10px;
    cursor: default;
    transition: background 0.15s;
    margin: 0 8px 2px;
  }
  .gip-member-row:hover { background: rgba(255,255,255,0.05); }

  .gip-setting-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 14px;
    border-radius: 10px;
    transition: background 0.15s;
    margin: 0 8px 2px;
  }
  .gip-setting-row:hover { background: rgba(255,255,255,0.04); }

  .gip-btn-primary {
    display: flex; align-items: center; justify-content: center; gap: 7px;
    padding: 10px 0; border-radius: 12px; width: 100%;
    background: linear-gradient(135deg, rgba(37,211,102,0.22) 0%, rgba(37,211,102,0.1) 100%);
    border: 1.5px solid rgba(37,211,102,0.35);
    color: #25d366; font-size: 12.5px; font-weight: 700;
    cursor: pointer; transition: all 0.2s; font-family: inherit;
    letter-spacing: 0.2px;
  }
  .gip-btn-primary:hover:not(:disabled) {
    background: linear-gradient(135deg, rgba(37,211,102,0.32) 0%, rgba(37,211,102,0.16) 100%);
    border-color: rgba(37,211,102,0.55);
    box-shadow: 0 4px 16px rgba(37,211,102,0.18);
  }
  .gip-btn-primary:disabled { opacity: 0.35; cursor: not-allowed; }

  .gip-btn-ghost {
    display: flex; align-items: center; justify-content: center; gap: 7px;
    padding: 10px 0; border-radius: 12px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
    color: rgba(255,255,255,0.45); font-size: 12px; font-weight: 600;
    cursor: pointer; transition: all 0.15s; font-family: inherit;
  }
  .gip-btn-ghost:hover:not(:disabled) { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); }
  .gip-btn-ghost:disabled { opacity: 0.3; cursor: not-allowed; }

  .gip-tag {
    display: inline-flex; align-items: center;
    padding: 3px 9px; border-radius: 20px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.3px;
    flex-shrink: 0;
  }

  .gip-input {
    width: 100%; padding: 9px 12px; border-radius: 10px;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09);
    color: #e2e8f0; font-size: 12.5px; outline: none;
    font-family: 'DM Sans', inherit; box-sizing: border-box;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .gip-input:focus { border-color: rgba(37,211,102,0.35); box-shadow: 0 0 0 3px rgba(37,211,102,0.08); }
  .gip-input::placeholder { color: rgba(255,255,255,0.25); }

  .gip-textarea {
    width: 100%; padding: 9px 12px; border-radius: 10px;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09);
    color: #e2e8f0; font-size: 12.5px; outline: none; resize: none; line-height: 1.55;
    font-family: 'DM Sans', inherit; box-sizing: border-box;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .gip-textarea:focus { border-color: rgba(37,211,102,0.35); box-shadow: 0 0 0 3px rgba(37,211,102,0.08); }
  .gip-textarea::placeholder { color: rgba(255,255,255,0.25); }

  .gip-tab-btn {
    flex: 1; padding: 7px 0; border-radius: 9px; border: none;
    font-size: 11.5px; font-weight: 600; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 5px;
    transition: all 0.18s; font-family: 'DM Sans', inherit;
  }
  .gip-tab-active {
    background: linear-gradient(135deg, rgba(37,211,102,0.22), rgba(37,211,102,0.09));
    color: #25d366;
    box-shadow: 0 2px 8px rgba(37,211,102,0.14), inset 0 1px 0 rgba(37,211,102,0.15);
    border: 1px solid rgba(37,211,102,0.25);
  }
  .gip-tab-inactive {
    background: transparent; color: rgba(255,255,255,0.35); border: 1px solid transparent;
  }
  .gip-tab-inactive:hover { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.6); }

  .gip-color-swatch {
    width: 22px; height: 22px; border-radius: 6px;
    cursor: pointer; transition: transform 0.15s, box-shadow 0.15s;
    border: 2px solid transparent;
  }
  .gip-color-swatch:hover { transform: scale(1.15); }
  .gip-color-swatch.active { border-color: #fff; transform: scale(1.2); }

  .gip-waveform-bar {
    border-radius: 2px; transition: background 0.08s, transform 0.08s;
    transform-origin: center;
  }

  .gip-invite-row {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 14px; border-radius: 12px; cursor: pointer;
    transition: background 0.15s; margin: 0 8px 4px;
  }
  .gip-invite-row:hover { background: rgba(37,211,102,0.06); }

  .gip-section-label {
    font-size: 10.5px; font-weight: 700; letter-spacing: 0.8px;
    color: rgba(37,211,102,0.7); padding: 16px 16px 8px;
    text-transform: uppercase;
  }

  .gip-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 14px;
    overflow: hidden;
  }

  .gip-divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.06) 20%, rgba(255,255,255,0.06) 80%, transparent);
    margin: 0 16px;
  }
`

// ─── Section Label ────────────────────────────────────────────────────────────

function SectionLabel({ label }) {
  return <div className="gip-section-label">{label}</div>
}

// ─── Divider ──────────────────────────────────────────────────────────────────

function GipDivider() {
  return <div className="gip-divider" />
}

// ─── Setting Row ──────────────────────────────────────────────────────────────

function SettingRow({ icon, label, value, warn }) {
  const valueColor = warn ? "#f59e0b" : "rgba(255,255,255,0.8)"
  const valueBg    = warn ? "rgba(245,158,11,0.08)" : "rgba(255,255,255,0.04)"
  const valueBdr   = warn ? "rgba(245,158,11,0.2)"  : "rgba(255,255,255,0.07)"
  return (
    <div className="gip-setting-row">
      <div style={{
        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 2, letterSpacing: 0.2 }}>{label}</div>
        <div style={{ fontSize: 12.5, color: valueColor, fontWeight: 600 }}>{value}</div>
      </div>
      <div style={{
        fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20,
        background: valueBg, border: `1px solid ${valueBdr}`, color: valueColor, flexShrink: 0,
        letterSpacing: 0.2,
      }}>
        {warn ? "⚠" : "✓"}
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function GroupInfoPanel({ jid }) {
  const { rightPanelOpen, toggleRightPanel } = useAppStore()
  const { contacts, chats } = useChatStore()
  const { connectedUser } = useAuthStore()
  const ownJid = connectedUser?.jid || ""
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [meta, setMeta] = useState(null)
  const fetchingRef = useRef(false)
  const lastJidRef = useRef(null)

  const chat = chats?.find(c => c.jid === jid || normalizeJid(c.jid) === normalizeJid(jid || ""))
  const groupName = meta?.subject || chat?.name || "Grup"
  const memberCount = meta?.participants?.length || chat?.member_count || 0

  const ownUser = (ownJid || "").split("@")[0].split(":")[0]
  const isAdmin = meta?.participants?.some(p => {
    const pUser = (p.jid || p.id || "").split("@")[0].split(":")[0]
    return pUser === ownUser && (p.admin === "admin" || p.admin === "superadmin")
  }) ?? false

  const fetchMeta = useCallback(async (groupJid) => {
    if (!groupJid || !isJidGroup(groupJid)) return
    if (fetchingRef.current) return
    fetchingRef.current = true
    setLoading(true); setError(null)
    try {
      const r = await window.api?.groupGetMetadata?.({ jid: groupJid })
      if (r?.ok && r.data) setMeta(r.data)
      else setError(r?.error || "Gagal mengambil info grup")
    } catch (e) { setError(e.message) }
    finally { setLoading(false); fetchingRef.current = false }
  }, [])

  useEffect(() => {
    if (!rightPanelOpen || !jid || !isJidGroup(jid)) return
    if (lastJidRef.current !== jid) {
      lastJidRef.current = jid
      fetchingRef.current = false
      setMeta(null); setError(null)
      fetchMeta(jid)
    } else if (!meta && !loading && !error) {
      fetchMeta(jid)
    }
  }, [jid, rightPanelOpen])

  if (!rightPanelOpen || !jid || !isJidGroup(jid)) return null

  const sorted = meta?.participants
    ? [...meta.participants].sort((a, b) => {
        const rank = v => v === "superadmin" ? 0 : v === "admin" ? 1 : 2
        return rank(a.admin) - rank(b.admin)
      })
    : []

  const settingItems = [
    { icon: "💬", label: "Kirim pesan",       value: meta?.announce       ? "Admin saja"          : "Semua anggota", warn: !!meta?.announce },
    { icon: "✏️", label: "Edit info grup",    value: meta?.restrict       ? "Admin saja"          : "Semua anggota", warn: !!meta?.restrict },
    { icon: "👤", label: "Tambah anggota",    value: meta?.memberAddMode  ? "Semua anggota"       : "Admin saja",    warn: !meta?.memberAddMode },
    { icon: "🔑", label: "Approval bergabung",value: meta?.joinApprovalMode ? "Perlu persetujuan" : "Langsung masuk",warn: !!meta?.joinApprovalMode },
    meta?.ephemeralDuration != null && {
      icon: "⏱️", label: "Pesan hilang",
      value: meta.ephemeralDuration === 0 ? "Nonaktif" : meta.ephemeralDuration === 86400 ? "24 jam" : meta.ephemeralDuration === 604800 ? "7 hari" : "90 hari",
      warn: meta.ephemeralDuration !== 0,
    },
  ].filter(Boolean)

  // ── Emerald green palette vars
  const G  = "#25d366"
  const G2 = "rgba(37,211,102,0.18)"
  const G3 = "rgba(37,211,102,0.07)"

  return (
    <div className="gip-root" style={{
      width: 340, flexShrink: 0, height: "100%",
      display: "flex", flexDirection: "column",
      background: "linear-gradient(180deg, #0d1519 0%, #0a1214 100%)",
      borderLeft: "1px solid rgba(255,255,255,0.07)",
      overflow: "hidden", zIndex: 10,
      position: "relative",
    }}>
      <style>{GIP_STYLES}</style>

      {/* ── Subtle background mesh ── */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
        background: `radial-gradient(ellipse 60% 40% at 50% -10%, rgba(37,211,102,0.07) 0%, transparent 70%),
                     radial-gradient(ellipse 40% 30% at 100% 60%, rgba(37,211,102,0.04) 0%, transparent 60%)`,
      }} />

      {/* ── Topbar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 14px 12px 10px",
        background: "rgba(13,21,25,0.9)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        flexShrink: 0, position: "relative", zIndex: 2,
        backdropFilter: "blur(12px)",
      }}>
        <button onClick={toggleRightPanel} style={{
          width: 34, height: 34, borderRadius: 10,
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
          cursor: "pointer", color: "rgba(255,255,255,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.15s", flexShrink: 0,
        }}
          onMouseEnter={e => { e.currentTarget.style.background="rgba(255,255,255,0.1)"; e.currentTarget.style.color="#fff" }}
          onMouseLeave={e => { e.currentTarget.style.background="rgba(255,255,255,0.05)"; e.currentTarget.style.color="rgba(255,255,255,0.6)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#f0f4f8", letterSpacing: -0.2 }}>Info Grup</div>
          {memberCount > 0 && <div style={{ fontSize: 10, color: "rgba(37,211,102,0.7)", marginTop: 1, fontWeight: 600 }}>{memberCount} anggota</div>}
        </div>
        {/* Refresh button */}
        <button onClick={() => fetchMeta(jid)} title="Refresh" style={{
          width: 30, height: 30, borderRadius: 8,
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
          cursor: "pointer", color: "rgba(255,255,255,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.background="rgba(37,211,102,0.1)"; e.currentTarget.style.color=G }}
          onMouseLeave={e => { e.currentTarget.style.background="rgba(255,255,255,0.04)"; e.currentTarget.style.color="rgba(255,255,255,0.4)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>

      {/* ── Scrollable content ── */}
      <div className="gip-scroll" style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 1 }}>

        {/* Loading state */}
        {loading && !meta && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, paddingTop: 80 }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%",
              border: "2px solid rgba(37,211,102,0.12)", borderTopColor: G,
              animation: "gip-spin 0.8s linear infinite",
            }} />
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", letterSpacing: 0.3 }}>Memuat info grup…</div>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div style={{ padding: 28, textAlign: "center", animation: "gip-fade-in 0.3s ease" }}>
            <div style={{
              width: 52, height: 52, borderRadius: 16, margin: "0 auto 16px",
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
            }}>⚠️</div>
            <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 16, lineHeight: 1.5 }}>{error}</div>
            <button className="gip-btn-primary" style={{ maxWidth: 140, margin: "0 auto" }} onClick={() => fetchMeta(jid)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              Coba lagi
            </button>
          </div>
        )}

        {/* ── Main content ── */}
        {(meta || chat) && !loading && (
          <div style={{ animation: "gip-slide-in 0.3s ease" }}>

            {/* ── Hero section ── */}
            <div style={{
              padding: "28px 20px 22px",
              display: "flex", flexDirection: "column", alignItems: "center",
              position: "relative",
              background: "linear-gradient(180deg, rgba(37,211,102,0.05) 0%, transparent 100%)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}>
              {/* Decorative ring behind avatar */}
              <div style={{
                position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
                width: 126, height: 126, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(37,211,102,0.12) 0%, transparent 70%)",
                pointerEvents: "none",
              }} />
              <div className="gip-hero-avatar">
                <GroupAvatarPicker jid={jid} name={groupName} size={96} isAdmin={isAdmin} />
              </div>
              {isAdmin && (
                <div style={{
                  marginTop: 6, fontSize: 10, color: "rgba(37,211,102,0.5)",
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                  Klik foto untuk ubah
                </div>
              )}

              <div style={{
                marginTop: 14, fontSize: 19, fontWeight: 800, color: "#f0f4f8",
                textAlign: "center", lineHeight: 1.25, letterSpacing: -0.4,
                maxWidth: 260,
              }}>
                {groupName}
              </div>

              <div style={{
                marginTop: 6, display: "flex", alignItems: "center", gap: 6,
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "4px 10px", borderRadius: 20,
                  background: G2, border: `1px solid rgba(37,211,102,0.25)`,
                  fontSize: 11, fontWeight: 700, color: G,
                }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  {memberCount} anggota
                </div>
                {isAdmin && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "4px 10px", borderRadius: 20,
                    background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)",
                    fontSize: 11, fontWeight: 700, color: "#f59e0b",
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    Admin
                  </div>
                )}
              </div>
            </div>

            {/* ── Description ── */}
            {meta?.desc && (
              <div style={{ padding: "14px 14px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(37,211,102,0.6)", letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 8 }}>Deskripsi</div>
                <div style={{
                  fontSize: 12.5, color: "rgba(255,255,255,0.65)", lineHeight: 1.65,
                  whiteSpace: "pre-wrap", background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10,
                  padding: "10px 12px",
                }}>
                  {meta.desc}
                </div>
                {meta.descTime && (
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 6, textAlign: "right" }}>
                    Diperbarui {fmtDate(meta.descTime)}
                  </div>
                )}
              </div>
            )}

            {/* ── Settings ── */}
            <div style={{ padding: "4px 0 8px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <SectionLabel label="Pengaturan Grup" />
              <div style={{ padding: "0 0 4px" }}>
                {settingItems.map((item, i) => <SettingRow key={i} {...item} />)}
              </div>
            </div>

            {/* ── Invite link ── */}
            <div style={{ padding: "4px 0 4px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <SectionLabel label="Undangan" />
              <InviteLinkRow jid={jid} />
            </div>

            {/* ── Status upload ── */}
            <div style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <GroupStatusUpload jid={jid} />
            </div>

            {/* ── Participants ── */}
            <div style={{ paddingBottom: 24 }}>
              <SectionLabel label={`${memberCount} Anggota`} />
              {sorted.length === 0 && !loading && (
                <div style={{ padding: "10px 20px", fontSize: 12, color: "rgba(255,255,255,0.25)", textAlign: "center" }}>
                  Data anggota belum tersedia
                </div>
              )}
              <div style={{ padding: "0 0 4px" }}>
                {sorted.map((p, i) => {
                  const participantJid = p.jid || p.id || ""
                  const meUser = (ownJid || "").split("@")[0].split(":")[0]
                  const pUser = participantJid.split("@")[0].split(":")[0]
                  const isMe = meUser && meUser === pUser
                  return (
                    <ParticipantRow
                      key={p.lid || participantJid || i}
                      p={p} contacts={contacts} chats={chats} isMe={isMe}
                    />
                  )
                })}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}