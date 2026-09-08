import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createSolverClient, type SolverWorkerPort } from '../../src/solver/client';
import { validateDraft } from '../../src/solver/validation';
import type { SolverWorkerResponse } from '../../src/solver/types';

const FIXED_FACELETS = {
  U: ['U','U','U','U','U','U','U','U','U'], R: ['R','R','R','R','R','R','R','R','R'],
  F: ['F','F','F','F','F','F','F','F','F'], D: ['D','D','D','D','D','D','D','D','D'],
  L: ['L','L','L','L','L','L','L','L','L'], B: ['B','B','B','B','B','B','B','B','B'],
};
const LETTERS = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
const V1_KEY = 'URFDLB-fixed-v1:' + LETTERS, V2_KEY = 'URFDLB-fixed-v2:' + LETTERS;
const ID = 'same-public-request-id';
const hashes = {
  'src/domain/cube.ts': '3a903423689b7ef2fa80d591eed773eeae59e419c503e2e94448e10810cab414',
  'src/solver/types.ts': '68843274438bee7309fbb66e4306b1021171892cdc4e947a013634054f9b7e4b',
  'src/solver/validation.ts': '37b6ee51f6a353b0d483882390d077205800fc339b6a3bf5e82da5b6d6fb95ef',
  'src/solver/methods/types.ts': '6c222aa697dad88612efb89b42055381fd399f5d702c89a3beed1c4c58362ac3',
  'src/solver/wizard.ts': '030f1c8b40a272add773013c431e0e73a8a6aa00f9b1ec709d447fc0ed4cc217',
  'src/solver/index.ts': '32288aeef2b744fed8089bca043818fd2bf70758b813c195e538d81f439ee067',
  'src/solver/client.ts': '6c8177c0b449427a05266cc7a31faa1baf7db333b49fda32f1916c6c52aa6719',
  'src/solver/solution.ts': '150d066838cff901de6facbda976815ef17e84d7ff41dfca6ef90e58bbc71996',
  'src/solver/solver.worker.ts': 'd1c436fa8b7b6206fe8ca1fe65344f936bc7f177c7504e9c6bf16d3acf0220b2',
};
function pin(t: TestContext) {
  const check = () => { for (const [path, expected] of Object.entries(hashes)) assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), expected, path); };
  check(); t.after(check);
}
function input() {
  // Product validation supplies the executable input; expected key/frame and dispatch
  // observations remain literal. No search or product validator used as an oracle.
  const validated = validateDraft(structuredClone(FIXED_FACELETS));
  assert.equal(validated.kind, 'valid'); if (validated.kind !== 'valid') assert.fail('Fixture must be accepted');
  assert.equal(validated.inputKey, V2_KEY); return validated;
}
class ControlledWorker implements SolverWorkerPort {
  onmessage: SolverWorkerPort['onmessage'] = null;
  onerror: SolverWorkerPort['onerror'] = null;
  onmessageerror: SolverWorkerPort['onmessageerror'] = null;
  sent: unknown[] = [];
  terminated = 0;
  postMessage(message: unknown) {
    this.sent.push(structuredClone(message));
    const value = message as { kind: string; requestId: string; inputKey: string };
    if (value.kind === 'cancel') this.emit({ protocol: 1, kind: 'cancelled', requestId: value.requestId, inputKey: value.inputKey });
  }
  terminate() { this.terminated++; }
  emit(value: unknown) { this.onmessage?.({ data: value } as MessageEvent<SolverWorkerResponse>); }
}
const progress = (key = V2_KEY) => ({ protocol: 1, kind: 'progress', method: 'direct', phase: 'solving', requestId: ID, inputKey: key });
const solution = (key = V2_KEY) => ({ protocol: 1, kind: 'solution', method: 'direct', requestId: ID, inputKey: key, algorithm: '', tokens: ['ignored-worker-token'], initialState: [] });

test('solver frame security: old frame key is rejected before creating or posting to a worker', async t => {
  pin(t); let factories = 0;
  const client = createSolverClient({ workerFactory: () => { factories++; return new ControlledWorker(); } });
  t.after(() => client.dispose());
  const current = input(), old = { ...current, inputKey: V1_KEY };
  const before = structuredClone(old);
  const result = await client.solve({ requestId: ID, validated: old, method: 'direct' });
  assert.equal(result.kind, 'error'); if (result.kind !== 'error') assert.fail('Old frame accepted');
  assert.equal(result.code, 'input-key-mismatch'); assert.equal(result.inputKey, V1_KEY);
  assert.equal(factories, 0); assert.deepEqual(old, before);
});

test('solver frame security: old-key reply with matching requestId cannot publish progress or finish the current task', { timeout: 3000 }, async t => {
  pin(t); const worker = new ControlledWorker(), events: unknown[] = [];
  const client = createSolverClient({ workerFactory: () => worker, timeoutMs: 2000 }); t.after(() => client.dispose());
  const pending = client.solve({ requestId: ID, validated: input(), method: 'direct' }, { onProgress: event => events.push(event) });
  let finished = false; void pending.then(() => { finished = true; });
  assert.deepEqual(worker.sent, [{ protocol: 1, kind: 'solve', frame: 'URFDLB-fixed-v2', requestId: ID, inputKey: V2_KEY, method: 'direct', facelets: FIXED_FACELETS }]);
  worker.emit(progress(V1_KEY)); worker.emit(solution(V1_KEY)); await Promise.resolve();
  assert.deepEqual(events, []); assert.equal(finished, false); assert.equal(worker.terminated, 0);
  worker.emit(progress()); assert.deepEqual(events, [progress()]);
  worker.emit(solution()); const result = await pending;
  assert.equal(result.kind, 'solution'); if (result.kind !== 'solution') assert.fail('Positive current result failed');
  assert.equal(result.inputKey, V2_KEY); assert.equal(result.algorithm, ''); assert.deepEqual(result.tokens, []);
  assert.equal(result.initialState.length, 54); assert.equal(worker.terminated, 1);
});

test('solver frame security: cancelled callback cannot affect replacement even with identical requestId and frame key', { timeout: 3000 }, async t => {
  pin(t); const workers: ControlledWorker[] = [], oldEvents: unknown[] = [], newEvents: unknown[] = [];
  const client = createSolverClient({ workerFactory: () => { const worker = new ControlledWorker(); workers.push(worker); return worker; }, timeoutMs: 2000 });
  t.after(() => client.dispose()); const validated = input();
  const first = client.solve({ requestId: ID, validated }, { onProgress: event => oldEvents.push(event) });
  const late = workers[0].onmessage!;
  const second = client.solve({ requestId: ID, validated }, { onProgress: event => newEvents.push(event) });
  assert.deepEqual(await first, { kind: 'cancelled', requestId: ID, inputKey: V2_KEY });
  assert.equal(workers[0].terminated, 1); assert.equal(workers.length, 2);
  let finished = false; void second.then(() => { finished = true; });
  late({ data: progress() } as MessageEvent<SolverWorkerResponse>);
  late({ data: solution() } as unknown as MessageEvent<SolverWorkerResponse>);
  await Promise.resolve(); assert.deepEqual(oldEvents, []); assert.deepEqual(newEvents, []);
  assert.equal(finished, false); assert.equal(workers[1].terminated, 0);
  workers[1].emit(progress()); workers[1].emit(solution());
  const result = await second; assert.equal(result.kind, 'solution'); assert.equal(result.inputKey, V2_KEY);
  assert.deepEqual(newEvents, [progress()]); assert.equal(workers[1].terminated, 1);
});
