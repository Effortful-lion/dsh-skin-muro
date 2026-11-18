/**
 * Host half of dsh-plugin-muro.
 *
 * Three jobs, all under /muro/ (outside the /api trust fence):
 *   - the Muro catalog (auto-loaded by the page, 10 min cache);
 *   - downloads: a 4K master is fetched once, one frame is frozen into
 *     $DSH_HOME/muro-cache and indexed, with byte progress reported per job;
 *   - applying: a cached frame is copied into the installed skin under a fresh
 *     file name and skin.json is repointed, because a replaced file at the same
 *     URL stays invisible to the page's image cache.
 *
 * The skin-center call stays in the browser half: /api/skin-center is
 * authenticated for the page and not for this process.
 */
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CATALOG_URL = 'https://cdn.murowallpaper.com/catalog.json'
const USER_AGENT = 'dsh-plugin-muro/1.0 (+dsh skin settings)'
const CATALOG_TTL_MS = 10 * 60 * 1000
const OUT_WIDTH = 2560
const OUT_HEIGHT = 1440
const CACHE_LIMIT = 32
const SWIFT = '/usr/bin/swift'

const here = path.dirname(fileURLToPath(import.meta.url))
const grabber = path.join(here, '..', 'tools', 'grab-frame.swift')
const bundledSkin = path.join(here, '..', 'skin')

export const name = 'muro'
export const inject = ['webServer']

const dshHome = () => process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
const skinDir = () => path.join(dshHome(), 'skins', 'muro')
const configFile = () => path.join(dshHome(), 'muro-config.json')
const defaultCacheDir = () => path.join(dshHome(), 'muro-cache')

let cacheDirOverride = undefined

/** Where frozen frames live. The user can point this at any folder. */
function cacheDir() {
  if (typeof cacheDirOverride !== 'string' || cacheDirOverride === '') return defaultCacheDir()
  return cacheDirOverride
}

async function loadConfig() {
  const stored = await readJson(configFile(), {})
  cacheDirOverride = typeof stored.cacheDir === 'string' && stored.cacheDir !== '' ? stored.cacheDir : null
  return stored
}

function expandHome(input) {
  const value = String(input ?? '').trim()
  if (value === '') return ''
  if (value === '~') return os.homedir()
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2))
  return path.resolve(value)
}
const indexFile = () => path.join(cacheDir(), 'index.json')

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function exists(file) {
  return stat(file).then(() => true, () => false)
}

function summarize(entry) {
  return {
    id: entry.id,
    title: entry.title,
    category: entry.category,
    width: entry.width,
    height: entry.height,
    seconds: Math.round(entry.duration ?? 0),
    megabytes: Math.round((entry.sizeBytes ?? 0) / 1_000_000),
    thumbnail: entry.thumbnail,
  }
}

function appearanceFile() {
  return path.join(dshHome(), 'muro-appearance.json')
}

const APPEARANCE_DEFAULTS = {
  auto: true,
  veil: 40,
  panel: 45,
  blur: 0,
  brightness: 100,
  saturate: 105,
  contrast: 100,
  grayscale: 0,
  position: 'center',
}

const APPEARANCE_RANGE = {
  veil: [0, 80],
  panel: [0, 85],
  blur: [0, 24],
  brightness: [50, 130],
  saturate: [0, 160],
  contrast: [80, 140],
  grayscale: [0, 100],
}

/** Keep stored settings inside the sliders' own ranges, whatever arrives. */
function normalizeSettings(input) {
  const raw = input !== null && typeof input === 'object' ? input : {}
  const next = {}
  for (const [key, [min, max]] of Object.entries(APPEARANCE_RANGE)) {
    const value = Number(raw[key])
    next[key] = Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : APPEARANCE_DEFAULTS[key]
  }
  next.position = ['center', 'top', 'bottom'].includes(raw.position) ? raw.position : APPEARANCE_DEFAULTS.position
  next.auto = raw.auto === undefined ? APPEARANCE_DEFAULTS.auto : raw.auto === true
  return next
}

async function readAppearance() {
  const stored = await readJson(appearanceFile(), {})
  return {
    enabled: stored.enabled === true,
    updatedAt: Number(stored.updatedAt) || 0,
    settings: normalizeSettings(stored.settings ?? {}),
  }
}

