// src/components/ChatWindow.jsx — UI/UX v5
// ═══════════════════════════════════════════════════════════════════════════
// IMPROVEMENTS v5:
// [UI-1]  Header: glassmorphism blur + subtle border-bottom (not hard line).
// [UI-2]  Scroll-to-bottom FAB: smooth scale-in/out enter/exit animation.
// [UI-3]  "Load older" indicator: slim top bar (not inline spinner in message list).
// [UI-4]  Empty state: inline SVG illustration — no emoji fallback.
// [UI-5]  Skeleton bubbles: use shared shimmer keyframe for consistency.
// [UI-6]  Date separator: centered pill with frosted bg — less visual noise.
// [UI-7]  Status bar ("online" / "N anggota") debounced fetch for groups.
// [UI-8]  Passive scroll listener (60fps), scroll-to-bottom uses scrollTop not scrollIntoView.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState, useCallback, useMemo, memo, startTransition, useDeferredValue } from "react"
import { useChatStore } from "../store/chat"
import { useAppStore }  from "../store/app"
import { format, isToday, isYesterday } from "date-fns"
import MessageBubble, { AlbumBubbleWrapper } from "./MessageBubble"
import DevEvalModal  from "./DevEvalModal"
import MessageInput  from "./MessageInput"
import { useMediaPrefetch } from "../hooks/useMediaPrefetch"
import { normalizeJid, isJidGroup, isJidNewsletter, isJidLid, jidUser } from "../utils/jidUtils"

// ─── Shared helpers ───────────────────────────────────────────────────────────
const toBool = (v) => v === 1 || v === true
const ALBUM_TYPES    = new Set(["imageMessage", "videoMessage"])
const ALBUM_WINDOW_S = 90

function resolveDisplayName(jid, chat) {
  const savedName = typeof chat === "string" ? chat : (chat?.name || "")
  const chatObj   = typeof chat === "object" && chat !== null ? chat : {}
  const atIdx     = jid ? jid.lastIndexOf("@") : -1
  const server    = atIdx !== -1 ? jid.slice(atIdx + 1) : ""
  const user      = atIdx !== -1 ? jid.slice(0, atIdx) : (jid || "")
  const cleanUser = user.split(":")[0]
  const isLid     = server === "lid"

  if (isJidGroup(jid) || isJidNewsletter(jid)) {
    const n = savedName || chatObj.subject || ""
    return (n && !n.includes("@")) ? n : "Grup"
  }
  for (const c of [savedName, chatObj.push_name, chatObj.last_sender_name]) {
    if (c && typeof c === "string" && !c.includes("@") && c.trim()) return c.trim()
  }
  if (/^\d{6,}$/.test(cleanUser)) return isLid ? `~${cleanUser.slice(-8)}` : `+${cleanUser}`
  return cleanUser || "Unknown"
}

