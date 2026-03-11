import { useAuthStore } from "../store/auth"
import { useAppStore } from "../store/app"
import { useState, useEffect, useRef } from "react"
import SettingsPanel from "./SettingsPanel"
import ProfilePanel from "./ProfilePanel"

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconChats = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
)

const IconContacts = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
)

const IconCommunity = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="7" r="3"/>
    <path d="M5.5 21v-2A3.5 3.5 0 0 1 9 15.5h6a3.5 3.5 0 0 1 3.5 3.5v2"/>
    <circle cx="5" cy="10" r="2"/>
    <path d="M2 20v-1.5A2.5 2.5 0 0 1 4.5 16"/>
    <circle cx="19" cy="10" r="2"/>
    <path d="M22 20v-1.5A2.5 2.5 0 0 0 19.5 16"/>
  </svg>
)

const IconSettings = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
)

const IconLogout = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
)

const IconStatus = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="3"/>
    <line x1="12" y1="2" x2="12" y2="5"/>
    <line x1="12" y1="19" x2="12" y2="22"/>
    <line x1="2" y1="12" x2="5" y2="12"/>
    <line x1="19" y1="12" x2="22" y2="12"/>
  </svg>
)

const IconChannel = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.53 2 2 0 0 1 3.55 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.69a16 16 0 0 0 6.29 6.29l.9-.9a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
)

// ── Plugin icon: modular socket / node connector ──────────────────────────────
// Looks like two interlocking circuit nodes — sleek, technical, not a cartoon puzzle piece
const IconPlugin = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {/* Left module body */}
    <rect x="2" y="7" width="8" height="10" rx="2"/>
    {/* Right module body */}
    <rect x="14" y="7" width="8" height="10" rx="2"/>
    {/* Connector pin top */}
    <path d="M10 9.5h4"/>
    {/* Connector pin bottom */}
    <path d="M10 14.5h4"/>
    {/* Left output dot */}
    <circle cx="10" cy="9.5" r="1" fill="currentColor" stroke="none"/>
    <circle cx="10" cy="14.5" r="1" fill="currentColor" stroke="none"/>
    {/* Right input dot */}
    <circle cx="14" cy="9.5" r="1" fill="currentColor" stroke="none"/>
    <circle cx="14" cy="14.5" r="1" fill="currentColor" stroke="none"/>
  </svg>
)

// ── Nav items ─────────────────────────────────────────────────────────────────
const NAV = [
  { id: "chats",       icon: <IconChats/>,     tip: "Pesan" },
  { id: "contacts",    icon: <IconContacts/>,  tip: "Kontak" },
  { id: "communities", icon: <IconCommunity/>, tip: "Komunitas" },
  { id: "channels",    icon: <IconChannel/>,   tip: "Saluran" },
  { id: "status",      icon: <IconStatus/>,    tip: "Status" },
  { id: "mods",        icon: <IconPlugin/>,    tip: "Plugin Manager" },
]

// ── Color helpers ─────────────────────────────────────────────────────────────
const ACCENT_PAIRS = [
  ["#0d3320","#22c55e"], ["#0d1f3c","#3b82f6"], ["#1e0a2e","#a855f7"],
  ["#2d0a0a","#ef4444"], ["#2d1500","#f97316"], ["#0a2010","#16a34a"],
  ["#021a1a","#06b6d4"], ["#160d30","#8b5cf6"], ["#0a1e20","#14b8a6"],
  ["#2d0a1a","#ec4899"],
]
function getAccent(s) {
  if (!s) return ACCENT_PAIRS[0]
  let h = 0
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h)
  return ACCENT_PAIRS[Math.abs(h) % ACCENT_PAIRS.length]
}
function initials(n) {
  if (!n) return "?"
  return n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase()
}

// ── Module-level self-pic cache ───────────────────────────────────────────────
let _selfPicCache = null

function _dispatchSelfPicChanged() {
  window.dispatchEvent(new CustomEvent("aurora:self-pic-changed"))
}

