// src/hooks/useMediaPrefetch.js
// ═══════════════════════════════════════════════════════════════════════════
// LIGHTSPEED MEDIA PREFETCH ENGINE
//
// Strategy:
//   1. When a ChatItem scrolls into view → queue that chat for background
//      media download (images, video, stickers, audio, docs)
//   2. When a chat is clicked → immediately fire prefetch (highest priority)
//   3. Global queue with concurrency limit — never hammers the main process
//   4. Dedup: never prefetch same JID twice per session
//   5. Rate-limit: scroll events coalesced with 300ms debounce per JID
//
// [FIX-AUTO-DL] When autoDownloadMedia=false, prefetch is suppressed entirely.
// The backend also enforces this gate, but suppressing here avoids pointless IPC.
// Sticker-only prefetch is handled server-side via the backend filter.
//
// Architecture:
//   useMediaPrefetch()     → hook for ChatWindow (on-open instant prefetch)
//   useChatListPrefetch()  → hook for ChatList  (IntersectionObserver scroll)
//   prefetchChat(jid)      → standalone fire-and-forget call
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useCallback } from "react"

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_CONCURRENT      = 2
const DEBOUNCE_MS         = 300
const RETRY_BACKOFF_MS    = [500, 1500, 4000] // up to 3 retries
const PREFETCH_LIMIT_OPEN = 30  // chat open (high-priority)
const PREFETCH_LIMIT_SCROLL= 20 // scroll-into-view (low-priority)

// ── Global prefetch state (shared across all hook instances) ──────────────────

/** JIDs successfully prefetched this session — never re-request */
const _prefetched = new Set()
/** JIDs currently in-flight */
const _inflight   = new Set()
/** JIDs pending in queue — O(1) dedup without scanning the array */
const _queued     = new Set()
/** Ordered queue: { jid, limit, retries } */
const _queue      = []
/** Scroll debounce timers per JID */
const _debounce   = new Map()
/** Whether the queue processor is active */
let   _running    = 0
/** Whether the page is currently visible */
let   _pageVisible = !document.hidden

// ── Visibility gate: pause queue while tab is hidden ─────────────────────────
// Avoids wasting IPC budget on background tabs, and prevents stale data
// being marked as prefetched if the app goes dormant mid-flight.

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    _pageVisible = !document.hidden
    if (_pageVisible) _flush()
  })
}

// ── Auto-download setting ─────────────────────────────────────────────────────
// Lazily resolved once; then cached for the session.
// If the store isn't available, default to enabled so we don't silently break.

let _getAutoDownload = null

function _isAutoDownloadEnabled() {
  if (_getAutoDownload === null) {
    try {
      // Lazy require avoids circular dep at module load time
      const { useAppStore } = require("../store/app")
      _getAutoDownload = () => useAppStore.getState().autoDownloadMedia ?? true
    } catch {
      // Store unavailable — fail open (prefetch allowed)
      _getAutoDownload = () => true
    }
  }
  return _getAutoDownload()
}

// ── Queue processor ───────────────────────────────────────────────────────────

function _scheduleRetry(jid, limit, retries) {
  const delay = RETRY_BACKOFF_MS[retries]
  if (delay === undefined) {
    // Max retries exceeded — give up silently; allow a future session to retry
    return
  }
  setTimeout(() => {
    // Re-enqueue only if not already succeeded/in-flight from another path
    if (!_prefetched.has(jid) && !_inflight.has(jid) && !_queued.has(jid)) {
      _queue.push({ jid, limit, retries })
      _queued.add(jid)
      _flush()
    }
  }, delay)
}

