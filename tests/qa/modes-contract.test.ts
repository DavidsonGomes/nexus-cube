import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addSolve, applySessionClassification, createSession, previewSessionClassification, updateSolve } from '../../src/data/mutations';
import { beginSolveCapture, selectSolves } from '../../src/domain/modes';
import { globalStatistics, scopedChartData, scopedStatistics } from '../../src/domain/statistics';
import { recordStudyAttempt, updateCaseProgress } from '../../src/domain/study';
import { createInitialData, exportBackup, exportCSV, importBackup, parseBackup, saveData } from '../../src/data/store';
import type { AppData, Solve, SolveMode } from '../../src/domain/types';
import { MemoryStorage } from './contract-fixtures';

const session = (id: string, mode: AppData['sessions'][number]['mode'], minute = '00') => ({ id, name: id, createdAt: `2026-09-08T12:${minute}:00.000Z`, mode });
const solve = (id: string, sessionId: string, mode: AppData['solves'][number]['mode'], rawMs: number, penalty: Solve['penalty'] = 'none', minute = '10'): Solve => ({ id, sessionId, mode, rawMs, penalty, scramble: "R U R' U'", createdAt: `2026-09-08T12:${minute}:00.000Z`, note: id, source: 'manual' });
function fixture(): AppData {
  return { ...createInitialData(), sessions: [session('s2h', 'two-handed'), session('soh', 'one-handed'), session('snull', null)], activeSessionId: 's2h', solves: [solve('a', 's2h', 'two-handed', 1000), solve('b', 's2h', 'two-handed', 3000), solve('c', 'soh', 'one-handed', 2000), solve('d', 'snull', null, 9000, '+2')] };
}

test('M1: v1/v2 raw payloads migrate to v3 with only null modes added', () => {
  for (const file of ['backup-v1.json', 'backup-v2.json']) {
    const raw = JSON.parse(readFileSync(new URL(`../../tests/domain/fixtures/${file}`, import.meta.url), 'utf8'));
    const expected = { ...raw.data, version: 3, sessions: raw.data.sessions.map((s: object) => ({ ...s, mode: null })), solves: raw.data.solves.map((s: object) => ({ ...s, mode: null })) };
    assert.deepEqual(parseBackup(JSON.stringify({ ...raw, version: raw.version, data: raw.data })), expected, `${file} raw migration`);
  }
});

test('M2: scopes require matching session mode and never hide incompatible records', () => {
  const data = fixture();
  assert.equal(selectSolves(data, { kind: 'mode', mode: 'two-handed' }).length, 2);
  assert.equal(selectSolves(data, { kind: 'session', sessionId: 'snull', mode: null }).length, 1);
  assert.throws(() => selectSolves(data, { kind: 'session', sessionId: 's2h', mode: 'one-handed' }));
  assert.throws(() => selectSolves(data, { kind: 'session', sessionId: 'missing', mode: null }));
  const incoherent = structuredClone(data); incoherent.solves[0].mode = null;
  assert.throws(() => selectSolves(incoherent, { kind: 'mode', mode: 'two-handed' }));
  assert.throws(() => selectSolves(data, { kind: 'mode', mode: undefined as never }));
  assert.throws(() => selectSolves(data, { kind: 'mode', mode: 'unknown' as never }));
});

test('M3: stats and chart remain separated by mode and session windows', () => {
  const data = fixture();
  data.sessions.push(session('s2h-b', 'two-handed', '20'));
  data.solves.push(...[10000,11000,12000,13000,14000].map((ms,i)=>solve(`e${i}`, 's2h-b', 'two-handed', ms, i===4?'+2':'none', String(20+i))));
  assert.equal(globalStatistics(data, 'two-handed').count, 7);
  assert.equal(globalStatistics(data, 'one-handed').count, 1);
  assert.equal(globalStatistics(data, null).count, 1);
  assert.equal(scopedStatistics(data, { kind: 'session', sessionId: 's2h', mode: 'two-handed' }).best.kind, 'value');
  const chart = scopedChartData(data, { kind: 'mode', mode: 'two-handed' });
  assert.equal(chart.series.length, 2);
  assert.deepEqual(chart.series[0].points.map(p=>p.single), [1000,3000]);
  assert.equal(chart.series[1].points.at(-1)?.single, 16000);
  assert.deepEqual(chart.series[1].points.at(-1)?.ao5, 12000);
  assert.deepEqual(globalStatistics(data, 'two-handed').bestAverages[5], { kind:'value', ms:12000 });
  const ao12 = structuredClone(data); ao12.sessions.push(session('s2h-c', 'two-handed', '40'));
  ao12.solves.push(...Array.from({length:12}, (_,i)=>solve(`z${i}`, 's2h-c', 'two-handed', 1000, i===11?'DNF':'none', String(40+i))));
  const session12 = scopedStatistics(ao12, {kind:'session', sessionId:'s2h-c', mode:'two-handed'});
  assert.equal(session12.dnfCount, 1); assert.deepEqual(session12.averages[12], {kind:'value', ms:1000});
  assert.throws(() => globalStatistics(data, undefined as never));
});

