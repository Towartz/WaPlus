// DevEvalModal.jsx — WaPlus DevEval Sandbox v5
// Improvements: redesigned template panel (search + icons), new client/parser/media/jid templates,
//   category badges, template count, quick-filter, improved output toolbar layout
import { useState, useRef, useEffect, useCallback, memo, useMemo } from "react"

// ─── Syntax colorizer ─────────────────────────────────────────────────────────
function colorize(text) {
  if (!text) return ""
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g, '<span class="devc-string">$1</span>')
    .replace(/\b(-?\d+\.?\d*(?:e[+-]?\d+)?)\b/g, '<span class="devc-number">$1</span>')
    .replace(/\b(true|false|null|undefined|NaN|Infinity)\b/g, '<span class="devc-keyword">$1</span>')
    .replace(/([a-zA-Z_$][\w$]*)(\s*:)/g, '<span class="devc-key">$1</span>$2')
    .replace(/(\[Function(?:: [^\]]+)?\])/g, '<span class="devc-fn">$1</span>')
    .replace(/(\[(?:Array|Object|Map|Set|Buffer|Error)[^\]]*\])/g, '<span class="devc-type">$1</span>')
}

function highlightSearch(html, query, currentIdx) {
  if (!query) return html
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  let idx = 0
  return html.replace(
    new RegExp(`(?![^<]*>)(${escaped})`, "gi"),
    (match) => {
      const cls = idx === currentIdx ? "devc-search-current" : "devc-search-match"
      idx++
      return `<mark class="${cls}">${match}</mark>`
    }
  )
}

function countMatches(text, query) {
  if (!query || !text) return 0
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return (text.match(new RegExp(escaped, "gi")) || []).length
}

const E = "expr"
const B = "block"

// ─── Category metadata ─────────────────────────────────────────────────────────
const CAT_META = {
  msg:     { icon: "💬", label: "msg",     color: "#4ade80" },
  sock:    { icon: "🔌", label: "sock",    color: "#60a5fa" },
  db:      { icon: "🗄️", label: "db",      color: "#a78bfa" },
  baileys: { icon: "⚡", label: "baileys", color: "#fbbf24" },
  proto:   { icon: "📦", label: "proto",   color: "#f472b6" },
  client:  { icon: "🖥️", label: "client",  color: "#34d399" },
  parser:  { icon: "🔍", label: "parser",  color: "#fb923c" },
  media:   { icon: "🎬", label: "media",   color: "#e879f9" },
  jid:     { icon: "🪪", label: "jid",     color: "#38bdf8" },
  perf:    { icon: "⏱️", label: "perf",    color: "#facc15" },
  net:     { icon: "🌐", label: "net",     color: "#86efac" },
  fs:      { icon: "📁", label: "fs",      color: "#fda4af" },
  debug:   { icon: "🐛", label: "debug",   color: "#c084fc" },
  inspect: { icon: "🔬", label: "inspect", color: "#67e8f9" },
}

const CATS = Object.keys(CAT_META)

