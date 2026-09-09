import comboSexyBilateral from '../expansion-sources/finger-tricks/combo-sexy-bilateral.json';
import comboU2D2 from '../expansion-sources/finger-tricks/combo-u2-d2.json';
import dPrime from '../expansion-sources/finger-tricks/d-prime.json';
import d from '../expansion-sources/finger-tricks/d.json';
import d2 from '../expansion-sources/finger-tricks/d2.json';
import mPrime from '../expansion-sources/finger-tricks/m-prime.json';
import m from '../expansion-sources/finger-tricks/m.json';
import m2 from '../expansion-sources/finger-tricks/m2.json';
import sexyLeft from '../expansion-sources/finger-tricks/sexy-left.json';
import sexyRight from '../expansion-sources/finger-tricks/sexy-right.json';
import sledgehammerRight from '../expansion-sources/finger-tricks/sledgehammer-right.json';
import uPrime from '../expansion-sources/finger-tricks/u-prime.json';
import u from '../expansion-sources/finger-tricks/u.json';
import u2 from '../expansion-sources/finger-tricks/u2.json';
import { parseAlgorithm } from '../../domain/cube';
import { integrateFingerTricks } from './finger-tricks';
import type { FingerTrickTouch, IntegratedFingerTrick } from './finger-tricks';

/** Static registry of Trama's curated batch, validated and enriched at load time by
 * integrateFingerTricks (an invalid record fails the build, never ships silently).
 */
export const FINGER_TRICKS: readonly IntegratedFingerTrick[] = integrateFingerTricks([
  comboSexyBilateral, comboU2D2, dPrime, d, d2, mPrime, m, m2,
  sexyLeft, sexyRight, sledgehammerRight, uPrime, u, u2,
]);
export const VERIFIED_FINGER_TRICKS: readonly IntegratedFingerTrick[] = FINGER_TRICKS.filter(entry => entry.showGrip);
const byId = new Map(FINGER_TRICKS.map(entry => [entry.record.id, entry]));
export function getFingerTrick(id: string): IntegratedFingerTrick {
  const entry = byId.get(id);
  if (!entry) throw new Error(`Finger trick desconhecido: ${id}`);
  return entry;
}

export interface FingerTrickOccurrence {
  readonly trick: IntegratedFingerTrick;
  /** Global movement indices over the parsed sequence: tokens[startStep:endStep]. */
  readonly startStep: number;
  readonly endStep: number;
  readonly touches: readonly (FingerTrickTouch & { readonly globalMoveIndex: number })[];
}

/** All occurrences of the given tricks in a parsed sequence, exact token match on the
 * parseAlgorithm normal form, longest first at each position. Only pass tricks whose grip
 * may be shown; the default is the verified set, honoring the display contract.
 */
export function matchFingerTricks(algorithm: string, tricks: readonly IntegratedFingerTrick[] = VERIFIED_FINGER_TRICKS): FingerTrickOccurrence[] {
  const tokens = parseAlgorithm(algorithm);
  const occurrences: FingerTrickOccurrence[] = [];
  for (const trick of tricks) {
    for (let start = 0; start + trick.tokens.length <= tokens.length; start++) {
      if (!trick.tokens.every((token, offset) => tokens[start + offset] === token)) continue;
      occurrences.push({
        trick,
        startStep: start,
        endStep: start + trick.tokens.length,
        touches: trick.record.touches.map(touch => ({ ...touch, globalMoveIndex: start + touch.moveIndex })),
      });
    }
  }
  return occurrences.sort((a, b) => a.startStep - b.startStep || (b.endStep - b.startStep) - (a.endStep - a.startStep) || a.trick.record.id.localeCompare(b.trick.record.id));
}

/** Non-overlapping annotation cover for the collapsible demo: longest occurrences win,
 * remaining gaps take shorter tricks; the result is sorted by position.
 */
export function selectFingerTrickCover(algorithm: string, tricks: readonly IntegratedFingerTrick[] = VERIFIED_FINGER_TRICKS): FingerTrickOccurrence[] {
  const occurrences = [...matchFingerTricks(algorithm, tricks)]
    .sort((a, b) => (b.endStep - b.startStep) - (a.endStep - a.startStep) || a.startStep - b.startStep || a.trick.record.id.localeCompare(b.trick.record.id));
  const taken: FingerTrickOccurrence[] = [];
  const covered = new Set<number>();
  for (const occurrence of occurrences) {
    let free = true;
    for (let step = occurrence.startStep; step < occurrence.endStep; step++) if (covered.has(step)) { free = false; break; }
    if (!free) continue;
    for (let step = occurrence.startStep; step < occurrence.endStep; step++) covered.add(step);
    taken.push(occurrence);
  }
  return taken.sort((a, b) => a.startStep - b.startStep);
}
