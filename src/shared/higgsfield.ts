import catalog from './higgsfield-catalog.json'
import type { ApiProvider, AspectRatio, ModelOption } from './types'

/**
 * Every Higgsfield endpoint that can draw a clip image or animate one, generated from docs.higgsfield.ai
 * (see higgsfield-catalog.json). Request bodies are built from each model's own JSON schema, so a new
 * model only needs a catalog entry.
 */

interface FieldSchema {
  type?: string
  enum?: (string | number)[]
  default?: unknown
  minimum?: number
  maximum?: number
  maxLength?: number
  maxItems?: number
}

export interface HfModel {
  id: string
  name: string
  family: string
  kind: 'image' | 'video'
  /** Where the clip image (video) or the character sheets (image) go in the request. */
  input: { field: string | null; mode: 'none' | 'first-frame' | 'reference'; max: number }
  required: string[]
  props: Record<string, FieldSchema>
  durations: { values: number[] } | { min: number; max: number } | null
  tags: string[]
  /** Sentence shown under the name in the picker; replaces the generated summary. */
  note?: string
  /** Constant fields sent with every request (endpoints outside Higgsfield). */
  fixed?: Record<string, unknown>
  /** How the length is sent when the endpoint does not take plain seconds. */
  durationAs?: 'text' | 'suffix' | 'frames'
  /** The resolution used until the project picks one, when the model offers several. */
  defaultResolution?: string
  /** List price in USD: per image, or per video second by resolution. Higgsfield models are priced by its own estimate endpoint instead. */
  usd?: { image?: number; second?: Record<string, number> }
}

const MODELS = (catalog as unknown as { models: HfModel[] }).models

export const HF_IMAGE_MODELS = MODELS.filter((m) => m.kind === 'image')
export const HF_VIDEO_MODELS = MODELS.filter((m) => m.kind === 'video')

/** Services that can run a model. Every one of them can be used alone; none is required. */
export type ModelProvider = 'higgsfield' | 'gemini' | 'fal' | 'cloudflare' | 'cli'

export const PROVIDER_LABEL: Record<ModelProvider, string> = {
  higgsfield: 'Higgsfield',
  gemini: 'Google Gemini',
  fal: 'Fal.ai',
  cloudflare: 'Cloudflare',
  cli: 'CLI di komputer'
}

/** The saved key (or tested setup) that a provider's models need. */
export const PROVIDER_KEY: Record<ModelProvider, ApiProvider> = {
  higgsfield: 'higgsfield',
  gemini: 'gemini',
  fal: 'fal',
  cloudflare: 'cloudflare',
  cli: 'cli-image'
}

/** Which service runs a model, read from its id. Only Higgsfield ids have no prefix. */
export function providerOfModel(id: string | null | undefined): ModelProvider {
  if (!id) return 'higgsfield'
  if (id.startsWith('gemini/')) return 'gemini'
  if (id.startsWith('fal-ai/')) return 'fal'
  if (id.startsWith('@cf/')) return 'cloudflare'
  if (id.startsWith('cli/')) return 'cli'
  return 'higgsfield'
}

/** Models that were removed by their maker, mapped to the one that replaces them, so saved projects keep working. */
const RENAMED_MODELS: Record<string, string> = {
  // Imagen 3 was shut down by Google (Nov 2025); Nano Banana 2 Lite is the cheapest image model that replaced it.
  'gemini/imagen-3.0-generate-002': 'gemini/gemini-3.1-flash-lite-image'
}

function textToImage(
  id: string,
  name: string,
  family: string,
  tags: string[],
  note: string,
  usd: number,
  maxLength: number
): HfModel {
  return {
    id,
    name,
    family,
    kind: 'image',
    input: { field: null, mode: 'none', max: 0 },
    required: ['prompt'],
    props: { prompt: { type: 'string', maxLength } },
    durations: null,
    tags,
    note,
    usd: { image: usd }
  }
}