// ─── Templates ────────────────────────────────────────────────────────────────
const TEMPLATES = [
  // ════ msg ════
  { cat: "msg", label: "m (full smsg)",           mode: E, code: `m` },
  { cat: "msg", label: "m keys",                  mode: E, code: `Object.keys(m)` },
  { cat: "msg", label: "m — identity",            mode: E, code: `({ id: m.id, chat: m.chat, sender: m.sender, fromMe: m.fromMe, isGroup: m.isGroup, isBaileys: m.isBaileys })` },
  { cat: "msg", label: "m — body & type",         mode: E, code: `({ mtype: m.mtype, body: m.body, text: m.text, caption: m.caption })` },
  { cat: "msg", label: "m — sender info",         mode: E, code: `({ sender: m.sender, participant: m.participant, pushName: m.pushName, senderId: m.senderId })` },
  { cat: "msg", label: "m — chat flags",          mode: E, code: `({ isGroup: m.isGroup, isUser: m.isUser, isBroadcast: m.isBroadcast, isStatusBroadcast: m.isStatusBroadcast, isNewsletter: m.isNewsletter })` },
  { cat: "msg", label: "m — cmd/args",            mode: E, code: `({ isCmd: m.isCmd, cmd: m.cmd, args: m.args })` },
  { cat: "msg", label: "m.message (raw proto)",   mode: E, code: `m.message` },
  { cat: "msg", label: "m.msg (inner content)",   mode: E, code: `m.msg` },
  { cat: "msg", label: "m.msg keys",              mode: E, code: `Object.keys(m.msg || {})` },
  { cat: "msg", label: "m.quoted",                mode: E, code: `m.quoted` },
  { cat: "msg", label: "m.quoted keys",           mode: E, code: `Object.keys(m.quoted || {})` },
  { cat: "msg", label: "m.quoted — text & type",  mode: E, code: `({ mtype: m.quoted?.mtype, text: m.quoted?.text, sender: m.quoted?.sender, fromMe: m.quoted?.fromMe, id: m.quoted?.id })` },
  { cat: "msg", label: "m.mentionedJid",          mode: E, code: `m.mentionedJid` },
  { cat: "msg", label: "m.mtype",                 mode: E, code: `m.mtype` },
  { cat: "msg", label: "m — timestamps",          mode: E, code: `({ messageTimestamp: m.messageTimestamp, ts: new Date(m.messageTimestamp * 1000).toISOString() })` },
  { cat: "msg", label: "m — media info",          mode: E, code: `({ hasMedia: m.hasMedia, mimetype: m.mimetype, fileName: m.fileName, fileLength: m.fileLength, savedPath: m.mediaSavedPath, url: m.mediaUrl, mediaKey: m.mediaKey })` },
  { cat: "msg", label: "m — media dimensions",   mode: E, code: `({ width: m.width, height: m.height, duration: m.duration, isPtt: m.isPtt, isGif: m.isGif, isAnimated: m.isAnimated, isViewOnce: m.isViewOnce })` },
  { cat: "msg", label: "m.key",                   mode: E, code: `m.key` },
  { cat: "msg", label: "m.message — context",     mode: E, code: `m.msg?.contextInfo` },
  { cat: "msg", label: "m — all string fields",   mode: E, code: `Object.fromEntries(Object.entries(m).filter(([,v]) => typeof v === 'string'))` },
  { cat: "msg", label: "m — all bool fields",     mode: E, code: `Object.fromEntries(Object.entries(m).filter(([,v]) => typeof v === 'boolean'))` },
  { cat: "msg", label: "m — all functions",       mode: E, code: `Object.keys(m).filter(k => typeof m[k] === 'function')` },
  { cat: "msg", label: "getQuotedObj",            mode: B, code: `const q = await m.getQuotedObj?.()\nreturn json(q)` },
  { cat: "msg", label: "download media → size",  mode: B, code: `const buf = await m.download?.()\nreturn { size: buf?.length, type: typeof buf, isBuffer: Buffer.isBuffer(buf) }` },
  { cat: "msg", label: "reply test",              mode: B, code: `await m.reply('DevEval reply test 🚀')\nreturn 'sent'` },
  { cat: "msg", label: "copy",                    mode: E, code: `m.copy?.()` },

  // ════ sock ════
  { cat: "sock", label: "sock.user",                   mode: E, code: `sock.user` },
  { cat: "sock", label: "sock.user.id",                mode: E, code: `sock.user?.id` },
  { cat: "sock", label: "Reflect.ownKeys(sock)",       mode: E, code: `Reflect.ownKeys(sock)` },
  { cat: "sock", label: "sock — all functions",        mode: E, code: `Reflect.ownKeys(sock).filter(k => typeof sock[k] === 'function')` },
  { cat: "sock", label: "sock — all objects",          mode: E, code: `Reflect.ownKeys(sock).filter(k => sock[k] !== null && typeof sock[k] === 'object' && !Array.isArray(sock[k]))` },
  { cat: "sock", label: "sock — key:type map",         mode: E, code: `Reflect.ownKeys(sock).map(k => ({ key: k, type: typeof sock[k], value: typeof sock[k] !== 'object' && typeof sock[k] !== 'function' ? sock[k] : '[complex]' }))` },
  { cat: "sock", label: "sock.ev eventNames",          mode: E, code: `Reflect.ownKeys(sock?.ev || {})` },
  { cat: "sock", label: "sock.authState",              mode: E, code: `fmt(sock?.authState)` },
  { cat: "sock", label: "sock.ws readyState",          mode: E, code: `({ readyState: sock?.ws?.readyState, url: sock?.ws?.url })` },
  { cat: "sock", label: "sock — connection state",     mode: E, code: `({ connectionState: sock?.connectionState, isOnline: sock?.ws?.readyState === 1 })` },
  { cat: "sock", label: "group metadata",              mode: B, code: `const meta = await sock.groupMetadata(m.chat)\nreturn json(meta)` },
  { cat: "sock", label: "group participants",          mode: B, code: `const meta = await sock.groupMetadata(m.chat)\nreturn meta.participants.map(p => ({ jid: p.id, admin: p.admin, superAdmin: p.isSuperAdmin }))` },
  { cat: "sock", label: "group admins only",           mode: B, code: `const meta = await sock.groupMetadata(m.chat)\nreturn meta.participants.filter(p => p.admin).map(p => p.id)` },
  { cat: "sock", label: "send text to chat",           mode: B, code: `await sock.sendMessage(m.chat, { text: 'DevEval test 🚀' })\nreturn 'sent'` },
  { cat: "sock", label: "send reply",                  mode: B, code: `await sock.sendMessage(m.chat, { text: 'reply 🔁' }, { quoted: m })\nreturn 'sent'` },
  { cat: "sock", label: "send reaction",               mode: B, code: `await sock.sendMessage(m.chat, { react: { text: '🔥', key: m.key } })\nreturn 'reacted'` },
  { cat: "sock", label: "send delete",                 mode: B, code: `// Deletes the currently selected message for everyone\nawait sock.sendMessage(m.chat, { delete: m.key })\nreturn 'deleted'` },
  { cat: "sock", label: "fetch profile picture",       mode: B, code: `const url = await sock.profilePictureUrl(m.sender, 'image').catch(() => null)\nreturn { url }` },
  { cat: "sock", label: "fetch contact status",        mode: B, code: `const s = await sock.fetchStatus(m.sender).catch(() => null)\nreturn json(s)` },
  { cat: "sock", label: "presence subscribe",          mode: B, code: `await sock.presenceSubscribe(m.chat)\nreturn 'subscribed'` },
  { cat: "sock", label: "sendPresenceUpdate (typing)", mode: B, code: `await sock.sendPresenceUpdate('composing', m.chat)\nawait new Promise(r => setTimeout(r, 2000))\nawait sock.sendPresenceUpdate('paused', m.chat)\nreturn 'done'` },
  { cat: "sock", label: "readMessages",                mode: B, code: `await sock.readMessages([m.key])\nreturn 'read'` },
  { cat: "sock", label: "getBlocklist",                mode: B, code: `const list = await sock.fetchBlocklist()\nreturn json(list)` },
  { cat: "sock", label: "sock.store keys",             mode: E, code: `Object.keys(sock?.store || {})` },
  { cat: "sock", label: "generateMessageTag",          mode: E, code: `sock.generateMessageTag?.()` },

  // ════ db ════
  { cat: "db", label: "db — all functions",         mode: E, code: `Object.keys(db).filter(k => typeof db[k] === 'function')` },
  { cat: "db", label: "db.getStats()",              mode: E, code: `db.getStats?.()` },
  { cat: "db", label: "db chats (20)",              mode: E, code: `db.getChats(20, 0)` },
  { cat: "db", label: "db chats count",             mode: E, code: `db.getChatCount?.()` },
  { cat: "db", label: "db groups only",             mode: E, code: `db.getGroups(20, 0)` },
  { cat: "db", label: "db contacts (20)",           mode: E, code: `db.getContacts(20, 0)` },
  { cat: "db", label: "db contact by jid",          mode: E, code: `db.getContact?.(m.sender)` },
  { cat: "db", label: "db messages (this chat)",    mode: E, code: `db.getMessages(m.chat, 10, 0)` },
  { cat: "db", label: "db message by id",           mode: E, code: `db.getMessageById?.(m.id)` },
  { cat: "db", label: "db message raw_json",        mode: B, code: `const row = db.getMessageById?.(m.id)\nif (!row) return 'not found'\ntry { return JSON.parse(row.raw_json || row.message_json || '{}') } catch { return row }` },
  { cat: "db", label: "db message — all columns",   mode: B, code: `const row = db.getMessageById?.(m.id)\nreturn json(row)` },
  { cat: "db", label: "db search messages",         mode: E, code: `db.searchMessagesGlobal?.('halo') || []` },
  { cat: "db", label: "db search in chat",          mode: E, code: `db.searchMessages?.(m.chat, 'test') || []` },
  { cat: "db", label: "db pending downloads",       mode: E, code: `db.getPendingMediaDownloads?.()` },
  { cat: "db", label: "db media pending (chat)",    mode: E, code: `db.getMediaPendingForChat?.(m.chat, 20) || []` },
  { cat: "db", label: "db reactions for chat",      mode: E, code: `db.getReactionsForChat?.(m.chat)` },
  { cat: "db", label: "db last 5 msgs — all chats", mode: B, code: `const chats = db.getChats(5, 0)\nreturn chats.map(c => ({ jid: c.jid, last: db.getMessages(c.jid, 1, 0)[0]?.body }))` },
  { cat: "db", label: "db table sizes",             mode: B, code: `const tables = ['messages','chats','contacts','reactions']\nreturn tables.map(t => ({ table: t, count: db[t === 'messages' ? 'getMessageCount' : 'getChatCount']?.() || '?' }))` },
  { cat: "db", label: "db unread chats",            mode: B, code: `const all = db.getChats(100, 0)\nreturn all.filter(c => c.unread_count > 0).map(c => ({ jid: c.jid, name: c.name, unread: c.unread_count }))` },
  { cat: "db", label: "db pinned chats",            mode: B, code: `const all = db.getChats(100, 0)\nreturn all.filter(c => c.pinned).map(c => ({ jid: c.jid, name: c.name }))` },
  { cat: "db", label: "db archived chats",          mode: B, code: `const all = db.getChats(100, 0)\nreturn all.filter(c => c.archived).map(c => ({ jid: c.jid, name: c.name }))` },
  { cat: "db", label: "db message type breakdown",  mode: B, code: `const msgs = db.getMessages(m.chat, 200, 0)\nconst counts = {}\nfor (const r of msgs) counts[r.msg_type] = (counts[r.msg_type] || 0) + 1\nreturn counts` },
  { cat: "db", label: "db media stats (chat)",      mode: B, code: `const msgs = db.getMessages(m.chat, 200, 0)\nconst media = msgs.filter(r => r.has_media)\nreturn { total: msgs.length, mediaCount: media.length, savedLocally: media.filter(r => r.media_saved_path).length }` },

  // ════ baileys ════
  { cat: "baileys", label: "baileys export keys",          mode: E, code: `Object.keys(baileys)` },
  { cat: "baileys", label: "Reflect.ownKeys(baileys)",     mode: E, code: `Reflect.ownKeys(baileys)` },
  { cat: "baileys", label: "baileys — functions only",     mode: E, code: `Object.keys(baileys).filter(k => typeof baileys[k] === 'function')` },
  { cat: "baileys", label: "getContentType",               mode: E, code: `baileys.getContentType?.(m.message)` },
  { cat: "baileys", label: "jidNormalizedUser",            mode: E, code: `baileys.jidNormalizedUser?.(m.sender)` },
  { cat: "baileys", label: "jidDecode (sender)",           mode: E, code: `baileys.jidDecode?.(m.sender)` },
  { cat: "baileys", label: "jidDecode (chat)",             mode: E, code: `baileys.jidDecode?.(m.chat)` },
  { cat: "baileys", label: "isJidGroup",                   mode: E, code: `baileys.isJidGroup?.(m.chat)` },
  { cat: "baileys", label: "isJidUser",                    mode: E, code: `baileys.isJidUser?.(m.sender)` },
  { cat: "baileys", label: "areJidsSameUser",              mode: E, code: `baileys.areJidsSameUser?.(m.sender, sock.user?.id)` },
  { cat: "baileys", label: "proto — top-level keys",       mode: E, code: `Object.keys(baileys.proto || {})` },
  { cat: "baileys", label: "proto.WebMessageInfo keys",    mode: E, code: `Object.keys(baileys.proto?.WebMessageInfo || {})` },
  { cat: "baileys", label: "proto — encode message",       mode: E, code: `baileys.proto?.WebMessageInfo?.encode?.(m.message)?.length + ' bytes'` },
  { cat: "baileys", label: "downloadMediaMessage",         mode: B, code: `const buf = await baileys.downloadMediaMessage?.(\n  { message: m.message, key: m.key },\n  'buffer', {}\n)\nreturn { size: buf?.length, isBuffer: Buffer.isBuffer(buf) }` },
  { cat: "baileys", label: "generateWAMessage (text)",     mode: B, code: `const out = await baileys.generateWAMessage?.(m.chat, { text: 'preview' }, { userJid: sock.user?.id })\nreturn json(out)` },
  { cat: "baileys", label: "WAMessageStatus values",       mode: E, code: `baileys.proto?.WebMessageInfo?.Status` },
  { cat: "baileys", label: "MediaType enum",               mode: E, code: `Object.keys(baileys.MediaType || {})` },
  { cat: "baileys", label: "getDevice (from JID)",         mode: E, code: `baileys.getDevice?.(m.sender)` },
  { cat: "baileys", label: "isJidStatusBroadcast",         mode: E, code: `baileys.isJidStatusBroadcast?.(m.chat)` },
  { cat: "baileys", label: "isBroadcastJid",               mode: E, code: `baileys.isBroadcastJid?.(m.chat)` },
  { cat: "baileys", label: "extractMessageContent",        mode: E, code: `baileys.extractMessageContent?.(m.message, 'imageMessage')` },
  { cat: "baileys", label: "normalizeMessageContent",      mode: E, code: `baileys.normalizeMessageContent?.(m.message)` },
  { cat: "baileys", label: "baileys version check",        mode: B, code: `const { fetchLatestBaileysVersion } = baileys\nconst { version, isLatest } = await fetchLatestBaileysVersion?.()\nreturn { version, isLatest }` },
  { cat: "baileys", label: "getAggregateVotesInPoll",      mode: B, code: `const row = db.getMessageById?.(m.id)\nconst pollMsg = JSON.parse(row?.raw_json || '{}')\nconst votes = baileys.getAggregateVotesInPollMessage?.({ message: pollMsg }, {})\nreturn json(votes)` },

  // ════ proto ════
  { cat: "proto", label: "m.message — JSON",              mode: E, code: `json(m.message)` },
  { cat: "proto", label: "m.message — fmt (full depth)",  mode: E, code: `fmt(m.message)` },
  { cat: "proto", label: "raw_json from DB",              mode: B, code: `const row = db.getMessageById?.(m.id)\nif (!row) return 'not found'\nconst raw = row.raw_json || row.message_json || null\nif (!raw) return 'no raw_json stored'\ntry { return JSON.parse(raw) } catch { return raw }` },
  { cat: "proto", label: "contextInfo (full)",            mode: E, code: `m.msg?.contextInfo` },
  { cat: "proto", label: "contextInfo — forward score",   mode: E, code: `({ isForwarded: m.msg?.contextInfo?.isForwarded, forwardingScore: m.msg?.contextInfo?.forwardingScore })` },
  { cat: "proto", label: "contextInfo — expiration",      mode: E, code: `({ expiration: m.msg?.contextInfo?.expiration, ephemeralSettingTimestamp: m.msg?.contextInfo?.ephemeralSettingTimestamp })` },
  { cat: "proto", label: "message — all keys recursive",  mode: B, code: `function deepKeys(obj, prefix='') {\n  if (!obj || typeof obj !== 'object') return []\n  return Object.keys(obj).flatMap(k => [prefix+k, ...deepKeys(obj[k], prefix+k+'.')])\n}\nreturn deepKeys(m.message)` },
  { cat: "proto", label: "decode proto bytes",            mode: B, code: `const { proto } = baileys\nconst encoded = proto.WebMessageInfo?.encode?.(m.message)\nconst decoded = proto.WebMessageInfo?.decode?.(encoded)\nreturn json(decoded)` },
  { cat: "proto", label: "m.message — size (bytes)",      mode: B, code: `const enc = baileys.proto?.WebMessageInfo?.encode?.(m.message)\nreturn { bytes: enc?.length, kb: (enc?.length / 1024).toFixed(2) + ' KB' }` },
  { cat: "proto", label: "extended text details",         mode: E, code: `m.msg?.extendedTextMessage || m.message?.extendedTextMessage` },
  { cat: "proto", label: "URL preview",                   mode: E, code: `({ matchedText: m.msg?.matchedText, canonicalUrl: m.msg?.canonicalUrl, title: m.msg?.title, description: m.msg?.description })` },
  { cat: "proto", label: "poll options",                  mode: E, code: `m.msg?.options?.map?.(o => o.optionName)` },
  { cat: "proto", label: "buttons content",               mode: E, code: `m.msg?.buttons?.map?.(b => ({ id: b.buttonId, text: b.buttonText?.displayText }))` },
  { cat: "proto", label: "list sections",                 mode: E, code: `m.msg?.sections?.map?.(s => ({ title: s.title, rows: s.rows?.length }))` },
  { cat: "proto", label: "interactive header",            mode: E, code: `m.msg?.header` },
  { cat: "proto", label: "nativeFlowMessage params",      mode: B, code: `try {\n  const raw = m.msg?.nativeFlowResponseMessage?.paramsJson\n  return raw ? JSON.parse(raw) : 'no params'\n} catch(e) { return { error: e.message } }` },
  { cat: "proto", label: "viewOnce inner message",        mode: B, code: `const vType = Object.keys(m.message?.viewOnceMessage?.message || m.message?.viewOnceMessageV2?.message || {})[0]\nreturn { vType, inner: (m.message?.viewOnceMessage?.message || m.message?.viewOnceMessageV2?.message)?.[vType] }` },
  { cat: "proto", label: "reaction target key",           mode: E, code: `m.message?.reactionMessage?.key` },
  { cat: "proto", label: "location full",                 mode: E, code: `m.message?.locationMessage || m.message?.liveLocationMessage` },
  { cat: "proto", label: "contact vcard",                 mode: E, code: `m.msg?.vcard` },
  { cat: "proto", label: "event message",                 mode: E, code: `m.message?.eventMessage` },
  { cat: "proto", label: "albumMessage proto",            mode: E, code: `m.message?.albumMessage` },
  { cat: "proto", label: "callLogMessage proto",          mode: E, code: `m.message?.callLogMessage` },
  { cat: "proto", label: "scheduledCall proto",           mode: E, code: `m.message?.scheduledCallCreationMessage || m.message?.scheduledCallEditMessage` },

  // ════ client ════
  { cat: "client", label: "client — all functions",              mode: E, code: `Object.keys(client).filter(k => typeof client[k] === 'function')` },
  { cat: "client", label: "client — all keys",                   mode: E, code: `Object.keys(client)` },
  { cat: "client", label: "client.getMyJid()",                   mode: E, code: `client.getMyJid?.()` },
  { cat: "client", label: "client.isConnected()",                mode: E, code: `client.isConnected?.()` },
  { cat: "client", label: "client.getSyncStatus()",              mode: E, code: `client.getSyncStatus?.()` },
  { cat: "client", label: "client.getConnectionStatus()",        mode: E, code: `client.getConnectionStatus?.()` },
  { cat: "client", label: "client.getAutoDownloadMedia()",       mode: E, code: `client.getAutoDownloadMedia?.()` },
  { cat: "client", label: "client.getActiveChat()",              mode: E, code: `client.getActiveChat?.()` },
  { cat: "client", label: "client.getDlQueueStatus()",           mode: E, code: `json(client.getDlQueueStatus?.() || {})` },
  { cat: "client", label: "client.getResumeSyncStatus()",        mode: E, code: `json(client.getResumeSyncStatus?.() || {})` },
  { cat: "client", label: "client.getStatusJidList()",           mode: E, code: `client.getStatusJidList?.()` },
  { cat: "client", label: "client.getContactStatuses()",         mode: E, code: `json(client.getContactStatuses?.() || {})` },
  { cat: "client", label: "client.getStatusesBySender",          mode: E, code: `json(client.getStatusesBySender?.(m.sender) || [])` },
  { cat: "client", label: "client.getLidMapEntries()",           mode: E, code: `json(client.getLidMapEntries?.() || {})` },
  { cat: "client", label: "client.getRawMsg (this msg)",         mode: E, code: `client.getRawMsg?.(m.id)` },
  { cat: "client", label: "downloadMediaForMsg",                 mode: B, code: `const row = db.getMessageById?.(m.id)\nif (!row) return 'row not found'\nconst res = await client.downloadMediaForMsg?.(row)\nreturn json(res)` },
  { cat: "client", label: "downloadMedia (url + key)",           mode: B, code: `// Download by URL + mediaKey (re-download after CDN expiry)\nconst row = db.getMessageById?.(m.id)\nif (!row?.media_url) return 'no media_url'\nconst res = await client.downloadMedia?.({ url: row.media_url, mediaKey: row.media_key, mimetype: row.mimetype, directPath: row.media_direct_path, fileEncSha256: row.media_enc_sha256 })\nreturn { size: res?.length }` },
  { cat: "client", label: "getProfilePic (sender)",              mode: B, code: `const res = await client.getProfilePic?.(m.sender)\nreturn res` },
  { cat: "client", label: "fetchContactStatus (sender)",         mode: B, code: `const res = await client.fetchContactStatus?.(m.sender)\nreturn res` },
  { cat: "client", label: "fetchContactStatusBulk",              mode: B, code: `const meta = await sock.groupMetadata(m.chat)\nconst jids = meta.participants.slice(0, 10).map(p => p.id)\nconst results = await client.fetchContactStatusBulk?.(jids)\nreturn json(results)` },
  { cat: "client", label: "getContactInfo",                      mode: B, code: `const info = await client.getContactInfo?.(m.sender)\nreturn json(info)` },
  { cat: "client", label: "getBusinessProfile",                  mode: B, code: `const biz = await client.getBusinessProfile?.(m.sender)\nreturn json(biz)` },
  { cat: "client", label: "sendTextMessage",                     mode: B, code: `const res = await client.sendTextMessage(m.chat, 'DevEval ping 🔔')\nreturn { id: res?.key?.id }` },
  { cat: "client", label: "sendImage",                           mode: B, code: `// Usage: sendImage(jid, buffer, caption, opts)\n// client.sendImage(m.chat, buffer, 'caption')` },
  { cat: "client", label: "sendAudio (ptt)",                     mode: B, code: `// Usage: sendAudio(jid, buffer, isPtt)\n// client.sendAudio(m.chat, audioBuffer, true)` },
  { cat: "client", label: "reactToMessage",                      mode: B, code: `const res = await client.reactToMessage?.(m.key, '🔥')\nreturn json(res)` },
  { cat: "client", label: "editMessage",                         mode: B, code: `// Edit a sent message (must be fromMe)\n// const res = await client.editMessage(m.chat, m.id, 'new text')\nreturn 'edit: provide fromMe msgId'` },
  { cat: "client", label: "deleteMessage",                       mode: B, code: `// Delete for everyone (must be fromMe or admin)\n// await client.deleteMessage(m.chat, m.key)\nreturn 'delete: confirm first!'` },
  { cat: "client", label: "starMessage",                         mode: B, code: `await client.starMessage?.(m.key, true)\nreturn 'starred'` },
  { cat: "client", label: "markRead (this msg)",                 mode: B, code: `await client.markRead?.(m.chat, [m.id])\nreturn 'marked read'` },
  { cat: "client", label: "markUnread",                          mode: B, code: `await client.markUnread?.(m.chat)\nreturn 'marked unread'` },
  { cat: "client", label: "archiveChat",                         mode: B, code: `await client.archiveChat?.(m.chat, true)\nreturn 'archived'` },
  { cat: "client", label: "pinChat",                             mode: B, code: `await client.pinChat?.(m.chat, true)\nreturn 'pinned'` },
  { cat: "client", label: "muteChat (8h)",                       mode: B, code: `const muteEndMs = Date.now() + 8 * 60 * 60 * 1000\nawait client.muteChat?.(m.chat, muteEndMs)\nreturn 'muted 8h'` },
  { cat: "client", label: "sendPresenceUpdate (typing)",         mode: B, code: `await client.sendPresenceUpdate?.('composing', m.chat)\nawait new Promise(r => setTimeout(r, 2000))\nawait client.sendPresenceUpdate?.('paused', m.chat)\nreturn 'done'` },
  { cat: "client", label: "subscribePresence",                   mode: B, code: `await client.subscribePresence?.(m.chat)\nreturn 'subscribed'` },
  { cat: "client", label: "getGroupMetadata",                    mode: B, code: `const meta = await client.getGroupMetadata?.(m.chat)\nreturn json(meta)` },
  { cat: "client", label: "groupFetchAllParticipating",          mode: B, code: `const groups = await client.groupFetchAllParticipating?.()\nreturn { count: Object.keys(groups||{}).length, jids: Object.keys(groups||{}).slice(0,10) }` },
  { cat: "client", label: "getGroupInviteLink",                  mode: B, code: `const link = await client.getGroupInviteLink?.(m.chat)\nreturn link` },
  { cat: "client", label: "getPrivacySettings",                  mode: B, code: `const priv = await client.getPrivacySettings?.()\nreturn json(priv)` },
  { cat: "client", label: "fetchBlocklist",                      mode: B, code: `const list = await client.fetchBlocklist?.()\nreturn json(list)` },
  { cat: "client", label: "checkNumberExists",                   mode: B, code: `// Check if a number is on WA\nconst exists = await client.checkNumberExists?.('6281234567890')\nreturn exists` },
  { cat: "client", label: "updateMyStatus",                      mode: B, code: `await client.updateMyStatus?.('DevEval test status 🔔')\nreturn 'status updated'` },
  { cat: "client", label: "updateMyName",                        mode: B, code: `// await client.updateMyName?.('New Name')\nreturn 'name update: confirm first!'` },
  { cat: "client", label: "getOrderDetails",                     mode: B, code: `// For orderMessage\nconst orderId = m.msg?.orderId\nif (!orderId) return 'no orderId'\nconst order = await client.getOrderDetails?.(orderId, m.msg?.token)\nreturn json(order)` },
  { cat: "client", label: "getCatalog",                          mode: B, code: `const cat = await client.getCatalog?.({ jid: m.sender })\nreturn json(cat)` },
  { cat: "client", label: "prioritizeChat",                      mode: B, code: `await client.prioritizeChat?.(m.chat)\nreturn 'chat prioritized for media download'` },
  { cat: "client", label: "prefetchChatMedia",                   mode: B, code: `await client.prefetchChatMedia?.(m.chat)\nreturn 'media prefetch triggered'` },
  { cat: "client", label: "pauseDownloads / resume",             mode: B, code: `await client.pauseDownloads?.()\nawait new Promise(r => setTimeout(r, 3000))\nawait client.resumeDownloads?.()\nreturn 'paused 3s then resumed'` },
  { cat: "client", label: "resolveLidNow()",                     mode: B, code: `client.resolveLidNow?.()\nreturn 'lid resolve triggered'` },
  { cat: "client", label: "getSocket()",                         mode: E, code: `const s = client.getSocket?.()\nreturn s ? Reflect.ownKeys(s).length + ' keys on socket' : 'null'` },
  { cat: "client", label: "forceReconnect",                      mode: B, code: `// Triggers immediate reconnect\nclient.forceReconnect?.()\nreturn 'reconnect triggered'` },
  { cat: "client", label: "fetchMessageHistory",                 mode: B, code: `// Fetch history for chat (sync gap fill)\nconst res = await client.fetchMessageHistory?.(m.chat)\nreturn json(res)` },
  { cat: "client", label: "sendStatus (text)",                   mode: B, code: `// Post a text status update\nconst res = await client.sendStatus?.({ text: 'DevEval status 🧪' })\nreturn json(res)` },
  { cat: "client", label: "newsletter metadata",                 mode: B, code: `// For newsletter JIDs\nconst meta = await client.newsletterMetadata?.('jid', m.chat)\nreturn json(meta)` },
  { cat: "client", label: "addLabel / removeChatLabel",          mode: B, code: `// Labels (Business accounts only)\nconst labels = await client.addLabel?.('1', [{ jid: m.chat }])\nreturn json(labels)` },
  { cat: "client", label: "resyncAppState",                      mode: B, code: `await client.resyncAppState?.(['critical_block','critical_unblock_online'])\nreturn 'app state resynced'` },

  // ════ parser ════
  { cat: "parser", label: "parseMessage (this msg)",            mode: B, code: `const row = db.getMessageById?.(m.id)\nif (!row) return 'not found'\nconst raw = JSON.parse(row.raw_json || '{}')\nconst { parseMessage } = require('./baileys/messageParser')\nconst parsed = await parseMessage({ message: raw, key: m.key })\nreturn json(parsed)` },
  { cat: "parser", label: "extractBody (this msg)",             mode: B, code: `const { extractBody } = require('./baileys/parser/body-extractor')\nconst row = db.getMessageById?.(m.id)\nif (!row) return 'not found'\nconst raw = JSON.parse(row.raw_json || '{}')\nreturn extractBody(raw, row.msg_type)` },
  { cat: "parser", label: "getRealContentType",                 mode: B, code: `const { getRealContentType } = require('./baileys/parser/type-detection')\nreturn getRealContentType(m.message)` },
  { cat: "parser", label: "normalizeMsgType",                   mode: B, code: `const { normalizeMsgType } = require('./baileys/parser/type-detection')\nconst raw = baileys.getContentType?.(m.message)\nreturn { raw, normalized: normalizeMsgType(raw) }` },
  { cat: "parser", label: "unwrapViewOnce",                     mode: B, code: `const { unwrapViewOnce } = require('./baileys/parser/type-detection')\nconst result = unwrapViewOnce(m.message)\nreturn result ? { wrapper: result.wrapper, innerKeys: Object.keys(result.inner) } : 'not viewOnce'` },
  { cat: "parser", label: "TYPE_ALIASES map",                   mode: B, code: `const { TYPE_ALIASES } = require('./baileys/parser/type-detection')\nreturn TYPE_ALIASES` },
  { cat: "parser", label: "extractMediaInfo (this msg)",        mode: B, code: `const { extractMediaInfo } = require('./baileys/parser/media-extractor')\nconst row = db.getMessageById?.(m.id)\nif (!row) return 'not found'\nconst raw = JSON.parse(row.raw_json || '{}')\nconst info = extractMediaInfo(raw, row.msg_type, row.is_view_once === 1)\nreturn json(info)` },
  { cat: "parser", label: "extractMediaInfoAsync",              mode: B, code: `const { extractMediaInfoAsync } = require('./baileys/parser/media-extractor')\nconst row = db.getMessageById?.(m.id)\nif (!row) return 'not found'\nconst raw = JSON.parse(row.raw_json || '{}')\nconst info = await extractMediaInfoAsync(raw, row.msg_type, row.is_view_once === 1)\nreturn json(info)` },
  { cat: "parser", label: "extractQuoted (this msg)",           mode: B, code: `const { extractQuoted } = require('./baileys/parser/quoted-extractor')\nconst row = db.getMessageById?.(m.id)\nif (!row) return 'not found'\nconst raw = JSON.parse(row.raw_json || '{}')\nreturn json(extractQuoted(raw, row.msg_type))` },
  { cat: "parser", label: "extractMentions",                    mode: B, code: `const { extractMentions } = require('./baileys/parser/misc-extractors')\nconst row = db.getMessageById?.(m.id)\nif (!row) return 'not found'\nconst raw = JSON.parse(row.raw_json || '{}')\nreturn extractMentions(raw, row.msg_type)` },
  { cat: "parser", label: "extractForwardInfo",                 mode: B, code: `const { extractForwardInfo } = require('./baileys/parser/misc-extractors')\nconst row = db.getMessageById?.(m.id)\nif (!row) return 'not found'\nconst raw = JSON.parse(row.raw_json || '{}')\nreturn extractForwardInfo(raw, row.msg_type)` },
  { cat: "parser", label: "extractPollOptions",                 mode: B, code: `const { extractPollOptions } = require('./baileys/parser/misc-extractors')\nconst row = db.getMessageById?.(m.id)\nif (!row) return 'not found'\nconst raw = JSON.parse(row.raw_json || '{}')\nreturn extractPollOptions(raw)` },
  { cat: "parser", label: "extractLocation",                    mode: B, code: `const { extractLocation } = require('./baileys/parser/misc-extractors')\nconst row = db.getMessageById?.(m.id)\nif (!row) return 'not found'\nconst raw = JSON.parse(row.raw_json || '{}')\nreturn extractLocation(raw, row.msg_type)` },
  { cat: "parser", label: "extractContacts",                    mode: B, code: `const { extractContacts } = require('./baileys/parser/misc-extractors')\nconst row = db.getMessageById?.(m.id)\nif (!row) return 'not found'\nconst raw = JSON.parse(row.raw_json || '{}')\nreturn extractContacts(raw, row.msg_type)` },
  { cat: "parser", label: "extractReaction",                    mode: B, code: `const { extractReaction } = require('./baileys/parser/misc-extractors')\nconst row = db.getMessageById?.(m.id)\nif (!row) return 'not found'\nconst raw = JSON.parse(row.raw_json || '{}')\nreturn extractReaction(raw)` },
  { cat: "parser", label: "extractEvent",                       mode: B, code: `const { extractEvent } = require('./baileys/parser/proto-extractors')\nconst row = db.getMessageById?.(m.id)\nif (!row) return 'not found'\nconst raw = JSON.parse(row.raw_json || '{}')\nreturn json(extractEvent(raw, row.msg_type))` },
  { cat: "parser", label: "extractCallLog",                     mode: B, code: `const { extractCallLog } = require('./baileys/parser/proto-extractors')\nconst row = db.getMessageById?.(m.id)\nif (!row) return 'not found'\nconst raw = JSON.parse(row.raw_json || '{}')\nreturn json(extractCallLog(raw, row.msg_type))` },
  { cat: "parser", label: "extractGroupInvite",                 mode: B, code: `const { extractGroupInvite } = require('./baileys/parser/proto-extractors')\nconst row = db.getMessageById?.(m.id)\nif (!row) return 'not found'\nconst raw = JSON.parse(row.raw_json || '{}')\nreturn json(extractGroupInvite(raw, row.msg_type))` },
  { cat: "parser", label: "extractAlbum",                       mode: B, code: `const { extractAlbum } = require('./baileys/parser/proto-extractors')\nconst row = db.getMessageById?.(m.id)\nif (!row) return 'not found'\nconst raw = JSON.parse(row.raw_json || '{}')\nreturn json(extractAlbum(raw, row.msg_type))` },
  { cat: "parser", label: "buildRendererPayload",               mode: B, code: `const { buildRendererPayload } = require('./baileys/parser/renderer')\nconst row = db.getMessageById?.(m.id)\nif (!row) return 'not found'\nreturn json(buildRendererPayload(row))` },
  { cat: "parser", label: "dbRowToRendererMsg",                 mode: B, code: `const { dbRowToRendererMsg } = require('./baileys/parser/renderer')\nconst row = db.getMessageById?.(m.id)\nif (!row) return 'not found'\nreturn json(dbRowToRendererMsg(row))` },
  { cat: "parser", label: "enrichMessage",                      mode: B, code: `const { enrichMessage } = require('./baileys/parser/renderer')\nconst row = db.getMessageById?.(m.id)\nif (!row) return 'not found'\nconst enriched = enrichMessage({ ...row }, { myJid: sock.user?.id })\nreturn json(Object.fromEntries(Object.entries(enriched).filter(([,v]) => typeof v === 'boolean')))` },

  // ════ media ════
  { cat: "media", label: "media info (DB row)",                 mode: B, code: `const row = db.getMessageById?.(m.id)\nreturn {\n  has_media: row?.has_media,\n  mimetype: row?.mimetype,\n  media_url: row?.media_url,\n  media_saved_path: row?.media_saved_path,\n  media_key: row?.media_key ? '(present)' : null,\n  media_direct_path: row?.media_direct_path,\n  media_enc_sha256: row?.media_enc_sha256 ? '(present)' : null,\n  media_thumbnail_b64: row?.media_thumbnail_b64 ? '(present, ' + row.media_thumbnail_b64.length + ' chars)' : null\n}` },
  { cat: "media", label: "thumbnail preview info",              mode: B, code: `const row = db.getMessageById?.(m.id)\nconst t = row?.media_thumbnail_b64\nif (!t) return 'no thumbnail stored'\nreturn { length: t.length, prefix: t.slice(0, 60), mime: t.match(/data:([^;]+)/)?.[1] }` },
  { cat: "media", label: "all media in chat",                   mode: B, code: `const msgs = db.getMessages(m.chat, 200, 0)\nreturn msgs.filter(r => r.has_media).map(r => ({ id: r.id.slice(0,8), type: r.msg_type, mime: r.mimetype, saved: !!r.media_saved_path, ts: new Date(r.timestamp*1000).toLocaleString() }))` },
  { cat: "media", label: "images in chat",                      mode: B, code: `const msgs = db.getMessages(m.chat, 200, 0)\nreturn msgs.filter(r => r.msg_type === 'imageMessage').map(r => ({ id: r.id.slice(0,8), saved: !!r.media_saved_path, path: r.media_saved_path, ts: new Date(r.timestamp*1000).toLocaleString() }))` },
  { cat: "media", label: "videos in chat",                      mode: B, code: `const msgs = db.getMessages(m.chat, 200, 0)\nreturn msgs.filter(r => r.msg_type === 'videoMessage').map(r => ({ id: r.id.slice(0,8), duration: r.media_duration, saved: !!r.media_saved_path, path: r.media_saved_path }))` },
  { cat: "media", label: "documents in chat",                   mode: B, code: `const msgs = db.getMessages(m.chat, 200, 0)\nreturn msgs.filter(r => r.msg_type === 'documentMessage').map(r => ({ id: r.id.slice(0,8), name: r.media_filename, size: r.media_filesize, saved: !!r.media_saved_path }))` },
  { cat: "media", label: "stickers in chat",                    mode: B, code: `const msgs = db.getMessages(m.chat, 200, 0)\nreturn msgs.filter(r => r.msg_type === 'stickerMessage').map(r => ({ id: r.id.slice(0,8), animated: r.is_animated, saved: !!r.media_saved_path }))` },
  { cat: "media", label: "voice notes (PTT) in chat",           mode: B, code: `const msgs = db.getMessages(m.chat, 200, 0)\nreturn msgs.filter(r => r.is_ptt).map(r => ({ id: r.id.slice(0,8), duration: r.media_duration, sender: r.sender_jid?.split('@')[0] }))` },
  { cat: "media", label: "media missing CDN (expired)",         mode: B, code: `const msgs = db.getMessages(m.chat, 200, 0)\nconst expired = msgs.filter(r => r.has_media && !r.media_saved_path && r.media_url)\nreturn { count: expired.length, sample: expired.slice(0,5).map(r => ({ id: r.id.slice(0,8), type: r.msg_type, hasKey: !!r.media_key, hasPath: !!r.media_direct_path })) }` },
  { cat: "media", label: "download queue status",               mode: E, code: `json(client.getDlQueueStatus?.() || {})` },
  { cat: "media", label: "MEDIA_TYPES set",                     mode: B, code: `const { MEDIA_TYPES } = require('./baileys/parser/media-extractor')\nreturn [...MEDIA_TYPES]` },
  { cat: "media", label: "hasMediaContent (this msg)",          mode: B, code: `const { hasMediaContent } = require('./baileys/parser/media-extractor')\nconst row = db.getMessageById?.(m.id)\nreturn { msgType: row?.msg_type, hasMedia: hasMediaContent(row?.msg_type) }` },
  { cat: "media", label: "media dir listing",                   mode: B, code: `const mediaDir = client.getMediaDir?.()\nif (!mediaDir || !fs.existsSync(mediaDir)) return 'media dir not found'\nconst files = fs.readdirSync(mediaDir)\nreturn { dir: mediaDir, count: files.length, sample: files.slice(0,15) }` },
  { cat: "media", label: "viewOnce media info",                 mode: B, code: `const row = db.getMessageById?.(m.id)\nif (!row) return 'not found'\nreturn { is_view_once: row.is_view_once, msg_type: row.msg_type, has_media: row.has_media, media_saved_path: row.media_saved_path || 'not saved' }` },

  // ════ jid ════
  { cat: "jid", label: "jid-utils — all exports",              mode: B, code: `const jidUtils = require('./baileys/parser/jid-utils')\nreturn Object.keys(jidUtils)` },
  { cat: "jid", label: "normalizeJid (sender)",                mode: B, code: `const { normalizeJid } = require('./baileys/parser/jid-utils')\nreturn normalizeJid(m.sender)` },
  { cat: "jid", label: "parseJid (sender)",                    mode: B, code: `const { parseJid } = require('./baileys/parser/jid-utils')\nreturn parseJid(m.sender)` },
  { cat: "jid", label: "parseJid (chat)",                      mode: B, code: `const { parseJid } = require('./baileys/parser/jid-utils')\nreturn parseJid(m.chat)` },
  { cat: "jid", label: "isLidJid (sender)",                    mode: B, code: `const { isLidJid } = require('./baileys/parser/jid-utils')\nreturn { jid: m.sender, isLid: isLidJid(m.sender) }` },
  { cat: "jid", label: "resolveLid (sender)",                  mode: B, code: `const { isLidJid, resolveLid, normalizeJid } = require('./baileys/parser/jid-utils')\nconst norm = normalizeJid(m.sender)\nreturn { original: m.sender, isLid: isLidJid(norm), resolved: isLidJid(norm) ? resolveLid(norm) : norm }` },
  { cat: "jid", label: "getJidDisplayPhone",                   mode: B, code: `const { getJidDisplayPhone } = require('./baileys/parser/jid-utils')\nreturn getJidDisplayPhone(m.sender)` },
  { cat: "jid", label: "lid map entries (global)",             mode: E, code: `json(client.getLidMapEntries?.() || {})` },
  { cat: "jid", label: "lid map size",                         mode: B, code: `const lids = client.getLidMapEntries?.()\nreturn { entries: Object.keys(lids||{}).length, sample: Object.entries(lids||{}).slice(0,5) }` },
  { cat: "jid", label: "jid type checks (chat)",               mode: B, code: `const { isGroupJid, isNewsletterJid, isUserJid, isBroadcastJid, isStatusBroadcastJid } = require('./baileys/parser/jid-utils')\nreturn {\n  jid: m.chat,\n  isGroup: isGroupJid(m.chat),\n  isNewsletter: isNewsletterJid(m.chat),\n  isUser: isUserJid(m.chat),\n  isBroadcast: isBroadcastJid(m.chat),\n  isStatusBroadcast: isStatusBroadcastJid(m.chat)\n}` },
  { cat: "jid", label: "sameUser check",                       mode: B, code: `const { sameUser } = require('./baileys/parser/jid-utils')\nreturn sameUser(m.sender, sock.user?.id)` },
  { cat: "jid", label: "jid decode (baileys)",                 mode: E, code: `({ sender: baileys.jidDecode?.(m.sender), chat: baileys.jidDecode?.(m.chat) })` },

  // ════ perf ════
  { cat: "perf", label: "process.memoryUsage()",          mode: E, code: `const mu = process.memoryUsage()\nreturn { heapUsed: (mu.heapUsed/1048576).toFixed(1)+'MB', heapTotal: (mu.heapTotal/1048576).toFixed(1)+'MB', rss: (mu.rss/1048576).toFixed(1)+'MB', external: (mu.external/1048576).toFixed(1)+'MB' }` },
  { cat: "perf", label: "process.cpuUsage()",             mode: E, code: `const c = process.cpuUsage()\nreturn { user: (c.user/1000).toFixed(1)+'ms', system: (c.system/1000).toFixed(1)+'ms' }` },
  { cat: "perf", label: "process.uptime()",               mode: E, code: `const s = process.uptime()\nconst h=Math.floor(s/3600),mn=Math.floor((s%3600)/60),sec=Math.floor(s%60)\nreturn \`\${h}h \${mn}m \${sec}s\`` },
  { cat: "perf", label: "process.versions",               mode: E, code: `process.versions` },
  { cat: "perf", label: "process.platform & arch",        mode: E, code: `({ platform: process.platform, arch: process.arch, pid: process.pid })` },
  { cat: "perf", label: "process.env keys",               mode: E, code: `Object.keys(process.env)` },
  { cat: "perf", label: "process.env (safe subset)",      mode: E, code: `(['NODE_ENV','ELECTRON_IS_DEV','PATH','HOME','USERPROFILE','APPDATA','TEMP'].reduce((a,k)=>{if(process.env[k]) a[k]=process.env[k];return a},{}))` },
  { cat: "perf", label: "V8 heap stats",                  mode: B, code: `const v8 = require('v8')\nconst h = v8.getHeapStatistics()\nreturn Object.fromEntries(Object.entries(h).map(([k,v])=>[k,(v/1048576).toFixed(2)+'MB']))` },
  { cat: "perf", label: "V8 heap space breakdown",        mode: B, code: `const v8 = require('v8')\nreturn v8.getHeapSpaceStatistics().map(s=>({ name:s.space_name, used:(s.space_used_size/1048576).toFixed(2)+'MB', avail:(s.space_available_size/1048576).toFixed(2)+'MB' }))` },
  { cat: "perf", label: "GC — force collection",          mode: B, code: `if (global.gc) { global.gc(); return 'GC triggered' }\nreturn 'gc not exposed (run with --expose-gc)'` },
  { cat: "perf", label: "db query bench (100 msgs)",      mode: B, code: `const t0=performance.now()\nfor(let i=0;i<10;i++) db.getMessages(m.chat, 100, 0)\nreturn (performance.now()-t0).toFixed(2)+'ms for 10x getMessages(100)'` },
  { cat: "perf", label: "require.cache size",             mode: E, code: `Object.keys(require.cache).length + ' modules cached'` },
  { cat: "perf", label: "require.cache modules",          mode: E, code: `Object.keys(require.cache).filter(k => !k.includes('node_modules')).map(k => k.split('/').pop())` },
  { cat: "perf", label: "os stats",                       mode: B, code: `const os = require('os')\nreturn { freeMem: (os.freemem()/1048576).toFixed(1)+'MB', totalMem: (os.totalmem()/1048576).toFixed(1)+'MB', cpus: os.cpus().length, load: os.loadavg(), uptime: (os.uptime()/3600).toFixed(1)+'h' }` },
  { cat: "perf", label: "event loop lag",                 mode: B, code: `const t0=performance.now()\nawait new Promise(r=>setImmediate(r))\nreturn (performance.now()-t0).toFixed(3)+'ms event loop lag'` },
  { cat: "perf", label: "timer accuracy check",           mode: B, code: `const times=[]\nfor(let i=0;i<5;i++){const t0=performance.now();await new Promise(r=>setTimeout(r,10));times.push((performance.now()-t0).toFixed(2))}\nreturn { expectedMs:10, actualMs: times }` },

  // ════ net ════
  { cat: "net", label: "sock ws state",                   mode: E, code: `({ readyState: sock?.ws?.readyState, states: {0:'CONNECTING',1:'OPEN',2:'CLOSING',3:'CLOSED'}[sock?.ws?.readyState] })` },
  { cat: "net", label: "sock ws url",                     mode: E, code: `sock?.ws?.url` },
  { cat: "net", label: "sock ws protocol",                mode: E, code: `({ protocol: sock?.ws?.protocol, extensions: sock?.ws?.extensions })` },
  { cat: "net", label: "sock ws bufferedAmount",          mode: E, code: `sock?.ws?.bufferedAmount` },
  { cat: "net", label: "ping test (fetch)",               mode: B, code: `const t0=performance.now()\nconst r=await fetch('https://web.whatsapp.com',{method:'HEAD'}).catch(e=>({status:'ERR: '+e.message}))\nreturn { status: r.status || r, ms: (performance.now()-t0).toFixed(0) }` },
  { cat: "net", label: "network interfaces",              mode: B, code: `const os=require('os')\nconst ifaces=os.networkInterfaces()\nreturn Object.entries(ifaces).flatMap(([name,addrs])=>addrs.map(a=>({name,family:a.family,address:a.address,internal:a.internal})))` },
  { cat: "net", label: "DNS resolve WA",                  mode: B, code: `const dns=require('dns').promises\nconst addrs=await dns.resolve4('web.whatsapp.com').catch(e=>[e.message])\nreturn { host:'web.whatsapp.com', addrs }` },
  { cat: "net", label: "fetch JSON (test API)",           mode: B, code: `const res = await fetch('https://httpbin.org/json')\nconst data = await res.json()\nreturn json(data)` },
  { cat: "net", label: "Baileys WA version fetch",        mode: B, code: `const { fetchLatestBaileysVersion } = baileys\nconst { version, isLatest } = await fetchLatestBaileysVersion?.()\nreturn { version: version?.join('.'), isLatest }` },

  // ════ fs ════
  { cat: "fs", label: "fs.readdirSync(cwd)",              mode: E, code: `fs.readdirSync(process.cwd())` },
  { cat: "fs", label: "cwd path",                         mode: E, code: `process.cwd()` },
  { cat: "fs", label: "__dirname",                         mode: E, code: `__dirname` },
  { cat: "fs", label: "list baileys dir",                 mode: E, code: `fs.readdirSync(path.join(process.cwd(), 'baileys'))` },
  { cat: "fs", label: "list session dir",                 mode: E, code: `fs.readdirSync(path.join(process.cwd(), 'baileys/session'))` },
  { cat: "fs", label: "session dir sizes",                mode: B, code: `const dir = path.join(process.cwd(),'baileys/session')\nconst files = fs.readdirSync(dir)\nreturn files.map(f => { const s=fs.statSync(path.join(dir,f)); return { file:f, size:(s.size/1024).toFixed(1)+'KB', mtime:s.mtime.toISOString() } })` },
  { cat: "fs", label: "creds.json preview",               mode: B, code: `const p = path.join(process.cwd(),'baileys/session/creds.json')\nif(!fs.existsSync(p)) return 'not found'\nconst c = JSON.parse(fs.readFileSync(p,'utf8'))\nreturn { me: c.me, serverHasPreKeys: c.serverHasPreKeys, registered: c.registered }` },
  { cat: "fs", label: "userData path",                    mode: B, code: `const { app } = require('electron')\nreturn app.getPath('userData')` },
  { cat: "fs", label: "list userData",                    mode: B, code: `const { app } = require('electron')\nreturn fs.readdirSync(app.getPath('userData'))` },
  { cat: "fs", label: "wplus_settings.json",              mode: B, code: `const { app } = require('electron')\nconst p = path.join(app.getPath('userData'),'wplus_settings.json')\nif(!fs.existsSync(p)) return 'not found'\nreturn JSON.parse(fs.readFileSync(p,'utf8'))` },
  { cat: "fs", label: "list media downloads dir",         mode: B, code: `const dirs = ['downloads','media','baileys/media','baileys/downloads']\nfor(const d of dirs) { const p=path.join(process.cwd(),d); if(fs.existsSync(p)) return { dir:p, files:fs.readdirSync(p).slice(0,20) } }\nreturn 'no media dir found'` },
  { cat: "fs", label: "disk free space",                  mode: B, code: `const { execSync } = require('child_process')\ntry {\n  if(process.platform==='win32') return execSync('wmic logicaldisk get size,freespace,caption').toString()\n  return execSync('df -h').toString()\n} catch(e) { return e.message }` },
  { cat: "fs", label: "DB file size",                     mode: B, code: `const dirs = [process.cwd(), path.join(process.cwd(),'baileys')]\nfor(const d of dirs) { const p=path.join(d,'wplus.db'); if(fs.existsSync(p)){ const s=fs.statSync(p); return { path:p, size:(s.size/1048576).toFixed(2)+'MB' } } }\nreturn 'db file not found'` },
  { cat: "fs", label: "parser files",                     mode: B, code: `const parserDir = path.join(__dirname, 'baileys/parser')\nif(!fs.existsSync(parserDir)) return 'parser dir not found'\nreturn fs.readdirSync(parserDir).map(f => ({ file: f, size: (fs.statSync(path.join(parserDir,f)).size/1024).toFixed(1)+'KB' }))` },
  { cat: "fs", label: "installed packages",               mode: B, code: `const p=path.join(process.cwd(),'package.json')\nif(!fs.existsSync(p)) return 'not found'\nconst pkg=JSON.parse(fs.readFileSync(p,'utf8'))\nreturn { name:pkg.name, version:pkg.version, deps:Object.keys(pkg.dependencies||{}), devDeps:Object.keys(pkg.devDependencies||{}) }` },

  // ════ debug ════
  { cat: "debug", label: "full runtime snapshot",         mode: B, code: `const os=require('os')\nconst mem=process.memoryUsage()\nreturn {\n  platform: process.platform, arch: process.arch,\n  node: process.version, pid: process.pid,\n  uptime: process.uptime().toFixed(0)+'s',\n  heap: (mem.heapUsed/1048576).toFixed(1)+'/'+(mem.heapTotal/1048576).toFixed(1)+'MB',\n  rss: (mem.rss/1048576).toFixed(1)+'MB',\n  freeMem: (os.freemem()/1048576).toFixed(1)+'MB',\n  connected: client.isConnected?.(),\n  myJid: client.getMyJid?.(),\n  syncStatus: client.getSyncStatus?.(),\n  connectionStatus: client.getConnectionStatus?.(),\n  dbStats: db.getStats?.(),\n  modulesLoaded: Object.keys(require.cache).length,\n}` },
  { cat: "debug", label: "sock event listeners",          mode: E, code: `const ev = sock?.ev\nif(!ev) return 'no ev'\ntry { return Object.fromEntries(Object.keys(ev).map(k => [k, ev.listenerCount?.(k) || '?'])) } catch { return Reflect.ownKeys(ev) }` },
  { cat: "debug", label: "Electron app paths",            mode: B, code: `const { app } = require('electron')\nconst keys = ['userData','appData','temp','exe','home','logs']\nreturn Object.fromEntries(keys.map(k => { try { return [k, app.getPath(k)] } catch { return [k, 'n/a'] } }))` },
  { cat: "debug", label: "Electron app info",             mode: B, code: `const { app } = require('electron')\nreturn { name:app.getName(), version:app.getVersion(), isPackaged:app.isPackaged, locale:app.getLocale() }` },
  { cat: "debug", label: "IPC handlers registered",       mode: E, code: `const ipcMain=require('electron').ipcMain\ntypeof ipcMain._events === 'object' ? Object.keys(ipcMain._events) : 'use Reflect.ownKeys(ipcMain)'` },
  { cat: "debug", label: "active timers count",           mode: E, code: `typeof process._getActiveHandles === 'function' ? process._getActiveHandles().length + ' handles, ' + process._getActiveRequests().length + ' requests' : 'not available'` },
  { cat: "debug", label: "require.cache — app files",     mode: E, code: `Object.keys(require.cache).filter(k=>!k.includes('node_modules')).map(k=>k.replace(process.cwd(),''))` },
  { cat: "debug", label: "uncaughtException listeners",   mode: E, code: `process.listenerCount('uncaughtException') + ' uncaughtException listeners, ' + process.listenerCount('unhandledRejection') + ' unhandledRejection listeners'` },
  { cat: "debug", label: "sock — missing methods check",  mode: B, code: `const expected=['sendMessage','groupMetadata','fetchStatus','profilePictureUrl','sendPresenceUpdate','readMessages','fetchBlocklist']\nreturn expected.map(m => ({ method:m, exists: typeof sock?.[m] === 'function' }))` },
  { cat: "debug", label: "db — missing methods check",    mode: B, code: `const expected=['getChats','getMessages','getContacts','getMessageById','insertMessage','upsertChat','getStats']\nreturn expected.map(m => ({ method:m, exists: typeof db?.[m] === 'function' }))` },
  { cat: "debug", label: "client — missing methods check",mode: B, code: `const expected=['getMyJid','isConnected','getSyncStatus','getConnectionStatus','downloadMediaForMsg','getProfilePic','sendTextMessage','markRead','getSocket','getDlQueueStatus','getLidMapEntries']\nreturn expected.map(fn => ({ method:fn, exists: typeof client?.[fn] === 'function' }))` },
  { cat: "debug", label: "parser — missing exports check",mode: B, code: `const checks = [\n  ['./baileys/parser/body-extractor', ['extractBody']],\n  ['./baileys/parser/media-extractor', ['extractMediaInfo','extractMediaInfoAsync','hasMediaContent']],\n  ['./baileys/parser/quoted-extractor', ['extractQuoted']],\n  ['./baileys/parser/misc-extractors', ['extractMentions','extractForwardInfo','extractPollOptions','extractLocation','extractContacts','extractReaction']],\n  ['./baileys/parser/proto-extractors', ['extractEvent','extractCallLog','extractGroupInvite','extractAlbum']],\n  ['./baileys/parser/type-detection', ['getRealContentType','normalizeMsgType','unwrapViewOnce']],\n  ['./baileys/parser/jid-utils', ['normalizeJid','parseJid','isLidJid','resolveLid']],\n  ['./baileys/parser/renderer', ['buildRendererPayload','dbRowToRendererMsg','enrichMessage']]\n]\nreturn checks.flatMap(([mod, fns]) => { try { const m=require(mod); return fns.map(f=>({mod:mod.split('/').pop(),fn:f,ok:typeof m[f]==='function'})) } catch(e) { return [{ mod, error: e.message }] } })` },
  { cat: "debug", label: "auth — creds me field",         mode: B, code: `const p=path.join(process.cwd(),'baileys/session/creds.json')\nif(!fs.existsSync(p)) return 'no creds.json'\nconst c=JSON.parse(fs.readFileSync(p,'utf8'))\nreturn { me:c.me, registered:c.registered, platform:c.platform }` },
  { cat: "debug", label: "last 10 messages — all types",  mode: B, code: `return db.getMessages(m.chat, 10, 0).map(r => ({ id:r.id.slice(0,8), type:r.msg_type, body:(r.body||'').slice(0,40), ts:new Date(r.timestamp*1000).toLocaleTimeString() }))` },
  { cat: "debug", label: "pending media downloads",       mode: B, code: `const pending = db.getMediaPendingForChat?.(m.chat, 50) || db.getPendingMediaDownloads?.() || []\nreturn { count: pending.length, items: pending.slice(0,10).map(r=>({ id:r.id?.slice(0,8), type:r.msg_type, mime:r.mimetype })) }` },
  { cat: "debug", label: "LID/JID check (this sender)",   mode: B, code: `const { isJidUser, isJidGroup, jidDecode, jidNormalizedUser } = baileys\nreturn {\n  raw: m.sender,\n  isUser: isJidUser?.(m.sender),\n  isGroup: isJidGroup?.(m.chat),\n  decoded: jidDecode?.(m.sender),\n  normalized: jidNormalizedUser?.(m.sender),\n  isLid: m.sender?.includes('@lid'),\n}` },
  { cat: "debug", label: "proto integrity check",         mode: B, code: `const { proto } = baileys\nconst checks = ['WebMessageInfo','Message','MessageKey','ContextInfo','ImageMessage','VideoMessage','AudioMessage','DocumentMessage','StickerMessage']\nreturn checks.map(c => ({ type:c, exists: !!proto?.[c], encode: typeof proto?.[c]?.encode==='function' }))` },
  { cat: "debug", label: "suppressed rejection patterns", mode: B, code: `// Patterns in client.js _SUPPRESSED_REJECTION_PATTERNS\nreturn ['terminated','Failed to fetch','ECONNRESET','ECACHEFULL','empty media key','Cannot derive','Connection Closed','Connection Terminated','Stream ended unexpectedly','Cache max keys']` },
  { cat: "debug", label: "msg type breakdown (100 last)", mode: B, code: `const msgs = db.getMessages(m.chat, 100, 0)\nconst counts = {}\nfor (const r of msgs) counts[r.msg_type] = (counts[r.msg_type] || 0) + 1\nreturn Object.entries(counts).sort(([,a],[,b])=>b-a).map(([t,c])=>({ type:t, count:c }))` },

  // ════ inspect — toString / source / prototype / descriptor introspection ════
  // ── toString / source printing ──
  { cat: "inspect", label: "sock fn source — by name",        mode: B, code: `// Change 'sendMessage' to any sock method\nconst fn = sock['sendMessage']\nif (typeof fn !== 'function') return 'not a function'\nreturn fn.toString()` },
  { cat: "inspect", label: "client fn source — by name",      mode: B, code: `// Change 'sendTextMessage' to any client method\nconst fn = client['sendTextMessage']\nif (typeof fn !== 'function') return 'not a function'\nreturn fn.toString()` },
  { cat: "inspect", label: "baileys fn source — by name",     mode: B, code: `// Change 'jidNormalizedUser' to any baileys export\nconst fn = baileys['jidNormalizedUser']\nif (typeof fn !== 'function') return 'not a function'\nreturn fn.toString()` },
  { cat: "inspect", label: "db fn source — by name",          mode: B, code: `// Change 'getMessages' to any db method\nconst fn = db['getMessages']\nif (typeof fn !== 'function') return 'not a function'\nreturn fn.toString()` },
  { cat: "inspect", label: "dump all sock fn sources",         mode: B, code: `const fns = Reflect.ownKeys(sock).filter(k => typeof sock[k] === 'function')\nreturn fns.map(k => ({ name: k, lines: sock[k].toString().split('\\n').length, preview: sock[k].toString().slice(0, 120).replace(/\\n/g,' ') }))` },
  { cat: "inspect", label: "dump all client fn sources",       mode: B, code: `const fns = Object.keys(client).filter(k => typeof client[k] === 'function')\nreturn fns.map(k => ({ name: k, lines: client[k].toString().split('\\n').length, preview: client[k].toString().slice(0, 120).replace(/\\n/g,' ') }))` },
  { cat: "inspect", label: "dump all db fn sources",           mode: B, code: `const fns = Object.keys(db).filter(k => typeof db[k] === 'function')\nreturn fns.map(k => ({ name: k, lines: db[k].toString().split('\\n').length, preview: db[k].toString().slice(0, 100).replace(/\\n/g,' ') }))` },
  // ── prototype chain ──
  { cat: "inspect", label: "sock prototype chain",             mode: B, code: `const chain = []\nlet o = sock\nwhile (o) { chain.push({ proto: Object.prototype.toString.call(o), ownKeys: Reflect.ownKeys(o).length }); o = Object.getPrototypeOf(o) }\nreturn chain` },
  { cat: "inspect", label: "sock proto — own fn names",        mode: E, code: `Object.getOwnPropertyNames(Object.getPrototypeOf(sock) || {}).filter(k => typeof sock[k] === 'function')` },
  { cat: "inspect", label: "client prototype chain",           mode: B, code: `const chain = []\nlet o = client\nwhile (o && chain.length < 6) { chain.push({ proto: o?.constructor?.name || '?', keys: Reflect.ownKeys(o).slice(0,8) }); o = Object.getPrototypeOf(o) }\nreturn chain` },
  { cat: "inspect", label: "baileys fn length/name map",       mode: E, code: `Object.keys(baileys).filter(k=>typeof baileys[k]==='function').map(k=>({ name:k, args:baileys[k].length, async:/^async/.test(baileys[k].toString()) }))` },
  // ── property descriptor inspection ──
  { cat: "inspect", label: "getOwnPropertyDescriptors(sock)",  mode: B, code: `const desc = Object.getOwnPropertyDescriptors(sock)\nreturn Object.fromEntries(Object.entries(desc).map(([k,d])=>([k,{ get:!!d.get, set:!!d.set, value: typeof d.value, writable:d.writable, configurable:d.configurable, enumerable:d.enumerable }])))` },
  { cat: "inspect", label: "sock — non-enumerable keys",       mode: E, code: `const all = Reflect.ownKeys(sock)\nconst enumerable = new Set(Object.keys(sock))\nreturn all.filter(k => !enumerable.has(k))` },
  { cat: "inspect", label: "sock — getter/setter props",       mode: B, code: `const desc = Object.getOwnPropertyDescriptors(sock)\nreturn Object.entries(desc).filter(([,d])=>d.get||d.set).map(([k,d])=>({ key:k, hasGetter:!!d.get, hasSetter:!!d.set }))` },
  { cat: "inspect", label: "Object.is checks (sock)",          mode: B, code: `return {\n  isFrozen: Object.isFrozen(sock),\n  isSealed: Object.isSealed(sock),\n  isExtensible: Object.isExtensible(sock),\n}` },
  // ── Symbol inspection ──
  { cat: "inspect", label: "sock — Symbol keys",               mode: E, code: `Object.getOwnPropertySymbols(sock).map(s => s.toString())` },
  { cat: "inspect", label: "baileys — Symbol keys",            mode: E, code: `Object.getOwnPropertySymbols(baileys).map(s => s.toString())` },
  { cat: "inspect", label: "m — Symbol keys",                  mode: E, code: `Object.getOwnPropertySymbols(m || {}).map(s => s.toString())` },
  // ── deep diff / compare ──
  { cat: "inspect", label: "sock vs dims — key diff",          mode: B, code: `const sockKeys = new Set(Reflect.ownKeys(sock))\nconst dimsKeys = new Set(Reflect.ownKeys(dims))\nconst onlySock = [...sockKeys].filter(k=>!dimsKeys.has(k))\nconst onlyDims = [...dimsKeys].filter(k=>!sockKeys.has(k))\nreturn { identical: sockKeys.size===dimsKeys.size && onlySock.length===0, onlySock, onlyDims }` },
  { cat: "inspect", label: "client vs sock — overlap",         mode: B, code: `const cKeys = new Set(Object.keys(client))\nconst sKeys = new Set(Reflect.ownKeys(sock))\nconst shared = [...cKeys].filter(k=>sKeys.has(k))\nreturn { sharedCount: shared.length, shared }` },
  // ── function metadata ──
  { cat: "inspect", label: "fn metadata — sock method",        mode: B, code: `// Change 'sendMessage' to target method\nconst fn = sock['sendMessage']\nif (typeof fn !== 'function') return 'not a function'\nreturn { name: fn.name, length: fn.length, isAsync: fn.constructor?.name === 'AsyncFunction', isGenerator: fn.constructor?.name === 'GeneratorFunction', src_lines: fn.toString().split('\\n').length }` },
  { cat: "inspect", label: "fn metadata — client method",      mode: B, code: `// Change 'downloadMediaForMsg' to target method\nconst fn = client['downloadMediaForMsg']\nif (typeof fn !== 'function') return 'not a function'\nreturn { name: fn.name, length: fn.length, isAsync: fn.constructor?.name === 'AsyncFunction', src_lines: fn.toString().split('\\n').length }` },
  { cat: "inspect", label: "all async sock fns",               mode: B, code: `return Reflect.ownKeys(sock).filter(k => {\n  const fn = sock[k]\n  return typeof fn === 'function' && fn.constructor?.name === 'AsyncFunction'\n})` },
  { cat: "inspect", label: "all async client fns",             mode: B, code: `return Object.keys(client).filter(k => {\n  const fn = client[k]\n  return typeof fn === 'function' && fn.constructor?.name === 'AsyncFunction'\n})` },
  // ── module introspection ──
  { cat: "inspect", label: "require.cache — baileys entry",    mode: B, code: `const key = Object.keys(require.cache).find(k => k.includes('baileys') && k.endsWith('index.js'))\nif (!key) return 'not found'\nconst mod = require.cache[key]\nreturn { id: mod.id.replace(process.cwd(),''), children: mod.children.length, exports: Object.keys(mod.exports || {}).slice(0,20) }` },
  { cat: "inspect", label: "require.cache — client.js entry",  mode: B, code: `const key = Object.keys(require.cache).find(k => k.endsWith('client.js') && !k.includes('node_modules'))\nif (!key) return 'not found'\nconst mod = require.cache[key]\nreturn { id: mod.id.replace(process.cwd(),''), children: mod.children.map(c=>c.id.replace(process.cwd(),'')), exports: Object.keys(mod.exports||{}) }` },
  { cat: "inspect", label: "require.cache — all app modules",  mode: B, code: `return Object.entries(require.cache).filter(([k])=>!k.includes('node_modules')).map(([k,v])=>({ file:k.replace(process.cwd(),''), exports: Object.keys(v.exports||{}).slice(0,8), children:v.children.length }))` },
  // ── serialization helpers ──
  { cat: "inspect", label: "safe JSON (handle circular)",      mode: B, code: `function safeJSON(obj) {\n  const seen = new WeakSet()\n  return JSON.stringify(obj, (k,v) => {\n    if (typeof v === 'object' && v !== null) {\n      if (seen.has(v)) return '[Circular]'\n      seen.add(v)\n    }\n    if (typeof v === 'function') return '[Function: ' + (v.name||'anonymous') + ']'\n    if (typeof v === 'bigint') return v.toString() + 'n'\n    if (v instanceof Buffer) return '[Buffer(' + v.length + ')]'\n    return v\n  }, 2)\n}\nreturn safeJSON(m.message)` },
  { cat: "inspect", label: "deep type map of m.message",       mode: B, code: `function typeMap(obj, depth=0) {\n  if (depth>4 || !obj || typeof obj !== 'object') return typeof obj\n  return Object.fromEntries(Object.entries(obj).map(([k,v])=>[k, typeMap(v,depth+1)]))\n}\nreturn typeMap(m.message)` },
  { cat: "inspect", label: "Buffer inspect (media key)",       mode: B, code: `const row = db.getMessageById?.(m.id)\nconst key = row?.media_key\nif (!key) return 'no media_key'\nconst buf = Buffer.isBuffer(key) ? key : Buffer.from(key, 'base64')\nreturn { length: buf.length, hex: buf.toString('hex').slice(0,64)+'...', base64: buf.toString('base64').slice(0,64)+'...' }` },

  // ════ inspect — ctx toString / per-object source shortcuts ════
  // Every variable available in the eval ctx, with source/type/key inspection

  // ── sock / dims / ws ──
  { cat: "inspect", label: "sock.sendMessage.toString()",        mode: E, code: `sock.sendMessage.toString()` },
  { cat: "inspect", label: "sock.groupMetadata.toString()",      mode: E, code: `sock.groupMetadata.toString()` },
  { cat: "inspect", label: "sock.sendPresenceUpdate.toString()", mode: E, code: `sock.sendPresenceUpdate.toString()` },
  { cat: "inspect", label: "sock.readMessages.toString()",       mode: E, code: `sock.readMessages.toString()` },
  { cat: "inspect", label: "sock.fetchBlocklist.toString()",     mode: E, code: `sock.fetchBlocklist.toString()` },
  { cat: "inspect", label: "sock — any fn toString()",           mode: B, code: `// Edit method name below\nreturn sock['profilePictureUrl'].toString()` },
  { cat: "inspect", label: "dims keys (alias of sock)",          mode: E, code: `Reflect.ownKeys(dims)` },
  { cat: "inspect", label: "ws.toString()",                      mode: E, code: `ws?.toString?.() ?? String(ws)` },
  { cat: "inspect", label: "ws constructor name",                mode: E, code: `ws?.constructor?.name` },

  // ── client ──
  { cat: "inspect", label: "client.sendTextMessage.toString()",  mode: E, code: `client.sendTextMessage.toString()` },
  { cat: "inspect", label: "client.downloadMediaForMsg.toString()", mode: E, code: `client.downloadMediaForMsg.toString()` },
  { cat: "inspect", label: "client.getSocket.toString()",        mode: E, code: `client.getSocket.toString()` },
  { cat: "inspect", label: "client.forceReconnect.toString()",   mode: E, code: `client.forceReconnect.toString()` },
  { cat: "inspect", label: "client.isConnected.toString()",      mode: E, code: `client.isConnected.toString()` },
  { cat: "inspect", label: "client — any fn toString()",         mode: B, code: `// Edit method name below\nreturn client['markRead'].toString()` },
  { cat: "inspect", label: "client — all fn src line counts",    mode: B, code: `return Object.keys(client).filter(k=>typeof client[k]==='function').map(k=>({ fn:k, lines: client[k].toString().split('\\n').length })).sort((a,b)=>b.lines-a.lines)` },

  // ── db ──
  { cat: "inspect", label: "db.getMessages.toString()",          mode: E, code: `db.getMessages.toString()` },
  { cat: "inspect", label: "db.getChats.toString()",             mode: E, code: `db.getChats.toString()` },
  { cat: "inspect", label: "db.insertMessage.toString()",        mode: E, code: `db.insertMessage.toString()` },
  { cat: "inspect", label: "db.upsertChat.toString()",           mode: E, code: `db.upsertChat.toString()` },
  { cat: "inspect", label: "db.getStats.toString()",             mode: E, code: `db.getStats.toString()` },
  { cat: "inspect", label: "db — any fn toString()",             mode: B, code: `// Edit method name below\nreturn db['getMessageById'].toString()` },
  { cat: "inspect", label: "db — all fn src line counts",        mode: B, code: `return Object.keys(db).filter(k=>typeof db[k]==='function').map(k=>({ fn:k, lines: db[k].toString().split('\\n').length })).sort((a,b)=>b.lines-a.lines)` },

  // ── baileys ──
  { cat: "inspect", label: "baileys.getContentType.toString()",  mode: E, code: `baileys.getContentType.toString()` },
  { cat: "inspect", label: "baileys.jidDecode.toString()",       mode: E, code: `baileys.jidDecode.toString()` },
  { cat: "inspect", label: "baileys.downloadMediaMessage.toString()", mode: E, code: `baileys.downloadMediaMessage.toString()` },
  { cat: "inspect", label: "baileys.generateWAMessage.toString()",mode: E, code: `baileys.generateWAMessage.toString()` },
  { cat: "inspect", label: "baileys — any fn toString()",        mode: B, code: `// Edit export name below\nreturn baileys['normalizeMessageContent'].toString()` },
  { cat: "inspect", label: "baileys — all fn src line counts",   mode: B, code: `return Object.keys(baileys).filter(k=>typeof baileys[k]==='function').map(k=>({ fn:k, lines: baileys[k].toString().split('\\n').length })).sort((a,b)=>b.lines-a.lines)` },

  // ── util / fs / path / process / Buffer / require ──
  { cat: "inspect", label: "util.inspect.toString()",            mode: E, code: `util.inspect.toString()` },
  { cat: "inspect", label: "util.format.toString()",             mode: E, code: `util.format.toString()` },
  { cat: "inspect", label: "util — all fn keys",                 mode: E, code: `Object.keys(util).filter(k=>typeof util[k]==='function')` },
  { cat: "inspect", label: "fs — all fn keys",                   mode: E, code: `Object.keys(fs).filter(k=>typeof fs[k]==='function')` },
  { cat: "inspect", label: "fs.readFileSync.toString()",         mode: E, code: `fs.readFileSync.toString()` },
  { cat: "inspect", label: "path — all keys",                    mode: E, code: `Object.keys(path)` },
  { cat: "inspect", label: "path.join.toString()",               mode: E, code: `path.join.toString()` },
  { cat: "inspect", label: "process — all keys",                 mode: E, code: `Object.keys(process)` },
  { cat: "inspect", label: "process.versions",                   mode: E, code: `process.versions` },
  { cat: "inspect", label: "Buffer.toString()",                  mode: E, code: `Buffer.toString()` },
  { cat: "inspect", label: "Buffer — all static fns",            mode: E, code: `Object.getOwnPropertyNames(Buffer).filter(k=>typeof Buffer[k]==='function')` },
  { cat: "inspect", label: "require.resolve.toString()",         mode: E, code: `require.resolve.toString()` },
  { cat: "inspect", label: "require.main path",                  mode: E, code: `require.main?.filename` },

  // ── ctx helpers: fmt / json / log ──
  { cat: "inspect", label: "fmt.toString()",                     mode: E, code: `fmt.toString()` },
  { cat: "inspect", label: "json.toString()",                    mode: E, code: `json.toString()` },
  { cat: "inspect", label: "log.toString()",                     mode: E, code: `log.toString()` },

  // ── ctx full map ──
  { cat: "inspect", label: "ctx — all keys + types",             mode: B, code: `// Full map of every variable available in this eval context\nconst ctxVars = { require, Buffer, process, sock, dims, ws, db, baileys, client, util, path, fs, m, fmt, json, log }\nreturn Object.fromEntries(Object.entries(ctxVars).map(([k,v]) => [k, { type: typeof v, constructor: v?.constructor?.name || null, keys: typeof v === 'object' && v ? Reflect.ownKeys(v).length : typeof v === 'function' ? v.length + ' args' : String(v).slice(0,40) }]))` },
  { cat: "inspect", label: "ctx — all fn sources (compact)",     mode: B, code: `const ctxFns = { fmt, json, log }\nreturn Object.fromEntries(Object.entries(ctxFns).map(([k,v])=>[k, v.toString()]))` },
  { cat: "inspect", label: "ctx — toString on every object",     mode: B, code: `const objs = { sock, dims, ws, db, client, util, path, fs, Buffer, process }\nreturn Object.fromEntries(Object.entries(objs).map(([k,v]) => [k, { toString: v?.toString?.(), constructor: v?.constructor?.name }]))` },
]

