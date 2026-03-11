"use strict"

const { normalizeJid, isLidJid, resolveLid, getJidDisplayPhone, parseJid } = require("./jid-utils")

// ════════════════════════════════════════════════════════════
// RENDERER PAYLOAD BUILDER
// ════════════════════════════════════════════════════════════

/**
 * buildRendererPayload — slim IPC-safe payload for the renderer.
 *
 * [FIX-IMAGEBUBBLE] Every nullable field uses `|| null` or `?? null`.
 * Never `parsed.x` bare — better-sqlite3 maps DB NULL to `undefined` in some
 * code paths and Baileys proto fields default to `undefined` when absent.
 * `undefined` leaking into an IPC message is serialized as the key being
 * omitted entirely, which means the renderer receives `msg.field === undefined`
 * rather than `msg.field === null`. If a React component guards on that field
 * before all hook calls, it triggers the "Rendered fewer hooks" invariant crash.
 *
 * [FIX-EXPIRED-CDN] media_key, media_direct_path, media_enc_sha256 are now
 * forwarded to the renderer. Previously they were stored in DB but never sent
 * over IPC, so the renderer had no way to request a re-download when the
 * WA CDN URL expired (ERR_NAME_NOT_RESOLVED errors).
 */
function buildRendererPayload(parsed) {
  if (!parsed) return null

  return {
    // Identity
    id:          parsed.id          ?? null,
    chat_jid:    parsed.chat_jid    ?? null,
    sender_jid:  parsed.sender_jid  ?? null,
    sender_name: parsed._resolved_sender_name || parsed.pushname || null,
    is_group:    parsed.is_group    ?? 0,
    from_me:     parsed.from_me     ?? 0,

    // Content
    msg_type:  parsed.msg_type  || null,
    body:      parsed.body      || null,
    timestamp: parsed.timestamp ?? null,
    status:    parsed.status    ?? 0,

    // Media — all fields explicitly null when absent
    has_media:           parsed.has_media          ?? 0,
    mimetype:            parsed.mimetype           || null,
    media_url:           parsed.media_url          || null,
    media_saved_path:    parsed.media_saved_path   || null,
    media_duration:      parsed.media_duration     ?? null,
    media_filename:      parsed.media_filename     || null,
    media_width:         parsed.media_width        ?? null,
    media_height:        parsed.media_height       ?? null,
    is_animated:         parsed.is_animated        ?? 0,
    is_ptt:              parsed.is_ptt             ?? 0,
    is_gif:              parsed.is_gif             ?? 0,
    is_view_once:        parsed.is_view_once       ?? 0,
    // [FIX-IMAGEBUBBLE] Explicit null — undefined here is the root cause of
    // the React hooks crash in <ImageBubble>. See media-extractor.js for full
    // explanation of the failure chain.
    media_thumbnail_b64: parsed.media_thumbnail_b64 || null,
    // [FIX-EXPIRED-CDN] Crypto re-download fields — now forwarded to renderer
    media_key:           parsed.media_key          || null,
    media_direct_path:   parsed.media_direct_path  || null,
    media_enc_sha256:    parsed.media_enc_sha256    || null,

    // Quoted
    quoted_id:            parsed.quoted_id               || null,
    quoted_body:          parsed.quoted_body             || null,
    quoted_sender:        parsed.quoted_sender           || null,
    quoted_sender_name:   parsed._resolved_quoted_sender_name || null,
    quoted_type:          parsed.quoted_type             || null,
    quoted_has_media:     parsed.quoted_has_media        ?? 0,
    quoted_is_view_once:  parsed.quoted_is_view_once     ?? 0,
    // [FIX-IMAGEBUBBLE] Same null-coerce for quoted thumbnail
    quoted_thumbnail_b64: parsed.quoted_thumbnail_b64    || null,
    is_status_reply:      parsed.is_status_reply         ?? 0,
    quoted_status_music:  parsed.quoted_status_music     || null,

    // Mentions — always array
    mentioned_jids: (() => {
      if (!parsed.mentioned_jids) return []
      try {
        const r = typeof parsed.mentioned_jids === "string"
          ? JSON.parse(parsed.mentioned_jids)
          : parsed.mentioned_jids
        return Array.isArray(r) ? r : []
      } catch (_) { return [] }
    })(),

    // Poll
    poll_options: (() => {
      if (!parsed.poll_options) return null
      try {
        return typeof parsed.poll_options === "string"
          ? JSON.parse(parsed.poll_options)
          : parsed.poll_options
      } catch (_) { return null }
    })(),

    // Location
    location_lat:     parsed.location_lat     ?? null,
    location_lng:     parsed.location_lng     ?? null,
    location_name:    parsed.location_name    || null,
    location_address: parsed.location_address || null,

    // Contact
    contacts_json: (() => {
      if (!parsed.contacts_json) return null
      try {
        return typeof parsed.contacts_json === "string"
          ? JSON.parse(parsed.contacts_json)
          : parsed.contacts_json
      } catch (_) { return null }
    })(),

    // Reaction
    reaction_emoji:     parsed.reaction_emoji     || null,
    reaction_target_id: parsed.reaction_target_id || null,

    // Forward
    is_forwarded:     parsed.is_forwarded     ?? 0,
    forwarding_score: parsed.forwarding_score ?? 0,

    // Event
    event_name:        parsed.event_name        || null,
    event_description: parsed.event_description || null,
    event_start_time:  parsed.event_start_time  ?? null,
    event_end_time:    parsed.event_end_time    ?? null,
    event_location:    parsed.event_location    || null,
    event_join_link:   parsed.event_join_link   || null,
    event_is_canceled: parsed.event_is_canceled ?? 0,

    // Call log
    call_is_video: parsed.call_is_video ?? null,
    call_outcome:  parsed.call_outcome  || null,
    call_duration: parsed.call_duration ?? null,

    // Group invite
    group_invite_jid:    parsed.group_invite_jid    || null,
    group_invite_name:   parsed.group_invite_name   || null,
    group_invite_code:   parsed.group_invite_code   || null,
    group_invite_expiry: parsed.group_invite_expiry ?? null,

    // Pin / Keep
    pin_msg_id:  parsed.pin_msg_id  || null,
    pin_type:    parsed.pin_type    || null,
    keep_msg_id: parsed.keep_msg_id || null,
    keep_type:   parsed.keep_type   || null,

    // Scheduled call
    sched_call_title: parsed.sched_call_title || null,
    sched_call_at:    parsed.sched_call_at    ?? null,
    sched_call_video: parsed.sched_call_video ?? null,

    // Album
    album_count: parsed.album_count ?? null,

    // Link preview
    link_preview_url:   parsed.link_preview_url   || null,
    link_preview_title: parsed.link_preview_title || null,
    link_preview_desc:  parsed.link_preview_desc  || null,
    link_preview_thumb: parsed.link_preview_thumb || null,

    starred: parsed.starred ?? 0,
  }
}

