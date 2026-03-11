// ╔═══════════════════════════════════════════════════════════╗
// ║             AuroraChat — Electron Preload Script          ║
// ║   Exposes a typed, minimal IPC surface to the renderer.   ║
// ║   All channels are whitelisted here — nothing else leaks. ║
// ╚═══════════════════════════════════════════════════════════╝
"use strict"

const { contextBridge, ipcRenderer } = require("electron")

// ── createListener ────────────────────────────────────────────────────────────
// Returns a subscribe function for a given IPC channel.
// The subscribe function returns a cleanup function so callers can remove
// the listener deterministically (important for React useEffect teardown).
//
// [FIX] The original helper was correct but exposed no way for callers to
// distinguish "no cleanup returned" from "cleanup was called". This version
// always returns a no-op if the subscription wasn't set up (e.g. duplicate call).

function createListener(channel) {
  return function subscribe(callback) {
    if (typeof callback !== "function") return () => {}
    const handler = (_event, data) => callback(data)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

// ── createOnceListener ────────────────────────────────────────────────────────
// Like createListener but auto-removes after the first emission.
// Useful for one-shot responses (e.g. QR code display).

function createOnceListener(channel) {
  return function subscribeOnce(callback) {
    if (typeof callback !== "function") return () => {}
    const handler = (_event, data) => callback(data)
    ipcRenderer.once(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

// ── safeInvoke ────────────────────────────────────────────────────────────────
// Wraps ipcRenderer.invoke so that network/serialization errors always resolve
// to { ok: false, error } rather than throwing into the renderer uncaught.
// Renderer code can safely do `const { ok, data } = await api.someCall(...)`.

function safeInvoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args).catch((err) => ({
    ok: false,
    error: err?.message || String(err),
  }))
}

// ════════════════════════════════════════════════════════════
// EXPOSED SURFACE
// ════════════════════════════════════════════════════════════

contextBridge.exposeInMainWorld("api", {

  // ═══════════════════════════════════════════════════════════
  // AUTH — Actions
  // ═══════════════════════════════════════════════════════════
  checkSession:    ()       => safeInvoke("auth:check-session"),
  requestPairing:  (phone)  => ipcRenderer.send("auth:request-pairing", phone),
  startQRMode:     ()       => ipcRenderer.send("auth:start-qr"),
  logout:          ()       => ipcRenderer.send("auth:logout"),
  forceReconnect:  ()       => ipcRenderer.send("connection:force-reconnect"),
  getConnectionStatus: () => ipcRenderer.invoke("connection:get-status"),

  // ═══════════════════════════════════════════════════════════
  // AUTH — Events
  // ═══════════════════════════════════════════════════════════
  onPairingCode:   createListener("auth:pairing-code"),
  onPairingError:  createListener("auth:pairing-error"),
  onQR:            createListener("auth:qr"),
  onConnected:     createListener("connection:open"),
  onNeedPhone:     createListener("auth:need-phone-number"),
  onLoggedOut:     createListener("auth:logged-out"),

  // ═══════════════════════════════════════════════════════════
  // CONNECTION — Events
  // ═══════════════════════════════════════════════════════════
  onConnectionClose:   createListener("connection:close"),
  onReconnecting:      createListener("connection:reconnecting"),
  onConnectionFailed:  createListener("connection:failed"),
  onConnectionError:   createListener("connection:error"),

  // ═══════════════════════════════════════════════════════════
  // SYNC STATUS (History Sync)
  // ═══════════════════════════════════════════════════════════
  onSyncStatus:    createListener("sync:status"),
  onSyncProgress:  createListener("sync:progress"),
  dbSyncStatus:    ()      => safeInvoke("db:sync:status"),

  // ═══════════════════════════════════════════════════════════
  // DATABASE — Chats
  // ═══════════════════════════════════════════════════════════
  dbChats:        (opts = {})            => safeInvoke("db:chats:list",    opts),
  dbSearchChats:  (query)                => safeInvoke("db:chats:search",  { query }),
  dbMarkRead:     ({ jid })              => safeInvoke("db:chats:read",    { jid }),
  dbPinChat:      ({ jid, pinned })      => safeInvoke("db:chats:pin",     { jid, pinned }),
  dbArchiveChat:  ({ jid, archived })    => safeInvoke("db:chats:archive", { jid, archived }),

  // Chat events
  onChatsUpdated:  createListener("db:chats:updated"),
  onChatsSet:      createListener("chats:set"),
  onChatsUpsert:   createListener("chats:upsert"),

  // ═══════════════════════════════════════════════════════════
  // DATABASE — Contacts
  // ═══════════════════════════════════════════════════════════
  dbContacts:        (opts = {}) => safeInvoke("db:contacts:list",   opts),
  dbSearchContacts:  (query)     => safeInvoke("db:contacts:search", { query }),
  onContactsUpdated: createListener("db:contacts:updated"),

  // ═══════════════════════════════════════════════════════════
  // DATABASE — Groups / Communities
  // ═══════════════════════════════════════════════════════════
  dbGroups:      (opts = {}) => safeInvoke("db:groups:list",      opts),
  dbCommunities: (opts = {}) => safeInvoke("db:communities:list", opts),

  // ═══════════════════════════════════════════════════════════
  // DATABASE — Messages
  // ═══════════════════════════════════════════════════════════
  dbMessages:        ({ jid, limit = 20, offset = 0 }) => safeInvoke("db:messages:list",   { jid, limit, offset }),
  dbSearchMsgs:      ({ jid, query })                  => safeInvoke("db:messages:search", { jid, query }),
  dbMessageRaw:      ({ id })                          => safeInvoke("db:messages:raw",     { id }),
  dbReactions:       ({ jid })                         => safeInvoke("db:reactions:list",   { jid }),
  dbStats:           ()                                => safeInvoke("db:stats"),
  dbBackfillPreviews:()                                => safeInvoke("db:backfill:previews"),

  // Message events
  onNewMessage:        createListener("db:messages:new"),
  onMessagesNew:       createListener("messages:new"),
  onMessagesUpdate:    createListener("messages:update"),
  onMessagesReaction:  createListener("messages:reaction"),
  onMessagesDelete:    createListener("messages:delete"),
  onMessagesReceipt:   createListener("messages:receipt"),
  onPollUpdate:        createListener("messages:poll_update"),

  // ═══════════════════════════════════════════════════════════
  // MEDIA
  // ═══════════════════════════════════════════════════════════
  mediaPrefetch:        ({ jid, limit = 20 }) => safeInvoke("media:prefetch",          { jid, limit }),
  mediaTriggerDownload: ({ msgId })           => safeInvoke("media:trigger-download",  { msgId }),

  // Media events
  onMediaUpdated:        createListener("media:updated"),
  onMediaDownloadStart:  createListener("media:download:start"),
  onMediaDownloadError:  createListener("media:download:error"),

  // ═══════════════════════════════════════════════════════════
  // MESSAGING
  // ═══════════════════════════════════════════════════════════
  sendMessage: ({ jid, body, type = "text", mediaPath = null, quotedMsgId = null }) =>
    safeInvoke("msg:send", { jid, body, type, mediaPath, quotedMsgId }),

  // ════════════════════════════════════════════════════════════
  // preload.js — add inside contextBridge.exposeInMainWorld "api" object
  // alongside sendMessage / sendMedia
  // ════════════════════════════════════════════════════════════

  // ── Stickers ──────────────────────────────────────────────
  listStickers:   ()                                      => safeInvoke("sticker:list"),
  getStickerData: ({ absPath })                           => safeInvoke("sticker:data", { absPath }),
  sendSticker:    ({ jid, absPath, quotedMsgId = null })  => safeInvoke("sticker:send", { jid, absPath, quotedMsgId }),


  sendMedia: ({ jid, items, quotedMsgId = null }) =>
    safeInvoke("msg:send-media", { jid, items, quotedMsgId }),

  markMessagesRead: ({ jid, msgIds }) =>
    safeInvoke("msg:mark-read", { jid, msgIds }),

  // ── Message Actions ────────────────────────────────────────
  starMessage:    ({ id, chatJid, star })                  => safeInvoke("msg:star",     { id, chatJid, star }),
  deleteMessage:  ({ id, chatJid, forEveryone = false })   => safeInvoke("msg:delete",   { id, chatJid, forEveryone }),
  forwardMessage: ({ id, chatJid, targetJids })            => safeInvoke("msg:forward",  { id, chatJid, targetJids }),
  reactMessage:   ({ id, chatJid, emoji })                 => safeInvoke("msg:react",    { id, chatJid, emoji }),
  pinMessage:     ({ id, chatJid, pin, duration })         => safeInvoke("msg:pin",      { id, chatJid, pin, duration }),
  saveMediaFile:  ({ srcPath, suggestedName })             => safeInvoke("msg:save-file",{ srcPath, suggestedName }),

  // ═══════════════════════════════════════════════════════════
  // PRESENCE
  // ═══════════════════════════════════════════════════════════
  onPresenceUpdate: createListener("presence:update"),

  // ═══════════════════════════════════════════════════════════
  // PROFILE / CONTACTS
  // ═══════════════════════════════════════════════════════════
  getProfilePic:          ({ jid })   => safeInvoke("profile:get-pic",          { jid }),
  getOwnPic:              ()          => safeInvoke("profile:get-own-pic"),
  updateProfileName:      ({ name })  => safeInvoke("profile:update-name",      { name }),
  updateProfilePicture:   ({ buffer })=> safeInvoke("profile:update-picture",   { buffer }),
  removeProfilePicture:   ()          => safeInvoke("profile:remove-picture"),
  contactFetchStatus:     ({ jid })   => safeInvoke("contact:fetch-status",     { jid }),
  contactFetchStatusBulk: ({ jids })  => safeInvoke("contact:fetch-status-bulk",{ jids }),

  // ═══════════════════════════════════════════════════════════
  // FILESYSTEM
  // ═══════════════════════════════════════════════════════════
  fsExists: ({ rawPath }) => safeInvoke("fs:exists", { rawPath }),

  // ═══════════════════════════════════════════════════════════
  // GROUP EVENTS
  // ═══════════════════════════════════════════════════════════
  onGroupsUpdate:             createListener("groups:update"),
  onGroupParticipantsUpdate:  createListener("groups:participants"),
  onProfilePicUpdated:        createListener("profile:pic-updated"),

  // ═══════════════════════════════════════════════════════════
  // GROUP METADATA
  // ═══════════════════════════════════════════════════════════
  groupGetMetadata:   ({ jid }) => safeInvoke("group:get-metadata",    { jid }),
  groupGetInviteLink: ({ jid }) => safeInvoke("group:get-invite-link", { jid }),
  groupUpdatePicture: ({ jid, buffer }) => safeInvoke("group:update-picture", { jid, buffer }),
  groupSendStatusV2:  ({ jid, content }) => safeInvoke("group:send-status-v2", { jid, content }),

  // ═══════════════════════════════════════════════════════════
  // CALL EVENTS
  // ═══════════════════════════════════════════════════════════
  onCallIncoming: createListener("call:incoming"),

  // ═══════════════════════════════════════════════════════════
  // LABELS
  // ═══════════════════════════════════════════════════════════
  onLabelsAssociation: createListener("labels:association"),
  onLabelsEdit:        createListener("labels:edit"),

  // ═══════════════════════════════════════════════════════════
  // STATUS (WhatsApp Story)
  // ═══════════════════════════════════════════════════════════
  statusGetContactCount: ()        => safeInvoke("status:get-contact-count"),
  statusSend:            (payload) => safeInvoke("status:send",   payload),
  statusGetAll:          ()        => safeInvoke("status:get-all"),
  statusGetBySender:     ({ jid }) => safeInvoke("status:get-by-sender",   { jid }),
  statusMarkSeen:        (payload) => safeInvoke("status:mark-seen",       payload),
  statusFetchAll:        (opts)    => safeInvoke("status:fetch-all",       opts),
  statusFetchContact:    ({ jid }) => safeInvoke("status:fetch-contact",   { jid }),
  statusSetAutoView:     ({ enabled }) => safeInvoke("status:set-auto-view", { enabled }),
  statusGetAutoView:     ()        => safeInvoke("status:get-auto-view"),
  // Reply to a status with proper quoted context (shows quoted bubble on recipient side)
  statusReply:           (payload) => safeInvoke("status:reply",      payload),
  // Forward a status story (image/video/audio/text) to one chat JID
  statusForward:         (payload) => safeInvoke("status:forward",    payload),
  // Save status media with correct binary write + type-aware file filters
  statusSaveMedia:       (payload) => safeInvoke("status:save-media", payload),

  // Live status events
  onStatusNew: createListener("status:new"),

  // ═══════════════════════════════════════════════════════════
  // SETTINGS
  // ═══════════════════════════════════════════════════════════
  settingsLoad:            ()           => safeInvoke("settings:load"),
  settingsSave:            (settings)   => safeInvoke("settings:save",              settings),
  settingsSetAutoDownload: ({ enabled }) => safeInvoke("settings:set-auto-download", { enabled }),
  settingsSetRamLimit:     ({ mb })      => safeInvoke("settings:set-ram-limit",     { mb }),

  // ═══════════════════════════════════════════════════════════
  // LID RESOLUTION
  // ═══════════════════════════════════════════════════════════
  lidResolveNow: () => safeInvoke("lid:resolve-now"),
  lidGetMap:      () => safeInvoke("lid:get-map"),        // [FIX-LID-QUOTED] fetch lid→phone map for quoted sender resolution

  // ═══════════════════════════════════════════════════════════
  // MOD / PLUGIN MANAGER
  // ═══════════════════════════════════════════════════════════
  modsList:        ()                  => safeInvoke("mods:list"),
  modsToggle:      ({ id, enabled })   => safeInvoke("mods:toggle",       { id, enabled }),
  modsReload:      ()                  => safeInvoke("mods:reload"),
  modsDetail:      ({ id })            => safeInvoke("mods:detail",        { id }),
  modsCreate:      (opts)              => safeInvoke("mods:create",        opts),
  modsOpenFolder:  ({ id } = {})       => safeInvoke("mods:open-folder",   { id }),
  modsGetConfig:   ({ id })            => safeInvoke("mods:get-config",    { id }),
  modsSaveConfig:  ({ id, values })    => safeInvoke("mods:save-config",   { id, values }),
  modsPickImage:   ()                  => safeInvoke("mods:pick-image"),
  modsImport:      ()                  => safeInvoke("mods:import"),
  modsDelete:      ({ id })            => safeInvoke("mods:delete",        { id }),
  modsDeleteBulk:  ({ ids })           => safeInvoke("mods:delete-bulk",   { ids }),
  modsUpdateHooks: ({ id, hooks })     => safeInvoke("mods:update-hooks",  { id, hooks }),
  modsSaveSource:  ({ id, source })    => safeInvoke("mods:save-source",   { id, source }),
  modsSaveManifest:({ id, content })   => safeInvoke("mods:save-manifest", { id, content }),
  onModsUpdated:   createListener("mods:updated"),

  // ═══════════════════════════════════════════════════════════
  // SHELL / UI
  // ═══════════════════════════════════════════════════════════
  openExternal:       (url) => safeInvoke("shell:open-external", url),
  openEmojiPicker:    ()    => safeInvoke("ui:emoji-picker"),
  triggerEmojiPicker: ()    => safeInvoke("ui:emoji-picker"),  // alias

  // ═══════════════════════════════════════════════════════════
  // DEV EVAL — Baileys Sandbox
  // ═══════════════════════════════════════════════════════════
  devEval:  (opts)               => safeInvoke("dev:eval",       { mode: "expr", ...opts }),
  saveFile: ({ content, filename }) => safeInvoke("dev:save-file", { content, filename }),

  // ═══════════════════════════════════════════════════════════
  // HOT RELOAD — Dev-only
  // ═══════════════════════════════════════════════════════════
  // Manual trigger:  api.hotReload({ target: 'client' | 'dbHandler' | 'all' })
  // Listen for events from auto-reload (file save) or manual trigger.
  // Payload: { ok: boolean, file: string, ts?: number, error?: string }
  hotReload:   ({ target = 'client' } = {}) => safeInvoke("dev:hot-reload", { target }),
  onHotReload: createListener("dev:hot-reload"),
})

// ── App Version & Updates (appended) ──────────────────────────────────────
// These expose IPC bridges for version detection and update checking.
// Patched in separately to avoid rewriting the full contextBridge block.
;(() => {
  const { ipcRenderer } = require("electron")
  const safe = (ch, args) => ipcRenderer.invoke(ch, args).catch(e => ({ ok: false, error: e.message }))
  const existing = window.api || {}
  // Merge into window.api via Object.assign trick (preload runs before renderer)
  // Since contextBridge freezes the object, we use a secondary exposure instead.
  try {
    window.__wplusIpc = {
      getAppVersion: () => safe("app:get-version"),
      checkUpdate:   () => safe("app:check-update"),
    }
  } catch (_) {}
})()