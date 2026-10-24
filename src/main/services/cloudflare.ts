import { app } from 'electron'
import type { AspectRatio, KeyTestResult } from '@shared/types'
import { getSecret, requireSecret } from '../secrets'
import { getSettings } from '../settings'

// Development builds can point at a local mock (STUDIO_CF_BASE) to test the UI without spending money.
const BASE = (!app.isPackaged && process.env.STUDIO_CF_BASE) || 'https://api.cloudflare.com/client/v4'
const TIMEOUT_MS = 2 * 60 * 1000

const SIZED: Record<string, true> = { '@cf/bytedance/stable-diffusion-xl-lightning': true, '@cf/leonardo/lucid-origin': true }

function accountId(override?: string): string {
  const id = (override ?? getSettings().cloudflareAccountId).trim()
  if (!id) throw new Error('Account ID Cloudflare belum diisi. Buka Pengaturan untuk menambahkannya.')
  return id
}

interface CfBody {
  success?: boolean
  errors?: { code?: number; message?: string }[]
  result?: { image?: string } | null
  image?: string
}

/** The first error Cloudflare reports, or the HTTP status when the body has none. */
async function problem(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  try {
    const body = JSON.parse(text) as CfBody
    const msg = body.errors?.map((e) => e.message).filter(Boolean).join('; ')
    if (msg) return msg
  } catch {
    // not JSON
  }
  return text.slice(0, 200) || `HTTP ${res.status}`
}

function friendly(status: number, detail: string): Error {
  if (/daily free allocation|neurons/i.test(detail)) {
    return new Error('Jatah gratis harian Cloudflare (10.000 neuron) habis. Coba lagi besok (reset 00.00 UTC) atau pindah ke paket berbayar Workers AI.')
  }
  if (status === 401 || status === 403) return new Error('Token atau Account ID Cloudflare ditolak. Pastikan token punya izin Workers AI dan Account ID-nya benar.')
  if (status === 404) return new Error(`Model Cloudflare tidak ditemukan: ${detail}`)
  if (status === 429) return new Error('Terlalu banyak permintaan ke Cloudflare. Coba lagi sebentar.')
  return new Error(`Cloudflare gagal: ${detail}`)
}

/** Lists one model: a call that needs the token and the account id, and costs nothing. */
export async function testKey(key?: string): Promise<KeyTestResult> {
  const token = key ?? getSecret('cloudflare')
  if (!token) return { ok: false, message: 'Kunci belum diatur' }
  try {
    const res = await fetch(`${BASE}/accounts/${accountId()}/ai/models/search?per_page=1`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000)
    })
    if (!res.ok) return { ok: false, message: friendly(res.status, await problem(res)).message }
    return { ok: true, message: 'Terhubung ke Cloudflare Workers AI' }
  } catch (e) {
    return { ok: false, message: (e as Error).message.startsWith('Account ID') ? (e as Error).message : `Tidak bisa terhubung ke Cloudflare: ${(e as Error).message}` }
  }
}

function sniff(bytes: Buffer): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg'
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF') return 'image/webp'
  return 'image/jpeg'
}

/** Draws one image. Returns bytes whichever way the model answers: JSON with a base64 image, or the raw image. */
export async function generateImage(
  model: string,
  prompt: string,
  aspect: AspectRatio,
  signal?: AbortSignal
): Promise<{ bytes: Buffer; contentType: string }> {
  const token = requireSecret('cloudflare')
  const body: Record<string, unknown> = { prompt }
  if (SIZED[model]) {
    // 1344x768 is SDXL's native 16:9 bucket; Lucid Origin takes the same size.
    body.width = aspect === '9:16' ? 768 : 1344
    body.height = aspect === '9:16' ? 1344 : 768
  }
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`${BASE}/accounts/${accountId()}/ai/run/${model}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout
    })
  } catch (e) {
    if (signal?.aborted) throw new Error('Dibatalkan')
    if ((e as Error).name === 'TimeoutError') throw new Error('Cloudflare terlalu lama merespons.')
    if ((e as Error).message.startsWith('Account ID')) throw e
    throw new Error(`Tidak bisa terhubung ke Cloudflare: ${(e as Error).message}`)
  }
  if (!res.ok) throw friendly(res.status, await problem(res))

  if (/json/i.test(res.headers.get('content-type') ?? '')) {
    const json = (await res.json()) as CfBody
    const b64 = json.result?.image ?? json.image
    if (!b64) throw new Error(`Cloudflare selesai tanpa gambar: ${json.errors?.[0]?.message ?? 'jawaban kosong'}`)
    const bytes = Buffer.from(b64, 'base64')
    return { bytes, contentType: sniff(bytes) }
  }
  const bytes = Buffer.from(await res.arrayBuffer())
  if (!bytes.length) throw new Error('Cloudflare selesai tanpa gambar')
  return { bytes, contentType: res.headers.get('content-type') || sniff(bytes) }
}
