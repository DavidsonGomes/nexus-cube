import { MAX_IMPORT_ROWS, MAX_IMPORT_SOURCE_BYTES } from './shared';
import type { CubeTimerProjection, JsonValue } from './types';

export interface SqlJsStatement {
  step():boolean;get(params:null,options:{useBigInt:true}):unknown[];free():boolean;
}
export interface SqlJsDatabase {prepare(sql:string):SqlJsStatement;close():void}
export interface SqlJsRuntime {Database:new(bytes?:Uint8Array)=>SqlJsDatabase}
export interface SQLiteReadLimits {
  maxSourceBytes:number;maxProjectionBytes:number;maxRows:number;maxSqliteHeapBytes:number;timeoutMs:number;
}
export type SQLiteReadPhase='loading-engine'|'opening'|'schema'|'reading'|'complete';
export type SQLiteReadResult=
  | {kind:'projection';projection:CubeTimerProjection;metrics:{sourceBytes:number;projectionBytes:number;rows:number;elapsedMs:number;sqliteHeapLimitBytes:number}}
  | {kind:'invalid-sqlite'|'unsupported-schema'|'resource-limit'|'cancelled'|'timeout'|'worker-error'};

const schema={
  cube:['id','CUBE','SCRAMBLER_ID','BUILT_IN'],
  record:['id','CUBE_ID','PATTERN_ID','STARTTIME_MS','STARTTIME','SOLVE_TIME_MS','DNF','PLUS2'],
  pattern3x3x3:['id','PATTERN','CUBE_ID'],
  pll:['id','PLL_IDX','STARTTIME_MS','STARTTIME','SOLVE_TIME_MS','DNF','PLUS2'],
  oll:['id','OLL_IDX','STARTTIME_MS','STARTTIME','SOLVE_TIME_MS','DNF','PLUS2'],
  f2l:['id','F2L_IDX','STARTTIME_MS','STARTTIME','SOLVE_TIME_MS','DNF','PLUS2'],
  quiz:['id','STARTTIME_MS','STARTTIME','NUM_OLL','NUM_PLL'],
  quiz_detail:['id','history_id','pattern_idx','correct'],
  build:['id','BUILD_NUM'],
  android_metadata:['locale'],
  scrambler:['id','NAME','MOVE','BUILT_IN'],
  notation:['id','SCRAMBLER_ID','NOTATION'],
} as const;
type TableName=keyof typeof schema;
// Every identifier comes from these source-code constants, never from the file.
const queries=Object.fromEntries(Object.entries(schema).map(([name,columns])=>[name,{
  info:`PRAGMA main.table_xinfo("${name}")`,
  rows:`SELECT ${columns.map(column=>`typeof("${column}"),CASE WHEN typeof("${column}")='text' THEN NULL ELSE "${column}" END,CASE WHEN typeof("${column}")='text' THEN CAST("${column}" AS BLOB) ELSE NULL END`).join(',')} FROM "${name}" ORDER BY "${name==='android_metadata'?'rowid':'id'}"`,
}])) as Record<TableName,{info:string;rows:string}>;
class ResourceLimit extends Error {}
class UnsupportedSchema extends Error {}
export function validSQLiteReadLimits(limits:SQLiteReadLimits):boolean {
  return !!limits&&[limits.maxSourceBytes,limits.maxProjectionBytes,limits.maxRows,limits.maxSqliteHeapBytes,limits.timeoutMs].every(value=>Number.isSafeInteger(value)&&value>0)
    &&limits.maxSourceBytes<=MAX_IMPORT_SOURCE_BYTES&&limits.maxProjectionBytes<=MAX_IMPORT_SOURCE_BYTES&&limits.maxRows<=MAX_IMPORT_ROWS&&limits.timeoutMs<=2147483647;
}
function encoded(bytes:Uint8Array):string {
  const chunks:string[]=[];for(let i=0;i<bytes.length;i+=24576)chunks.push(btoa(String.fromCharCode(...bytes.subarray(i,i+24576))));return chunks.join('');
}
function value(type:unknown,raw:unknown,textBytes:unknown,encoding:string):JsonValue {
  if(type==='null')return null;
  if(type==='integer'&&typeof raw==='bigint')return raw>=BigInt(Number.MIN_SAFE_INTEGER)&&raw<=BigInt(Number.MAX_SAFE_INTEGER)?Number(raw):raw.toString(10);
  if(type==='real'&&typeof raw==='number'&&Number.isFinite(raw))return raw;
  if(type==='blob'&&raw instanceof Uint8Array)return {$sqliteBlob:encoded(raw)};
  if(type==='text'&&textBytes instanceof Uint8Array){
    try{return new TextDecoder(encoding,{fatal:true,ignoreBOM:true}).decode(textBytes);}
    catch{return {$sqliteTextBytes:encoded(textBytes),encoding};}
  }
  throw new Error('Unsupported SQLite value');
}

/** Runs only in a disposable worker or an isolated synthetic test engine.
 * SQL is owned here. No paths, SQL text, extension or migration comes from input.
 */
