import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Film, Image as ImageIcon, Move, Users } from 'lucide-react'
import {
  effectiveImageResolution,
  effectiveQuality,
  effectiveResolution,
  fitDuration,
  getImageModel,
  getVideoModel,
  hfModelOptions,
  maxRefs,
  qualityOptions,
  resolutionOptions
} from '@shared/higgsfield'
import type { CreditEstimate, ModelOption, Project } from '@shared/types'
import { ModelLogo } from '../../components/ModelLogo'
import { ModelPicker } from '../../components/ModelPicker'
import { Segmented, Spinner } from '../../components/ui'
import { creditLabel } from '../../lib/format'
import { useEstimate, useEstimates } from '../../lib/useEstimate'

const IMAGE_OPTIONS = hfModelOptions('image')
const VIDEO_OPTIONS = hfModelOptions('video')
const IMAGE_IDS = IMAGE_OPTIONS.map((o) => o.id)
const QUALITY_LABELS: Record<string, string> = { low: 'Rendah', medium: 'Sedang', high: 'Tinggi' }
const VIDEO_IDS = VIDEO_OPTIONS.map((o) => o.id)

/** Adds each model's estimated credits to its picker row once a Higgsfield key is known to exist. */
function withCosts(options: ModelOption[], costs: Record<string, CreditEstimate | null>, unit: (id: string) => string, on: boolean): ModelOption[] {
  if (!on) return options
  return options.map((o) => ({
    ...o,
    credits: o.id in costs ? (costs[o.id]?.credits ?? null) : undefined,
    usd: costs[o.id]?.usd ?? null,
    creditUnit: unit(o.id)
  }))
}

function Cost({
  value,
  hasKey,
  provider = 'higgsfield',
  modelId,
  clipCount = 1,
  children
}: {
  value: CreditEstimate | null | undefined
  hasKey: boolean | null
  provider?: 'higgsfield' | 'gemini' | 'fal' | 'cli-image'
  modelId?: string
  clipCount?: number
  children: (credits: number) => ReactNode
}) {
  if (hasKey === false) {
    if (provider === 'gemini') return <span className="text-muted">Kunci Google Gemini belum diisi di Pengaturan.</span>
    if (provider === 'fal') return <span className="text-muted">Kunci Fal.ai belum diisi di Pengaturan.</span>
    if (provider === 'cli-image') return <span className="text-muted">CLI gambar belum diatur dan dites di Pengaturan.</span>
    return <span className="text-muted">Perkiraan kredit muncul setelah kunci Higgsfield diisi di Pengaturan.</span>
  }
  if (value === undefined)
    return (
      <span className="flex items-center gap-1.5 text-muted">
        <Spinner className="size-3" />
        Menghitung biaya…
      </span>
    )
  if (value === null) return <span className="text-muted">Perkiraan biaya belum tersedia.</span>
  if (provider === 'gemini') {
    const usdPer = value.usd ?? 0.03
    return (
      <span>
        ≈ ${usdPer} per gambar · {clipCount} gambar ≈ <b className="font-semibold text-ink">${(usdPer * clipCount).toFixed(2)}</b> (Google Gemini)
      </span>
    )
  }
  if (provider === 'cli-image') {
    return <span>Tanpa biaya per gambar (memakai kuota CLI di komputermu) · ±1 menit per gambar</span>
  }
  if (provider === 'fal') {
    const usdPer = value.usd ?? (modelId?.includes('schnell') ? 0.003 : 0.025)
    return (
      <span>
        ≈ ${usdPer} per gambar · {clipCount} gambar ≈ <b className="font-semibold text-ink">${(usdPer * clipCount).toFixed(3)}</b> (Fal.ai)
      </span>
    )
  }
  return <span>{children(value.credits)}</span>
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-line-2 bg-surface p-3">
      <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
        {icon}
        {title}
      </span>
      {children}
    </div>
  )
}

