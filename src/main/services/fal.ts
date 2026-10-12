import type { AspectRatio, KeyTestResult } from '@shared/types'
import { getSecret, requireSecret } from '../secrets'
import { downloadTo, sleep } from './http'

const FAL_BASE = 'https://queue.fal.run'

function friendly(e: unknown): Error {
  const msg = (e as Error)?.message ?? String(e)
  if (/401|unauthorized|invalid api key|key not valid/i.test(msg)) {
    return new Error('Kunci Fal.ai ditolak. Periksa kunci di Pengaturan.')
  }
  if (/402|payment|balance|credits|insufficient/i.test(msg)) {
    return new Error('Saldo Fal.ai habis. Isi saldo akun Fal.ai kamu.')
  }
  if (/429|rate limit|too many/i.test(msg)) {
    return new Error('Terlalu banyak permintaan ke Fal.ai. Coba lagi sebentar.')
  }
  return new Error(`Fal.ai gagal: ${msg}`)
}

export async function testKey(key?: string): Promise<KeyTestResult> {
  const k = key ?? getSecret('fal')
  if (!k) return { ok: false, message: 'Kunci belum diatur' }
  try {
    const res = await fetch(`${FAL_BASE}/fal-ai/flux/schnell`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${k}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Kunci Fal.ai ditolak. Periksa kunci di Pengaturan.' }
    }
    return { ok: true, message: 'Terhubung ke Fal.ai' }
  } catch (e) {
    return { ok: false, message: friendly(e).message }
  }
}

interface FalQueueResponse {
  request_id?: string
  status_url?: string
  response_url?: string
  status?: string
}

interface FalResultResponse {
  images?: Array<{
    url: string
    width?: number
    height?: number
    content_type?: string
  }>
  error?: string
  detail?: string
}

export async function generateImage(
  model: string,
  prompt: string,
  aspect: AspectRatio,
  signal?: AbortSignal,
  onProgress?: (status: string) => void
): Promise<{ bytes: Buffer; contentType: string }> {
  const key = requireSecret('fal')
  const endpoint = model.startsWith('fal-ai/') ? model : model.startsWith('fal/') ? model.replace(/^fal\//, 'fal-ai/') : 'fal-ai/flux/schnell'

  onProgress?.('Mengirim ke Fal.ai')
  const submitRes = await fetch(`${FAL_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prompt,
      image_size: aspect === '16:9' ? 'landscape_16_9' : 'portrait_16_9',
      num_images: 1,
      enable_safety_checker: true
    }),
    signal
  })

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => '')
    throw friendly(new Error(`HTTP ${submitRes.status}: ${errText}`))
  }

  const queueData = (await submitRes.json()) as FalQueueResponse
  const statusUrl = queueData.status_url ?? `${FAL_BASE}/${endpoint}/requests/${queueData.request_id}/status`
  const responseUrl = queueData.response_url ?? `${FAL_BASE}/${endpoint}/requests/${queueData.request_id}`

  const started = Date.now()
  const timeoutMs = 5 * 60 * 1000

  while (Date.now() - started < timeoutMs) {
    if (signal?.aborted) throw new Error('Dibatalkan')
    await sleep(1000, signal)

    const pollRes = await fetch(statusUrl, {
      headers: { Authorization: `Key ${key}` },
      signal
    })

    if (!pollRes.ok) {
      if (pollRes.status === 404) break
      continue
    }

    const pollData = (await pollRes.json()) as { status?: string }
    const status = pollData.status
    if (status === 'IN_QUEUE') {
      onProgress?.('Mengantre di Fal.ai')
    } else if (status === 'IN_PROGRESS') {
      onProgress?.('Membuat gambar di Fal.ai')
    } else if (status === 'COMPLETED') {
      break
    }
  }

  onProgress?.('Mengunduh hasil dari Fal.ai')
  const finalRes = await fetch(responseUrl, {
    headers: { Authorization: `Key ${key}` },
    signal
  })

  if (!finalRes.ok) {
    const errText = await finalRes.text().catch(() => '')
    throw friendly(new Error(`Gagal mengambil hasil Fal.ai: ${errText}`))
  }

  const result = (await finalRes.json()) as FalResultResponse
  const imgUrl = result.images?.[0]?.url
  if (!imgUrl) {
    throw new Error('Fal.ai selesai tanpa menghasilkan gambar')
  }

  return downloadTo(imgUrl, signal)
}
