/**
 * verify.mjs — replay a record and classify the outcome.
 *
 *   MATCH  same exit code, same normalised output hash
 *   DRIFT  the command still runs, the output changed
 *   ERROR  the command no longer runs (missing tool, moved path, permission)
 *   SKIP   nothing to replay
 *
 * DRIFT is not a failure. It marks how fresh the claim is.
 */
import { exec, normalize, sha } from './run.mjs'
import { latest } from './store.mjs'

/** First differing line between two outputs, with one line of context. */
export function firstDiff(before, after) {
  const A = String(before ?? '').split('\n')
  const B = String(after ?? '').split('\n')
  for (let i = 0; i < Math.max(A.length, B.length); i += 1) {
    if ((A[i] ?? '') !== (B[i] ?? '')) {
      return { line: i + 1, before: (A[i] ?? '').slice(0, 200), after: (B[i] ?? '').slice(0, 200) }
    }
  }
  return null
}

export async function verifyOne(rec, options = {}) {
  const { timeoutMs = 30_000 } = options
  if (!rec || !Array.isArray(rec.argv) || rec.argv.length === 0) {
    return { id: rec?.id, status: 'SKIP', reason: 'no argv in record' }
  }
  const result = await exec(rec.argv, { cwd: rec.cwd ?? process.cwd(), timeoutMs })
  if (result.spawnError || result.exitCode === null || result.timedOut) {
    return {
      id: rec.id,
      status: 'ERROR',
      reason: result.spawnError ?? (result.timedOut ? 'timed out' : 'process did not exit'),
      argv: rec.argv,
    }
  }
  const nowHash = sha(normalize(result.stdout, rec.strips ?? []))
  const sameOutput = nowHash === rec.stdoutHash
  const sameExit = result.exitCode === rec.exitCode
  const status = sameOutput && sameExit ? 'MATCH' : 'DRIFT'
  return {
    id: rec.id,
    status,
    argv: rec.argv,
    tag: rec.tag ?? '',
    exitCode: result.exitCode,
    wasExitCode: rec.exitCode,
    durationMs: result.durationMs,
    oldHash: rec.stdoutHash,
    newHash: nowHash,
    diff: sameOutput ? null : firstDiff(rec.stdoutHead, normalize(result.stdout, rec.strips ?? [])),
  }
}

/** Verify every record, or the subset a filter selects. */
export async function verifyAll(options = {}) {
  const { cwd = process.cwd(), only = '', concurrency = 3, timeoutMs = 30_000, onEach } = options
  const records = latest(cwd).filter((r) => only === '' || r.tag === only || r.id === only)
  const rows = new Array(records.length)
  let cursor = 0

  const worker = async () => {
    while (true) {
      const index = cursor++
      if (index >= records.length) return
      try {
        rows[index] = await verifyOne(records[index], { timeoutMs })
      } catch (error) {
        rows[index] = { id: records[index].id, status: 'ERROR', reason: String(error?.message ?? error) }
      }
      if (typeof onEach === 'function') {
        try {
          onEach(rows[index], index)
        } catch {
          // a reporter throwing is not a verification failure
        }
      }
    }
  }

  const width = Math.max(1, Math.min(16, concurrency))
  await Promise.all(Array.from({ length: Math.min(width, records.length || 1) }, worker))

  const counts = { MATCH: 0, DRIFT: 0, ERROR: 0, SKIP: 0 }
  for (const row of rows) if (row && counts[row.status] !== undefined) counts[row.status] += 1
  for (let i = 0; i < rows.length; i += 1) if (!rows[i]) counts.SKIP += 1

  return { rows, counts, total: records.length }
}
