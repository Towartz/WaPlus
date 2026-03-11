"use strict"

const { normalizeJid, isLidJid, resolveLid, getJidDisplayPhone, parseJid, isGroupJid, isNewsletterJid, isStatusBroadcastJid } = require("./jid-utils")
const { extractURL, getUrlFromDirectPath, toNumber, generateMessageIDV2, getStatusFromType } = require("./proto-utils")
const { normalizeMessageContent } = require("./msg-helpers")
const { normalizeMsgType } = require("./type-detection")

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
// ENRICH — smsg helper flags for bot handlers / plugins / case.js
// ════════════════════════════════════════════════════════════
//
// enrichMessage(parsed, opts) annotates the flat DB/IPC row with
// every convenience property a bot/plugin author needs — no raw
// proto fields, no manual string ops, no repeated boilerplate.
//
// USAGE IN case.js / plugin onMessage():
//   const smsg = enrichMessage(parsed, { myJid: sock.user.id, sock })
//   smsg.reply("Hello!")           ← reply to the chat
//   smsg.replyQuoted("...")        ← reply quoting this message
//   smsg.isImage                   ← true/false
//   smsg.body                      ← text / caption
//   smsg.mentionedJids             ← Array<jid>
//   smsg.quotedMsg.body            ← quoted message body
//   smsg.quotedMsg.isImage         ← quoted is image?
//   smsg.sender                    ← @s.whatsapp.net JID
//   smsg.senderName                ← display name
//   smsg.phone                     ← "628xxx" (no +)
//   smsg.chatPhone                 ← group/dm phone number
//   smsg.isAdmin                   ← is sender group admin? (needs groupMeta)
//   smsg.mediaUrl                  ← reconstructed CDN URL
//   smsg.download()                ← shortcut to db.getMediaPath()
//   smsg.age                       ← seconds since message was sent
//   smsg.isOld                     ← age > 60s (ignore stale triggers)
//
// M OBJECT (opts.m = rawWAMessage):
//   smsg.m                         ← full WAMessage proto (Baileys raw)
//   smsg.m.message                 ← proto Message object (all fields)
//   smsg.m.key                     ← { remoteJid, fromMe, id, participant }
//   smsg.m.messageTimestamp        ← proto Long timestamp
//   smsg.m.pushName                ← sender display name from proto
//   smsg.m.broadcast               ← true if broadcast
//   smsg.m.status                  ← WA status enum
//   smsg.mContent                  ← normalizeMessageContent(m.message)
//   smsg.mMsg                      ← inner unwrapped message object (ephemeral/viewOnce/etc stripped)
//   smsg.mText                     ← conversation/extendedTextMessage text from proto
//   smsg.mCaption                  ← caption from image/video/document from proto
//   smsg.mMentions                 ← mentionedJid[] from proto contextInfo
//   smsg.mForwardScore             ← forwardingScore from proto contextInfo
//   smsg.mContextInfo              ← raw contextInfo from proto
//   smsg.mQuotedMsg                ← raw quoted WAMessage from contextInfo.quotedMessage
//   smsg.mQuotedKey                ← { remoteJid, fromMe, id, participant } of quoted
//   smsg.mReaction                 ← reactionMessage { text, key } raw proto
//   smsg.mPollOptions              ← poll option names [] from proto
//   smsg.mLocation                 ← { lat, lng, name } from proto
//   smsg.mContacts                 ← contact vcard array from proto
//   smsg.mGroupInvite              ← { groupJid, inviteCode, caption } from proto
//   smsg.mEvent                    ← raw eventMessage from proto
//   smsg.mCallLog                  ← raw callLogMessage from proto
//   smsg.mPinInChat                ← raw pinInChatMessage from proto
//   smsg.mKeepInChat               ← raw keepInChatMessage from proto
//   smsg.mStickerMeta              ← sticker metadata { isAnimated, categories, id }
//   smsg.mOrderMsg                 ← raw orderMessage from proto
//   smsg.mProductMsg               ← raw productMessage from proto
//   smsg.mPaymentMsg               ← raw requestPaymentMessage from proto
//   smsg.mAlbum                    ← raw albumMessage from proto
//   smsg.mInteractive              ← raw interactiveMessage from proto
//   smsg.mNativeFlow               ← raw nativeFlowMessage parsed buttons/params
// ════════════════════════════════════════════════════════════

// ── Internal helpers for M object ────────────────────────────────────────────

/**
 * _getInnerMsg — unwrap ephemeral / documentWithCaption / viewOnce wrappers
 * to return the actual inner message object that contains media/text fields.
 * Does NOT use normalizeMessageContent (which recurses over future-proof wrappers)
 * because we want the first-level unwrap only — inner proto fields like
 * imageMessage, videoMessage, extendedTextMessage etc. should be directly accessible.
 */
function _getInnerMsg(msg) {
  if (!msg) return null
  return msg.ephemeralMessage?.message
    || msg.documentWithCaptionMessage?.message
    || msg.viewOnceMessage?.message
    || msg.viewOnceMessageV2?.message
    || msg.viewOnceMessageV2Extension?.message
    || msg
}

