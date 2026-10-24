# Layanan AI dan kunci API

Semua panggilan ke layanan luar dilakukan di **proses utama** (`src/main/services/`). Renderer tidak pernah
memegang kunci API.

## Kunci API (BYOK)

Pengguna memasukkan kuncinya sendiri di **Pengaturan › Layanan AI dan kunci**.

- Disimpan di tabel `secrets` setelah dienkripsi dengan Electron `safeStorage`. Di Windows ini memakai DPAPI,
  terikat ke akun Windows pengguna, jadi salinan `studio.db` di komputer lain tidak bisa membuka kuncinya.
- Kunci kriptonya dibuat saat startup (`warmUpEncryption`) supaya tidak hilang kalau aplikasi ditutup paksa tepat
  setelah menyimpan kunci pertama.
- `requireSecret(provider)` melempar error berbahasa Indonesia kalau kunci belum ada.
- `revealSecret` hanya dipanggil tombol "tampilkan kunci" di Pengaturan.
- **Jangan pernah** menulis kunci ke log, pesan error, file, URL, atau mengirimnya ke layanan lain.
- Mengganti kunci Higgsfield menghapus cache estimasi kredit (`forgetEstimates`). Menghapus kunci Cloudflare ikut mengosongkan Account ID.

| Penyedia (`ApiProvider`) | Dipakai untuk |
|---|---|
| `higgsfield` | gambar, lembar karakter, video (opsional, tidak wajib) |
| `gemini` | LLM (naskah/visual), Gemini TTS, dan gambar Nano Banana |
| `fal` | gambar (FLUX) dan video AI (Wan 2.2, LTX 2.3, Hailuo 02, Veo 3.1 Lite) lewat satu kunci |
| `cloudflare` | gambar lewat Cloudflare Workers AI (token terenkripsi; Account ID disimpan di pengaturan `cloudflareAccountId`) |
| `elevenlabs` | TTS |
| `openrouter`, `groq`, `custom` | LLM lewat API kompatibel OpenAI |
| `cli`, `cli-image` | CLI di komputer: LLM dan gambar (tanpa kunci, lihat bagian CLI di bawah) |

## LLM (`services/llm.ts`, `services/gemini.ts`)

- `generateJson({ system, prompt, schema, name })` memanggil penyedia aktif (`settings.llmProvider` +
  `llmModels[provider]`).
  - Gemini: `@google/genai` dengan `responseJsonSchema` (dan cadangan: skema ditulis di system instruction).
  - Lainnya: `/chat/completions`, dicoba berurutan `json_schema` (strict) → `json_object` → teks biasa, lalu JSON
    diambil dari teks (`extractJson`) untuk model yang tidak mendukung structured output.
- `listModels(source)`: daftar model live dari penyedia, dicache di tabel `cache` dan disegarkan saat basi.
- **Menambah penyedia LLM baru** yang kompatibel OpenAI: tambahkan ke `LlmProvider` dan `ApiProvider`
  (`types.ts`), `LLM_PROVIDERS` (`shared/models.ts`), konfigurasi base URL di `llm.ts`, dan `DEFAULT_SETTINGS.llmModels`.

## CLI di komputer (`services/cli.ts`)

CLI AI yang sudah terpasang dan login di komputer pengguna bisa dipakai tanpa kunci API, untuk **menulis cerita**
(`llmProvider: 'cli'`) dan **membuat gambar** (model `cli/image`). Tidak ada kunci yang disimpan; baris `cli` dan
`cli-image` di tabel `secrets` hanya menyimpan hasil tes terakhir (nilainya kosong, seperti endpoint custom).

| CLI | Teks | Gambar | Cara jalan |
|---|---|---|---|
| Claude Code (`claude`) | ya | tidak: tidak punya alat gambar | `claude -p --output-format text --no-session-persistence --tools "" --disable-slash-commands --setting-sources ""`, prompt lewat stdin |
| Codex CLI (`codex`) | ya | belum | `codex exec --ephemeral --sandbox read-only -o <file> -`, balasan dibaca dari file |
| Antigravity (`agy`) | ya | ya | `agy --input-format stream-json --output-format stream-json`; prompt satu event `user` di stdin, balasan dari event `result` |
| Perintah sendiri | ya | ya | string shell dari pengguna; teks: `{model}` diganti model, prompt di stdin, balasan di stdout. Gambar: prompt di stdin, file ditulis ke `{output}` (sudah diberi tanda kutip), `{aspect}` = `16:9`/`9:16` |

