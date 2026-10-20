import { AbsoluteFill } from 'remotion'
import type { GraphicSpec } from '../shared/graphics'
import { useFontsReady } from './fonts'
import { layoutOf } from './layout'
import { BarsScene } from './scenes/Bars'
import { BulletsScene } from './scenes/Bullets'
import { StatScene } from './scenes/Stat'
import { TitleScene } from './scenes/Title'

/**
 * One motion scene. The same component is previewed in the app (@remotion/player) and rendered to MP4 in the main
 * process (@remotion/renderer), so preview and export match. Every scene settles within ~2.5 s and then holds.
 */
export const GraphicScene: React.FC<{ spec: GraphicSpec; width: number; height: number }> = ({ spec, width, height }) => {
  const fontsReady = useFontsReady()
  const L = layoutOf(width, height, spec)
  const { theme: c, min } = L

  return (
    <AbsoluteFill style={{ background: c.bg, overflow: 'hidden' }}>
      {/* A soft accent disc bleeding off the corner: static, so it adds depth without competing with the content. */}
      <div
        style={{
          position: 'absolute',
          right: -min * 0.3,
          bottom: -min * 0.3,
          width: min * 0.9,
          height: min * 0.9,
          borderRadius: '50%',
          background: `${c.accent}14`
        }}
      />
      {fontsReady && (
        <>
          {spec.template === 'title' && <TitleScene spec={spec} L={L} />}
          {spec.template === 'bullets' && <BulletsScene spec={spec} L={L} />}
          {spec.template === 'stat' && <StatScene spec={spec} L={L} />}
          {spec.template === 'bars' && <BarsScene spec={spec} L={L} />}
        </>
      )}
    </AbsoluteFill>
  )
}
