import { useEffect, useState } from 'react'
import type { AspectRatio, CreditEstimate } from '@shared/types'

/** Higgsfield's price for one request. undefined while loading, null when it cannot be estimated (no key, offline). */
export function useEstimate(
  kind: 'image' | 'video',
  modelId: string,
  aspect: AspectRatio,
  seconds?: number,
  resolution?: string | null,
  quality?: string | null
): CreditEstimate | null | undefined {
  const [value, setValue] = useState<CreditEstimate | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    setValue(undefined)
    window.api.generate
      .estimate(kind, modelId, aspect, seconds, resolution, quality)
      .then((v) => alive && setValue(v))
      .catch(() => alive && setValue(null))
    return () => {
      alive = false
    }
  }, [kind, modelId, aspect, seconds, resolution, quality])
  return value
}

/**
 * Estimates for a whole list of models, filled in as they arrive (three requests at a time).
 * Results are cached in the main process, so reopening a picker is instant.
 */
export function useEstimates(
  kind: 'image' | 'video',
  ids: string[],
  aspect: AspectRatio,
  seconds: number | undefined,
  enabled: boolean,
  resolution?: string | null,
  quality?: string | null
): Record<string, CreditEstimate | null> {
  const context = `${kind}|${aspect}|${seconds ?? ''}|${resolution ?? ''}|${quality ?? ''}|${ids.join(',')}`
  const [state, setState] = useState<{ context: string; map: Record<string, CreditEstimate | null> }>({ context, map: {} })

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const queue = [...ids]
    const worker = async (): Promise<void> => {
      while (alive && queue.length) {
        const id = queue.shift()!
        const value = await window.api.generate.estimate(kind, id, aspect, seconds, resolution, quality).catch(() => null)
        if (!alive) return
        setState((s) => ({ context, map: { ...(s.context === context ? s.map : {}), [id]: value } }))
      }
    }
    void Promise.all([worker(), worker(), worker()])
    return () => {
      alive = false
    }
  }, [context, enabled])

  return state.context === context ? state.map : {}
}
