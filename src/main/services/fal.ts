import { app } from 'electron'
import type { AspectRatio, KeyTestResult } from '@shared/types'
import { getSecret, requireSecret } from '../secrets'
import { downloadTo, readError, sleep } from './http'

// Development builds can point at a local mock (STUDIO_FAL_BASE) to test the UI without spending money.
const FAL_BASE = (!app.isPackaged && process.env.STUDIO_FAL_BASE) || 'https://queue.fal.run'

function friendly(e: unknown): Error {
  const msg = (e as Error)?.message ?? String(e)
  if (/401|unauthorized|invalid api key|key not valid/i.test(msg)) {
    return new Error('Kunci Fal.ai ditolak. Periksa kunci di Pengaturan: bentuknya KEY_ID:KEY_SECRET, dua-duanya harus ikut tersalin.')
  }
  if (/402|payment|balance|credits|insufficient|locked|exhausted/i.test(msg)) {
    return new Error('Saldo Fal.ai habis. Isi saldo akun Fal.ai kamu (fal.ai/dashboard/billing).')
  }
  if (/429|rate limit|too many/i.test(msg)) {
    return new Error('Terlalu banyak permintaan ke Fal.ai. Coba lagi sebentar.')
  }
  return new Error(`Fal.ai gagal: ${msg}`)
}

/** A fetch that turns a network failure into a message that says which service could not be reached. */
async function call(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (e) {
    if (init.signal?.aborted) throw new Error('Dibatalkan')
    throw new Error(`Tidak bisa terhubung ke Fal.ai: ${(e as Error).message}`)
  }
}

/**
 * Asks for a model that needs a prompt, without one: Fal checks the key first, so a bad key answers 401/403 and a good
 * one answers 422, and nothing is generated or billed.
 */
export async function testKey(key?: string): Promise<KeyTestResult> {
  const k = key ?? getSecret('fal')
  if (!k) return { ok: false, message: 'Kunci belum diatur' }
  try {
    const res = await call(`${FAL_BASE}/fal-ai/flux/schnell`, {
      method: 'POST',
      headers: { Authorization: `Key ${k}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(20_000)
    })
    if (res.status === 401 || res.status === 403) {
      const detail = await readError(res)
      return { ok: false, message: friendly(new Error(`HTTP ${res.status}: ${detail}`)).message }
    }
    return { ok: true, message: 'Terhubung ke Fal.ai' }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

interface FalQueueResponse {
  request_id?: string
  status_url?: string
  response_url?: string
}

interface QueueOptions {
  signal?: AbortSignal
  onProgress?: (status: string) => void
  /** Wording for the progress line: "gambar" or "video". */
  what: string
  pollMs: number
  timeoutMs: number
}

/**
 * Submits to Fal's queue and waits for the result. The status and result URLs come from Fal's own answer because
 * nested endpoints (`fal-ai/wan/v2.2-a14b/image-to-video`) are queued under their app id, not the full path.
 */
async function runQueue<T>(endpoint: string, input: Record<string, unknown>, o: QueueOptions): Promise<T> {
  const key = requireSecret('fal')
  const headers = { Authorization: `Key ${key}` }

  o.onProgress?.('Mengirim ke Fal.ai')
  const submit = await call(`${FAL_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: o.signal
  })
  if (!submit.ok) throw friendly(new Error(`HTTP ${submit.status}: ${await readError(submit)}`))

  const queued = (await submit.json()) as FalQueueResponse
  if (!queued.request_id && !queued.status_url) throw new Error('Fal.ai tidak memberi nomor antrean')
  const statusUrl = queued.status_url ?? `${FAL_BASE}/${endpoint}/requests/${queued.request_id}/status`
  const responseUrl = queued.response_url ?? `${FAL_BASE}/${endpoint}/requests/${queued.request_id}`

  const started = Date.now()
  for (;;) {
    if (Date.now() - started > o.timeoutMs) throw new Error(`Fal.ai terlalu lama membuat ${o.what} (lebih dari ${Math.round(o.timeoutMs / 60_000)} menit).`)
    await sleep(o.pollMs, o.signal)
    const poll = await call(statusUrl, { headers, signal: o.signal })
    if (!poll.ok) {
      // Rejections will not fix themselves; anything else (5xx, rate limit) is worth another look.
      if (poll.status === 401 || poll.status === 402 || poll.status === 403 || poll.status === 404) {
        throw friendly(new Error(`HTTP ${poll.status}: ${await readError(poll)}`))
      }
      continue
    }
    const { status } = (await poll.json()) as { status?: string }
    if (status === 'COMPLETED') break
    o.onProgress?.(status === 'IN_QUEUE' ? 'Mengantre di Fal.ai' : `Membuat ${o.what} di Fal.ai`)
  }

  o.onProgress?.(`Mengunduh ${o.what} dari Fal.ai`)
  const result = await call(responseUrl, { headers, signal: o.signal })
  if (!result.ok) throw friendly(new Error(`HTTP ${result.status}: ${await readError(result)}`))
  return (await result.json()) as T
}

export async function generateImage(
  model: string,
  prompt: string,
  aspect: AspectRatio,
  signal?: AbortSignal,
  onProgress?: (status: string) => void
): Promise<{ bytes: Buffer; contentType: string }> {
  const result = await runQueue<{ images?: { url: string }[] }>(
    model,
    { prompt, image_size: aspect === '16:9' ? 'landscape_16_9' : 'portrait_16_9', num_images: 1, enable_safety_checker: true },
    { signal, onProgress, what: 'gambar', pollMs: 1000, timeoutMs: 5 * 60 * 1000 }
  )
  const url = result.images?.[0]?.url
  if (!url) throw new Error('Fal.ai selesai tanpa menghasilkan gambar')
  return downloadTo(url, signal)
}

/** Animates one frame. `input` is the full request body built from the model's catalog entry (`videoBody`). */
export async function generateVideo(
  model: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
  onProgress?: (status: string) => void
): Promise<{ bytes: Buffer; contentType: string }> {
  const result = await runQueue<{ video?: { url: string } }>(model, input, {
    signal,
    onProgress,
    what: 'video',
    pollMs: 3000,
    timeoutMs: 20 * 60 * 1000
  })
  const url = result.video?.url
  if (!url) throw new Error('Fal.ai selesai tanpa menghasilkan video')
  return downloadTo(url, signal)
}
