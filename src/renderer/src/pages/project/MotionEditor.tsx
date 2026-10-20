import { useEffect, useMemo, useState } from 'react'
import { Player } from '@remotion/player'
import { Clapperboard, Plus, RefreshCw, X } from 'lucide-react'
import { GRAPHIC_FPS, GRAPHIC_TEMPLATES, GRAPHIC_THEMES, MAX_BARS, MAX_BULLETS, graphicFrames, graphicKey, graphicSize, switchTemplate } from '@shared/graphics'
import type { GraphicSpec } from '@shared/graphics'
import type { Asset, AspectRatio, Clip, Job } from '@shared/types'
import { GraphicScene } from '@motion/Graphic'
import { Button, IconButton, Progress, Segmented, cx, inputCls } from '../../components/ui'
import { secLabel } from '../../lib/format'
import { isRunning } from '../../store/project'

export type RenderState = 'none' | 'outdated' | 'fresh'

/** Whether a motion clip has a render, and whether that render still matches the scene, its length, and the aspect. */
export function renderState(clip: Clip, asset: Asset | null | undefined, aspect: AspectRatio): RenderState {
  if (!clip.graphic || !asset) return 'none'
  return asset.meta.graphicKey === graphicKey(clip.graphic, clip.durationMs, aspect) ? 'fresh' : 'outdated'
}

/** Says why a render is outdated by comparing the frame count inside the stored key (see `graphicKey`). */
function outdatedReason(asset: Asset, clip: Clip): string {
  let frames: unknown
  try {
    frames = (JSON.parse(asset.meta.graphicKey ?? 'null') as unknown[] | null)?.[2]
  } catch {
    frames = undefined
  }
  if (typeof frames === 'number' && frames !== graphicFrames(clip.durationMs))
    return 'Panjang klip berubah sejak dirender (narasi atau suaranya berubah).'
  return 'Isi scene berubah sejak dirender.'
}

// Mirrors the limits `sanitizeGraphic` clamps to, so what you type is what gets drawn.
const MAX_TITLE = 90
const MAX_LINE = 110

/** A number box that lets you type "-" or "3," on the way to a valid number instead of snapping back. */
function NumberInput({ value, onChange, label, className }: { value: number; onChange: (n: number) => void; label: string; className?: string }) {
  const [text, setText] = useState(String(value))
  useEffect(() => {
    if (Number(text.replace(',', '.')) !== value) setText(String(value))
  }, [value])
  return (
    <input
      inputMode="decimal"
      value={text}
      aria-label={label}
      onChange={(e) => {
        setText(e.target.value)
        const n = Number(e.target.value.replace(',', '.'))
        if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n)
      }}
      className={cx(inputCls, 'h-10 text-sm', className)}
    />
  )
}

function TextInput({
  label,
  value,
  onChange,
  max = MAX_LINE,
  placeholder,
  className
}: {
  label: string
  value: string
  onChange: (v: string) => void
  max?: number
  placeholder?: string
  className?: string
}) {
  return (
    <label className={cx('flex flex-col gap-1', className)}>
      <span className="text-[13px] font-semibold text-ink-2">{label}</span>
      <input value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={cx(inputCls, 'h-10 text-sm')} />
    </label>
  )
}

