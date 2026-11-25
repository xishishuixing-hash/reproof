/**
 * reproof — record a command, prove it again later.
 * Library entry point. Every function is also reachable from the CLI.
 */
export { append, latest, makeId, read, storeDir, storeFile } from './store.mjs'
export { exec, head, normalize, sha } from './run.mjs'
export { record } from './record.mjs'
export { firstDiff, verifyAll, verifyOne } from './verify.mjs'
export { renderList, renderVerify, summarize } from './report.mjs'
