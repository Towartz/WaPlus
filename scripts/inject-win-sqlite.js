#!/usr/bin/env node
/**
 * scripts/inject-win-sqlite.js
 *
 * Auto-detect platform, arch, Electron ABI, dan better-sqlite3 version
 * dari environment + package.json, lalu download prebuilt binary dan inject
 * ke node_modules sebelum electron-builder jalan.
 *
 * Supported targets:
 *   - win32  (x64, ia32, arm64)
 *   - linux  (x64, arm64, armv7l)
 *   - darwin (x64, arm64)
 *
 * Usage:
 *   node scripts/inject-win-sqlite.js             → auto-detect current platform
 *   node scripts/inject-win-sqlite.js --platform win32 --arch x64
 *   node scripts/inject-win-sqlite.js --platform linux --arch arm64
 *   node scripts/inject-win-sqlite.js --platform darwin --arch arm64
 *   node scripts/inject-win-sqlite.js --dry-run   → print info tanpa download
 */

"use strict"

const https  = require("https")
const fs     = require("fs")
const path   = require("path")
const zlib   = require("zlib")
const os     = require("os")

// ── ANSI Logger ────────────────────────────────────────────────────────────────
const TAG  = "\x1b[35m[inject-sqlite]\x1b[0m"
const log  = (msg) => console.log(`${TAG} ${msg}`)
const ok   = (msg) => console.log(`\x1b[32m${TAG} ✅\x1b[0m ${msg}`)
const warn = (msg) => console.warn(`\x1b[33m${TAG} ⚠️\x1b[0m  ${msg}`)
const info = (msg) => console.log(`\x1b[36m${TAG} ℹ️\x1b[0m  ${msg}`)
const die  = (msg) => { console.error(`\x1b[31m${TAG} ❌\x1b[0m ${msg}`); process.exit(1) }

// ── Parse CLI Args ─────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2)
  const get  = (flag) => {
    const i = args.indexOf(flag)
    return i !== -1 && args[i + 1] ? args[i + 1] : null
  }
  return {
    platform : get("--platform"),
    arch     : get("--arch"),
    dryRun   : args.includes("--dry-run"),
    force    : args.includes("--force"),
  }
}

// ── Auto-detect versions dari package.json & node_modules ─────────────────────
function detectVersions() {
  const root = path.resolve(__dirname, "..")

  // better-sqlite3 version dari node_modules
  let bs3Version = null
  try {
    const bs3Pkg = require(path.join(root, "node_modules/better-sqlite3/package.json"))
    bs3Version = bs3Pkg.version
    info(`better-sqlite3 version (dari node_modules): v${bs3Version}`)
  } catch {
    // fallback ke package.json dependencies
    try {
      const rootPkg = require(path.join(root, "package.json"))
      const dep = rootPkg.dependencies?.["better-sqlite3"] || rootPkg.devDependencies?.["better-sqlite3"] || ""
      bs3Version = dep.replace(/[^0-9.]/g, "")
      warn(`better-sqlite3 node_modules tidak ada, fallback dari package.json: v${bs3Version}`)
    } catch {
      die("Tidak bisa detect better-sqlite3 version. Pastikan sudah npm install.")
    }
  }

  // Electron ABI — cari dari electron versi di node_modules
  let electronAbi = null
  let electronVer = null
  try {
    const electronPkg = require(path.join(root, "node_modules/electron/package.json"))
    electronVer = electronPkg.version
    // Map Electron major version → Node ABI
    // Ref: https://releases.electronjs.org/releases.json
    const electronMajor = parseInt(electronVer.split(".")[0])
    const abiMap = {
      // Electron → Node ABI (modules version)
      36: 137,
      37: 139,
      38: 140,
      39: 141,
      40: 143,
      41: 143,
      42: 151,
      43: 151,
      44: 153,
      45: 153,
    }
    electronAbi = abiMap[electronMajor]
    if (electronAbi) {
      info(`Electron v${electronVer} (major: ${electronMajor}) → ABI: ${electronAbi}`)
    } else {
      warn(`Electron major v${electronMajor} tidak ada di ABI map, fallback ke process.versions.modules`)
    }
  } catch {
    warn("node_modules/electron tidak ditemukan.")
  }

  // Fallback: ABI dari process.versions.modules (current Node, bukan Electron)
  if (!electronAbi) {
    electronAbi = parseInt(process.versions.modules)
    warn(`Menggunakan ABI dari Node.js runtime saat ini: ${electronAbi}`)
    warn("Pastikan ini sesuai dengan Electron target! Cek: https://releases.electronjs.org")
  }

  // Electron version untuk URL — ambil dari package.json build config
  if (!electronVer) {
    try {
      const rootPkg = require(path.join(root, "package.json"))
      electronVer = rootPkg.build?.electronVersion || rootPkg.devDependencies?.electron?.replace(/[^0-9.]/g, "") || "unknown"
      info(`Electron version dari package.json: v${electronVer}`)
    } catch {}
  }

  return { bs3Version, electronAbi: String(electronAbi), electronVer }
}