export const CLOUDFLARE_IMAGE_MODELS: HfModel[] = [
  textToImage(
    '@cf/bytedance/stable-diffusion-xl-lightning',
    'SDXL Lightning · Cloudflare',
    'Cloudflare',
    ['Cloudflare', 'Hemat / Cepat'],
    'SDXL Lightning via Cloudflare Workers AI · ukuran 16:9 atau 9:16 sungguhan · beta, gratis',
    0,
    2000
  ),
  textToImage(
    '@cf/black-forest-labs/flux-1-schnell',
    'FLUX.1 [schnell] · Cloudflare',
    'Flux',
    ['Cloudflare', 'Flux', 'Hemat / Cepat'],
    'FLUX.1 Schnell via Cloudflare Workers AI · ukuran tidak bisa diatur (hasilnya persegi, terpotong di video 16:9)',
    0.0006,
    2048
  ),
  textToImage(
    '@cf/leonardo/lucid-origin',
    'Lucid Origin · Cloudflare',
    'Cloudflare',
    ['Cloudflare'],
    'Lucid Origin (Leonardo) via Cloudflare Workers AI · teks dan detail tajam, ukuran 16:9 atau 9:16',
    0.04,
    2000
  )
]

export const FAL_IMAGE_MODELS: HfModel[] = [
  textToImage(
    'fal-ai/flux/schnell',
    'FLUX.1 [schnell] · Fal.ai',
    'Flux',
    ['Fal.ai', 'Flux', 'Hemat / Cepat'],
    'FLUX.1 Schnell via Fal.ai · sangat cepat dan hemat',
    0.003,
    4000
  ),
  textToImage('fal-ai/flux/dev', 'FLUX.1 [dev] · Fal.ai', 'Flux', ['Fal.ai', 'Flux'], 'FLUX.1 Dev via Fal.ai · kualitas tinggi', 0.025, 4000)
]

export const GEMINI_IMAGE_MODELS: HfModel[] = [
  textToImage(
    'gemini/gemini-3.1-flash-lite-image',
    'Nano Banana 2 Lite · Google',
    'Google',
    ['Google', 'Hemat / Cepat'],
    'Gemini 3.1 Flash Lite Image via kunci Gemini · model gambar Google tercepat dan termurah',
    0.0336,
    4000
  ),
  textToImage(
    'gemini/gemini-nano-banana-2.1',
    'Nano Banana 2.1 · Google',
    'Google',
    ['Google'],
    'Gemini Nano Banana 2.1 via kunci Gemini · kualitas dan teks dalam gambar lebih baik',
    0.0336,
    4000
  )
]

export const CLI_IMAGE_MODELS: HfModel[] = [
  textToImage(
    'cli/image',
    'CLI di komputer',
    'CLI',
    ['CLI', 'Tanpa kunci'],
    'Gambar dari CLI di komputer (Antigravity atau perintah sendiri) · tanpa biaya per gambar, ±1 menit per gambar, tanpa lembar karakter',
    0,
    4000
  )
]

/** Cheapest providers first, Higgsfield last: the list opens on what costs least, and no provider is pinned to the top. */
export const ALL_IMAGE_MODELS: HfModel[] = [
  ...CLOUDFLARE_IMAGE_MODELS,
  ...FAL_IMAGE_MODELS,
  ...GEMINI_IMAGE_MODELS,
  ...CLI_IMAGE_MODELS,
  ...HF_IMAGE_MODELS
]

/** Wan makes its clip from a frame count at this speed (Fal interpolates it up afterwards). */
const WAN_FPS = 16

function falVideo(spec: {
  id: string
  name: string
  family: string
  tags: string[]
  note: string
  resolutions: string[]
  defaultResolution: string
  /** Whether the endpoint takes `aspect_ratio` (Hailuo follows the frame's own shape). */
  aspect: boolean
  /** Whether the endpoint can make its own soundtrack, which this app switches off (narration and music come from the editor). */
  audio: boolean
  durations: HfModel['durations']
  durationAs?: HfModel['durationAs']
  fixed?: Record<string, unknown>
  second: Record<string, number>
}): HfModel {
  const props: HfModel['props'] = {
    prompt: { type: 'string', maxLength: 2000 },
    resolution: { enum: spec.resolutions }
  }
  if (spec.aspect) props.aspect_ratio = { enum: ['16:9', '9:16'] }
  if (spec.audio) props.generate_audio = { type: 'boolean' }
  return {
    id: spec.id,
    name: spec.name,
    family: spec.family,
    kind: 'video',
    input: { field: 'image_url', mode: 'first-frame', max: 1 },
    required: ['image_url', 'prompt'],
    props,
    durations: spec.durations,
    durationAs: spec.durationAs,
    fixed: spec.fixed,
    defaultResolution: spec.defaultResolution,
    tags: spec.tags,
    note: spec.note,
    usd: { second: spec.second }
  }
}

