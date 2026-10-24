import { PROVIDER_KEY, defaultModelsFor, type ModelProvider } from '@shared/higgsfield'
import { getDb } from './db'
import { keyStatuses } from './secrets'
import { getSettings } from './settings'

/** Providers whose key is saved and did not fail its last check; Cloudflare also needs its account id. */
export function readyProviders(): Set<ModelProvider> {
  const statuses = keyStatuses()
  const hasAccount = !!getSettings().cloudflareAccountId.trim()
  const ready = new Set<ModelProvider>()
  for (const [provider, key] of Object.entries(PROVIDER_KEY) as [ModelProvider, string][]) {
    const s = statuses.find((x) => x.provider === key)
    if (s?.configured && s.lastOk !== false && (provider !== 'cloudflare' || hasAccount)) ready.add(provider)
  }
  return ready
}

const isSaved = (key: string): boolean => !!getDb().prepare('SELECT 1 FROM settings WHERE key = ?').get(key)

/**
 * The image and video models a new project starts with. Models the user picked before (saved in settings) win; otherwise
 * they come from whichever provider is ready, so a fresh install never starts on a service the user has no key for.
 */
export function modelsForNewProject(): { imageModel: string; videoModel: string } {
  const s = getSettings()
  const auto = defaultModelsFor(readyProviders())
  return {
    imageModel: isSaved('imageModel') ? s.imageModel : auto.imageModel,
    videoModel: isSaved('videoModel') ? s.videoModel : auto.videoModel
  }
}
