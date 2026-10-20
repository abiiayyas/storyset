import { Easing, interpolate } from 'remotion'
import { themeOf, type GraphicSpec, type GraphicTemplate } from '../shared/graphics'

export type SpecOf<T extends GraphicTemplate> = Extract<GraphicSpec, { template: T }>
export interface SceneTheme {
  bg: string
  fg: string
  accent: string
  muted: string
}

/** Frame geometry. Everything is derived from the frame so 1920x1080 and 1080x1920 both keep generous margins. */
export interface Layout {
  width: number
  height: number
  /** The shorter side: type and spacing scale with it so a portrait frame is not drawn smaller than a landscape one. */
  min: number
  padX: number
  padY: number
  /** Content box inside the margins. */
  boxW: number
  boxH: number
  theme: SceneTheme
}

export function layoutOf(width: number, height: number, spec: GraphicSpec): Layout {
  const min = Math.min(width, height)
  const padX = Math.max(min * 0.09, width * 0.07)
  const padY = min * 0.09
  return { width, height, min, padX, padY, boxW: width - padX * 2, boxH: height - padY * 2, theme: themeOf(spec.theme) }
}

/** Eased 0..1 progress of an entrance that starts at `delaySec` and lasts `durSec`. Holds at 1 afterwards. */
export function appear(frame: number, fps: number, delaySec: number, durSec = 0.7): number {
  return interpolate(frame, [delaySec * fps, (delaySec + durSec) * fps], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })
}

// Average glyph widths (em) of the two fonts; slightly generous so estimated text is never narrower than real text.
export const CHAR_W = 0.56
export const DIGIT_W = 0.62

function countLines(text: string, boxW: number, size: number): number {
  const cw = size * CHAR_W
  const space = size * 0.3
  let lines = 1
  let x = 0
  for (const word of text.split(' ')) {
    const w = word.length * cw
    if (x > 0 && x + space + w > boxW) {
      lines++
      x = 0
    }
    if (x > 0) x += space
    if (w > boxW) {
      lines += Math.ceil(w / boxW) - 1
      x = w % boxW
    } else x += w
  }
  return lines
}

/** Largest font size (px) whose wrapped text fits the box. Wrapping is simulated because DOM can't be measured here. */
export function fitText(text: string, boxW: number, boxH: number, maxSize: number, minSize: number, lineHeight: number): { size: number; lines: number } {
  for (let size = Math.round(maxSize); size > minSize; size -= 2) {
    const lines = countLines(text, boxW, size)
    if (lines * size * lineHeight <= boxH) return { size, lines }
  }
  const size = Math.round(minSize)
  return { size, lines: countLines(text, boxW, size) }
}

/** Decimals needed to show `value` exactly (capped), so a counting number keeps a steady format while it counts. */
export function decimalsOf(value: number): number {
  const s = String(value)
  if (s.includes('e')) return 0
  return Math.min(3, s.split('.')[1]?.length ?? 0)
}

export function formatId(value: number, decimals: number): string {
  return value.toLocaleString('id-ID', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
