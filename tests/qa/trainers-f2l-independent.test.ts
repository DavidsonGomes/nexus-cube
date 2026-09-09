import test from 'node:test';
import assert from 'node:assert/strict';
import { puzzles } from 'cubing/puzzles';
import { createF2LSetupGenerator } from '../../src/data/trainers/f2l-generator';
import { createTrainerRandom } from '../../src/data/trainers/cross-generator';
import type { TargetSlot } from '../../src/data/trainers/types';

const kpuzzle = await puzzles['3x3x3'].kpuzzle();
const SLOTS: readonly TargetSlot[] = ['FR', 'FL', 'BR', 'BL'];
const SLOT_PIECES: Record<TargetSlot, { edge: number; corner: number }> = {
  FR: { edge: 8, corner: 4 }, FL: { edge: 9, corner: 5 }, BR: { edge: 10, corner: 7 }, BL: { edge: 11, corner: 6 },
};
const CROSS_EDGES = [4, 5, 6, 7];
const INVERT_ROTATION: Record<string, string> = { '': '', y: "y'", y2: 'y2', "y'": 'y' };

type Pattern = ReturnType<ReturnType<typeof kpuzzle.defaultPattern>['applyAlg']>;
const patternOf = (alg: string): Pattern => kpuzzle.defaultPattern().applyAlg(alg.trim() || 'U U\'');

function edgeSolved(pattern: Pattern, index: number): boolean {
  const edges = pattern.patternData.EDGES;
  return edges.pieces[index] === index && edges.orientation[index] === 0;
}
function cornerSolved(pattern: Pattern, index: number): boolean {
  const corners = pattern.patternData.CORNERS;
  return corners.pieces[index] === index && corners.orientation[index] === 0;
}
function centersHome(pattern: Pattern): boolean {
  return pattern.patternData.CENTERS.pieces.slice(0, 6).every((piece, index) => piece === index);
}
function slotSolved(pattern: Pattern, slot: TargetSlot): boolean {
  return edgeSolved(pattern, SLOT_PIECES[slot].edge) && cornerSolved(pattern, SLOT_PIECES[slot].corner);
}
function crossAndOthersSolved(pattern: Pattern, target: TargetSlot): boolean {
  return CROSS_EDGES.every(index => edgeSolved(pattern, index))
    && SLOTS.filter(slot => slot !== target).every(slot => slotSolved(pattern, slot));
}
function pairSignature(pattern: Pattern, slot: TargetSlot): string {
  const { edge, corner } = SLOT_PIECES[slot];
  const edges = pattern.patternData.EDGES, corners = pattern.patternData.CORNERS;
  const edgeSlot = edges.pieces.indexOf(edge), cornerSlot = corners.pieces.indexOf(corner);
  return `${cornerSlot}.${corners.orientation[cornerSlot]}/${edgeSlot}.${edges.orientation[edgeSlot]}`;
}
function canonicalPairSignature(alg: string, slot: TargetSlot): string {
  return (['', 'U', 'U2', "U'"] as const)
    .map(auf => pairSignature(patternOf([alg, auf].filter(Boolean).join(' ')), slot))
    .sort()[0];
}

const generator = createF2LSetupGenerator();

test('all 41 cases exist with unique ids and all 164 slot presentations generate', () => {
  assert.equal(generator.caseIds.length, 41);
  assert.equal(new Set(generator.caseIds).size, 41);
  for (const caseId of generator.caseIds) {
    for (const slot of SLOTS) generator.generate(caseId, slot, createTrainerRandom(7));
  }
});

test('every combo holds precondition, goal and preservation under the QA kpuzzle oracle', () => {
  for (const caseId of generator.caseIds) {
    for (const slot of SLOTS) {
      for (const seed of [11, 23]) {
        const item = generator.generate(caseId, slot, createTrainerRandom(seed));
        const before = patternOf(item.setup);
        const after = patternOf(`${item.setup} ${item.solution}`);
        const label = `${caseId}/${slot}/${seed}`;
        assert.ok(crossAndOthersSolved(before, slot), `precondicao ${label}`);
        assert.ok(!slotSolved(before, slot), `par nao pode iniciar resolvido ${label}`);
        assert.ok(centersHome(before) && centersHome(after), `centros ${label}`);
        assert.ok(crossAndOthersSolved(after, slot), `preservacao ${label}`);
        assert.ok(slotSolved(after, slot), `objetivo ${label}`);
      }
    }
  }
});

test('case identity is AUF invariant, equal across the four slots and unique across the 41', () => {
  const caseSignatures: string[] = [];
  for (const caseId of generator.caseIds) {
    const outputs = SLOTS.map(slot => generator.generate(caseId, slot, createTrainerRandom(31)));
    const base = outputs.find(output => output.rotation === '');
    assert.ok(base, `caso sem apresentacao base: ${caseId}`);
    const signatures = outputs.map(output => {
      const unconjugated = [INVERT_ROTATION[output.rotation], output.setup, output.rotation].filter(Boolean).join(' ');
      return canonicalPairSignature(unconjugated, base!.slot);
    });
    assert.equal(new Set(signatures).size, 1, `assinaturas divergentes entre slots: ${caseId}`);
    const varied = canonicalPairSignature(
      [INVERT_ROTATION[base!.rotation], generator.generate(caseId, base!.slot, createTrainerRandom(97)).setup, base!.rotation].filter(Boolean).join(' '),
      base!.slot);
    assert.equal(varied, signatures[0], `AUF mudou a identidade: ${caseId}`);
    caseSignatures.push(signatures[0]);
  }
  assert.equal(new Set(caseSignatures).size, 41, 'casos F2L com identidade repetida');
});

test('unknown case or unmapped slot fails controlled', () => {
  assert.throws(() => generator.generate('cfop/f2l/case-99', 'FR', createTrainerRandom(1)), /sem apresentação|sem apresentacao/);
});
