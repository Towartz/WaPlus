#!/usr/bin/env node
/**
 * scripts/dist-all.js
 *
 * Orchestrator: build AuroraChat untuk semua platform (win32, linux, darwin)
 * dalam 1 command dengan inject binary yang benar per platform.
 *
 * Flow per platform:
 *   1. inject binary yang sesuai (win32/linux/darwin)
 *   2. electron-builder --{platform} --config.npmRebuild=false
 *
 * Sebelum looping platform:
 *   - vite build (sekali)
 *   - obfuscate (sekali, jika --secure)
 *
 * Usage:
 *   node scripts/dist-all.js                          → build semua platform
 *   node scripts/dist-all.js --secure                 → + obfuscate dulu
 *   node scripts/dist-all.js --platforms win32,linux  → pilih platform
 *   node scripts/dist-all.js --dry-run                → print steps tanpa eksekusi
 *   node scripts/dist-all.js --skip-build             → skip vite build (pakai dist/ yang ada)
 *   node scripts/dist-all.js --skip-inject            → skip inject (pakai binary yang ada)
 *   node scripts/dist-all.js --force-inject           → force re-download semua binary
 */

"use strict"

const { execSync, spawnSync } = require("child_process")
const path  = require("path")
const fs    = require("fs")
const os    = require("os")

// ── Logger ─────────────────────────────────────────────────────────────────────
const c = {
  reset  : "\x1b[0m",
  bold   : "\x1b[1m",
  red    : "\x1b[31m",
  green  : "\x1b[32m",
  yellow : "\x1b[33m",
  cyan   : "\x1b[36m",
  magenta: "\x1b[35m",
  blue   : "\x1b[34m",
  gray   : "\x1b[90m",
}

const TAG   = `${c.magenta}[dist-all]${c.reset}`
const log   = (msg) => console.log(`${TAG} ${msg}`)
const ok    = (msg) => console.log(`${c.green}${TAG} ✅${c.reset} ${msg}`)
const warn  = (msg) => console.warn(`${c.yellow}${TAG} ⚠️${c.reset}  ${msg}`)
const info  = (msg) => console.log(`${c.cyan}${TAG} ℹ️${c.reset}  ${msg}`)
const step  = (msg) => console.log(`\n${c.bold}${c.blue}${TAG} ▶ ${msg}${c.reset}`)
const die   = (msg) => { console.error(`${c.red}${TAG} ❌${c.reset} ${msg}`); process.exit(1) }
const sep   = ()    => console.log(`${c.gray}${"─".repeat(60)}${c.reset}`)

// ── Parse CLI ──────────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2)
  const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 && args[i+1] ? args[i+1] : null }
  const has  = (flag) => args.includes(flag)

  const platformsRaw = get("--platforms")
  const platforms    = platformsRaw
    ? platformsRaw.split(",").map(p => p.trim().toLowerCase()).map(p =>
        p === "win" ? "win32" : p === "mac" || p === "macos" ? "darwin" : p
      )
    : ["win32", "linux", "darwin"]

  return {
    platforms,
    secure      : has("--secure"),
    dryRun      : has("--dry-run"),
    skipBuild   : has("--skip-build"),
    skipInject  : has("--skip-inject"),
    forceInject : has("--force-inject"),
  }
}

// ── Platform config ────────────────────────────────────────────────────────────
const PLATFORM_CONFIG = {
  win32  : { flag: "--win",   arch: "x64", label: "Windows", icon: "🪟" },
  linux  : { flag: "--linux", arch: "x64", label: "Linux",   icon: "🐧" },
  darwin : { flag: "--mac",   arch: "x64", label: "macOS",   icon: "🍎" },
}

// ── Timing helper ──────────────────────────────────────────────────────────────
function elapsed(startMs) {
  const s = ((Date.now() - startMs) / 1000).toFixed(1)
  return `${c.gray}(${s}s)${c.reset}`
}

// ── Run command ────────────────────────────────────────────────────────────────
function run(cmd, opts = {}) {
  const { dryRun = false, cwd = process.cwd(), label = cmd } = opts
  log(`${c.gray}$ ${cmd}${c.reset}`)
  if (dryRun) {
    info(`[dry-run] skipped: ${label}`)
    return
  }
  const t = Date.now()
  const result = spawnSync(cmd, { shell: true, cwd, stdio: "inherit", env: process.env })
  if (result.status !== 0) {
    die(`Command gagal (exit ${result.status}): ${cmd}`)
  }
  log(`${c.green}done${c.reset} ${elapsed(t)}`)
}