// ─── Context pills ─────────────────────────────────────────────────────────────
const PILLS = [
  { t: "m",           d: "smsg message obj — full bot-style handler" },
  { t: "sock",        d: "Baileys WASocket — sendMessage, groupMetadata, etc." },
  { t: "db",          d: "SQLite database helper — getMessages, getChats…" },
  { t: "baileys",     d: "wileys/baileys exports — proto, jid utils, download…" },
  { t: "client",      d: "WaPlus AuroraChat client functions" },
  { t: "util",        d: "Node.js util — util.inspect, util.format…" },
  { t: "fs",          d: "Node.js fs module" },
  { t: "path",        d: "Node.js path module" },
  { t: "fmt(v)",      d: "util.inspect — full depth, no truncation" },
  { t: "json(v)",     d: "JSON.stringify pretty (2 spaces)" },
  { t: "log(v)",      d: "console.log + return v (inspect in terminal too)" },
  { t: "m.chat",      d: "Current chat JID" },
  { t: "m.sender",    d: "Sender JID (decoded)" },
  { t: "m.id",        d: "Message ID" },
  { t: "m.mtype",     d: "Message type string" },
  { t: "m.body",      d: "Message body text" },
  { t: "m.message",   d: "Raw WAMessage proto object" },
  { t: "m.msg",       d: "Inner message content (unwrapped)" },
  { t: "m.quoted",    d: "Quoted message object" },
  { t: "m.key",       d: "Message key { remoteJid, fromMe, id }" },
  { t: "sock.user",   d: "Bot's own user info { id, name }" },
  { t: "fn.toString()",                      d: "Print function source — use fmt() or inspect category" },
  { t: "Object.getOwnPropertyDescriptors(x)", d: "Full descriptor map incl. getters/setters/writable" },
  { t: "Reflect.ownKeys(x)",                 d: "All keys incl. Symbols & non-enumerable" },
  { t: "Object.getPrototypeOf(x)",           d: "Walk the prototype chain" },
]

