import { createTrainerRandom } from '../../data/trainers';
import type { CubeState } from '../../domain/types';
import type { TrainerNodeKey } from './catalog';

/** Normalized session binding over the published Prisma generators. Each
 * program exposes selectable items and an async generate; nothing here invents
 * setups or solutions: everything comes from the generator, including the
 * proven minimum for the cross and the absence of a reference solution where
 * the domain does not provide one yet. */
export interface PreparedSetup {
  readonly itemId: string;
  readonly setup: string;
  readonly state: CubeState;
  readonly solution: string | null;
  readonly provenMinimumMoves?: number;
}
export interface TrainerProgram {
  readonly trainerId: string;
  readonly items: readonly { id: string; label: string }[];
  readonly slots?: readonly string[];
  readonly levels?: readonly { id: string; label: string }[];
  generate(itemId: string, options: { slot?: string; levelId?: string; seed: number }): Promise<PreparedSetup>;
}

const cache = new Map<string, Promise<TrainerProgram>>();

export function programFor(key: TrainerNodeKey): (() => Promise<TrainerProgram>) | null {
  switch (key) {
    case 'cross': return () => cached('cross', loadCross);
    case 'f2l': return () => cached('f2l', loadF2L);
    case 'oll': return () => cached('oll', () => loadLastLayer('OLL'));
    case 'pll': return () => cached('pll', () => loadLastLayer('PLL'));
    case 'roux-fb': case 'roux-sb': case 'roux-cmll': case 'roux-lse':
      return () => cached(key, () => loadRoux(key));
    case 'lbl-cross': case 'lbl-corners': case 'lbl-middle': case 'lbl-top-cross':
    case 'lbl-top-edges': case 'lbl-top-corners-position': case 'lbl-top-corners-orient':
      return () => cached(key, () => loadLBL(key));
    default: return null;
  }
}

function cached(key: string, load: () => Promise<TrainerProgram>): Promise<TrainerProgram> {
  let entry = cache.get(key);
  if (!entry) { entry = load(); cache.set(key, entry); }
  return entry;
}

async function loadCross(): Promise<TrainerProgram> {
  const { createCrossSetupGenerator } = await import('../../data/trainers/cross-generator');
  const generator = await createCrossSetupGenerator();
  const levels = Array.from({ length: generator.ceiling }, (_, index) => ({ id: String(index + 1), label: `${index + 1}` }));
  return {
    trainerId: 'cross',
    items: [{ id: 'cross/full', label: 'Cruz completa' }],
    levels,
    async generate(_itemId, { levelId, seed }) {
      const target = Number(levelId ?? 1);
      const result = generator.generate(target, createTrainerRandom(seed));
      return { itemId: 'cross/full', setup: result.setup, state: result.state, solution: null, provenMinimumMoves: result.provenMinimumMoves };
    },
  };
}

async function loadF2L(): Promise<TrainerProgram> {
  const { createF2LSetupGenerator } = await import('../../data/trainers/f2l-generator');
  const generator = createF2LSetupGenerator();
  return {
    trainerId: 'f2l',
    items: generator.caseIds.map(id => ({ id, label: id.replace('F2L-', 'Caso ') })),
    slots: ['FR', 'FL', 'BR', 'BL'],
    async generate(itemId, { slot, seed }) {
      const result = generator.generate(itemId, (slot ?? 'FR') as 'FR' | 'FL' | 'BR' | 'BL', createTrainerRandom(seed));
      return { itemId, setup: result.setup, state: result.state, solution: result.solution };
    },
  };
}

async function loadLastLayer(family: 'OLL' | 'PLL'): Promise<TrainerProgram> {
  const { createLastLayerSetupGenerator } = await import('../../data/trainers/last-layer-generator');
  const { COMPILED_CASES } = await import('../../data/catalog-compiled');
  const generator = createLastLayerSetupGenerator(family);
  const names = new Map<string, string>(COMPILED_CASES.map(item => [item.id, item.name]));
  return {
    trainerId: family.toLowerCase(),
    items: generator.caseIds.map(id => ({ id, label: names.get(id) ?? id })),
    async generate(itemId, { seed }) {
      const result = generator.generate(itemId as Parameters<typeof generator.generate>[0], createTrainerRandom(seed));
      return { itemId, setup: result.setup, state: result.state, solution: result.solution };
    },
  };
}

async function loadRoux(key: TrainerNodeKey): Promise<TrainerProgram> {
  const { createRouxSetupGenerator } = await import('../../data/trainers/roux-generator');
  const { ROUX_TRAINER_FIXTURES } = await import('../../solver/methods/roux/trainer-fixtures');
  const prefix = { 'roux-fb': 'roux/fb', 'roux-sb': 'roux/sb', 'roux-cmll': 'roux/cmll', 'roux-lse': 'roux/lse' }[key as 'roux-fb' | 'roux-sb' | 'roux-cmll' | 'roux-lse'];
  const generator = createRouxSetupGenerator();
  const own = ROUX_TRAINER_FIXTURES.filter(fixture => fixture.id === prefix || fixture.id.startsWith(prefix + '/'));
  return {
    trainerId: 'roux',
    items: own.map(fixture => ({ id: fixture.id, label: fixture.name })),
    async generate(itemId, { levelId, seed }) {
      const result = await generator.generate(itemId, createTrainerRandom(seed), levelId ? { levelId } : {});
      return { itemId, setup: result.setup, state: result.state, solution: null };
    },
  };
}

async function loadLBL(key: TrainerNodeKey): Promise<TrainerProgram> {
  const { createLBLSetupGenerator } = await import('../../data/trainers/lbl-generator');
  const { LBL_TRAINER_FIXTURES } = await import('../../solver/methods/lbl/trainer-fixtures');
  const prefix = key.replace('lbl-', 'lbl/');
  const generator = await createLBLSetupGenerator();
  const own = LBL_TRAINER_FIXTURES.filter(fixture => fixture.id === prefix || fixture.id.startsWith(prefix + '/'));
  return {
    trainerId: 'lbl',
    items: own.map(fixture => ({ id: fixture.id, label: fixture.name })),
    async generate(itemId, { seed }) {
      const result = generator.generate(itemId, createTrainerRandom(seed));
      return { itemId, setup: result.setup, state: result.state, solution: null, ...(result.provenMinimumMoves !== undefined ? { provenMinimumMoves: result.provenMinimumMoves } : {}) };
    },
  };
}
