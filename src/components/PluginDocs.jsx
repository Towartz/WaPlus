// src/components/PluginDocs.jsx — Redesigned UI/UX
import { useState, useRef, useCallback } from "react"

// ─── Inline CSS injected once ───────────────────────────────────────────────
const GLOBAL_CSS = `
  .pdoc * { box-sizing: border-box; }
  .pdoc ::-webkit-scrollbar { width: 5px; height: 5px; }
  .pdoc ::-webkit-scrollbar-track { background: transparent; }
  .pdoc ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
  .pdoc ::-webkit-scrollbar-thumb:hover { background: #484f58; }
  .pdoc-nav-btn { transition: background 0.12s, color 0.12s; }
  .pdoc-nav-btn:hover:not(.active) { background: rgba(255,255,255,0.05) !important; color: #c9d1d9 !important; }
  .pdoc-copy-btn { transition: all 0.15s; }
  .pdoc-copy-btn:hover { background: #21262d !important; color: #c9d1d9 !important; }
  .pdoc-hook-card { transition: border-color 0.15s, background 0.15s; }
  .pdoc-hook-card:hover { border-color: #30363d !important; }
  .pdoc-api-row { transition: background 0.1s; }
  .pdoc-api-row:hover { background: rgba(255,255,255,0.03) !important; }
  /* Syntax colors */
  .tok-k { color: #ff7b72; }
  .tok-s { color: #a5d6ff; }
  .tok-c { color: #6e7681; font-style: italic; }
  .tok-n { color: #79c0ff; }
  .tok-f { color: #d2a8ff; }
  .tok-p { color: #ffa657; }
`

