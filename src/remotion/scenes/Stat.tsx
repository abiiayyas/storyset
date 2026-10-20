import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { BODY_FONT, DISPLAY_FONT } from '../fonts'
import { appear, decimalsOf, DIGIT_W, fitText, formatId, type Layout, type SpecOf } from '../layout'

/** The affix (prefix/suffix) is drawn at this fraction of the number's size. */
const AFFIX = 0.5

export const StatScene: React.FC<{ spec: SpecOf<'stat'>; L: Layout }> = ({ spec, L }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { theme: c, min } = L

  const decimals = decimalsOf(spec.value)
  const finalText = formatId(spec.value, decimals)
  // The number is one line: size it from the final (widest) text so it never overflows while or after counting.
  const em = finalText.length * DIGIT_W + (spec.prefix.length + spec.suffix.length) * DIGIT_W * AFFIX
  const numSize = Math.max(min * 0.08, Math.min(min * 0.34, L.boxW / em))
  const affixSize = numSize * AFFIX

  const count = interpolate(frame, [0.1 * fps, 1.3 * fps], [0, 1], {
    easing: Easing.out(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })
  const labelIn = appear(frame, fps, 0.9, 0.6)
  const captionIn = appear(frame, fps, 1.2, 0.6)

  const label = fitText(spec.label, L.boxW, L.boxH * 0.22, min * 0.07, min * 0.035, 1.15)
  const caption = spec.caption ? fitText(spec.caption, L.boxW * 0.9, L.boxH * 0.15, min * 0.038, min * 0.024, 1.4) : null

  const affixStyle = { fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: affixSize, color: c.accent, lineHeight: 1 } as const

  return (
    <AbsoluteFill style={{ padding: `${L.padY}px ${L.padX}px`, justifyContent: 'center', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: numSize * 0.06, whiteSpace: 'nowrap', maxWidth: L.boxW }}>
        {spec.prefix && <span style={affixStyle}>{spec.prefix}</span>}
        <span
          style={{
            fontFamily: DISPLAY_FONT,
            fontWeight: 800,
            fontSize: numSize,
            lineHeight: 1,
            letterSpacing: '-0.03em',
            fontVariantNumeric: 'tabular-nums',
            color: c.accent
          }}
        >
          {formatId(spec.value * count, decimals)}
        </span>
        {spec.suffix && <span style={affixStyle}>{spec.suffix}</span>}
      </div>
      <div
        style={{
          marginTop: min * 0.05,
          fontFamily: DISPLAY_FONT,
          fontWeight: 700,
          fontSize: label.size,
          lineHeight: 1.15,
          letterSpacing: '-0.01em',
          color: c.fg,
          maxWidth: L.boxW,
          overflowWrap: 'anywhere',
          textWrap: 'balance',
          opacity: labelIn,
          transform: `translateY(${(1 - labelIn) * min * 0.025}px)`
        }}
      >
        {spec.label}
      </div>
      {caption && (
        <div
          style={{
            marginTop: min * 0.03,
            fontFamily: BODY_FONT,
            fontWeight: 500,
            fontSize: caption.size,
            lineHeight: 1.4,
            color: c.muted,
            maxWidth: L.boxW * 0.9,
            overflowWrap: 'anywhere',
            opacity: captionIn
          }}
        >
          {spec.caption}
        </div>
      )}
    </AbsoluteFill>
  )
}