/** Which Higgsfield models draw and animate this project's clips. */
export function ModelSection({
  project,
  clipCount,
  perClip,
  onChange
}: {
  project: Project
  clipCount: number
  perClip: number
  onChange: (patch: {
    imageModel?: string
    videoModel?: string
    videoResolution?: string | null
    imageResolution?: string | null
    imageQuality?: string | null
  }) => void
}) {
  const image = getImageModel(project.imageModel)
  const video = getVideoModel(project.videoModel)
  const seconds = fitDuration(video, perClip) ?? perClip
  const imageSizes = resolutionOptions(image)
  const imageSize = effectiveImageResolution(image, project.imageResolution)
  const imageQualities = qualityOptions(image)
  const imageQuality = effectiveQuality(image, project.imageQuality)
  const imageCost = useEstimate('image', image.id, project.aspectRatio, undefined, project.imageResolution, project.imageQuality)
  const resolutions = resolutionOptions(video)
  const resolution = effectiveResolution(video, project.videoResolution)
  const videoCost = useEstimate('video', video.id, project.aspectRatio, perClip, resolution)
  const [keys, setKeys] = useState<{ provider: string; configured: boolean }[]>([])

  useEffect(() => {
    void window.api.settings.keys().then((k) => setKeys(k))
  }, [])

  const imageProvider = image.id.startsWith('gemini/') ? 'gemini' : image.id.startsWith('fal-ai/') ? 'fal' : image.id.startsWith('cli/') ? 'cli-image' : 'higgsfield'
  const hasImageKey = !!keys.find((k) => k.provider === imageProvider)?.configured
  const hasHfKey = !!keys.find((k) => k.provider === 'higgsfield')?.configured

  const imageCosts = useEstimates('image', IMAGE_IDS, project.aspectRatio, undefined, hasImageKey, project.imageResolution, project.imageQuality)
  const videoCosts = useEstimates('video', VIDEO_IDS, project.aspectRatio, perClip, hasHfKey)
  const imageModels = useMemo(() => withCosts(IMAGE_OPTIONS, imageCosts, () => '', hasImageKey), [imageCosts, hasImageKey])
  const videoModels = useMemo(
    () => withCosts(VIDEO_OPTIONS, videoCosts, (id) => `${fitDuration(getVideoModel(id), perClip)} dtk`, hasHfKey),
    [videoCosts, perClip, hasHfKey]
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold">Model AI</span>
        <span className="text-[13px] text-muted">
          {IMAGE_OPTIONS.length} model gambar (Higgsfield, Gemini, Fal.ai) dan {VIDEO_OPTIONS.length} model video
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card icon={<ImageIcon className="size-4" />} title="Gambar klip">
          <ModelPicker
            value={image.id}
            models={imageModels}
            footerNote={hasImageKey ? (imageProvider === 'higgsfield' ? 'kredit per gambar, perkiraan Higgsfield' : 'biaya per gambar') : undefined}
            renderIcon={(m) => <ModelLogo family={m.family} />}
            detail="description"
            tagFilters={['Rekomendasi', 'Referensi', 'Hemat / Cepat', 'Google', 'Fal.ai', 'CLI', 'GPT Image', 'Soul', 'Recraft', '4K']}
            menuClassName="w-[430px]"
            onChange={(id) => onChange({ imageModel: id })}
          />
          {imageSizes.length > 1 && (
            <div className="flex items-center gap-2.5">
              <span className="w-14 shrink-0 text-[12.5px] font-medium text-ink-2">Ukuran</span>
              <Segmented
                size="sm"
                value={imageSize ?? imageSizes[0]}
                onChange={(v) => onChange({ imageResolution: v })}
                options={imageSizes.map((r) => ({ id: r, label: /^\d+k$/i.test(r) ? r.toUpperCase() : r }))}
                className="min-w-0 flex-1"
              />
            </div>
          )}
          {imageQualities.length > 1 && (
            <div className="flex items-center gap-2.5">
              <span className="w-14 shrink-0 text-[12.5px] font-medium text-ink-2">Kualitas</span>
              <Segmented
                size="sm"
                value={imageQuality ?? imageQualities[0]}
                onChange={(v) => onChange({ imageQuality: v })}
                options={imageQualities.map((q) => ({ id: q, label: QUALITY_LABELS[q] ?? q }))}
                className="min-w-0 flex-1"
              />
            </div>
          )}
          <p className="text-[12.5px] leading-snug text-ink-2">
            <Cost value={imageCost} hasKey={hasImageKey} provider={imageProvider} modelId={image.id} clipCount={clipCount}>
              {(c) => (
                <>
                  ≈ {creditLabel(c)} kredit per gambar · {clipCount} gambar ≈ <b className="font-semibold text-ink">{creditLabel(c * clipCount)} kredit</b>
                </>
              )}
            </Cost>
          </p>
          <p className="flex items-start gap-1.5 text-[12.5px] leading-snug text-muted">
            <Users className="mt-px size-3.5 shrink-0" />
            {maxRefs(image)
              ? 'Pakai lembar karakter, jadi wajah dan kostum tokoh tetap sama di tiap klip.'
              : 'Tanpa lembar karakter, jadi tampilan tokoh bisa sedikit berubah antar klip.'}
          </p>
        </Card>
        <Card icon={<Film className="size-4" />} title="Video AI">
          <ModelPicker
            value={video.id}
            models={videoModels}
            footerNote={hasHfKey ? `kredit per video untuk klip ±${perClip} detik` : undefined}
            renderIcon={(m) => <ModelLogo family={m.family} />}
            detail="description"
            tagFilters={['Rekomendasi', 'Kling', 'Seedance', 'Wan', 'Referensi', '4K']}
            align="right"
            menuClassName="w-[430px]"
            onChange={(id) => onChange({ videoModel: id })}
          />
          {resolutions.length > 1 ? (
            <div className="flex items-center gap-2.5">
              <span className="shrink-0 text-[12.5px] font-medium text-ink-2">Resolusi</span>
              <Segmented
                size="sm"
                value={resolution ?? resolutions[0]}
                onChange={(v) => onChange({ videoResolution: v })}
                options={resolutions.map((r) => ({ id: r, label: r.toUpperCase() === '4K' || r.toUpperCase() === '2K' ? r.toUpperCase() : r }))}
                className="min-w-0 flex-1"
              />
            </div>
          ) : (
            resolution && <p className="text-[12.5px] text-ink-2">Resolusi {resolution} (satu-satunya pilihan model ini)</p>
          )}
          <p className="text-[12.5px] leading-snug text-ink-2">
            <Cost value={videoCost} hasKey={hasHfKey}>
              {(c) => (
                <>
                  ≈ {creditLabel(c)} kredit per video {seconds} detik{resolution ? `, ${resolution}` : ''}
                </>
              )}
            </Cost>
          </p>
          <p className="flex items-start gap-1.5 text-[12.5px] leading-snug text-muted">
            <Move className="mt-px size-3.5 shrink-0" />
            Hanya untuk klip yang kamu jadikan Video AI. Gerak kamera tetap gratis.
          </p>
        </Card>
      </div>
    </div>
  )
}
