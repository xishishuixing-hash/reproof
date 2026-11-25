/**
 * run.mjs — execute one command and capture what a later replay needs:
 * argv, cwd, exit code, duration, stdout hash, and a head for human diffs.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g

/** sha256 of a UTF-8 string, prefixed for readability in logs. */
export function sha(text) {
  return 'sha256:' + createHash('sha256').update(String(text), 'utf8').digest('hex')
}

/**
 * Strip what changes between two runs of the *same* fact: ANSI colour, trailing
 * whitespace, and any caller-supplied patterns (timestamps, pids, ports).
 * Normalisation is what makes MATCH mean "same observation", not "same bytes".
 */
export function normalize(text, strips = []) {
  let out = String(text ?? '').replace(ANSI, '')
  for (const pattern of strips) {
    try {
      out = out.replace(new RegExp(pattern, 'g'), '')
    } catch {
      // an invalid user pattern is ignored rather than aborting the record
    }
  }
  return out
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '\n')
}

/**
 * Run argv without a shell. Resolves for every outcome, including spawn errors.
 * @param {string[]} argv
 * @param {{cwd?: string, timeoutMs?: number, env?: object}} [options]
 */
export function exec(argv, options = {}) {
  const { cwd = process.cwd(), timeoutMs = 30_000, env } = options
  return new Promise((resolve) => {
    const startedAt = Date.now()
    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false

    const finish = (payload) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ argv, cwd, timedOut, durationMs: Date.now() - startedAt, ...payload })
    }

    let child
    try {
      child = spawn(argv[0], argv.slice(1), { cwd, shell: false, env: env ?? process.env })
    } catch (error) {
      resolve({ argv, cwd, timedOut: false, durationMs: 0, spawnError: String(error?.message ?? error), exitCode: null, stdout: '', stderr: '' })
      return
    }

    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill('SIGKILL')
      } catch {
        // already gone
      }
    }, timeoutMs)

    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => finish({ spawnError: String(error?.message ?? error), exitCode: null, stdout, stderr }))
    child.on('close', (code) => finish({ exitCode: code, stdout, stderr }))
  })
}

export function head(text, lines = 20, chars = 4000) {
  return String(text ?? '')
    .split('\n')
    .slice(0, lines)
    .join('\n')
    .slice(0, chars)
}
