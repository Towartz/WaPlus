import { useEffect, useState } from "react"
import { useAuthStore } from "../store/auth"
import { useChatStore } from "../store/chat"
import { useAppStore } from "../store/app"
import Sidebar from "../components/Sidebar"
import ChatList from "../components/ChatList"
import ChatWindow from "../components/ChatWindow"
import GroupInfoPanel from "../components/GroupInfoPanel"
import ModManagerPage from "./ModManager"
import StatusUploader from "./StatusUploader"
import MediaViewer from "../components/MediaViewer"
import StatusView from "../components/StatusView"

const CONN_STATUS = { connected:"connected", open:"connected", reconnecting:"reconnecting", close:"failed", connecting:"connecting" }

// Welcome screen when no chat selected
function WelcomeScreen({ connStatus, user }) {
  const STATUS_LABEL = { connected:"Terhubung", reconnecting:"Menyambung ulang...", failed:"Koneksi gagal", connecting:"Menghubungkan..." }
  const STATUS_COLOR = { connected:"var(--green)", reconnecting:"var(--text-warn)", failed:"var(--text-danger)", connecting:"var(--blue)" }
  const st = connStatus || "connecting"
  const name = user?.name || user?.pushName || ""

  return (
    <div className="chat-window">
      <div className="welcome-screen">
        <div className="welcome-logo anim-float">
          <svg viewBox="0 0 48 48" fill="none" width="52" height="52">
            <path d="M24 4C13 4 4 13 4 24c0 3.5.95 6.8 2.6 9.65L4 44l10.6-2.55A19.93 19.93 0 0024 44c11 0 20-9 20-20S35 4 24 4z" fill="white" fillOpacity=".15"/>
            <path d="M24 4C13 4 4 13 4 24c0 3.5.95 6.8 2.6 9.65L4 44l10.6-2.55A19.93 19.93 0 0024 44c11 0 20-9 20-20S35 4 24 4z" fill="url(#wg)" fillOpacity=".7"/>
            <defs><linearGradient id="wg" x1="4" y1="4" x2="44" y2="44"><stop stopColor="#25d366"/><stop offset="1" stopColor="#1da851"/></linearGradient></defs>
            <circle cx="17" cy="24" r="2.2" fill="white"/>
            <circle cx="24" cy="24" r="2.2" fill="white"/>
            <circle cx="31" cy="24" r="2.2" fill="white"/>
          </svg>
        </div>

        <div className="welcome-title">AuroraChat</div>
        {name && <div style={{fontSize:13,color:"var(--green)",fontWeight:600}}>Halo, {name}! 👋</div>}
        <div className="welcome-sub">Pilih percakapan di sebelah kiri untuk mulai chatting</div>

        {/* Connection status */}
        <div className="welcome-status">
          <div className={"conn-dot " + st}/>
          <span className="welcome-status-text" style={{color:STATUS_COLOR[st]||"var(--text-3)"}}>
            {STATUS_LABEL[st]||"Menghubungkan..."}
          </span>
          {st==="reconnecting" && <span className="spinner spinner-sm" style={{borderTopColor:"var(--text-warn)",borderColor:"rgba(251,191,36,.2)"}}/>}
        </div>

        {/* Tips */}
        <div className="welcome-tips">
          {[
            {icon:"💬",title:"Chat",desc:"Kirim pesan ke siapa saja"},
            {icon:"👥",title:"Grup",desc:"Kelola percakapan grup"},
            {icon:"🖼️",title:"Media",desc:"Foto, video, dokumen"},
            {icon:"🔍",title:"Cari",desc:"Temukan chat dengan cepat"},
          ].map(t=>(
            <div key={t.title} className="tip-card">
              <div className="tip-icon">{t.icon}</div>
              <div className="tip-title">{t.title}</div>
              <div className="tip-desc">{t.desc}</div>
            </div>
          ))}
        </div>

        <div style={{fontSize:10,color:"var(--text-3)",marginTop:8}}>AuroraChat · Berbasis Baileys · Bukan produk resmi WhatsApp</div>
      </div>
    </div>
  )
}