- Setiap panggilan berjalan di folder sementara kosong (`bangstory-cli-*`) yang dihapus sesudahnya, supaya CLI tidak
  membaca berkas proyek dan tidak meninggalkan apa pun. Prompt tidak pernah ditaruh di argumen, jadi batas panjang baris
  perintah (Windows) tidak berlaku.
- PATH dibaca dari login shell (macOS/Linux), karena aplikasi yang dibuka dari Finder tidak mewarisi PATH terminal.
- Pengaturan: `cliTool` + `cliCommand` (teks), `cliImageTool` + `cliImageCommand` (gambar), `llmModels.cli` (model
  opsional; kosong = model bawaan CLI). Tes teks mengirim "Reply with the single word OK" (memakai sedikit kuota). Tes
  gambar Antigravity cukup `agy models` (tanpa membuat gambar); tes perintah custom benar-benar menggambar satu kotak.
- Gambar Antigravity: alat `generate_image` dipanggil lewat subagent, ±1 menit per gambar (terukur 55–75 detik). Aplikasi
  meminta path hasil di dalam tag `<path>`, lalu memeriksa magic byte PNG/JPEG/WebP sebelum menyimpannya. Rasio 16:9
  menghasilkan 1376×768, 9:16 menghasilkan 768×1376. Antrean `cli` menjalankan 2 gambar sekaligus. Tanpa lembar karakter
  (`input.mode: 'none'`).

### Soal `--dangerously-*`

Aplikasi **tidak pernah** memberi `--dangerously-skip-permissions` (Antigravity/Claude) atau
`--dangerously-bypass-approvals-and-sandbox` (Codex). Teks tidak butuh alat, dan `generate_image` Antigravity jalan
tanpa izin `command` (terukur). Flag itu membuka izin menjalankan perintah apa saja atas nama pengguna, dan menurut
issue antigravity-cli #36 membuat `--sandbox` tidak berguna. Kalau `agy` tetap meminta izin (exit 0, respons kosong,
`denied_actions` terisi), `agyReply` melempar pesan yang menyebut alat yang ditolak.

- **Codex untuk gambar belum didukung.** Di akun yang diuji, `exec` memilih alat MCP Canva (butuh persetujuan, ditolak
  karena `approval: never`), dan dengan `--ignore-user-config` alat `image_gen` bawaan tidak tersedia. Tanpa bukti
  jalan, tidak ada kode yang dikirim. Pengguna bisa membungkus Codex sendiri lewat "Perintah sendiri".
- Perintah custom dijalankan lewat shell dengan hak pengguna. Perintah itu hanya bisa diisi pengguna sendiri di
  Pengaturan (IPC `settings:setCli`/`setCliImage`), tidak pernah berasal dari AI atau proyek.
- Menambah CLI baru: tambahkan ke `CliTool` (`types.ts`), `CLI_TOOLS`/`CLI_IMAGE_TOOLS` (`shared/models.ts`), lalu cabang
  di `ask()`/`makeImage()` (`services/cli.ts`).

## TTS

| Penyedia | File | Catatan |
|---|---|---|
| Gemini TTS | `services/gemini.ts` | PCM 24 kHz → WAV; daftar suara dari Voice Library (`listVoices`, cache 24 jam) dengan cadangan statis di `shared/models.ts`; contoh suara bawaan di `renderer/src/assets/voices` |
| ElevenLabs | `services/elevenlabs.ts` | memakai endpoint with-timestamps untuk waktu per kata; tag `<...>` diubah ke `[tag]` untuk model v3, atau ke `<break>` untuk model lama (`toElevenLabsText`) |

