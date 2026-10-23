import type { CliImageTool, CliTool, LlmProvider } from './types'

export const LLM_PROVIDERS: { id: LlmProvider; name: string; note: string; link: string | null; linkLabel: string }[] = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    note: 'Kunci ini juga dipakai untuk suara narator Gemini TTS.',
    link: 'https://aistudio.google.com/apikey',
    linkLabel: 'Buat kunci di Google AI Studio'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    note: 'Satu kunci untuk ratusan model dari banyak penyedia, termasuk model gratis.',
    link: 'https://openrouter.ai/settings/keys',
    linkLabel: 'Buat kunci di OpenRouter'
  },
  {
    id: 'groq',
    name: 'Groq',
    note: 'Inferensi sangat cepat untuk model open-source seperti Llama, Qwen, dan GPT-OSS.',
    link: 'https://console.groq.com/keys',
    linkLabel: 'Buat kunci di console Groq'
  },
  {
    id: 'custom',
    name: 'Endpoint custom',
    note: 'Server apa pun yang kompatibel dengan OpenAI API, misalnya Ollama, LM Studio, vLLM, DeepSeek, atau xAI Grok.',
    link: null,
    linkLabel: ''
  },
  {
    id: 'cli',
    name: 'CLI di komputer',
    note: 'Pakai Claude Code, Codex CLI, Antigravity, atau perintah sendiri yang sudah terpasang dan login di komputer ini. Tanpa kunci API.',
    link: null,
    linkLabel: ''
  }
]

export function llmName(id: LlmProvider): string {
  return LLM_PROVIDERS.find((p) => p.id === id)?.name ?? id
}

/** CLIs that the `cli` provider knows how to run. `bin` is the executable looked up on PATH. */
export const CLI_TOOLS: { id: CliTool; name: string; bin: string | null; note: string; modelHint: string }[] = [
  { id: 'claude', name: 'Claude Code', bin: 'claude', note: 'Perintah `claude`, pakai login Claude di komputer ini.', modelHint: 'opus, sonnet, atau haiku' },
  { id: 'codex', name: 'Codex CLI', bin: 'codex', note: 'Perintah `codex exec`, pakai login ChatGPT/OpenAI di komputer ini.', modelHint: 'nama model yang dikenali Codex' },
  { id: 'agy', name: 'Antigravity', bin: 'agy', note: 'Perintah `agy`, pakai login Google Antigravity di komputer ini.', modelHint: 'ID dari `agy models`, misalnya gemini-3.8-flash-medium' },
  { id: 'custom', name: 'Perintah sendiri', bin: null, note: 'CLI lain. Prompt dikirim lewat stdin, balasan dibaca dari stdout.', modelHint: 'menggantikan {model} di perintah' }
]

/** CLIs that can make images for the `cli/image` model. Claude Code and Codex are left out: see docs/layanan-ai.md. */
export const CLI_IMAGE_TOOLS: { id: CliImageTool; name: string; bin: string | null; note: string }[] = [
  { id: 'agy', name: 'Antigravity', bin: 'agy', note: 'Memakai alat gambar bawaan Antigravity (`generate_image`). Satu gambar sekitar 1 menit.' },
  { id: 'custom', name: 'Perintah sendiri', bin: null, note: 'CLI lain. Prompt masuk lewat stdin, perintah harus menulis satu file gambar ke {output}.' }
]

/** The CLI picks its own model when none is set, so only API providers need one chosen in Settings. */
export function llmNeedsModel(id: LlmProvider): boolean {
  return id !== 'cli'
}

/** What the UI shows for the chosen model; the CLI uses its own default when none is set. */
export function llmModelLabel(id: LlmProvider, model: string): string {
  return model || (llmNeedsModel(id) ? 'model belum dipilih' : 'model bawaan CLI')
}

/** Higgsfield image and video models live in ./higgsfield.ts, generated from the API docs. */

/**
 * Gemini 3.8 TTS Voice Library voices that ship with a sample in the app (assets/voices/<id>.mp3). Used
 * when the live voice list cannot be fetched; the tone comes from each sample's persona.
 */