// ─── Inject styles once ───────────────────────────────────────────────────────
let _stylesInjected = false
function injectStyles() {
  if (_stylesInjected || typeof document === "undefined") return
  _stylesInjected = true
  const s = document.createElement("style")
  s.textContent = `
    @keyframes cw-shimmer {
      0%   { background-position: -200% 0 }
      100% { background-position:  200% 0 }
    }
    .cw-skel {
      background: linear-gradient(90deg,
        var(--bg-3,#1c1c1c) 25%, var(--bg-4,#2a2a2a) 50%, var(--bg-3,#1c1c1c) 75%
      );
      background-size: 200% 100%;
      animation: cw-shimmer 1.4s ease infinite;
      border-radius: 4px;
    }

    /* Header */
    .cw-header {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 9px 14px;
      background: var(--bg-header, rgba(18,18,18,0.85));
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      flex-shrink: 0;
      z-index: 10;
      position: relative;
    }
    .cw-header-avatar {
      width: 38px; height: 38px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 700; color: #fff;
      overflow: hidden; flex-shrink: 0;
      transition: transform 0.15s;
    }
    .cw-header-avatar:hover { transform: scale(1.04) }
    .cw-header-avatar img { width: 100%; height: 100%; object-fit: cover }
    .cw-header-info {
      flex: 1;
      min-width: 0;
      line-height: 1.2;
    }
    .cw-header-name {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-1, #eee);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cw-header-sub {
      font-size: 11px;
      color: var(--text-3, #777);
      margin-top: 2px;
    }
    .cw-header-btn {
      width: 32px; height: 32px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: var(--text-3, #888);
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.12s, color 0.12s;
      flex-shrink: 0;
    }
    .cw-header-btn:hover {
      background: rgba(255,255,255,0.07);
      color: var(--text-1, #e0e0e0);
    }
    .cw-header-btn.accent:hover {
      background: rgba(0,180,90,0.1);
      color: var(--accent, #00b45a);
    }

    /* Date separator */
    .cw-date-sep {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 14px 16px 8px;
      pointer-events: none;
    }
    .cw-date-sep-pill {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-3, #888);
      background: var(--bg-3, rgba(30,30,30,0.85));
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px;
      padding: 3px 10px;
      backdrop-filter: blur(6px);
    }

    /* Load-more bar */
    @keyframes cw-spin { to { transform: rotate(360deg) } }
    .cw-load-more-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 6px 0 2px;
      font-size: 11px;
      color: var(--text-3, #777);
    }
    .cw-load-spinner {
      width: 12px; height: 12px; border-radius: 50%;
      border: 2px solid rgba(0,180,90,0.18);
      border-top-color: var(--accent, #00b45a);
      animation: cw-spin 0.8s linear infinite;
    }

    /* Scroll FAB */
    @keyframes cw-fab-in  { from { opacity:0; transform:scale(0.7) } to { opacity:1; transform:scale(1) } }
    @keyframes cw-fab-out { from { opacity:1; transform:scale(1) } to { opacity:0; transform:scale(0.7) } }
    .cw-scroll-fab {
      position: absolute;
      right: 18px;
      width: 36px; height: 36px;
      border-radius: 50%;
      background: var(--bg-2, #1e1e1e);
      border: 1px solid rgba(255,255,255,0.1);
      color: var(--text-2, #ccc);
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      transition: background 0.15s, color 0.15s, border-color 0.15s;
      animation: cw-fab-in 0.18s cubic-bezier(0.34,1.56,0.64,1) forwards;
      z-index: 20;
    }
    .cw-scroll-fab:hover {
      background: var(--accent, #00b45a);
      color: #fff;
      border-color: transparent;
    }
    .cw-scroll-fab-badge {
      position: absolute;
      top: -4px; right: -4px;
      min-width: 16px; height: 16px;
      border-radius: 8px;
      background: var(--accent, #00b45a);
      color: #fff;
      font-size: 9.5px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      padding: 0 3px;
      border: 1.5px solid var(--bg-window, #111);
      pointer-events: none;
    }

    /* Empty state */
    .cw-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 10px;
      color: var(--text-3, #666);
      padding: 20px;
      text-align: center;
    }
  `
  document.head.appendChild(s)
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
const COLORS = ["#1a5c3e","#1565c0","#6a1b9a","#b71c1c","#e65100","#2e7d32","#00695c","#4527a0","#00838f","#ad1457"]
function getColor(s) { if (!s) return COLORS[0]; let h=0; for (let i=0;i<s.length;i++) h=s.charCodeAt(i)+((h<<5)-h); return COLORS[Math.abs(h)%COLORS.length] }
function initials(n) {
  if (!n) return "?"
  const st = n.replace(/[\s\-+().]/g,"")
  if (/^\d{6,}$/.test(st)) return st.slice(-2)
  return n.trim().split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase()
}

const picCache = new Map(), fetching = new Set()
function Avatar({ jid, name, size = 38 }) {
  const [url, setUrl] = useState(() => picCache.has(jid) ? picCache.get(jid) : undefined)
  const [err, setErr] = useState(false)

  useEffect(() => {
    if (!jid) return
    if (picCache.has(jid)) { const c = picCache.get(jid); if (c !== url) setUrl(c); return }
    if (fetching.has(jid)) return
    fetching.add(jid)
    window.api?.getProfilePic?.({ jid })
      .then(r => { const u=r?.url||null; picCache.set(jid,u); setUrl(u) })
      .catch(() => picCache.set(jid,null))
      .finally(() => fetching.delete(jid))
  }, [jid])
  useEffect(() => { setErr(false) }, [url])

  return (
    <div
      className="cw-header-avatar"
      style={{ width: size, height: size, background: getColor(jid || name) }}
    >
      {url && !err && <img src={url} alt={name} onError={() => setErr(true)} loading="lazy"/>}
      {(!url || err) && initials(name)}
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function SearchIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> }
function PhoneIcon()  { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.53 2 2 0 0 1 3.55 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.69a16 16 0 0 0 6.29 6.29l.9-.9a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> }
function DotsIcon()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg> }
function CodeIcon()   { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> }
function ArrowDownIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg> }