const HIST_KEY = "__wpe_hist_v5__"
const loadHist = () => { try { return JSON.parse(sessionStorage.getItem(HIST_KEY) || "[]") } catch { return [] } }
const saveHist = h => { try { sessionStorage.setItem(HIST_KEY, JSON.stringify(h.slice(-100))) } catch {} }

// ─── Main ─────────────────────────────────────────────────────────────────────
const DevEvalModal = memo(function DevEvalModal({ msg, onClose }) {
  const [mode,        setMode]        = useState(E)
  const [code,        setCode]        = useState("m")
  const [running,     setRunning]     = useState(false)
  const [result,      setResult]      = useState(null)
  const [execMs,      setExecMs]      = useState(null)
  const [hist,        setHist]        = useState(loadHist)
  const [hIdx,        setHIdx]        = useState(-1)
  const [copied,      setCopied]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [fullView,    setFullView]    = useState(false)
  const [tab,         setTab]         = useState("msg")
  const [showTpl,     setShowTpl]     = useState(false)
  const [tplSearch,   setTplSearch]   = useState("")
  const [showLines,   setShowLines]   = useState(true)
  const [showSearch,  setShowSearch]  = useState(false)
  const [searchQ,     setSearchQ]     = useState("")
  const [searchIdx,   setSearchIdx]   = useState(0)
  const [pinned,      setPinned]      = useState(null)
  const [prettyJson,  setPrettyJson]  = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  const edRef      = useRef(null)
  const outRef     = useRef(null)
  const searchRef  = useRef(null)
  const tplSearchRef = useRef(null)

  useEffect(() => { setTimeout(() => edRef.current?.focus(), 80) }, [])

  useEffect(() => {
    const fn = e => {
      if (e.key === "Escape" && !running) {
        if (showSearch) { setShowSearch(false); setSearchQ(""); edRef.current?.focus() }
        else if (showTpl) { setShowTpl(false); setTplSearch("") }
        else if (confirmClose) { setConfirmClose(false); edRef.current?.focus() }
        else { setConfirmClose(true); setTimeout(() => setConfirmClose(false), 3000) }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "f" && result !== null) {
        e.preventDefault()
        setShowSearch(v => { if (!v) setTimeout(() => searchRef.current?.focus(), 60); return !v })
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "l") {
        e.preventDefault()
        setCode(""); setResult(null); setExecMs(null); edRef.current?.focus()
      }
    }
    document.addEventListener("keydown", fn)
    return () => document.removeEventListener("keydown", fn)
  }, [onClose, running, showSearch, result, showTpl, confirmClose])

  useEffect(() => {
    setFullView(false)
    setSearchIdx(0)
    setPrettyJson(false)
    if (outRef.current) outRef.current.scrollTop = 0
  }, [result])

  useEffect(() => {
    if (!showSearch || !searchQ) return
    const el = outRef.current?.querySelector(".devc-search-current")
    el?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [searchIdx, showSearch, searchQ])

  // Focus tpl search when panel opens
  useEffect(() => {
    if (showTpl) setTimeout(() => tplSearchRef.current?.focus(), 80)
    else setTplSearch("")
  }, [showTpl])

  const run = useCallback(async () => {
    const trimmed = code.trim()
    if (!trimmed || running) return
    setRunning(true); setResult(null); setExecMs(null)
    const newH = [trimmed, ...hist.filter(h => h !== trimmed)]
    setHist(newH); saveHist(newH); setHIdx(-1)
    const t0 = performance.now()
    try {
      if (!window.api?.devEval) {
        setResult({ ok: false, error: "window.api.devEval not available — update preload.js" })
        return
      }
      const res = await window.api.devEval({
        code: trimmed, mode,
        msgId:   msg?.id       || null,
        chatJid: msg?.chat_jid || null,
        fullOutput: true,
      })
      setResult(res)
    } catch (e) { setResult({ ok: false, error: e.message || String(e) }) }
    finally { setExecMs(Math.round(performance.now() - t0)); setRunning(false) }
  }, [code, mode, running, hist, msg])

  const onKeyDown = useCallback(e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); run(); return }
    if (e.altKey) {
      if (e.key === "ArrowUp") {
        e.preventDefault()
        const n = Math.min(hIdx + 1, hist.length - 1); setHIdx(n); setCode(hist[n] || "")
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        if (hIdx <= 0) { setHIdx(-1); setCode("") }
        else { const p = hIdx - 1; setHIdx(p); setCode(hist[p]) }
      }
    }
    if (e.key === "Tab") {
      e.preventDefault()
      const el = e.target, s = el.selectionStart, en = el.selectionEnd
      setCode(c => c.slice(0, s) + "  " + c.slice(en))
      setTimeout(() => el.setSelectionRange(s + 2, s + 2), 0)
    }
  }, [run, code, hist, hIdx])

  const onSearchKeyDown = useCallback(e => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault()
      setSearchIdx(i => (i + 1) % Math.max(1, matchCount))
    } else if (e.key === "ArrowUp" || (e.shiftKey && e.key === "Enter")) {
      e.preventDefault()
      setSearchIdx(i => (i - 1 + Math.max(1, matchCount)) % Math.max(1, matchCount))
    }
  }, [])

  const insertAt = useCallback(text => {
    const el = edRef.current
    if (!el) { setCode(c => c + text); return }
    const s = el.selectionStart, en = el.selectionEnd
    setCode(c => c.slice(0, s) + text + c.slice(en))
    setTimeout(() => { el.focus(); el.setSelectionRange(s + text.length, s + text.length) }, 0)
  }, [])

  const applyTpl = useCallback(tpl => {
    setCode(tpl.code); if (tpl.mode) setMode(tpl.mode); setResult(null); setExecMs(null)
    setShowTpl(false); setTplSearch("")
    setTimeout(() => edRef.current?.focus(), 50)
  }, [])

  // Filtered templates for current tab + search
  const filteredTpls = useMemo(() => {
    const base = tplSearch.trim()
      ? TEMPLATES.filter(t =>
          t.label.toLowerCase().includes(tplSearch.toLowerCase()) ||
          t.code.toLowerCase().includes(tplSearch.toLowerCase()) ||
          t.cat.toLowerCase().includes(tplSearch.toLowerCase())
        )
      : TEMPLATES.filter(t => t.cat === tab)
    return base
  }, [tab, tplSearch])

  const outText = result
    ? (result.ok ? result.result : (result.error + (result.stack ? "\n\nStack:\n" + result.stack : "")))
    : null

  const isJsonOutput = useMemo(() => {
    if (!outText) return false
    const t = outText.trim()
    if (!(t.startsWith("{") || t.startsWith("[") || t.startsWith("'"))) return false
    try { JSON.parse(t); return true } catch {}
    try {
      const j = t.replace(/'/g, '"').replace(/(\w+):/g, '"$1":').replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')
      JSON.parse(j); return true
    } catch {}
    return false
  }, [outText])

  const prettyOutText = useMemo(() => {
    if (!prettyJson || !outText) return outText
    const t = outText.trim()
    try { return JSON.stringify(JSON.parse(t), null, 2) } catch {}
    try {
      let s = t
        .replace(/undefined/g, 'null')
        .replace(/\[Function[^\]]*\]/g, '"[Function]"')
        .replace(/\[Circular\]/g, '"[Circular]"')
        .replace(/([{,]\s*)([a-zA-Z_$][\w$]*)(\s*:)/g, '$1"$2"$3')
        .replace(/'/g, '"')
        .replace(/,(\s*[}\]])/g, '$1')
      return JSON.stringify(JSON.parse(s), null, 2)
    } catch {}
    return outText
  }, [prettyJson, outText])

  const TRUNC = 30000
  const activeText = prettyJson ? (prettyOutText || outText) : outText
  const isBig = activeText && activeText.length > TRUNC && !fullView
  const display = isBig
    ? activeText.slice(0, TRUNC) + `\n\n... ▲ TRUNCATED — click "Full View" to show all ${activeText.length.toLocaleString()} chars`
    : activeText

  const matchCount = useMemo(() => countMatches(display, searchQ), [display, searchQ])
  useEffect(() => { setSearchIdx(0) }, [searchQ, display])

  const outputHtml = useMemo(() => {
    const base = colorize(display || "")
    return showSearch && searchQ ? highlightSearch(base, searchQ, searchIdx) : base
  }, [display, showSearch, searchQ, searchIdx])

  const outputWithLines = useMemo(() => {
    if (!showLines || !display) return outputHtml
    const lines = outputHtml.split("\n")
    const pad = String(lines.length).length
    return lines.map((l, i) => {
      const n = String(i + 1).padStart(pad, " ")
      return `<span class="devc-ln">${n}</span>${l}`
    }).join("\n")
  }, [outputHtml, showLines, display])

  const copyOut = useCallback(() => {
    if (!outText) return
    const toCopy = prettyJson ? (prettyOutText || outText) : outText
    navigator.clipboard?.writeText(toCopy).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }, [outText, prettyJson, prettyOutText])

  const saveOut = useCallback(async () => {
    if (!outText) return
    const isJson = outText.trim().startsWith("{") || outText.trim().startsWith("[")
    const filename = `deveval_${msg?.id?.slice(0, 8) || Date.now()}.${isJson ? "json" : "txt"}`
    try {
      if (window.api?.saveFile) {
        const r = await window.api.saveFile({ content: outText, filename })
        if (r?.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
      } else {
        const blob = new Blob([outText], { type: "text/plain" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a"); a.href = url; a.download = filename; a.click()
        setTimeout(() => URL.revokeObjectURL(url), 2000)
        setSaved(true); setTimeout(() => setSaved(false), 2000)
      }
    } catch {}
  }, [outText, msg])

  // SVG icons
  const IconCode     = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
  const IconCheck    = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
  const IconCopy     = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
  const IconSave     = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
  const IconExpand   = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
  const IconCollapse = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="21" y2="3"/><line x1="3" y1="21" x2="14" y2="10"/></svg>
  const IconPlay     = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
  const IconTrash    = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
  const IconSearch   = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
  const IconLines    = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
  const IconPin      = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
  const IconJson     = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M10 13l-2 2 2 2"/><path d="M14 13l2 2-2 2"/></svg>
  const IconGrid     = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
  const IconFilter   = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>

  // Template count per cat
  const tplCountByCat = useMemo(() => {
    const counts = {}
    for (const t of TEMPLATES) counts[t.cat] = (counts[t.cat] || 0) + 1
    return counts
  }, [])

  return (
    <div className="deveval-backdrop">
      <div className="deveval-modal">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="deveval-header">
          <div className="deveval-header-left">
            <div className="deveval-icon"><IconCode /></div>
            <div>
              <div className="deveval-title">Dev Eval</div>
              <div className="deveval-subtitle">
                <span style={{ color: "var(--green)", fontFamily: "monospace", fontSize: 10 }}>{msg?.msg_type || "–"}</span>
                &nbsp;·&nbsp;{(msg?.chat_jid || "–").slice(0, 30)}
                &nbsp;·&nbsp;<span style={{ fontFamily: "monospace", fontSize: 10, opacity: 0.5 }}>{(msg?.id || "–").slice(0, 14)}</span>
              </div>
            </div>
          </div>
          <div className="deveval-header-right">
            <button className={`deveval-mode-btn${showTpl ? " active" : ""}`}
              onClick={() => setShowTpl(v => !v)} title="Templates (browse & search)">
              <IconGrid />&nbsp;Templates
              <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>
                {TEMPLATES.length}
              </span>
            </button>
            <div className="deveval-mode-toggle">
              <button className={`deveval-mode-btn${mode === E ? " active" : ""}`} onClick={() => { setMode(E); setResult(null) }}>{"=>"}&nbsp;Expr</button>
              <button className={`deveval-mode-btn${mode === B ? " active" : ""}`} onClick={() => { setMode(B); setResult(null) }}>{"{}"}&nbsp;Block</button>
            </div>
            <button
              className={`deveval-close${confirmClose ? " confirm" : ""}`}
              onClick={() => { if (confirmClose) { onClose() } else { setConfirmClose(true); setTimeout(() => setConfirmClose(false), 3000) } }}
              title={confirmClose ? "Click again to close" : "Close (press Esc or click × twice)"}
            >
              {confirmClose
                ? <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.02em", whiteSpace: "nowrap" }}>close?</span>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
              }
            </button>
          </div>
        </div>

        {/* ── Template Panel ───────────────────────────────────────────── */}
        {showTpl && (
          <div className="deveval-tpl-panel">
            {/* Search bar */}
            <div className="deveval-tpl-search-bar">
              <IconFilter />
              <input
                ref={tplSearchRef}
                value={tplSearch}
                onChange={e => setTplSearch(e.target.value)}
                placeholder="Search templates… (label, code, category)"
                spellCheck={false}
                className="deveval-tpl-search-input"
              />
              {tplSearch && (
                <span style={{ fontSize: 11, opacity: 0.5, whiteSpace: "nowrap" }}>
                  {filteredTpls.length} result{filteredTpls.length !== 1 ? "s" : ""}
                </span>
              )}
              {tplSearch && (
                <button className="deveval-copy-btn" style={{ padding: "1px 6px" }}
                  onClick={() => { setTplSearch(""); tplSearchRef.current?.focus() }}>✕</button>
              )}
            </div>

            {/* Category tabs — hidden when searching */}
            {!tplSearch && (
              <div className="deveval-tpl-cats">
                {CATS.map(c => {
                  const meta = CAT_META[c]
                  return (
                    <button key={c}
                      className={`deveval-tpl-cat-btn${tab === c ? " active" : ""}`}
                      style={{ "--cat-color": meta.color }}
                      onClick={() => setTab(c)}
                      title={`${meta.label} (${tplCountByCat[c] || 0})`}>
                      <span className="cat-icon">{meta.icon}</span>
                      <span className="cat-label">{meta.label}</span>
                      <span className="cat-count">{tplCountByCat[c] || 0}</span>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Template grid */}
            <div className="deveval-tpl-grid">
              {filteredTpls.length === 0 ? (
                <div style={{ padding: "16px", opacity: 0.4, fontSize: 12, textAlign: "center" }}>
                  No templates match "{tplSearch}"
                </div>
              ) : filteredTpls.map(tpl => (
                <button key={`${tpl.cat}-${tpl.label}`}
                  className="deveval-tpl-item"
                  title={tpl.code.length > 100 ? tpl.code.slice(0, 100) + "…" : tpl.code}
                  onClick={() => applyTpl(tpl)}>
                  <span className="tpl-item-mode">{tpl.mode === B ? "{}" : "=>"}</span>
                  <span className="tpl-item-label">{tpl.label}</span>
                  {tplSearch && (
                    <span className="tpl-item-cat" style={{ "--cat-color": CAT_META[tpl.cat]?.color }}>
                      {CAT_META[tpl.cat]?.icon} {tpl.cat}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Context pills ───────────────────────────────────────────── */}
        <div className="deveval-ctx-bar" style={{ flexWrap: "wrap", gap: "4px 3px" }}>
          <span className="deveval-ctx-label">ctx:</span>
          {PILLS.map(p => (
            <button key={p.t} className="deveval-ctx-pill" title={p.d} onClick={() => insertAt(p.t)}>{p.t}</button>
          ))}
          {hIdx >= 0 && <span className="deveval-hist-indicator">↑ history {hIdx + 1}/{hist.length}</span>}
        </div>

        {/* ── Editor ──────────────────────────────────────────────────── */}
        <div className="deveval-editor-wrap">
          <div className="deveval-gutter" aria-hidden="true">
            {(code || " ").split("\n").map((_, i) => <div key={i} className="deveval-line-num">{i + 1}</div>)}
          </div>
          <textarea
            ref={edRef}
            className="deveval-editor"
            value={code}
            onChange={e => { setCode(e.target.value); setHIdx(-1) }}
            onKeyDown={onKeyDown}
            placeholder={mode === E
              ? "m                    // smsg-style object\nReflect.ownKeys(sock) // all socket keys\ndb.getChats(10, 0)    // db access"
              : "const meta = await sock.groupMetadata(m.chatId)\nreturn json(meta)"}
            spellCheck={false} autoCorrect="off" autoCapitalize="off" autoComplete="off"
            style={{ minHeight: 90 }}
          />
        </div>

        {/* ── Action bar ──────────────────────────────────────────────── */}
        <div className="deveval-action-bar">
          <div className="deveval-shortcuts">
            <span><kbd>Ctrl+Enter</kbd> Run</span>
            <span><kbd>Ctrl+L</kbd> Clear</span>
            <span><kbd>Alt+↑↓</kbd> History</span>
            <span><kbd>Ctrl+F</kbd> Search</span>
            <span><kbd>Tab</kbd> Indent</span>
            <span><kbd>Esc</kbd> Close</span>
          </div>
          <div className="deveval-action-btns">
            <button className="deveval-btn ghost" disabled={running}
              onClick={() => { setCode(""); setResult(null); setExecMs(null); edRef.current?.focus() }}>
              <IconTrash />&nbsp;Clear
            </button>
            <button className={`deveval-btn run${running ? " loading" : ""}`}
              onClick={run} disabled={running || !code.trim()}>
              {running ? <><span className="deveval-spinner" />Running…</> : <><IconPlay />&nbsp;Run</>}
            </button>
          </div>
        </div>

        {/* ── Output ──────────────────────────────────────────────────── */}
        {result !== null && (
          <div className={`deveval-output${result.ok ? "" : " error"}`}>
            <div className="deveval-output-header">
              {/* Status + meta */}
              <div className="deveval-output-status">
                {result.ok
                  ? <><IconCheck /><span style={{ color: "var(--green)" }}>OK</span>{result.type && <span className="deveval-output-type">: {result.type}</span>}</>
                  : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span style={{ color: "#ef4444" }}>Error</span></>
                }
                <span className="deveval-output-len">
                  {outText?.length?.toLocaleString()} chars
                  {isBig && <span style={{ color: "#f59e0b", marginLeft: 6, fontSize: 10 }}>showing {TRUNC.toLocaleString()}</span>}
                  {execMs !== null && <span style={{ color: "var(--muted, #666)", marginLeft: 8, fontSize: 10 }}>⏱ {execMs}ms</span>}
                </span>
              </div>

              {/* Toolbar */}
              <div className="deveval-output-toolbar">
                {outText && (
                  <button className={`deveval-copy-btn${prettyJson ? " copied" : ""}`}
                    onClick={() => setPrettyJson(v => !v)}
                    title={prettyJson ? "Show original output" : "Pretty-print as JSON"}
                    style={{ color: prettyJson ? "var(--green)" : isJsonOutput ? undefined : "rgba(255,255,255,0.3)" }}>
                    <IconJson />&nbsp;JSON
                  </button>
                )}
                <button className={`deveval-copy-btn${showSearch ? " copied" : ""}`}
                  onClick={() => { setShowSearch(v => { if (!v) setTimeout(() => searchRef.current?.focus(), 60); return !v }) }}
                  title="Search in output (Ctrl+F)">
                  <IconSearch />&nbsp;Search
                </button>
                <button className={`deveval-copy-btn${showLines ? " copied" : ""}`}
                  onClick={() => setShowLines(v => !v)}
                  title="Toggle line numbers">
                  <IconLines />&nbsp;Lines
                </button>
                <button className={`deveval-copy-btn${pinned ? " copied" : ""}`}
                  onClick={() => setPinned(p => p ? null : outText)}
                  title={pinned ? "Unpin" : "Pin output to compare"}>
                  <IconPin />&nbsp;{pinned ? "Unpin" : "Pin"}
                </button>
                {outText && outText.length > TRUNC && (
                  <button className="deveval-copy-btn" onClick={() => setFullView(v => !v)}
                    style={{ color: fullView ? "var(--green)" : undefined }}
                    title={fullView ? "Collapse output" : "Show full output"}>
                    {fullView ? <><IconCollapse />&nbsp;Collapse</> : <><IconExpand />&nbsp;Full</>}
                  </button>
                )}
                <button className={`deveval-copy-btn${saved ? " copied" : ""}`} onClick={saveOut} title="Save to file">
                  {saved ? <><IconCheck />&nbsp;Saved</> : <><IconSave />&nbsp;Save</>}
                </button>
                <button className={`deveval-copy-btn${copied ? " copied" : ""}`} onClick={copyOut} title="Copy output">
                  {copied ? <><IconCheck />&nbsp;Copied</> : <><IconCopy />&nbsp;Copy</>}
                </button>
              </div>
            </div>

            {/* Search bar */}
            {showSearch && (
              <div className="deveval-search-bar">
                <IconSearch />
                <input
                  ref={searchRef}
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  onKeyDown={onSearchKeyDown}
                  placeholder="Search in output…"
                  spellCheck={false}
                  className="deveval-search-input"
                />
                {searchQ && (
                  <span style={{ fontSize: 11, opacity: 0.6, whiteSpace: "nowrap" }}>
                    {matchCount === 0 ? "no match" : `${searchIdx + 1} / ${matchCount}`}
                  </span>
                )}
                <button className="deveval-copy-btn" onClick={() => setSearchIdx(i => (i - 1 + Math.max(1, matchCount)) % Math.max(1, matchCount))}
                  disabled={matchCount === 0} style={{ padding: "2px 6px" }} title="↑">↑</button>
                <button className="deveval-copy-btn" onClick={() => setSearchIdx(i => (i + 1) % Math.max(1, matchCount))}
                  disabled={matchCount === 0} style={{ padding: "2px 6px" }} title="↓">↓</button>
                <button className="deveval-copy-btn" onClick={() => { setShowSearch(false); setSearchQ(""); edRef.current?.focus() }}
                  style={{ padding: "2px 6px" }} title="Close (Esc)">✕</button>
              </div>
            )}

            {/* Output body */}
            <div ref={outRef} className="deveval-output-wrap"
              style={{ maxHeight: fullView ? "70vh" : "42vh", overflowY: "auto" }}>
              <pre className={`deveval-output-pre${showLines ? " has-lines" : ""}`}
                style={{ userSelect: "text", cursor: "text" }}
                dangerouslySetInnerHTML={{ __html: outputWithLines }} />
            </div>

            {/* Pinned compare */}
            {pinned && pinned !== outText && (
              <div style={{ borderTop: "1px solid var(--border)" }}>
                <div style={{ padding: "4px 10px", fontSize: 10, opacity: 0.5, display: "flex", justifyContent: "space-between" }}>
                  <span>📌 Pinned output</span>
                  <button className="deveval-copy-btn" style={{ fontSize: 10 }} onClick={() => setPinned(null)}>clear pin</button>
                </div>
                <div style={{ maxHeight: "20vh", overflowY: "auto" }}>
                  <pre className={`deveval-output-pre${showLines ? " has-lines" : ""}`}
                    style={{ opacity: 0.6, userSelect: "text", cursor: "text" }}
                    dangerouslySetInnerHTML={{ __html: colorize(pinned || "") }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Inline CSS ────────────────────────────────────────────────── */}
        <style>{`
          /* ── Search highlights ── */
          .devc-search-match { background: rgba(250,200,0,.35); border-radius: 2px; }
          .devc-search-current { background: rgba(250,200,0,.85); color: #000 !important; border-radius: 2px; }

          /* ── Line numbers ── */
          .devc-ln {
            display: inline-block; min-width: 3ch; margin-right: 12px;
            color: rgba(255,255,255,.2); user-select: none; -webkit-user-select: none;
            text-align: right; font-size: 0.9em;
          }
          .deveval-output-pre.has-lines { padding-left: 6px; }
          .deveval-output-pre { user-select: text; -webkit-user-select: text; cursor: text; }

          /* ── Template panel ── */
          .deveval-tpl-panel {
            border-bottom: 1px solid var(--border);
            background: rgba(0,0,0,.3);
            display: flex; flex-direction: column; gap: 0;
          }

          .deveval-tpl-search-bar {
            display: flex; align-items: center; gap: 7px;
            padding: 7px 12px; border-bottom: 1px solid rgba(255,255,255,.06);
            background: rgba(0,0,0,.15);
          }
          .deveval-tpl-search-input {
            flex: 1; background: transparent; border: none; outline: none;
            color: inherit; font-size: 12px; font-family: monospace;
          }
          .deveval-tpl-search-input::placeholder { opacity: 0.4; }

          .deveval-tpl-cats {
            display: flex; gap: 3px; padding: 7px 10px; flex-wrap: wrap;
            border-bottom: 1px solid rgba(255,255,255,.06);
          }
          .deveval-tpl-cat-btn {
            display: inline-flex; align-items: center; gap: 4px;
            padding: 3px 8px; border-radius: 5px; font-size: 11px; cursor: pointer;
            border: 1px solid transparent;
            background: rgba(255,255,255,.05); color: rgba(255,255,255,.55);
            transition: all 0.12s;
          }
          .deveval-tpl-cat-btn:hover {
            background: rgba(255,255,255,.1); color: rgba(255,255,255,.85);
            border-color: rgba(255,255,255,.12);
          }
          .deveval-tpl-cat-btn.active {
            background: rgba(var(--cat-color, 255,255,255), .12);
            border-color: var(--cat-color, rgba(255,255,255,.3));
            color: var(--cat-color, white);
          }
          .cat-icon { font-size: 12px; }
          .cat-label { font-weight: 500; }
          .cat-count {
            font-size: 10px; opacity: 0.55;
            background: rgba(255,255,255,.08); border-radius: 3px;
            padding: 0 4px; min-width: 16px; text-align: center;
          }
          .deveval-tpl-cat-btn.active .cat-count { opacity: 0.7; }

          .deveval-tpl-grid {
            display: flex; flex-wrap: wrap; gap: 4px;
            padding: 8px 10px; max-height: 180px; overflow-y: auto;
          }
          .deveval-tpl-item {
            display: inline-flex; align-items: center; gap: 5px;
            padding: 3px 9px 3px 7px; border-radius: 5px; font-size: 11px; cursor: pointer;
            background: rgba(255,255,255,.06); color: rgba(255,255,255,.65);
            border: 1px solid rgba(255,255,255,.08);
            transition: all 0.1s; text-align: left; max-width: 260px;
          }
          .deveval-tpl-item:hover {
            background: rgba(255,255,255,.13); color: rgba(255,255,255,.92);
            border-color: rgba(255,255,255,.18);
          }
          .tpl-item-mode {
            font-family: monospace; font-size: 10px; opacity: 0.45;
            flex-shrink: 0; width: 14px;
          }
          .tpl-item-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .tpl-item-cat {
            margin-left: auto; font-size: 10px; flex-shrink: 0;
            color: var(--cat-color, rgba(255,255,255,.4));
            border: 1px solid currentColor; border-radius: 3px;
            padding: 0 4px; opacity: 0.7;
          }

          /* ── Output toolbar — tighter ── */
          .deveval-output-toolbar {
            display: flex; gap: 3px; align-items: center; flex-wrap: wrap;
          }

          /* ── Output search bar ── */
          .deveval-search-bar {
            display: flex; align-items: center; gap: 6px;
            padding: 5px 10px; border-bottom: 1px solid var(--border);
            background: rgba(0,0,0,.2);
          }
          .deveval-search-input {
            flex: 1; background: transparent; border: none; outline: none;
            color: inherit; font-size: 12px; font-family: monospace;
          }

          /* ── Close button confirm state ── */
          .deveval-close.confirm {
            background: rgba(239,68,68,.18) !important;
            border-color: rgba(239,68,68,.55) !important;
            color: #fca5a5 !important;
            min-width: 58px;
            animation: deveval-close-pulse 0.25s ease;
          }
          .deveval-close.confirm:hover {
            background: rgba(239,68,68,.35) !important;
            border-color: rgba(239,68,68,.8) !important;
            color: #fee2e2 !important;
          }
          @keyframes deveval-close-pulse {
            0%   { transform: scale(1); }
            40%  { transform: scale(1.08); }
            100% { transform: scale(1); }
          }
        `}</style>
      </div>
    </div>
  )
})

export default DevEvalModal