function _flush() {
  if (!_pageVisible) return

  while (_running < MAX_CONCURRENT && _queue.length > 0) {
    const item = _queue.shift()
    const { jid, limit, retries = 0 } = item
    _queued.delete(jid)

    // Skip if already handled since this item was enqueued
    if (_prefetched.has(jid) || _inflight.has(jid)) continue

    _inflight.add(jid)
    _running++

    Promise.resolve(window.api?.mediaPrefetch?.({ jid, limit }))
      .then(() => {
        _prefetched.add(jid)
      })
      .catch((err) => {
        // Don't mark as prefetched — allow retry with backoff
        if (process.env.NODE_ENV !== "production") {
          console.warn(`[mediaPrefetch] failed for ${jid} (attempt ${retries + 1}):`, err)
        }
        _scheduleRetry(jid, limit, retries + 1)
      })
      .finally(() => {
        _inflight.delete(jid)
        _running--
        _flush()
      })
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * prefetchChat — enqueue a media prefetch for a chat JID.
 *
 * Safe to call from anywhere (hooks, event handlers, non-React code).
 * No-ops if: IPC unavailable, auto-download off, already done/in-flight/queued.
 *
 * @param {string}  jid      - Chat JID to prefetch
 * @param {number}  limit    - Max messages to scan for pending media
 * @param {boolean} priority - If true, prepend to queue (click > scroll)
 */
export function prefetchChat(jid, limit = PREFETCH_LIMIT_SCROLL, priority = false) {
  if (!jid) return
  if (!window.api?.mediaPrefetch) return

  // [FIX-AUTO-DL] Suppress when auto-download is disabled.
  // The backend enforces this too, but skipping here avoids queue buildup.
  if (!_isAutoDownloadEnabled()) return

  // All three sets must be checked atomically before enqueue
  if (_prefetched.has(jid) || _inflight.has(jid) || _queued.has(jid)) return

  _queued.add(jid)

  if (priority) {
    _queue.unshift({ jid, limit, retries: 0 })
  } else {
    _queue.push({ jid, limit, retries: 0 })
  }

  _flush()
}

/**
 * prefetchChatDebounced — scroll-safe prefetch.
 * Coalesces rapid scroll events so a chat that flashes by doesn't trigger IPC.
 * Only fires if the JID remains visible for ≥DEBOUNCE_MS.
 *
 * @param {string} jid
 * @param {number} limit
 */
export function prefetchChatDebounced(jid, limit = PREFETCH_LIMIT_SCROLL) {
  if (!jid || _prefetched.has(jid) || _inflight.has(jid) || _queued.has(jid)) return

  // Reset debounce window for this JID
  if (_debounce.has(jid)) {
    clearTimeout(_debounce.get(jid))
  }

  const timer = setTimeout(() => {
    _debounce.delete(jid)
    prefetchChat(jid, limit, false)
  }, DEBOUNCE_MS)

  _debounce.set(jid, timer)
}

/**
 * cancelPrefetchDebounce — cancel a pending debounced prefetch.
 * Call when a ChatItem leaves the viewport before the debounce fires.
 *
 * @param {string} jid
 */
export function cancelPrefetchDebounce(jid) {
  const timer = _debounce.get(jid)
  if (timer !== undefined) {
    clearTimeout(timer)
    _debounce.delete(jid)
  }
}

/**
 * resetPrefetchSession — clear all session state.
 * Useful when the user logs out or switches accounts so the new session
 * starts fresh without stale JID entries blocking prefetches.
 */
export function resetPrefetchSession() {
  // Cancel all pending debounces
  for (const timer of _debounce.values()) clearTimeout(timer)
  _debounce.clear()

  // Drain the queue
  _queue.length = 0
  _queued.clear()

  // Note: we intentionally leave _inflight alone —
  // in-flight calls are unrecoverable; they'll finish and clean up naturally.
  // We DO clear _prefetched so the new session can re-fetch as needed.
  _prefetched.clear()
}

// ── Hook: useMediaPrefetch ────────────────────────────────────────────────────
// Use in ChatWindow — fires HIGH-PRIORITY prefetch when a chat is opened.
// Re-runs on jid change (user switches chats).

export function useMediaPrefetch(jid) {
  useEffect(() => {
    if (!jid) return
    prefetchChat(jid, PREFETCH_LIMIT_OPEN, /* priority */ true)
    // No cleanup needed: prefetch is intentionally fire-and-forget.
    // The global sets prevent duplicate calls if the effect re-runs.
  }, [jid])
}

// ── Hook: useChatListPrefetch ─────────────────────────────────────────────────
// Attach the returned { observe, unobserve } to ChatItem mount/unmount.
// Each observed element MUST have a data-jid attribute.
//
// Uses a module-level singleton observer so multiple hook instances
// (e.g. React StrictMode double-invoke, concurrent renders) share one observer.

let _sharedObserver = null
let _observerRefCount = 0

function _getOrCreateObserver() {
  if (_sharedObserver) return _sharedObserver

  _sharedObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const jid = entry.target.dataset?.jid
        if (!jid) continue

        if (entry.isIntersecting) {
          prefetchChatDebounced(jid, PREFETCH_LIMIT_SCROLL)
        } else {
          cancelPrefetchDebounce(jid)
        }
      }
    },
    {
      // Preload slightly outside the visible area so media begins loading
      // just before the user scrolls to a chat row.
      rootMargin: "200px 0px 200px 0px",
      threshold: 0,
    }
  )

  return _sharedObserver
}

function _releaseObserver() {
  if (_observerRefCount > 0) _observerRefCount--
  if (_observerRefCount === 0 && _sharedObserver) {
    _sharedObserver.disconnect()
    _sharedObserver = null
  }
}

export function useChatListPrefetch() {
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!window.api?.mediaPrefetch) return
    if (initializedRef.current) return // guard against StrictMode double-invoke

    initializedRef.current = true
    _observerRefCount++
    _getOrCreateObserver() // ensure singleton is alive

    return () => {
      initializedRef.current = false
      _releaseObserver()
    }
  }, [])

  const observe = useCallback((el) => {
    if (el instanceof Element) {
      _getOrCreateObserver().observe(el)
    }
  }, [])

  const unobserve = useCallback((el) => {
    if (el instanceof Element && _sharedObserver) {
      _sharedObserver.unobserve(el)
      // Also cancel any pending debounce for this element
      const jid = el.dataset?.jid
      if (jid) cancelPrefetchDebounce(jid)
    }
  }, [])

  return { observe, unobserve }
}