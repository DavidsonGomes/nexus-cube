-- LOCAL WIP: exact S1 -> recorded-only V4 promotion. General V4 mutations/imports
-- remain unsupported until the independent full V4 server validator is installed.
-- This vertical is NOT sufficient to activate App4 in production.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create function nexus_sync4_private.recorded_wire(value jsonb) returns jsonb
language sql immutable set search_path='' as $fn$
  select jsonb_build_array('object',jsonb_agg(pair order by (pair->>0) collate "C"))
  from (select v pair from jsonb_array_elements(value->1) a(v)
    union all select jsonb_build_array(nexus_private.text_hex('kind'),nexus_private.canonical('"recorded"'::jsonb)::jsonb)) pairs
$fn$;
create function nexus_sync4_private.legacy_stream(who uuid) returns text
language plpgsql set search_path='' as $fn$
declare row record; session_text text; solve_text text; progress_text text; study_text text; settings_text text;
begin
  perform nexus_private.validate_account(who);
  for row in select * from nexus_private.records where owner=who and not tombstone loop
    perform nexus_private.validate_record(row.record,row.entity,row.id);
  end loop;
  -- These are VALIDATED wire ASTs. Strings are tags, hex or numeric spellings,
  -- so spaces in jsonb::text are exclusively serialization whitespace.
  select coalesce(string_agg(replace(nexus_sync4_private.recorded_wire(nexus_private.wire_field(record,'value'))::text,' ',''),',' order by position),'')
    into session_text from nexus_private.records where owner=who and entity='session' and not tombstone;
  select coalesce(string_agg(replace(nexus_sync4_private.recorded_wire(nexus_private.wire_field(record,'value'))::text,' ',''),',' order by position),'')
    into solve_text from nexus_private.records where owner=who and entity='solve' and not tombstone;
  select coalesce(string_agg('["'||nexus_private.text_hex(id)||'",'||replace(nexus_private.wire_field(record,'value')::text,' ','')||']',',' order by nexus_private.text_hex(id) collate "C"),'')
    into progress_text from nexus_private.records where owner=who and entity='progress' and not tombstone;
  select coalesce(string_agg(replace(nexus_private.wire_field(record,'value')::text,' ',''),',' order by position),'')
    into study_text from nexus_private.records where owner=who and entity='study' and not tombstone;
  select replace(nexus_private.wire_field(record,'value')::text,' ','') into settings_text from nexus_private.records where owner=who and entity='settings' and not tombstone;
  return '["object",['
    ||'["'||nexus_private.text_hex('imports')||'",'||nexus_private.canonical('{"sources":[],"batches":[]}'::jsonb)||'],'
    ||'["'||nexus_private.text_hex('progress')||'",["object",['||progress_text||']]],'
    ||'["'||nexus_private.text_hex('sessions')||'",["array",['||session_text||']]],'
    ||'["'||nexus_private.text_hex('settings')||'",'||settings_text||'],'
    ||'["'||nexus_private.text_hex('solves')||'",["array",['||solve_text||']]],'
    ||'["'||nexus_private.text_hex('studyAttempts')||'",["array",['||study_text||']]],'
    ||'["'||nexus_private.text_hex('version')||'",'||nexus_private.canonical('4'::jsonb)||']]]';
end $fn$;
create function nexus_sync4_private.stop_legacy_revision() returns trigger
language plpgsql set search_path='' as $fn$
begin
  if new.revision is distinct from old.revision and exists(select 1 from nexus_sync4_private.heads where owner=new.owner) then
    raise exception 'Account requires protocol4' using errcode='0A000';
  end if;
  return new;
end $fn$;
create trigger nexus_sync4_legacy_revision_guard before update of revision on nexus_private.accounts
for each row execute function nexus_sync4_private.stop_legacy_revision();

