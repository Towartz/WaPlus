// src/components/SettingsPanel.jsx
// ═══════════════════════════════════════════════════════════════════════════
// Settings panel — accessible from Sidebar settings button.
// Features: Auto Download Media toggle, RAM limit slider (32–512MB),
//           Client Version detection + Update notification.
// Persists to electron userData/wplus_settings.json via IPC.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useCallback, useEffect, useRef } from "react"
import { useAppStore } from "../store/app"

// ── Toggle Switch ─────────────────────────────────────────────────────────
function Toggle({ enabled, onChange, label, description }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 0", borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ flex: 1, marginRight: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{label}</div>
        {description && (
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{description}</div>
        )}
      </div>
      <button
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        style={{
          flexShrink: 0,
          width: 40, height: 22, borderRadius: 11,
          background: enabled ? "var(--green)" : "rgba(255,255,255,0.15)",
          border: "none", cursor: "pointer",
          position: "relative", transition: "background 0.2s",
          outline: "none",
        }}
      >
        <div style={{
          position: "absolute", top: 3,
          left: enabled ? 21 : 3,
          width: 16, height: 16, borderRadius: "50%",
          background: "#fff",
          transition: "left 0.18s",
          boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
        }} />
      </button>
    </div>
  )
}

// ── Section Header ─────────────────────────────────────────────────────────
function SectionHeader({ label }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: "var(--green)",
      textTransform: "uppercase", letterSpacing: 0.8,
      marginTop: 16, marginBottom: 6,
    }}>
      {label}
    </div>
  )
}

// ── RAM Slider ─────────────────────────────────────────────────────────────
const RAM_STEPS = [32, 64, 128, 256, 384, 512]

function RamSlider({ value, onChange }) {
  const idx = RAM_STEPS.indexOf(value) !== -1 ? RAM_STEPS.indexOf(value) : 3
  const [localIdx, setLocalIdx] = useState(idx)
  const [showRestart, setShowRestart] = useState(false)

  const handleChange = useCallback((e) => {
    const i = parseInt(e.target.value, 10)
    setLocalIdx(i)
    onChange(RAM_STEPS[i])
    setShowRestart(RAM_STEPS[i] !== value)
  }, [onChange, value])

  const mb = RAM_STEPS[localIdx]
  const pct = (localIdx / (RAM_STEPS.length - 1)) * 100

  // Color: green for low, yellow for mid, orange for high
  const trackColor = mb <= 128
    ? "var(--green)"
    : mb <= 256
      ? "#f0b429"
      : "#f97316"

  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
            Batas Penggunaan RAM
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
            Kurangi untuk hemat memori, naikkan jika sering lag
          </div>
        </div>
        <div style={{
          fontSize: 13, fontWeight: 700, color: trackColor,
          background: "rgba(255,255,255,0.06)", borderRadius: 6,
          padding: "2px 10px", minWidth: 58, textAlign: "center",
        }}>
          {mb} MB
        </div>
      </div>

      {/* Slider */}
      <div style={{ position: "relative", height: 28, display: "flex", alignItems: "center" }}>
        <div style={{
          position: "absolute", left: 0, right: 0, height: 4,
          borderRadius: 2, background: "rgba(255,255,255,0.12)", overflow: "hidden",
        }}>
          <div style={{
            height: "100%", width: `${pct}%`,
            background: trackColor, borderRadius: 2,
            transition: "width 0.1s, background 0.2s",
          }} />
        </div>
        <input
          type="range"
          min={0} max={RAM_STEPS.length - 1}
          value={localIdx}
          onChange={handleChange}
          style={{
            position: "relative", width: "100%", height: 28,
            WebkitAppearance: "none", background: "transparent", cursor: "pointer",
            outline: "none", zIndex: 1,
          }}
        />
      </div>

      {/* Step labels */}
      <div style={{
        display: "flex", justifyContent: "space-between",
        marginTop: 2, paddingX: 2,
      }}>
        {RAM_STEPS.map((s) => (
          <span key={s} style={{
            fontSize: 9, color: s === mb ? trackColor : "var(--text-3)",
            fontWeight: s === mb ? 700 : 400, transition: "color 0.15s",
          }}>
            {s}
          </span>
        ))}
      </div>

      {/* Restart notice */}
      {showRestart && (
        <div style={{
          marginTop: 8, padding: "6px 10px", borderRadius: 7,
          background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.25)",
          fontSize: 11, color: "#f97316", display: "flex", alignItems: "center", gap: 6,
        }}>
          <span>⚠</span>
          <span>Perlu restart aplikasi untuk efek berlaku</span>
        </div>
      )}

      <style>{`
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px; height: 16px; border-radius: 50%;
          background: ${trackColor}; border: 2px solid rgba(255,255,255,0.3);
          box-shadow: 0 1px 6px rgba(0,0,0,0.4);
          cursor: pointer; transition: background 0.2s;
        }
        input[type=range]::-webkit-slider-thumb:hover {
          transform: scale(1.15);
        }
      `}</style>
    </div>
  )
}