/**
 * dbRowToRendererMsg — flat DB row → renderer format.
 *
 * [FIX-IMAGEBUBBLE] same null-coerce discipline — better-sqlite3 maps
 * DB NULL to undefined in some paths; coercing all media fields to null
 * ensures the renderer never receives undefined for nullable columns.
 *
 * [FIX-EXPIRED-CDN] media_key, media_direct_path, media_enc_sha256 forwarded.
 */
function dbRowToRendererMsg(row) {
  if (!row) return null

  let mentionedJids = []
  if (row.mentioned_jids) {
    try {
      const raw = typeof row.mentioned_jids === "string"
        ? JSON.parse(row.mentioned_jids)
        : row.mentioned_jids
      mentionedJids = Array.isArray(raw)
        ? raw.map(jid => {
            const norm = normalizeJid(jid)
            return isLidJid(norm) ? (resolveLid(norm) || null) : norm
          }).filter(Boolean)
        : []
    } catch (_) {}
  }

  return {
    ...row,
    mentioned_jids: mentionedJids,
    // Parse JSON string fields
    poll_options: row.poll_options
      ? (typeof row.poll_options === "string" ? (() => { try { return JSON.parse(row.poll_options) } catch (_) { return null } })() : row.poll_options)
      : null,
    contacts_json: row.contacts_json
      ? (typeof row.contacts_json === "string" ? (() => { try { return JSON.parse(row.contacts_json) } catch (_) { return null } })() : row.contacts_json)
      : null,
    // [FIX-IMAGEBUBBLE] Coerce all media/thumbnail: DB NULL → JS null (never undefined)
    media_thumbnail_b64:  row.media_thumbnail_b64  || null,
    quoted_thumbnail_b64: row.quoted_thumbnail_b64 || null,
    media_saved_path:     row.media_saved_path     || null,
    media_url:            row.media_url            || null,
    // [FIX-EXPIRED-CDN] crypto re-download fields forwarded
    media_key:            row.media_key            || null,
    media_direct_path:    row.media_direct_path    || null,
    media_enc_sha256:     row.media_enc_sha256      || null,
  }
}

