const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')

/**
 * C31b §3 — oyun algılama (yalnız Windows). Kaynak önceliği: Steam → Epic → elle liste (ilk eşleşen kazanır).
 *
 * Gizlilik: süreç listesi, dosya yolları ve manifestler cihazdan ÇIKMAZ. Dışarı yalnız
 * `{ ref, epicName? }` gider (`steam:<appid>` · `epic:<catalogItemId>` + manifestteki ad · `curated:<id>`).
 * Oyunun içine/oyun sürecine HİÇBİR ŞEY yapılmaz: yalnız kayıt defteri, manifest dosyası ve süreç adı/yolu okunur.
 */

const SCAN_INTERVAL_MS = 15 * 1000
const EPIC_REFRESH_MS = 10 * 60 * 1000
const EXEC_TIMEOUT_MS = 10 * 1000
const STEAM_KEY = 'HKCU\\Software\\Valve\\Steam'
const STEAM_APPS_KEY = 'HKCU\\Software\\Valve\\Steam\\Apps'
const EPIC_MANIFESTS_DIR = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'
const STEAM_PROCESS_NAMES = ['steam.exe', 'steamwebhelper.exe']

function run(file, args) {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { windowsHide: true, timeout: EXEC_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout) => resolve(err ? null : stdout),
    )
  })
}

/** Steam'in çalışan uygulama değeri. 0 / anahtar yok → null. */
async function readRunningAppId() {
  const out = await run('reg', ['query', STEAM_KEY, '/v', 'RunningAppID'])
  const m = out && /RunningAppID\s+REG_DWORD\s+0x([0-9a-fA-F]+)/.exec(out)
  if (!m) return null
  const id = parseInt(m[1], 16)
  return id > 0 ? String(id) : null
}

/** Yedek yol: `Apps\<appid>` altında `Running`=1 olan ilk uygulama. */
async function readRunningFromApps() {
  const out = await run('reg', ['query', STEAM_APPS_KEY, '/s', '/v', 'Running'])
  if (!out) return null
  let currentId = null
  for (const line of out.split(/\r?\n/)) {
    const key = /\\Apps\\(\d+)\s*$/.exec(line.trim())
    if (key) {
      currentId = key[1]
      continue
    }
    if (currentId && /Running\s+REG_DWORD\s+0x1\s*$/i.test(line.trim())) return currentId
  }
  return null
}

/** [{ name (küçük harf), path (küçük harf, yoksa '') }] — PowerShell Get-CimInstance, tek çağrı. */
async function listProcesses() {
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const script =
    "[Console]::OutputEncoding=[Text.Encoding]::UTF8;" +
    "Get-CimInstance Win32_Process -Property Name,ExecutablePath | ForEach-Object { $_.Name + '|' + $_.ExecutablePath }"
  const out = await run(ps, ['-NoProfile', '-NonInteractive', '-Command', script])
  if (out === null) return null
  const list = []
  for (const line of out.split(/\r?\n/)) {
    const i = line.indexOf('|')
    if (i < 1) continue
    list.push({ name: line.slice(0, i).toLowerCase(), path: line.slice(i + 1).trim().toLowerCase() })
  }
  return list
}

/** Epic manifestleri: yalnız oyunlar (DLC ve motor/araç kayıtları elenir). */
function readEpicManifests(dir) {
  const games = []
  let files = []
  try {
    files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.item'))
  } catch {
    return games
  }
  for (const file of files) {
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))
      if (!m.CatalogItemId || !m.DisplayName || !m.InstallLocation) continue
      if (Array.isArray(m.AppCategories) && !m.AppCategories.includes('games')) continue
      if (m.MainGameCatalogItemId) continue
      if (m.bIsIncompleteInstall) continue
      games.push({
        id: String(m.CatalogItemId),
        name: String(m.DisplayName),
        // Sonuna ayraç eklenir: "C:\Games\Foo" klasörü "C:\Games\FooBar" yoluna denk gelmesin.
        dir: path.normalize(String(m.InstallLocation)).toLowerCase().replace(/[\\/]+$/, '') + '\\',
      })
    } catch {
      // Bozuk/yarım yazılmış manifest: atla, bir sonraki turda tekrar denenir.
    }
  }
  return games
}

