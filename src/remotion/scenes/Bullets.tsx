import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion'
import { BODY_FONT, DISPLAY_FONT } from '../fonts'
import { appear, fitText, type Layout, type SpecOf } from '../layout'

/** Seconds between two bullets appearing. */
const STAGGER = 0.35

export const BulletsScene: React.FC<{ spec: SpecOf<'bullets'>; L: Layout }> = ({ spec, L }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { theme: c, min } = L
  const n = spec.items.length

  const heading = spec.title ? fitText(spec.title, L.boxW, L.boxH * 0.2, min * 0.075, min * 0.04, 1.08) : null
  const headingH = heading ? heading.lines * heading.size * 1.08 + min * 0.05 : 0

  const badge = min * 0.065
  const gap = min * 0.025
  const textW = L.boxW - badge - gap * 1.5
  const rowGap = min * 0.035
  const rowH = Math.min((L.boxH - headingH) / n - rowGap, min * 0.2)
  // One shared size for the whole list so items look like a set, set by the longest one.
  const size = Math.min(...spec.items.map((t) => fitText(t, textW, rowH, min * 0.06, min * 0.03, 1.25).size))
  const start = heading ? 0.5 : 0.15

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: rowGap, width: L.boxW }}>
        {spec.items.map((item, i) => {
          const p = appear(frame, fps, start + i * STAGGER, 0.55)
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: gap * 1.5,
                opacity: p,
                transform: `translateX(${(1 - p) * min * 0.05}px)`
              }}
            >
              <div
                style={{
                  flex: 'none',
                  width: badge,
                  height: badge,
                  borderRadius: badge,
                  background: c.accent,
                  color: c.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: DISPLAY_FONT,
                  fontWeight: 700,
                  fontSize: badge * 0.5
                }}
              >
                {i + 1}
              </div>
              <div
                style={{
                  minWidth: 0,
                  fontFamily: BODY_FONT,
                  fontWeight: 600,
                  fontSize: size,
                  lineHeight: 1.25,
                  color: c.fg,
                  overflowWrap: 'anywhere'
                }}
              >
                {item}
              </div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}
