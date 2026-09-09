import type { Face } from '../../domain/types';
import { createCrossSetupGenerator } from './cross-generator';
import type { CrossSetup, CrossSetupGenerator, TrainerRandom } from './cross-generator';
import type { TrainerFixtureSpec } from './types';

/** Cross trainer fixture (spec item 3): every difficulty level announces a minimum that the
 * generator PROVES per setup (complete BFS distance), so minimumProven is honest by
 * construction. Color and inspection are runtime choices: the face goes to the generator,
 * inspection lives in the timing model.
 */
export const CROSS_TRAINER_FIXTURES: readonly TrainerFixtureSpec[] = [{
  id: 'cfop/cross/full',
  trainerId: 'cross',
  methodId: 'cfop',
  stageId: 'cross',
  groupId: 'cross',
  kind: 'execution',
  name: 'Cruz completa',
  objective: 'Monte a cruz da cor escolhida a partir de um preparo com mínimo de movimentos provado.',
  precondition: null,
  goal: { predicate: 'any-legal' },
  preserve: [],
  referenceFrame: 'fixed',
  setupSubgroup: ['U', 'R', 'F', 'D', 'L', 'B'],
  difficulty: [
    { id: 'easy', name: 'Fácil', setupMoves: 3, announcedMinimumMoves: 3, minimumProven: true },
    { id: 'medium', name: 'Médio', setupMoves: 5, announcedMinimumMoves: 5, minimumProven: true },
    { id: 'hard', name: 'Difícil', setupMoves: 7, announcedMinimumMoves: 7, minimumProven: true },
    { id: 'extreme', name: 'Extremo', setupMoves: 8, announcedMinimumMoves: 8, minimumProven: true },
  ],
  focus: { kind: 'pieces', pieces: ['DF', 'DR', 'DB', 'DL'], referencePieces: ['D'] },
  provenance: [{ title: 'Gerador de cruz Nexus Cube', url: 'src/data/trainers/cross-generator.ts', author: 'Nexus Cube', license: 'MIT (Nexus Cube)', notes: 'Mínimo por nível provado por BFS completo da abstração exata da cruz.' }],
}, {
  id: 'cfop/cross/inspection',
  trainerId: 'inspection',
  methodId: 'cfop',
  stageId: 'cross',
  groupId: 'inspection',
  kind: 'execution',
  name: 'Inspeção e cruz planejada',
  objective: 'Veja o estado pelo período configurado, oculte e execute a cruz que você planejou. Inspeção livre, desafio de memorização e simulação de competição são modos de medição.',
  precondition: null,
  goal: { predicate: 'cross' },
  preserve: [],
  referenceFrame: 'fixed',
  setupSubgroup: ['U', 'R', 'F', 'D', 'L', 'B'],
  difficulty: null,
  focus: { kind: 'pieces', pieces: ['DF', 'DR', 'DB', 'DL'], referencePieces: ['D'] },
  provenance: [{ title: 'Gerador de cruz Nexus Cube', url: 'src/data/trainers/cross-generator.ts', author: 'Nexus Cube', license: 'MIT (Nexus Cube)', notes: 'Estado e solução de conferência vêm do mesmo gerador provado; o período de exibição e o modo são opções de tela.' }],
}];

const generators = new Map<Face, Promise<CrossSetupGenerator>>();
function generatorFor(face: Face): Promise<CrossSetupGenerator> {
  let generator = generators.get(face);
  if (!generator) { generator = createCrossSetupGenerator(face); generators.set(face, generator); }
  return generator;
}

/** The fixture's focus pieces describe the classic D cross; the live exercise follows the
 * chosen face through the generator's own per-face proof.
 */
export async function generateCrossExercise(levelId: string, face: Face, random: TrainerRandom): Promise<CrossSetup> {
  const level = CROSS_TRAINER_FIXTURES[0].difficulty!.find(item => item.id === levelId);
  if (!level) throw new Error(`Nível de cruz desconhecido: ${levelId}`);
  return (await generatorFor(face)).generate(level.announcedMinimumMoves!, random);
}