test('M4: capture freezes session, mode and scramble against later selection', () => {
  const data = fixture();
  const captured = beginSolveCapture(data, { sessionId: 's2h', mode: 'two-handed', scramble: "R U R' U'" });
  data.activeSessionId = 'soh';
  assert.deepEqual(captured, { sessionId: 's2h', mode: 'two-handed', scramble: "R U R' U'" });
  assert.throws(() => { (captured as {scramble:string}).scramble = 'R'; });
  const saved = addSolve(data, { sessionId: captured.sessionId, mode: captured.mode, rawMs: 1500, penalty: 'none', scramble: captured.scramble, source: 'manual' });
  const savedSolve = saved.solves.at(-1)!;
  assert.equal(savedSolve.sessionId, captured.sessionId); assert.equal(savedSolve.mode, captured.mode); assert.equal(savedSolve.scramble, captured.scramble); assert.equal(savedSolve.rawMs, 1500);
  assert.throws(() => beginSolveCapture(data, { sessionId: 'soh', mode: 'two-handed', scramble: 'R' }));
});

test('M5: whole-session classification changes every null solve atomically', () => {
  const data = fixture();
  data.solves.push(solve('e', 'snull', null, 8000, 'DNF', '11'));
  const original = structuredClone(data);
  const preview = previewSessionClassification(data, 'snull', 'one-handed');
  assert.equal(preview.solveCount, 2);
  const classified = applySessionClassification(data, preview);
  const expected = structuredClone(data); expected.sessions[2].mode = 'one-handed'; expected.solves.filter(s=>s.sessionId==='snull').forEach(s=>{s.mode='one-handed';});
  assert.deepEqual(classified, expected);
  assert.equal(classified.sessions.find(s => s.id === 'snull')?.mode, 'one-handed');
  assert.equal(classified.solves.filter(s => s.sessionId === 'snull').every(s => s.mode === 'one-handed'), true);
  assert.equal(classified.solves.find(s => s.id === 'd')?.sessionId, 'snull');
  assert.deepEqual(data, original);
  assert.equal(data.sessions.find(s => s.id === 'snull')?.mode, null);
  for (const mutate of [
    (d: AppData) => { d.solves[3].rawMs++; },
    (d: AppData) => { d.solves[3].note = 'changed'; },
    (d: AppData) => { d.solves[3].penalty = 'none'; },
    (d: AppData) => { d.sessions[2].name = 'changed'; },
    (d: AppData) => { d.solves.pop(); },
    (d: AppData) => { d.solves.push(solve('new', 'snull', null, 7000)); },
  ]) { const stale = structuredClone(data); mutate(stale); assert.throws(() => applySessionClassification(stale, preview)); }
  assert.throws(() => applySessionClassification(classified, preview));
  const quota = new MemoryStorage('classification-sentinel'); quota.failWrites = true;
  assert.throws(() => saveData(classified, quota)); assert.equal(quota.getItem('nexus-cube:v1'), 'classification-sentinel');
});

test('M6: backup, CSV and quota rollback preserve modes and original bytes', () => {
  const data = fixture();
  const original = structuredClone(data);
  const backup = exportBackup(data);
  assert.deepEqual(parseBackup(backup), original);
  const csv = exportCSV(data, { kind: 'mode', mode: 'two-handed' });
  assert.match(csv, /two-handed/); assert.doesNotMatch(csv, /one-handed/);
  const storage = new MemoryStorage('sentinel'); storage.failWrites = true;
  assert.throws(() => importBackup(backup, storage));
  assert.equal(storage.getItem('nexus-cube:v1'), 'sentinel');
  assert.deepEqual(data, original);
});

test('M7: addSolve/createSession require known parent mode and update cannot move scope', () => {
  const data = fixture();
  const next = addSolve(data, { sessionId: 's2h', mode: 'two-handed', rawMs: 1500, penalty: 'none', scramble: 'R', source: 'manual' });
  assert.equal(next.solves.at(-1)?.mode, 'two-handed');
  assert.throws(() => addSolve(data, { sessionId: 's2h', mode: null as never, rawMs: 1500, penalty: 'none', scramble: 'R', source: 'manual' }));
  assert.throws(() => createSession(data, 'invalid', null as never));
  assert.throws(() => addSolve(data, { sessionId: 's2h', mode: 'one-handed', rawMs: 1500, penalty: 'none', scramble: 'R', source: 'manual' }));
  assert.throws(() => updateSolve(data, 'a', { mode: 'one-handed' } as never));
  assert.throws(() => updateSolve(data, 'a', { sessionId: 'soh' } as never));
});

test('M8: study or classification data does not merge null records into modal stats', () => {
  const data = fixture();
  const beforeSolves = structuredClone(data.solves), beforeSessions = structuredClone(data.sessions);
  const before = globalStatistics(data, 'two-handed');
  const studied = recordStudyAttempt(updateCaseProgress(data, 'OLL-01', { favorite:true, status:'learning', note:'mode QA' }), { caseId:'OLL-01', recognition:'good', execution:'good', durationMs:1000 });
  assert.deepEqual(globalStatistics(studied, 'two-handed'), before);
  assert.deepEqual(studied.solves, beforeSolves); assert.deepEqual(studied.sessions, beforeSessions);
  const preview = previewSessionClassification(studied, 'snull', 'one-handed');
  const after = applySessionClassification(studied, preview);
  assert.deepEqual(globalStatistics(after, 'two-handed'), before);
  assert.equal(globalStatistics(after, 'one-handed').count, 2);
  assert.equal(globalStatistics(after, null).count, 0);
  assert.deepEqual(studied.solves, beforeSolves); assert.deepEqual(studied.sessions, beforeSessions);
});
