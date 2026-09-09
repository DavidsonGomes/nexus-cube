import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAlgorithm, invertAlgorithm, solvedCube } from '../../../src/domain/cube';
import { COMPILED_CASES } from '../../../src/data/catalog-compiled';
import { RECOGNITION_CLASSIFIERS, classifyRecognition, placedUpperCorners } from '../../../src/data/trainers/recognition';

const solved = solvedCube();
const caseState = (id: string) => {
  const item = COMPILED_CASES.find(entry => entry.id === id);
  assert.ok(item, id);
  return applyAlgorithm(solved, invertAlgorithm(item!.algorithm));
};

test('edge orientation pattern classifier separates dot, hook, line and cross deterministically', () => {
  assert.equal(classifyRecognition('ll-edge-orientation-pattern', solved), 'cross');
  assert.equal(classifyRecognition('ll-edge-orientation-pattern', caseState('OLL-01')), 'dot');
  const hookLine = [classifyRecognition('ll-edge-orientation-pattern', caseState('OLL-44')), classifyRecognition('ll-edge-orientation-pattern', caseState('OLL-45'))];
  assert.deepEqual([...hookLine].sort(), ['hook', 'line'], 'os dois casos de duas arestas caem em classes distintas');
  assert.equal(classifyRecognition('ll-edge-orientation-pattern', caseState('OLL-27')), 'cross', 'caso só de cantos mantém a cruz');
});

test('edge match shape classifier reads the best AUF alignment', () => {
  assert.equal(classifyRecognition('u-edge-match-shape', solved), 'solved');
  assert.equal(classifyRecognition('u-edge-match-shape', applyAlgorithm(solved, 'U')), 'solved', 'permutação por AUF puro resolve com um giro');
  assert.equal(classifyRecognition('u-edge-match-shape', caseState('PLL-Ua')), 'adjacent', 'ciclo de três alinha duas vizinhas no melhor AUF');
  assert.ok(['adjacent', 'opposite', 'solved'].includes(classifyRecognition('u-edge-match-shape', caseState('PLL-Z'))));
});

test('corner spot classifier answers a single placed corner, none or multiple', () => {
  assert.equal(classifyRecognition('u-corner-placed-spot', solved), 'multiple');
  assert.equal(classifyRecognition('u-corner-placed-spot', applyAlgorithm(solved, 'U')), 'none');
  const aa = caseState('PLL-Aa');
  const answer = classifyRecognition('u-corner-placed-spot', aa);
  assert.ok(['ufr', 'urb', 'ubl', 'ulf'].includes(answer), `ciclo de três deixa exatamente um no lugar: ${answer}`);
  assert.equal(placedUpperCorners(aa).length, 1);
});

test('classifier registry rejects unknown ids and options cover every computable answer', () => {
  assert.throws(() => classifyRecognition('nope', solved), /desconhecido/);
  for (const classifier of RECOGNITION_CLASSIFIERS) {
    assert.ok(classifier.optionIds.includes(classifier.classify(solved)), classifier.id);
  }
});
