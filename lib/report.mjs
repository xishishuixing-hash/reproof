/**
 * report.mjs — render records and verification results as Markdown or JSON.
 */

const ICON = { MATCH: '✅', DRIFT: '⚠️', ERROR: '❌', SKIP: '⏭️' }

/** Quote only the argv words that need it, so a copied command runs as recorded. */
export function shellish(argv, max = 70) {
  const text = (Array.isArray(argv) ? argv : [])
    .map((word) => (/^[\w@%+=:,./-]+$/.test(word) ? word : JSON.stringify(word)))
    .join(" ")
  return text.length > max ? text.slice(0, max - 1) + "…" : text
}

function cell(text, max = 60) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim()
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat
}

/** `reproof list` output. */
export function renderList(records) {
  if (records.length === 0) return '_no records yet — run `reproof run -- <command>`_'
  const lines = ['| id | at | exit | ms | tag | command |', '| --- | --- | --- | --- | --- | --- |']
  for (const rec of records) {
    lines.push(`| \`${rec.id}\` | ${rec.at} | ${rec.exitCode ?? '—'} | ${rec.durationMs ?? '—'} | ${cell(rec.tag, 16)} | \`${cell(shellish(rec.argv), 70)}\` |`)
  }
  return lines.join('\n')
}

/** `reproof verify` output. */
export function renderVerify(result) {
  const { rows, counts, total } = result
  const lines = [
    `**${total}** records — ${counts.MATCH} MATCH · ${counts.DRIFT} DRIFT · ${counts.ERROR} ERROR · ${counts.SKIP} SKIP`,
    '',
    '| | status | command | detail |',
    '| --- | --- | --- | --- |',
  ]
  for (const row of rows) {
    const cmd = shellish(row.argv, 60)
    const detail =
      row.status === 'MATCH'
        ? `${row.durationMs}ms`
        : row.status === 'DRIFT'
          ? row.diff
            ? `line ${row.diff.line}: \`${cell(row.diff.before, 40)}\` → \`${cell(row.diff.after, 40)}\``
            : `exit ${row.wasExitCode} → ${row.exitCode}`
          : cell(row.reason ?? '', 80)
    lines.push(`| ${ICON[row.status] ?? '·'} | ${row.status} | \`${cmd}\` | ${detail} |`)
  }
  return lines.join('\n')
}

/** Machine-readable summary. */
export function summarize(result) {
  return {
    total: result.total,
    counts: result.counts,
    ok: result.counts.MATCH === result.total,
    rows: result.rows.map((row) => ({
      id: row.id,
      status: row.status,
      argv: row.argv,
      tag: row.tag ?? '',
      exitCode: row.exitCode ?? null,
      diff: row.diff ?? null,
      reason: row.reason ?? null,
    })),
  }
}