/**
 * _findContextInfo — search all top-level message fields for contextInfo.
 * Covers: extendedTextMessage, imageMessage, videoMessage, audioMessage,
 * documentMessage, buttonsMessage, listMessage, interactiveMessage, and any
 * other object field that has a .contextInfo sub-object.
 */
function _findContextInfo(msg) {
  if (!msg) return null

  // Fast paths for the most common types
  const fast = msg.extendedTextMessage?.contextInfo
    || msg.imageMessage?.contextInfo
    || msg.videoMessage?.contextInfo
    || msg.audioMessage?.contextInfo
    || msg.documentMessage?.contextInfo
    || msg.stickerMessage?.contextInfo
    || msg.contactMessage?.contextInfo
    || msg.locationMessage?.contextInfo
    || msg.liveLocationMessage?.contextInfo
    || msg.pollCreationMessage?.contextInfo
    || msg.pollCreationMessageV2?.contextInfo
    || msg.pollCreationMessageV3?.contextInfo
    || msg.buttonsMessage?.contextInfo
    || msg.listMessage?.contextInfo
    || msg.interactiveMessage?.contextInfo
    || msg.reactionMessage?.contextInfo
  if (fast) return fast

  // Generic scan — covers rare/new types
  for (const key of Object.keys(msg)) {
    const val = msg[key]
    if (val && typeof val === "object" && !Array.isArray(val) && val.contextInfo) {
      return val.contextInfo
    }
  }
  return null
}

/**
 * enrichMessage — annotate a parsed message row with bot-friendly helpers.
 *
 * @param {object} parsed  - flat row from parseMessage() or dbRowToRendererMsg()
 * @param {object} [opts]
 * @param {string}   [opts.myJid]     - own JID for fromMe / isBot detection
 * @param {object}   [opts.sock]      - Baileys socket for reply / download shortcuts
 * @param {object}   [opts.db]        - dbHandler for media path lookup
 * @param {string[]} [opts.adminJids] - list of admin JIDs for isAdmin check
 * @param {object}   [opts.groupMeta] - WAGroupMetadata for admin/participant checks
 * @param {object}   [opts.m]         - raw WAMessage from Baileys (msg from messages.upsert)
 * @returns {object}  mutated `parsed` with all helpers attached
 */
