import type { WireValue } from './sync-types';

export const CANONICAL_VERSION = 1;
export const WIRE_VERSION = 1;
const hex = /^[0-9a-f]*$/;
export function encodeText(value: string): string {
  let result = '';
  for (let i = 0; i < value.length; i++) result += value.charCodeAt(i).toString(16).padStart(4, '0');
  return result;
}
export function decodeText(value: string): string {
  if (value.length % 4 || !hex.test(value)) throw new Error('Invalid UTF16 framing');
  const parts: string[] = [];
  for (let i = 0; i < value.length; i += 4096) {
    const units: number[] = [];
    for (let j = i; j < Math.min(i + 4096, value.length); j += 4) units.push(parseInt(value.slice(j, j + 4), 16));
    parts.push(String.fromCharCode(...units));
  }
  return parts.join('');
}
export function numberBits(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Non-finite number');
  const view = new DataView(new ArrayBuffer(8)); view.setFloat64(0, value === 0 ? 0 : value, false);
  return Array.from(new Uint8Array(view.buffer), byte => byte.toString(16).padStart(2, '0')).join('');
}
/** Canonical v1: typed JSON arrays, UTF16 hex, binary64 BE plus persisted decimal.
 * Arrays preserve order; object keys sort by UTF16 units. No normalization.
 * The serialized grammar is ASCII, so JS and SQL can frame it identically.
 */
export function encodeWire(value: unknown): WireValue {
  if (value === null) return ['null'];
  if (typeof value === 'boolean') return ['bool', value];
  if (typeof value === 'number') return ['number', numberBits(value), JSON.stringify(value === 0 ? 0 : value)];
  if (typeof value === 'string') return ['string', encodeText(value)];
  if (Array.isArray(value)) { for (let i = 0; i < value.length; i++) if (!Object.hasOwn(value, i)) throw new Error('Sparse array'); return ['array', value.map(encodeWire)]; }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return ['object', Object.keys(value).sort().map(key => [encodeText(key), encodeWire((value as Record<string, unknown>)[key])])];
  throw new Error('Unsupported wire value');
}
export function decodeWire(input: unknown, depth = 0): unknown {
  if (depth > 32 || !Array.isArray(input)) throw new Error('Invalid wire framing');
  const [tag, payload] = input;
  if (tag === 'null' && input.length === 1) return null;
  if (tag === 'bool' && input.length === 2 && typeof payload === 'boolean') return payload;
  if (tag === 'string' && input.length === 2 && typeof payload === 'string') return decodeText(payload);
  if (tag === 'number' && input.length === 3 && typeof payload === 'string' && /^[0-9a-f]{16}$/.test(payload) && typeof input[2] === 'string') {
    const number = Number(input[2]);
    if (!Number.isFinite(number) || JSON.stringify(number) !== input[2] || numberBits(number) !== payload) throw new Error('Invalid binary64');
    return number;
  }
  if (tag === 'array' && input.length === 2 && Array.isArray(payload)) { for (let i = 0; i < payload.length; i++) if (!Object.hasOwn(payload, i)) throw new Error('Sparse array'); return payload.map(value => decodeWire(value, depth + 1)); }
  if (tag === 'object' && input.length === 2 && Array.isArray(payload)) {
    const result: Record<string, unknown> = {};
    let previous: string | null = null;
    for (const entry of payload) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') throw new Error('Invalid wire member');
      const key = decodeText(entry[0]);
      if (previous !== null && previous >= key) throw new Error('Unsorted or duplicate wire key');
      Object.defineProperty(result, key, { value: decodeWire(entry[1], depth + 1), enumerable: true, writable: true, configurable: true });
      previous = key;
    }
    return result;
  }
  throw new Error('Unknown wire tag or trailing fields');
}
export function canonicalText(value: unknown): string { return JSON.stringify(encodeWire(value)); }
export async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalText(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
