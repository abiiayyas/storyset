import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/plus-jakarta-sans'
import { useEffect, useState } from 'react'
import { continueRender, delayRender } from 'remotion'

export const DISPLAY_FONT = "'Bricolage Grotesque Variable', 'Plus Jakarta Sans Variable', sans-serif"
export const BODY_FONT = "'Plus Jakarta Sans Variable', 'Bricolage Grotesque Variable', sans-serif"

// Covers Indonesian text, digits and the punctuation the AI likes to use, so the right subset file is fetched.
const SAMPLE = 'Aa Bb 0123456789 .,:;%+-–—“”‘’()/'

let loading: Promise<void> | null = null
let loaded = false

/**
 * Loads both fonts once per page. The delayRender handle is module-level (not per component) so React StrictMode's
 * double render in the app never leaks a handle, which would stall a Remotion render until its timeout.
 */
function loadFonts(): Promise<void> {
  if (loading) return loading
  const handle = delayRender('Loading scene fonts')
  const faces = ['700 48px "Bricolage Grotesque Variable"', '500 48px "Plus Jakarta Sans Variable"', '700 48px "Plus Jakarta Sans Variable"']
  // A failed load must not hang the render: fall back to the stack above rather than wait for the timeout.
  loading = Promise.all(faces.map((f) => document.fonts.load(f, SAMPLE)))
    .catch(() => undefined)
    .then(() => {
      loaded = true
      continueRender(handle)
    })
  return loading
}

/** True once the scene fonts are ready; frames must not be drawn before that or they use fallback fonts. */
export function useFontsReady(): boolean {
  const [ready, setReady] = useState(loaded)
  // Starting inside render (not only in an effect) makes sure the handle exists before Remotion captures frame 0.
  if (!ready) void loadFonts()
  useEffect(() => {
    if (ready) return
    let alive = true
    void loadFonts().then(() => {
      if (alive) setReady(true)
    })
    return () => {
      alive = false
    }
  }, [ready])
  return ready
}
