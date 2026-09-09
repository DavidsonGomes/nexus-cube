import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Guard 2 (structural half): the Imports+Sync V4 seam must never couple into the
// published SyncV3 client path. import-commit-v4 may project to the private V4
// ledger, but it must not import or call fold/enqueueChange/resolveSyncConflict,
// and the sync path must not depend on import-commit. Any future seam that
// crosses this line fails here. The behavioural half (identical fold/adoption/
// conflict with the seam present) lands with the seam implementation.

const importCommit = readFileSync('src/cloud/import-commit-v4.ts', 'utf8');
const syncFiles = ['sync-state.ts', 'sync-engine.ts', 'sync-actions.ts']
  .map(name => readFileSync(`src/cloud/${name}`, 'utf8'));

test('import-commit-v4 does not import from or call into the SyncV3 client path', () => {
  assert.doesNotMatch(importCommit, /from '\.\/sync-(state|engine|actions)'/);
  assert.doesNotMatch(importCommit, /\bfold\s*\(/);
  assert.doesNotMatch(importCommit, /\benqueueChange\s*\(/);
  assert.doesNotMatch(importCommit, /\bresolveSyncConflict\s*\(/);
});

test('the SyncV3 client path does not depend on import-commit-v4', () => {
  for (const source of syncFiles) assert.doesNotMatch(source, /import-commit-v4/);
});

test('import-commit-v4 keeps sync observably unavailable (feature OFF)', () => {
  // Until the RLS-two-owner gate and remote window, every applied result reports
  // sync:'unavailable'; the seam must not flip this to a live dispatch state.
  assert.match(importCommit, /sync:\s*'unavailable'/);
  // No live dispatch: no transport push, no public V4 commit RPC, no writer RPC.
  // (Doc comments may mention "dispatch"; only real calls are forbidden.)
  const withoutComments = importCommit.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(withoutComments, /transport\.push|nexus_sync4_commit|nexus_sync4_private\.\w+\s*\(/);
});
