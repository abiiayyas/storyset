import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { graphicKey, graphicSize, type GraphicSpec } from '@shared/graphics'
import type { AspectRatio, Job } from '@shared/types'
import { emit } from './events'
import { runJob } from './jobs'
import { assetAbsPath } from './paths'
import { activeJobFor, clipsOf, getAsset, getClip, getProject, insertAsset, insertJob, patchClip, touchProject } from './repo'
import { probeDurationMs } from './services/audio'

/**
 * Loaded on first use, not at startup: Remotion pulls in React and a native compositor, and a problem there should
 * only break motion scenes, never the whole app.
 */
const loadRenderer = (): Promise<typeof import('@remotion/renderer')> => import('@remotion/renderer')

/**
 * Motion scenes are drawn by Remotion: the scenes in src/remotion are bundled once into a static site, then
 * @remotion/renderer opens it in Chrome Headless Shell and captures every frame. The preview in the app runs the very
 * same React component, so what the user sees while editing is what gets rendered.
 */

interface RenderAssets {
  serveUrl: string
  /** Undefined in development, where Remotion finds the browser it downloaded into node_modules itself. */
  browserExecutable?: string
  /** Undefined in development. Installed, the binaries must come from the unpacked asar: Remotion chmods them. */
  binariesDirectory?: string
}

function newestMtime(path: string): number {
  const st = statSync(path)
  if (!st.isDirectory()) return st.mtimeMs
  return readdirSync(path).reduce((m, name) => Math.max(m, newestMtime(join(path, name))), st.mtimeMs)
}

/** Chrome Headless Shell sits a few folders deep (platform / versioned folder) under the shipped `remotion/chrome`. */
function findChrome(dir: string, depth = 0): string | null {
  if (depth > 4 || !existsSync(dir)) return null
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (/^chrome-headless-shell(\.exe)?$/.test(name) && statSync(full).isFile()) return full
    if (statSync(full).isDirectory()) {
      const hit = findChrome(full, depth + 1)
      if (hit) return hit
    }
  }
  return null
}

/** Runs scripts/prepare-remotion.mjs with Electron's own Node, so development needs no separate Node setup. */
function buildBundle(root: string): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>()
  const child = spawn(process.execPath, [join(root, 'scripts', 'prepare-remotion.mjs'), '--bundle'], {
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    windowsHide: true
  })
  let log = ''
  child.stdout.on('data', (d: Buffer) => (log += d.toString()))
  child.stderr.on('data', (d: Buffer) => (log += d.toString()))
  child.on('error', reject)
  child.on('close', (code) =>
    code === 0 ? resolve() : reject(new Error(`Gagal menyiapkan mesin motion:\n${log.trim().split('\n').slice(-6).join('\n')}`))
  )
  return promise
}

let assetsReady: Promise<RenderAssets> | null = null

async function prepareAssets(): Promise<RenderAssets> {
  if (app.isPackaged) {
    const base = join(process.resourcesPath, 'remotion')
    const browserExecutable = findChrome(join(base, 'chrome'))
    if (!existsSync(join(base, 'bundle', 'index.html')) || !browserExecutable) {
      throw new Error('Mesin motion tidak ikut terpasang di aplikasi ini. Pasang ulang dari installer terbaru.')
    }
    const remotionModules = join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@remotion')
    const compositor = existsSync(remotionModules) ? readdirSync(remotionModules).find((n) => n.startsWith('compositor-')) : undefined
    if (!compositor) throw new Error('Mesin render motion tidak ikut terpasang di aplikasi ini. Pasang ulang dari installer terbaru.')
    return { serveUrl: join(base, 'bundle'), browserExecutable, binariesDirectory: join(remotionModules, compositor) }
  }
  const root = app.getAppPath()
  const out = join(root, 'resources-gen', 'remotion-bundle')
  const sources = [join(root, 'src', 'remotion'), join(root, 'src', 'shared', 'graphics.ts')]
  const stale = !existsSync(join(out, 'index.html')) || newestMtime(join(out, 'index.html')) < Math.max(...sources.map(newestMtime))
  if (stale) await buildBundle(root)
  await (await loadRenderer()).ensureBrowser()
  return { serveUrl: out }
}