function Fields({ spec, onChange }: { spec: GraphicSpec; onChange: (spec: GraphicSpec) => void }) {
  switch (spec.template) {
    case 'title':
      return (
        <div className="flex flex-col gap-2.5">
          <TextInput label="Judul" max={MAX_TITLE} value={spec.title} onChange={(title) => onChange({ ...spec, title })} />
          <TextInput label="Subjudul" value={spec.subtitle} placeholder="Boleh dikosongkan" onChange={(subtitle) => onChange({ ...spec, subtitle })} />
        </div>
      )
    case 'bullets':
      return (
        <div className="flex flex-col gap-2.5">
          <TextInput label="Judul" max={MAX_TITLE} value={spec.title} placeholder="Boleh dikosongkan" onChange={(title) => onChange({ ...spec, title })} />
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink-2">Poin</span>
            {spec.items.map((item, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  value={item}
                  maxLength={MAX_LINE}
                  aria-label={`Poin ${i + 1}`}
                  onChange={(e) => onChange({ ...spec, items: spec.items.map((x, j) => (j === i ? e.target.value : x)) })}
                  className={cx(inputCls, 'h-10 text-sm')}
                />
                <IconButton
                  label={`Hapus poin ${i + 1}`}
                  size={40}
                  disabled={spec.items.length <= 1}
                  onClick={() => onChange({ ...spec, items: spec.items.filter((_, j) => j !== i) })}
                >
                  <X className="size-4" />
                </IconButton>
              </div>
            ))}
            <Button
              size="sm"
              icon={<Plus className="size-4" />}
              className="self-start"
              disabled={spec.items.length >= MAX_BULLETS}
              onClick={() => onChange({ ...spec, items: [...spec.items, ''] })}
            >
              Tambah poin
            </Button>
          </div>
        </div>
      )
    case 'stat':
      return (
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-[minmax(0,1fr)_90px_90px] gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold text-ink-2">Angka</span>
              <NumberInput label="Angka" value={spec.value} onChange={(value) => onChange({ ...spec, value })} />
            </label>
            <TextInput label="Awalan" max={6} value={spec.prefix} placeholder="Rp" onChange={(prefix) => onChange({ ...spec, prefix })} />
            <TextInput label="Satuan" max={8} value={spec.suffix} placeholder="%" onChange={(suffix) => onChange({ ...spec, suffix })} />
          </div>
          <TextInput label="Keterangan" value={spec.label} onChange={(label) => onChange({ ...spec, label })} />
          <TextInput label="Catatan kecil" value={spec.caption} placeholder="Boleh dikosongkan" onChange={(caption) => onChange({ ...spec, caption })} />
        </div>
      )
    case 'bars':
      return (
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
            <TextInput label="Judul" max={MAX_TITLE} value={spec.title} placeholder="Boleh dikosongkan" onChange={(title) => onChange({ ...spec, title })} />
            <TextInput label="Satuan" max={12} value={spec.unit} placeholder="juta" onChange={(unit) => onChange({ ...spec, unit })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink-2">Batang</span>
            {spec.bars.map((bar, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  value={bar.label}
                  maxLength={24}
                  placeholder="Label"
                  aria-label={`Label batang ${i + 1}`}
                  onChange={(e) => onChange({ ...spec, bars: spec.bars.map((b, j) => (j === i ? { ...b, label: e.target.value } : b)) })}
                  className={cx(inputCls, 'h-10 text-sm')}
                />
                <NumberInput
                  label={`Nilai batang ${i + 1}`}
                  value={bar.value}
                  className="w-24 shrink-0"
                  onChange={(value) => onChange({ ...spec, bars: spec.bars.map((b, j) => (j === i ? { ...b, value } : b)) })}
                />
                <IconButton
                  label={`Hapus batang ${i + 1}`}
                  size={40}
                  disabled={spec.bars.length <= 2}
                  onClick={() => onChange({ ...spec, bars: spec.bars.filter((_, j) => j !== i) })}
                >
                  <X className="size-4" />
                </IconButton>
              </div>
            ))}
            <Button
              size="sm"
              icon={<Plus className="size-4" />}
              className="self-start"
              disabled={spec.bars.length >= MAX_BARS}
              onClick={() => onChange({ ...spec, bars: [...spec.bars, { label: '', value: 0 }] })}
            >
              Tambah batang
            </Button>
          </div>
        </div>
      )
  }
}

/** Edits a motion scene: template, theme, the template's fields, a live preview, and the MP4 render of it. */
export function MotionEditor({
  clip,
  aspect,
  asset,
  job,
  onChange,
  onRender
}: {
  clip: Clip
  aspect: AspectRatio
  asset: Asset | null
  job: Job | null | undefined
  onChange: (spec: GraphicSpec) => void
  onRender: () => void
}) {
  const spec = clip.graphic
  const { width, height } = graphicSize(aspect)
  // A new object every render would make the Player re-render the scene on each unrelated store update.
  const inputProps = useMemo(() => (spec ? { spec, width, height } : null), [spec, width, height])
  if (!spec || !inputProps) return null

  const state = renderState(clip, asset, aspect)
  const running = isRunning(job)
  const frame = aspect === '9:16' ? 'aspect-[9/16] h-[min(300px,40vh)]' : 'aspect-video h-[min(282px,36vh)] max-w-full'

  return (
    <div className="flex flex-col gap-4">
      <div className={cx('mx-auto overflow-hidden rounded-xl border-[1.5px] border-ink bg-paper', frame)}>
        <Player
          component={GraphicScene}
          inputProps={inputProps}
          durationInFrames={graphicFrames(clip.durationMs)}
          fps={GRAPHIC_FPS}
          compositionWidth={width}
          compositionHeight={height}
          controls
          loop
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-line bg-paper px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex min-w-0 flex-1 flex-col">
            {running ? (
              <span className="text-sm font-semibold text-sun-ink">
                {job!.status === 'queued' ? 'Menunggu antrean…' : `${job!.message ?? 'Merender'} ${Math.round(job!.progress * 100)}%`}
              </span>
            ) : state === 'fresh' ? (
              <span className="text-sm font-semibold text-ok-ink">
                Sudah dirender{asset?.durationMs != null && <span className="font-mono font-normal"> · {secLabel(asset.durationMs)}</span>}
              </span>
            ) : state === 'outdated' ? (
              <span className="text-sm font-semibold text-sun-ink">Perlu render ulang</span>
            ) : (
              <span className="text-sm font-semibold text-ink-2">Belum dirender</span>
            )}
            {!running && state === 'outdated' && asset && <span className="text-xs text-sun-ink">{outdatedReason(asset, clip)}</span>}
            {!running && state === 'none' && <span className="text-xs text-muted">Pratinjau di atas hanya untuk dilihat. Render dulu supaya masuk ke video.</span>}
            {!running && state !== 'fresh' && job?.status === 'failed' && <span className="text-xs text-bad-ink">{job.error ?? 'Render gagal'}</span>}
          </div>
          <Button
            size="sm"
            variant={state === 'fresh' ? 'secondary' : 'accent'}
            icon={state === 'none' ? <Clapperboard className="size-4" /> : <RefreshCw className="size-4" />}
            loading={running}
            onClick={onRender}
          >
            {state === 'none' ? 'Render motion' : 'Render ulang'}
          </Button>
        </div>
        {running && <Progress value={job!.progress} />}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Template</span>
        <Segmented
          size="sm"
          value={spec.template}
          onChange={(t) => onChange(switchTemplate(spec, t))}
          options={GRAPHIC_TEMPLATES.map((t) => ({ id: t.id, label: t.label, title: t.hint }))}
          className="self-start"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Warna</span>
        <div className="flex flex-wrap gap-2">
          {GRAPHIC_THEMES.map((t) => {
            const on = spec.theme === t.id
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...spec, theme: t.id })}
                className={cx(
                  'inline-flex h-10 items-center gap-2 rounded-xl py-0 pl-1.5 pr-3 text-[13px] font-medium',
                  on ? 'border-2 border-ink bg-sun-soft' : 'border border-line-2 bg-surface hover:border-ink-2'
                )}
              >
                <span className="flex size-7 items-center justify-center rounded-lg border border-line-3" style={{ background: t.bg }}>
                  <span className="size-3 rounded-full" style={{ background: t.accent }} />
                </span>
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      <Fields spec={spec} onChange={onChange} />
    </div>
  )
}