// ── Check tool availability ────────────────────────────────────────────────────
function checkTools() {
  const tools = ["node", "npm"]
  for (const t of tools) {
    try { execSync(`${t} --version`, { stdio: "pipe" }) }
    catch { die(`Tool tidak ditemukan: ${t}`) }
  }
}

// ── Check script files exist ───────────────────────────────────────────────────
function checkScripts(root, opts) {
  const injectScript = path.join(root, "scripts/inject-win-sqlite.js")
  if (!opts.skipInject && !fs.existsSync(injectScript)) {
    die(`Inject script tidak ditemukan: ${injectScript}`)
  }
  if (opts.secure) {
    const obfScript = path.join(root, "scripts/obfuscate.js")
    if (!fs.existsSync(obfScript)) {
      warn(`Obfuscate script tidak ditemukan: ${obfScript}`)
      warn("--secure akan di-skip untuk obfuscate step.")
      return false
    }
  }
  return true
}

// ── Print banner ───────────────────────────────────────────────────────────────
function printBanner(opts) {
  console.log()
  console.log(`${c.magenta}╔══════════════════════════════════════════════════╗${c.reset}`)
  console.log(`${c.magenta}║${c.reset}  ${c.bold}AuroraChat dist-all  v1.0${c.reset}                       ${c.magenta}║${c.reset}`)
  console.log(`${c.magenta}╚══════════════════════════════════════════════════╝${c.reset}`)
  console.log()
  console.log(`  Platforms    : ${c.yellow}${opts.platforms.map(p => PLATFORM_CONFIG[p]?.label || p).join(", ")}${c.reset}`)
  console.log(`  Secure mode  : ${c.yellow}${opts.secure ? "YES (obfuscate)" : "no"}${c.reset}`)
  console.log(`  Dry run      : ${c.yellow}${opts.dryRun ? "YES" : "no"}${c.reset}`)
  console.log(`  Skip build   : ${c.yellow}${opts.skipBuild ? "YES" : "no"}${c.reset}`)
  console.log(`  Skip inject  : ${c.yellow}${opts.skipInject ? "YES" : "no"}${c.reset}`)
  console.log(`  Force inject : ${c.yellow}${opts.forceInject ? "YES" : "no"}${c.reset}`)
  console.log()
}

// ── Binary type detection (magic bytes, pure Node) ────────────────────────────
function readMagic(filePath, len = 4) {
  if (!fs.existsSync(filePath)) return null
  try {
    const buf = Buffer.alloc(len)
    const fd  = fs.openSync(filePath, "r")
    fs.readSync(fd, buf, 0, len, 0)
    fs.closeSync(fd)
    return buf
  } catch { return null }
}

function detectBinaryType(filePath) {
  const m = readMagic(filePath, 4)
  if (!m) return null
  if (m[0] === 0x4D && m[1] === 0x5A)
    return { type: "PE32",       desc: "PE32+ executable (Windows DLL/x64)" }
  if (m[0] === 0x7F && m[1] === 0x45 && m[2] === 0x4C && m[3] === 0x46)
    return { type: "ELF",        desc: "ELF shared object (Linux x64/arm64)" }
  if (m[0] === 0xCF && m[1] === 0xFA && m[2] === 0xED && m[3] === 0xFE)
    return { type: "Mach-O-64",  desc: "Mach-O 64-bit (macOS arm64/x64)" }
  if (m[0] === 0xCE && m[1] === 0xFA && m[2] === 0xED && m[3] === 0xFE)
    return { type: "Mach-O-32",  desc: "Mach-O 32-bit (macOS)" }
  if (m[0] === 0xCA && m[1] === 0xFE && m[2] === 0xBA && m[3] === 0xBE)
    return { type: "Mach-O-FAT", desc: "Mach-O universal binary (macOS)" }
  return { type: "unknown",      desc: `unknown magic: ${m.toString("hex")}` }
}

const EXPECTED_TYPE = {
  win32  : ["PE32"],
  linux  : ["ELF"],
  darwin : ["Mach-O-64", "Mach-O-FAT"],
}