// ─── Syntax highlighter ─────────────────────────────────────────────────────
function highlight(raw) {
  let s = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  s = s.replace(/(\/\/[^\n]*)/g, "\x00CM\x01$1\x02")
  s = s.replace(/(`[^`]*`)/g, "\x00TL\x01$1\x02")
  s = s.replace(/("(?:[^"\\]|\\.)*")/g, "\x00SQ\x01$1\x02")
  s = s.replace(/('(?:[^'\\]|\\.)*')/g, "\x00SQ\x01$1\x02")
  s = s.replace(/\b(\d+\.?\d*)\b/g, "\x00NU\x01$1\x02")
  s = s.replace(
    /\b(const|let|var|function|async|await|return|if|else|for|while|try|catch|throw|new|class|extends|import|export|default|require|module|typeof|instanceof|true|false|null|undefined|this|of|in|break|continue|switch|case)\b/g,
    "\x00KW\x01$1\x02"
  )
  s = s.replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g, "\x00FN\x01$1\x02")
  s = s.replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\s*:)/g, "\x00PR\x01$1\x02")

  s = s.replace(/\x00CM\x01([\s\S]*?)\x02/g, '<span class="tok-c">$1</span>')
  s = s.replace(/\x00TL\x01([\s\S]*?)\x02/g, '<span class="tok-s">$1</span>')
  s = s.replace(/\x00SQ\x01([\s\S]*?)\x02/g, '<span class="tok-s">$1</span>')
  s = s.replace(/\x00NU\x01([\s\S]*?)\x02/g, '<span class="tok-n">$1</span>')
  s = s.replace(/\x00KW\x01([\s\S]*?)\x02/g, '<span class="tok-k">$1</span>')
  s = s.replace(/\x00FN\x01([\s\S]*?)\x02/g, '<span class="tok-f">$1</span>')
  s = s.replace(/\x00PR\x01([\s\S]*?)\x02/g, '<span class="tok-p">$1</span>')
  return s
}

// ─── Code block with copy button ────────────────────────────────────────────
function CodeBlock({ code, lang = "js" }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    navigator.clipboard?.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  return (
    <div style={{
      position: "relative", borderRadius: 8, overflow: "hidden",
      border: "1px solid #21262d", background: "#010409", marginTop: 8,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "5px 12px", background: "#0a0e14", borderBottom: "1px solid #21262d",
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#484f58", letterSpacing: 1, textTransform: "uppercase", fontFamily: "monospace" }}>
          {lang}
        </span>
        <button
          className="pdoc-copy-btn"
          onClick={copy}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "2px 8px", borderRadius: 5,
            border: `1px solid ${copied ? "#2a4a2a" : "#30363d"}`,
            background: copied ? "#1a3a1a" : "#161b22",
            color: copied ? "#3fb950" : "#8b949e",
            cursor: "pointer", fontSize: 10.5, fontWeight: 500,
          }}
        >
          {copied ? <><CheckSVG /> Copied!</> : <><CopySVG /> Copy</>}
        </button>
      </div>
      <pre style={{
        margin: 0, padding: "14px 16px", overflowX: "auto",
        fontSize: 12, lineHeight: 1.75,
        fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code',Consolas,monospace",
        color: "#e6edf3",
      }}>
        <code dangerouslySetInnerHTML={{ __html: highlight(code) }} />
      </pre>
    </div>
  )
}

// ─── Chip / Badge ────────────────────────────────────────────────────────────
const CHIP = {
  "property":     ["#1c2a3a", "#1e4070", "#79c0ff"],
  "method":       ["#182818", "#1e4a1e", "#56d364"],
  "async method": ["#251a3a", "#3a1f6a", "#bc8cff"],
  "returns":      ["#182818", "#1e4a1e", "#3fb950"],
}
function Badge({ type, children }) {
  const [bg, bdr, clr] = CHIP[type] || ["#1a1a24", "#2d2d3d", "#8b949e"]
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "1px 8px", borderRadius: 20,
      fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3,
      background: bg, border: `1px solid ${bdr}`, color: clr, flexShrink: 0,
    }}>{children}</span>
  )
}

// ─── Callout banner ──────────────────────────────────────────────────────────
function Callout({ type = "info", children }) {
  const MAP = {
    warning: ["rgba(240,136,62,0.08)", "rgba(240,136,62,0.4)",  "#f0883e", "⚠️"],
    info:    ["rgba(88,166,255,0.07)", "rgba(88,166,255,0.35)", "#79c0ff", "ℹ️"],
    success: ["rgba(63,185,80,0.07)",  "rgba(63,185,80,0.35)",  "#3fb950", "✅"],
    lock:    ["rgba(188,140,255,0.07)","rgba(188,140,255,0.3)", "#bc8cff", "🔒"],
  }
  const [bg, bdr, , ico] = MAP[type]
  return (
    <div style={{
      display: "flex", gap: 8, alignItems: "flex-start",
      padding: "8px 12px", borderRadius: 7,
      background: bg, borderLeft: `3px solid ${bdr}`,
      fontSize: 12, lineHeight: 1.6, marginBottom: 8,
    }}>
      <span style={{ flexShrink: 0 }}>{ico}</span>
      <span style={{ color: "#c9d1d9" }}>{children}</span>
    </div>
  )
}

// ─── Expandable API entry ────────────────────────────────────────────────────
function ApiEntry({ name, type, returns, desc, example, note, info }) {
  const [open, setOpen] = useState(false)
  const hasExtra = example || note || info
  return (
    <div style={{ borderRadius: 8, border: "1px solid #21262d", overflow: "hidden", marginBottom: 5 }}>
      <div
        className="pdoc-api-row"
        onClick={() => hasExtra && setOpen(o => !o)}
        style={{ padding: "10px 14px", cursor: hasExtra ? "pointer" : "default", userSelect: "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 5 }}>
          <code style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", color: "#79c0ff", fontSize: 12.5, fontWeight: 700 }}>
            {name}
          </code>
          {type && <Badge type={type}>{type}</Badge>}
          {returns && <Badge type="returns">→ {returns}</Badge>}
          {hasExtra && (
            <span style={{
              marginLeft: "auto", color: "#484f58", flexShrink: 0,
              transform: open ? "rotate(180deg)" : "none",
              transition: "transform 0.15s", display: "flex",
            }}><ChevronSVG /></span>
          )}
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: "#8b949e", lineHeight: 1.55 }}>{desc}</p>
      </div>
      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid #21262d", background: "#080c12" }}>
          {note && <div style={{ paddingTop: 10 }}><Callout type="warning">{note}</Callout></div>}
          {info && <div style={{ paddingTop: 10 }}><Callout type="info">{info}</Callout></div>}
          {example && <CodeBlock code={example} />}
        </div>
      )}
    </div>
  )
}

// ─── Section wrapper ─────────────────────────────────────────────────────────
function DocSection({ id, icon, title, accent = "#30363d", children }) {
  return (
    <div id={`pdoc-${id}`} style={{ marginBottom: 32 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid #21262d",
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 7, flexShrink: 0,
          background: `${accent}18`, border: `1px solid ${accent}30`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
        }}>{icon}</div>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#e6edf3" }}>{title}</h2>
      </div>
      <div>{children}</div>
    </div>
  )
}

// ─── Hook card ───────────────────────────────────────────────────────────────
function HookCard({ hook: h }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="pdoc-hook-card" style={{
      borderRadius: 8, border: `1px solid ${h.color}22`,
      background: "#0a0e14", marginBottom: 5, overflow: "hidden",
    }}>
      <div onClick={() => setOpen(o => !o)} style={{ padding: "10px 14px", cursor: "pointer", userSelect: "none" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              width: 26, height: 26, borderRadius: 6, flexShrink: 0,
              background: `${h.color}18`, border: `1px solid ${h.color}30`,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
            }}>{h.emoji}</span>
            <code style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", color: h.color, fontSize: 12.5, fontWeight: 700 }}>
              {h.sig}
            </code>
          </div>
          <span style={{
            color: "#484f58", transition: "transform 0.15s",
            transform: open ? "rotate(180deg)" : "none", display: "flex",
          }}><ChevronSVG /></span>
        </div>
        <p style={{ margin: "5px 0 0 34px", fontSize: 12, color: "#8b949e", lineHeight: 1.55 }}>{h.desc}</p>
      </div>
      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid #21262d" }}>
          {h.note && <div style={{ paddingTop: 10 }}><Callout type="warning">{h.note}</Callout></div>}
          <CodeBlock code={h.example} />
        </div>
      )}
    </div>
  )
}

// ─── inline code helper ──────────────────────────────────────────────────────
const IC = {
  fontFamily: "'JetBrains Mono','Fira Code',monospace",
  background: "#21262d", border: "1px solid #30363d",
  padding: "1px 5px", borderRadius: 4, fontSize: 11.5, color: "#79c0ff",
}

// ─── Data ────────────────────────────────────────────────────────────────────
const HOOKS = [
  { id: "onLoad", emoji: "🟢", color: "#3fb950", sig: "async onLoad(ctx)",
    desc: "Dipanggil sekali saat plugin diaktifkan / startup. Init state, timer, dan baca config awal.",
    example: `async onLoad(ctx) {\n  const cfg = await ctx.storage.get("config") || {}\n  ctx.log("Plugin ready! Config:", JSON.stringify(cfg))\n}`, note: null },
  { id: "onUnload", emoji: "🔴", color: "#f85149", sig: "async onUnload(ctx)",
    desc: "Saat plugin dinonaktifkan / shutdown. Bersihkan timer, koneksi, dan semua resource.",
    example: `async onUnload(ctx) {\n  clearInterval(myTimer)\n  ctx.log("Cleanup done.")\n}`, note: null },
  { id: "onMessage", emoji: "💬", color: "#58a6ff", sig: "async onMessage(parsed, rawMsg, ctx)",
    desc: "Setiap pesan masuk/keluar. Return false → blokir dari DB & UI. Return object → modifikasi parsed.",
    example: `async onMessage(parsed, rawMsg, ctx) {\n  // parsed: { id, chat_jid, sender_jid, sender_name,\n  //   body, msg_type, from_me, timestamp,\n  //   has_media, quoted_id, is_group }\n\n  if (!parsed.from_me && parsed.body?.includes("halo")) {\n    await ctx.sendText(parsed.chat_jid, "Halo juga!")\n    // return false               → blokir, tidak masuk DB/UI\n    // return { ...parsed, body } → modifikasi sebelum disimpan\n  }\n}`,
    note: "return false — pesan tidak akan muncul di UI sama sekali." },
  { id: "onBeforeSend", emoji: "📤", color: "#f0883e", sig: "async onBeforeSend(jid, payload, ctx)",
    desc: "Sebelum pesan dikirim user manual. Return false → batalkan. Return modified payload → inject.",
    example: `async onBeforeSend(jid, payload, ctx) {\n  if (payload.text) {\n    return { ...payload, text: payload.text + "\\n\\n_Sent via WaPlus_" }\n  }\n  return payload  // ← wajib return payload!\n  // return false  → batalkan pengiriman\n}`,
    note: "Tidak berlaku untuk pesan yang dikirim via ctx.sendText() dari plugin lain." },
  { id: "onAfterSend", emoji: "✅", color: "#3fb950", sig: "async onAfterSend(jid, payload, sentMsg, ctx)",
    desc: "Setelah pesan berhasil terkirim. sentMsg berisi response Baileys (key.id, dll).",
    example: `async onAfterSend(jid, payload, sentMsg, ctx) {\n  ctx.log("Terkirim ke", jid, "msgId:", sentMsg?.key?.id)\n}`, note: null },
  { id: "onConnect", emoji: "🌐", color: "#3fb950", sig: "async onConnect(info, ctx)",
    desc: "WhatsApp berhasil connect / reconnect.",
    example: `async onConnect(info, ctx) {\n  // info: { name, jid, phone, platform }\n  ctx.log("Connected sebagai", info.name)\n}`, note: null },
  { id: "onDisconnect", emoji: "⛔", color: "#f85149", sig: "async onDisconnect(reason, ctx)",
    desc: "Koneksi WhatsApp terputus.",
    example: `async onDisconnect(reason, ctx) {\n  ctx.log("Disconnected, reason:", reason)\n}`, note: null },
  { id: "onConfigChange", emoji: "⚙️", color: "#a78bfa", sig: "async onConfigChange(newValues, ctx)",
    desc: "User simpan settings plugin di ModManager. Biasanya simpan ke storage supaya onLoad bisa baca.",
    example: `async onConfigChange(newValues, ctx) {\n  await ctx.storage.set("config", newValues)\n  ctx.log("Config updated:", JSON.stringify(newValues))\n}`, note: null },
]

const NAV = [
  { id: "quickstart", label: "Quick Start",  icon: "🚀", accent: "#3fb950", tags: "start contoh mulai" },
  { id: "hooks",      label: "Hooks",        icon: "🪝", accent: "#58a6ff", tags: "hook onload onmessage onbeforesend onaftersend onconnect ondisconnect onconfigchange" },
  { id: "props",      label: "Properties",   icon: "🔌", accent: "#79c0ff", tags: "sock socket baileys pluginid property" },
  { id: "send",       label: "Send Helpers", icon: "📨", accent: "#3fb950", tags: "send text image video audio kirim" },
  { id: "db",         label: "Database",     icon: "🗄️", accent: "#f0883e", tags: "db database sqlite getdb" },
  { id: "ui",         label: "UI Bridge",    icon: "🖥️", accent: "#a78bfa", tags: "ui renderer sendtoui ipc" },
  { id: "storage",    label: "Storage",      icon: "💾", accent: "#58a6ff", tags: "storage persist save data" },
  { id: "logging",    label: "Logging",      icon: "📝", accent: "#f0883e", tags: "log logging debug error warn" },
  { id: "require",    label: "require()",    icon: "📦", accent: "#a78bfa", tags: "require sandbox module fs path crypto" },
  { id: "example",    label: "Full Example", icon: "💡", accent: "#f0883e", tags: "example contoh plugin template" },
]

// ─── SVG icons ───────────────────────────────────────────────────────────────
const CopySVG    = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
const CheckSVG   = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
const ChevronSVG = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
const SearchSVG  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
const CloseSVG   = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>

// ─── Content ─────────────────────────────────────────────────────────────────
function AllContent({ q }) {
  const show = (id, tags) => q ? (id.includes(q) || tags.includes(q)) : true

  return (
    <>
      {show("quickstart", "start contoh") && (
        <DocSection id="quickstart" icon="🚀" title="Quick Start" accent="#3fb950">
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#8b949e", lineHeight: 1.65 }}>
            Plugin adalah CommonJS module yang di-export dari <code style={IC}>index.js</code>. Setiap hook menerima <code style={IC}>ctx</code>.
          </p>
          <Callout type="success">
            Buat folder di <code>userData/plugins/nama-plugin/</code> → isi <code>index.js</code> + <code>manifest.json</code> → aktifkan di ModManager.
          </Callout>
          <CodeBlock code={`// userData/plugins/hello-world/index.js\nmodule.exports = {\n  async onLoad(ctx) {\n    ctx.log("Plugin aktif!")\n  },\n\n  async onMessage(parsed, rawMsg, ctx) {\n    if (!parsed.from_me && parsed.body === "ping") {\n      await ctx.sendText(parsed.chat_jid, "pong! 🏓")\n    }\n  },\n}`} />
          <CodeBlock code={`{\n  "id": "hello-world",\n  "name": "Hello World",\n  "version": "1.0.0",\n  "hooks": ["onLoad", "onMessage"]\n}`} lang="json" />
        </DocSection>
      )}

      {show("hooks", "hook onload onmessage onbeforesend") && (
        <DocSection id="hooks" icon="🪝" title="Hooks" accent="#58a6ff">
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#8b949e", lineHeight: 1.65 }}>
            Dipanggil otomatis pada event tertentu. Semua bersifat <code style={IC}>async</code>. Klik untuk expand contoh.
          </p>
          {HOOKS.filter(h => !q || h.id.toLowerCase().includes(q) || h.desc.toLowerCase().includes(q))
            .map(h => <HookCard key={h.id} hook={h} />)}
        </DocSection>
      )}

      {show("props", "sock socket baileys pluginid") && (
        <DocSection id="props" icon="🔌" title="Properties" accent="#79c0ff">
          <ApiEntry name="ctx.sock" type="property" returns="BaileysSocket | null"
            desc="Full Baileys WebSocket. Semua Baileys API tersedia langsung."
            example={`await ctx.sock.sendMessage("628xxx@s.whatsapp.net", { text: "halo" })\n\nconst isOpen = ctx.sock.ws?.readyState === 1\n\nctx.sock.ev.on("messages.upsert", ({ messages }) => {\n  for (const msg of messages) ctx.log(msg.key.id)\n})`} />
          <ApiEntry name="ctx.pluginId" type="property" returns="string"
            desc="ID unik plugin ini. Otomatis di-prefix di output ctx.log."
            example={`ctx.log("Running")\n// → [Plugin:hello-world] Running`} />
          <ApiEntry name="ctx.baileys" type="property" returns="BaileysModule"
            desc="Export langsung dari Baileys (wileys fork). Akses constants, proto, JID utils."
            example={`const { jidDecode, areJidsSameUser } = ctx.baileys\nconst { user, server } = jidDecode("628xxx@s.whatsapp.net")\nctx.log(user, server)  // → 628xxx  s.whatsapp.net`} />
        </DocSection>
      )}

      {show("send", "send text image video audio kirim") && (
        <DocSection id="send" icon="📨" title="Send Helpers" accent="#3fb950">
          <Callout type="warning">
            Pesan via helpers ini <strong>tidak melewati onBeforeSend</strong> plugin lain. Untuk full hook chain, pakai <code>ctx.sock.sendMessage()</code>.
          </Callout>
          <ApiEntry name="ctx.sendText(jid, text)" type="method" returns="Promise"
            desc="Kirim pesan teks ke JID."
            example={`await ctx.sendText("628xxx@s.whatsapp.net", "Halo dari plugin!")\nawait ctx.sendText("120363xxx@g.us", "Pesan ke grup")`} />
          <ApiEntry name="ctx.sendImage(jid, img, caption?)" type="method" returns="Promise"
            desc="Kirim gambar. img bisa URL string atau Buffer. caption opsional."
            example={`await ctx.sendImage(jid, "https://example.com/img.jpg", "Caption")\n\nconst fs  = ctx.require("fs")\nconst buf = fs.readFileSync("/path/to/img.jpg")\nawait ctx.sendImage(jid, buf, "Foto")`} />
          <ApiEntry name="ctx.sendVideo(jid, vid, caption?)" type="method" returns="Promise"
            desc="Kirim video. vid bisa URL string atau Buffer."
            example={`await ctx.sendVideo(jid, "https://example.com/video.mp4", "Video")`} />
          <ApiEntry name="ctx.sendAudio(jid, aud, ptt?)" type="method" returns="Promise"
            desc="Kirim audio. ptt=true → Voice Note (PTT). Default false."
            example={`await ctx.sendAudio(jid, audioBuffer)       // audio biasa\nawait ctx.sendAudio(jid, oggBuffer, true)   // voice note`} />
        </DocSection>
      )}

      {show("db", "db database sqlite getdb") && (
        <DocSection id="db" icon="🗄️" title="Database Access" accent="#f0883e">
          <ApiEntry name="ctx.getDB()" type="method" returns="DatabaseModule | null"
            desc="Instance better-sqlite3. Returns null jika tidak tersedia — selalu cek dulu."
            example={`const db = ctx.getDB()\nif (!db) return ctx.logE("DB tidak tersedia")\n\nconst msgs    = db.getMessages("628xxx@s.whatsapp.net", { limit: 10 })\nconst contact = db.getContact("628xxx@s.whatsapp.net")\n\n// Raw SQL (hati-hati!)\nconst rows = db.db\n  .prepare("SELECT * FROM messages WHERE body LIKE ?")\n  .all("%keyword%")`} />
        </DocSection>
      )}

      {show("ui", "ui renderer sendtoui ipc") && (
        <DocSection id="ui" icon="🖥️" title="UI / Renderer Bridge" accent="#a78bfa">
          <ApiEntry name="ctx.sendToUI(channel, data)" type="method" returns="void"
            desc="Kirim data ke React renderer via Electron IPC. Di renderer gunakan window.api.on() untuk menerima."
            example={`// Plugin (main process)\nctx.sendToUI("plugin:notify", {\n  type: "success",\n  message: "Auto-reply terkirim!",\n  timestamp: Date.now(),\n})\n\n// Komponen React (renderer)\nuseEffect(() => {\n  const unsub = window.api.on("plugin:notify", (data) => {\n    console.log("Notif:", data.message)\n  })\n  return () => unsub()\n}, [])`} />
        </DocSection>
      )}

      {show("storage", "storage persist save data") && (
        <DocSection id="storage" icon="💾" title="Per-Plugin Storage" accent="#58a6ff">
          <Callout type="info">Data disimpan ke <code>userData/plugins/[pluginId]/data.json</code>. Persistent antar restart.</Callout>
          <ApiEntry name="ctx.storage.get(key)" type="async method" returns="Promise<any>"
            desc="Baca satu nilai. Returns undefined jika key tidak ada."
            example={`const config  = await ctx.storage.get("config")\nconst counter = (await ctx.storage.get("counter")) ?? 0`} />
          <ApiEntry name="ctx.storage.set(key, value)" type="async method" returns="Promise<void>"
            desc="Simpan nilai. Bisa string, number, object, atau array."
            example={`await ctx.storage.set("config", { keyword: "halo", reply: "Halo!" })\nawait ctx.storage.set("counter", counter + 1)`} />
          <ApiEntry name="ctx.storage.delete(key)" type="async method" returns="Promise<void>"
            desc="Hapus satu key." example={`await ctx.storage.delete("old_cache")`} />
          <ApiEntry name="ctx.storage.getAll()" type="async method" returns="Promise<object>"
            desc="Ambil semua data sebagai satu object."
            example={`const all = await ctx.storage.getAll()\nctx.log(JSON.stringify(all, null, 2))`} />
          <ApiEntry name="ctx.storage.clear()" type="async method" returns="Promise<void>"
            desc="Reset semua data storage ke {}." example={`await ctx.storage.clear()`} />
        </DocSection>
      )}

      {show("logging", "log logging debug error warn") && (
        <DocSection id="logging" icon="📝" title="Logging" accent="#f0883e">
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#8b949e" }}>
            Semua log otomatis di-prefix di Electron DevTools console.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 14 }}>
            {[
              ["ctx.log(...args)",  "INFO",  "[Plugin:id]",       "#3fb950"],
              ["ctx.logE(...args)", "ERROR", "[Plugin:id][ERR]",  "#f85149"],
              ["ctx.logW(...args)", "WARN",  "[Plugin:id][WARN]", "#f0883e"],
            ].map(([fn, level, prefix, color]) => (
              <div key={fn} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "8px 14px", borderRadius: 8,
                background: "#0a0e14", borderLeft: `3px solid ${color}55`,
                border: `1px solid ${color}18`,
              }}>
                <code style={{ color, fontFamily: "monospace", fontSize: 12.5, fontWeight: 700, minWidth: 165 }}>{fn}</code>
                <span style={{
                  padding: "1px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700,
                  background: `${color}18`, border: `1px solid ${color}35`, color,
                }}>{level}</span>
                <code style={{ fontSize: 11, color: "#484f58", fontFamily: "monospace" }}>{prefix}</code>
              </div>
            ))}
          </div>
          <CodeBlock code={`ctx.log("Diproses:", parsed.body)\n// → [Plugin:auto-reply] Diproses: halo\n\nctx.logE("Gagal kirim:", err.message)\n// → [Plugin:auto-reply][ERR] Gagal kirim: Network timeout\n\nctx.logW("Retry ke-", retryCount)\n// → [Plugin:auto-reply][WARN] Retry ke- 3`} />
        </DocSection>
      )}

      {show("require", "require sandbox module fs path crypto") && (
        <DocSection id="require" icon="📦" title="Sandboxed require()" accent="#a78bfa">
          <Callout type="lock">
            Hanya modul Node built-in yang aman. <code>child_process</code>, <code>http</code>, <code>net</code> diblokir.
          </Callout>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>
            {["path","fs","crypto","os","url","util","events","stream","buffer","querystring"].map(m => (
              <code key={m} style={{
                padding: "2px 9px", borderRadius: 5,
                background: "#21262d", border: "1px solid #30363d",
                color: "#79c0ff", fontSize: 12, fontFamily: "monospace",
              }}>{m}</code>
            ))}
          </div>
          <ApiEntry name="ctx.require(moduleName)" type="method" returns="NodeModule"
            desc="Akses Node.js built-in module yang diizinkan."
            example={`const path   = ctx.require("path")\nconst fs     = ctx.require("fs")\nconst crypto = ctx.require("crypto")\n\nconst hash = crypto.createHash("sha256").update("test").digest("hex")\n\nconst data = fs.readFileSync(\n  path.join(process.cwd(), "electron/mods/plugins", ctx.pluginId, "data.json"),\n  "utf8"\n)`} />
        </DocSection>
      )}

      {show("example", "example contoh plugin template") && (
        <DocSection id="example" icon="💡" title="Full Example Plugin" accent="#f0883e">
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#8b949e", lineHeight: 1.65 }}>
            Plugin auto-reply keyword dengan config dari ModManager UI:
          </p>
          <CodeBlock code={`// userData/plugins/auto-reply/index.js\nconst DEFAULT = { keyword: "ping", reply: "pong! 🏓" }\n\nmodule.exports = {\n  async onLoad(ctx) {\n    const cfg = await ctx.storage.get("config") || DEFAULT\n    ctx.log("Ready! Keyword:", cfg.keyword)\n  },\n\n  async onMessage(parsed, rawMsg, ctx) {\n    if (parsed.from_me) return\n    const cfg = await ctx.storage.get("config") || DEFAULT\n    if (parsed.body?.toLowerCase() === cfg.keyword.toLowerCase()) {\n      await ctx.sendText(parsed.chat_jid, cfg.reply)\n      ctx.log("Auto-replied ke", parsed.sender_jid)\n    }\n  },\n\n  async onConfigChange(newValues, ctx) {\n    await ctx.storage.set("config", newValues)\n    ctx.log("Config updated:", JSON.stringify(newValues))\n  },\n}`} />
          <CodeBlock code={`{\n  "id": "auto-reply",\n  "name": "Auto Reply",\n  "version": "1.0.0",\n  "hooks": ["onLoad", "onMessage", "onConfigChange"],\n  "settings": [\n    { "key": "keyword", "type": "text", "label": "Keyword", "default": "ping"    },\n    { "key": "reply",   "type": "text", "label": "Balasan", "default": "pong! 🏓" }\n  ]\n}`} lang="json" />
        </DocSection>
      )}
    </>
  )
}

