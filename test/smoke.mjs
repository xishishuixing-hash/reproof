/**
 * smoke.mjs — end-to-end check with no test framework.
 * Run: node test/smoke.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { record } from '../lib/record.mjs'
import { verifyAll } from '../lib/verify.mjs'
import { latest, storeFile } from '../lib/store.mjs'
import { normalize, sha } from '../lib/run.mjs'

const work = mkdtempSync(join(tmpdir(), 'reproof-'))
let passed = 0
const check = (name, fn) => {
  try {
    fn()
    passed += 1
    console.log(`  ok  ${name}`)
  } catch (error) {
    console.error(`  FAIL ${name}\n       ${error.message}`)
    process.exitCode = 1
  }
}

try {
  // 1. normalisation removes ANSI and trailing spaces, and honours strips
  check('normalize strips ANSI and trailing whitespace', () => {
    assert.equal(normalize('\u001b[31mred\u001b[0m  \nplain\t\n'), 'red\nplain\n')
  })
  check('normalize applies caller strips', () => {
    assert.equal(normalize('at 12:00:01 done', ['\\d{2}:\\d{2}:\\d{2}']), 'at  done')
  })
  check('sha is stable and prefixed', () => {
    assert.equal(sha('a'), sha('a'))
    assert.ok(sha('a').startsWith('sha256:'))
  })

  // 2. a record stores argv, exit code and hash
  const first = await record(['sh', '-c', 'echo hello'], { cwd: work, tag: 'demo', note: 'smoke' })
  check('record captures argv and exit code', () => {
    assert.deepEqual(first.argv, ['sh', '-c', 'echo hello'])
    assert.equal(first.exitCode, 0)
    assert.equal(first.tag, 'demo')
    assert.ok(first.stdoutHash.startsWith('sha256:'))
  })
  check('store file was created', () => {
    assert.ok(storeFile(work).endsWith('.reproof/records.jsonl'))
    assert.equal(latest(work).length, 1)
  })

  // 3. replaying an unchanged command MATCHes
  const same = await verifyAll({ cwd: work })
  check('unchanged command verifies as MATCH', () => {
    assert.equal(same.total, 1)
    assert.equal(same.counts.MATCH, 1)
    assert.equal(same.rows[0].status, 'MATCH')
  })

  // 4. a changed output DRIFTs
  const script = join(work, 'emit.sh')
  writeFileSync(script, 'echo one\n')
  const second = await record(['sh', script], { cwd: work, tag: 'demo' })
  writeFileSync(script, 'echo two\n')
  const drifted = await verifyAll({ cwd: work, only: second.id })
  check('changed output verifies as DRIFT', () => {
    assert.equal(drifted.total, 1)
    assert.equal(drifted.rows[0].status, 'DRIFT')
    assert.equal(drifted.rows[0].diff.before, 'one')
    assert.equal(drifted.rows[0].diff.after, 'two')
  })

  // 5. a missing binary verifies as ERROR
  const missing = await record(['definitely-not-a-real-binary-xyz'], { cwd: work })
  const errored = await verifyAll({ cwd: work, only: missing.id })
  check('missing binary verifies as ERROR', () => {
    assert.equal(errored.rows[0].status, 'ERROR')
  })

  // 6. strips make volatile output verifiable
  const volatile = await record(['sh', '-c', 'echo "run at 12:00:01 OK"'], { cwd: work, strips: ['\\d{2}:\\d{2}:\\d{2}'] })
  const cooled = await verifyAll({ cwd: work, only: volatile.id })
  check('strip patterns make timestamps verifiable', () => {
    assert.equal(cooled.rows[0].status, 'MATCH')
  })

  // 7. tag filter selects a subset
  const tagged = await verifyAll({ cwd: work, only: 'demo' })
  check('tag filter selects records', () => {
    assert.ok(tagged.total >= 2)
    assert.ok(tagged.rows.every((row) => row.tag === 'demo' || row.id === undefined))
  })

  console.log(`\n${passed} checks passed`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
