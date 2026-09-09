import { CANONICAL_VERSION, digest } from '../cloud/codec';
import { embedded, record } from './shared';
import type { JsonValue, ParsedImport } from './types';

export const IMPORT_PARSER_VERSION = 'nexus-import-parsers/2';

/** Decode only known transport strings. Unknown strings remain literal data. */
function semanticMetadata(parsed:ParsedImport):JsonValue {
  const metadata = structuredClone(parsed.metadata);
  if (parsed.format !== 'cstimer-json' || !record(metadata)) return metadata;
  if (Object.hasOwn(metadata,'properties')) {
    const properties = embedded(metadata.properties);
    if (!record(properties)) throw new Error('Metadados de importação inválidos.');
    if (Object.hasOwn(properties,'sessionData')) properties.sessionData = embedded(properties.sessionData);
    metadata.properties = properties;
  }
  for (const key of Object.keys(metadata)) if (/^session[1-9]\d*$/.test(key)) metadata[key] = embedded(metadata[key]);
  return metadata;
}

/** A semantic digest is identity evidence only, never authority or consent.
 * Ordered locators bind source iteration order as well as row multiplicity.
 * This matters for object-backed session/table collections whose metadata keys
 * alone would be sorted by the generic canonical codec.
 */
export async function semanticSourceSHA256(parsed:ParsedImport):Promise<string> {
  const hash = await digest([
    'nexus-cube/import-source/v1', CANONICAL_VERSION,
    parsed.format, IMPORT_PARSER_VERSION, parsed.variant,
    semanticMetadata(parsed),
    parsed.sessions.map(session => session.sourceKey),
    parsed.solves.map(solve => [solve.sourceSessionKey,solve.sourceKey]),
    parsed.auxiliary.map(row => [row.table,row.sourceKey]),
  ]);
  return hash.slice('sha256:'.length);
}

export interface ImportEntityIdentity {
  semanticSHA256:string;
  entity:'session'|'solve'|'study-attempt'|'progress';
  recordKey:string;
  occurrence:number;
}
export async function createImportEntityId(identity:ImportEntityIdentity):Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(identity.semanticSHA256)
    || !['session','solve','study-attempt','progress'].includes(identity.entity)
    || typeof identity.recordKey !== 'string' || identity.recordKey.length === 0
    || identity.recordKey.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9_:./-]*$/.test(identity.recordKey)
    || !Number.isSafeInteger(identity.occurrence) || identity.occurrence < 0) throw new Error('Identidade de importação inválida.');
  const hash = await digest(['nexus-cube/import-entity/v1', CANONICAL_VERSION, identity.semanticSHA256, identity.entity, identity.recordKey, identity.occurrence]);
  return 'imp_' + hash.slice('sha256:'.length);
}