export const FAL_VIDEO_MODELS: HfModel[] = [
  falVideo({
    id: 'fal-ai/wan/v2.2-a14b/image-to-video',
    name: 'Wan 2.2 A14B · Fal.ai',
    family: 'Wan',
    tags: ['Fal.ai', 'Wan', 'Hemat / Cepat'],
    note: 'Wan 2.2 (Alibaba) via Fal.ai · 2–10 dtk, tanpa suara · paling murah, gerak natural',
    resolutions: ['480p', '720p'],
    defaultResolution: '720p',
    aspect: true,
    audio: false,
    durations: { min: 2, max: 10 },
    durationAs: 'frames',
    fixed: { enable_prompt_expansion: false },
    second: { '480p': 0.04, '720p': 0.08 }
  }),
  falVideo({
    id: 'fal-ai/ltx-2.3/image-to-video/fast',
    name: 'LTX 2.3 Fast · Fal.ai',
    family: 'LTX',
    tags: ['Fal.ai', 'LTX', 'Hemat / Cepat'],
    note: 'LTX 2.3 Fast (Lightricks) via Fal.ai · 6, 8 atau 10 dtk · mulai dari 1080p',
    resolutions: ['1080p', '1440p'],
    defaultResolution: '1080p',
    aspect: true,
    audio: true,
    durations: { values: [6, 8, 10] },
    second: { '1080p': 0.06, '1440p': 0.12 }
  }),
  falVideo({
    id: 'fal-ai/minimax/hailuo-02/standard/image-to-video',
    name: 'Hailuo 02 Standard · Fal.ai',
    family: 'Hailuo',
    tags: ['Fal.ai', 'Hailuo', 'Hemat / Cepat'],
    note: 'Hailuo 02 (MiniMax) via Fal.ai · 6 atau 10 dtk, 768p, tanpa suara · gerak halus',
    resolutions: ['768P'],
    defaultResolution: '768P',
    aspect: false,
    audio: false,
    durations: { values: [6, 10] },
    durationAs: 'text',
    fixed: { prompt_optimizer: false },
    second: { '768P': 0.045 }
  }),
  falVideo({
    id: 'fal-ai/veo3.1/lite/image-to-video',
    name: 'Veo 3.1 Lite · Fal.ai',
    family: 'Veo',
    tags: ['Fal.ai', 'Veo'],
    note: 'Veo 3.1 Lite (Google) via Fal.ai · 4, 6 atau 8 dtk · kualitas tertinggi di antara pilihan murah (suara dimatikan)',
    resolutions: ['720p', '1080p'],
    defaultResolution: '720p',
    aspect: true,
    audio: true,
    durations: { values: [4, 6, 8] },
    durationAs: 'suffix',
    second: { '720p': 0.03, '1080p': 0.05 }
  })
]

export const ALL_VIDEO_MODELS: HfModel[] = [...FAL_VIDEO_MODELS, ...HF_VIDEO_MODELS]

/** What a project falls back to when nothing better is known: the Higgsfield defaults every older project was made with. */
export const DEFAULT_IMAGE_MODEL = 'marketing-studio/image/sunburst'
export const DEFAULT_VIDEO_MODEL = 'kling-video/v3.0/std/image-to-video'

/** The picker's "Rekomendasi" rows: the cheapest models that are good enough for story clips. */
export const RECOMMENDED_IMAGE_MODEL = 'gemini/gemini-3.1-flash-lite-image'
export const RECOMMENDED_VIDEO_MODEL = 'fal-ai/wan/v2.2-a14b/image-to-video'

export function canonicalModelId(id: string | null | undefined): string | null | undefined {
  return id ? (RENAMED_MODELS[id] ?? id) : id
}

export function getImageModel(id: string | null | undefined): HfModel {
  const want = canonicalModelId(id)
  return ALL_IMAGE_MODELS.find((m) => m.id === want) ?? ALL_IMAGE_MODELS.find((m) => m.id === DEFAULT_IMAGE_MODEL)!
}

export function getVideoModel(id: string | null | undefined): HfModel {
  const want = canonicalModelId(id)
  return ALL_VIDEO_MODELS.find((m) => m.id === want) ?? ALL_VIDEO_MODELS.find((m) => m.id === DEFAULT_VIDEO_MODEL)!
}

