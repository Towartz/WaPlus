// src/components/bubble/MiscBubble.jsx
// ═══════════════════════════════════════════════════════════════════════════
// Non-media message type bubbles — fully implements all fields from
// messageParser.js / proto-extractors.js so nothing is left as a stub.
//
// Components:
//   DocBubble             — documentMessage
//   PollBubble            — pollCreationMessage
//   LocationBubble        — locationMessage / liveLocationMessage
//   ContactBubble         — contactMessage / contactsArrayMessage
//   GroupInviteBubble     — groupInviteMessage (uses group_invite_name/code/expiry)
//   ButtonsBubble         — buttonsMessage/listMessage/interactiveMessage
//   InteractiveResponseBubble
//   OrderBubble / ProductBubble / PaymentBubble
//   CallLogBubble         — callLogMessage (call_is_video/outcome/duration/participants)
//   EventBubble           — eventMessage (name/desc/times/location/join_link/canceled)
//   PinBubble             — pinInChatMessage / keepInChatMessage
//   ScheduledCallBubble   — scheduledCallCreationMessage / scheduledCallEditMessage
//   NewsletterBubble      — newsletterAdminInviteMessage
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback } from "react"
import { RichText } from "./utils"
import {
  DocTypeIcon, HiChartBar, HiMapPin, HiUser, HiUserGroup,
  HiSpeakerWave, HiShoppingCart, HiCreditCard, HiCalendar,
  HiMegaphone, HiShoppingBag, HiPhone, HiVideoRecording,
} from "./icons"