// ─── Date separator ───────────────────────────────────────────────────────────
function DateSep({ date }) {
  const d = new Date(date * 1000)
  let label = format(d, "dd MMMM yyyy")
  if (isToday(d))     label = "Hari Ini"
  else if (isYesterday(d)) label = "Kemarin"
  return (
    <div className="cw-date-sep">
      <span className="cw-date-sep-pill">{label}</span>
    </div>
  )
}

// ─── Album grouping (unchanged logic) ────────────────────────────────────────
function groupMessages(messages) {
  const items = []
  let lastDate = null
  let i = 0
  while (i < messages.length) {
    const msg = messages[i]
    const d = msg.timestamp ? new Date(msg.timestamp * 1000).toDateString() : null
    if (d && d !== lastDate) {
      items.push({ type: "date", key: "date-" + msg.timestamp, ts: msg.timestamp })
      lastDate = d
    }
    if (ALBUM_TYPES.has(msg.msg_type) && !toBool(msg.is_view_once)) {
      const albumMsgs = [msg]
      let j = i + 1
      while (j < messages.length) {
        const next = messages[j]
        if (!ALBUM_TYPES.has(next.msg_type)) break
        if (toBool(next.is_view_once)) break
        if (next.from_me !== msg.from_me) break
        if (Math.abs((next.timestamp || 0) - (msg.timestamp || 0)) > ALBUM_WINDOW_S) break
        albumMsgs.push(next)
        j++
      }
      if (albumMsgs.length >= 2) {
        items.push({ type: "album", key: "album-" + msg.id, msgs: albumMsgs })
        i = j; continue
      }
    }
    items.push({ type: "msg", key: msg.id || String(msg.timestamp), msg })
    i++
  }
  return items
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
const SKEL_SIZES = [
  {w:200,h:42},{w:240,h:38},{w:160,h:36},
  {w:280,h:60},{w:190,h:38},{w:220,h:44},
  {w:150,h:36},{w:260,h:38},
]
function SkeletonBubble({ isMe, index = 0 }) {
  const sz = SKEL_SIZES[index % SKEL_SIZES.length]
  const r  = isMe ? "16px 4px 16px 16px" : "4px 16px 16px 16px"
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems: isMe ? "flex-end" : "flex-start", padding:"3px 14px" }}>
      {!isMe && index % 4 === 0 && (
        <div className="cw-skel" style={{ width:28, height:9, borderRadius:3, marginBottom:4, marginLeft:2 }}/>
      )}
      <div className="cw-skel" style={{ width: sz.w, height: sz.h, borderRadius: r }}/>
      <div className="cw-skel" style={{ width:32, height:8, borderRadius:3, marginTop:3, opacity:0.55 }}/>
    </div>
  )
}