/** Image providers by preference, cheapest first, used to pick models for a new project from the providers that are ready. */
const IMAGE_PREFERENCE: ModelProvider[] = ['cloudflare', 'fal', 'gemini', 'cli', 'higgsfield']
const VIDEO_PREFERENCE: ModelProvider[] = ['fal', 'higgsfield']

/**
 * The models a new project starts with: the first model of the cheapest provider whose key works. With no working
 * provider the Higgsfield defaults stay, so the pickers still show something valid.
 */
export function defaultModelsFor(ready: ReadonlySet<ModelProvider>): { imageModel: string; videoModel: string } {
  const image = IMAGE_PREFERENCE.find((p) => ready.has(p))
  const video = VIDEO_PREFERENCE.find((p) => ready.has(p))
  return {
    imageModel: (image && image !== 'higgsfield' ? ALL_IMAGE_MODELS.find((m) => providerOfModel(m.id) === image)?.id : undefined) ?? DEFAULT_IMAGE_MODEL,
    videoModel: (video && video !== 'higgsfield' ? ALL_VIDEO_MODELS.find((m) => providerOfModel(m.id) === video)?.id : undefined) ?? DEFAULT_VIDEO_MODEL
  }
}

/** How many character sheets an image model accepts as references. 0 means sheets are not used. */
export function maxRefs(m: HfModel): number {
  return m.kind === 'image' && m.input.mode === 'reference' ? m.input.max : 0
}

/** Longest prompt the model accepts. Endpoints without a documented limit get a conservative one. */
export function promptLimit(m: HfModel): number {
  return m.props.prompt?.maxLength ?? (m.kind === 'video' ? 2500 : 4000)
}

/** The video length to request for a clip: the shortest allowed length that covers it, or the longest. */
export function fitDuration(m: HfModel, seconds: number): number | null {
  const d = m.durations
  if (!d) return null
  const want = Math.max(1, Math.ceil(seconds))
  if ('values' in d) {
    const values = [...d.values].sort((a, b) => a - b)
    return values.find((v) => v >= want) ?? values[values.length - 1]
  }
  return Math.min(d.max, Math.max(d.min, want))
}

export function durationLabel(m: HfModel): string | null {
  const d = m.durations
  if (!d) return null
  return 'values' in d ? `${d.values.join(' / ')} dtk` : `${d.min}–${d.max} dtk`
}

function pick(s: FieldSchema | undefined, prefer: (string | number)[]): string | number | undefined {
  if (!s?.enum?.length) return undefined
  for (const p of prefer) if (s.enum.includes(p)) return p
  return (s.default as string | number | undefined) ?? s.enum[0]
}

function clip(text: string, limit: number): string {
  if (text.length <= limit) return text
  const cut = text.slice(0, limit)
  const space = cut.lastIndexOf(' ')
  return (space > limit * 0.8 ? cut.slice(0, space) : cut).trim()
}

/**
 * The resolution sent to the model: the requested one when the model offers it, else 2K stills (enough room for
 * camera moves) and 1080p video, or the closest the model offers.
 */
function resolutionFor(m: HfModel, want?: string | null): string | number | undefined {
  const offered = (v: string): string | number | undefined => m.props.resolution?.enum?.find((o) => String(o) === v)
  if (want && offered(want) !== undefined) return offered(want)
  if (m.defaultResolution && offered(m.defaultResolution) !== undefined) return offered(m.defaultResolution)
  return pick(m.props.resolution, m.kind === 'image' ? ['2k', '2K', '1080p', '1k'] : ['1080p', '2K', '2k', '720p'])
}

/** Resolutions a model offers, lowest first, as picker values. */
export function resolutionOptions(m: HfModel): string[] {
  const rank = (v: string): number => {
    const k = /^(\d+(?:\.\d+)?)k$/i.exec(v)
    return k ? Number(k[1]) * 1000 : parseInt(v, 10) || 0
  }
  return (m.props.resolution?.enum ?? []).map(String).sort((a, b) => rank(a) - rank(b))
}

/** The resolution a project's videos actually use with this model. */
export function effectiveResolution(m: HfModel, want?: string | null): string | null {
  const r = resolutionFor(m, want)
  return r === undefined ? null : String(r)
}

