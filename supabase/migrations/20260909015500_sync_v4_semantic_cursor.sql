-- LOCAL WIP. Cursor semântico interno sobre a gramática wire v1.
-- Não é RPC, DTO ou framing novo. Eventos são privados e só o parser writer
-- pode produzi-los depois de fechar um valor canônico completo.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

alter table nexus_sync4_private.parser_state
  add column if not exists semantic_path text[] not null default '{}',
  add column if not exists token_state text not null default 'value',
  add column if not exists previous_key_hex text,
  add column if not exists token_buffer text not null default '',
  add column if not exists array_index bigint not null default 0 check(array_index>=0),
  add column if not exists active_source_id text,
  add column if not exists active_source_quartet text not null default '',
  add column if not exists active_source_pending_hex text not null default '',
  add column if not exists active_source_bytes bigint not null default 0 check(active_source_bytes>=0);

create table if not exists nexus_sync4_private.parser_events (
  owner uuid not null,
  operation_id uuid not null,
  sequence_no bigint not null check(sequence_no>=0),
  byte_offset bigint not null check(byte_offset>=0),
  event_kind text not null check(event_kind in ('object-enter','array-enter','object-key','scalar','source-bytes-chunk','source-closed','batch-begin','batch-record','batch-closed','projection-unit','end')),
  path text[] not null default '{}',
  key_hex text,
  scalar_tag text check(scalar_tag is null or scalar_tag in ('null','bool','string','number')),
  scalar_payload text,
  source_id text,
  batch_id text,
  record_key text,
  ordinal bigint,
  target_id text,
  reason text,
  primary key(owner,operation_id,sequence_no),
  foreign key(owner,operation_id) references nexus_sync4_private.stages(owner,operation_id),
  check(key_hex is null or key_hex ~ '^(?:[0-9a-f]{4})*$'),
  check(event_kind<>'scalar' or scalar_tag is not null),
  check(event_kind<>'object-key' or key_hex is not null),
  check(ordinal is null or ordinal>=0)
);
create table if not exists nexus_sync4_private.parser_source_state (
  owner uuid not null,
  operation_id uuid not null,
  source_id text not null,
  hash_state nexus_sync4_private.sha256_state not null default nexus_sync4_private.sha256_init(),
  received_bytes bigint not null default 0 check(received_bytes>=0),
  primary key(owner,operation_id,source_id),
  foreign key(owner,operation_id) references nexus_sync4_private.stages(owner,operation_id),
  check(source_id ~ '^src_[0-9a-f]{64}$')
);
alter table nexus_sync4_private.parser_source_state enable row level security;
alter table nexus_sync4_private.parser_source_state force row level security;
create policy owner_rows on nexus_sync4_private.parser_source_state to nexus_sync_writer
  using(owner=(select nexus_private.require_owner())) with check(owner=(select nexus_private.require_owner()));
revoke all on nexus_sync4_private.parser_source_state from public,anon,authenticated,service_role;
grant select,insert,update,delete on nexus_sync4_private.parser_source_state to nexus_sync_writer;
alter table nexus_sync4_private.parser_events enable row level security;
alter table nexus_sync4_private.parser_events force row level security;
create policy owner_rows on nexus_sync4_private.parser_events to nexus_sync_writer
  using(owner=(select nexus_private.require_owner())) with check(owner=(select nexus_private.require_owner()));
revoke all on nexus_sync4_private.parser_events from public,anon,authenticated,service_role;
grant select,insert,update,delete on nexus_sync4_private.parser_events to nexus_sync_writer;

create function nexus_sync4_private.append_parser_event(request jsonb) returns jsonb
language plpgsql set search_path='' as $fn$
declare who uuid:=nexus_private.require_owner(); op uuid; digest text; p nexus_sync4_private.parser_state; n bigint; kind text;
begin
  if not nexus_sync4_private.exact_fields(request,array['operationId','requestDigest','byteOffset','eventKind','path','keyHex','scalarTag','scalarPayload','sourceId','batchId','recordKey','ordinal','targetId','reason'])
    or not nexus_sync4_private.uuid_text(request->'operationId') or not nexus_sync4_private.hex_hash(request->'requestDigest')
    or not nexus_sync4_private.safe_integer(request->'byteOffset') or jsonb_typeof(request->'path')<>'array' then
    return jsonb_build_object('kind','error','code','invalid');
  end if;
  op:=(request->>'operationId')::uuid; digest:=request->>'requestDigest'; kind:=request->>'eventKind';
  select * into p from nexus_sync4_private.parser_state where owner=who and operation_id=op for update;
  if not found or p.request_digest<>digest then return jsonb_build_object('kind','error','code','not-found'); end if;
  if p.rejected or p.syntax_valid is false and kind='end' then return jsonb_build_object('kind','error','code','syntax-incomplete'); end if;
  if (request->>'byteOffset')::bigint > (select total_bytes from nexus_sync4_private.stages where owner=who and operation_id=op) then return jsonb_build_object('kind','error','code','offset-invalid'); end if;
  select coalesce(max(sequence_no)+1,0) into n from nexus_sync4_private.parser_events where owner=who and operation_id=op;
  insert into nexus_sync4_private.parser_events(owner,operation_id,sequence_no,byte_offset,event_kind,path,key_hex,scalar_tag,scalar_payload,source_id,batch_id,record_key,ordinal,target_id,reason)
    values(who,op,n,(request->>'byteOffset')::bigint,kind,array(select jsonb_array_elements_text(request->'path')),nullif(request->>'keyHex',''),nullif(request->>'scalarTag',''),request->>'scalarPayload',nullif(request->>'sourceId',''),nullif(request->>'batchId',''),nullif(request->>'recordKey',''),nullif(request->>'ordinal','')::bigint,nullif(request->>'targetId',''),nullif(request->>'reason',''));
  return jsonb_build_object('kind','event-recorded','operationId',op,'sequence',n);