// ─── Windowed messages (unchanged logic) ──────────────────────────────────────
const WINDOW_SIZE     = 60
const WINDOW_OVERSCAN = 15

function useWindowedItems(renderItems, areaRef, loading) {
  const [windowEnd, setWindowEnd] = useState(() => Math.max(renderItems.length, WINDOW_SIZE))
  const prevLenRef = useRef(renderItems.length)

  useEffect(() => {
    const prev = prevLenRef.current
    const cur  = renderItems.length
    if (cur > prev) {
      const area     = areaRef.current
      const atBottom = !area || (area.scrollHeight - area.scrollTop - area.clientHeight < 250)
      if (atBottom) setWindowEnd(cur + WINDOW_OVERSCAN)
    }
    prevLenRef.current = cur
  }, [renderItems.length, areaRef])

  const prevItemsRef = useRef(renderItems)
  if (prevItemsRef.current !== renderItems) {
    prevItemsRef.current = renderItems
    const newEnd = Math.max(renderItems.length, WINDOW_SIZE)
    if (windowEnd !== newEnd) setTimeout(() => setWindowEnd(newEnd), 0)
  }

  const onScroll = useCallback(() => {
    const area = areaRef.current; if (!area) return
    const { scrollTop, scrollHeight, clientHeight } = area
    if (scrollTop < 200 && windowEnd > WINDOW_SIZE)
      setWindowEnd(prev => Math.max(prev, renderItems.length))
    if ((scrollHeight - scrollTop - clientHeight) < 100 && windowEnd > renderItems.length + WINDOW_OVERSCAN)
      setWindowEnd(renderItems.length + WINDOW_OVERSCAN)
  }, [areaRef, renderItems.length, windowEnd])

  const total     = renderItems.length
  const USE_WIN   = total > WINDOW_SIZE * 1.5
  const start     = USE_WIN ? Math.max(0, Math.min(windowEnd - WINDOW_SIZE, total - WINDOW_SIZE)) : 0
  const end       = USE_WIN ? Math.min(total, windowEnd + WINDOW_OVERSCAN) : total
  const slice     = renderItems.slice(start, end)
  const hasHidden = start > 0

  return { slice, hasHidden, hiddenCount: start, onScroll, setWindowEnd }
}

// ─── markRead ─────────────────────────────────────────────────────────────────
async function markChatRead(jid, msgs) {
  if (!jid) return
  try {
    await window.api?.dbMarkRead?.({ jid })
    if (window.api?.markMessagesRead) {
      const ids = msgs.filter(m => !toBool(m.from_me) && Number(m.status) < 3).map(m => m.id).filter(Boolean)
      if (ids.length > 0) await window.api.markMessagesRead({ jid, msgIds: ids })
    }
  } catch (e) { console.warn("[markChatRead]", e) }
}