export function invalidateSelfPicCache(newUrl) {
  _selfPicCache = newUrl !== undefined ? (newUrl || "") : null
  _dispatchSelfPicChanged()
}

// ── SelfAvatar ────────────────────────────────────────────────────────────────
function SelfAvatar({ jid, name }) {
  const [bg, accent] = getAccent(name)
  const [picUrl, setPicUrl] = useState(_selfPicCache)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    if (_selfPicCache !== null) { setPicUrl(_selfPicCache); return }

    fetchedRef.current = true
    let cancelled = false

    async function load() {
      try {
        const localRes = await window.api?.getOwnPic?.()
        if (!cancelled && localRes?.ok && localRes.path) {
          const url = localRes.path + "?t=" + Date.now()
          _selfPicCache = url
          setPicUrl(url)
          return
        }
      } catch (_) {}

      if (cancelled) return

      if (!jid) { _selfPicCache = ""; if (!cancelled) setPicUrl(""); return }
      try {
        const res = await window.api?.getProfilePic?.({ jid })
        if (!cancelled) {
          const url = res?.url || ""
          _selfPicCache = url
          setPicUrl(url)
        }
      } catch (_) {
        if (!cancelled) { _selfPicCache = ""; setPicUrl("") }
      }
    }

    load()
    return () => { cancelled = true }
  }, [jid])

  useEffect(() => {
    const unsubIpc = window.api?.onProfilePicUpdated?.((_, payload) => {
      if (payload?.isGroup) return
      const newUrl = payload?.url || ""
      _selfPicCache = newUrl
      fetchedRef.current = false
      setPicUrl(newUrl)
    })
    const onDom = () => { setPicUrl(_selfPicCache || "") }
    window.addEventListener("aurora:self-pic-changed", onDom)
    return () => {
      unsubIpc?.()
      window.removeEventListener("aurora:self-pic-changed", onDom)
    }
  }, [])

  if (picUrl) {
    return (
      <div className="sb-avatar" title={name}>
        <img
          src={picUrl}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", display: "block" }}
          onError={() => { _selfPicCache = ""; setPicUrl("") }}
        />
      </div>
    )
  }

  return (
    <div
      className="sb-avatar"
      title={name}
      style={{
        background: `radial-gradient(135deg at 30% 30%, ${accent}50, ${bg})`,
        border: `1.5px solid ${accent}40`,
        color: accent,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.5,
      }}
    >
      {initials(name)}
    </div>
  )
}

// ── NavButton ─────────────────────────────────────────────────────────────────
function NavButton({ active, onClick, title, children, danger }) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      className="sb-nav-btn"
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-active={active}
      data-danger={danger}
      style={{
        position: "relative",
        color: active
          ? "var(--sb-accent)"
          : hovered
          ? "rgba(255,255,255,0.75)"
          : "rgba(255,255,255,0.32)",
        background: active
          ? "rgba(255,255,255,0.06)"
          : hovered
          ? "rgba(255,255,255,0.04)"
          : "transparent",
      }}
    >
      {active && (
        <span style={{
          position: "absolute",
          left: 0, top: "50%", transform: "translateY(-50%)",
          width: 2.5, height: 18,
          background: "var(--sb-accent)",
          borderRadius: "0 2px 2px 0",
        }} />
      )}
      {children}
    </button>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────────
const SbDivider = () => (
  <div style={{
    width: 22, height: 1,
    background: "rgba(255,255,255,0.07)",
    margin: "4px auto",
    flexShrink: 0,
  }} />
)