Narasi selalu dibuat satu rekaman utuh lalu dipotong. Lihat [alur-produksi.md](alur-produksi.md#4-narasi-srcmainnarrationts).

## Higgsfield (`services/higgsfield.ts`, `shared/higgsfield.ts`)

- Base URL `https://api.higgsfield.ai`, header `Authorization: Key <kunci>`.
- Alur: `submit(endpoint, body)` → polling `getStatus` → unduh hasil. `uploadFile` mengunggah gambar referensi
  (lembar karakter, gambar klip untuk video).
- `estimate(endpoint, body)` memanggil `/estimate/<endpoint>` → `{ credits, usd }`, dicache 24 jam di tabel `cache`.
  Endpoint ini gratis (tidak memakai kredit). API Higgsfield tidak punya daftar harga maupun endpoint saldo, jadi
  biaya per model selalu diambil dari sini.
- Pesan error dibuat ramah (`friendly`): kunci salah, kredit habis, terlalu banyak proses, model tidak tersedia.
- Untuk pengembangan, `STUDIO_HF_BASE` bisa diarahkan ke server tiruan (mock) supaya UI bisa diuji tanpa kredit.

### Katalog model (`src/shared/higgsfield-catalog.json`)

48 model: 14 model gambar (teks ke gambar) dan 34 model video yang bisa menganimasikan gambar klip. Model yang butuh
video masukan (edit video, motion control) atau hanya teks-ke-video sengaja tidak dimasukkan. Seedream belum tersedia
di API Higgsfield (hanya di aplikasi webnya). Satu entri:

```json
{
  "id": "kling-video/v3.0/std/image-to-video",
  "name": "Kling 3.0 · Standard · Image to video",
  "family": "Kling",
  "kind": "video",
  "input": { "field": "image_url", "mode": "first-frame", "max": 1 },
  "required": ["image_url"],
  "props": { "prompt": { "type": "string" }, "duration": { "type": "integer", "minimum": 3, "maximum": 15 }, "sound": { "enum": ["on", "off"] } },
  "durations": { "min": 3, "max": 15 },
  "tags": ["Kling"]
}
```

- `input.field`/`mode`/`max`: tempat gambar referensi atau frame pertama dikirim, dan berapa banyak.
- `props`: skema parameter dari dokumentasi Higgsfield. `imageBody`/`videoBody` di `shared/higgsfield.ts`
  mengisinya secara umum: rasio, resolusi, kualitas, durasi, mematikan `enhance_prompt`, `prompt_extend`, dan audio.
- `durations`: rentang (`min`/`max`) atau daftar (`values`) durasi video.
- **Menambah model**: tambahkan entri baru dengan format yang sama dari dokumentasi API Higgsfield
  (`https://docs.higgsfield.ai/docs/llms.txt`), lalu pastikan `imageBody`/`videoBody` tidak melempar error
  "butuh <field>" (`checkRequired`). Ikon keluarga model diatur di `components/ModelLogo.tsx`.
- Model bawaan: `DEFAULT_IMAGE_MODEL` dan `DEFAULT_VIDEO_MODEL` di `shared/higgsfield.ts`.


## Penyedia gambar dan video selain Higgsfield

Model apa pun dikenali dari awalan id-nya (`providerOfModel` di `shared/higgsfield.ts`): `gemini/…`, `fal-ai/…`, `@cf/…`, `cli/…`;
id tanpa awalan milik Higgsfield. Setiap proyek menyimpan model gambar dan videonya sendiri, dan tidak ada penyedia yang wajib.
Proyek baru memakai model terakhir yang dipilih; kalau belum pernah memilih, `modelsForNewProject` (`main/defaults.ts`) memilih
model dari penyedia termurah yang kuncinya valid (Cloudflare, Fal.ai, Gemini, CLI, lalu Higgsfield untuk gambar; Fal.ai lalu
Higgsfield untuk video).

| Penyedia | File | Model | Cara kerja |
|---|---|---|---|
| Cloudflare Workers AI | `services/cloudflare.ts` | SDXL Lightning, FLUX.1 schnell, Lucid Origin | `POST /accounts/{id}/ai/run/{model}` dengan `Authorization: Bearer`. Jawaban bisa JSON `{result:{image}}` (base64) atau gambar mentah. Hanya SDXL Lightning dan Lucid Origin menerima `width`/`height` (1344×768 atau 768×1344); FLUX schnell tidak punya parameter ukuran, jadi hasilnya persegi. Tes kunci: `GET /accounts/{id}/ai/models/search`. Jatah gratis 10.000 neuron per hari; kalau habis, pesan error menyebutnya. |
| Fal.ai | `services/fal.ts` | FLUX schnell/dev (gambar); Wan 2.2 A14B, LTX 2.3 Fast, Hailuo 02 Standard, Veo 3.1 Lite (video) | Antrean `queue.fal.run`: kirim, polling `status_url`, ambil `response_url`. URL status dan hasil diambil dari jawaban Fal sendiri karena endpoint bersarang (`fal-ai/wan/...`) diantrekan di app id-nya. Gambar awal video dikirim sebagai data URI. |
| Google Gemini | `services/gemini.ts` | Nano Banana 2 Lite, Nano Banana 2.1 | `POST /v1beta/interactions` dengan `response_format: {type:'image', aspect_ratio, image_size:'1K'}`; gambar dibaca dari langkah `model_output`. |
| CLI | `services/cli.ts` | `cli/image` | Lihat bagian CLI di atas. |

- **Katalog dan harga** ada di `shared/higgsfield.ts` (`CLOUDFLARE_IMAGE_MODELS`, `FAL_IMAGE_MODELS`, `GEMINI_IMAGE_MODELS`,
  `CLI_IMAGE_MODELS`, `FAL_VIDEO_MODELS`). Harga di sana adalah harga daftar (USD per gambar, atau per detik video menurut
  resolusi), bukan hasil panggilan API; `estimateCredits` mengembalikan `{ credits: 0, usd }` untuk semua penyedia selain
  Higgsfield. Cek ulang harga di situs penyedia sebelum mengisi saldo.
- **Bentuk permintaan video** berbeda per endpoint, dan semuanya diatur lewat entri katalog, bukan percabangan di kode:
  `durationAs: 'text'` (Hailuo: `"6"`), `'suffix'` (Veo: `"6s"`), `'frames'` (Wan: `num_frames` 17–161 pada 16 fps), `fixed`
  (field tetap, mis. `prompt_optimizer: false`), `defaultResolution`. Suara bawaan model dimatikan (`generate_audio: false`)
  karena narasi dan musik berasal dari editor.
- **Menambah model Fal baru**: salin skema input dari `https://fal.ai/models/<endpoint-id>/llms.txt`, tambahkan `falVideo({...})`
  atau `textToImage(...)`, lalu cek `videoBody` menghasilkan field yang sama dengan contoh di dokumentasinya.
- **Veo lewat Gemini API tidak dipakai**: Google mematikan `veo-3.1-*-preview` pada 22 Okt 2026 dan menggantinya dengan
  Gemini Omni Flash (API Interactions), yang belum dipasang. Veo dipakai lewat Fal.ai.
- **Imagen 3 sudah dimatikan Google** (Nov 2025). Proyek lama yang menyimpan `gemini/imagen-3.0-generate-002` otomatis
  dipetakan ke Nano Banana 2 Lite (`RENAMED_MODELS`).
- **Import gambar lokal**: pengguna juga bisa mengimpor gambar PNG/JPG/WebP sendiri ke klip atau lembar karakter tanpa API.

## Whisper lokal (`src/main/whisper.ts`)

- Biner: `resources/whisper/whisper-cli.exe` + DLL (whisper.cpp, lisensi MIT). Saat ini hanya untuk Windows.
- Model: `ggml-small.bin` (sekitar 488 MB) dari Hugging Face (`ggerganov/whisper.cpp`), diunduh di Pengaturan ke
  `<folder data>\models\whisper`, bisa dijeda dan dilanjutkan (HTTP Range), lalu dicek SHA-256. Untuk pengembangan, `STUDIO_WHISPER_URL` bisa menunjuk salinan lokal.
- Dijalankan di antrean `whisper` (satu per satu). Detail argumennya di [alur-produksi.md](alur-produksi.md#5-caption-akurat-whisper-lokal).

## YouTube (halaman About)

Video tutorial diputar lewat iframe `https://www.youtube.com/embed/<id>`. Sejak 2025 YouTube mewajibkan pemutar
embed mengirim identitas lewat header HTTP Referer (tanpa itu: Error 153). Aplikasi yang memuat halaman dari
`file://` tidak mengirim Referer, jadi `identifyToYouTube()` (`src/main/index.ts`) menambahkan
`Referer: https://id.bangtutorial.bangstory/` (ID aplikasi) hanya untuk permintaan embed. Iframe tanpa
autoplay, supaya putaran dari pengguna terhitung sebagai view.

## Membuka tautan

`app:openExternal` hanya menerima URL `https://` dan membukanya di browser bawaan. Pakai ini untuk semua tautan
ke luar (dokumentasi penyedia, channel YouTube, Suno, dan lainnya).
