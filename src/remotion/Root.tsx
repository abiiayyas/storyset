import { Composition, type CalculateMetadataFunction } from 'remotion'
import { GRAPHIC_FPS, defaultGraphic, graphicFrames, type GraphicSpec } from '../shared/graphics'
import { GraphicScene } from './Graphic'

/** What the main process passes as input props: the spec plus the frame size and length the clip needs. */
type RenderProps = {
  spec: GraphicSpec
  width: number
  height: number
  durationMs: number
}

const Scene = ({ spec, width, height }: RenderProps) => <GraphicScene spec={spec} width={width} height={height} />

// The clip decides its own size and length, so the composition adapts instead of fixing them.
const metadata: CalculateMetadataFunction<RenderProps> = ({ props }) => ({
  width: props.width,
  height: props.height,
  fps: GRAPHIC_FPS,
  durationInFrames: graphicFrames(props.durationMs)
})

export const Root = () => (
  <Composition
    id="graphic"
    component={Scene}
    width={1920}
    height={1080}
    fps={GRAPHIC_FPS}
    durationInFrames={graphicFrames(5000)}
    defaultProps={{ spec: defaultGraphic('title'), width: 1920, height: 1080, durationMs: 5000 }}
    calculateMetadata={metadata}
  />
)