// ── Sidebar ───────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const { navTab, setNavTab, hasUpdate, updateInfo, updateDismissed, dismissUpdate } = useAppStore()
  const { connectedUser } = useAuthStore()
  const name = connectedUser?.name || connectedUser?.pushName || "Me"
  const jid  = connectedUser?.jid  || null
  const [, accent] = getAccent(name)

  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab,  setSettingsTab]  = useState("settings")
  const [showProfile,  setShowProfile]  = useState(false)
  const [toastVisible, setToastVisible] = useState(false)
  const [toastOut,     setToastOut]     = useState(false)
  const toastTimer = useRef(null)

  // Show toast when update is first detected
  useEffect(() => {
    if (hasUpdate && !updateDismissed) {
      setToastVisible(true)
      setToastOut(false)
      clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => {
        setToastOut(true)
        setTimeout(() => setToastVisible(false), 350)
      }, 6000)
    }
  }, [hasUpdate, updateDismissed])

  const handleDismissToast = () => {
    clearTimeout(toastTimer.current)
    setToastOut(true)
    setTimeout(() => setToastVisible(false), 350)
    dismissUpdate()
  }

  const handleOpenSettings = (tab = "settings") => {
    setSettingsTab(tab)
    setShowSettings(true)
    handleDismissToast()
  }

  const handleLogout = () => {
    if (window.confirm("Keluar dari AuroraChat?")) window.api?.logout?.()
  }

  return (
    <>
      <div
        className="sidebar"
        style={{ "--sb-accent": accent }}
      >
        {/* Logo */}
        <div className="sb-logo" title="AuroraChat">
          <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
            <path
              d="M10 1C5.03 1 1 5.03 1 10c0 1.66.45 3.2 1.23 4.54L1 19l4.6-1.2A8.97 8.97 0 0010 19c4.97 0 9-4.03 9-9s-4.03-9-9-9z"
              fill="white" fillOpacity=".9"
            />
            <circle cx="7"  cy="10" r="1.1" fill={accent}/>
            <circle cx="10" cy="10" r="1.1" fill={accent}/>
            <circle cx="13" cy="10" r="1.1" fill={accent}/>
          </svg>
        </div>

        <SbDivider />

        {/* Primary nav */}
        {NAV.map(item => (
          <NavButton
            key={item.id}
            active={navTab === item.id}
            title={item.tip}
            onClick={() => setNavTab(item.id)}
          >
            {item.icon}
          </NavButton>
        ))}

        <div style={{ flex: 1 }} />

        <SbDivider />

        {/* Settings */}
        <NavButton title="Pengaturan" onClick={handleOpenSettings}>
          <IconSettings />
          {hasUpdate && !updateDismissed && (
            <span style={{
              position: "absolute", top: 5, right: 5,
              width: 8, height: 8, borderRadius: "50%",
              background: "#ef4444",
              border: "1.5px solid var(--bg-base, #0a1929)",
              boxShadow: "0 0 6px #ef4444",
              animation: "badge-pulse 2s ease-in-out infinite",
            }} />
          )}
        </NavButton>

        {/* Logout */}
        <NavButton title="Keluar" onClick={handleLogout} danger>
          <IconLogout />
        </NavButton>

        <SbDivider />

        {/* Avatar */}
        <button
          onClick={() => setShowProfile(true)}
          title="Profil saya"
          className="sb-avatar-btn"
        >
          <SelfAvatar jid={jid} name={name} />
        </button>
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} initialTab={settingsTab} />}
      {showProfile  && <ProfilePanel  onClose={() => setShowProfile(false)}  />}

      {/* ── Update toast notification ── */}
      {toastVisible && hasUpdate && updateInfo && (
        <div style={{
          position: "fixed", bottom: 24, left: 72, zIndex: 9999,
          animation: toastOut ? "toast-out 0.35s ease forwards" : "toast-in 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards",
          maxWidth: 300, minWidth: 260,
        }}>
          <div style={{
            background: "linear-gradient(135deg, #0d1f15 0%, #0a1a10 100%)",
            border: "1.5px solid rgba(37,211,102,0.35)",
            borderRadius: 14,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(37,211,102,0.08)",
            overflow: "hidden",
          }}>
            {/* Green top accent line */}
            <div style={{ height: 2, background: "linear-gradient(90deg, var(--green), rgba(37,211,102,0.2))" }} />

            <div style={{ padding: "12px 14px" }}>
              {/* Header row */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                  background: "rgba(37,211,102,0.12)", border: "1px solid rgba(37,211,102,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  animation: "icon-bounce 2s ease-in-out infinite",
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--green)", display: "flex", alignItems: "center", gap: 6 }}>
                    Update Tersedia!
                    {updateInfo.prerelease && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 20, background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" }}>
                        PRE
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.6)", marginTop: 2, fontWeight: 500 }}>
                    {updateInfo.name || updateInfo.tag_name}
                  </div>
                </div>
                <button onClick={handleDismissToast} style={{
                  background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0,
                  color: "rgba(255,255,255,0.25)", lineHeight: 1,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 7 }}>
                <button onClick={() => handleOpenSettings("updates")} style={{
                  flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 11.5, fontWeight: 700,
                  background: "rgba(37,211,102,0.15)", border: "1.5px solid rgba(37,211,102,0.35)",
                  color: "var(--green)", cursor: "pointer",
                }}>Lihat Detail</button>
                <a href={updateInfo.html_url || "https://github.com/Towartz/WaPlus/releases"} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", flex: 1 }}>
                  <button style={{
                    width: "100%", padding: "7px 0", borderRadius: 8, fontSize: 11.5, fontWeight: 700,
                    background: "linear-gradient(135deg, rgba(37,211,102,0.3), rgba(37,211,102,0.15))",
                    border: "1.5px solid rgba(37,211,102,0.4)",
                    color: "var(--green)", cursor: "pointer",
                  }}>Download</button>
                </a>
              </div>
            </div>

            {/* Progress bar — auto dismiss countdown */}
            <div style={{ height: 2, background: "rgba(255,255,255,0.04)" }}>
              <div style={{
                height: "100%", background: "rgba(37,211,102,0.4)",
                animation: "toast-progress 6s linear forwards",
              }} />
            </div>
          </div>
        </div>
      )}

      <style>{`
        .sidebar {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 52px;
          min-width: 52px;
          height: 100%;
          background: var(--bg-sidebar, #0e0f12);
          border-right: 1px solid rgba(255,255,255,0.055);
          padding: 10px 0 12px;
          gap: 2px;
          box-sizing: border-box;
          user-select: none;
        }

        .sb-logo {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 2px;
          flex-shrink: 0;
          transition: background 0.15s;
          cursor: default;
        }
        .sb-logo:hover {
          background: rgba(255,255,255,0.09);
        }

        @keyframes badge-pulse {
          0%,100% { box-shadow: 0 0 4px #ef4444; opacity: 1; }
          50%      { box-shadow: 0 0 10px #ef4444; opacity: 0.7; }
        }
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(-16px) scale(0.95); }
          to   { opacity: 1; transform: translateX(0)    scale(1); }
        }
        @keyframes toast-out {
          from { opacity: 1; transform: translateX(0)    scale(1); }
          to   { opacity: 0; transform: translateX(-12px) scale(0.95); }
        }
        @keyframes toast-progress {
          from { width: 100%; }
          to   { width: 0%; }
        }
        @keyframes icon-bounce {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-2px); }
        }
        .sb-nav-btn {
          width: 36px;
          height: 36px;
          border-radius: 9px;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.13s, color 0.13s;
          flex-shrink: 0;
          padding: 0;
        }

        .sb-nav-btn[data-danger="true"]:hover {
          color: #f87171 !important;
          background: rgba(248,113,113,0.08) !important;
        }

        .sb-avatar-btn {
          background: none;
          border: none;
          padding: 0;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          outline: none;
          margin-top: 2px;
        }
        .sb-avatar-btn:focus-visible {
          box-shadow: 0 0 0 2px var(--sb-accent, #22c55e);
        }

        .sb-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: box-shadow 0.15s, transform 0.15s;
          overflow: hidden;
          flex-shrink: 0;
        }
        .sb-avatar-btn:hover .sb-avatar {
          box-shadow: 0 0 0 2px var(--sb-accent, #22c55e);
          transform: scale(1.05);
        }
      `}</style>
    </>
  )
}