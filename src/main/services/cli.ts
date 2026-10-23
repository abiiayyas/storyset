import { execFile, spawn } from 'node:child_process'
import { accessSync, constants, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { CLI_IMAGE_TOOLS, CLI_TOOLS } from '@shared/models'
import type { AspectRatio, CliImageTool, CliTool, KeyTestResult } from '@shared/types'
import { getSettings } from '../settings'
import { extractJson } from './json'

/**
 * AI CLIs that are already installed and logged in on this machine (Claude Code, Codex CLI, Antigravity, or a
 * user-written command), used as the story writer (`cli` LLM provider) and as an image maker (`cli/image` model).
 *
 * Prompts go in through stdin, so their size never hits the OS command-line limit. No permission-bypass flag is ever
 * passed (`--dangerously-*`): text needs no tools, and Antigravity's `generate_image` runs without one. A CLI that
 * still asks for a permission in headless mode is reported to the user instead of being given blanket access.
 */

// A story plan can take a while, and CLIs start agent runtimes on top of the model call.
const RUN_TIMEOUT_MS = 6 * 60 * 1000
const TEST_TIMEOUT_MS = 90 * 1000
const MAX_OUTPUT = 8 * 1024 * 1024
const MAX_IMAGE = 40 * 1024 * 1024
/** Model names end up on a command line (cmd.exe on Windows), so only characters that need no quoting. */
const SAFE_MODEL = /^[A-Za-z0-9._:/@+-]+$/

const toolName = (tool: CliTool): string => CLI_TOOLS.find((t) => t.id === tool)?.name ?? tool
const imageToolName = (tool: CliImageTool): string => CLI_IMAGE_TOOLS.find((t) => t.id === tool)?.name ?? tool

// ---------- finding the program ----------

let loginPath: Promise<string> | null = null

/**
 * PATH as the user's terminal sees it. An app opened from Finder or the Dock gets a bare PATH on macOS/Linux,
 * without ~/.local/bin, Homebrew or nvm, so `claude` and `codex` would look missing. Asking the login shell
 * fixes that; Windows apps inherit the real PATH already.
 */
function searchPath(): Promise<string> {
  const base = process.env.PATH ?? ''
  if (process.platform === 'win32') return Promise.resolve(base)
  if (loginPath) return loginPath
  const { promise, resolve } = Promise.withResolvers<string>()
  loginPath = promise
  const mark = '__BANGSTORY_PATH__'
  const shell = process.env.SHELL || '/bin/zsh'
  execFile(shell, ['-ilc', `printf '${mark}%s${mark}' "$PATH"`], { timeout: 5000, windowsHide: true }, (_err, stdout) => {
    const fromShell = new RegExp(`${mark}(.*?)${mark}`, 's').exec(String(stdout ?? ''))?.[1] ?? ''
    const extra = [join(homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin']
    resolve([...new Set([...fromShell.split(delimiter), ...base.split(delimiter), ...extra].filter(Boolean))].join(delimiter))
  })
  return promise
}

function findBin(bin: string, path: string): string | null {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat'] : ['']
  for (const dir of path.split(delimiter)) {
    if (!dir) continue
    for (const ext of exts) {
      const file = join(dir, bin + ext)
      try {
        if (!statSync(file).isFile()) continue
        accessSync(file, constants.X_OK)
        return file
      } catch {
        // not here
      }
    }
  }
  return null
}

// ---------- running it ----------

function abortError(): Error {
  return Object.assign(new Error('Dibatalkan'), { name: 'AbortError' })
}

function killTree(pid: number | undefined): void {
  if (!pid) return
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    else process.kill(-pid, 'SIGTERM')
  } catch {
    // already gone
  }
}

interface Spawn {
  command: string
  args: string[]
  shell: boolean
  cwd: string
  env: NodeJS.ProcessEnv
}

function run(s: Spawn, input: string, name: string, timeoutMs: number, signal?: AbortSignal): Promise<string> {
  const { promise, resolve, reject } = Promise.withResolvers<string>()
  if (signal?.aborted) {
    reject(abortError())
    return promise
  }
  const child = spawn(s.command, s.args, {
    cwd: s.cwd,
    env: s.env,
    shell: s.shell,
    windowsHide: true,
    // Its own process group on POSIX, so a timeout can stop the whole tree and not just the shell.
    detached: process.platform !== 'win32',
    stdio: ['pipe', 'pipe', 'pipe']
  })
  let out = ''
  let err = ''
  let settled = false
  const end = (fn: () => void): void => {
    if (settled) return
    settled = true
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
    fn()
  }
  const stop = (e: Error): void => {
    killTree(child.pid)
    end(() => reject(e))
  }
  const onAbort = (): void => stop(abortError())
  const timer = setTimeout(() => stop(new Error(`${name} terlalu lama merespons (lebih dari ${Math.round(timeoutMs / 60000)} menit).`)), timeoutMs)
  signal?.addEventListener('abort', onAbort, { once: true })

  child.stdout.setEncoding('utf8').on('data', (d: string) => {
    out += d
    if (out.length > MAX_OUTPUT) stop(new Error(`${name} mengirim balasan yang terlalu besar.`))
  })
  child.stderr.setEncoding('utf8').on('data', (d: string) => {
    err = (err + d).slice(-4000)
  })
  // The CLI may exit before it reads all of stdin (bad flag, not logged in); the exit code tells the story.
  child.stdin.on('error', () => {})
  child.on('error', (e) => end(() => reject(new Error(`Tidak bisa menjalankan ${name}: ${e.message}`))))
  child.on('close', (code) =>
    end(() => {
      if (code === 0) return resolve(out)
      const detail = (err || out).trim().split('\n').slice(-6).join('\n').slice(-400)
      reject(new Error(`${name} berhenti dengan kode ${code}${detail ? `: ${detail}` : ''}. Pastikan CLI sudah login dan bisa dipakai di Terminal.`))
    })
  )
  child.stdin.end(input)
  return promise
}

interface Workspace {
  /** An empty temp folder, so the CLI sees no project files and leaves nothing behind. */
  cwd: string
  path: string
  env: NodeJS.ProcessEnv
  cleanup: () => void
}

async function workspace(): Promise<Workspace> {
  const path = await searchPath()
  const env: NodeJS.ProcessEnv = process.platform === 'win32' ? process.env : { ...process.env, PATH: path }
  const cwd = mkdtempSync(join(tmpdir(), 'bangstory-cli-'))
  return { cwd, path, env, cleanup: () => rmSync(cwd, { recursive: true, force: true }) }
}

/** A process for a program found on PATH. */
function program(w: Workspace, bin: string, args: string[]): Spawn {
  // npm installs CLIs on Windows as .cmd shims, which cannot be spawned without a shell. Quote every argument,
  // because cmd.exe would drop the empty ones.
  const shim = process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin)
  return shim ? { command: `"${bin}"`, args: args.map((a) => `"${a}"`), shell: true, cwd: w.cwd, env: w.env } : { command: bin, args, shell: false, cwd: w.cwd, env: w.env }
}

function locate(w: Workspace, name: string, bin: string): string {
  const file = findBin(bin, w.path)
  if (!file) throw new Error(`Perintah "${bin}" tidak ditemukan di komputer ini. Pasang ${name} dan login dulu, lalu klik Tes.`)
  return file
}

function checkModel(model: string): void {
  if (model && !SAFE_MODEL.test(model)) throw new Error('Nama model hanya boleh berisi huruf, angka, dan tanda . _ : / @ + -')
}

/** Fills `{model}` of a user command; a command that needs one cannot run without it (the flag would dangle). */
function withModel(command: string, model: string): string {
  if (!command.trim()) throw new Error('Perintah CLI belum diisi. Buka Pengaturan untuk menambahkannya.')
  if (command.includes('{model}') && !model) throw new Error('Perintah memakai {model}, tapi kolom Model belum diisi. Isi modelnya di Pengaturan, lalu tes lagi.')
  return command.replaceAll('{model}', model)
}

// ---------- Antigravity ----------

interface AgyResult {
  status?: string
  response?: string
  error?: string
  denied_actions?: { action?: string; display_name?: string }[]
}

/** Antigravity gets one `user` event on stdin and answers with NDJSON events; the last `result` holds the reply. */
function agyReply(stdout: string): string {
  let result: AgyResult | null = null
  for (const line of stdout.split('\n')) {
    if (!line.startsWith('{')) continue
    try {
      const e = JSON.parse(line) as { event?: string; result?: AgyResult }
      if (e.event === 'result' && e.result) result = e.result
    } catch {
      // not an event line
    }
  }
  if (!result) throw new Error('Antigravity selesai tanpa mengirim hasil. Coba lagi.')
  if (result.status !== 'SUCCESS') throw new Error(`Antigravity gagal: ${result.error || result.status}`)
  const denied = (result.denied_actions ?? []).map((d) => d.display_name || d.action).filter(Boolean)
  if (denied.length > 0 && !(result.response ?? '').trim())
    throw new Error(
      `Antigravity menolak menjalankan ${denied.join(', ')} karena butuh izin yang tidak bisa ditanyakan saat berjalan dari aplikasi. Aplikasi sengaja tidak memakai --dangerously-skip-permissions. Beri izin sempit di pengaturan Antigravity, atau pilih CLI lain.`
    )
  return result.response ?? ''
}

const agyInput = (prompt: string): string => `${JSON.stringify({ event: 'user', message: { content: prompt } })}\n`
const AGY_STREAM = ['--input-format', 'stream-json', '--output-format', 'stream-json']

// ---------- text ----------

async function ask(tool: CliTool, command: string, model: string, prompt: string, timeoutMs: number, signal?: AbortSignal): Promise<string> {
  checkModel(model)
  const w = await workspace()
  const name = toolName(tool)
  try {
    if (tool === 'custom') return await run({ command: withModel(command, model), args: [], shell: true, cwd: w.cwd, env: w.env }, prompt, name, timeoutMs, signal)

    const bin = locate(w, name, CLI_TOOLS.find((t) => t.id === tool)!.bin!)
    if (tool === 'agy') {
      const args = [...AGY_STREAM, ...(model ? ['--model', model] : [])]
      return agyReply(await run(program(w, bin, args), agyInput(prompt), name, timeoutMs, signal))
    }

    // Reading only: no tools, no saved session, no user hooks or project files, so it behaves as a plain text model.
    const replyFile = join(w.cwd, 'reply.txt')
    const args =
      tool === 'claude'
        ? ['-p', '--output-format', 'text', '--no-session-persistence', '--tools', '', '--disable-slash-commands', '--setting-sources', '']
        : ['exec', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'read-only', '--color', 'never', '-o', replyFile]
    if (model) args.push(tool === 'claude' ? '--model' : '-m', model)
    if (tool === 'codex') args.push('-')
    const stdout = await run(program(w, bin, args), prompt, name, timeoutMs, signal)
    if (tool !== 'codex') return stdout
    // Codex prints progress noise on stdout; its clean reply is in the file.
    try {
      return readFileSync(replyFile, 'utf8')
    } catch {
      return stdout
    }
  } finally {
    w.cleanup()
  }
}

/** Generates a JSON object that follows `schema` with the CLI the user picked in Settings. */
export async function generateJson(model: string, system: string, prompt: string, schema: object, signal?: AbortSignal): Promise<unknown> {
  const { cliTool, cliCommand } = getSettings()
  const base = `${system}\n\n---\n\n${prompt}\n\n---\nReply with ONE JSON object only (no markdown, no commentary, no tool use) that matches this JSON Schema:\n${JSON.stringify(schema)}\n`
  let input = base
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await ask(cliTool, cliCommand, model, input, RUN_TIMEOUT_MS, signal)
    try {
      return extractJson(text)
    } catch {
      input = `${base}\nYour previous reply was not valid JSON. Reply again with the JSON object only, starting with { and ending with }.\n`
    }
  }
  throw new Error(`${toolName(cliTool)} tidak menghasilkan JSON yang valid. Coba lagi, atau pilih CLI atau model lain di Pengaturan.`)
}

