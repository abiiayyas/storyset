import type { AspectRatio } from './types'

/**
 * Motion scenes: a clip drawn from a template (title card, bullet list, counting number, bar chart) instead of an
 * image. The Remotion scenes in src/remotion draw the spec; the editor preview (@remotion/player) and the final
 * render (@remotion/renderer) use the same component, so what the user sees is what gets exported.
 * The rendered file is stored as the clip's video, so the timeline and the export treat it like any other video.
 */

export type GraphicTemplate = 'title' | 'bullets' | 'stat' | 'bars'
export type GraphicTheme = 'gelap' | 'terang' | 'hangat'

export interface GraphicBar {
  label: string
  value: number
}

export type GraphicSpec = { theme: GraphicTheme } & (
  | { template: 'title'; title: string; subtitle: string }
  | { template: 'bullets'; title: string; items: string[] }
  | { template: 'stat'; value: number; prefix: string; suffix: string; label: string; caption: string }
  | { template: 'bars'; title: string; unit: string; bars: GraphicBar[] }
)

/** Bump when a scene's look changes, so renders made with the old look show up as outdated. */
export const GRAPHIC_VERSION = 1
export const GRAPHIC_FPS = 30

export const GRAPHIC_TEMPLATES: { id: GraphicTemplate; label: string; hint: string }[] = [
  { id: 'title', label: 'Judul', hint: 'Kartu judul besar dengan subjudul' },
  { id: 'bullets', label: 'Poin', hint: 'Daftar poin yang muncul satu per satu' },
  { id: 'stat', label: 'Angka', hint: 'Satu angka besar yang berhitung naik' },
  { id: 'bars', label: 'Grafik', hint: 'Grafik batang untuk membandingkan nilai' }
]

export const GRAPHIC_THEMES: { id: GraphicTheme; label: string; bg: string; fg: string; accent: string; muted: string }[] = [
  { id: 'gelap', label: 'Gelap', bg: '#1F1D1A', fg: '#FBF7EF', accent: '#FFD43B', muted: '#A8A196' },
  { id: 'terang', label: 'Terang', bg: '#FBF7EF', fg: '#1F1D1A', accent: '#C2321A', muted: '#6E675D' },
  { id: 'hangat', label: 'Hangat', bg: '#E4572E', fg: '#FFF8EC', accent: '#FFD43B', muted: '#FFD9C9' }
]

export function themeOf(id: GraphicTheme): (typeof GRAPHIC_THEMES)[number] {
  return GRAPHIC_THEMES.find((t) => t.id === id) ?? GRAPHIC_THEMES[0]
}

export const MAX_BULLETS = 6
export const MAX_BARS = 8
const MAX_TITLE = 90
const MAX_LINE = 110

/** A starting point for a template, using the scene title where it fits. */
export function defaultGraphic(template: GraphicTemplate, title = ''): GraphicSpec {
  const t = title.trim().slice(0, MAX_TITLE)
  switch (template) {
    case 'title':
      return { theme: 'gelap', template, title: t || 'Judul adegan', subtitle: '' }
    case 'bullets':
      return { theme: 'gelap', template, title: t || 'Poin penting', items: ['Poin pertama', 'Poin kedua', 'Poin ketiga'] }
    case 'stat':
      return { theme: 'gelap', template, value: 100, prefix: '', suffix: '%', label: t || 'Keterangan angka', caption: '' }
    case 'bars':
      return {
        theme: 'gelap',
        template,
        title: t || 'Perbandingan',
        unit: '',
        bars: [
          { label: 'A', value: 30 },
          { label: 'B', value: 60 },
          { label: 'C', value: 45 }
        ]
      }
  }
}

/** Switches template but keeps the theme and the shared text, so flipping through templates loses little. */
export function switchTemplate(spec: GraphicSpec, template: GraphicTemplate): GraphicSpec {
  if (spec.template === template) return spec
  const title = 'title' in spec ? spec.title : spec.template === 'stat' ? spec.label : ''
  return { ...defaultGraphic(template, title), theme: spec.theme }
}

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/**
 * Turns untrusted data (an AI answer, a saved row) into a valid spec, or null when it cannot be one.
 * Everything is clamped so a long answer never overflows the frame.
 */
export function sanitizeGraphic(raw: unknown): GraphicSpec | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const theme = GRAPHIC_THEMES.some((t) => t.id === r.theme) ? (r.theme as GraphicTheme) : 'gelap'
  switch (r.template) {
    case 'title': {
      const title = text(r.title, MAX_TITLE)
      return title ? { theme, template: 'title', title, subtitle: text(r.subtitle, MAX_LINE) } : null
    }
    case 'bullets': {
      const items = (Array.isArray(r.items) ? r.items : []).map((i) => text(i, MAX_LINE)).filter(Boolean).slice(0, MAX_BULLETS)
      return items.length ? { theme, template: 'bullets', title: text(r.title, MAX_TITLE), items } : null
    }
    case 'stat': {
      const value = num(r.value)
      const label = text(r.label, MAX_LINE)
      return value === null || !label
        ? null
        : { theme, template: 'stat', value, prefix: text(r.prefix, 6), suffix: text(r.suffix, 8), label, caption: text(r.caption, MAX_LINE) }
    }
    case 'bars': {
      const bars = (Array.isArray(r.bars) ? r.bars : [])
        .map((b): GraphicBar | null => {
          const o = (b ?? {}) as Record<string, unknown>
          const value = num(o.value)
          const label = text(o.label, 24)
          return value === null || !label ? null : { label, value }
        })
        .filter((b): b is GraphicBar => b !== null)
        .slice(0, MAX_BARS)
      return bars.length >= 2 ? { theme, template: 'bars', title: text(r.title, MAX_TITLE), unit: text(r.unit, 12), bars } : null
    }
    default:
      return null
  }
}

export function graphicSize(aspect: AspectRatio): { width: number; height: number } {
  return aspect === '9:16' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 }
}

export function graphicFrames(durationMs: number): number {
  return Math.max(1, Math.round((durationMs / 1000) * GRAPHIC_FPS))
}

/** Identifies everything a render depends on. A rendered file whose key differs from the clip's is outdated. */
export function graphicKey(spec: GraphicSpec, durationMs: number, aspect: AspectRatio): string {
  return JSON.stringify([GRAPHIC_VERSION, aspect, graphicFrames(durationMs), spec])
}
