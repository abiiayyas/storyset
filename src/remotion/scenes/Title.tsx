import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { BODY_FONT, DISPLAY_FONT } from '../fonts'
import { appear, fitText, type Layout, type SpecOf } from '../layout'

export const TitleScene: React.FC<{ spec: SpecOf<'title'>; L: Layout }> = ({ spec, L }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { theme: c, min } = L
  const hasSub = spec.subtitle.length > 0

  const title = fitText(spec.title, L.boxW, L.boxH * (hasSub ? 0.55 : 0.8), min * 0.14, min * 0.04, 1.05)
  const sub = hasSub ? fitText(spec.subtitle, L.boxW * 0.9, L.boxH * 0.2, min * 0.045, min * 0.025, 1.35) : null

  // durationInFrames forces the spring to land exactly on 1, so the frame is truly static afterwards.
  const enter = spring({ frame: Math.max(0, frame - 0.1 * fps), fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 0.9) })
  const bar = appear(frame, fps, 0.55, 0.6)
  const subIn = appear(frame, fps, 0.9, 0.6)

  return (
    <AbsoluteFill style={{ padding: `${L.padY}px ${L.padX}px`, justifyContent: 'center', alignItems: 'flex-start' }}>
      <div
        style={{
          fontFamily: DISPLAY_FONT,
          fontWeight: 700,
          fontSize: title.size,
          lineHeight: 1.05,
          letterSpacing: '-0.02em',
          color: c.fg,
          maxWidth: L.boxW,
          overflowWrap: 'anywhere',
          textWrap: 'balance',
          opacity: enter,
          transform: `translateY(${interpolate(enter, [0, 1], [min * 0.06, 0])}px)`
        }}
      >
        {spec.title}
      </div>
      <div
        style={{
          marginTop: min * 0.045,
          height: min * 0.016,
          width: min * 0.22 * bar,
          borderRadius: min,
          background: c.accent
        }}
      />
      {sub && (
        <div
          style={{
            marginTop: min * 0.04,
            fontFamily: BODY_FONT,
            fontWeight: 500,
            fontSize: sub.size,
            lineHeight: 1.35,
            color: c.muted,
            maxWidth: L.boxW * 0.9,
            overflowWrap: 'anywhere',
            opacity: subIn,
            transform: `translateY(${(1 - subIn) * min * 0.02}px)`
          }}
        >
          {spec.subtitle}
        </div>
      )}
    </AbsoluteFill>
  )
}
