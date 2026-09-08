import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonicalText, decodeText, decodeWire, digest, encodeText, encodeWire, numberBits } from '../../src/cloud/codec';
import { SYNC_TEXT_VECTORS } from './sync-fixtures';

test('sync codec: exact UTF16 vectors survive encode and independently constructed wire', () => {
  for (const { text, utf16be } of SYNC_TEXT_VECTORS) {
    assert.equal(encodeText(text), utf16be);
    assert.equal(decodeText(utf16be), text);
    assert.deepEqual(encodeWire(text), ['string', utf16be]);
    assert.equal(decodeWire(['string', utf16be]), text);
  }
  for (const invalid of ['0', '000', '00000', 'D800', 'gggg', ' 0000', '0000\n']) assert.throws(() => decodeText(invalid));
});

test('sync codec: literal binary64 and decimal vectors agree without rounding fractions', () => {
  for (const [value, bits, decimal] of [
    [0, '0000000000000000', '0'], [-0, '0000000000000000', '0'],
    [0.1, '3fb999999999999a', '0.1'], [1.5, '3ff8000000000000', '1.5'],
    [Number.MIN_VALUE, '0000000000000001', '5e-324'],
  ] as const) {
    assert.equal(numberBits(value), bits);
    assert.deepEqual(encodeWire(value), ['number', bits, decimal]);
    assert.ok(Object.is(decodeWire(['number', bits, decimal]), value === 0 ? 0 : value));
  }
  for (const value of [NaN, Infinity, -Infinity]) assert.throws(() => encodeWire(value));
  for (const wire of [
    ['number', '3fb999999999999a', '0.10'],
    ['number', '3ff8000000000000', '0.1'],
    ['number', '0000000000000000', '-0'],
    ['number', '0000000000000000', '1e-324'],
    ['number', '7ff0000000000000', 'Infinity'],
    ['number', '3FB999999999999A', '0.1'],
    ['number', '000000000000000', '0'],
  ]) assert.throws(() => decodeWire(wire));
});

test('sync codec: literal complete canonical grammar and independent SHA256 oracle', async () => {
  const value = { b: '\u0000', a: [null, true, 1.5] };
  const expected = '["object",[["0061",["array",[["null"],["bool",true],["number","3ff8000000000000","1.5"]]]],["0062",["string","0000"]]]]';
  assert.equal(canonicalText(value), expected);
  assert.deepEqual(decodeWire(JSON.parse(expected)), value);
  assert.equal(await digest(value), `sha256:${createHash('sha256').update(expected, 'ascii').digest('hex')}`);
  assert.equal(await digest({ a: [null, true, 1.5], b: '\u0000' }), await digest(value));
  assert.notEqual(await digest({ a: [true, null, 1.5], b: '\u0000' }), await digest(value));
});

test('sync codec: object keys use UTF16 order, preserve unknown map values and cannot pollute prototype', () => {
  const value = { '\ue000': 'last', '\ud800\udc00': 'first' };
  assert.deepEqual(encodeWire(value), ['object', [
    ['d800dc00', ['string', '00660069007200730074']],
    ['e000', ['string', '006c006100730074']],
  ]]);
  const decoded = decodeWire(['object', [['005f005f00700072006f0074006f005f005f', ['string', '0078']]]]) as Record<string, unknown>;
  assert.equal(Object.getPrototypeOf(decoded), Object.prototype);
  assert.equal(Object.getOwnPropertyDescriptor(decoded, '__proto__')?.value, 'x');
  assert.deepEqual(Object.keys(decoded), ['__proto__']);
});

test('sync codec: malformed tags, trailing fields, duplicate or unsorted keys are rejected', () => {
  for (const wire of [
    ['null', 'extra'], ['bool', 'false'], ['array', [['missing']]], ['string', '0000', 'extra'],
    ['object', [['0061', ['null']], ['0061', ['null']]]],
    ['object', [['0062', ['null']], ['0061', ['null']]]],
    ['object', [['0061']]], ['object', [['0061', ['null'], 'extra']]],
  ]) assert.throws(() => decodeWire(wire));
  for (const value of [undefined, { a: undefined }, [undefined], 1n]) assert.throws(() => encodeWire(value));
});

test('sync codec: sparse arrays cannot acquire a canonical digest or decode as valid values', () => {
  const hole = new Array(1);
  let encoderRejected = false, decoderRejected = false;
  try { encodeWire(hole); } catch { encoderRejected = true; }
  try { decodeWire(['array', hole]); } catch { decoderRejected = true; }
  assert.deepEqual({ encoderRejected, decoderRejected }, { encoderRejected: true, decoderRejected: true }, 'both directions must reject a missing typed child');
});