end $fn$;
revoke all on function nexus_sync4_private.append_parser_event(jsonb) from public,anon,authenticated,service_role;
grant execute on function nexus_sync4_private.append_parser_event(jsonb) to nexus_sync_writer;

create function nexus_sync4_private.consume_source_event(request jsonb) returns jsonb
language plpgsql set search_path='' as $fn$
declare who uuid:=nexus_private.require_owner(); op uuid; digest text; source text; state nexus_sync4_private.parser_source_state; bytes bytea; final_sha text; expected_bytes bigint; expected_sha text;
begin
  if not nexus_sync4_private.exact_fields(request,array['operationId','requestDigest','eventKind','sourceId','scalarPayload','byteLength','rawSHA256'])
    or not nexus_sync4_private.uuid_text(request->'operationId') or not nexus_sync4_private.hex_hash(request->'requestDigest')
    or (request->>'eventKind') not in ('source-bytes-chunk','source-closed') then return jsonb_build_object('kind','error','code','invalid'); end if;
  op:=(request->>'operationId')::uuid; digest:=request->>'requestDigest'; source:=request->>'sourceId';
  if source is null or source !~ '^src_[0-9a-f]{64}$' then return jsonb_build_object('kind','error','code','source-invalid'); end if;
  if not exists(select 1 from nexus_sync4_private.parser_state p where p.owner=who and p.operation_id=op and p.request_digest=digest and not p.rejected) then return jsonb_build_object('kind','error','code','parser-not-found'); end if;
  if request->>'eventKind'='source-bytes-chunk' then
    if request->>'scalarPayload' is null then return jsonb_build_object('kind','error','code','chunk-missing'); end if;
    begin bytes:=decode(request->>'scalarPayload','base64'); exception when others then return jsonb_build_object('kind','error','code','chunk-invalid'); end;
    if octet_length(bytes)>32768 then return jsonb_build_object('kind','error','code','chunk-too-large'); end if;
    insert into nexus_sync4_private.parser_source_state(owner,operation_id,source_id) values(who,op,source) on conflict do nothing;
    select * into state from nexus_sync4_private.parser_source_state where owner=who and operation_id=op and source_id=source for update;
    if state.received_bytes>9007199254740991-octet_length(bytes) then return jsonb_build_object('kind','error','code','source-overflow'); end if;
    update nexus_sync4_private.parser_source_state set hash_state=nexus_sync4_private.sha256_update(state.hash_state,bytes),received_bytes=state.received_bytes+octet_length(bytes)
      where owner=who and operation_id=op and source_id=source;
    return jsonb_build_object('kind','source-progress','sourceId',source,'receivedBytes',state.received_bytes+octet_length(bytes));
  end if;
  if not nexus_sync4_private.safe_integer(request->'byteLength') or not nexus_sync4_private.hex_hash(request->'rawSHA256') then return jsonb_build_object('kind','error','code','source-close-invalid'); end if;
  expected_bytes:=(request->>'byteLength')::bigint; expected_sha:=request->>'rawSHA256';
  select * into state from nexus_sync4_private.parser_source_state where owner=who and operation_id=op and source_id=source for update;
  if not found then return jsonb_build_object('kind','error','code','source-missing'); end if;
  final_sha:=nexus_sync4_private.sha256_final(state.hash_state);
  if state.received_bytes<>expected_bytes or final_sha<>expected_sha then return jsonb_build_object('kind','error','code','source-integrity-mismatch'); end if;
  insert into nexus_sync4_private.frame_sources(owner,operation_id,source_id,raw_sha256,byte_length,chunk_count,verified)
    values(who,op,source,expected_sha,expected_bytes,case when expected_bytes=0 then 0 else ceil(expected_bytes/32768.0)::bigint end,true)
    on conflict(owner,operation_id,source_id) do update set raw_sha256=excluded.raw_sha256,byte_length=excluded.byte_length,chunk_count=excluded.chunk_count,verified=true;
  return jsonb_build_object('kind','source-closed','sourceId',source,'byteLength',expected_bytes,'rawSHA256',final_sha);
end $fn$;
revoke all on function nexus_sync4_private.consume_source_event(jsonb) from public,anon,authenticated,service_role;
grant execute on function nexus_sync4_private.consume_source_event(jsonb) to nexus_sync_writer;
commit;
