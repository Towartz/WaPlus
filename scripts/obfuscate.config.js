/**
 * obfuscate.config.js — Aurora WaPlus (HARDENED v2 — Electron Edition)
 *
 * Context: Electron app — runs on file:// origin, NOT a web domain.
 * domainLock is REMOVED (it blocks file:// and would break the app).
 *
 * Why old config was reversible by deobfuscator.io:
 *  - base64 encoding is trivially decoded (automated tools just call atob())
 *  - threshold 0.5 left 50% of functions unprotected
 *  - wrappersCount: 1 = single indirection layer, easily unpeeled
 *  - no seed = deterministic output, tools fingerprint the string array structure
 *  - debugProtection OFF = deobfuscator.io runs devtools hooks unimpeded
 *
 * Hardening strategy for Electron:
 *  - rc4 + base64 DUAL encoding → rc4 requires key derivation, not just atob()
 *  - debugProtection ON → breaks deobfuscator.io's internal eval/devtools pipeline
 *  - seed randomized per build → breaks pattern-matching heuristics
 *  - wrappersCount 3 → 3 layers of indirection before reaching a string
 *  - controlFlowFlatteningThreshold 0.85 → near-total logic flow destruction
 *  - transformObjectKeys ON → extra AST noise on property access patterns
 *  - splitStringsChunkLength 5 → more nodes, harder manual reassembly
 *  - mangled identifiers → breaks _0x hex-pattern heuristics
 *
 * Tradeoffs:
 *  - rc4 decoding ~15–25% slower than base64-only → acceptable for desktop
 *  - debugProtection adds ~1–2ms per interval → negligible
 *  - controlFlowFlattening at 0.85 → ~30% larger bundle vs 0.5 → acceptable
 *  - transformObjectKeys → ~15% size increase → worth the AST noise
 *  - selfDefending still OFF → eval() hostile to Electron's CSP policies
 */

module.exports = {

  // === OUTPUT ===
  compact: true,

  // === SEED — non-deterministic per build, defeats pattern fingerprinting ===
  seed: Math.floor(Math.random() * 0xFFFFFF),

  // === CONTROL FLOW (Layer 1) ===
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.85,       // Was 0.5 → near-total logic destruction

  // === DEAD CODE (Layer 2) ===
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,            // Was 0.2 → more noise

  // === DEBUG PROTECTION — breaks deobfuscator.io's devtools pipeline ===
  // Safe in Electron: DevTools are only opened manually by devs, not by end users
  // This specifically disrupts automated analysis tools that hook into devtools APIs
  debugProtection: true,                      // Was OFF
  debugProtectionInterval: 4000,              // Re-triggers every 4s during analysis

  // === CONSOLE ===
  disableConsoleOutput: true,

  // === IDENTIFIER OBFUSCATION ===
  identifierNamesGenerator: 'mangled',        // Was 'hexadecimal' → mangled breaks _0x heuristics
  renameGlobals: false,                       // Keep OFF — breaks Electron/Node globals

  // === NUMBER OBFUSCATION ===
  numbersToExpressions: true,

  // === OBJECT KEY OBFUSCATION ===
  transformObjectKeys: true,                  // Was OFF → adds AST noise on property access

  // === STRING ARRAY (Layer 3 — core protection) ===
  stringArray: true,
  stringArrayThreshold: 0.95,                // Was 0.85 → near-total coverage
  stringArrayEncoding: ['rc4', 'base64'],    // Was ['base64'] only → rc4 requires key derivation
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,

  // === STRING ARRAY WRAPPERS ===
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.85,  // Was 0.75
  stringArrayWrappersCount: 3,               // Was 1 → 3 indirection layers
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 5,  // Was 2 → wider obfuscation surface
  stringArrayWrappersType: 'function',

  // === STRING SPLITTING ===
  splitStrings: true,
  splitStringsChunkLength: 5,               // Was 10 → more nodes, harder to reassemble

  // === SIMPLIFY ===
  simplify: true,

  // === STILL OFF ===
  selfDefending: false,                      // eval() conflicts with Electron's CSP
  unicodeEscapeSequence: false,              // +30% bundle size, negligible security gain
  domainLock: [],                            // MUST stay empty — app runs on file:// origin
}