// ─── Root export ─────────────────────────────────────────────────────────────
export default function PluginDocs({ onClose, inline = false }) {
  const [search, setSearch] = useState("")
  const [active, setActive] = useState("quickstart")
  const scrollRef = useRef(null)

  const q = search.toLowerCase().trim()

  const goTo = (id) => {
    setActive(id)
    setSearch("")
    setTimeout(() => {
      const el = document.getElementById(`pdoc-${id}`)
      if (el && scrollRef.current) {
        scrollRef.current.scrollTo({ top: el.offsetTop - 12, behavior: "smooth" })
      }
    }, 20)
  }

  const body = (
    <div className="pdoc" style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: "#0d1117", color: "#c9d1d9",
      fontFamily: "-apple-system,'Segoe UI',system-ui,sans-serif",
    }}>
      <style>{GLOBAL_CSS}</style>

      {/* HEADER */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "11px 16px", borderBottom: "1px solid #21262d", flexShrink: 0,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 7, flexShrink: 0,
          background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.25)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
        }}>📚</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#e6edf3", lineHeight: 1.2 }}>Plugin Context API</div>
          <div style={{ fontSize: 11, color: "#484f58" }}>
            Semua API tersedia di objek <code style={{ ...IC, fontSize: 10 }}>ctx</code>
          </div>
        </div>
        {/* search box */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "#161b22", border: "1px solid #30363d",
          borderRadius: 7, padding: "5px 10px", width: 185,
        }}>
          <span style={{ color: "#484f58", flexShrink: 0, display: "flex" }}><SearchSVG /></span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari API..."
            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#c9d1d9", fontSize: 12.5 }}
          />
          {search && (
            <button onClick={() => setSearch("")}
              style={{ background: "none", border: "none", color: "#484f58", cursor: "pointer", padding: 0, display: "flex" }}>
              <CloseSVG />
            </button>
          )}
        </div>
        {/* close */}
        {onClose && (
          <button onClick={onClose}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: 7,
              background: "#161b22", border: "1px solid #30363d",
              color: "#8b949e", cursor: "pointer", flexShrink: 0,
              transition: "all 0.12s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#21262d"; e.currentTarget.style.color = "#e6edf3" }}
            onMouseLeave={e => { e.currentTarget.style.background = "#161b22"; e.currentTarget.style.color = "#8b949e" }}
          >
            <CloseSVG />
          </button>
        )}
      </div>

      {/* BODY */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* SIDEBAR — hide when searching */}
        {!q && (
          <nav style={{
            width: 175, flexShrink: 0, background: "#0d1117",
            borderRight: "1px solid #21262d", display: "flex", flexDirection: "column",
          }}>
            <div style={{
              padding: "10px 10px 5px",
              fontSize: 9.5, fontWeight: 700, color: "#484f58",
              letterSpacing: 0.9, textTransform: "uppercase",
            }}>Sections</div>
            <div style={{ flex: 1, overflowY: "auto", padding: "2px 6px 8px" }}>
              {NAV.map(n => {
                const isActive = active === n.id
                return (
                  <button
                    key={n.id}
                    className="pdoc-nav-btn"
                    onClick={() => goTo(n.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      width: "100%", padding: "7px 10px", borderRadius: 7,
                      border: "none", cursor: "pointer", textAlign: "left",
                      fontSize: 12.5, fontWeight: isActive ? 600 : 400,
                      background: isActive ? "#161b22" : "transparent",
                      color: isActive ? "#e6edf3" : "#8b949e",
                      marginBottom: 1,
                    }}
                  >
                    <span style={{
                      width: 20, height: 20, borderRadius: 5, fontSize: 11, flexShrink: 0,
                      background: isActive ? `${n.accent}18` : "transparent",
                      border: isActive ? `1px solid ${n.accent}30` : "1px solid transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{n.icon}</span>
                    {n.label}
                    {isActive && (
                      <div style={{ marginLeft: "auto", width: 4, height: 4, borderRadius: "50%", background: n.accent }} />
                    )}
                  </button>
                )
              })}
            </div>
          </nav>
        )}

        {/* MAIN SCROLL */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "20px 22px 40px" }}>
          {/* when searching show all matching, else only active section */}
          {q
            ? <AllContent q={q} />
            : <AllContent q={null} activeOnly={active} />
          }

          {/* no results */}
          {q && !NAV.some(n => n.id.includes(q) || n.tags.includes(q)) && (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#484f58" }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>🔍</div>
              <div style={{ fontSize: 14, color: "#8b949e", marginBottom: 4 }}>
                Tidak ada hasil untuk <strong style={{ color: "#c9d1d9" }}>"{search}"</strong>
              </div>
              <div style={{ fontSize: 12 }}>Coba kata kunci lain: "send", "hook", "storage"</div>
            </div>
          )}
        </div>
      </div>

      {/* FOOTER */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "7px 16px", borderTop: "1px solid #21262d",
        fontSize: 11, color: "#484f58", flexShrink: 0,
      }}>
        <span>AuroraChat Plugin API — ctx v10</span>
        <div style={{ display: "flex", gap: 8 }}>
          {[["property","#79c0ff","#1c2a3a"],["method","#56d364","#182818"],["async method","#bc8cff","#251a3a"]].map(([lbl,clr,bg]) => (
            <span key={lbl} style={{
              padding: "1px 7px", borderRadius: 20, fontSize: 10,
              background: bg, border: `1px solid ${clr}30`, color: clr, fontWeight: 600,
            }}>{lbl}</span>
          ))}
        </div>
      </div>
    </div>
  )

  if (inline || !onClose) return <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>{body}</div>

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9998,
        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
      onClick={e => e.target === e.currentTarget && onClose?.()}
    >
      <div style={{
        width: "100%", maxWidth: 860, height: "88vh",
        borderRadius: 12, overflow: "hidden",
        boxShadow: "0 32px 100px rgba(0,0,0,0.85), 0 0 0 1px #30363d",
      }}>
        {body}
      </div>
    </div>
  )
}