grant select,insert on nexus_sync4_private.frames,nexus_sync4_private.frame_parts,nexus_sync4_private.heads to nexus_sync_writer;
revoke all on function nexus_sync4_private.recorded_wire(jsonb),nexus_sync4_private.legacy_stream(uuid),nexus_sync4_private.stop_legacy_revision() from public,anon,authenticated,service_role;
grant execute on function nexus_sync4_private.recorded_wire(jsonb),nexus_sync4_private.legacy_stream(uuid),nexus_sync4_private.stop_legacy_revision() to nexus_sync_writer;

create function public.nexus_sync4_commit(request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare who uuid:=nexus_private.require_owner(); stage nexus_sync4_private.stages; old_head nexus_private.accounts;
  frame nexus_sync4_private.frames; current4 nexus_sync4_private.heads; part nexus_sync4_private.fragments;
  op uuid; expected text; expected_bytes bigint; current_head jsonb; new_epoch uuid;
begin
  if not nexus_sync4_private.exact_fields(request,array['operationId','requestDigest']) or not nexus_sync4_private.uuid_text(request->'operationId')
    or not nexus_sync4_private.hex_hash(request->'requestDigest') then return jsonb_build_object('kind','error','code','invalid'); end if;
  op:=(request->>'operationId')::uuid;
  select * into old_head from nexus_private.accounts where owner=who for update;
  if not found then return jsonb_build_object('kind','error','code','upgrade-required'); end if;
  select * into frame from nexus_sync4_private.frames where owner=who and operation_id=op;
  if found then
    if frame.request_digest<>request->>'requestDigest' then return jsonb_build_object('kind','error','code','request-mismatch'); end if;
    return nexus_sync4_private.frame_receipt(frame);
  end if;
  select * into stage from nexus_sync4_private.stages where owner=who and operation_id=op for update;
  if not found then return jsonb_build_object('kind','error','code','not-found'); end if;
  if stage.request_digest<>request->>'requestDigest' then return jsonb_build_object('kind','error','code','request-mismatch'); end if;
  if stage.state<>'receiving' or stage.expires_at<=floor(extract(epoch from clock_timestamp()))::bigint then return jsonb_build_object('kind','error','code','stage-expired'); end if;
  select * into current4 from nexus_sync4_private.heads where owner=who;
  if found then current_head:=jsonb_build_object('domainVersion',4,'epoch',current4.epoch,'revision',current4.revision::text);
  else current_head:=jsonb_build_object('domainVersion',3,'epoch',old_head.epoch,'revision',old_head.revision::text); end if;
  if stage.envelope->'base' is distinct from current_head then return jsonb_build_object('kind','conflict','operationId',op,'requestDigest',stage.request_digest,'current',current_head); end if;
  if stage.envelope->>'kind'<>'upgrade-v3' then return jsonb_build_object('kind','error','code','unsupported-version'); end if;
  -- Equality to a server-derived migration proves all fields/order/settings and
  -- empty archives. It cannot accept imported content or a client's proposed edits.
  expected:=nexus_sync4_private.legacy_stream(who); expected_bytes:=octet_length(expected);
  if expected_bytes<>stage.total_bytes or encode(sha256(convert_to(expected,'UTF8')),'hex')<>stage.envelope->'manifest'->>'sha256'
    or (select count(*) from nexus_sync4_private.fragments where owner=who and operation_id=op)<>stage.fragment_count then
    return jsonb_build_object('kind','error','code','integrity-mismatch'); end if;
  for part in select * from nexus_sync4_private.fragments where owner=who and operation_id=op order by index loop
    if part.index>=stage.fragment_count or part.byte_offset<>part.index*stage.fragment_bytes
      or part.payload<>substring(expected from (part.byte_offset+1)::integer for stage.fragment_bytes)
      or encode(sha256(convert_to(part.payload,'UTF8')),'hex')<>part.sha256 then return jsonb_build_object('kind','error','code','integrity-mismatch'); end if;
  end loop;
  new_epoch:=gen_random_uuid();
  insert into nexus_sync4_private.frames values(who,new_epoch,1,op,stage.request_digest,stage.envelope->'manifest') returning * into frame;
  insert into nexus_sync4_private.frame_parts select owner,new_epoch,1,index,byte_offset,payload,sha256 from nexus_sync4_private.fragments where owner=who and operation_id=op;
  insert into nexus_sync4_private.heads values(who,new_epoch,1,old_head.epoch,old_head.revision);
  update nexus_sync4_private.stages set state='cancelled' where owner=who and operation_id=op;
  delete from nexus_sync4_private.fragments where owner=who and operation_id=op;
  return nexus_sync4_private.frame_receipt(frame);
end $fn$;
revoke all on function public.nexus_sync4_commit(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nexus_sync4_commit(jsonb) to authenticated;

grant nexus_sync_writer to postgres with inherit false,set true;
grant create on schema public,nexus_sync4_private to nexus_sync_writer;
alter function public.nexus_sync4_commit(jsonb) owner to nexus_sync_writer;
set local role nexus_sync_writer;
alter function public.nexus_sync4_begin(jsonb) set schema nexus_sync4_private;
revoke all on function nexus_sync4_private.nexus_sync4_begin(jsonb) from public,anon,authenticated,service_role;
create function public.nexus_sync4_begin(request jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare who uuid:=nexus_private.require_owner(); frame nexus_sync4_private.frames; head nexus_sync4_private.heads;
begin
  if not nexus_sync4_private.uuid_text(request->'operationId') then return jsonb_build_object('kind','error','code','invalid'); end if;
  perform 1 from nexus_private.accounts where owner=who for update;
  select * into frame from nexus_sync4_private.frames where owner=who and operation_id=(request->>'operationId')::uuid;
  if found then
    if request is distinct from (select envelope from nexus_sync4_private.stages where owner=who and operation_id=frame.operation_id) then return jsonb_build_object('kind','error','code','request-mismatch'); end if;
    return nexus_sync4_private.frame_receipt(frame);
  end if;
  select * into head from nexus_sync4_private.heads where owner=who;
  if found then return jsonb_build_object('kind','error','code','unsupported-version'); end if;
  return nexus_sync4_private.nexus_sync4_begin(request);
end $fn$;
revoke all on function public.nexus_sync4_begin(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nexus_sync4_begin(jsonb) to authenticated;
create or replace function public.nexus_sync4_status(request jsonb) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare who uuid:=nexus_private.require_owner(); head nexus_sync4_private.heads; frame nexus_sync4_private.frames; legacy nexus_private.accounts;
begin
  if not nexus_sync4_private.exact_fields(request,array[]::text[]) then return jsonb_build_object('kind','error','code','invalid'); end if;
  select * into head from nexus_sync4_private.heads where owner=who;
  if found then
    select * into frame from nexus_sync4_private.frames where owner=who and epoch=head.epoch and revision=head.revision;
    return jsonb_build_object('kind','head','head',jsonb_build_object('domainVersion',4,'epoch',head.epoch,'revision',head.revision::text),'receipt',nexus_sync4_private.frame_receipt(frame));
  end if;
  select * into legacy from nexus_private.accounts where owner=who;
  if not found then return jsonb_build_object('kind','error','code','upgrade-required'); end if;
  return jsonb_build_object('kind','head','head',jsonb_build_object('domainVersion',3,'epoch',legacy.epoch,'revision',legacy.revision::text),'receipt',null);
end $fn$;
create or replace function public.nexus_sync_status() returns jsonb language plpgsql security definer set search_path='' as $fn$
declare who uuid:=nexus_private.require_owner(); revision bigint;
begin
  if exists(select 1 from nexus_sync4_private.heads where owner=who) then raise exception 'Account requires protocol4' using errcode='0A000'; end if;
  insert into nexus_private.accounts(owner) values(who) on conflict do nothing;
  select a.revision into revision from nexus_private.accounts a where owner=who;
  return jsonb_build_object('revision',revision::text);
end $fn$;
reset role;
revoke create on schema public,nexus_sync4_private from nexus_sync_writer;
grant nexus_sync_writer to postgres with inherit false,set false;
commit;
