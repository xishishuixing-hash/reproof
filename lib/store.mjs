/**
 * store.mjs — append-only JSONL evidence store.
 * Zero dependencies. One record per line, never rewritten, so a report always
 * matches the facts as they were when it was generated.
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

export const DIR = '.reproof'
export const FILE = 'records.jsonl'

export function storeDir(cwd = process.cwd()) {
  return path.join(cwd, DIR)
}

export function storeFile(cwd = process.cwd()) {
  return path.join(storeDir(cwd), FILE)
}

/** Append one record. Creates the directory on first use. */
export function append(record, cwd = process.cwd()) {
  fs.mkdirSync(storeDir(cwd), { recursive: true })
  fs.appendFileSync(storeFile(cwd), JSON.stringify(record) + '\n')
  return record
}

/** All records, oldest first. A torn last line is skipped, not fatal. */
export function read(cwd = process.cwd()) {
  const file = storeFile(cwd)
  if (!fs.existsSync(file)) return []
  const out = []
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.trim() === '') continue
    try {
      out.push(JSON.parse(line))
    } catch {
      // a half-written trailing line from a killed process is not a reason to lose the rest
    }
  }
  return out
}

/** Latest record per id. */
export function latest(cwd = process.cwd()) {
  const byId = new Map()
  for (const rec of read(cwd)) byId.set(rec.id, rec)
  return [...byId.values()]
}

export function makeId() {
  return `ev_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`
}
