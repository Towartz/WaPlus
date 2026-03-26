module.exports = {
  compact: true,
  seed: Date.now() + Math.floor(Math.random() * 1000000000),

  identifierNamesGenerator: 'mangled-shuffled',
  renameGlobals: false,

  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,

  deadCodeInjection: false,
  deadCodeInjectionThreshold: 0,

  debugProtection: false,
  debugProtectionInterval: 0,

  disableConsoleOutput: true,

  numbersToExpressions: true,
  simplify: true,

  splitStrings: true,
  splitStringsChunkLength: 4,

  stringArray: true,
  stringArrayThreshold: 1,
  stringArrayEncoding: ['rc4'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,

  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 1,
  stringArrayWrappersCount: 4,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function',

  transformObjectKeys: false,
  selfDefending: true,
  unicodeEscapeSequence: false,

  reservedNames: [
    '^__dirname$',
    '^__filename$',
    '^require$',
    '^module$',
    '^exports$',
    '^Buffer$',
    '^process$',
    '^global$',
    '^globalThis$',
    '^console$',
    '^ipcRenderer$',
    '^ipcMain$',
    '^contextBridge$',
    '^BrowserWindow$',
    '^app$'
  ],

  reservedStrings: [
    'ipcRenderer',
    'ipcMain',
    'contextBridge',
    'BrowserWindow',
    'webContents',
    'did-finish-load',
    'ready-to-show',
    'nodeIntegration',
    'contextIsolation'
  ]
}