// ── Status Tab: Story viewer + Status Stories uploader ───────────────────────
function StatusTabsView() {
  // uploaderType: null (stories view) | "media" | "text"
  const [uploaderType, setUploaderType] = useState(null)

  // When dropdown fires onOpenUploader("media") or ("text"), switch to uploader
  // and pre-select the right tab inside StatusUploader
  const handleOpenUploader = (type) => setUploaderType(type || "media")

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Only show tab bar when in uploader mode */}
      {uploaderType && (
        <div style={{
          display: "flex", gap: 0, background: "var(--bg-2)",
          borderBottom: "1px solid var(--border)", flexShrink: 0, alignItems: "center",
        }}>
          <button onClick={() => setUploaderType(null)}
            style={{
              padding: "10px 14px", border: "none", background: "none", cursor: "pointer",
              fontSize: 13, color: "var(--text-2)", display: "flex", alignItems: "center", gap: 5,
              borderBottom: "2px solid transparent", transition: "all 0.15s",
            }}>
            ← Kembali
          </button>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--green)",
            borderBottom: "2px solid var(--green)", padding: "10px 18px" }}>
            📡 Status Stories
          </div>
        </div>
      )}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {!uploaderType
          ? <StatusView onOpenUploader={handleOpenUploader} />
          : <StatusUploader initialTab={uploaderType === "text" ? "text" : "image"} />
        }
      </div>
    </div>
  )
}