export function readCubeTimerSQLite(runtime:SqlJsRuntime,source:Uint8Array,limits:SQLiteReadLimits,onPhase?:(phase:SQLiteReadPhase)=>void):SQLiteReadResult {
  if(!validSQLiteReadLimits(limits)||!(source instanceof Uint8Array)||source.length<100||source.length>limits.maxSourceBytes)return {kind:'resource-limit'};
  if(!Array.from('SQLite format 3\0').every((char,index)=>source[index]===char.charCodeAt(0)))return {kind:'invalid-sqlite'};
  const started=performance.now(),utf8=new TextEncoder();let db:SqlJsDatabase|undefined;
  function withinTime(){if(performance.now()-started>limits.timeoutMs)throw new ResourceLimit();}
  function query(sql:string,maximum:number):unknown[][] {
    const statement=db!.prepare(sql),rows:unknown[][]=[];
    try{while(statement.step()){withinTime();if(rows.length>=maximum)throw new ResourceLimit();rows.push(statement.get(null,{useBigInt:true}));}return rows;}
    finally{statement.free();}
  }
  try {
    onPhase?.('opening');
    // Set SQLite allocator limit before opening the untrusted database. FS/WASM/JS
    // copies are separate; this is not a total-heap guarantee.
    db=new runtime.Database();
    const effective=query('PRAGMA hard_heap_limit='+limits.maxSqliteHeapBytes,1)[0]?.[0];
    if(typeof effective!=='bigint'||effective<=0n||effective>BigInt(limits.maxSqliteHeapBytes))throw new ResourceLimit();
    db.close();db=undefined;
    db=new runtime.Database(new Uint8Array(source));
    query('PRAGMA trusted_schema=OFF',1);query('PRAGMA query_only=ON',1);
    if(query('PRAGMA trusted_schema',1)[0]?.[0]!==0n||query('PRAGMA query_only',1)[0]?.[0]!==1n)throw new UnsupportedSchema();
    onPhase?.('schema');
    if(query('PRAGMA user_version',1)[0]?.[0]!==1n)throw new UnsupportedSchema();
    const rawEncoding=query('PRAGMA encoding',1)[0]?.[0];
    const encoding=rawEncoding==='UTF-8'?'utf-8':rawEncoding==='UTF-16le'?'utf-16le':rawEncoding==='UTF-16be'?'utf-16be':null;
    if(!encoding)throw new UnsupportedSchema();
    const tables=query("SELECT name,type,wr FROM pragma_table_list WHERE schema='main' ORDER BY name",32);
    const names:TableName[]=[];
    for(const [name,type,withoutRowid] of tables){
      if(name==='sqlite_schema'||name==='sqlite_sequence')continue;
      if(typeof name!=='string'||!Object.hasOwn(schema,name)||type!=='table'||withoutRowid!==0n)throw new UnsupportedSchema();
      names.push(name as TableName);
    }
    if(!(['cube','record','pattern3x3x3'] as TableName[]).every(name=>names.includes(name)))throw new UnsupportedSchema();
    const projection:CubeTimerProjection={userVersion:1,tables:{}};
    for(const name of names){
      const columns=query(queries[name].info,64),expected=schema[name];
      if(columns.length!==expected.length||columns.some((c,index)=>c[1]!==expected[index]||c[6]!==0n))throw new UnsupportedSchema();
      // The known Android metadata table has no declared PK. Its implicit rowid
      // orders documentary rows without deduplicating equal locales. All other
      // allowed tables retain the existing INTEGER PRIMARY KEY requirement.
      const firstType=(columns[0]?.[2] as string)?.toUpperCase(),firstPK=columns[0]?.[5];
      if(name==='android_metadata'?(firstType!=='TEXT'||firstPK!==0n):(firstType!=='INTEGER'||firstPK!==1n))throw new UnsupportedSchema();
      projection.tables[name]=[];
    }
    let rows=0,projectionBytes=utf8.encode(JSON.stringify(projection)).byteLength;
    if(projectionBytes>limits.maxProjectionBytes)throw new ResourceLimit();
    onPhase?.('reading');
    for(const name of names){
      const statement=db.prepare(queries[name].rows),columns=schema[name];
      try{
        while(statement.step()){
          withinTime();if(++rows>limits.maxRows)throw new ResourceLimit();
          const values=statement.get(null,{useBigInt:true}),row:Record<string,JsonValue>={};
          if(values.length!==columns.length*3)throw new UnsupportedSchema();
          for(let i=0;i<columns.length;i++)row[columns[i]]=value(values[i*3],values[i*3+1],values[i*3+2],encoding);
          projectionBytes+=utf8.encode(JSON.stringify(row)).byteLength+(projection.tables[name].length?1:0);
          if(projectionBytes>limits.maxProjectionBytes)throw new ResourceLimit();
          projection.tables[name].push(row);
        }
      }finally{statement.free();}
    }
    withinTime();onPhase?.('complete');
    return {kind:'projection',projection,metrics:{sourceBytes:source.length,projectionBytes,rows,elapsedMs:performance.now()-started,sqliteHeapLimitBytes:Number(effective)}};
  }catch(error){
    if(error instanceof ResourceLimit)return {kind:'resource-limit'};
    if(error instanceof UnsupportedSchema)return {kind:'unsupported-schema'};
    return {kind:'invalid-sqlite'};
  }finally{try{db?.close();}catch{/* The owning disposable worker is terminated on every outcome. */}}
}