async function writeAppearance(next) {
  await writeFile(appearanceFile(), JSON.stringify(next, null, 2) + '\n')
}

/** Prefix every top-level selector of a patches file with our own scope. */
function scopePatches(css) {
  // Comments first: a leading /* ... */ block would otherwise swallow the
  // prefix of the rule that follows it and invalidate the whole tail.
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map(block => block.trim())
    .filter(block => block !== '')
    .map(block => {
      const at = block.indexOf('{')
      if (at === -1) return ''
      const selectors = block.slice(0, at).split(',').map(part => part.trim()).filter(Boolean)
      const body = block.slice(at + 1)
      return selectors.map(selector => `html[data-muro-skin] ${selector}`).join(', ') + ' {' + body + '}'
    })
    .join('\n')
}

/** The skin stylesheet, re-scoped to this plugin because user-directory skins
 *  are not applied by the skin-center on this build. */
function scopeSkin(css) {
  // The token map has to land on <body>, not <html>: the shell declares its own
  // dark tokens on body[data-ds-dark-theme], and an inherited value can never
  // beat one set on the element that actually inherits it. Body-level with an
  // extra attribute wins, which is what makes our palette apply at all.
  return css
    .replace(/:root,\s*\nbody\[data-ds-dark-theme\] \{/g,
      'html[data-muro-skin] body,\nhtml[data-muro-skin] body[data-muro-theme="dark"] {')
    .replace(/:root/g, 'html[data-muro-skin]')
    .replace(/\bbody\[data-ds-dark-theme\]/g, 'html[data-muro-skin][data-muro-theme="dark"]')
}

async function readIndex() {
  return readJson(indexFile(), {})
}

async function writeIndex(index) {
  await mkdir(cacheDir(), { recursive: true })
  await writeFile(indexFile(), JSON.stringify(index, null, 2) + '\n')
}

async function pruneCache(index) {
  const entries = Object.values(index).sort((left, right) => (right.downloadedAt ?? 0) - (left.downloadedAt ?? 0))
  for (const entry of entries.slice(CACHE_LIMIT)) {
    if (entry?.file) await unlink(path.join(cacheDir(), entry.file)).catch(() => {})
    delete index[entry.id]
  }
  for (const file of await readdir(cacheDir()).catch(() => [])) {
    if (!file.endsWith('.jpg')) continue
    if (entries.some(entry => entry.file === file)) continue
    await unlink(path.join(cacheDir(), file)).catch(() => {})
  }
  return index
}

function frozenFrame(videoFile, outFile, seconds) {
  return new Promise((resolve, reject) => {
    const child = spawn(SWIFT, [grabber, videoFile, outFile, String(seconds), String(OUT_WIDTH), String(OUT_HEIGHT)])
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.on('error', reject)
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`frame grab failed (exit ${code}): ${stderr.trim().slice(0, 300)}`))
        return
      }
      const luma = Number((stdout.match(/luma\s+(\d+)/) ?? [])[1])
      resolve(Number.isFinite(luma) ? luma : null)
    })
  })
}

/** Mean luma (0-255) of an image already on disk, so the page can size the veil. */
function measureLuma(file) {
  return new Promise(resolve => {
    const child = spawn(SWIFT, [grabber, '--luma', file])
    let stdout = ''
    child.on('error', () => resolve(null))
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.on('close', () => {
      const luma = Number((stdout.match(/luma\s+(\d+)/) ?? [])[1])
      resolve(Number.isFinite(luma) ? luma : null)
    })
  })
}