/**
 * Clip stills are only a base for camera moves, so they start on the cheap end. Models that bill by size and
 * quality (GPT Image charges per token) cost several times more at 2K/high.
 */
export const DEFAULT_IMAGE_RESOLUTION = '1k'
export const DEFAULT_IMAGE_QUALITY = 'medium'

export interface ImageSettings {
  resolution?: string | null
  quality?: string | null
}

/** Qualities worth offering for stills; the top tiers (xhigh, max) cost far more than a clip image needs. */
const IMAGE_QUALITIES = ['low', 'medium', 'high']

/** Qualities a model offers, lowest first, or none when it has no quality switch. */
export function qualityOptions(m: HfModel): string[] {
  return (m.props.quality?.enum ?? []).map(String).filter((q) => IMAGE_QUALITIES.includes(q))
}

function qualityFor(m: HfModel, want?: string | null): string | undefined {
  const values = m.props.quality?.enum
  if (!values?.length) return undefined
  if (want && values.includes(want)) return want
  return String(values.includes('high') ? 'high' : values[values.length - 1])
}

/**
 * A project's stored choice can name something the current model lacks (picked for another model), so anything
 * unsupported falls back to the economical default instead of the model's own, often priciest, preference.
 */
function stillQuality(m: HfModel, want?: string | null): string | undefined {
  const offered = (v?: string | null): v is string => !!v && !!m.props.quality?.enum?.includes(v)
  return offered(want) ? want : offered(DEFAULT_IMAGE_QUALITY) ? DEFAULT_IMAGE_QUALITY : undefined
}

function stillResolution(m: HfModel, want?: string | null): string | undefined {
  const offered = (v?: string | null): v is string => !!v && !!m.props.resolution?.enum?.some((o) => String(o) === v)
  return offered(want) ? want : offered(DEFAULT_IMAGE_RESOLUTION) ? DEFAULT_IMAGE_RESOLUTION : undefined
}

/** The quality a still will actually be requested at, or null when the model has no quality switch. */
export function effectiveQuality(m: HfModel, want?: string | null): string | null {
  return qualityFor(m, stillQuality(m, want)) ?? null
}

/** The size a still will actually be requested at. */
export function effectiveImageResolution(m: HfModel, want?: string | null): string | null {
  return effectiveResolution(m, stillResolution(m, want))
}

/** Fields every model shares: prompt, frame, quality, and switching off extras we never use. */
function common(
  m: HfModel,
  prompt: string,
  aspect: AspectRatio,
  resolution?: string | null,
  quality?: string | null
): Record<string, unknown> {
  const p = m.props
  const body: Record<string, unknown> = { prompt: clip(prompt, promptLimit(m)) }
  if (p.aspect_ratio) {
    const values = p.aspect_ratio.enum
    if (!values || values.includes(aspect)) body.aspect_ratio = aspect
  }
  const res = resolutionFor(m, resolution)
  if (res !== undefined) body.resolution = res
  const q = qualityFor(m, quality)
  if (q !== undefined) body.quality = q
  if (p.mode?.enum) body.mode = pick(p.mode, [])
  if (p.batch_size) body.batch_size = 1
  if (p.num_images) body.num_images = 1
  // The story already describes each shot in detail, so rewriting it would drift from the storyboard.
  if (p.enhance_prompt) body.enhance_prompt = false
  if (p.prompt_extend) body.prompt_extend = false
  // Narration and music come from the editor; generated sound would be dropped anyway.
  if (p.sound?.enum?.includes('off')) body.sound = 'off'
  if (p.generate_audio) body.generate_audio = false
  return body
}

function checkRequired(m: HfModel, body: Record<string, unknown>): Record<string, unknown> {
  const missing = m.required.filter((f) => body[f] === undefined)
  if (missing.length) throw new Error(`Model ${m.name} butuh ${missing.join(', ')}, yang belum didukung aplikasi ini. Pilih model lain.`)
  return body
}

/** Settings left empty fall back to the economical defaults; character sheets pass explicit ones. */
export function imageBody(m: HfModel, prompt: string, aspect: AspectRatio, refs: string[], settings: ImageSettings = {}): Record<string, unknown> {
  const body = common(m, prompt, aspect, stillResolution(m, settings.resolution), stillQuality(m, settings.quality))
  const limit = maxRefs(m)
  if (limit > 0 && refs.length && m.input.field) body[m.input.field] = refs.slice(0, limit)
  return checkRequired(m, body)
}