function enrichMessage(parsed, opts = {}) {
  if (!parsed) return parsed

  const myJid     = opts.myJid ? normalizeJid(opts.myJid) : null
  const sock      = opts.sock  || null
  const db        = opts.db    || null

  // ── M object — full raw WAMessage proto ──────────────────────────────────
  // m is the original WAMessage from Baileys messages.upsert.
  // It provides direct proto access: m.message.imageMessage.url, m.key, etc.
  //
  // How to pass it:
  //   enrichMessage(parsed, { myJid, sock, m: rawMsg })
  //   // in modManager: runOnMessage(parsed, rawMsg) auto-passes rawMsg as m
  //
  // When m is not available (DB re-hydration), mContent/mMsg/mText are built
  // from parsed.raw_json as best-effort fallback.
  const _rawM   = opts.m || null
  const _mMsg   = _rawM?.message || null
  const _mMsgN  = _mMsg ? (normalizeMessageContent(_mMsg) || _mMsg) : null

  parsed.m = _rawM   // full WAMessage

  // mContent — normalizeMessageContent result (unwrapped of all future-proof wrappers)
  parsed.mContent = _mMsgN

  // mMsg — the actual inner message object (after ephemeral/viewOnce/documentCaption unwrap)
  // This is what extractBody, extractMediaInfo, etc. operate on.
  parsed.mMsg = _getInnerMsg(_mMsgN || _mMsg)

  // ── Proto text shortcuts ──────────────────────────────────
  const _inner = parsed.mMsg
  parsed.mText = (
    _inner?.conversation ||
    _inner?.extendedTextMessage?.text ||
    null
  )
  parsed.mCaption = (
    _inner?.imageMessage?.caption ||
    _inner?.videoMessage?.caption ||
    _inner?.documentMessage?.caption ||
    _inner?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
    null
  )

  // ── Proto contextInfo ─────────────────────────────────────
  // Walk every possible message type to find contextInfo
  const _ctxInfo = _findContextInfo(_inner || _mMsgN || _mMsg)
  parsed.mContextInfo  = _ctxInfo || null
  parsed.mForwardScore = _ctxInfo?.forwardingScore ?? 0
  parsed.mMentions     = _ctxInfo?.mentionedJid   || []

  // ── Proto quoted raw access ───────────────────────────────
  if (_ctxInfo?.quotedMessage) {
    parsed.mQuotedMsg = _ctxInfo.quotedMessage
    parsed.mQuotedKey = {
      remoteJid:   _ctxInfo.remoteJid   || null,
      fromMe:      !!_ctxInfo.fromMe,
      id:          _ctxInfo.stanzaId    || null,
      participant: _ctxInfo.participant || null,
    }
    // mQuotedContent — inner content of quoted message (unwrapped)
    const _qNorm = normalizeMessageContent(_ctxInfo.quotedMessage)
    parsed.mQuotedContent = _qNorm || _ctxInfo.quotedMessage
    parsed.mQuotedInner   = _getInnerMsg(parsed.mQuotedContent)
  } else {
    parsed.mQuotedMsg     = null
    parsed.mQuotedKey     = null
    parsed.mQuotedContent = null
    parsed.mQuotedInner   = null
  }

  // ── Type-specific proto accessors ─────────────────────────
  // Each is null when not applicable — never throws.

  // Reaction
  parsed.mReaction = _inner?.reactionMessage
    ? { text: _inner.reactionMessage.text || "", key: _inner.reactionMessage.key || null }
    : null

  // Poll — all three variants
  parsed.mPollOptions = (() => {
    const pm = _inner?.pollCreationMessageV3
      || _inner?.pollCreationMessageV2
      || _inner?.pollCreationMessage
    if (!pm?.options) return null
    return pm.options.map(o => o.optionName || o.name || "")
  })()

  // Location / LiveLocation
  parsed.mLocation = (() => {
    const loc = _inner?.locationMessage || _inner?.liveLocationMessage
    if (!loc) return null
    return {
      lat:      loc.degreesLatitude   ?? null,
      lng:      loc.degreesLongitude  ?? null,
      name:     loc.name              || null,
      address:  loc.address           || null,
      url:      loc.url               || null,
      accuracy: loc.accuracyInMeters  || null,
      speed:    loc.speedInMps        || null,
      isLive:   !!_inner?.liveLocationMessage,
    }
  })()

  // Contact vcard
  parsed.mContacts = (() => {
    if (_inner?.contactMessage)
      return [{ displayName: _inner.contactMessage.displayName || "", vcard: _inner.contactMessage.vcard || "" }]
    if (_inner?.contactsArrayMessage?.contacts)
      return _inner.contactsArrayMessage.contacts.map(c => ({ displayName: c.displayName || "", vcard: c.vcard || "" }))
    return null
  })()

  // Group invite
  parsed.mGroupInvite = _inner?.groupInviteMessage
    ? {
        groupJid:   _inner.groupInviteMessage.groupJid   || null,
        groupName:  _inner.groupInviteMessage.groupName  || null,
        inviteCode: _inner.groupInviteMessage.inviteCode || null,
        caption:    _inner.groupInviteMessage.caption    || null,
        expiry:     _inner.groupInviteMessage.inviteExpiration
          ? toNumber(_inner.groupInviteMessage.inviteExpiration) : null,
      }
    : null

  // Event
  parsed.mEvent = _inner?.eventMessage?.event || _inner?.eventMessage || null

  // Call log
  parsed.mCallLog = _inner?.callLogMessage || null

  // Pin / Keep
  parsed.mPinInChat  = _inner?.pinInChatMessage  || null
  parsed.mKeepInChat = _inner?.keepInChatMessage || null

  // Sticker metadata
  parsed.mStickerMeta = _inner?.stickerMessage
    ? {
        isAnimated:  !!_inner.stickerMessage.isAnimated,
        isAvatar:    !!_inner.stickerMessage.isAvatar,
        categories:  _inner.stickerMessage.stickerSentTs   ? [] : (_inner.stickerMessage.categories || []),
        id:          _inner.stickerMessage.fileSha256
          ? Buffer.from(_inner.stickerMessage.fileSha256).toString("hex").slice(0, 16)
          : null,
        directPath:  _inner.stickerMessage.directPath  || null,
        mediaKey:    _inner.stickerMessage.mediaKey
          ? Buffer.isBuffer(_inner.stickerMessage.mediaKey)
              ? _inner.stickerMessage.mediaKey.toString("base64")
              : _inner.stickerMessage.mediaKey
          : null,
        mimetype:    _inner.stickerMessage.mimetype    || "image/webp",
        fileLength:  _inner.stickerMessage.fileLength  ? toNumber(_inner.stickerMessage.fileLength) : null,
      }
    : null

  // Commerce
  parsed.mOrderMsg   = _inner?.orderMessage         || null
  parsed.mProductMsg = _inner?.productMessage       || null
  parsed.mPaymentMsg = _inner?.requestPaymentMessage
    || _inner?.sendPaymentMessage
    || _inner?.paymentMessage
    || null

  // Album
  parsed.mAlbum = _inner?.albumMessage
    ? {
        expectedImageCount: _inner.albumMessage.expectedImageCount || 0,
        expectedVideoCount: _inner.albumMessage.expectedVideoCount || 0,
        total: (_inner.albumMessage.expectedImageCount || 0) + (_inner.albumMessage.expectedVideoCount || 0),
      }
    : null

  // Interactive message (new buttons / native flow)
  parsed.mInteractive = _inner?.interactiveMessage || null

  // Native flow — parse buttons and paramsJson
  parsed.mNativeFlow = (() => {
    const nf = _inner?.nativeFlowMessage
      || _inner?.interactiveMessage?.nativeFlowMessage
    if (!nf) return null
    let params = null
    try { params = nf.buttonParamsJson ? JSON.parse(nf.buttonParamsJson) : null } catch (_) {}
    return { name: nf.name || null, params, buttons: nf.buttons || [] }
  })()

  // ── Proto media raw access ────────────────────────────────
  // mImageMsg, mVideoMsg, mAudioMsg, mDocMsg, mStickerMsg — raw proto media objects
  // Useful for accessing fields not in parsed DB row (e.g. fileEncSha256 bytes, waveform, etc.)
  parsed.mImageMsg   = _inner?.imageMessage   || null
  parsed.mVideoMsg   = _inner?.videoMessage   || null
  parsed.mAudioMsg   = _inner?.audioMessage   || null
  parsed.mDocMsg     = _inner?.documentMessage
    || _inner?.documentWithCaptionMessage?.message?.documentMessage
    || null
  parsed.mStickerMsg = _inner?.stickerMessage || null

  // ── Waveform (PTT) ────────────────────────────────────────
  parsed.mWaveform = (() => {
    const ptt = _inner?.audioMessage
    if (!ptt?.ptt || !ptt?.waveform) return null
    const raw = ptt.waveform
    if (Buffer.isBuffer(raw)) return Array.from(raw)
    if (raw instanceof Uint8Array) return Array.from(raw)
    if (Array.isArray(raw))   return raw
    return null
  })()

  // ── Proto buttons / list raw ──────────────────────────────
  parsed.mButtons = (() => {
    if (_inner?.buttonsMessage?.buttons)
      return _inner.buttonsMessage.buttons.map(b => ({
        id: b.buttonId, text: b.buttonText?.displayText || "", type: b.type
      }))
    if (_inner?.listMessage?.sections)
      return _inner.listMessage.sections.flatMap(s =>
        (s.rows || []).map(r => ({ id: r.rowId || r.id, text: r.title || r.description || "" }))
      )
    return null
  })()

  // ── Disappearing message duration ────────────────────────
  parsed.mEphemeralDuration = _rawM?.ephemeralDuration || null
  parsed.mEphemeralStartTs  = _rawM?.ephemeralStartTimestamp
    ? toNumber(_rawM.ephemeralStartTimestamp) : null

  // ── Edit / Protocol helpers ───────────────────────────────
  parsed.mIsEdit    = _inner?.protocolMessage?.type === 14  // MESSAGE_EDIT
  parsed.mEditedMsg = _inner?.protocolMessage?.editedMessage || null
  parsed.mEditedKey = _inner?.protocolMessage?.key || null
  parsed.mIsRevoke  = _inner?.protocolMessage?.type === 0   // REVOKE

  // ── encReaction / encEventUpdate ─────────────────────────
  parsed.mEncReaction    = _inner?.encReactionMessage    || null
  parsed.mEncEventUpdate = _inner?.encEventUpdateMessage || null

  // ── statusMention / groupMention ─────────────────────────
  parsed.mStatusMention = _inner?.statusMentionMessage || null
  parsed.mGroupMention  = _inner?.groupMentionedMessage || null

  // ── botInvoke ─────────────────────────────────────────────
  parsed.mBotInvoke = _inner?.botInvokeMessage || null

  // ── Scheduled call ────────────────────────────────────────
  parsed.mSchedCall = _inner?.scheduledCallCreationMessage
    || _inner?.scheduledCallEditMessage
    || null

  // ── Raw key convenience ───────────────────────────────────
  parsed.mKey = _rawM?.key || null

  // ── Boolean DB-flag shortcuts ────────────────────────────
  parsed.isGroup      = parsed.is_group     === 1
  parsed.fromMe       = parsed.from_me      === 1
  parsed.hasMedia     = parsed.has_media    === 1
  parsed.isGif        = parsed.is_gif       === 1
  parsed.isPtt        = parsed.is_ptt       === 1
  parsed.isViewOnce   = parsed.is_view_once === 1
  parsed.isForwarded  = parsed.is_forwarded === 1
  parsed.isStarred    = parsed.starred      === 1
  parsed.isHistoryMsg = parsed.is_history_sync === 1

  // ── Message type shortcuts ────────────────────────────────
  const t = parsed.msg_type || "conversation"
  parsed.type           = t
  parsed.mtype          = t   // alias — some bots use mtype
  parsed.isText         = t === "conversation"       || t === "extendedTextMessage"
  parsed.isImage        = t === "imageMessage"
  parsed.isVideo        = t === "videoMessage"
  parsed.isAudio        = t === "audioMessage"       || t === "pttMessage"
  parsed.isVoice        = t === "pttMessage"          // explicit alias
  parsed.isSticker      = t === "stickerMessage"
  parsed.isDocument     = t === "documentMessage"
  parsed.isPoll         = t === "pollCreationMessage"
  parsed.isPollUpdate   = t === "pollUpdateMessage"
  parsed.isReaction     = t === "reactionMessage"
  parsed.isLocation     = t === "locationMessage"    || t === "liveLocationMessage"
  parsed.isLiveLocation = t === "liveLocationMessage"
  parsed.isContact      = t === "contactMessage"     || t === "contactsArrayMessage"
  parsed.isGroupInvite  = t === "groupInviteMessage"
  parsed.isEvent        = t === "eventMessage"
  parsed.isCallLog      = t === "callLogMessage"
  parsed.isAlbum        = t === "albumMessage"
  parsed.isPin          = t === "pinInChatMessage"
  parsed.isKeep         = t === "keepInChatMessage"
  parsed.isProtocol     = t === "protocol"
  parsed.isInteractive  = t === "interactiveMessage" || t === "interactiveResponseMessage"
  parsed.isButtons      = t === "buttonsMessage"     || t === "buttonsResponseMessage"
  parsed.isTemplate     = t === "templateMessage"    || t === "templateButtonReplyMessage"
  parsed.isProduct      = t === "productMessage"
  parsed.isOrder        = t === "orderMessage"
  parsed.isPayment      = t === "requestPaymentMessage" || t === "sendPaymentMessage" || t === "paymentMessage"
  parsed.isNewsletter   = isNewsletterJid(parsed.chat_jid || "")
  parsed.isStatus       = isStatusBroadcastJid(parsed.chat_jid || "")
  parsed.isDM           = !parsed.isGroup && !parsed.isStatus && !parsed.isNewsletter

  // ── Body shortcut ─────────────────────────────────────────
  // `text` mirrors `body` — many bots use msg.text
  parsed.text = parsed.body || ""

  // ── URL detection ─────────────────────────────────────────
  parsed.url     = parsed.text ? (extractURL(parsed.text) || null) : null
  parsed.hasUrl  = !!parsed.url

  // ── Link preview shortcut ─────────────────────────────────
  parsed.linkPreview = (parsed.link_preview_url || parsed.link_preview_title)
    ? {
        url:   parsed.link_preview_url   || null,
        title: parsed.link_preview_title || null,
        desc:  parsed.link_preview_desc  || null,
        thumb: parsed.link_preview_thumb || null,
      }
    : null

  // ── Baileys bot signature check ──────────────────────────
  // BAE5 = 16-char Baileys-generated msgId prefix
  parsed.isBaileys = parsed.id
    ? (parsed.id.startsWith("BAE5") && parsed.id.length === 16)
    : false

  // ── Sender / JID helpers ─────────────────────────────────
  const sender = parsed.sender_jid ? normalizeJid(parsed.sender_jid) : ""
  parsed.sender       = sender
  parsed.senderJid    = sender    // explicit alias

  const decoded       = sender ? parseJid(sender) : null
  parsed.senderNumber = decoded?.user || sender.split("@")[0]
  parsed.phone        = parsed.senderNumber   // alias
  parsed.senderName   = parsed.pushname
    || (parsed._resolved_sender_name || null)
    || getJidDisplayPhone(sender)
    || sender
  parsed.senderDisplay = parsed.senderName    // alias
  parsed.senderShort  = (parsed.senderName || "").split(" ")[0] || parsed.senderNumber

  // Chat JID helpers
  const chatJid         = parsed.chat_jid ? normalizeJid(parsed.chat_jid) : ""
  parsed.chatJid        = chatJid
  const chatDecoded     = chatJid ? parseJid(chatJid) : null
  parsed.chatPhone      = chatDecoded?.user || chatJid.split("@")[0]
  parsed.chatServer     = chatDecoded?.server || null

  // ── fromMe + isBot detection ─────────────────────────────
  // isBot: sender is literally our own JID (bot sent it)
  // fromMe: DB flag (may differ — Baileys sets fromMe=true for ALL own messages
  //         including ones on linked devices)
  if (myJid) {
    parsed.isBot     = normalizeJid(sender) === myJid
    parsed.itsMeYumi = parsed.isBot   // legacy alias used by some bots
  } else {
    parsed.isBot     = parsed.fromMe
    parsed.itsMeYumi = parsed.fromMe
  }

  // ── Timestamp helpers ────────────────────────────────────
  const ts         = parsed.timestamp || 0
  parsed.ts        = ts                           // alias
  parsed.date      = ts ? new Date(ts * 1000) : null
  parsed.age       = ts ? Math.floor(Date.now() / 1000) - ts : Infinity
  parsed.isOld     = parsed.age > 60             // >60s old — ignore stale commands
  parsed.isRecent  = parsed.age <= 30            // <=30s — fresh message

  // ── Message status ───────────────────────────────────────
  parsed.statusNum  = parsed.status ?? 0
  parsed.isDelivered = parsed.statusNum >= 3      // DELIVERY_ACK
  parsed.isRead      = parsed.statusNum >= 4      // READ
  parsed.isPlayed    = parsed.statusNum >= 5      // PLAYED (audio/video)

  // ── Media helpers ────────────────────────────────────────
  if (parsed.hasMedia) {
    // Reconstruct CDN URL if media_url has expired but directPath is available
    parsed.mediaUrl  = parsed.media_url
      || (parsed.media_direct_path ? getUrlFromDirectPath(parsed.media_direct_path) : null)

    parsed.mediaMime     = parsed.mimetype        || null
    parsed.mediaSize     = parsed.media_size      || null
    parsed.mediaDuration = parsed.media_duration  || null
    parsed.mediaFilename = parsed.media_filename  || null
    parsed.mediaWidth    = parsed.media_width     || null
    parsed.mediaHeight   = parsed.media_height    || null
    parsed.mediaLocalPath = parsed.media_saved_path || null
    parsed.mediaIsDownloaded = !!(parsed.media_saved_path)
    parsed.mediaThumbnail = parsed.media_thumbnail_b64 || null

    // Crypto fields for re-download (needed when CDN URL expires)
    parsed.mediaKey      = parsed.media_key        || null
    parsed.mediaPath     = parsed.media_direct_path|| null
    parsed.mediaEncSha   = parsed.media_enc_sha256 || null

    // download() — get local file path, optionally trigger download if missing
    parsed.download = async () => {
      if (parsed.media_saved_path) return parsed.media_saved_path
      if (db?.getMediaPath) return db.getMediaPath(parsed.id)
      return null
    }
  } else {
    parsed.mediaUrl      = null
    parsed.download      = async () => null
  }

  // ── Mentions ─────────────────────────────────────────────
  let mentionedJids = []
  if (parsed.mentioned_jids) {
    try {
      const raw = typeof parsed.mentioned_jids === "string"
        ? JSON.parse(parsed.mentioned_jids)
        : parsed.mentioned_jids
      mentionedJids = Array.isArray(raw) ? raw : []
    } catch (_) {}
  }
  parsed.mentionedJids = mentionedJids
  parsed.mentions      = mentionedJids    // alias
  parsed.isMentioned   = myJid
    ? mentionedJids.some(j => normalizeJid(j) === myJid)
    : false

  // ── Group participant / admin helpers ────────────────────
  if (parsed.isGroup && opts.groupMeta) {
    const meta = opts.groupMeta
    const participant = meta.participants?.find(p => {
      try { return normalizeJid(p.id) === sender } catch (_) { return false }
    })
    parsed.isAdmin       = participant?.isAdmin      || false
    parsed.isSuperAdmin  = participant?.isSuperAdmin || false
    parsed.groupName     = meta.subject || null
    parsed.groupDesc     = meta.desc    || null
    parsed.groupOwner    = meta.owner   || null
    parsed.memberCount   = meta.participants?.length ?? null
  } else if (opts.adminJids) {
    parsed.isAdmin       = opts.adminJids.some(j => normalizeJid(j) === sender)
    parsed.isSuperAdmin  = false
    parsed.groupName     = null
  } else {
    parsed.isAdmin       = false
    parsed.isSuperAdmin  = false
    parsed.groupName     = null
    parsed.groupDesc     = null
    parsed.groupOwner    = null
    parsed.memberCount   = null
  }

  // ── Reaction helpers ─────────────────────────────────────
  if (parsed.isReaction) {
    parsed.reactionEmoji  = parsed.reaction_emoji     || ""
    parsed.reactionTarget = parsed.reaction_target_id || null
    parsed.isRemoveReaction = !parsed.reaction_emoji
  } else {
    parsed.reactionEmoji  = null
    parsed.reactionTarget = null
    parsed.isRemoveReaction = false
  }

  // ── Poll helpers ─────────────────────────────────────────
  if (parsed.isPoll) {
    let pollOpts = null
    try {
      pollOpts = typeof parsed.poll_options === "string"
        ? JSON.parse(parsed.poll_options)
        : (parsed.poll_options || null)
    } catch (_) {}
    parsed.pollName    = parsed.body || ""
    parsed.pollOptions = pollOpts    || []
    parsed.pollCount   = pollOpts?.length ?? 0
  }

  // ── Location helpers ─────────────────────────────────────
  if (parsed.isLocation) {
    parsed.lat     = parsed.location_lat     ?? null
    parsed.lng     = parsed.location_lng     ?? null
    parsed.locName = parsed.location_name    || null
    parsed.locAddr = parsed.location_address || null
    parsed.mapsUrl = (parsed.lat != null && parsed.lng != null)
      ? `https://maps.google.com/maps?q=${parsed.lat},${parsed.lng}`
      : null
  }

  // ── Contact helpers ──────────────────────────────────────
  if (parsed.isContact) {
    let contacts = null
    try {
      contacts = typeof parsed.contacts_json === "string"
        ? JSON.parse(parsed.contacts_json)
        : (parsed.contacts_json || null)
    } catch (_) {}
    parsed.sharedContacts = contacts || []
    parsed.contactCount   = contacts?.length ?? 0
  }

  // ── Group invite helpers ─────────────────────────────────
  if (parsed.isGroupInvite) {
    parsed.inviteCode   = parsed.group_invite_code   || null
    parsed.inviteGroup  = parsed.group_invite_jid    || null
    parsed.inviteName   = parsed.group_invite_name   || null
    parsed.inviteExpiry = parsed.group_invite_expiry || null
  }

  // ── Event helpers ─────────────────────────────────────────
  if (parsed.isEvent) {
    parsed.eventName    = parsed.event_name        || null
    parsed.eventDesc    = parsed.event_description || null
    parsed.eventStart   = parsed.event_start_time  ? new Date(parsed.event_start_time * 1000) : null
    parsed.eventEnd     = parsed.event_end_time    ? new Date(parsed.event_end_time   * 1000) : null
    parsed.eventLoc     = parsed.event_location    || null
    parsed.eventLink    = parsed.event_join_link   || null
    parsed.eventCanceled = parsed.event_is_canceled === 1
  }

  // ── Call log helpers ─────────────────────────────────────
  if (parsed.isCallLog) {
    parsed.callIsVideo  = parsed.call_is_video === 1
    parsed.callOutcome  = parsed.call_outcome  || null
    parsed.callDuration = parsed.call_duration || null
    parsed.callMissed   = parsed.call_outcome  === "missed"
    parsed.callAnswered = parsed.call_outcome  === "answered"
  }

  // ── Pin / Keep helpers ────────────────────────────────────
  if (parsed.isPin) {
    parsed.pinnedMsgId = parsed.pin_msg_id || null
    parsed.pinAction   = parsed.pin_type   || null   // "pin" | "unpin"
    parsed.isPinAdd    = parsed.pin_type   === "pin"
    parsed.isPinRemove = parsed.pin_type   === "unpin"
  }
  if (parsed.isKeep) {
    parsed.keptMsgId   = parsed.keep_msg_id || null
    parsed.keepAction  = parsed.keep_type   || null  // "keep" | "undo"
  }

  // ── Quoted message helpers ───────────────────────────────
  const hasQuoted = !!(parsed.quoted_id || parsed.quoted_body)
  parsed.hasQuoted    = hasQuoted
  parsed.isReply      = hasQuoted

  // quotedMsg — rich sub-object matching the same shape as enriched messages
  // so plugins can do: smsg.quotedMsg.isImage, smsg.quotedMsg.body, etc.
  if (hasQuoted) {
    const qt = parsed.quoted_type || "unknown"
    const qIsViewOnce  = parsed.quoted_is_view_once === 1
    const qIsStatus    = parsed.is_status_reply      === 1
    const qHasMedia    = parsed.quoted_has_media     === 1

    // Parse status music info
    let statusMusicInfo = null
    try {
      if (parsed.quoted_status_music) {
        statusMusicInfo = typeof parsed.quoted_status_music === "string"
          ? JSON.parse(parsed.quoted_status_music)
          : parsed.quoted_status_music
      }
    } catch (_) {}

    parsed.quotedMsg = {
      id:         parsed.quoted_id     || null,
      body:       parsed.quoted_body   || "",
      text:       parsed.quoted_body   || "",    // alias
      sender:     parsed.quoted_sender || null,
      senderName: parsed._resolved_quoted_sender_name || getJidDisplayPhone(parsed.quoted_sender || "") || null,
      type:       qt,
      mtype:      qt,

      // Type flags — same pattern as top-level
      isText:     qt === "conversation"    || qt === "extendedTextMessage",
      isImage:    qt === "imageMessage",
      isVideo:    qt === "videoMessage",
      isAudio:    qt === "audioMessage"    || qt === "pttMessage",
      isVoice:    qt === "pttMessage",
      isSticker:  qt === "stickerMessage",
      isDocument: qt === "documentMessage",
      isPoll:     qt === "pollCreationMessage",
      isGif:      parsed.is_gif           === 1 && qt === "videoMessage",
      hasMedia:   qHasMedia,
      mimetype:   parsed.quoted_mimetype  || null,
      thumbnail:  parsed.quoted_thumbnail_b64 || null,

      // ViewOnce & status
      isViewOnce:     qIsViewOnce,
      isStatusReply:  qIsStatus,
      statusMusicInfo,
    }

    // quoted sender phone
    if (parsed.quotedMsg.sender) {
      const qd = parseJid(parsed.quotedMsg.sender)
      parsed.quotedMsg.senderNumber = qd?.user || parsed.quotedMsg.sender.split("@")[0]
      parsed.quotedMsg.phone        = parsed.quotedMsg.senderNumber
    }

    // Backward-compat shorthands
    parsed.quotedBody   = parsed.quotedMsg.body
    parsed.quotedType   = qt
    parsed.quotedSender = parsed.quotedMsg.sender
    parsed.isQuotedImage    = qt === "imageMessage"
    parsed.isQuotedVideo    = qt === "videoMessage"
    parsed.isQuotedAudio    = qt === "audioMessage" || qt === "pttMessage"
    parsed.isQuotedSticker  = qt === "stickerMessage"
    parsed.isQuotedDocument = qt === "documentMessage"
    parsed.isQuotedViewOnce = qIsViewOnce
    parsed.isStatusReply    = qIsStatus
  } else {
    parsed.quotedMsg        = null
    parsed.quotedBody       = null
    parsed.quotedType       = null
    parsed.quotedSender     = null
    parsed.isQuotedImage    = false
    parsed.isQuotedVideo    = false
    parsed.isQuotedAudio    = false
    parsed.isQuotedSticker  = false
    parsed.isQuotedDocument = false
    parsed.isQuotedViewOnce = false
    parsed.isStatusReply    = false
  }

  // ── Forward info ──────────────────────────────────────────
  parsed.fwdScore = parsed.forwarding_score || 0

  // ── Reply / send shortcut helpers ────────────────────────
  // These are no-ops when sock is not provided (DB re-hydration path).
  // When sock IS provided, they are async functions callable directly.
  if (sock) {
    const _jid = chatJid || parsed.chat_jid

    // reply(text) — send text reply quoting this message
    parsed.reply = async (text, opts2 = {}) =>
      sock.sendMessage(_jid, { text: String(text), ...opts2 }, { quoted: _buildQuoteKey(parsed) })

    // replyQuoted(text) — explicit alias of reply()
    parsed.replyQuoted = parsed.reply

    // react(emoji) — react to this message with an emoji; "" to remove
    parsed.react = async (emoji) =>
      sock.sendMessage(_jid, { react: { text: emoji, key: _buildMsgKey(parsed) } })

    // delete() — revoke this message (fromMe only)
    parsed.delete = async () =>
      sock.sendMessage(_jid, { delete: _buildMsgKey(parsed) })

    // pin(seconds) — pin this message in chat (86400 = 24h, 604800 = 7d, 2592000 = 30d)
    parsed.pin = async (seconds = 86400) =>
      sock.sendMessage(_jid, { pin: _buildMsgKey(parsed), type: 1, time: seconds })

    // unpin() — remove pin
    parsed.unpin = async () =>
      sock.sendMessage(_jid, { pin: _buildMsgKey(parsed), type: 2 })

    // typing(ms) — show typing indicator for N ms, then clear
    parsed.typing = async (ms = 2000) => {
      await sock.sendPresenceUpdate("composing", _jid)
      if (ms > 0) setTimeout(() => sock.sendPresenceUpdate("paused", _jid).catch(() => {}), ms)
    }

    // send(payload, opts2) — low-level sock.sendMessage to this chat
    parsed.send = async (payload, opts2 = {}) =>
      sock.sendMessage(_jid, payload, opts2)

    // forward(jid) — forward this message to another JID
    parsed.forward = async (toJid) =>
      sock.sendMessage(toJid, { forward: {
        key:     _buildMsgKey(parsed),
        message: parsed._rawMsg?.message || parsed.mContent || (parsed.body ? { conversation: parsed.body } : {}),
      } })

  } else {
    // stub so callers don't crash when sock is absent
    const _warn = (name) => async () => {
      console.warn(`[enrichMessage] ${name}() called without sock — no-op`)
    }
    parsed.reply        = _warn("reply")
    parsed.replyQuoted  = _warn("replyQuoted")
    parsed.react        = _warn("react")
    parsed.delete       = _warn("delete")
    parsed.pin          = _warn("pin")
    parsed.unpin        = _warn("unpin")
    parsed.typing       = _warn("typing")
    parsed.send         = _warn("send")
    parsed.forward      = _warn("forward")
  }

  return parsed
}

// ── Internal key builders ────────────────────────────────────────────────────
// Build minimal key structs for Baileys sendMessage options.

function _buildMsgKey(parsed) {
  return {
    remoteJid:   parsed.chat_jid  || parsed.chatJid,
    fromMe:      parsed.from_me   === 1,
    id:          parsed.id,
    participant: parsed.is_group  === 1 ? (parsed.sender_jid || undefined) : undefined,
  }
}

function _buildQuoteKey(parsed) {
  // Baileys sendMessage quoted option expects: { key: WAMessageKey, message: proto.IMessage }
  // parsed._rawMsg is the full WAMessage from Baileys (attached in handleMessage).
  // parsed._rawMsg.message is the proto.Message object — exactly what Baileys needs.
  // Fallback: reconstruct a minimal conversation message from body.
  const protoMessage = parsed._rawMsg?.message
    || (parsed.mContent ? parsed.mContent : null)
    || (parsed.body ? { conversation: parsed.body } : null)
    || {}

  return {
    key:     _buildMsgKey(parsed),
    message: protoMessage,
    // Include pushName so quoted bubble shows sender name
    pushName: parsed.senderName || parsed.pushname || undefined,
  }
}

module.exports = { buildRendererPayload, dbRowToRendererMsg, enrichMessage }