export const GEMINI_LIBRARY_VOICES: { id: string; name: string; tone: string }[] = [
  { id: 'en-us-arlo', name: 'Arlo', tone: 'asisten pribadi' },
  { id: 'en-us-bodi', name: 'Bodi', tone: 'pengajar sastra' },
  { id: 'en-us-brio', name: 'Brio', tone: 'pembaca berita bisnis' },
  { id: 'en-us-cruz', name: 'Cruz', tone: 'penasihat keuangan' },
  { id: 'en-us-daro', name: 'Daro', tone: 'layanan pelanggan, empatik' },
  { id: 'en-us-elio', name: 'Elio', tone: 'formal, resmi' },
  { id: 'en-us-enya', name: 'Enya', tone: 'pemandu teknis' },
  { id: 'en-us-enzo', name: 'Enzo', tone: 'pencerita petualangan' },
  { id: 'en-us-finn', name: 'Finn', tone: 'asisten pribadi' },
  { id: 'en-us-fola', name: 'Fola', tone: 'layanan pelanggan' },
  { id: 'en-us-gero', name: 'Gero', tone: 'hangat, menenangkan' },
  { id: 'en-us-hali', name: 'Hali', tone: 'layanan pelanggan' },
  { id: 'en-us-jett', name: 'Jett', tone: 'pemandu teknis' },
  { id: 'en-us-lora', name: 'Lora', tone: 'concierge elegan' },
  { id: 'en-us-ludo', name: 'Ludo', tone: 'pengajar teknologi' },
  { id: 'en-us-lumi', name: 'Lumi', tone: 'pengajar sastra' },
  { id: 'en-us-mako', name: 'Mako', tone: 'presentasi produk' },
  { id: 'en-us-neno', name: 'Neno', tone: 'lembut, pendengar' },
  { id: 'en-us-nika', name: 'Nika', tone: 'lembut, pendengar' },
  { id: 'en-us-nyla', name: 'Nyla', tone: 'pemandu teknis' },
  { id: 'en-us-rami', name: 'Rami', tone: 'pembaca berita' },
  { id: 'en-us-riko', name: 'Riko', tone: 'pencerita fantasi' },
  { id: 'en-us-rina', name: 'Rina', tone: 'hangat, menenangkan' },
  { id: 'en-us-tari', name: 'Tari', tone: 'tenang, menenangkan' },
  { id: 'en-us-tavi', name: 'Tavi', tone: 'concierge elegan' },
  { id: 'en-us-tova', name: 'Tova', tone: 'formal, resmi' },
  { id: 'en-us-varo', name: 'Varo', tone: 'pengajar matematika' },
  { id: 'en-us-veda', name: 'Veda', tone: 'pembaca berita' },
  { id: 'en-us-zali', name: 'Zali', tone: 'dramatis, fantasi gelap' },
  { id: 'en-us-zeno', name: 'Zeno', tone: 'pembawa acara' }
]

/** Tone of any Gemini voice we know, by id. */
export function geminiVoiceTone(id: string): string | undefined {
  return GEMINI_LIBRARY_VOICES.find((v) => v.id === id)?.tone ?? GEMINI_VOICES.find((v) => v.id === id)?.tone
}

export function geminiVoiceName(id: string): string {
  return GEMINI_LIBRARY_VOICES.find((v) => v.id === id)?.name ?? id
}

/** The 30 classic prebuilt voices. */
export const GEMINI_VOICES: { id: string; tone: string }[] = [
  { id: 'Charon', tone: 'informatif' },
  { id: 'Kore', tone: 'tegas' },
  { id: 'Puck', tone: 'ceria' },
  { id: 'Zephyr', tone: 'cerah' },
  { id: 'Fenrir', tone: 'bersemangat' },
  { id: 'Leda', tone: 'muda' },
  { id: 'Orus', tone: 'tegas' },
  { id: 'Aoede', tone: 'santai' },
  { id: 'Callirrhoe', tone: 'santai' },
  { id: 'Autonoe', tone: 'cerah' },
  { id: 'Enceladus', tone: 'berbisik' },
  { id: 'Iapetus', tone: 'jernih' },
  { id: 'Umbriel', tone: 'santai' },
  { id: 'Algieba', tone: 'halus' },
  { id: 'Despina', tone: 'halus' },
  { id: 'Erinome', tone: 'jernih' },
  { id: 'Algenib', tone: 'serak' },
  { id: 'Rasalgethi', tone: 'informatif' },
  { id: 'Laomedeia', tone: 'ceria' },
  { id: 'Achernar', tone: 'lembut' },
  { id: 'Alnilam', tone: 'tegas' },
  { id: 'Schedar', tone: 'stabil' },
  { id: 'Gacrux', tone: 'dewasa' },
  { id: 'Pulcherrima', tone: 'lugas' },
  { id: 'Achird', tone: 'ramah' },
  { id: 'Zubenelgenubi', tone: 'kasual' },
  { id: 'Vindemiatrix', tone: 'lembut' },
  { id: 'Sadachbia', tone: 'hidup' },
  { id: 'Sadaltager', tone: 'berwawasan' },
  { id: 'Sulafat', tone: 'hangat' }
]

export const LANGUAGES: { code: string; label: string; english: string }[] = [
  { code: 'id', label: 'Indonesia', english: 'Indonesian' },
  { code: 'en', label: 'English', english: 'English' },
  { code: 'ms', label: 'Melayu', english: 'Malay' },
  { code: 'jv', label: 'Jawa', english: 'Javanese' },
  { code: 'su', label: 'Sunda', english: 'Sundanese' },
  { code: 'es', label: 'Español', english: 'Spanish' },
  { code: 'ar', label: 'العربية', english: 'Arabic' }
]

export const DURATIONS: { sec: number; label: string }[] = [
  { sec: 30, label: '30 detik' },
  { sec: 60, label: '1 menit' },
  { sec: 180, label: '3 menit' },
  { sec: 300, label: '5 menit' },
  { sec: 600, label: '10 menit' }
]

/** Roughly one clip every ~5.5 seconds of narration. */
export function clipCountFor(durationSec: number): number {
  return Math.max(3, Math.min(120, Math.round(durationSec / 5.5)))
}
