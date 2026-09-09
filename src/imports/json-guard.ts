/** No source keys or values appear in errors: these may contain personal data. */
export class DuplicateImportJsonKeyError extends Error {
  constructor() { super('JSON contém chaves repetidas no mesmo objeto.'); }
}

/** Validate the grammar and budgets before JSON.parse can discard duplicate keys.
 * Key equality is decoded UTF16 equality, with no Unicode normalization.
 */
export function assertUnambiguousJson(text: string, maxDepth: number, maxNodes: number): void {
  let position = 0, nodes = 0;
  const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const fail = (): never => { throw new Error('JSON inválido ou acima do orçamento de leitura.'); };
  function whitespace() {
    while (position < text.length && (text[position] === ' ' || text[position] === '\t' || text[position] === '\r' || text[position] === '\n')) position++;
  }
  function stringToken(): string {
    const start = position++;
    while (position < text.length) {
      const char = text.charCodeAt(position++);
      if (char === 34) return text.slice(start, position);
      if (char < 32) fail();
      if (char === 92) {
        const escaped = text[position++];
        if (escaped === 'u') {
          for (let i = 0; i < 4; i++) {
            const digit = text[position++];
            if (digit === undefined || !/[0-9a-fA-F]/.test(digit)) fail();
          }
        } else if (escaped === undefined || !'"\\/bfnrt'.includes(escaped)) fail();
      }
    }
    return fail();
  }
  function value(depth: number): void {
    if (++nodes > maxNodes || depth > maxDepth) fail();
    whitespace();
    const char = text[position];
    if (char === '"') { stringToken(); return; }
    if (char === '{' || char === '[') {
      const object = char === '{', close = object ? '}' : ']';
      const keys = new Set<string>();
      position++; whitespace();
      if (text[position] === close) { position++; return; }
      while (true) {
        whitespace();
        if (object) {
          if (text[position] !== '"') fail();
          const key = JSON.parse(stringToken()) as string;
          if (keys.has(key)) throw new DuplicateImportJsonKeyError();
          keys.add(key); whitespace();
          if (text[position++] !== ':') fail();
        }
        value(depth + 1); whitespace();
        const separator = text[position++];
        if (separator === close) return;
        if (separator !== ',') fail();
      }
    }
    for (const literal of ['null', 'true', 'false']) {
      if (text.startsWith(literal, position)) { position += literal.length; return; }
    }
    number.lastIndex = position;
    const match = number.exec(text);
    if (!match) fail();
    position = number.lastIndex;
  }
  value(0); whitespace();
  if (position !== text.length) fail();
}
