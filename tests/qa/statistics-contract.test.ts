import test from 'node:test';
import assert from 'node:assert/strict';
import { average, statistics, globalStatistics, chartData } from '../../src/domain/statistics';
import { effectiveMs, inspectionPenalty, parseManualTime } from '../../src/domain/timer';
import type { AverageSize, Metric, Penalty } from '../../src/domain/types';
import { qaData, qaSolve } from './contract-fixtures';
// @ts-ignore fixtures independentes em ESM
import { average5Fixtures, inspectionFixtures } from './fixtures.mjs';

function expectMetric(actual: Metric, expected: number | 'DNF' | null) {
  if (expected === null) assert.deepEqual(actual, { kind: 'insufficient' });
  else if (expected === 'DNF') assert.deepEqual(actual, { kind: 'dnf' });
  else { assert.equal(actual.kind, 'value'); if (actual.kind === 'value') assert.ok(Math.abs(actual.ms - expected) < 1e-7, `${actual.ms} != ${expected}`); }
}

test('A1: inspection uses exact 15/17 boundaries and preserves raw time', () => {
  for (const fixture of inspectionFixtures) assert.equal(inspectionPenalty(fixture.elapsedMs), fixture.expected);
  const solve = qaSolve(12345);
  for (const [penalty, expected] of [['none', 12345], ['+2', 14345], ['DNF', null], ['none', 12345]] as const) {
    solve.penalty = penalty;
    assert.equal(effectiveMs(solve), expected); assert.equal(solve.rawMs, 12345);
  }
  for (const bad of [-1, NaN, Infinity]) assert.throws(() => inspectionPenalty(bad));
});

test('A2: independent ao5 values, DNF cut and ties', () => {
  for (const fixture of average5Fixtures) {
    const solves = fixture.solves.map((s: {rawMs:number; penalty:Penalty}, i:number) => qaSolve(s.rawMs, s.penalty, i));
    const before = structuredClone(solves);
    expectMetric(average(solves, 5), fixture.expected);
    assert.deepEqual(solves, before, fixture.id + ': pure operation');
  }
});

test('A2: contract cuts ao12=1 ao50=3 ao100=5 and minimum samples', () => {
  for (const [size, trim] of [[12, 1], [50, 3], [100, 5]] as const) {
    const ordinary = Array.from({ length: size }, (_, i) => qaSolve((i + 1) * 1000, 'none', i));
    expectMetric(average(ordinary, size), (size + 1) * 500);
    expectMetric(average(ordinary.slice(1), size), null);
    for (const dnfCount of [trim, trim + 1]) {
      const values = Array.from({ length: size }, (_, i) => qaSolve(10000, i < dnfCount ? 'DNF' : 'none', i));
      expectMetric(average(values, size), dnfCount === trim ? 10000 : 'DNF');
    }
    // Assimetria distingue corte incorreto apesar da media da progressao ser igual.
    const values = Array.from({ length: size }, (_, i) => qaSolve(i < trim ? 1 : i >= size - trim ? 999999 : 10000, 'none', i));
    expectMetric(average(values, size), 10000);
  }
});

test('A2: global records never concatenate sessions to invent averages', () => {
  const data = qaData();
  data.solves = [qaSolve(1000, 'none', 0), qaSolve(2000, 'none', 1), qaSolve(3000, 'none', 2), qaSolve(4000, 'none', 3, 'qa-b'), qaSolve(5000, 'none', 4, 'qa-b')];
  expectMetric(globalStatistics(data, null).best, 1000);
  expectMetric(globalStatistics(data, null).bestAverages[5], null);
  data.solves = [1000, 2000, 3000, 100000, 100000].map((ms, i) => qaSolve(ms, 'none', i));
  data.solves.push(...[100000, 100000, 3000, 2000, 1000].map((ms, i) => qaSolve(ms, 'none', i + 5, 'qa-b')));
  const global = globalStatistics(data, null);
  expectMetric(global.bestAverages[5], 35000);
  for (const size of [5, 12, 50, 100] as AverageSize[]) expectMetric(global.averages[size], null);
});

test('A2: chronology, best window, session DNF policy, duration and chart', () => {
  const solves = [10000, 11000, 12000, 13000, 14000, 100000].map((ms, i) => qaSolve(ms, 'none', i));
  const reversed = [...solves].reverse();
  const stats = statistics(reversed);
  expectMetric(stats.last, 100000); expectMetric(stats.averages[5], 13000); expectMetric(stats.bestAverages[5], 12000);
  assert.deepEqual(chartData(reversed).map(p => p.ao5), [null, null, null, null, 12000, 13000]);
  const dnf = statistics([qaSolve(10000, '+2', 0), qaSolve(20000, 'DNF', 1)]);
  expectMetric(dnf.mean, 'DNF'); expectMetric(dnf.best, 12000); assert.equal(dnf.totalRawMs, 30000); assert.equal(dnf.dnfCount, 1);
  const empty = statistics([]); expectMetric(empty.best, null); expectMetric(empty.mean, null); assert.equal(empty.count, 0);
});

test('A1: manual decimal and minute input rejects invalid without coercion', () => {
  for (const [text, ms] of [['12,345',12345], ['1:02.34',62340], [' 9.1 ',9100]] as const) assert.equal(parseManualTime(text), ms);
  for (const text of ['', ' ', '-1', 'NaN', 'Infinity', '1:60', '1:2:3', '1,2,3', '12abc']) assert.throws(() => parseManualTime(text));
});