// ── Find better_sqlite3.node di dalam release output ──────────────────────────
// Electron-builder output structures:
//   win32  → release/win-unpacked/resources/app.asar.unpacked/...
//   linux  → release/linux-unpacked/resources/app.asar.unpacked/...
//   darwin → release/mac/AuroraChat.app/Contents/Resources/app.asar.unpacked/...
//            release/mac-arm64/AuroraChat.app/Contents/Resources/app.asar.unpacked/...
const RELEASE_UNPACKED_GLOBS = {
  win32  : ["win-unpacked"],
  linux  : ["linux-unpacked"],
  darwin : ["mac", "mac-arm64", "mac-x64"],
}

const NODE_RELATIVE = path.join(
  "resources", "app.asar.unpacked",
  "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node"
)

function findReleaseBinary(releaseDir, platform) {
  const dirs = RELEASE_UNPACKED_GLOBS[platform] || []

  // Try known unpacked dirs
  for (const d of dirs) {
    const candidate = path.join(releaseDir, d, NODE_RELATIVE)
    if (fs.existsSync(candidate)) return candidate
  }

  // Fallback: deep search releaseDir (max depth 8) for better_sqlite3.node
  function walk(dir, depth) {
    if (depth > 8) return null
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return null }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isFile() && e.name === "better_sqlite3.node") return full
      if (e.isDirectory()) {
        const found = walk(full, depth + 1)
        if (found) return found
      }
    }
    return null
  }
  return walk(releaseDir, 0)
}

// ── Verify release binary per platform ────────────────────────────────────────
function verifyReleaseBinary(root, platform, dryRun) {
  if (dryRun) return { skipped: true }

  const releaseDir = path.join(root, "release")
  if (!fs.existsSync(releaseDir)) {
    return { found: false, reason: "release/ dir tidak ada" }
  }

  const binPath = findReleaseBinary(releaseDir, platform)
  if (!binPath) {
    return { found: false, reason: "better_sqlite3.node tidak ditemukan di release output" }
  }

  const detected  = detectBinaryType(binPath)
  const expected  = EXPECTED_TYPE[platform] || []
  const isCorrect = detected && expected.includes(detected.type)

  // Make path relative to root for cleaner display
  const relPath = path.relative(root, binPath)

  return { found: true, path: relPath, detected, isCorrect }
}