// ── Update Checker ─────────────────────────────────────────────────────────
// Mengambil versi terbaru dari GitHub releases (primary: Towartz, fallback: Yuu-DevID)
// Lalu menampilkan notifikasi update lengkap jika ada versi baru.

const RELEASE_PRIMARY   = "https://api.github.com/repos/Towartz/WaPlus/releases/latest"
const RELEASE_SECONDARY = "https://api.github.com/repos/Yuu-DevID/WaPlus/releases/latest"
const RELEASE_PAGE_PRIMARY   = "https://github.com/Towartz/WaPlus/releases"
const RELEASE_PAGE_SECONDARY = "https://github.com/Yuu-DevID/WaPlus/releases"

function semverGt(a, b) {
  // Returns true if version a > version b (simple semver compare)
  const parse = v => (v || "0").replace(/^v/i, "").replace(/[-_+][^.]*$/g, "").split(".").map(n => parseInt(n) || 0)
  const [a1, a2, a3] = parse(a)
  const [b1, b2, b3] = parse(b)
  if (a1 !== b1) return a1 > b1
  if (a2 !== b2) return a2 > b2
  return a3 > b3
}

function UpdateChecker({ currentVersion }) {
  const [state, setState]         = useState("idle")
  const [releases, setReleases]   = useState([])   // full sorted list
  const [expanded, setExpanded]   = useState({})   // { [tag]: bool }
  const [showAll,  setShowAll]    = useState(false)
  const checkedRef                = useRef(false)
  const { setHasUpdate }          = useAppStore()

  // ── Fetch all releases (both strategies) ─────────────────────────────────
  const fetchAll = useCallback(async () => {
    // Strategy 1: Electron IPC — returns releases[] array
    if (typeof window.api?.checkUpdate === "function") {
      try {
        const r = await window.api.checkUpdate()
        if (r?.ok && r?.releases?.length) return r.releases
        if (r?.ok && r?.tag_name) return [r] // fallback single
      } catch (_) {}
    }
    // Strategy 2: Direct fetch from browser (CORS ok on api.github.com)
    const ENDPOINTS = [
      "https://api.github.com/repos/Towartz/WaPlus/releases?per_page=20",
      "https://api.github.com/repos/Yuu-DevID/WaPlus/releases?per_page=20",
    ]
    for (const url of ENDPOINTS) {
      try {
        const res  = await fetch(url, { headers: { Accept: "application/vnd.github.v3+json" }, signal: AbortSignal.timeout(10000) })
        const list = await res.json()
        if (res.ok && Array.isArray(list) && list.length)
          return list
            .filter(r => !r.draft)
            .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
            .map(r => ({ tag_name: r.tag_name, name: r.name || r.tag_name, body: r.body || "", html_url: r.html_url || "", published_at: r.published_at || "", prerelease: r.prerelease || false }))
      } catch (_) {}
    }
    return null
  }, [])

  const checkForUpdates = useCallback(async () => {
    if (state === "checking") return
    setState("checking")
    setReleases([])
    try {
      const list = await fetchAll()
      if (!list) { setState("offline"); return }
      if (list.length === 0) { setState("noRelease"); return }

      setReleases(list)

      // Pick best (stable preferred, newest first)
      const stable = list.filter(r => !r.prerelease)
      const best   = stable.length ? stable[0] : list[0]
      const isNewer = currentVersion ? semverGt(best.tag_name, currentVersion) : false

      if (isNewer) {
        setHasUpdate({ tag_name: best.tag_name, name: best.name, html_url: best.html_url, prerelease: best.prerelease })
        setState("updateAvailable")
      } else {
        setState("upToDate")
      }
    } catch (_) { setState("offline") }
  }, [state, currentVersion, fetchAll, setHasUpdate])

  useEffect(() => {
    if (!checkedRef.current) { checkedRef.current = true; checkForUpdates() }
  }, [])

  const fmtDate = iso => {
    if (!iso) return ""
    return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
  }
  const fmtRelative = iso => {
    if (!iso) return ""
    const diff = Date.now() - new Date(iso)
    const d = Math.floor(diff / 86400000)
    if (d === 0) return "Hari ini"
    if (d === 1) return "Kemarin"
    if (d < 7)  return `${d} hari lalu`
    if (d < 30) return `${Math.floor(d/7)} minggu lalu`
    if (d < 365) return `${Math.floor(d/30)} bulan lalu`
    return `${Math.floor(d/365)} tahun lalu`
  }

  const toggleExpand = tag => setExpanded(e => ({ ...e, [tag]: !e[tag] }))

  const parseChangelog = body => body
    .split("\n")
    .map(l => l.trim())
    .filter(l => l && l.length > 1)

  const renderChangelogLine = (line, i) => {
    const isH2   = line.startsWith("## ")
    const isH3   = line.startsWith("### ")
    const isBullet = line.startsWith("- ") || line.startsWith("* ")
    const text   = isH2 ? line.slice(3) : isH3 ? line.slice(4) : isBullet ? line.slice(2) : line
    if (isH2) return (
      <div key={i} style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", marginTop: 10, marginBottom: 4, letterSpacing: 0.5, textTransform: "uppercase" }}>{text}</div>
    )
    if (isH3) return (
      <div key={i} style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginTop: 7, marginBottom: 3 }}>{text}</div>
    )
    return (
      <div key={i} style={{ display: "flex", gap: 7, alignItems: "flex-start", padding: "2px 0" }}>
        <span style={{ color: "var(--green)", flexShrink: 0, fontSize: 12, lineHeight: "18px" }}>›</span>
        <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>{text}</span>
      </div>
    )
  }

  // ── Header bar (persistent across all states) ─────────────────────────────
  const HeaderBar = ({ children }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 500 }}>
        {state === "checking" ? "Menghubungi GitHub..." :
         state === "offline"  ? "Gagal terhubung" :
         state === "noRelease"? "Belum ada release" :
         releases.length > 0  ? `${releases.length} release ditemukan` : ""}
      </div>
      <button onClick={checkForUpdates} disabled={state === "checking"} style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "5px 11px", borderRadius: 7, fontSize: 11, fontWeight: 600,
        border: "1px solid rgba(37,211,102,0.25)", background: "rgba(37,211,102,0.07)",
        color: state === "checking" ? "rgba(37,211,102,0.3)" : "var(--green)",
        cursor: state === "checking" ? "not-allowed" : "pointer",
      }}>
        {state === "checking"
          ? <div style={{ width: 9, height: 9, borderRadius: "50%", border: "1.5px solid rgba(37,211,102,0.15)", borderTopColor: "var(--green)", animation: "sp-spin 0.7s linear infinite" }} />
          : <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        }
        {state === "checking" ? "Memeriksa..." : "Refresh"}
      </button>
    </div>
  )

  // ── CHECKING / IDLE ───────────────────────────────────────────────────────
  if (state === "idle" || state === "checking") {
    return (
      <div style={{ paddingTop: 10 }}>
        <HeaderBar />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{
              borderRadius: 12, padding: "14px 16px",
              background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)",
              animation: "sp-shimmer 1.5s ease-in-out infinite",
              opacity: 1 - i * 0.2,
            }}>
              <div style={{ height: 12, width: `${70 - i*15}%`, borderRadius: 4, background: "rgba(255,255,255,0.06)", marginBottom: 8 }} />
              <div style={{ height: 9, width: "40%", borderRadius: 3, background: "rgba(255,255,255,0.04)" }} />
            </div>
          ))}
        </div>
        <style>{`@keyframes sp-shimmer { 0%,100%{opacity:.6} 50%{opacity:1} } @keyframes sp-spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // ── OFFLINE ───────────────────────────────────────────────────────────────
  if (state === "offline") {
    return (
      <div style={{ paddingTop: 10 }}>
        <HeaderBar />
        <div style={{
          borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.02)", overflow: "hidden",
        }}>
          <div style={{ padding: "12px 14px", background: "rgba(100,116,139,0.06)", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#475569", flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.45)" }}>Tidak Ada Koneksi</span>
          </div>
          <div style={{ padding: "10px 14px 14px" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>Cek koneksi internet lalu refresh. Atau buka langsung:</div>
            {[
              { label: "Towartz/WaPlus", url: RELEASE_PAGE_PRIMARY, tag: "Resmi" },
              { label: "Yuu-DevID/WaPlus", url: RELEASE_PAGE_SECONDARY, tag: "Mirror" },
            ].map(({ label, url, tag }) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 8, marginBottom: 5, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.8" strokeLinecap="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
                  <span style={{ flex: 1, fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>{label}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 6px", borderRadius: 20, background: tag === "Resmi" ? "rgba(37,211,102,0.1)" : "rgba(255,255,255,0.05)", color: tag === "Resmi" ? "var(--green)" : "rgba(255,255,255,0.3)", border: tag === "Resmi" ? "1px solid rgba(37,211,102,0.2)" : "1px solid rgba(255,255,255,0.08)" }}>{tag}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── NO RELEASE YET ────────────────────────────────────────────────────────
  if (state === "noRelease") {
    return (
      <div style={{ paddingTop: 10 }}>
        <HeaderBar />
        <div style={{ borderRadius: 12, border: "1px solid rgba(99,102,241,0.2)", background: "rgba(99,102,241,0.04)", padding: "20px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(165,180,252,0.9)", marginBottom: 4 }}>Belum Ada Release</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", lineHeight: 1.7 }}>Repo terdeteksi tapi belum ada release dipublish. Pantau halaman berikut:</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center" }}>
            {[{ label: "Towartz", url: RELEASE_PAGE_PRIMARY }, { label: "Yuu-DevID", url: RELEASE_PAGE_SECONDARY }].map(({ label, url }) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                <div style={{ padding: "6px 13px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", color: "#a5b4fc", cursor: "pointer" }}>{label}</div>
              </a>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── RELEASES LIST (upToDate + updateAvailable) ────────────────────────────
  const latestStable = releases.find(r => !r.prerelease)
  const latest       = releases[0]
  const best         = latestStable || latest
  const isNewer      = best && currentVersion ? semverGt(best.tag_name, currentVersion) : false
  const visibleList  = showAll ? releases : releases.slice(0, 4)

  return (
    <div style={{ paddingTop: 10 }}>
      <HeaderBar />

      {/* ── Status banner ── */}
      {isNewer ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", borderRadius: 11, marginBottom: 14,
          background: "linear-gradient(135deg, rgba(37,211,102,0.12), rgba(37,211,102,0.04))",
          border: "1.5px solid rgba(37,211,102,0.3)",
        }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: "rgba(37,211,102,0.15)", border: "1px solid rgba(37,211,102,0.25)", display: "flex", alignItems: "center", justifyContent: "center", animation: "sp-bounce 2s ease-in-out infinite" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--green)", display: "flex", alignItems: "center", gap: 7 }}>
              Update Tersedia! 🎉
              {best?.prerelease && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 20, background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" }}>PRE</span>}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ textDecoration: "line-through", color: "rgba(255,255,255,0.2)" }}>{currentVersion}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              <span style={{ color: "var(--green)", fontWeight: 700 }}>{best?.tag_name}</span>
            </div>
          </div>
          <a href={best?.html_url || RELEASE_PAGE_PRIMARY} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
            <div style={{ padding: "7px 13px", borderRadius: 8, fontSize: 11.5, fontWeight: 700, background: "rgba(37,211,102,0.18)", border: "1.5px solid rgba(37,211,102,0.4)", color: "var(--green)", cursor: "pointer", whiteSpace: "nowrap" }}>Download</div>
          </a>
        </div>
      ) : (
        <div style={{
          display: "flex", alignItems: "center", gap: 9,
          padding: "9px 14px", borderRadius: 11, marginBottom: 14,
          background: "rgba(37,211,102,0.05)", border: "1px solid rgba(37,211,102,0.15)",
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--green)" }}>Sudah versi terbaru</span>
          <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.25)" }}>· {currentVersion}</span>
        </div>
      )}

      {/* ── Release timeline ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {visibleList.map((rel, idx) => {
          const isLatest  = idx === 0
          const isCurrent = currentVersion && rel.tag_name.replace(/^v/i,"").replace(/[-_+][^.]*$/,"") === currentVersion.replace(/^v/i,"").replace(/[-_+][^.]*$/,"")
          const isOlder   = currentVersion ? !semverGt(rel.tag_name, currentVersion) && !isCurrent : false
          const clLines   = parseChangelog(rel.body)
          const isOpen    = expanded[rel.tag_name]

          return (
            <div key={rel.tag_name} style={{
              borderRadius: 12, overflow: "hidden",
              border: isLatest && isNewer
                ? "1.5px solid rgba(37,211,102,0.3)"
                : isCurrent
                ? "1px solid rgba(37,211,102,0.2)"
                : "1px solid rgba(255,255,255,0.07)",
              background: isLatest && isNewer
                ? "rgba(37,211,102,0.04)"
                : isCurrent
                ? "rgba(37,211,102,0.025)"
                : "rgba(255,255,255,0.02)",
              opacity: isOlder && !isCurrent ? 0.7 : 1,
              transition: "all 0.15s",
            }}>
              {/* Release header row */}
              <div style={{ padding: "11px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                {/* Version dot */}
                <div style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: isLatest && isNewer ? "var(--green)"
                    : isCurrent ? "rgba(37,211,102,0.6)"
                    : "rgba(255,255,255,0.15)",
                  boxShadow: isLatest && isNewer ? "0 0 6px var(--green)" : "none",
                }} />

                {/* Version + badges */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: isOlder && !isCurrent ? "rgba(255,255,255,0.4)" : "var(--text-1)", fontFamily: "monospace" }}>
                      {rel.tag_name}
                    </span>
                    {isLatest && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 20, background: "rgba(37,211,102,0.15)", color: "var(--green)", border: "1px solid rgba(37,211,102,0.3)", letterSpacing: 0.3 }}>LATEST</span>}
                    {isCurrent && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 20, background: "rgba(37,211,102,0.1)", color: "rgba(37,211,102,0.8)", border: "1px solid rgba(37,211,102,0.2)", letterSpacing: 0.3 }}>TERPASANG</span>}
                    {rel.prerelease && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 20, background: "rgba(245,158,11,0.1)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)", letterSpacing: 0.3 }}>PRE</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                    {rel.name && rel.name !== rel.tag_name && (
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: 500 }}>{rel.name}</span>
                    )}
                    <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.25)" }}>{fmtDate(rel.published_at)}</span>
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", fontStyle: "italic" }}>{fmtRelative(rel.published_at)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <a href={rel.html_url || RELEASE_PAGE_PRIMARY} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                    <div style={{ padding: "5px 10px", borderRadius: 7, fontSize: 10.5, fontWeight: 600, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.45)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      GitHub
                    </div>
                  </a>
                  {clLines.length > 0 && (
                    <button onClick={() => toggleExpand(rel.tag_name)} style={{
                      width: 26, height: 26, borderRadius: 7, border: "1px solid rgba(255,255,255,0.09)",
                      background: isOpen ? "rgba(37,211,102,0.08)" : "rgba(255,255,255,0.04)",
                      color: isOpen ? "var(--green)" : "rgba(255,255,255,0.35)",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Changelog panel */}
              {isOpen && clLines.length > 0 && (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "10px 14px 12px", background: "rgba(0,0,0,0.15)", animation: "sp-fadein 0.15s ease" }}>
                  {clLines.map((line, i) => renderChangelogLine(line, i))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Show more / less */}
      {releases.length > 4 && (
        <button onClick={() => setShowAll(s => !s)} style={{
          width: "100%", marginTop: 10, padding: "9px 0", borderRadius: 9,
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
          color: "rgba(255,255,255,0.4)", fontSize: 11.5, fontWeight: 600,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          transition: "all 0.15s",
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transform: showAll ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
          {showAll ? "Tampilkan lebih sedikit" : `Lihat ${releases.length - 4} release lainnya`}
        </button>
      )}

      {/* Mirror link */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.8" strokeLinecap="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
        <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.25)" }}>Mirror:</span>
        <a href={RELEASE_PAGE_SECONDARY} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
          <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>Yuu-DevID/WaPlus</span>
        </a>
      </div>

      <style>{`
        @keyframes sp-spin    { to { transform: rotate(360deg) } }
        @keyframes sp-bounce  { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
        @keyframes sp-fadein  { from { opacity:0; transform:translateY(-4px) } to { opacity:1; transform:translateY(0) } }
        @keyframes sp-shimmer { 0%,100% { opacity:.5 } 50% { opacity:1 } }
      `}</style>
    </div>
  )
}


// ── Main Settings Panel ────────────────────────────────────────────────────
export default function SettingsPanel({ onClose, initialTab = "settings" }) {
  const { autoDownloadMedia, setAutoDownloadMedia, ramLimitMb, setRamLimitMb, hasUpdate, updateDismissed } = useAppStore()
  const [activeTab, setActiveTab] = useState(initialTab)
  const [autoViewStatus, setAutoViewStatusLocal] = useState(false)
  const [autoViewLoaded, setAutoViewLoaded] = useState(false)
  const [clientVersion, setClientVersion] = useState(null)

  // Load auto-view setting on mount
  useState(() => {
    window.api?.statusGetAutoView?.().then(r => {
      if (r?.ok) { setAutoViewStatusLocal(r.enabled); setAutoViewLoaded(true) }
    }).catch(() => setAutoViewLoaded(true))
  }, [])

  // Detect client version
  useEffect(() => {
    const detect = async () => {
      if (typeof window.api?.getAppVersion === "function") {
        try {
          const r = await window.api.getAppVersion()
          if (r?.ok && r?.version) { setClientVersion(r.version); return }
        } catch (_) {}
      }
      if (window.__WPLUS_VERSION__) { setClientVersion(window.__WPLUS_VERSION__); return }
      const meta = document.querySelector('meta[name="wplus-version"]')
      if (meta?.content) { setClientVersion(meta.content); return }
      setClientVersion("v1.0.0")
    }
    detect()
  }, [])

  const handleAutoViewChange = useCallback(async (enabled) => {
    setAutoViewStatusLocal(enabled)
    await window.api?.statusSetAutoView?.({ enabled })
  }, [])

  const showUpdateBadge = hasUpdate && !updateDismissed

  const TABS = [
    {
      id: "settings",
      label: "Pengaturan",
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      ),
    },
    {
      id: "updates",
      label: "Updates",
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      ),
      badge: showUpdateBadge,
    },
  ]

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9998,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div style={{
        width: 560, borderRadius: 16,
        background: "var(--bg-panel)", border: "1px solid var(--border)",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
        overflow: "hidden",
        maxHeight: "88vh", display: "flex", flexDirection: "column",
        animation: "sp-modal-in 0.2s cubic-bezier(0.34,1.4,0.64,1) forwards",
      }}>

        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 22px 0", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", lineHeight: 1.2 }}>Pengaturan</div>
              <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 1 }}>WaPlus {clientVersion || "v1.0.0"}</div>
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8,
            border: "1px solid var(--border)", background: "transparent",
            color: "var(--text-3)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Tabs ── */}
        <div style={{
          display: "flex", gap: 4, padding: "14px 22px 0", flexShrink: 0,
          borderBottom: "1px solid var(--border)",
        }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              position: "relative",
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px 10px",
              background: "none", border: "none", cursor: "pointer",
              fontSize: 12.5, fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? "var(--green)" : "var(--text-3)",
              borderBottom: activeTab === tab.id ? "2px solid var(--green)" : "2px solid transparent",
              marginBottom: -1, transition: "all 0.15s",
            }}>
              <span style={{ opacity: activeTab === tab.id ? 1 : 0.6 }}>{tab.icon}</span>
              {tab.label}
              {tab.badge && (
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: "#ef4444", flexShrink: 0,
                  boxShadow: "0 0 5px #ef4444",
                  animation: "sp-pulse 2s ease-in-out infinite",
                }} />
              )}
            </button>
          ))}
        </div>

        {/* ── Tab Content ── */}
        <div style={{ overflowY: "auto", flex: 1 }}>

          {/* ════════ TAB: PENGATURAN ════════ */}
          {activeTab === "settings" && (
            <div style={{ padding: "6px 22px 24px" }}>
              <SectionHeader label="Status & Story" />
              <Toggle
                enabled={autoViewStatus}
                onChange={handleAutoViewChange}
                label="Auto-View Story Kontak"
                description="Story kontak otomatis ter-view saat masuk — sender akan lihat ikon 'sudah dilihat' tanpa kamu buka appnya"
              />
              {autoViewStatus && (
                <div style={{ marginTop: 8, marginBottom: 2, padding: "7px 12px", borderRadius: 8, background: "rgba(37,211,102,0.07)", border: "1px solid rgba(37,211,102,0.18)", fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
                  👁️ Aktif — semua story yang masuk akan langsung di-mark sebagai "dilihat" secara otomatis.
                </div>
              )}

              <SectionHeader label="Media" />
              <Toggle
                enabled={autoDownloadMedia}
                onChange={setAutoDownloadMedia}
                label="Unduh Media Otomatis"
                description="Jika dimatikan, foto & video harus diklik manual untuk diunduh"
              />
              {!autoDownloadMedia && (
                <div style={{ marginTop: 8, marginBottom: 2, padding: "7px 12px", borderRadius: 8, background: "rgba(37,211,102,0.07)", border: "1px solid rgba(37,211,102,0.18)", fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
                  💡 Klik pada gambar/video di gelembung pesan untuk mengunduh secara manual.
                </div>
              )}

              <SectionHeader label="Performa" />
              <RamSlider value={ramLimitMb || 256} onChange={setRamLimitMb} />
              <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", fontSize: 11, color: "var(--text-3)", lineHeight: 1.6 }}>
                <div style={{ fontWeight: 600, color: "var(--text-2)", marginBottom: 3 }}>Tips Performa:</div>
                <div>• <strong>32–128 MB</strong>: Hemat RAM, cocok PC lama</div>
                <div>• <strong>256 MB</strong>: Default, seimbang untuk kebanyakan PC</div>
                <div>• <strong>384–512 MB</strong>: Lebih lancar untuk chat ramai & banyak media</div>
              </div>
            </div>
          )}

          {/* ════════ TAB: UPDATES ════════ */}
          {activeTab === "updates" && (
            <div style={{ padding: "6px 22px 24px" }}>
              {/* Version info bar */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 14px", borderRadius: 11, marginTop: 10, marginBottom: 4,
                background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                    background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" strokeLinecap="round">
                      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-1)" }}>WaPlus Client</div>
                    <div style={{ fontSize: 10.5, color: "var(--text-3)", marginTop: 1 }}>Versi yang sedang berjalan</div>
                  </div>
                </div>
                <div style={{
                  padding: "5px 13px", borderRadius: 8, fontSize: 13, fontWeight: 800,
                  background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.25)",
                  color: "var(--green)", fontFamily: "monospace", letterSpacing: 0.5,
                }}>
                  {clientVersion || "v1.0.0"}
                </div>
              </div>

              <UpdateChecker currentVersion={clientVersion} />
            </div>
          )}

        </div>
      </div>

      <style>{`
        @keyframes sp-modal-in {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
        @keyframes sp-pulse {
          0%,100% { opacity: 1; box-shadow: 0 0 4px #ef4444; }
          50%      { opacity: 0.6; box-shadow: 0 0 10px #ef4444; }
        }
      `}</style>
    </div>
  )
}