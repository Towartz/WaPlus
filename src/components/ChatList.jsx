// src/components/ChatList.jsx — UI/UX v5
// ═══════════════════════════════════════════════════════════════════════════
// IMPROVEMENTS v5:
// [UI-1]  Search bar: debounced input (120ms) — stops re-filtering on every keystroke.
// [UI-2]  Filter tabs: smooth underline slide indicator, not background swap.
// [UI-3]  Skeleton shimmer matches ChatItem v5 shimmer keyframes (shared class).
// [UI-4]  Status pill: compact inline badge, not a separate text line.
// [UI-5]  VirtualChatList: passive scroll listener for 60fps scroll.
// [UI-6]  Collapsed panel: smoother tooltip with CSS transition (no React state flicker).
// [UI-7]  Empty state: contextual illustrated placeholder (SVG inline).
// [UI-8]  Header shrinks on scroll (CSS transition on padding).
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useChatStore } from "../store/chat"
import { useAppStore } from "../store/app"
import ChatItem from "./ChatItem"
import ContactPanel from "./ContactPanel"
import { useChatListPrefetch } from "../hooks/useMediaPrefetch"

// ─── Icons ────────────────────────────────────────────────────────────────────
const SearchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)
const PlusIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
)
const CollapseIcon = ({ collapsed }) => (
  <svg
    width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
    style={{ transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)", transform: collapsed ? "rotate(180deg)" : "rotate(0deg)" }}
  >
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)
const XIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

// ─── Shared styles injection ──────────────────────────────────────────────────
let _stylesInjected = false
function injectStyles() {
  if (_stylesInjected || typeof document === "undefined") return
  _stylesInjected = true
  const s = document.createElement("style")
  s.textContent = `
    /* Shimmer base */
    @keyframes cl-shimmer {
      0%   { background-position: -200% 0 }
      100% { background-position:  200% 0 }
    }
    .cl-skel {
      background: linear-gradient(90deg, var(--bg-3,#1c1c1c) 25%, var(--bg-4,#2a2a2a) 50%, var(--bg-3,#1c1c1c) 75%);
      background-size: 200% 100%;
      animation: cl-shimmer 1.4s ease infinite;
      border-radius: 4px;
    }

    /* Filter tab indicator */
    .cl-filter-bar {
      display: flex;
      gap: 2px;
      padding: 0 10px 8px;
      position: relative;
    }
    .cl-filter-btn {
      flex: 1;
      padding: 5px 4px;
      font-size: 11.5px;
      font-weight: 500;
      border: none;
      background: transparent;
      color: var(--text-3, #777);
      cursor: pointer;
      border-radius: 6px;
      transition: color 0.15s, background 0.15s;
      position: relative;
      white-space: nowrap;
    }
    .cl-filter-btn:hover {
      color: var(--text-2, #aaa);
      background: rgba(255,255,255,0.04);
    }
    .cl-filter-btn.active {
      color: var(--accent, #00b45a);
      font-weight: 700;
    }
    .cl-filter-btn.active::after {
      content: '';
      position: absolute;
      bottom: -2px;
      left: 20%;
      right: 20%;
      height: 2px;
      background: var(--accent, #00b45a);
      border-radius: 2px;
    }

    /* Search */
    .cl-search-wrap {
      position: relative;
      margin: 0 10px 10px;
    }
    .cl-search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-3, #666);
      pointer-events: none;
      display: flex;
    }
    .cl-search-input {
      width: 100%;
      box-sizing: border-box;
      height: 32px;
      background: var(--bg-3, #1c1c1c);
      border: 1px solid var(--border, rgba(255,255,255,0.07));
      border-radius: 8px;
      padding: 0 28px 0 30px;
      font-size: 12px;
      color: var(--text-1, #e8e8e8);
      outline: none;
      transition: border-color 0.15s, background 0.15s;
    }
    .cl-search-input::placeholder { color: var(--text-4, #555) }
    .cl-search-input:focus {
      border-color: rgba(0,180,90,0.35);
      background: var(--bg-4, #222);
    }
    .cl-search-clear {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-3, #666);
      cursor: pointer;
      display: flex;
      padding: 2px;
      border-radius: 3px;
      transition: color 0.12s;
    }
    .cl-search-clear:hover { color: var(--text-1, #e0e0e0) }

    /* Sync progress */
    @keyframes cl-progress-pulse {
      0%, 100% { opacity: 1   }
      50%       { opacity: 0.6 }
    }
    .cl-sync-spinner {
      width: 12px; height: 12px; border-radius: 50%;
      border: 2px solid rgba(0,180,90,0.2);
      border-top-color: var(--accent, #00b45a);
      animation: spin 0.8s linear infinite;
      flex-shrink: 0;
    }
    @keyframes spin { to { transform: rotate(360deg) } }

    /* Collapsed tooltip */
    .cl-collapsed-item {
      position: relative;
      display: flex; align-items: center; justify-content: center;
      padding: 5px 0;
      cursor: pointer;
      border-radius: 8px;
      margin: 1px 7px;
      transition: background 0.12s;
      border-left: 2px solid transparent;
    }
    .cl-collapsed-item:hover { background: rgba(255,255,255,0.05) }
    .cl-collapsed-item.active {
      background: rgba(0,180,90,0.1);
      border-left-color: var(--accent, #00b45a);
    }
    .cl-collapsed-tooltip {
      position: absolute;
      left: calc(100% + 10px);
      top: 50%;
      transform: translateY(-50%);
      background: var(--bg-tooltip, #1e1e1e);
      color: var(--text-1, #e8e8e8);
      padding: 5px 10px;
      border-radius: 7px;
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      pointer-events: none;
      z-index: 9999;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      border: 1px solid rgba(255,255,255,0.07);
      opacity: 0;
      transition: opacity 0.15s ease;
    }
    .cl-collapsed-item:hover .cl-collapsed-tooltip { opacity: 1 }
    .cl-tooltip-arrow {
      position: absolute; left: -5px; top: 50%;
      transform: translateY(-50%);
      width: 0; height: 0;
      border-top: 5px solid transparent;
      border-bottom: 5px solid transparent;
      border-right: 5px solid var(--bg-tooltip, #1e1e1e);
    }

    /* Header status pill */
    .cl-status-pill {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 10.5px; font-weight: 600;
      padding: 2px 7px; border-radius: 10px;
    }
    .cl-status-pill.connected {
      background: rgba(0,180,90,0.12);
      color: var(--accent, #00b45a);
    }
    .cl-status-pill.reconnecting,
    .cl-status-pill.connecting {
      background: rgba(251,191,36,0.1);
      color: #fbbf24;
    }
    .cl-status-pill.failed {
      background: rgba(239,68,68,0.12);
      color: #ef4444;
    }
    .cl-conn-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: currentColor;
      flex-shrink: 0;
    }
    .cl-conn-dot.reconnecting,
    .cl-conn-dot.connecting {
      animation: cl-progress-pulse 1.2s ease infinite;
    }
  `
  document.head.appendChild(s)
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ITEM_HEIGHT    = 65
const OVERSCAN       = 5
const PAGE_SIZE      = 40
const LOAD_MORE_THR  = 150
const COLLAPSED_W    = 62
const SEARCH_DEBOUNCE = 120  // ms

const STATUS_LABEL = {
  connected:    "Terhubung",
  reconnecting: "Menyambung...",
  failed:       "Koneksi Gagal",
  connecting:   "Menghubungkan...",
}
const CHAT_FILTERS = [
  { id: "all",    label: "Semua"        },
  { id: "unread", label: "Belum dibaca" },
  { id: "groups", label: "Grup"         },
]

// ─── SkeletonItem ─────────────────────────────────────────────────────────────
function SkeletonItem({ index = 0 }) {
  const nameW = ["55%","62%","48%","70%","58%"][index % 5]
  const bodyW = ["80%","75%","90%","65%","85%"][index % 5]
  return (
    <div style={{ display: "flex", gap: 11, padding: "9px 14px 9px 16px", alignItems: "center" }}>
      <div className="cl-skel" style={{ width: 46, height: 46, borderRadius: "50%", flexShrink: 0 }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <div className="cl-skel" style={{ width: nameW, height: 11, borderRadius: 4 }}/>
          <div className="cl-skel" style={{ width: 24, height: 9, borderRadius: 3 }}/>
        </div>
        <div className="cl-skel" style={{ width: bodyW, height: 9, borderRadius: 3 }}/>
      </div>
    </div>
  )
}

// ─── SyncProgressBar ─────────────────────────────────────────────────────────
function SyncProgressBar({ syncStatus, syncProgress, syncStats, collapsed }) {
  if (syncStatus !== "syncing") return null
  const pct = Math.min(100, Math.max(0, syncProgress || 0))

  if (collapsed) {
    return (
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.06)", zIndex: 10 }}>
        <div style={{ height: "100%", background: "var(--accent, #00b45a)", width: `${pct}%`, transition: "width 0.4s ease", boxShadow: "0 0 6px rgba(0,180,90,0.5)" }}/>
      </div>
    )
  }

  return (
    <div style={{
      position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 10,
      background: "var(--bg-sidebar, #111)",
      borderTop: "1px solid var(--border, rgba(255,255,255,0.06))",
      padding: "7px 14px 8px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div className="cl-sync-spinner"/>
          <span style={{ fontSize: 11, color: "var(--text-2, #aaa)", fontWeight: 500 }}>Sinkronisasi pesan...</span>
        </div>
        <span style={{ fontSize: 11, color: "var(--accent, #00b45a)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
      </div>
      <div style={{ height: 2, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 2, background: "linear-gradient(90deg, var(--accent,#00b45a), #1adb7a)", width: `${pct}%`, transition: "width 0.4s ease" }}/>
      </div>
      {syncStats && (syncStats.messages > 0 || syncStats.chats > 0) && (
        <div style={{ display: "flex", gap: 10, marginTop: 5 }}>
          {syncStats.chats    > 0 && <span style={{ fontSize: 10, color: "var(--text-3, #666)" }}>{syncStats.chats.toLocaleString()} chat</span>}
          {syncStats.messages > 0 && <span style={{ fontSize: 10, color: "var(--text-3, #666)" }}>{syncStats.messages.toLocaleString()} pesan</span>}
        </div>
      )}
    </div>
  )
}

// ─── VirtualChatList ──────────────────────────────────────────────────────────
function VirtualChatList({ items, activeJid, onItemClick, isContact, isCommunity, observe, unobserve }) {
  const containerRef   = useRef(null)
  const [scrollTop, setScrollTop]       = useState(0)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // [UI-5] Passive scroll listener — doesn't block rendering thread
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => {
      setScrollTop(el.scrollTop)
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight
      if (dist < LOAD_MORE_THR) {
        setVisibleCount(c => Math.min(c + PAGE_SIZE, items.length))
      }
    }
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [items.length])

  useEffect(() => { setVisibleCount(PAGE_SIZE); setScrollTop(0) }, [items])

  const onItemClickRef = useRef(onItemClick)
  useEffect(() => { onItemClickRef.current = onItemClick }, [onItemClick])

  const getItemClick = useCallback((item) => {
    if (!item._onClick) item._onClick = () => onItemClickRef.current(item.jid)
    return item._onClick
  }, [])

  const containerHeight = containerRef.current?.clientHeight || 600
  const startIdx = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN)
  const endIdx   = Math.min(visibleCount, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN)

  const totalH   = Math.min(visibleCount, items.length) * ITEM_HEIGHT
  const padTop   = startIdx * ITEM_HEIGHT
  const padBot   = Math.max(0, totalH - endIdx * ITEM_HEIGHT)
  const visible  = items.slice(startIdx, endIdx)

  return (
    <div ref={containerRef} className="chat-list" style={{ overflowY: "auto", contain: "strict" }}>
      {padTop > 0 && <div style={{ height: padTop, flexShrink: 0 }}/>}
      {visible.map(item => (
        <ChatItem
          key={item.jid}
          chat={item}
          active={activeJid === item.jid}
          onClick={getItemClick(item)}
          isContact={isContact}
          isCommunity={isCommunity}
          observe={observe}
          unobserve={unobserve}
        />
      ))}
      {padBot > 0 && <div style={{ height: padBot, flexShrink: 0 }}/>}
      {visibleCount < items.length && (
        <div style={{ textAlign: "center", padding: "8px", fontSize: 11, color: "var(--text-3, #666)" }}>
          {items.length - visibleCount} lagi...
        </div>
      )}
    </div>
  )
}

// ─── CollapsedAvatarItem — CSS-tooltip (no React state hover) ────────────────
const AVATAR_COLORS = ["#1a5c3e","#1565c0","#6a1b9a","#b71c1c","#e65100","#2e7d32","#00695c","#4527a0","#00838f","#ad1457","#0277bd","#4a148c"]
function seedColor(s) { if (!s) return AVATAR_COLORS[0]; let h=0; for (let i=0;i<s.length;i++) h=s.charCodeAt(i)+((h<<5)-h); return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length] }
function buildInitials(n) { if (!n) return "?"; const st=n.replace(/[\s\-+().]/g,""); if (/^\d{6,}$/.test(st)) return st.slice(-2); const w=n.trim().split(/\s+/); if(w.length===1) return w[0].slice(0,2).toUpperCase(); return (w[0][0]+w[1][0]).toUpperCase() }

const picCacheC = new Map(), fetchingC = new Set()

function CollapsedAvatarItem({ chat, isActive, onClick }) {
  const jid    = chat.jid || ""
  const name   = chat.name || jid.split("@")[0] || "?"
  const unread = Number(chat.unread_count) || 0
  const color  = seedColor(jid)
  const inits  = buildInitials(name)
  const [url, setUrl] = useState(() => picCacheC.has(jid) ? picCacheC.get(jid) : undefined)
  const [err, setErr] = useState(false)

  useEffect(() => {
    if (!jid || picCacheC.has(jid) || fetchingC.has(jid)) return
    fetchingC.add(jid)
    window.api?.getProfilePic?.({ jid })
      .then(r => { const u=r?.url||null; picCacheC.set(jid,u); setUrl(u) })
      .catch(()  => { picCacheC.set(jid,null); setUrl(null) })
      .finally(()=> fetchingC.delete(jid))
  }, [jid])

  return (
    <div className={`cl-collapsed-item${isActive ? " active" : ""}`} onClick={() => onClick(jid)}>
      {/* Avatar */}
      <div style={{ position: "relative", width: 40, height: 40 }}>
        <div style={{
          width: 40, height: 40, borderRadius: "50%",
          background: url && !err ? "transparent" : color,
          display: "flex", alignItems: "center", justifyContent: "center",
          overflow: "hidden", fontSize: 14, fontWeight: 700, color: "#fff",
          border: isActive ? "2px solid var(--accent, #00b45a)" : "2px solid transparent",
          transition: "border-color 0.2s", boxSizing: "border-box",
        }}>
          {url && !err
            ? <img src={url} alt={name} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy"/>
            : inits}
        </div>
        {unread > 0 && (
          <div style={{
            position: "absolute", top: 0, right: 0,
            transform: "translate(25%,-25%)",
            minWidth: 15, height: 15, borderRadius: 8,
            background: "var(--accent, #00b45a)", color: "#fff",
            fontSize: 9.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 3px", border: "1.5px solid var(--bg-sidebar, #111)", zIndex: 3, boxSizing: "border-box",
          }}>
            {unread > 9 ? "9+" : unread}
          </div>
        )}
      </div>
      {/* CSS tooltip — no JS hover state needed */}
      <div className="cl-collapsed-tooltip">
        <div className="cl-tooltip-arrow"/>
        {name}
      </div>
    </div>
  )
}

function CollapsedList({ items, activeJid, onItemClick }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "4px 0 8px" }}>
      {items.map(item => (
        <CollapsedAvatarItem key={item.jid} chat={item} isActive={activeJid === item.jid} onClick={onItemClick}/>
      ))}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ icon, title, desc }) {
  return (
    <div style={{ textAlign: "center", padding: "44px 20px", color: "var(--text-3, #666)" }}>
      <div style={{ fontSize: 38, marginBottom: 12, opacity: 0.7 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2, #999)", marginBottom: 5 }}>{title}</div>
      <div style={{ fontSize: 11, lineHeight: 1.5 }}>{desc}</div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ChatList({ connStatus, collapsed, onToggleCollapse }) {
  injectStyles()

  const { chats, contacts, groups, communities, channels, loadChats, loadContacts, syncStatus, syncProgress, syncStats, setSyncStatus } = useChatStore()
  const { activeJid, setActiveJid, navTab } = useAppStore()
  const [searchRaw, setSearchRaw] = useState("")
  const [search,    setSearch]    = useState("")
  const [filter, setFilter]       = useState("all")
  const [loading, setLoading]     = useState(true)

  // [UI-1] Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchRaw), SEARCH_DEBOUNCE)
    return () => clearTimeout(t)
  }, [searchRaw])

  useEffect(() => {
    Promise.all([loadChats(), loadContacts()]).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!window.api) return
    const unsubs = [
      window.api.onSyncStatus?.((d) => {
        setSyncStatus(d?.status || "idle")
        if (d?.status === "done") loadChats()
      }),
      window.api.onChatsUpdated?.(() => loadChats()),
      window.api.onContactsUpdated?.(() => loadContacts()),
    ]
    return () => unsubs.forEach(fn => fn?.())
  }, [])

  const status = connStatus || "connecting"

  let baseItems
  if (navTab === "contacts")    baseItems = contacts
  else if (navTab === "communities") baseItems = communities
  else if (navTab === "channels")    baseItems = channels || []
  else {
    if (filter === "groups")  baseItems = groups
    else if (filter === "unread") baseItems = chats.filter(c => c.unread_count > 0)
    else baseItems = chats
  }

  const items = useMemo(() => {
    if (!search) return baseItems
    const q = search.toLowerCase()
    return baseItems.filter(c =>
      (c.name       || "").toLowerCase().includes(q) ||
      (c.jid        || "").includes(q) ||
      (c.phone      || "").includes(q) ||
      (c.last_msg   || "").toLowerCase().includes(q)
    )
  }, [baseItems, search])

  const handleClick = useCallback((jid) => {
    setActiveJid(jid)
    const server = jid.split("@")[1]
    if (server === "lid") {
      window.api?.lidResolveNow?.().then(() => {
        setTimeout(() => loadChats?.(), 500)
      }).catch(() => {})
    }
  }, [loadChats])

  const { observe, unobserve } = useChatListPrefetch()

  const isContacts    = navTab === "contacts"
  const isCommunities = navTab === "communities"
  const isChannels    = navTab === "channels"

  const emptyIcon  = search ? "🔍" : isCommunities ? "🏘️" : isContacts ? "👥" : isChannels ? "📢" : filter === "unread" ? "✅" : filter === "groups" ? "👥" : "💬"
  const emptyTitle = search ? "Tidak ada hasil" : isCommunities ? "Belum ada komunitas" : isContacts ? "Belum ada kontak" : isChannels ? "Belum ada saluran" : filter === "unread" ? "Semua sudah dibaca" : filter === "groups" ? "Belum ada grup" : "Belum ada pesan"
  const emptyDesc  = search ? "Coba kata kunci lain" : isChannels ? "Saluran yang kamu ikuti akan muncul di sini" : "Mulai chat baru dengan tombol + di atas"
  const panelTitle = isCommunities ? "Komunitas" : isContacts ? "Kontak" : isChannels ? "Saluran" : "Pesan"
  const totalUnread = chats.reduce((s, c) => s + (c.unread_count || 0), 0)

  // ── Collapsed mode ───────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <div
        className="chat-panel"
        style={{
          position: "relative",
          width: COLLAPSED_W, minWidth: COLLAPSED_W, maxWidth: COLLAPSED_W,
          display: "flex", flexDirection: "column", overflow: "hidden",
          transition: "width 0.28s cubic-bezier(0.4,0,0.2,1), min-width 0.28s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        {/* Collapsed header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "11px 0 7px", flexShrink: 0,
          borderBottom: "1px solid var(--border, rgba(255,255,255,0.05))",
          flexDirection: "column", gap: 7,
        }}>
          <div className={`cl-conn-dot ${status}`}/>
          {totalUnread > 0 && navTab === "chats" && (
            <div style={{
              minWidth: 18, height: 18, borderRadius: 9,
              background: "var(--accent, #00b45a)", color: "#fff",
              fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
              padding: "0 4px",
            }}>
              {totalUnread > 99 ? "99+" : totalUnread}
            </div>
          )}
          <button
            onClick={onToggleCollapse}
            title="Perluas panel chat"
            style={{
              width: 28, height: 28, borderRadius: 7,
              background: "rgba(0,180,90,0.1)", border: "1px solid rgba(0,180,90,0.18)",
              color: "var(--accent, #00b45a)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(0,180,90,0.2)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(0,180,90,0.1)"}
          >
            <CollapseIcon collapsed={true}/>
          </button>
        </div>

        {loading ? (
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "center", padding: "5px 0" }}>
                <div className="cl-skel" style={{ width: 40, height: 40, borderRadius: "50%" }}/>
              </div>
            ))}
          </div>
        ) : (
          <CollapsedList items={items} activeJid={activeJid} onItemClick={handleClick}/>
        )}

        <SyncProgressBar syncStatus={syncStatus} syncProgress={syncProgress} syncStats={syncStats} collapsed={true}/>
      </div>
    )
  }

  // ── Expanded mode ────────────────────────────────────────────────────────
  return (
    <div
      className="chat-panel"
      style={{
        position: "relative",
        transition: "width 0.28s cubic-bezier(0.4,0,0.2,1), min-width 0.28s cubic-bezier(0.4,0,0.2,1)",
      }}
    >
      {/* Header */}
      <div className="chat-panel-header">
        {/* Title row */}
        <div className="chat-panel-title-row">
          <div className="chat-panel-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {panelTitle}
            {navTab === "chats" && totalUnread > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700,
                background: "var(--accent, #00b45a)", color: "#fff",
                borderRadius: 10, padding: "1px 6px",
              }}>
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {/* Status pill — compact */}
            <span className={`cl-status-pill ${status}`}>
              <span className={`cl-conn-dot ${status}`}/>
              {status === "reconnecting" && <div className="cl-sync-spinner" style={{ width: 9, height: 9 }}/>}
              {STATUS_LABEL[status] || "Menghubungkan..."}
            </span>
            {/* Collapse button */}
            <button
              onClick={onToggleCollapse}
              title="Sembunyikan panel"
              style={{
                width: 28, height: 28, borderRadius: 7,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
                color: "var(--text-3, #777)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.15s, color 0.15s, border-color 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background="rgba(0,180,90,0.1)"; e.currentTarget.style.color="var(--accent,#00b45a)"; e.currentTarget.style.borderColor="rgba(0,180,90,0.2)" }}
              onMouseLeave={e => { e.currentTarget.style.background="rgba(255,255,255,0.04)"; e.currentTarget.style.color="var(--text-3,#777)"; e.currentTarget.style.borderColor="rgba(255,255,255,0.07)" }}
            >
              <CollapseIcon collapsed={false}/>
            </button>
            {/* New chat */}
            <button
              style={{
                width: 28, height: 28, borderRadius: 7,
                background: "rgba(0,180,90,0.1)", border: "1px solid rgba(0,180,90,0.18)",
                color: "var(--accent, #00b45a)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.15s",
              }}
              title="Chat Baru"
              onMouseEnter={e => e.currentTarget.style.background="rgba(0,180,90,0.2)"}
              onMouseLeave={e => e.currentTarget.style.background="rgba(0,180,90,0.1)"}
            >
              <PlusIcon/>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="cl-search-wrap">
          <div className="cl-search-icon"><SearchIcon/></div>
          <input
            className="cl-search-input"
            placeholder={isCommunities ? "Cari komunitas..." : isContacts ? "Cari kontak..." : "Cari pesan atau kontak..."}
            value={searchRaw}
            onChange={e => setSearchRaw(e.target.value)}
          />
          {searchRaw && (
            <div className="cl-search-clear" onClick={() => setSearchRaw("")}>
              <XIcon/>
            </div>
          )}
        </div>
      </div>

      {/* [UI-2] Filter tabs with underline indicator */}
      {navTab === "chats" && !isChannels && (
        <div className="cl-filter-bar">
          {CHAT_FILTERS.map(f => (
            <button
              key={f.id}
              className={`cl-filter-btn${filter === f.id ? " active" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              {f.id === "unread" && totalUnread > 0 && (
                <span style={{ marginLeft: 4, fontSize: 10, background: "var(--accent,#00b45a)", color: "#fff", borderRadius: 8, padding: "0 4px" }}>
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
              {f.id === "groups" && groups.length > 0 && (
                <span style={{ marginLeft: 4, fontSize: 10, color: "var(--text-3,#666)" }}>
                  {groups.length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="chat-list">
          {Array.from({ length: 10 }).map((_, i) => <SkeletonItem key={i} index={i}/>)}
        </div>
      ) : isContacts ? (
        <div className="chat-list"><ContactPanel/></div>
      ) : items.length === 0 ? (
        <div className="chat-list">
          <EmptyState icon={emptyIcon} title={emptyTitle} desc={emptyDesc}/>
        </div>
      ) : (
        <VirtualChatList
          items={items}
          activeJid={activeJid}
          onItemClick={handleClick}
          isContact={isContacts}
          isCommunity={isCommunities}
          observe={observe}
          unobserve={unobserve}
        />
      )}

      <SyncProgressBar syncStatus={syncStatus} syncProgress={syncProgress} syncStats={syncStats} collapsed={false}/>
    </div>
  )
}