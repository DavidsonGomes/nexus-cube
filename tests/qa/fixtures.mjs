// Dados artificiais de QA, independentes do schema de produto. Tempos em ms.
export const inspectionFixtures = [
  { elapsedMs: 0, expected: 'none' },
  { elapsedMs: 14999, expected: 'none' },
  { elapsedMs: 14999.9, expected: 'none' },
  { elapsedMs: 15000, expected: '+2' },
  { elapsedMs: 15000.1, expected: '+2' },
  { elapsedMs: 16999, expected: '+2' },
  { elapsedMs: 16999.9, expected: '+2' },
  { elapsedMs: 17000, expected: 'DNF' },
  { elapsedMs: 17000.1, expected: 'DNF' },
];

const solve = (rawMs, penalty = 'none') => ({ rawMs, penalty });
export const average5Fixtures = [
  { id: 'ordinary', solves: [10, 11, 12, 13, 14].map(s => solve(s * 1000)), expected: 12000 },
  { id: 'plus-two-reorders', solves: [solve(10000, '+2'), solve(11000), solve(12000), solve(13000), solve(14000)], expected: 37000 / 3 },
  { id: 'single-dnf', solves: [solve(10000), solve(11000), solve(12000), solve(13000), solve(1, 'DNF')], expected: 12000 },
  { id: 'two-dnf', solves: [solve(10000), solve(11000), solve(12000), solve(1, 'DNF'), solve(2, 'DNF')], expected: 'DNF' },
  { id: 'equal-extremes', solves: [10, 10, 10, 20, 20].map(s => solve(s * 1000)), expected: 40000 / 3 },
  { id: 'plus-two-becomes-worst', solves: [solve(10000), solve(11000), solve(12000), solve(13000), solve(13000, '+2')], expected: 12000 },
  { id: 'dnf-plus-two', solves: [solve(10000), solve(11000, '+2'), solve(12000), solve(14000), solve(10, 'DNF')], expected: 13000 },
  { id: 'insufficient', solves: [10, 11, 12, 13].map(s => solve(s * 1000)), expected: null },
  { id: 'empty', solves: [], expected: null },
];

// Media constante independe do corte. Casos DNF recebem corte do contrato publicado.
export function largeAverageFixture(size, trimCount, dnfCount = 0) {
  if (![12, 50, 100].includes(size) || !Number.isInteger(trimCount) || trimCount < 1 || trimCount * 2 >= size || !Number.isInteger(dnfCount) || dnfCount < 0 || dnfCount > size) throw new Error('Parametros QA invalidos');
  return {
    size, trimCount, dnfCount,
    solves: Array.from({ length: size }, (_, i) => solve(10000, i < dnfCount ? 'DNF' : 'none')),
    expected: dnfCount > trimCount ? 'DNF' : 10000,
  };
}

export const backupSemanticFixture = {
  label: 'QA ARTIFICIAL SONDA',
  sessions: [{ id: 'qa-a', name: 'QA Acentos: acao e cubo' }, { id: 'qa-b', name: 'QA B' }],
  solves: [
    { id: 'qa-1', sessionId: 'qa-a', rawMs: 10000, penalty: 'none', scramble: "R U R' U'", date: '2026-09-08T12:00:00.000Z', note: 'QA: "aspas", virgula;\nsegunda linha 🧊' },
    { id: 'qa-2', sessionId: 'qa-a', rawMs: 11000, penalty: '+2', scramble: 'F2 U2 R2', date: '2026-09-08T12:01:00.000Z', note: '' },
    { id: 'qa-3', sessionId: 'qa-b', rawMs: 12000, penalty: 'DNF', scramble: "L D' B2", date: '2026-09-08T12:02:00.000Z', note: 'QA DNF conserva bruto' },
  ],
  activeSessionId: 'qa-b',
  settings: { theme: 'dark', inspection: true },
  study: { selectedCaseIds: ['REPLACE_WITH_REAL_CASE_ID'], note: 'QA nota de estudo', favorite: true, status: 'learning', selfAssessment: 'recognized' },
};

export const invalidBackupCases = [
  'truncated-json', 'null-root', 'array-root', 'unknown-version', 'missing-required-field',
  'wrong-array-type', 'negative-time', 'nonfinite-time', 'unknown-penalty', 'unknown-study-status',
  'duplicate-session-id', 'duplicate-solve-id', 'orphan-session-reference', 'missing-active-session',
  'unknown-study-case', 'valid-first-invalid-last',
];
