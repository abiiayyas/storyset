import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import { BODY_FONT, DISPLAY_FONT } from '../fonts'
import { appear, decimalsOf, DIGIT_W, CHAR_W, fitText, formatId, type Layout, type SpecOf } from '../layout'

export const BarsScene: React.FC<{ spec: SpecOf<'bars'>; L: Layout }> = ({ spec, L }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { theme: c, min } = L
  const n = spec.bars.length
  const unit = spec.unit ? ` ${spec.unit}` : ''

  const heading = spec.title ? fitText(spec.title, L.boxW, L.boxH * 0.18, min * 0.07, min * 0.04, 1.08) : null
  const headingH = heading ? heading.lines * heading.size * 1.08 + min * 0.05 : 0

  // Horizontal bars work in both orientations: a portrait frame is tall, a landscape one is wide.
  const pitch = Math.min((L.boxH - headingH) / n, min * 0.17)
  const bh = pitch * 0.3
  const labelSize = Math.min(min * 0.045, pitch * 0.27)

  const maxAbs = Math.max(...spec.bars.map((b) => Math.abs(b.value)), Number.EPSILON)
  const valueTexts = spec.bars.map((b) => formatId(b.value, decimalsOf(b.value)) + unit)
  const valueChars = Math.max(...valueTexts.map((t) => t.length))
  // The value column takes at most ~40% of the width; the track gets the rest.
  const valueSize = Math.min(Math.max(bh * 0.85, labelSize), (L.boxW * 0.4) / (valueChars * DIGIT_W))
  const valueW = valueChars * DIGIT_W * valueSize
  const gapX = min * 0.025
  const trackW = L.boxW - valueW - gapX
  const labelLen = Math.max(...spec.bars.map((b) => b.label.length))
  const labelFit = Math.min(labelSize, L.boxW / (labelLen * CHAR_W))

  const headIn = appear(frame, fps, 0, 0.6)

  return (
    <AbsoluteFill style={{ padding: `${L.padY}px ${L.padX}px`, justifyContent: 'center', alignItems: 'flex-start' }}>
      {heading && (
        <div
          style={{
            marginBottom: min * 0.05,
            fontFamily: DISPLAY_FONT,
            fontWeight: 700,
            fontSize: heading.size,
            lineHeight: 1.08,
            letterSpacing: '-0.02em',
            color: c.fg,
            maxWidth: L.boxW,
            overflowWrap: 'anywhere',
            textWrap: 'balance',
            opacity: headIn,
            transform: `translateY(${(1 - headIn) * min * 0.03}px)`
          }}
        >
          {spec.title}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: pitch * 0.3, width: L.boxW }}>
        {spec.bars.map((bar, i) => {
          const p = appear(frame, fps, 0.4 + i * 0.12, 0.9)
          const rowIn = appear(frame, fps, 0.3 + i * 0.12, 0.5)
          return (
            <div key={i} style={{ opacity: rowIn }}>
              <div
                style={{
                  fontFamily: BODY_FONT,
                  fontWeight: 600,
                  fontSize: labelFit,
                  lineHeight: 1.25,
                  color: c.fg,
                  marginBottom: pitch * 0.06,
                  overflowWrap: 'anywhere'
                }}
              >
                {bar.label}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: gapX }}>
                <div style={{ flex: 'none', width: trackW, height: bh, borderRadius: bh, background: `${c.fg}1F`, overflow: 'hidden' }}>
                  <div style={{ width: (Math.abs(bar.value) / maxAbs) * trackW * p, height: '100%', borderRadius: bh, background: c.accent }} />
                </div>
                <div
                  style={{
                    flex: 'none',
                    fontFamily: DISPLAY_FONT,
                    fontWeight: 700,
                    fontSize: valueSize,
                    lineHeight: 1,
                    color: c.fg,
                    whiteSpace: 'nowrap',
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  {formatId(bar.value * p, decimalsOf(bar.value)) + unit}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}