// ── Normalize platform & arch ──────────────────────────────────────────────────
function normalizePlatform(p) {
  const map = { win: "win32", windows: "win32", mac: "darwin", macos: "darwin", osx: "darwin" }
  return map[p?.toLowerCase()] || p?.toLowerCase() || os.platform()
}

function normalizeArch(a) {
  const map = { x86_64: "x64", amd64: "x64", aarch64: "arm64", arm: "armv7l" }
  return map[a?.toLowerCase()] || a?.toLowerCase() || os.arch()
}

// ── Validate combination ───────────────────────────────────────────────────────
const VALID_TARGETS = {
  win32  : ["x64", "ia32", "arm64"],
  linux  : ["x64", "arm64", "armv7l"],
  darwin : ["x64", "arm64"],
}

function validateTarget(platform, arch) {
  const validArchs = VALID_TARGETS[platform]
  if (!validArchs) die(`Platform tidak dikenal: "${platform}". Valid: ${Object.keys(VALID_TARGETS).join(", ")}`)
  if (!validArchs.includes(arch)) die(`Arch "${arch}" tidak valid untuk ${platform}. Valid: ${validArchs.join(", ")}`)
}

// ── Build download URL ─────────────────────────────────────────────────────────
function buildUrl(bs3Version, electronAbi, platform, arch) {
  // better-sqlite3 releases pakai format ini:
  // better-sqlite3-v{ver}-electron-v{abi}-{platform}-{arch}.tar.gz
  const filename = `better-sqlite3-v${bs3Version}-electron-v${electronAbi}-${platform}-${arch}.tar.gz`
  const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${bs3Version}/${filename}`
  return { filename, url }
}

// ── Check magic bytes ──────────────────────────────────────────────────────────
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
  if (!m) return "none"
  if (m[0] === 0x4D && m[1] === 0x5A) return "PE32"     // Windows .exe/.dll/.node
  if (m[0] === 0x7F && m[1] === 0x45 && m[2] === 0x4C && m[3] === 0x46) return "ELF" // Linux
  if (m[0] === 0xCF && m[1] === 0xFA && m[2] === 0xED && m[3] === 0xFE) return "Mach-O-64" // macOS arm64/x64
  if (m[0] === 0xCE && m[1] === 0xFA && m[2] === 0xED && m[3] === 0xFE) return "Mach-O-32"
  if (m[0] === 0xCA && m[1] === 0xFE && m[2] === 0xBA && m[3] === 0xBE) return "Mach-O-FAT" // Universal binary
  return "unknown"
}

const EXPECTED_MAGIC = {
  win32  : "PE32",
  linux  : "ELF",
  darwin : ["Mach-O-64", "Mach-O-FAT"],
}

function isCorrectBinary(filePath, platform) {
  const type     = detectBinaryType(filePath)
  const expected = EXPECTED_MAGIC[platform]
  if (Array.isArray(expected)) return expected.includes(type)
  return type === expected
}

// ── Download dengan redirect handling ─────────────────────────────────────────
function download(url, destPath, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 10) return reject(new Error("Too many redirects"))
    https.get(url, { headers: { "User-Agent": "inject-sqlite/2.0 (github.com/Yuu-DevID/WaPlus)" } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        res.resume()
        const location = res.headers.location
        if (!location) return reject(new Error("Redirect tanpa Location header"))
        log(`Redirect → ${location}`)
        return download(location, destPath, hops + 1).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode}: ${url}`))
      }

      const total  = parseInt(res.headers["content-length"] || "0")
      let received = 0
      const file   = fs.createWriteStream(destPath)

      res.on("data", (chunk) => {
        received += chunk.length
        if (total > 0 && process.stdout.isTTY) {
          const pct = ((received / total) * 100).toFixed(1)
          process.stdout.write(`\r${TAG} ⬇️  ${pct}% (${(received / 1024 / 1024).toFixed(2)} MB)`)
        }
      })
      res.pipe(file)
      file.on("finish", () => {
        if (total > 0 && process.stdout.isTTY) process.stdout.write("\n")
        file.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      })
      file.on("error", (e) => { try { fs.unlinkSync(destPath) } catch {}; reject(e) })
    }).on("error", reject)
  })
}

