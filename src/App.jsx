import { useEffect, useState, useCallback } from "react"
import { useAuthStore } from "./store/auth"
import { useAppStore } from "./store/app"
import Auth from "./pages/Auth"
import Main from "./pages/Main"

// ── Release fetch — same dual-strategy as SettingsPanel ───────────────────────
const RELEASE_SOURCES = [
  { url: "https://api.github.com/repos/Towartz/WaPlus/releases", pageUrl: "https://github.com/Towartz/WaPlus/releases", source: "primary" },
  { url: "https://api.github.com/repos/Yuu-DevID/WaPlus/releases", pageUrl: "https://github.com/Yuu-DevID/WaPlus/releases", source: "secondary" },
]
function semverGt(a, b) {
  const p = s => s.replace(/^v/i, "").replace(/[-_+][^.]*$/g, "").split(".").map(n => parseInt(n) || 0)
  const [a1,a2,a3] = p(a), [b1,b2,b3] = p(b)
  return a1 !== b1 ? a1 > b1 : a2 !== b2 ? a2 > b2 : a3 > b3
}

export default function App() {
  const { step, setConnectedUser, setStep } = useAuthStore()
  const { setHasUpdate } = useAppStore()
  const [checked, setChecked] = useState(false)

  // ── Background update check on every launch ───────────────────────────────
  useEffect(() => {
    const checkUpdate = async () => {
      try {
        let result = null

        // Strategy 1: Electron IPC (main process Node.js)
        if (typeof window.api?.checkUpdate === "function") {
          const r = await window.api.checkUpdate()
          if (r?.ok && r?.status === "release_found" && r?.tag_name) result = r
        }

        // Strategy 2: Direct fetch (Vite dev / fallback)
        if (!result) {
          const pickBest = (list) => {
            if (!Array.isArray(list) || !list.length) return null
            const stable = list.filter(r => !r.prerelease && !r.draft)
            const pool = stable.length ? stable : list.filter(r => !r.draft)
            return pool.sort((a, b) => new Date(b.published_at) - new Date(a.published_at))[0] || null
          }
          for (const { url, source, pageUrl } of RELEASE_SOURCES) {
            try {
              const res  = await fetch(url, { headers: { Accept: "application/vnd.github.v3+json" }, signal: AbortSignal.timeout(10000) })
              const list = await res.json()
              if (!res.ok || !Array.isArray(list) || !list.length) continue
              const best = pickBest(list)
              if (best?.tag_name) { result = { ok: true, status: "release_found", source, tag_name: best.tag_name, name: best.name || best.tag_name, html_url: best.html_url || pageUrl, published_at: best.published_at || "", prerelease: best.prerelease || false }; break }
            } catch (_) {}
          }
        }

        if (!result?.tag_name) return

        // Get current version
        let currentVersion = "v1.0.0"
        if (typeof window.api?.getAppVersion === "function") {
          const v = await window.api.getAppVersion()
          if (v?.ok && v?.version) currentVersion = v.version
        }
        if (window.__WPLUS_VERSION__) currentVersion = window.__WPLUS_VERSION__

        if (semverGt(result.tag_name, currentVersion)) {
          setHasUpdate({ tag_name: result.tag_name, name: result.name, html_url: result.html_url, prerelease: result.prerelease })
        }
      } catch (_) {}
    }

    // Small delay so UI renders first before hitting network
    const t = setTimeout(checkUpdate, 1500)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const init = async () => {
      try {
        if (window.api?.checkSession) {
          const res = await window.api.checkSession()
          if (res?.hasSession) setStep(3)
        }
      } catch(e) { console.error("Session check failed:", e) }
      finally { setChecked(true) }
    }
    init()
  }, [])

  useEffect(() => {
    if (!window.api) { setChecked(true); return }
    window.api.onConnected?.((data) => { setConnectedUser(data); setStep(3) })
    window.api.onLoggedOut?.(() => setStep(1))
  }, [])

  if (!checked) return (
    <div style={{height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"var(--bg-base)",gap:12}}>
      <span className="spinner spinner-green spinner-lg"/>
      <span style={{fontSize:14,color:"var(--text-3)"}}>Memuat...</span>
    </div>
  )

  return step === 3 ? <Main/> : <Auth/>
}