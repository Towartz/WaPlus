const JavaScriptObfuscator = require('javascript-obfuscator')
const fs = require('fs')
const path = require('path')
const config = require('./obfuscate.config')

const isRestore = process.argv.includes('--restore')
const backupDir = path.join(__dirname, '../electron_backup')

// Semua file electron yang mau diprotect
const targets = [
  'electron/main.js',
  'electron/preload.js',
  'electron/baileys/client.js',
  'electron/baileys/dbHandler.js',
  'electron/baileys/messageParser.js',
  'electron/baileys/parser/body-extractor.js',
  'electron/baileys/parser/jid-utils.js',
  'electron/baileys/parser/media-extractor.js',
  'electron/baileys/parser/misc-extractors.js',
  'electron/baileys/parser/proto-extractors.js',
  'electron/baileys/parser/quoted-extractor.js',
  'electron/baileys/parser/renderer.js',
  'electron/baileys/parser/type-detection.js',
  'electron/db/database.js',
  'electron/mods/modManager.js',
]

// Backup path mirrors source folder structure
// e.g. electron/baileys/client.js → electron_backup/electron/baileys/client.js
const getBackupPath = (file) => path.join(backupDir, file)

// Migrate old flat-name backups ke folder structure yang bener
// e.g. electron_baileys_client.js → electron/baileys/client.js
const migrateLegacyBackups = () => {
  if (!fs.existsSync(backupDir)) return
  const entries = fs.readdirSync(backupDir)
  let migrated = 0
  for (const entry of entries) {
    const entryPath = path.join(backupDir, entry)
    if (fs.statSync(entryPath).isDirectory()) continue
    const matched = targets.find(f => f.replace(/\//g, '_') === entry)
    if (!matched) continue
    const newPath = getBackupPath(matched)
    fs.mkdirSync(path.dirname(newPath), { recursive: true })
    fs.renameSync(entryPath, newPath)
    migrated++
  }
  if (migrated > 0) console.log(`ℹ Migrated ${migrated} legacy backup(s) to folder structure\n`)
}

// ─── RESTORE MODE ────────────────────────────────────────────────────────────
if (isRestore) {
  console.log('🔄 Restoring backup...\n')

  if (!fs.existsSync(backupDir)) {
    console.error('✗ Backup directory not found:', backupDir)
    process.exit(1)
  }

  migrateLegacyBackups()

  let success = 0
  let failed = 0
  let skipped = 0

  targets.forEach(file => {
    try {
      const backupPath = getBackupPath(file)

      if (!fs.existsSync(backupPath)) {
        console.warn(`⚠ Skip (no backup): ${file}`)
        skipped++
        return
      }

      const fullPath = path.resolve(file)
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.copyFileSync(backupPath, fullPath)
      console.log(`✓ ${file}`)
      success++
    } catch (err) {
      console.error(`✗ ${file}: ${err.message}`)
      failed++
    }
  })

  console.log(`\nRestore done: ${success} restored, ${skipped} skipped, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

// ─── OBFUSCATE MODE ──────────────────────────────────────────────────────────
console.log('🔒 Obfuscating files...\n')

migrateLegacyBackups()

let success = 0
let failed = 0

targets.forEach(file => {
  try {
    const fullPath = path.resolve(file)
    if (!fs.existsSync(fullPath)) {
      console.warn(`⚠ Skip (not found): ${file}`)
      return
    }

    // Backup dengan struktur folder yang sama
    const backupPath = getBackupPath(file)
    fs.mkdirSync(path.dirname(backupPath), { recursive: true })
    fs.copyFileSync(fullPath, backupPath)

    // Obfuscate
    const code = fs.readFileSync(fullPath, 'utf8')
    const result = JavaScriptObfuscator.obfuscate(code, config)
    fs.writeFileSync(fullPath, result.getObfuscatedCode())

    console.log(`✓ ${file}`)
    success++
  } catch (err) {
    console.error(`✗ ${file}: ${err.message}`)
    failed++
  }
})

console.log(`\nDone: ${success} obfuscated, ${failed} failed`)
console.log(`Backup saved to: electron_backup/`)
console.log(`\nTo restore: node obfuscate.js --restore`)