// ════════════════════════════════════════════════════════════
// DOCUMENT BUBBLE
// ════════════════════════════════════════════════════════════
export function DocBubble({ msg }) {
  const filename = msg.media_filename || msg.body || "Dokumen"
  const ext = msg.mimetype
    ? msg.mimetype.split("/")[1]?.split(";")[0]?.toUpperCase()
    : "FILE"
  return (
    <div className="media-doc">
      <DocTypeIcon ext={ext} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="doc-name">{filename}</div>
        <div className="doc-ext">{ext || "FILE"}</div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// POLL BUBBLE
// ════════════════════════════════════════════════════════════
export function PollBubble({ msg }) {
  const opts  = msg.poll_options || []
  const total = opts.reduce((s, o) => s + (o.votes || 0), 0)
  return (
    <div className="poll-wrap">
      <div className="poll-header">
        <div style={{ color: "var(--green)" }}><HiChartBar size={20} /></div>
        <div>
          <div className="poll-title">{msg.body || "Polling"}</div>
          <div className="poll-sub">Pilih salah satu opsi</div>
        </div>
      </div>
      {opts.length > 0 ? opts.map((o, i) => {
        const pct = total > 0 ? Math.round(((o.votes || 0) / total) * 100) : 0
        return (
          <div key={i} className="poll-option">
            <div className="poll-option-top">
              <span className="poll-option-name">{o.name || o}</span>
              <span className="poll-option-pct">{pct}%</span>
            </div>
            <div className="poll-bar"><div className="poll-bar-fill" style={{ width: `${pct}%` }} /></div>
          </div>
        )
      }) : <div className="poll-sub">Buka di HP untuk melihat opsi</div>}
      {total > 0 && <div className="poll-total">{total} suara</div>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// LOCATION BUBBLE
// ════════════════════════════════════════════════════════════
export function LocationBubble({ msg }) {
  const lat  = msg.location_lat
  const lng  = msg.location_lng
  const name = msg.location_name || msg.location_address || msg.body || "Lokasi"
  const isLive = msg.msg_type === "liveLocationMessage"
  const mapsUrl = (lat && lng) ? `https://www.google.com/maps?q=${lat},${lng}` : null

  const handleClick = useCallback(() => {
    if (mapsUrl) window.open(mapsUrl, "_blank")
  }, [mapsUrl])

  return (
    <div className="media-location" onClick={handleClick}
      role={mapsUrl ? "link" : undefined}
      tabIndex={mapsUrl ? 0 : undefined}
      style={{ cursor: mapsUrl ? "pointer" : "default" }}>
      <div className="location-map">
        {lat && lng ? (
          <img
            src={`https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=200x100&markers=${lat},${lng}`}
            alt="Peta" style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 6 }}
            onError={e => { e.target.style.display = "none" }} />
        ) : (
          <div style={{ color: "var(--text-3)" }}><HiMapPin size={32} /></div>
        )}
      </div>
      <div className="location-label">
        {isLive && <span style={{ fontSize: 10, color: "var(--accent)" }}>● LIVE  </span>}
        {name}
      </div>
      {lat && lng && <div style={{ fontSize: 10, color: "var(--text-3)" }}>{lat.toFixed(5)}, {lng.toFixed(5)}</div>}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// CONTACT BUBBLE
// ════════════════════════════════════════════════════════════
export function ContactBubble({ msg }) {
  const contacts = msg.contacts_json || []
  const isArray  = msg.msg_type === "contactsArrayMessage"

  if (!contacts.length) {
    return (
      <div className="contact-msg">
        <div className="contact-icon" style={{ color: "var(--text-2)" }}><HiUser size={24} /></div>
        <div>
          <div className="contact-name">{msg.body || "Kontak"}</div>
          <div className="contact-sub">Kontak WhatsApp</div>
        </div>
      </div>
    )
  }

  return (
    <div className="contact-msg-list">
      {contacts.map((c, i) => (
        <div key={i} className="contact-msg">
          <div className="contact-icon" style={{ color: "var(--text-2)" }}><HiUser size={24} /></div>
          <div>
            <div className="contact-name">{c.displayName || "Kontak"}</div>
            <div className="contact-sub">
              {c.vcard?.match(/TEL[^:]*:([^\n]+)/)?.[1]?.trim() || "Kontak WhatsApp"}
            </div>
          </div>
        </div>
      ))}
      {isArray && contacts.length > 1 && (
        <div className="contact-count">{contacts.length} kontak</div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// GROUP INVITE BUBBLE — uses group_invite_name/code/expiry
// ════════════════════════════════════════════════════════════
export function GroupInviteBubble({ msg }) {
  const name   = msg.group_invite_name || msg.body || "Grup WhatsApp"
  const code   = msg.group_invite_code || null
  const expiry = msg.group_invite_expiry ? Number(msg.group_invite_expiry) : null
  const now    = Math.floor(Date.now() / 1000)
  const isExpired = expiry && expiry < now

  const handleJoin = useCallback(() => {
    if (!code || isExpired) return
    window.open(`https://chat.whatsapp.com/${code}`, "_blank", "noopener,noreferrer")
  }, [code, isExpired])

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 10,
      padding: "10px 12px",
      background: "rgba(37,211,102,0.06)",
      border: "1px solid rgba(37,211,102,0.18)",
      borderRadius: 12, minWidth: 220,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12, flexShrink: 0,
          background: "rgba(37,211,102,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--green)",
        }}>
          <HiUserGroup size={22} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>Grup WhatsApp</div>
        </div>
      </div>

      {isExpired ? (
        <div style={{ fontSize: 11, color: "rgba(248,113,113,0.8)", textAlign: "center", padding: "4px 0" }}>
          ⚠ Undangan telah kadaluarsa
        </div>
      ) : (
        <button
          onClick={handleJoin}
          disabled={!code}
          style={{
            padding: "7px 0", borderRadius: 8,
            background: code ? "rgba(37,211,102,0.2)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${code ? "rgba(37,211,102,0.4)" : "rgba(255,255,255,0.08)"}`,
            color: code ? "var(--green)" : "var(--text-3)",
            fontSize: 13, fontWeight: 600, cursor: code ? "pointer" : "default",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => { if (code) e.currentTarget.style.background = "rgba(37,211,102,0.3)" }}
          onMouseLeave={e => { if (code) e.currentTarget.style.background = "rgba(37,211,102,0.2)" }}
        >
          Bergabung ke Grup
        </button>
      )}

      {expiry && !isExpired && (
        <div style={{ fontSize: 10, color: "var(--text-3)", textAlign: "center" }}>
          Berlaku hingga {new Date(expiry * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// INTERACTIVE / BUTTONS BUBBLES
// ════════════════════════════════════════════════════════════
export function ButtonsBubble({ msg }) {
  return (
    <div className="buttons-bubble">
      <div className="bubble-text">{msg.body || ""}</div>
      <div className="buttons-hint" style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <HiSpeakerWave size={14} /> Pesan dengan tombol — buka di HP
      </div>
    </div>
  )
}

export function InteractiveResponseBubble({ msg }) {
  return (
    <div className="bubble-text" style={{ fontStyle: "italic", color: "var(--text-2)" }}>
      ↩ {msg.body || "Memilih opsi"}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// COMMERCE BUBBLES
// ════════════════════════════════════════════════════════════
export function OrderBubble({ msg }) {
  return (
    <div className="media-doc">
      <div className="doc-icon" style={{ color: "var(--green)" }}><HiShoppingCart size={22} /></div>
      <div>
        <div className="doc-name">{msg.body || "Pesanan"}</div>
        <div className="doc-ext">Pesanan WhatsApp</div>
      </div>
    </div>
  )
}

export function ProductBubble({ msg }) {
  return (
    <div className="media-doc">
      <div className="doc-icon" style={{ color: "var(--text-2)" }}><HiShoppingBag size={22} /></div>
      <div>
        <div className="doc-name">{msg.body || "Produk"}</div>
        <div className="doc-ext">Produk WhatsApp</div>
      </div>
    </div>
  )
}

export function PaymentBubble({ msg }) {
  return (
    <div className="media-doc">
      <div className="doc-icon" style={{ color: "var(--green)" }}><HiCreditCard size={22} /></div>
      <div>
        <div className="doc-name">{msg.body || "Pembayaran"}</div>
        <div className="doc-ext">WhatsApp Pay</div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// CALL LOG BUBBLE — uses call_is_video / call_outcome / call_duration
// ════════════════════════════════════════════════════════════
function fmtDuration(secs) {
  if (!secs || secs <= 0) return null
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}j ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// outcome → { label, color }
const CALL_OUTCOMES = {
  missed:    { label: "Tidak dijawab", color: "#ef5350" },
  rejected:  { label: "Ditolak",       color: "#ef5350" },
  accepted:  { label: "Terjawab",      color: "var(--green)" },
  completed: { label: "Selesai",       color: "var(--green)" },
}

export function CallLogBubble({ msg }) {
  const isVideo   = msg.call_is_video === 1 || msg.call_is_video === true
  const outcome   = msg.call_outcome || null
  const duration  = msg.call_duration ? fmtDuration(Number(msg.call_duration)) : null
  const outcomeInfo = outcome ? (CALL_OUTCOMES[outcome] || { label: outcome, color: "var(--text-2)" }) : null
  const isMissed  = outcome === "missed" || outcome === "rejected"

  let participants = null
  try {
    const raw = msg.call_participants
    if (raw) {
      const arr = typeof raw === "string" ? JSON.parse(raw) : raw
      if (Array.isArray(arr) && arr.length > 0) {
        participants = arr.map(j => {
          const user = j.split("@")[0].split(":")[0]
          return /^\d{6,}$/.test(user) ? `+${user}` : user
        }).join(", ")
      }
    }
  } catch (_) {}

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 10px",
    }}>
      {/* Icon — colored by outcome */}
      <div style={{
        width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
        background: isMissed ? "rgba(239,83,80,0.12)" : "rgba(37,211,102,0.12)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: isMissed ? "#ef5350" : "var(--green)",
      }}>
        {isVideo ? <HiVideoRecording size={18} /> : <HiPhone size={18} />}
      </div>

      <div style={{ minWidth: 0 }}>
        {/* Title row */}
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", display: "flex", alignItems: "center", gap: 6 }}>
          {isVideo ? "Panggilan Video" : "Panggilan Suara"}
          {outcomeInfo && (
            <span style={{ fontSize: 10, color: outcomeInfo.color, fontWeight: 500 }}>
              · {outcomeInfo.label}
            </span>
          )}
        </div>

        {/* Duration or missed note */}
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
          {duration
            ? `Durasi ${duration}`
            : isMissed
              ? "Panggilan tidak terjawab"
              : msg.body || (isVideo ? "Panggilan video" : "Panggilan suara")
          }
        </div>

        {/* Participants (group call) */}
        {participants && (
          <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
            👥 {participants}
          </div>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// EVENT BUBBLE — event_name / description / times / location / join_link / canceled
// ════════════════════════════════════════════════════════════
function fmtEventDate(ts) {
  if (!ts) return null
  const d = new Date(Number(ts) * 1000)
  if (isNaN(d)) return null
  return d.toLocaleString("id-ID", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit",
  })
}

export function EventBubble({ msg }) {
  const name       = msg.event_name || msg.body || "Acara"
  const desc       = msg.event_description || null
  const startTime  = fmtEventDate(msg.event_start_time)
  const endTime    = fmtEventDate(msg.event_end_time)
  const location   = msg.event_location || null
  const joinLink   = msg.event_join_link || null
  const isCanceled = msg.event_is_canceled === 1 || msg.event_is_canceled === true

  const handleJoin = useCallback(() => {
    if (!joinLink) return
    window.open(joinLink, "_blank", "noopener,noreferrer")
  }, [joinLink])

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 8,
      padding: "10px 12px",
      background: "rgba(99,102,241,0.07)",
      border: `1px solid ${isCanceled ? "rgba(239,83,80,0.25)" : "rgba(99,102,241,0.22)"}`,
      borderRadius: 12, minWidth: 230, maxWidth: 300,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: isCanceled ? "rgba(239,83,80,0.12)" : "rgba(99,102,241,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: isCanceled ? "#ef5350" : "#818cf8",
        }}>
          <HiCalendar size={20} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: isCanceled ? "rgba(255,255,255,0.4)" : "var(--text-1)", textDecoration: isCanceled ? "line-through" : "none", lineHeight: 1.3 }}>
            {name}
          </div>
          {isCanceled && (
            <div style={{ fontSize: 10, color: "#ef5350", marginTop: 2, fontWeight: 600 }}>DIBATALKAN</div>
          )}
        </div>
      </div>

      {/* Date/Time */}
      {(startTime || endTime) && (
        <div style={{ fontSize: 11, color: "#818cf8", display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          {startTime}{endTime && startTime !== endTime ? ` – ${endTime}` : ""}
        </div>
      )}

      {/* Location */}
      {location && (
        <div style={{ fontSize: 11, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          {location}
        </div>
      )}

      {/* Description */}
      {desc && (
        <div style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.45, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6 }}>
          {desc.length > 120 ? desc.slice(0, 120) + "…" : desc}
        </div>
      )}

      {/* Join button */}
      {joinLink && !isCanceled && (
        <button
          onClick={handleJoin}
          style={{
            padding: "7px 0", borderRadius: 8,
            background: "rgba(99,102,241,0.18)",
            border: "1px solid rgba(99,102,241,0.35)",
            color: "#a5b4fc", fontSize: 12, fontWeight: 600, cursor: "pointer",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(99,102,241,0.28)" }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(99,102,241,0.18)" }}
        >
          Gabung Acara
        </button>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// PIN BUBBLE — pinInChatMessage / keepInChatMessage
//   pin_type:  1=24h, 2=7d, 3=30d
//   keep_type: similar
// ════════════════════════════════════════════════════════════
const PIN_DURATIONS = { 1: "24 Jam", 2: "7 Hari", 3: "30 Hari" }

export function PinBubble({ msg }) {
  const isKeep  = msg.msg_type === "keepInChatMessage"
  const msgId   = isKeep ? msg.keep_msg_id : msg.pin_msg_id
  const pinType = isKeep ? msg.keep_type : msg.pin_type
  const durLabel = pinType ? (PIN_DURATIONS[pinType] || `Tipe ${pinType}`) : null

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 9,
      padding: "7px 10px",
      background: "rgba(251,191,36,0.07)",
      border: "1px solid rgba(251,191,36,0.2)",
      borderRadius: 10,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
        background: "rgba(251,191,36,0.12)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fbbf24", fontSize: 16,
      }}>
        {isKeep ? "🔒" : "📌"}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>
          {isKeep ? "Pesan Disimpan" : "Pesan Disematkan"}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 1 }}>
          {durLabel ? `Selama ${durLabel}` : isKeep ? "Tersimpan" : "Disematkan"}
          {msgId && <span style={{ marginLeft: 5, fontFamily: "monospace", opacity: 0.5 }}>{msgId.slice(0, 10)}…</span>}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// SCHEDULED CALL BUBBLE — scheduledCallCreationMessage / scheduledCallEditMessage
//   sched_call_title / sched_call_at (unix ts) / sched_call_video
// ════════════════════════════════════════════════════════════
export function ScheduledCallBubble({ msg }) {
  const isEdit    = msg.msg_type === "scheduledCallEditMessage"
  const title     = msg.sched_call_title || (msg.sched_call_video ? "Panggilan Video Terjadwal" : "Panggilan Suara Terjadwal")
  const isVideo   = msg.sched_call_video === 1 || msg.sched_call_video === true
  const schedAt   = msg.sched_call_at ? fmtEventDate(msg.sched_call_at) : null

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 8,
      padding: "10px 12px",
      background: "rgba(34,197,94,0.06)",
      border: "1px solid rgba(34,197,94,0.2)",
      borderRadius: 12, minWidth: 210,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: "rgba(34,197,94,0.12)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--green)",
        }}>
          {isVideo ? <HiVideoRecording size={20} /> : <HiPhone size={20} />}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--green)", letterSpacing: 0.3, marginBottom: 2 }}>
            {isEdit ? "JADWAL DIPERBARUI" : "PANGGILAN TERJADWAL"}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </div>
        </div>
      </div>

      {schedAt && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 11, color: "var(--text-2)",
          borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 7,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          {schedAt}
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════
// NEWSLETTER BUBBLE
// ════════════════════════════════════════════════════════════
export function NewsletterBubble({ msg }) {
  return (
    <div className="invite-msg">
      <div className="invite-icon" style={{ color: "var(--green)" }}><HiMegaphone size={24} /></div>
      <div>
        <div className="invite-title">Undangan Newsletter</div>
        <div className="invite-sub">{msg.body || "Bergabung ke channel"}</div>
      </div>
    </div>
  )
}