// ════════════════════════════════════════════════════════════
// ENRICH — helper flags for bot handlers / case.js
// ════════════════════════════════════════════════════════════

function enrichMessage(parsed, opts = {}) {
  if (!parsed) return parsed

  const myJid = opts.myJid ? normalizeJid(opts.myJid) : null

  parsed.isGroup    = parsed.is_group    === 1
  parsed.fromMe     = parsed.from_me     === 1
  parsed.hasMedia   = parsed.has_media   === 1
  parsed.isGif      = parsed.is_gif      === 1
  parsed.isPtt      = parsed.is_ptt      === 1
  parsed.isViewOnce = parsed.is_view_once === 1
  parsed.isForwarded = parsed.is_forwarded === 1
  parsed.isBaileys  = parsed.id
    ? (parsed.id.startsWith("BAE5") && parsed.id.length === 16) : false

  const sender = parsed.sender_jid || ""
  parsed.sender        = sender
  parsed.senderNumber  = parseJid(sender)?.user || sender.split("@")[0]
  parsed.senderDisplay = parsed.pushname || getJidDisplayPhone(sender) || sender

  if (myJid) {
    parsed.isBot     = normalizeJid(sender) === normalizeJid(myJid)
    parsed.itsMeYumi = parsed.isBot
  }

  const t = parsed.msg_type || "conversation"
  parsed.type       = t
  parsed.isImage    = t === "imageMessage"
  parsed.isVideo    = t === "videoMessage"
  parsed.isAudio    = t === "audioMessage" || t === "pttMessage"
  parsed.isSticker  = t === "stickerMessage"
  parsed.isDocument = t === "documentMessage"
  parsed.isText     = t === "conversation" || t === "extendedTextMessage"
  parsed.isPoll     = t === "pollCreationMessage"
  parsed.isReaction = t === "reactionMessage"
  parsed.isLocation = t === "locationMessage" || t === "liveLocationMessage"
  parsed.isContact  = t === "contactMessage"  || t === "contactsArrayMessage"

  parsed.isQuotedImage    = parsed.quoted_type === "imageMessage"
  parsed.isQuotedVideo    = parsed.quoted_type === "videoMessage"
  parsed.isQuotedAudio    = parsed.quoted_type === "audioMessage" || parsed.quoted_type === "pttMessage"
  parsed.isQuotedSticker  = parsed.quoted_type === "stickerMessage"
  parsed.isQuotedDocument = parsed.quoted_type === "documentMessage"

  return parsed
}

module.exports = { buildRendererPayload, dbRowToRendererMsg, enrichMessage }
