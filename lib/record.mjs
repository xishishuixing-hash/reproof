/**
 * record.mjs — turn one command execution into a stored, replayable record.
 */
import { append, makeId } from './store.mjs'
import { exec, head, normalize, sha } from './run.mjs'

/**
 * @param {string[]} argv - the command, without a shell.
 * @param {{cwd?: string, timeoutMs?: number, tag?: string, note?: string, strips?: string[]}} [options]
 */
export async function record(argv, options = {}) {
  const { cwd = process.cwd(), timeoutMs = 30_000, tag = '', note = '', strips = [] } = options
  const result = await exec(argv, { cwd, timeoutMs })
  const normal = normalize(result.stdout, strips)
  return append({
    id: makeId(),
    at: new Date().toISOString(),
    argv: result.argv,
    cwd: result.cwd,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    timedOut: result.timedOut,
    spawnError: result.spawnError ?? null,
    stdoutHash: sha(normal),
    stdoutBytes: Buffer.byteLength(result.stdout, 'utf8'),
    stdoutHead: head(result.stdout),
    stderrHead: head(result.stderr, 10, 2000),
    strips,
    tag,
    note,
  }, cwd)
}
