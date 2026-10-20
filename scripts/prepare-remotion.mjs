// Builds what the app needs to render motion scenes: the Remotion bundle (the scenes as a static site) and the
// Chrome Headless Shell Remotion draws frames with. `npm run dist` runs this first so both ship inside the installer.
// In development the main process calls it with --bundle whenever the scenes changed.
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { bundle } from '@remotion/bundler'
import { ensureBrowser } from '@remotion/renderer'

const root = resolve(import.meta.dirname, '..')
const out = resolve(root, 'resources-gen/remotion-bundle')
const bundleOnly = process.argv.includes('--bundle')

rmSync(out, { recursive: true, force: true })
await bundle({ entryPoint: resolve(root, 'src/remotion/index.ts'), outDir: out })
console.log(`[remotion] bundle ready: ${out}`)

if (!bundleOnly) {
  await ensureBrowser()
  console.log('[remotion] Chrome Headless Shell ready')
}
