#!/usr/bin/env node
/**
 * reproof CLI.
 *
 *   reproof run [--tag t] [--note n] [--timeout ms] [--strip re]... -- <argv...>
 *   reproof run "<shell command>"        # no `--` means sh -c
 *   reproof verify [--only <id|tag>] [--timeout ms] [--json]
 *   reproof list [--tag t] [--json]
 *   reproof report [--json]
 */
import { record } from '../lib/record.mjs'
import { verifyAll } from '../lib/verify.mjs'
import { latest, read, storeFile } from '../lib/store.mjs'
import { renderList, renderVerify, summarize } from '../lib/report.mjs'

const USAGE = `reproof — record a command, prove it again later

  reproof run [options] -- <command...>     record an execution
  reproof run [options] "<shell command>"   same, through sh -c
  reproof verify [options]                  replay every record and compare
  reproof list [options]                    what is in the store
  reproof report [options]                  summary as JSON or Markdown

options
  --tag <name>       group records (e.g. http, dns, build)
  --note <text>      why this command was run
  --timeout <ms>     per-command timeout (default 30000)
  --strip <regex>    drop volatile text before hashing (repeatable)
  --only <id|tag>    verify a single record or tag
  --json             machine-readable output
  --cwd <dir>        run and store relative to this directory
  -h, --help         this text
  -v, --version      version

exit codes
  0  every record MATCHed
  1  at least one DRIFT or ERROR
  2  bad usage
`;

function parseArgs(argv) {
  const options = { kind: '', rest: [], args: [], tag: '', note: '', strips: [], json: false, only: '', timeoutMs: 30_000, cwd: process.cwd() }
  let index = 0
  options.kind = argv[index++] ?? ''
  while (index < argv.length) {
    const token = argv[index]
    if (token === '--') {
      options.args = argv.slice(index + 1)
      break
    }
    if (token === '--json') { options.json = true; index += 1; continue }
    if (token === '-h' || token === '--help') { options.kind = 'help'; return options }
    if (token === '-v' || token === '--version') { options.kind = 'version'; return options }
    const value = argv[index + 1]
    switch (token) {
      case '--tag': options.tag = value ?? ''; index += 2; continue
      case '--note': options.note = value ?? ''; index += 2; continue
      case '--only': options.only = value ?? ''; index += 2; continue
      case '--cwd': options.cwd = value ?? options.cwd; index += 2; continue
      case '--strip': options.strips.push(value ?? ''); index += 2; continue
      case '--timeout': options.timeoutMs = Math.max(1, Number(value) || 30_000); index += 2; continue
      default: options.rest.push(token); index += 1
    }
  }
  if (options.args.length === 0 && options.rest.length > 0) options.args = ['sh', '-c', options.rest.join(' ')]
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (options.kind === '' || options.kind === 'help') { process.stdout.write(USAGE); return 0 }
  if (options.kind === 'version') { process.stdout.write('reproof 0.1.0\n'); return 0 }

  if (options.kind === 'run') {
    if (options.args.length === 0) { process.stderr.write('reproof: run needs a command\n\n' + USAGE); return 2 }
    const rec = await record(options.args, {
      cwd: options.cwd, timeoutMs: options.timeoutMs, tag: options.tag, note: options.note, strips: options.strips,
    })
    if (options.json) {
      process.stdout.write(JSON.stringify(rec, null, 2) + '\n')
    } else {
      process.stdout.write(`recorded ${rec.id}  exit=${rec.exitCode}  ${rec.durationMs}ms  ${rec.stdoutHash.slice(0, 19)}…\n`)
      process.stdout.write(`store: ${storeFile(options.cwd)}\n`)
    }
    return rec.exitCode === 0 ? 0 : 1
  }

  if (options.kind === 'verify') {
    const result = await verifyAll({ cwd: options.cwd, only: options.only, timeoutMs: options.timeoutMs })
    process.stdout.write((options.json ? JSON.stringify(summarize(result), null, 2) : renderVerify(result)) + '\n')
    return result.total > 0 && result.counts.MATCH === result.total ? 0 : 1
  }

  if (options.kind === 'list') {
    const rows = latest(options.cwd).filter((r) => options.tag === '' || r.tag === options.tag)
    process.stdout.write((options.json ? JSON.stringify(rows, null, 2) : renderList(rows)) + '\n')
    return 0
  }

  if (options.kind === 'report') {
    const all = read(options.cwd)
    const result = await verifyAll({ cwd: options.cwd, timeoutMs: options.timeoutMs })
    const body = {
      store: storeFile(options.cwd),
      records: all.length,
      verification: summarize(result),
    }
    process.stdout.write(JSON.stringify(body, null, 2) + '\n')
    return 0
  }

  process.stderr.write(`reproof: unknown command "${options.kind}"\n\n` + USAGE)
  return 2
}

main().then((code) => { process.exitCode = code }).catch((error) => {
  process.stderr.write(`reproof: ${String(error?.stack ?? error)}\n`)
  process.exitCode = 2
})