/** Runs a one-word prompt through the CLI, which proves the program exists, is logged in and answers. */
export async function testCli(tool: CliTool, command: string, model: string): Promise<KeyTestResult> {
  loginPath = null
  try {
    const text = await ask(tool, command, model, 'Reply with the single word OK.', TEST_TIMEOUT_MS)
    if (!text.trim()) return { ok: false, message: `${toolName(tool)} berjalan tapi tidak membalas apa pun.` }
    return { ok: true, message: `Terhubung · ${toolName(tool)} membalas` }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

// ---------- images ----------

/** The reply only counts when it is a real image, whatever the file is called. */
function readImage(file: string, name: string): { bytes: Buffer; contentType: string } {
  let size: number
  try {
    size = statSync(file).size
  } catch {
    throw new Error(`${name} tidak menghasilkan file gambar (${file} tidak ada).`)
  }
  if (size === 0 || size > MAX_IMAGE) throw new Error(`File gambar dari ${name} tidak wajar (${size} byte).`)
  const bytes = readFileSync(file)
  if (bytes[0] === 0x89 && bytes.toString('latin1', 1, 4) === 'PNG') return { bytes, contentType: 'image/png' }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { bytes, contentType: 'image/jpeg' }
  if (bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') return { bytes, contentType: 'image/webp' }
  throw new Error(`File dari ${name} bukan gambar PNG, JPEG, atau WebP.`)
}

/** Antigravity ends its reply with the path in <path> tags, after some progress lines. */
function agyImagePath(reply: string): string {
  const tagged = [...reply.matchAll(/<path>\s*([\s\S]*?)\s*<\/path>/gi)].at(-1)?.[1]
  const loose = [...reply.matchAll(/((?:[A-Za-z]:\\|\/)[^\s"'`<>|*?]+\.(?:png|jpe?g|webp))/gi)].at(-1)?.[1]
  const path = tagged || loose
  if (!path) throw new Error('Antigravity tidak menyebut lokasi gambar yang dibuatnya. Coba lagi.')
  return path
}

async function makeImage(tool: CliImageTool, command: string, prompt: string, aspect: AspectRatio, timeoutMs: number, signal?: AbortSignal): Promise<{ bytes: Buffer; contentType: string }> {
  const w = await workspace()
  const name = imageToolName(tool)
  try {
    if (tool === 'custom') {
      if (!command.trim()) throw new Error('Perintah gambar belum diisi. Buka Pengaturan untuk menambahkannya.')
      const out = join(w.cwd, 'image')
      // Quoted here, so a path with spaces (Windows user folders) works however the command writes {output}.
      const filled = command.replaceAll('{output}', `"${out}"`).replaceAll('{aspect}', aspect)
      await run({ command: filled, args: [], shell: true, cwd: w.cwd, env: w.env }, prompt, name, timeoutMs, signal)
      return readImage(out, name)
    }

    const bin = locate(w, name, CLI_IMAGE_TOOLS.find((t) => t.id === tool)!.bin!)
    const shape = aspect === '16:9' ? 'landscape 16:9' : 'vertical portrait 9:16'
    const instruction =
      `Use your generate_image tool (do not write code and do not run commands) to create ONE image, ${shape}, with no text or watermark in it. ` +
      `Image description:\n\n${prompt}\n\nWhen the image is ready, reply with its absolute file path inside <path></path> tags.`
    const reply = agyReply(await run(program(w, bin, AGY_STREAM), agyInput(instruction), name, timeoutMs, signal))
    return readImage(agyImagePath(reply), name)
  } finally {
    w.cleanup()
  }
}

/** Draws one image with the image CLI picked in Settings. */
export function generateImage(prompt: string, aspect: AspectRatio, signal?: AbortSignal): Promise<{ bytes: Buffer; contentType: string }> {
  const { cliImageTool, cliImageCommand } = getSettings()
  return makeImage(cliImageTool, cliImageCommand, prompt, aspect, RUN_TIMEOUT_MS, signal)
}

/**
 * Antigravity: listing its models proves it is installed and logged in, without spending an image on a test.
 * A custom command has no cheaper check, so it really draws a plain square.
 */
export async function testCliImage(tool: CliImageTool, command: string): Promise<KeyTestResult> {
  loginPath = null
  const name = imageToolName(tool)
  try {
    if (tool === 'agy') {
      const w = await workspace()
      try {
        await run(program(w, locate(w, name, 'agy'), ['models']), '', name, TEST_TIMEOUT_MS)
      } finally {
        w.cleanup()
      }
      return { ok: true, message: 'Terhubung · Antigravity siap membuat gambar (sekitar 1 menit per gambar)' }
    }
    const { bytes } = await makeImage(tool, command, 'A plain flat red square on a white background.', '16:9', TEST_TIMEOUT_MS * 3)
    return { ok: true, message: `Terhubung · perintah menulis gambar (${Math.max(1, Math.round(bytes.length / 1024))} KB)` }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}
