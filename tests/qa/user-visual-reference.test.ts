import test from 'node:test';
import assert from 'node:assert/strict';
import { getCase } from '../../src/domain/catalog';
import { orientationCoordinates } from './sticker-oracle';
// @ts-ignore oraculo QA ESM
import { ollClass } from './cube-cases.mjs';

// Transcricao manual dos padroes nas imagens fornecidas pelo usuario.
// Ordem circular QA: UFR, URB, UBL, ULF; arestas UF,UR,UB,UL.
// Numeros extraidos de amarelo/topo/marcas laterais, sem usar algoritmos para esperado.
const referenceMasks = [
  { id: 'OLL-29', label: 'Awkward 1', top: '011110001', corners: [0,0,2,1], edges: [1,1,0,0] },
  { id: 'OLL-30', label: 'Awkward 2', top: '010110101', corners: [0,2,1,0], edges: [1,1,0,0] },
  { id: 'OLL-41', label: 'Awkward 3', top: '010110101', corners: [0,1,2,0], edges: [1,1,0,0] },
  { id: 'OLL-42', label: 'Awkward 4', top: '101110010', corners: [2,0,0,1], edges: [0,1,1,0] },
];

test('A5 visual reference: four user-provided Awkward masks map to conventional IDs', () => {
  for (const reference of referenceMasks) {
    const actual = orientationCoordinates(getCase(reference.id).initialState);
    assert.equal(ollClass(actual), ollClass(reference), `${reference.id} ${reference.label}`);
  }
  assert.equal(referenceMasks[1].top, referenceMasks[2].top);
  assert.notEqual(ollClass(referenceMasks[1]), ollClass(referenceMasks[2]), 'OLL30/41 need lateral marks to distinguish the same top mask');
});