// ── Check apakah release URL exist (HEAD request) ─────────────────────────────
function checkUrlExists(url, hops = 0) {
  return new Promise((resolve) => {
    if (hops > 5) return resolve(false)
    const req = https.request(url, { method: "HEAD", headers: { "User-Agent": "inject-sqlite/2.0" } }, (res) => {
      res.resume() // consume response body to free socket
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        return checkUrlExists(res.headers.location, hops + 1).then(resolve)
      }
      resolve(res.statusCode === 200)
    })
    req.on("error", () => resolve(false))
    req.setTimeout(15000, () => { req.destroy(); resolve(false) })
    req.end()
  })
}

// ── Extract .node dari .tar.gz ─────────────────────────────────────────────────
function extractNodeFromTarGz(tarGzPath, destFile) {
  return new Promise((resolve, reject) => {
    const chunks = []
    fs.createReadStream(tarGzPath)
      .pipe(zlib.createGunzip())
      .on("data", (c) => chunks.push(c))
      .on("error", reject)
      .on("end", () => {
        const buf    = Buffer.concat(chunks)
        let   offset = 0
        let   found  = false

        while (offset + 512 <= buf.length) {
          const header    = buf.slice(offset, offset + 512)
          const nameRaw   = header.slice(0, 100).toString("utf8").replace(/\0/g, "")
          const sizeOctal = header.slice(124, 136).toString("utf8").trim().replace(/\0/g, "")
          const size      = parseInt(sizeOctal, 8) || 0
          offset += 512

          if (!nameRaw.trim()) break // end of archive

          if (nameRaw.includes("better_sqlite3.node")) {
            log(`Found in tarball: ${nameRaw} (${size} bytes)`)
            fs.writeFileSync(destFile, buf.slice(offset, offset + size))
            found = true
            break
          }

          offset += Math.ceil(size / 512) * 512
        }

        if (found) resolve()
        else reject(new Error("better_sqlite3.node tidak ditemukan di dalam tarball!"))
      })
  })
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n\x1b[35m╔══════════════════════════════════════════╗\x1b[0m`)
  console.log(`\x1b[35m║     inject-sqlite  v2.0  (auto-detect)   ║\x1b[0m`)
  console.log(`\x1b[35m╚══════════════════════════════════════════╝\x1b[0m\n`)

  const cli = parseArgs()

  // ── 1. Detect versions ───────────────────────────────────────────────────────
  const { bs3Version, electronAbi, electronVer } = detectVersions()

  // ── 2. Resolve target platform & arch ───────────────────────────────────────
  const platform = normalizePlatform(cli.platform)
  const arch     = normalizeArch(cli.arch)
  validateTarget(platform, arch)

  // ── 3. Build URL & paths ─────────────────────────────────────────────────────
  const { filename, url } = buildUrl(bs3Version, electronAbi, platform, arch)
  const DEST_DIR  = path.resolve(__dirname, "../node_modules/better-sqlite3/build/Release")
  const DEST_FILE = path.join(DEST_DIR, "better_sqlite3.node")
  const TMP_FILE  = path.join(os.tmpdir(), filename)

  // ── 4. Print summary ─────────────────────────────────────────────────────────
  console.log(`  Platform       : \x1b[33m${platform}\x1b[0m`)
  console.log(`  Arch           : \x1b[33m${arch}\x1b[0m`)
  console.log(`  better-sqlite3 : \x1b[33mv${bs3Version}\x1b[0m`)
  console.log(`  Electron       : \x1b[33mv${electronVer}\x1b[0m`)
  console.log(`  ABI            : \x1b[33m${electronAbi}\x1b[0m`)
  console.log(`  Filename       : \x1b[36m${filename}\x1b[0m`)
  console.log(`  Download URL   : \x1b[36m${url}\x1b[0m`)
  console.log(`  Dest           : \x1b[36m${DEST_FILE}\x1b[0m`)
  console.log()

  if (cli.dryRun) {
    info("--dry-run mode: tidak ada yang di-download/extract.")
    return
  }

  // ── 5. Check existing binary ─────────────────────────────────────────────────
  fs.mkdirSync(DEST_DIR, { recursive: true })

  if (!cli.force && fs.existsSync(DEST_FILE)) {
    const currentType = detectBinaryType(DEST_FILE)
    if (isCorrectBinary(DEST_FILE, platform)) {
      ok(`Binary sudah correct (${currentType}) untuk ${platform}. Skip download!`)
      ok("Gunakan --force untuk override.")
      return
    }
    warn(`Binary existing (${currentType}) tidak sesuai target platform (${platform}), akan diganti...`)
  }

  // ── 6. Check URL availability ────────────────────────────────────────────────
  log("Checking release availability...")
  const exists = await checkUrlExists(url)
  if (!exists) {
    warn(`Release tidak ditemukan di: ${url}`)
    warn("Kemungkinan ABI/version combination belum ada prebuilt binary-nya.")
    warn("Cek: https://github.com/WiseLibs/better-sqlite3/releases")
    die("Download dibatalkan.")
  }
  ok("Release ditemukan!")

  // ── 7. Download ──────────────────────────────────────────────────────────────
  log(`Downloading ${filename}...`)
  try {
    await download(url, TMP_FILE)
    ok(`Download selesai → ${TMP_FILE}`)
  } catch (e) {
    die(`Download gagal: ${e.message}`)
  }

  // ── 8. Extract ───────────────────────────────────────────────────────────────
  log("Extracting better_sqlite3.node dari tarball...")
  try {
    await extractNodeFromTarGz(TMP_FILE, DEST_FILE)
    ok("Extract selesai!")
  } catch (e) {
    die(`Extract gagal: ${e.message}`)
  } finally {
    try { fs.unlinkSync(TMP_FILE) } catch {}
  }

  // ── 9. Verify ────────────────────────────────────────────────────────────────
  const finalType = detectBinaryType(DEST_FILE)
  if (isCorrectBinary(DEST_FILE, platform)) {
    ok(`Inject sukses! better_sqlite3.node = ${finalType} (${platform}/${arch}) ✨`)
  } else {
    die(`Verify gagal! Binary type: ${finalType}, expected untuk ${platform}. Cek manual.`)
  }
}

main().then(() => process.exit(0)).catch((e) => die(e.message))