/**
 * Said in every video prompt. Narration and music are added in the editor, but some models (Veo, Grok,
 * MiniMax, ...) make their own soundtrack and have no switch for it.
 */
export const NO_MUSIC = 'Silent clip: no background music, no soundtrack, no singing or humming.'

/** The video prompt with the no-music rule, trimmed so the rule itself never gets cut off. */
export function videoPrompt(m: HfModel, prompt: string): string {
  return `${clip(prompt.trim(), promptLimit(m) - NO_MUSIC.length - 1)} ${NO_MUSIC}`
}

export function videoBody(
  m: HfModel,
  prompt: string,
  imageUrl: string,
  seconds: number,
  aspect: AspectRatio,
  resolution?: string | null
): Record<string, unknown> {
  const body = common(m, videoPrompt(m, prompt), aspect, resolution)
  const duration = fitDuration(m, seconds)
  if (duration != null) {
    if (m.durationAs === 'frames') {
      // Wan takes a frame count (17 to 161) instead of seconds.
      body.num_frames = Math.min(161, Math.max(17, Math.round(duration * WAN_FPS) + 1))
      body.frames_per_second = WAN_FPS
    } else body.duration = m.durationAs === 'text' ? String(duration) : m.durationAs === 'suffix' ? `${duration}s` : duration
  }
  if (m.input.field) body[m.input.field] = m.input.mode === 'reference' ? [imageUrl] : imageUrl
  Object.assign(body, m.fixed)
  return checkRequired(m, body)
}

/** USD for one image, or for `seconds` of video at `resolution`, from a model's list price. Null when the model has none (Higgsfield). */
export function listPriceUsd(m: HfModel, seconds = 0, resolution?: string | null): number | null {
  if (m.usd?.image != null) return m.usd.image
  const rates = m.usd?.second
  if (!rates) return null
  const res = effectiveResolution(m, resolution)
  const rate = res != null ? rates[res] : undefined
  return rate == null ? null : rate * seconds
}

const usdFigure = (n: number): string => String(Number(n.toPrecision(2)))

/** The price as the picker shows it, e.g. "US$0.04–0.08 / detik". Null for Higgsfield, which shows credits. */
export function priceNote(m: HfModel): string | null {
  if (m.usd?.image != null) return m.usd.image === 0 ? 'Gratis' : `US$${usdFigure(m.usd.image)} / gambar`
  const rates = Object.values(m.usd?.second ?? {})
  if (!rates.length) return null
  const lo = Math.min(...rates)
  const hi = Math.max(...rates)
  return lo === hi ? `US$${usdFigure(lo)} / detik` : `US$${usdFigure(lo)}–${usdFigure(hi)} / detik`
}

/** What the app will actually request from this model, in words. */
export function describeModel(m: HfModel): string {
  if (m.note) return m.note
  if (m.kind === 'image') {
    // Size and quality are picked per project, next to the model.
    const refs = maxRefs(m)
    return refs ? `pakai lembar karakter (maks ${refs})` : 'tanpa lembar karakter'
  }
  // Video resolution is picked per project, next to the model.
  return [durationLabel(m), m.input.mode === 'reference' ? 'gambar klip jadi referensi' : 'mulai dari gambar klip'].filter(Boolean).join(' · ')
}

/** Picker rows. The recommended model comes first with a "Rekomendasi" tag, then the rest in catalog order (cheapest providers first). */
export function hfModelOptions(kind: 'image' | 'video'): ModelOption[] {
  const list = kind === 'image' ? ALL_IMAGE_MODELS : ALL_VIDEO_MODELS
  const recommended = kind === 'image' ? RECOMMENDED_IMAGE_MODEL : RECOMMENDED_VIDEO_MODEL
  return [...list.filter((m) => m.id === recommended), ...list.filter((m) => m.id !== recommended)].map((m) => {
    const own = providerOfModel(m.id) === 'higgsfield'
    return {
      id: m.id,
      name: m.name,
      family: m.family,
      description: describeModel(m),
      priceNote: priceNote(m) ?? undefined,
      tags: [...(m.id === recommended ? ['Rekomendasi'] : []), ...(own ? ['Higgsfield'] : []), ...m.tags]
    }
  })
}