/** Prepared once per run; a failure is not kept, so fixing the cause and retrying works without a restart. */
function renderAssets(): Promise<RenderAssets> {
  assetsReady ??= prepareAssets().catch((e) => {
    assetsReady = null
    throw e
  })
  return assetsReady
}

export async function renderGraphic(o: {
  spec: GraphicSpec
  durationMs: number
  aspect: AspectRatio
  outPath: string
  signal: AbortSignal
  onProgress: (p: number) => void
}): Promise<void> {
  const { serveUrl, browserExecutable, binariesDirectory } = await renderAssets()
  const { makeCancelSignal, renderMedia, selectComposition } = await loadRenderer()
  const { width, height } = graphicSize(o.aspect)
  const inputProps = { spec: o.spec, width, height, durationMs: o.durationMs }
  const composition = await selectComposition({ serveUrl, id: 'graphic', inputProps, browserExecutable, binariesDirectory, logLevel: 'error' })
  const { cancel, cancelSignal } = makeCancelSignal()
  o.signal.addEventListener('abort', cancel, { once: true })
  mkdirSync(dirname(o.outPath), { recursive: true })
  try {
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: o.outPath,
      inputProps,
      browserExecutable,
      binariesDirectory,
      cancelSignal,
      // The export adds narration and music itself.
      muted: true,
      // Text edges show JPEG artifacts at the default quality.
      jpegQuality: 95,
      logLevel: 'error',
      onProgress: ({ progress }) => o.onProgress(progress)
    })
  } finally {
    o.signal.removeEventListener('abort', cancel)
  }
}

/** Renders a motion clip and stores the result as its video, so the timeline and the export treat it like any video. */
export function generateClipGraphic(clipId: string): Job {
  const existing = activeJobFor({ clipId }, 'graphic')
  if (existing) return existing
  const clip = getClip(clipId)
  if (!clip.graphic) throw new Error('Klip ini bukan scene motion.')
  const job = insertJob({ projectId: clip.projectId, clipId, kind: 'graphic', provider: 'remotion' })
  emit.job(job)
  return runJob(job, 'motion', async (ctx) => {
    const fresh = getClip(clipId)
    if (!fresh.graphic) throw new Error('Klip ini bukan scene motion.')
    const project = getProject(fresh.projectId)
    const rel = `videos/${randomUUID()}.mp4`
    const abs = assetAbsPath(project.id, rel)
    ctx.progress(0.03, 'Menyiapkan mesin motion')
    await renderGraphic({
      spec: fresh.graphic,
      durationMs: fresh.durationMs,
      aspect: project.aspectRatio,
      outPath: abs,
      signal: ctx.signal,
      onProgress: (p) => ctx.progress(0.05 + p * 0.9, 'Merender scene motion')
    })
    const size = graphicSize(project.aspectRatio)
    const asset = insertAsset({
      projectId: project.id,
      clipId,
      kind: 'video',
      provider: 'remotion',
      model: `graphic/${fresh.graphic.template}`,
      prompt: JSON.stringify(fresh.graphic),
      localPath: rel,
      durationMs: await probeDurationMs(abs).catch(() => fresh.durationMs),
      width: size.width,
      height: size.height,
      meta: { graphicKey: graphicKey(fresh.graphic, fresh.durationMs, project.aspectRatio) }
    })
    emit.asset(asset)
    const patch = { videoAssetId: asset.id, motionType: 'video' as const, mediaInMs: 0 }
    patchClip(clipId, patch)
    emit.clip({ clipId, patch })
    touchProject(project.id)
    return asset.id
  })
}

/** Every motion clip without a render, or whose render no longer matches its spec, length or frame format. */
export function generateMissingGraphics(projectId: string): Job[] {
  const aspect = getProject(projectId).aspectRatio
  return clipsOf(projectId)
    .filter((c) => c.graphic && graphicKey(c.graphic, c.durationMs, aspect) !== getAsset(c.videoAssetId)?.meta.graphicKey)
    .map((c) => generateClipGraphic(c.id))
}