/**
 * @param {{ onChange: (activity: { ref: string, epicName?: string } | null) => void,
 *           epicManifestsDir?: string }} opts
 */
function createGameDetector({ onChange, epicManifestsDir = EPIC_MANIFESTS_DIR }) {
  /** [{ id, executables: string[] (küçük harf) }] */
  let curated = []
  let epicGames = []
  let lastKey = null
  let scanning = false
  let scanTimer = null
  let epicTimer = null

  function emit(activity) {
    const key = activity ? `${activity.ref}|${activity.epicName ?? ''}` : ''
    if (key === lastKey) return
    lastKey = key
    onChange(activity)
  }

  async function detect() {
    // 1. Steam: çalışan appid (RunningAppID). Anahtar yoksa/0 ise aşağıda yedek yol.
    const running = await readRunningAppId()
    if (running) return { ref: `steam:${running}` }

    if (epicGames.length === 0 && curated.length === 0) {
      const fallback = await readRunningFromApps()
      return fallback ? { ref: `steam:${fallback}` } : null
    }

    const procs = await listProcesses()
    if (!procs) return undefined // sorgu başarısız: durumu değiştirme

    // 1b. Steam yedek yolu: Apps\<appid>\Running=1 — yalnız Steam süreci gerçekten çalışıyorsa
    // (Steam çökerse bayat 1 kalabilir; sürece bakmak onu eler).
    if (procs.some((p) => STEAM_PROCESS_NAMES.includes(p.name))) {
      const fallback = await readRunningFromApps()
      if (fallback) return { ref: `steam:${fallback}` }
    }

    // 2. Epic: çalışan sürecin tam yolu bir manifestin kurulum klasörünün altındaysa.
    // (Çoğu Epic oyunu LaunchExecutable'dan farklı bir alt klasördeki *-Shipping.exe'yi çalıştırır;
    // bu yüzden tam dosya yolu değil kurulum klasörü eşlenir.)
    for (const game of epicGames) {
      if (procs.some((p) => p.path.startsWith(game.dir))) {
        return { ref: `epic:${game.id}`, epicName: game.name }
      }
    }

    // 3. Elle liste: süreç adı (küçük harf) executables ile eşlenir.
    for (const game of curated) {
      if (procs.some((p) => game.executables.includes(p.name))) return { ref: `curated:${game.id}` }
    }
    return null
  }

  async function scan() {
    if (scanning) return
    scanning = true
    try {
      const result = await detect()
      if (result !== undefined) emit(result)
    } catch (e) {
      console.error('[oyun-algılama] tarama hatası:', e)
    } finally {
      scanning = false
    }
  }

  return {
    /** Sunucudaki elle liste. Geçersiz kayıtlar elenir. */
    setCuratedList(list) {
      curated = (Array.isArray(list) ? list : [])
        .filter((g) => g && typeof g.id === 'string' && Array.isArray(g.executables))
        .map((g) => ({
          id: g.id,
          executables: g.executables.filter((e) => typeof e === 'string').map((e) => e.toLowerCase()),
        }))
    },
    start() {
      if (process.platform !== 'win32' || scanTimer) return
      epicGames = readEpicManifests(epicManifestsDir)
      epicTimer = setInterval(() => {
        epicGames = readEpicManifests(epicManifestsDir)
      }, EPIC_REFRESH_MS)
      scanTimer = setInterval(scan, SCAN_INTERVAL_MS)
      scan()
    },
    stop() {
      if (scanTimer) clearInterval(scanTimer)
      if (epicTimer) clearInterval(epicTimer)
      scanTimer = null
      epicTimer = null
    },
    /** Test/hata ayıklama: tek tarama. */
    scanOnce: detect,
  }
}

module.exports = { createGameDetector, readEpicManifests }