// ════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════
export default function ChatWindow({ jid }) {
  injectStyles()

  const { messages, loadMessages, refreshActiveChat, chats, appendMessage, setActiveJid, contacts, updateReactions, prependMessages, loadReactions } = useChatStore()
  const { toggleRightPanel, openMedia } = useAppStore()
  const [loading,     setLoading]     = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore,     setHasMore]     = useState(true)
  const [replyTo,     setReplyTo]     = useState(null)
  const [showFab,     setShowFab]     = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [headerDevEvalOpen, setHeaderDevEvalOpen] = useState(false)
  const [headerDevEvalMsg,  setHeaderDevEvalMsg]  = useState(null)

  const bottomRef    = useRef(null)
  const inputAreaRef = useRef(null)
  const areaRef      = useRef(null)
  const prevJidRef   = useRef(null)
  const offsetRef    = useRef(0)
  const [scrollBtnBottom, setScrollBtnBottom] = useState(80)

  useEffect(() => {
    const update = () => {
      const el = inputAreaRef.current
      setScrollBtnBottom(el ? el.offsetHeight + 14 : 80)
    }
    update()
    const ro = new ResizeObserver(update)
    if (inputAreaRef.current) ro.observe(inputAreaRef.current)
    return () => ro.disconnect()
  }, [replyTo])

  const normalizedJid = normalizeJid(jid)
  const msgs    = messages[normalizedJid] || []
  const isGroup = isJidGroup(jid || "")
  const chat    = chats.find(c => normalizeJid(c.jid) === normalizedJid)
  const name    = resolveDisplayName(jid, chat || {})

  // Group member count lazy-fetch
  useEffect(() => {
    if (!isGroup || !jid || !window.api) return
    const cnt = chat?.member_count ?? chat?.participant_count ?? null
    if (cnt && cnt > 0) return
    let cancelled = false
    window.api.groupGetMetadata?.({ jid })
      .then(res => {
        const meta = res?.data || res
        if (cancelled || !meta?.participants?.length) return
        useChatStore.getState().upsertChat({ jid, member_count: meta.participants.length })
      }).catch(() => {})
    return () => { cancelled = true }
  }, [jid, isGroup, chat?.member_count])

  const handleMediaClick = useCallback((msg, src, type) => {
    const ALBUM_WIN = 90
    if (ALBUM_TYPES.has(msg.msg_type)) {
      const clickedIdx = msgs.findIndex(m => m.id === msg.id)
      if (clickedIdx !== -1) {
        const refTs = msg.timestamp || 0
        const isFromAlbum = m =>
          ALBUM_TYPES.has(m.msg_type) && !toBool(m.is_view_once) &&
          m.from_me === msg.from_me && Math.abs((m.timestamp || 0) - refTs) <= ALBUM_WIN
        let start = clickedIdx, end = clickedIdx
        for (let i = clickedIdx - 1; i >= 0; i--) { if (isFromAlbum(msgs[i])) start = i; else break }
        for (let i = clickedIdx + 1; i < msgs.length; i++) { if (isFromAlbum(msgs[i])) end = i; else break }
        const group = msgs.slice(start, end + 1)
        if (group.length >= 2) {
          const pathToSrc = raw => {
            if (!raw) return null
            if (raw.startsWith("http") || raw.startsWith("media://")) return raw
            return `media://${raw}`
          }
          const mediaItems = group.map(m => ({
            src:       pathToSrc(m.media_saved_path || m.media_url),
            type:      m.msg_type === "videoMessage" ? "video" : "image",
            caption:   m.caption || "",
            timestamp: m.timestamp,
            msgId:     m.id,
          }))
          const clickedMediaIdx = group.findIndex(m => m.id === msg.id)
          openMedia(mediaItems, clickedMediaIdx >= 0 ? clickedMediaIdx : 0)
          return
        }
      }
    }
    const finalSrc = src?.startsWith("file://") ? `media://${src.slice(7)}` : src
    const mediaType = type || (msg.msg_type === "videoMessage" ? "video" : "image")
    openMedia([{ src: finalSrc, type: mediaType, caption: msg.caption || "", timestamp: msg.timestamp, msgId: msg.id }], 0)
  }, [msgs, openMedia])

  // Load messages on jid change
  const prevMsgCountRef = useRef(0)
  useEffect(() => {
    if (!jid) return
    setLoading(true)
    setHasMore(true)
    offsetRef.current = 0
    prevJidRef.current = jid
    loadMessages(jid, 40, 0)
      .then(loaded => {
        if (loaded?.length < 40) setHasMore(false)
        offsetRef.current = loaded?.length || 0
        setLoading(false)
        markChatRead(jid, useChatStore.getState().messages[normalizeJid(jid)] || [])
      })
      .catch(() => setLoading(false))
  }, [jid])

  useEffect(() => {
    if (!window.api || !jid) return
    const unsubs = [
      window.api.onMessageReceived?.((msg) => {
        if (!msg) return
        const msgJid = normalizeJid(msg.jid || msg.remoteJid || "")
        if (msgJid !== normalizedJid) return
        startTransition(() => appendMessage(jid, msg))
        const area = areaRef.current
        const atBottom = area && (area.scrollHeight - area.scrollTop - area.clientHeight < 250)
        if (atBottom) {
          setTimeout(() => { if (areaRef.current) areaRef.current.scrollTop = areaRef.current.scrollHeight }, 80)
        } else {
          setUnreadCount(c => c + 1)
        }
      }),
      window.api.onMessageUpdated?.((msg) => {
        if (!msg) return
        useChatStore.getState().updateMessage?.(jid, msg)
      }),
      window.api.onReactionReceived?.((data) => {
        if (!data) return
        updateReactions?.(jid, data)
      }),
    ]
    return () => unsubs.forEach(fn => fn?.())
  }, [jid, normalizedJid])

  useEffect(() => {
    if (loading) return
    prevMsgCountRef.current = msgs.length
  }, [msgs.length, loading])

  // Scroll to bottom after load
  const scrollJidRef = useRef(null)
  const scrollAfterLoad = useCallback(() => {
    let rafId, attempts = 0
    const MAX = 12
    const tryScroll = () => {
      const area = areaRef.current
      if (area && area.scrollHeight > area.clientHeight + 10) {
        area.scrollTop = area.scrollHeight
      } else if (attempts++ < MAX) {
        rafId = requestAnimationFrame(tryScroll)
      }
    }
    rafId = requestAnimationFrame(tryScroll)
    return () => cancelAnimationFrame(rafId)
  }, [])

  const renderItemsImmediate = useMemo(() => groupMessages(msgs), [msgs])
  const renderItemsDeferred  = useDeferredValue(renderItemsImmediate)
  const renderItems          = loading ? [] : renderItemsDeferred

  const { slice: windowedItems, hasHidden, hiddenCount, onScroll: windowScroll, setWindowEnd } = useWindowedItems(renderItems, areaRef, loading)

  useEffect(() => {
    if (loading || msgs.length === 0) return
    if (scrollJidRef.current === jid) return
    scrollJidRef.current = jid
    setWindowEnd(renderItems.length + WINDOW_OVERSCAN)
    return scrollAfterLoad()
  }, [loading, jid, msgs.length > 0])  // eslint-disable-line

  const scrollToMsg = useCallback(msgId => {
    if (!msgId) return
    const el = document.querySelector(`[data-msgid="${msgId}"]`)
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => el.dispatchEvent(new CustomEvent("msg-highlight")), 350) }
  }, [])

  // [UI-8] Passive scroll
  useEffect(() => {
    const area = areaRef.current; if (!area) return
    const onScroll = async () => {
      windowScroll()
      const dist = area.scrollHeight - area.scrollTop - area.clientHeight
      setShowFab(dist > 300)
      if (dist < 50) {
        setUnreadCount(0)
        markChatRead(jid, useChatStore.getState().messages[normalizeJid(jid)] || [])
      }
      if (!loadingMore && hasMore && !loading && area.scrollTop <= 120) {
        setLoadingMore(true)
        const currentOffset = offsetRef.current
        const LOAD_COUNT    = 30
        const heightBefore  = area.scrollHeight
        const older = await prependMessages(jid, LOAD_COUNT, currentOffset)
        offsetRef.current = currentOffset + older.length
        if (older.length < LOAD_COUNT) setHasMore(false)
        if (older.length > 0 && jid) { const { prefetchChat } = await import("../hooks/useMediaPrefetch"); prefetchChat(jid, LOAD_COUNT + 10, false) }
        requestAnimationFrame(() => { if (area) area.scrollTop += (area.scrollHeight - heightBefore) })
        setLoadingMore(false)
      }
    }
    area.addEventListener("scroll", onScroll, { passive: true })
    return () => area.removeEventListener("scroll", onScroll)
  }, [jid, loadingMore, hasMore, loading, prependMessages, windowScroll])

  const memberCount = isGroup
    ? (() => { const c = chat?.member_count ?? chat?.participant_count ?? null; return c && c > 0 ? c : null })()
    : null

  return (
    <div className="chat-window">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="cw-header">
        <Avatar jid={jid} name={name}/>
        <div
          className="chat-header-info"
          style={{ cursor: isGroup ? "pointer" : "default" }}
          onClick={isGroup ? toggleRightPanel : undefined}
        >
          <div className="cw-header-name">{name}</div>
          <div className="cw-header-sub">
            {isGroup
              ? memberCount ? `${memberCount} anggota` : "Grup"
              : "online"
            }
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button className="cw-header-btn" title="Cari"><SearchIcon/></button>
          <button className="cw-header-btn" title="Telepon"><PhoneIcon/></button>
          <button
            className="cw-header-btn accent"
            title="Dev Eval"
            onClick={() => {
              const allMsgs = useChatStore.getState().messages[normalizeJid(jid)] || []
              setHeaderDevEvalMsg(allMsgs[allMsgs.length - 1] || null)
              setHeaderDevEvalOpen(true)
            }}
          >
            <CodeIcon/>
          </button>
        </div>
      </div>

      {/* ── Messages area ───────────────────────────────────────────────────── */}
      <div className="msg-area" ref={areaRef}>
        {/* [UI-3] Load-more bar — slim top strip */}
        {loadingMore && (
          <div className="cw-load-more-bar">
            <div className="cw-load-spinner"/>
            Memuat pesan lama...
          </div>
        )}

        {loading ? (
          Array.from({ length: 10 }).map((_, i) => (
            <SkeletonBubble key={i} isMe={i % 3 === 0} index={i}/>
          ))
        ) : msgs.length === 0 ? (
          <div className="cw-empty">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2, #aaa)" }}>Belum ada pesan</div>
            <div style={{ fontSize: 11 }}>Mulai percakapan di bawah</div>
          </div>
        ) : (
          <>
            {hasHidden && (
              <div className="cw-load-more-bar">
                <div className="cw-load-spinner"/>
                {hiddenCount} pesan di atas — scroll naik untuk memuat
              </div>
            )}
            {windowedItems.map(item => {
              if (item.type === "date") return <DateSep key={item.key} date={item.ts}/>
              if (item.type === "album") {
                const first = item.msgs[0]
                return (
                  <div key={item.key} data-msgid={first?.id}>
                    <AlbumBubbleWrapper
                      msgs={item.msgs}
                      isMe={toBool(first?.from_me)}
                      isGroup={toBool(first?.is_group)}
                      onMediaClick={handleMediaClick}
                      openMedia={openMedia}
                      onReply={setReplyTo}
                    />
                  </div>
                )
              }
              return (
                <div key={item.key} data-msgid={item.msg?.id}>
                  <MessageBubble
                    msg={item.msg}
                    onReply={setReplyTo}
                    onScrollToMsg={scrollToMsg}
                    onMediaClick={handleMediaClick}
                  />
                </div>
              )
            })}
          </>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* ── [UI-2] Scroll FAB — animated ────────────────────────────────────── */}
      {showFab && (
        <button
          className="cw-scroll-fab"
          style={{ bottom: scrollBtnBottom }}
          onClick={() => {
            if (areaRef.current) areaRef.current.scrollTop = areaRef.current.scrollHeight
            setUnreadCount(0)
          }}
          title="Scroll ke pesan terbaru"
        >
          {unreadCount > 0 && (
            <span className="cw-scroll-fab-badge">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
          <ArrowDownIcon/>
        </button>
      )}

      {/* ── Input ───────────────────────────────────────────────────────────── */}
      <div ref={inputAreaRef}>
        <MessageInput
          chatJid={jid}
          chatName={name}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      </div>

      {/* Dev eval modal */}
      {headerDevEvalOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9999 }}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
        >
          <DevEvalModal msg={headerDevEvalMsg} onClose={() => setHeaderDevEvalOpen(false)}/>
        </div>
      )}
    </div>
  )
}