export default function Main() {
  const { connectedUser } = useAuthStore()
  const { loadChats, loadContacts, appendMessage, setSyncStatus } = useChatStore()
  const { activeJid, navTab, loadSettings, setNavTab, setActiveJid } = useAppStore()
  const [connStatus, setConnStatus] = useState("connecting")
  const [chatListCollapsed, setChatListCollapsed] = useState(false)

  useEffect(() => {
    // [FIX-3] Load persisted settings (auto-download etc.) from electron userData
    loadSettings?.()

    // Load from SQLite immediately on mount
    loadChats()
    loadContacts()
    if (!window.api) return

    // ── Connection events ──────────────────────────────────────
    // [FIX-CONN-STATUS] Smart status resolution:
    //   • "connected"    — only when connection:open fired (authoritative)
    //   • "reconnecting" — only when currently NOT connected
    //   • "failed"       — fatal codes (loggedOut, session mismatch) or MAX_RECONNECT
    //   • "connecting"   — initial state only; never re-enter from "connected"
    //
    // [FIX-STUCK] "Menghubungkan..." loop: onConnected fires from IPC but
    //   the React state was never set because:
    //   (a) duplicate listeners accumulate across HMR/StrictMode and cancel each other, OR
    //   (b) connection:open fires BEFORE this effect runs (race on app mount)
    //   Fix: also poll window.api.getConnectionStatus on mount as a one-shot sync,
    //   and add a 5s watchdog that reads current status if still "connecting".
    //
    // [FIX-LEAK] All listeners push cleanup tokens into unsubs[].
    const unsubs = []

    // One-shot sync: read actual backend status on mount to un-stuck "connecting"
    window.api.getConnectionStatus?.().then(st => {
      if (st === "open" || st === "connected") setConnStatus("connected")
      else if (st === "reconnecting") setConnStatus("reconnecting")
    }).catch(() => {})

    // Watchdog: if still "connecting" after 6s, re-query backend status
    // This covers the race where connection:open fired before listeners were attached.
    const watchdog = setTimeout(() => {
      setConnStatus(prev => {
        if (prev !== "connecting") return prev  // already resolved
        window.api.getConnectionStatus?.().then(st => {
          if (st === "open" || st === "connected") setConnStatus("connected")
          else if (st === "reconnecting") setConnStatus("reconnecting")
        }).catch(() => {})
        return prev
      })
    }, 6000)

    unsubs.push(window.api.onConnected?.((data) => {
      setConnStatus("connected")
    }))

    unsubs.push(window.api.onReconnecting?.((data) => {
      setConnStatus(prev => prev === "connected" ? prev : "reconnecting")
    }))

    unsubs.push(window.api.onConnectionClose?.((data) => {
      const fatal = data?.statusCode === 401 || data?.statusCode === 428 || data?.statusCode === 440
      setConnStatus(fatal ? "failed" : "reconnecting")
    }))

    unsubs.push(window.api.onConnectionFailed?.(() => setConnStatus("failed")))
    unsubs.push(window.api.onConnectionError?.(() => setConnStatus(prev => prev === "connected" ? "connected" : "failed")))

    // Sync status — pass full payload so store gets isSyncing + progress + stats
    unsubs.push(window.api.onSyncStatus?.((d) => {
      setSyncStatus(d)   // store now accepts full object
      if (d?.isComplete || d?.status === "done") loadChats()
    }))

    // [FIX-RESUME-SYNC] Gap-fill progress after reconnect (offline catch-up).
    // These events come from _activeGapFill() in client.js.
    unsubs.push(window.api.onResumeSyncComplete?.(() => {
      // Refresh chat list once gap-fill is done so unread counts & previews are current
      loadChats()
      loadContacts()
    }))

    // Live chat updates — reload from SQLite
    unsubs.push(window.api.onChatsSet?.((chats) => { if (chats?.length) loadChats() }))
    unsubs.push(window.api.onChatsUpsert?.(() => loadChats()))
    unsubs.push(window.api.onChatsUpdated?.(() => loadChats()))
    unsubs.push(window.api.onContactsUpdated?.(() => loadContacts()))

    // New messages — append immediately for real-time feel.
    // [FIX-CHAT-POS] Do NOT call loadChats() here — appendMessage() already
    // updates last_msg_at and re-sorts the chat list atomically in-memory.
    // Calling loadChats() right after races against the DB write and reverts
    // the sort back to stale DB order, making the chat jump back down.
    unsubs.push(window.api.onMessagesNew?.((payload) => {
      if (!payload?.chat_jid) return
      appendMessage(payload.chat_jid, payload)
    }))

    // DB-written messages (fallback)
    unsubs.push(window.api.onNewMessage?.((msg) => {
      if (!msg?.chat_jid) return
      appendMessage(msg.chat_jid, msg)
    }))

    // [FIX-MEDIA-GLOBAL] Global media download completion listener.
    // Handles media:updated for ALL chats — not just the active one.
    // updateMessageMedia() will either:
    //   a) Update in-state messages immediately (chat is open/loaded), or
    //   b) Buffer the update for flush when that chat's messages are next loaded.
    // This ensures stickers/images/videos are visible without requiring a chat switch.
    unsubs.push(window.api.onMediaUpdated?.((data) => {
      if (!data?.id || !data?.chat_jid || !data?.media_saved_path) return
      useChatStore.getState().updateMessageMedia(data)
    }))

    // ── aurora:open-chat — fired by StatusView to navigate to a chat
    // Sets navTab to "chats" and activeJid so the ChatWindow opens
    const openChatHandler = (e) => {
      const { jid } = e.detail || {}
      if (!jid) return
      setNavTab("chats")
      setActiveJid(jid)
    }
    window.addEventListener("aurora:open-chat", openChatHandler)

    // ── Status:new — forward via custom event so StatusView can receive it
    // without needing a preload entry. Works regardless of contextIsolation.
    const ipcR = window.electron?.ipcRenderer ?? window.ipcRenderer
    // [BUG-FIX] Hoist statusHandler outside the if-block so we can remove it in cleanup
    let statusHandler = null
    if (ipcR?.on) {
      statusHandler = (_e, payload) => {
        window.dispatchEvent(new CustomEvent("aurora:status:new", { detail: payload }))
      }
      ipcR.on("status:new", statusHandler)
    }

    // [FIX-LEAK] Unified cleanup: all window.api unsubs + DOM listeners + ipcRenderer
    return () => {
      clearTimeout(watchdog)
      unsubs.forEach(fn => fn?.())
      window.removeEventListener("aurora:open-chat", openChatHandler)
      if (ipcR && statusHandler) {
        ipcR.removeListener?.("status:new", statusHandler)
      }
    }
  }, [])

  return (
    <div className="app-root">
      <MediaViewer />
      <Sidebar/>
      {navTab === "mods" ? (
        <div style={{ flex: 1, overflow: "hidden" }}>
          <ModManagerPage />
        </div>
      ) : navTab === "status" ? (
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <StatusTabsView />
        </div>
      ) : (
        <>
          <ChatList
            connStatus={connStatus}
            collapsed={chatListCollapsed}
            onToggleCollapse={() => setChatListCollapsed(c => !c)}
          />
          {activeJid
            ? (
              <div style={{ display: "flex", flex: 1, minWidth: 0, overflow: "hidden" }}>
                <ChatWindow key={activeJid} jid={activeJid}/>
                <GroupInfoPanel jid={activeJid} />
              </div>
            )
            : <WelcomeScreen connStatus={connStatus} user={connectedUser}/>
          }
        </>
      )}
    </div>
  )
}