export function apply(ctx) {
  let cache = null
  const jobs = new Map()

  async function catalog() {
    if (cache !== null && Date.now() - cache.at < CATALOG_TTL_MS) return cache
    let lastError
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(CATALOG_URL, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) })
        if (!response.ok) throw new Error(`catalog http ${response.status}`)
        const body = await response.json()
        const items = Array.isArray(body?.wallpapers) ? body.wallpapers.map(summarize) : []
        cache = { at: Date.now(), items, raw: body.wallpapers }
        return cache
      } catch (error) {
        lastError = error
        await new Promise(resolve => setTimeout(resolve, 600 * attempt))
      }
    }
    throw new Error(`catalog unreachable after 3 attempts: ${String(lastError?.message ?? lastError)}`)
  }

  async function installSkin() {
    const target = skinDir()
    await mkdir(target, { recursive: true })
    for (const relative of ['skin.css', 'patches.css', 'skin.json', 'preview/light.jpg', 'preview/dark.jpg']) {
      const source = path.join(bundledSkin, relative)
      if (!(await exists(source))) continue
      if (relative === 'skin.json' && (await exists(path.join(target, relative)))) continue
      await mkdir(path.dirname(path.join(target, relative)), { recursive: true })
      await copyFile(source, path.join(target, relative))
    }
    await mkdir(path.join(target, 'assets'), { recursive: true })
    for (const theme of ['dark', 'light']) {
      const name = `backdrop-${theme}.jpg`
      const source = path.join(bundledSkin, 'assets', name)
      const destination = path.join(target, 'assets', name)
      if (!(await exists(destination)) && (await exists(source))) await copyFile(source, destination)
    }
    if (!(await exists(path.join(target, 'assets', 'credits.json')))) {
      const bundled = await readJson(path.join(bundledSkin, 'assets', 'credits.json'), {})
      await writeFile(path.join(target, 'assets', 'credits.json'), JSON.stringify(bundled, null, 2) + '\n')
    }
    return target
  }

  async function download(id, job) {
    const { items, raw } = await catalog()
    const summary = items.find(item => item.id === id)
    if (summary === undefined) throw new Error('unknown wallpaper id')
    const source = raw.find(entry => entry.id === id)
    if (source === undefined) throw new Error('wallpaper vanished from catalog')

    const at = Math.min(2.5, (source.duration ?? 8) / 4)
    const file = `${source.id}@${at}.jpg`
    const target = path.join(cacheDir(), file)
    await mkdir(cacheDir(), { recursive: true })

    const index = await readIndex()
    let luma = index[source.id]?.luma ?? null
    if (index[source.id] === undefined || !(await exists(target))) {
      luma = await downloadMaster(source.video, at, target, progress => Object.assign(job, progress))
    }
    if (luma === null) luma = await measureLuma(target)

    const size = await stat(target).then(entry => entry.size, () => 0)
    const next = { ...index, [source.id]: { ...summary, file, bytes: size, frozenAt: at, luma, downloadedAt: Date.now() } }
    await writeIndex(await pruneCache(next))
    return next[source.id]
  }

  // AVFoundation sniffs the container by extension, so the master keeps its
  // .mov name in the temp dir instead of being a ".jpg.part".
  async function downloadMaster(url, at, target, onProgress) {
    const video = path.join(os.tmpdir(), `muro-${process.pid}-${Date.now()}.mov`)
    let lastError
    try {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } })
          if (!response.ok) throw new Error(`master http ${response.status}`)
          const total = Number(response.headers.get('content-length') ?? 0)
          let received = 0
          const sink = createWriteStream(video)
          for await (const chunk of Readable.fromWeb(response.body)) {
            received += chunk.length
            onProgress({ stage: 'download', received, total, attempt })
            if (!sink.write(chunk)) await new Promise(resolve => sink.once('drain', resolve))
          }
          await new Promise((resolve, reject) => sink.end(error => (error ? reject(error) : resolve())))
          lastError = undefined
          break
        } catch (error) {
          lastError = error
          await unlink(video).catch(() => {})
          await new Promise(resolve => setTimeout(resolve, 700 * attempt))
        }
      }
      if (lastError !== undefined) throw new Error(`download failed after 3 attempts: ${String(lastError?.message ?? lastError)}`)

      onProgress({ stage: 'freeze', received: 0, total: 0 })
      const frame = `${target}.tmp.jpg`
      const luma = await frozenFrame(video, frame, at)
      await rename(frame, target)
      return luma
    } finally {
      await unlink(video).catch(() => {})
    }
  }

  async function applyWallpaper({ id, theme }) {
    const index = await readIndex()
    const entry = index[id]
    if (entry === undefined) {
      const error = new Error('not-downloaded')
      error.code = 409
      throw error
    }
    const source = path.join(cacheDir(), entry.file)
    if (!(await exists(source))) {
      const error = new Error('cache-file-missing')
      error.code = 409
      throw error
    }

    const dir = skinDir()
    if (!(await exists(path.join(dir, 'skin.json')))) await installSkin()

    const assets = path.join(dir, 'assets')
    await mkdir(assets, { recursive: true })
    const stamp = Date.now().toString(36)
    const fileName = `backdrop-${theme}-${stamp}.jpg`
    await copyFile(source, path.join(assets, fileName))

    const manifestPath = path.join(dir, 'skin.json')
    const manifest = await readJson(manifestPath, null)
    if (manifest === null) throw new Error('skin.json unreadable')
    manifest.contributes = manifest.contributes ?? {}
    manifest.contributes.backgroundMedia = manifest.contributes.backgroundMedia ?? {}
    manifest.contributes.backgroundMedia[theme] = {
      ...(manifest.contributes.backgroundMedia[theme] ?? { type: 'image' }),
      type: 'image',
      src: `assets/${fileName}`,
    }
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

    const otherTheme = theme === 'dark' ? 'light' : 'dark'
    const keep = String(manifest.contributes.backgroundMedia[otherTheme]?.src ?? '')
    for (const file of await readdir(assets)) {
      if (!file.startsWith(`backdrop-${theme}`)) continue
      if (file === fileName || keep.endsWith(file)) continue
      await unlink(path.join(assets, file)).catch(() => {})
    }

    const luma = Number.isFinite(entry.luma) ? entry.luma : await measureLuma(source)
    if (luma !== null) {
      const indexNow = await readIndex()
      if (indexNow[entry.id] !== undefined) {
        indexNow[entry.id] = { ...indexNow[entry.id], luma }
        await writeIndex(indexNow)
      }
    }

    const creditsPath = path.join(assets, 'credits.json')
    const credits = await readJson(creditsPath, {})
    credits[theme] = {
      id: entry.id,
      title: entry.title,
      category: entry.category,
      sourceSize: `${entry.width}x${entry.height}`,
      frozenAt: entry.frozenAt,
      file: fileName,
      luma,
      pickedBy: 'dsh-plugin-muro',
    }
    await writeFile(creditsPath, JSON.stringify(credits, null, 2) + '\n')
    return { theme, credit: credits[theme], bytes: (await stat(path.join(assets, fileName))).size }
  }

  async function styleStamp() {
    const dir = skinDir()
    const files = ['skin.css', 'patches.css', 'skin.json']
    let stamp = 0
    for (const name of files) {
      const file = path.join(dir, name)
      const time = await stat(file).then(entry => entry.mtimeMs, () => 0)
      stamp = Math.max(stamp, time)
    }
    return Math.round(stamp)
  }

  async function cacheSummary() {
    const dir = cacheDir()
    const index = await readIndex()
    const bytes = Object.values(index).reduce((total, entry) => total + (Number(entry.bytes) || 0), 0)
    return { dir, count: Object.keys(index).length, bytes }
  }

  const cacheRoute = {
    kind: 'exact',
    path: '/muro/cache',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        json(res, 200, { ok: true, ...(await cacheSummary()) })
        return
      }
      try {
        const body = await readBody(req)
        if (body.open === true) {
          if (process.platform === 'darwin') spawn('open', [cacheDir()], { detached: true, stdio: 'ignore' }).unref()
          json(res, 200, { ok: true, ...(await cacheSummary()) })
          return
        }
        const requested = expandHome(body.dir)
        const next = requested === '' ? defaultCacheDir() : requested
        await mkdir(next, { recursive: true })
        const previous = cacheDir()
        if (previous !== next) {
          // Carry the library over so a new folder does not look empty.
          const previousIndex = await readIndex()
          await mkdir(next, { recursive: true })
          for (const entry of Object.values(previousIndex)) {
            if (typeof entry.file !== 'string') continue
            await copyFile(path.join(previous, entry.file), path.join(next, entry.file)).catch(() => {})
          }
          if (Object.keys(previousIndex).length > 0) {
            await writeFile(path.join(next, 'index.json'), JSON.stringify(previousIndex, null, 2) + '\n')
          }
        }
        cacheDirOverride = next === defaultCacheDir() ? null : next
        const config = await readJson(configFile(), {})
        config.cacheDir = cacheDirOverride ?? ''
        await writeFile(configFile(), JSON.stringify(config, null, 2) + '\n')
        json(res, 200, { ok: true, ...(await cacheSummary()) })
      } catch (error) {
        json(res, 500, { ok: false, error: String(error?.message ?? error) })
      }
    },
  }

  const stateRoute = {
    kind: 'exact',
    path: '/muro/state',
    handler: async (_req, res) => {
      try {
        const dir = skinDir()
        const index = await readIndex()
        const creditsPath = path.join(dir, 'assets', 'credits.json')
        const credits = await readJson(creditsPath, {})
        let measured = false
        const wallpapers = {}
        for (const theme of ['dark', 'light']) {
          const credit = credits[theme]
          if (credit === undefined) continue
          let luma = Number.isFinite(credit.luma) ? credit.luma : null
          if (luma === null && typeof credit.file === 'string') {
            const assetFile = path.join(dir, 'assets', credit.file)
            if (await exists(assetFile)) {
              luma = await measureLuma(assetFile)
              if (luma !== null) {
                credits[theme] = { ...credit, luma }
                measured = true
              }
            }
          }
          wallpapers[theme] = { title: credit.title, luma }
        }
        if (measured) await writeFile(creditsPath, JSON.stringify(credits, null, 2) + '\n')
        const active = await readJson(path.join(dshHome(), 'skin-center-active.json'), {})
        json(res, 200, {
          ok: true,
          installed: await exists(path.join(dir, 'skin.json')),
          skinPath: dir,
          activeSkin: typeof active.active === 'string' ? active.active : null,
          background: active.background ?? null,
          credits,
          wallpapers,
          cache: await cacheSummary(),
          styleStamp: await styleStamp(),
          appearance: await readAppearance(),
          locals: Object.values(index).sort((left, right) => (right.downloadedAt ?? 0) - (left.downloadedAt ?? 0)),
          size: { width: OUT_WIDTH, height: OUT_HEIGHT },
        })
      } catch (error) {
        json(res, 500, { ok: false, error: String(error?.message ?? error) })
      }
    },
  }

  const installRoute = {
    kind: 'exact',
    path: '/muro/install',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        json(res, 405, { ok: false, error: 'method-not-allowed' })
        return
      }
      try {
        json(res, 200, { ok: true, skinPath: await installSkin() })
      } catch (error) {
        json(res, 500, { ok: false, error: String(error?.message ?? error) })
      }
    },
  }

  const catalogRoute = {
    kind: 'exact',
    path: '/muro/catalog',
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const needle = (url.searchParams.get('q') ?? '').trim().toLowerCase()
        const category = url.searchParams.get('category') ?? ''
        const localOnly = url.searchParams.get('local') === '1'
        const { items, at } = await catalog()
        const index = await readIndex()
        const categories = [...new Set(items.map(item => item.category))].sort()
        const decorated = items.map(item => ({
          ...item,
          local: index[item.id] !== undefined,
          localBytes: index[item.id]?.bytes ?? 0,
        }))
        const filtered = decorated.filter(item => {
          if (localOnly && !item.local) return false
          if (category !== '' && item.category !== category) return false
          if (needle === '') return true
          return item.title.toLowerCase().includes(needle)
        })
        json(res, 200, {
          ok: true,
          updatedAt: at,
          total: items.length,
          localCount: decorated.filter(item => item.local).length,
          categories,
          items: filtered.slice(0, 160),
        })
      } catch (error) {
        json(res, 502, { ok: false, error: String(error?.message ?? error) })
      }
    },
  }

  const downloadRoute = {
    kind: 'exact',
    path: '/muro/download',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        json(res, 405, { ok: false, error: 'method-not-allowed' })
        return
      }
      try {
        const body = await readBody(req)
        const id = typeof body.id === 'string' ? body.id : ''
        if (id === '') throw new Error('id is required')
        const jobId = `${id}:${Date.now()}`
        const job = { state: 'running', stage: 'download', received: 0, total: 0, id }
        jobs.set(jobId, job)
        void download(id, job).then(
          entry => {
            job.state = 'done'
            job.stage = 'done'
            job.entry = entry
          },
          error => {
            job.state = 'error'
            job.error = String(error?.message ?? error)
          },
        )
        json(res, 202, { ok: true, jobId })
      } catch (error) {
        json(res, 400, { ok: false, error: String(error?.message ?? error) })
      }
    },
  }

  const jobRoute = {
    kind: 'exact',
    path: '/muro/job',
    handler: (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const job = jobs.get(url.searchParams.get('id') ?? '')
      if (job === undefined) {
        json(res, 404, { ok: false, error: 'unknown job' })
        return
      }
      json(res, 200, { ok: true, ...job })
    },
  }

  const applyRoute = {
    kind: 'exact',
    path: '/muro/apply',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        json(res, 405, { ok: false, error: 'method-not-allowed' })
        return
      }
      try {
        const body = await readBody(req)
        const theme = body.theme === 'light' ? 'light' : 'dark'
        const id = typeof body.id === 'string' ? body.id : ''
        json(res, 200, { ok: true, ...(await applyWallpaper({ id, theme })) })
      } catch (error) {
        json(res, error?.code ?? 400, { ok: false, error: String(error?.message ?? error) })
      }
    },
  }

  async function currentAsset(theme) {
    const dir = skinDir()
    const credits = await readJson(path.join(dir, 'assets', 'credits.json'), {})
    const manifest = await readJson(path.join(dir, 'skin.json'), null)
    const fromManifest = manifest?.contributes?.backgroundMedia?.[theme]?.src
    const fromCredits = credits?.[theme]?.file
    const candidates = [fromManifest, fromCredits === undefined ? null : `assets/${fromCredits}`].filter(Boolean)
    for (const candidate of candidates) {
      const file = path.join(dir, candidate)
      if (await exists(file)) return file
    }
    return null
  }

  /** One rule per theme, but a theme without a wallpaper of its own falls back to
   *  the other one: switching the system to dark must never blank the backdrop. */
  async function resolvedWallpaper(stamp) {
    const basename = file => (file === null ? null : path.basename(file))
    const dark = basename(await currentAsset('dark'))
    const light = basename(await currentAsset('light'))
    const forDark = dark ?? light
    const forLight = light ?? dark
    const url = file => (file === null ? 'none' : `url('/muro/asset?file=${file}&v=${stamp}')`)
    return `html[data-muro-skin]{--muro-panel:.45;--dsw-skin-scrim:var(--muro-panel);--muro-veil:.45;--muro-blur:0px;--muro-bright:1;--muro-sat:1.05;--muro-contrast:1;--muro-gray:0;--muro-pos:center;--muro-scale:1;}
html[data-muro-skin] body::before{content:"";position:fixed;inset:0;z-index:-2;pointer-events:none;
  background-image:${url(forLight)};background-position:var(--muro-pos);background-size:cover;background-repeat:no-repeat;
  filter:brightness(var(--muro-bright)) saturate(var(--muro-sat)) contrast(var(--muro-contrast)) grayscale(var(--muro-gray)) blur(var(--muro-blur));
  transform:scale(var(--muro-scale));transform-origin:center;}
html[data-muro-skin] body::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;
  background:linear-gradient(180deg,rgba(250,252,255,calc(var(--muro-veil) * 1.1)),rgba(247,250,255,var(--muro-veil)) 45%,rgba(240,245,252,calc(var(--muro-veil) * 1.15)));}
/* The system preference drives the swap with no JavaScript in the path, which
   is what makes dark -> light as instant as light -> dark. */
@media (prefers-color-scheme: dark){
  html[data-muro-skin] body::before{background-image:${url(forDark)};}
  html[data-muro-skin] body::after{background:linear-gradient(180deg,rgba(4,6,12,calc(var(--muro-veil) * 1.1)),rgba(4,6,12,var(--muro-veil)) 45%,rgba(4,6,12,calc(var(--muro-veil) * 1.2)));}
}
/* An explicit shell theme beats the system preference: the page only sets this
   attribute when the shell disagrees with the system. */
html[data-muro-skin][data-muro-theme="light"] body::before{background-image:${url(forLight)};}
html[data-muro-skin][data-muro-theme="light"] body::after{background:linear-gradient(180deg,rgba(250,252,255,calc(var(--muro-veil) * 1.1)),rgba(247,250,255,var(--muro-veil)) 45%,rgba(240,245,252,calc(var(--muro-veil) * 1.15)));}
html[data-muro-skin][data-muro-theme="dark"] body::before{background-image:${url(forDark)};}
html[data-muro-skin][data-muro-theme="dark"] body::after{background:linear-gradient(180deg,rgba(4,6,12,calc(var(--muro-veil) * 1.1)),rgba(4,6,12,var(--muro-veil)) 45%,rgba(4,6,12,calc(var(--muro-veil) * 1.2)));}
html[data-muro-skin],html[data-muro-skin] body{background-color:transparent!important;}
`  }

  const skinCssRoute = {
    kind: 'exact',
    path: '/muro/skin.css',
    handler: async (_req, res) => {
      try {
        const dir = skinDir()
        const base = await readFile(path.join(dir, 'skin.css'), 'utf8').catch(() => '')
        if (base === '') {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('skin.css missing')
          return
        }
        const patches = await readFile(path.join(dir, 'patches.css'), 'utf8').catch(() => '')
        const stamp = Date.now().toString(36)
        const appearance = await readAppearance()
        const body = [scopeSkin(base), scopePatches(patches), appearance.enabled ? (await resolvedWallpaper(stamp)) : ''].join('\n')
        res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' })
        res.end(body)
      } catch (error) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
        res.end(String(error?.message ?? error))
      }
    },
  }

  const assetRoute = {
    kind: 'exact',
    path: '/muro/asset',
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const requested = url.searchParams.get('file')
        let file = null
        if (typeof requested === 'string' && /^[A-Za-z0-9._@-]+\.jpg$/.test(requested)) {
          const candidate = path.join(skinDir(), 'assets', requested)
          if (await exists(candidate)) file = candidate
        }
        if (file === null) {
          const theme = url.searchParams.get('theme') === 'light' ? 'light' : 'dark'
          file = await currentAsset(theme)
        }
        if (file === null) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
          res.end('no wallpaper')
          return
        }
        const data = await readFile(file)
        res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' })
        res.end(data)
      } catch (error) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
        res.end(String(error?.message ?? error))
      }
    },
  }

  const appearanceRoute = {
    kind: 'exact',
    path: '/muro/appearance',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        json(res, 200, { ok: true, ...(await readAppearance()) })
        return
      }
      try {
        const body = await readBody(req)
        const current = await readAppearance()
        const next = {
          enabled: typeof body.enabled === 'boolean' ? body.enabled : current.enabled,
          settings: body.settings === undefined ? current.settings : normalizeSettings(body.settings),
          updatedAt: Date.now(),
        }
        await writeAppearance(next)
        json(res, 200, { ok: true, ...next })
      } catch (error) {
        json(res, 500, { ok: false, error: String(error?.message ?? error) })
      }
    },
  }

  ctx.effect(() => { void loadConfig(); return undefined }, 'muro: config')
  ctx.effect(() => ctx.webServer.register(cacheRoute), 'muro: /muro/cache route')
  ctx.effect(() => ctx.webServer.register(skinCssRoute), 'muro: /muro/skin.css route')
  ctx.effect(() => ctx.webServer.register(assetRoute), 'muro: /muro/asset route')
  ctx.effect(() => ctx.webServer.register(appearanceRoute), 'muro: /muro/appearance route')
  ctx.effect(() => ctx.webServer.register(stateRoute), 'muro: /muro/state route')
  ctx.effect(() => ctx.webServer.register(installRoute), 'muro: /muro/install route')
  ctx.effect(() => ctx.webServer.register(catalogRoute), 'muro: /muro/catalog route')
  ctx.effect(() => ctx.webServer.register(downloadRoute), 'muro: /muro/download route')
  ctx.effect(() => ctx.webServer.register(jobRoute), 'muro: /muro/job route')
  ctx.effect(() => ctx.webServer.register(applyRoute), 'muro: /muro/apply route')
}