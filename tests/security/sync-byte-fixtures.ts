import { Buffer } from 'node:buffer';
import type { AppData } from '../../src/domain/types';

/** Published pre-sync capacity, deliberately independent of new product constants. */
export const HISTORIC_V3_SNAPSHOT_BYTES = 47_955_088;

/** No validator, generator or byte helper from the product participates in this oracle. */
export function compactV3BoundaryFixture(selection: 'null' | 'id1' | 'id100', targetBytes = HISTORIC_V3_SNAPSHOT_BYTES): AppData {
  const longId = 'x'.repeat(100);
  const stamp = '2026-09-08T12:00:00.000Z';
  const data: AppData = {
    version: 3,
    sessions: [
      { id: 'a', name: 'synthetic-short-id', mode: 'two-handed', createdAt: stamp },
      { id: longId, name: 'synthetic-long-id', mode: 'two-handed', createdAt: stamp },
    ],
    activeSessionId: selection === 'null' ? null : selection === 'id1' ? 'a' : longId,
    solves: Array.from({ length: 5000 }, (_, index) => ({
      id: `bytes-${index}`, sessionId: 'a', mode: 'two-handed' as const,
      rawMs: 0.1, penalty: 'none' as const, scramble: 'R U', createdAt: stamp,
      note: '', source: 'manual' as const,
    })),
    progress: {}, studyAttempts: [],
    settings: { theme: 'dark', inspection: false, inspectionSound: true,
      holdMs: 300, focus: false, hideRunningTime: false, animationSpeed: 1 },
  };
  let remaining = targetBytes - Buffer.byteLength(JSON.stringify(data), 'utf8');
  if (!Number.isSafeInteger(remaining) || remaining < 0) throw new Error('Synthetic target too small');
  for (const solve of data.solves) {
    const length = Math.min(10_000, remaining);
    solve.note = 'x'.repeat(length);
    remaining -= length;
    if (remaining === 0) break;
  }
  if (remaining !== 0 || Buffer.byteLength(JSON.stringify(data), 'utf8') !== targetBytes) throw new Error('Synthetic fixture capacity is insufficient');
  return data;
}