// ── Print final summary ────────────────────────────────────────────────────────
function printSummary(results, totalStart) {
  console.log()
  sep()
  console.log(`\n${c.bold}${c.magenta}  BUILD SUMMARY${c.reset}\n`)

  let allOk = true

  for (const [platform, status] of Object.entries(results)) {
    const cfg   = PLATFORM_CONFIG[platform]
    const dur   = status.duration ? `${c.gray}(${(status.duration / 1000).toFixed(1)}s)${c.reset}` : ""

    if (!status.success) {
      console.log(`  ❌ ${cfg.icon}  ${c.red}${cfg.label.padEnd(10)}${c.reset} ${dur}`)
      console.log(`     ${c.red}Build error: ${status.error}${c.reset}`)
      allOk = false
      console.log()
      continue
    }

    console.log(`  ✅ ${cfg.icon}  ${c.green}${cfg.label.padEnd(10)}${c.reset} ${dur}`)

    // ── Binary verify result ─────────────────────────────────────────────────
    const v = status.verify
    if (!v) {
      console.log(`     ${c.gray}(verify skipped)${c.reset}`)
    } else if (v.skipped) {
      console.log(`     ${c.gray}[dry-run] verify skipped${c.reset}`)
    } else if (!v.found) {
      console.log(`     ${c.yellow}⚠️  Binary not found: ${v.reason}${c.reset}`)
      allOk = false
    } else if (v.isCorrect) {
      console.log(`     ${c.green}🔍 Binary OK${c.reset}  ${c.gray}${v.detected.type}${c.reset} — ${c.cyan}${v.detected.desc}${c.reset}`)
      console.log(`     ${c.gray}   ${v.path}${c.reset}`)
    } else {
      const got      = v.detected ? v.detected.type : "unreadable"
      const expected = EXPECTED_TYPE[platform].join(" or ")
      console.log(`     ${c.red}🔍 Binary WRONG! got ${got}, expected ${expected}${c.reset}`)
      console.log(`     ${c.gray}   ${v.path}${c.reset}`)
      allOk = false
    }

    console.log()
  }

  sep()
  const totalDur = ((Date.now() - totalStart) / 1000).toFixed(1)
  if (allOk) {
    ok(`Semua platform berhasil di-build & verified! Total: ${totalDur}s 🎉`)
  } else {
    warn(`Ada yang gagal atau binary salah. Total: ${totalDur}s`)
  }
  console.log()
  return allOk
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const opts  = parseArgs()
  const root  = path.resolve(__dirname, "..")
  const totalStart = Date.now()

  printBanner(opts)
  checkTools()
  checkScripts(root, opts)

  // Validate platforms
  for (const p of opts.platforms) {
    if (!PLATFORM_CONFIG[p]) die(`Platform tidak dikenal: "${p}". Valid: win32, linux, darwin`)
  }

  // ── Step 1: Vite build (sekali) ──────────────────────────────────────────────
  if (!opts.skipBuild) {
    step("Vite build (sekali untuk semua platform)")
    run("npm run build", { dryRun: opts.dryRun, cwd: root, label: "vite build" })
    ok("Vite build selesai!")
    sep()
  } else {
    info("Skip vite build (--skip-build)")
    sep()
  }

  // ── Step 2: Obfuscate (sekali, jika --secure) ────────────────────────────────
  if (opts.secure) {
    step("Obfuscate (sekali untuk semua platform)")
    run("node scripts/obfuscate.js", { dryRun: opts.dryRun, cwd: root, label: "obfuscate" })
    ok("Obfuscate selesai!")
    sep()
  }

  // ── Step 3: Per-platform loop ────────────────────────────────────────────────
  const results = {}
  const total   = opts.platforms.length

  for (let i = 0; i < total; i++) {
    const platform = opts.platforms[i]
    const cfg      = PLATFORM_CONFIG[platform]
    const platStart = Date.now()

    console.log()
    console.log(`${c.bold}${c.magenta}╔═══════════════════════════════════════╗${c.reset}`)
    console.log(`${c.bold}${c.magenta}║${c.reset}  ${cfg.icon}  ${c.bold}[${i+1}/${total}] Building ${cfg.label.padEnd(8)}${c.reset}          ${c.bold}${c.magenta}║${c.reset}`)
    console.log(`${c.bold}${c.magenta}╚═══════════════════════════════════════╝${c.reset}`)

    try {
      // 3a. Inject binary
      if (!opts.skipInject) {
        step(`[${cfg.label}] Inject better-sqlite3 binary`)
        const forceFlag = opts.forceInject ? " --force" : ""
        run(
          `node scripts/inject-win-sqlite.js --platform ${platform} --arch ${cfg.arch}${forceFlag}`,
          { dryRun: opts.dryRun, cwd: root, label: `inject ${platform}` }
        )
      } else {
        info(`[${cfg.label}] Skip inject (--skip-inject)`)
      }

      // 3b. electron-builder
      step(`[${cfg.label}] electron-builder ${cfg.flag}`)
      run(
        `npx --no -- electron-builder ${cfg.flag} --config.npmRebuild=false`,
        { dryRun: opts.dryRun, cwd: root, label: `electron-builder ${platform}` }
      )

      // 3c. Verify release binary (pure Node, no 'file' command needed)
      step(`[${cfg.label}] Verifying release binary`)
      const verify = verifyReleaseBinary(root, platform, opts.dryRun)
      if (!opts.dryRun) {
        if (!verify.found) {
          warn(`Binary tidak ditemukan di release output: ${verify.reason}`)
        } else if (verify.isCorrect) {
          ok(`Binary OK ✔  ${c.cyan}${verify.detected.type}${c.reset} — ${verify.detected.desc}`)
          log(`${c.gray}  path: ${verify.path}${c.reset}`)
        } else {
          const got = verify.detected ? verify.detected.type : 'unreadable'
          warn(`Binary SALAH! got ${c.red}${got}${c.reset}, expected ${c.green}${EXPECTED_TYPE[platform].join(' or ')}${c.reset}`)
          log(`${c.gray}  path: ${verify.path}${c.reset}`)
        }
      }

      results[platform] = { success: true, duration: Date.now() - platStart, verify }
      ok(`${cfg.icon} ${cfg.label} build selesai! ${elapsed(platStart)}`)

    } catch (e) {
      results[platform] = { success: false, error: e.message, duration: Date.now() - platStart }
      warn(`${cfg.icon} ${cfg.label} build GAGAL: ${e.message}`)
      warn("Melanjutkan ke platform berikutnya...")
    }

    sep()
  }

  // ── Final summary ────────────────────────────────────────────────────────────
  const allOk = printSummary(results, totalStart)
  process.exit(allOk ? 0 : 1)
}

main().catch((e) => die(e.message))