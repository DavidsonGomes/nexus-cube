-- LOCAL WIP, not a target apply artifact. This first slice stores/cancels frames.
-- It cannot promote a V3 account or commit/read a V4 snapshot yet. In particular,
-- no S1 function is replaced, and none of its rows is inserted/updated/deleted.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $check$ begin
  if current_user <> 'postgres' or to_regprocedure('nexus_private.require_owner()') is null
    or not exists(select 1 from pg_roles where rolname='nexus_sync_writer' and not rolcanlogin and not rolbypassrls and not rolsuper and not rolcreaterole)
  then raise exception 'sync4 prerequisite mismatch'; end if;
end $check$;

create schema nexus_sync4_private;
revoke all on schema nexus_sync4_private from public,anon,authenticated,service_role;
grant usage on schema nexus_sync4_private to nexus_sync_writer;

create table nexus_sync4_private.stages (
  owner uuid not null references nexus_private.accounts(owner),
  operation_id uuid not null,
  request_digest text not null check(request_digest ~ '^[0-9a-f]{64}$'),
  envelope jsonb not null,
  total_bytes bigint not null check(total_bytes > 0),
  fragment_bytes integer not null check(fragment_bytes between 1 and 32768),
  fragment_count bigint not null check(fragment_count > 0),
  expires_at bigint not null check(expires_at >= 0),
  state text not null check(state in ('receiving','cancelled','expired')),
  primary key(owner,operation_id)
);
create table nexus_sync4_private.fragments (
  owner uuid not null,
  operation_id uuid not null,
  index bigint not null check(index>=0),
  byte_offset bigint not null check(byte_offset>=0),
  payload text not null check(octet_length(payload) between 1 and 32768 and payload !~ '[^ -~]'),
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  primary key(owner,operation_id,index),
  foreign key(owner,operation_id) references nexus_sync4_private.stages(owner,operation_id)
);
do $rls$ declare relation text; begin
  foreach relation in array array['stages','fragments'] loop
    execute format('alter table nexus_sync4_private.%I enable row level security',relation);
    execute format('alter table nexus_sync4_private.%I force row level security',relation);
    execute format('create policy owner_rows on nexus_sync4_private.%I to nexus_sync_writer using(owner=(select nexus_private.require_owner())) with check(owner=(select nexus_private.require_owner()))',relation);
    execute format('revoke all on nexus_sync4_private.%I from public,anon,authenticated,service_role',relation);
  end loop;
end $rls$;
grant select,insert,update on nexus_sync4_private.stages to nexus_sync_writer;
grant select,insert,delete on nexus_sync4_private.fragments to nexus_sync_writer;

create function nexus_sync4_private.exact_fields(value jsonb, fields text[]) returns boolean
language sql immutable set search_path='' as $fn$
  select coalesce(jsonb_typeof(value)='object' and value ?& fields
    and not exists(select 1 from jsonb_object_keys(case when jsonb_typeof(value)='object' then value else '{}'::jsonb end) k where not(k=any(fields))),false)
$fn$;
create function nexus_sync4_private.uuid_text(value jsonb) returns boolean
language sql immutable set search_path='' as $fn$
  select coalesce(jsonb_typeof(value)='string' and value#>>'{}' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',false)
$fn$;
create function nexus_sync4_private.hex_hash(value jsonb) returns boolean
language sql immutable set search_path='' as $fn$
  select coalesce(jsonb_typeof(value)='string' and value#>>'{}' ~ '^[0-9a-f]{64}$',false)
$fn$;
create function nexus_sync4_private.safe_integer(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $fn$
begin
  if jsonb_typeof(value) is distinct from 'number' then return false; end if;
  return value::numeric between 0 and 9007199254740991 and trunc(value::numeric)=value::numeric;
end $fn$;
create function nexus_sync4_private.valid_base(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $fn$
begin
  if not nexus_sync4_private.exact_fields(value,array['domainVersion','epoch','revision'])
    or value->'domainVersion' not in ('3'::jsonb,'4'::jsonb)
    or not nexus_sync4_private.uuid_text(value->'epoch')
    or jsonb_typeof(value->'revision') is distinct from 'string'
    or value->>'revision' !~ '^(0|[1-9][0-9]{0,18})$' then return false; end if;
  return (value->>'revision')::numeric<=9223372036854775807;
end $fn$;
create function nexus_sync4_private.valid_manifest(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $fn$
declare total bigint; size integer; count bigint;
begin
  if not nexus_sync4_private.exact_fields(value,array['protocolVersion','domainVersion','canonicalVersion','wireVersion','encoding','totalBytes','fragmentBytes','fragmentCount','sha256'])
    or value->'protocolVersion' is distinct from '4'::jsonb or value->'domainVersion' is distinct from '4'::jsonb
    or value->'canonicalVersion' is distinct from '1'::jsonb or value->'wireVersion' is distinct from '1'::jsonb
    or value->>'encoding' is distinct from 'canonical-json-ascii'
    or not nexus_sync4_private.safe_integer(value->'totalBytes')
    or not nexus_sync4_private.safe_integer(value->'fragmentBytes')
    or not nexus_sync4_private.safe_integer(value->'fragmentCount')
    or not nexus_sync4_private.hex_hash(value->'sha256') then return false; end if;
  total:=(value->>'totalBytes')::bigint;
  if total<1 or (value->>'fragmentBytes')::numeric not between 1 and 32768 then return false; end if;
  size:=(value->>'fragmentBytes')::integer; count:=(value->>'fragmentCount')::bigint;
  return count=(total+size-1)/size;
end $fn$;

create function public.nexus_sync4_status(request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare who uuid:=nexus_private.require_owner(); head nexus_private.accounts;
begin
  if not nexus_sync4_private.exact_fields(request,array[]::text[]) then return jsonb_build_object('kind','error','code','invalid'); end if;
  select * into head from nexus_private.accounts where owner=who;
  if not found then return jsonb_build_object('kind','error','code','upgrade-required'); end if;
  return jsonb_build_object('kind','head','head',jsonb_build_object('domainVersion',3,'epoch',head.epoch,'revision',head.revision::text),'receipt',null);
end $fn$;

create function public.nexus_sync4_begin(request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare who uuid:=nexus_private.require_owner(); head nexus_private.accounts; prior nexus_sync4_private.stages;
  op uuid; hash text; expiry bigint:=floor(extract(epoch from clock_timestamp()))::bigint+3600; current_head jsonb;
begin
  if not nexus_sync4_private.exact_fields(request,array['protocolVersion','operationId','requestDigest','kind','base','manifest'])
    or request->'protocolVersion' is distinct from '4'::jsonb
    or not nexus_sync4_private.uuid_text(request->'operationId') or not nexus_sync4_private.hex_hash(request->'requestDigest')
    or not nexus_sync4_private.valid_base(request->'base') or not nexus_sync4_private.valid_manifest(request->'manifest')
    or request->>'kind' not in ('upgrade-v3','mutation','adoption','restore')
    or (request->>'kind'='upgrade-v3') is distinct from (request->'base'->>'domainVersion'='3')
  then return jsonb_build_object('kind','error','code','invalid'); end if;
  hash:=substr(nexus_private.hash(jsonb_build_array('nexus-cube/sync-operation/v4',4,request->'operationId',request->'kind',request->'base',request->'manifest')),8);
  if hash is distinct from request->>'requestDigest' then return jsonb_build_object('kind','error','code','request-mismatch'); end if;
  op:=(request->>'operationId')::uuid;
  -- Same owner row lock as S1 commits. The later promotion must use this lock too.
  select * into head from nexus_private.accounts where owner=who for update;
  if not found then return jsonb_build_object('kind','error','code','upgrade-required'); end if;
  current_head:=jsonb_build_object('domainVersion',3,'epoch',head.epoch,'revision',head.revision::text);
  select * into prior from nexus_sync4_private.stages where owner=who and operation_id=op;
  if found then
    if prior.envelope is distinct from request then return jsonb_build_object('kind','error','code','request-mismatch'); end if;
    if prior.state<>'receiving' or prior.expires_at<=expiry-3600 then return jsonb_build_object('kind','error','code','stage-expired'); end if;
    return jsonb_build_object('kind','staged','operationId',op,'requestDigest',hash,'manifest',request->'manifest','expiresAt',prior.expires_at);
  end if;
  if request->'base' is distinct from current_head then
    return jsonb_build_object('kind','conflict','operationId',op,'requestDigest',hash,'current',current_head);
  end if;
  -- Conservative representation ceiling: 64 * MAX_V4_SNAPSHOT_BYTES (377417080).
  -- This is a wire guard, NOT proof of physical capacity or a replacement domain cap.
  if (request->'manifest'->>'totalBytes')::bigint>24154693120 then return jsonb_build_object('kind','error','code','capacity-blocked'); end if;
  update nexus_sync4_private.stages set state='expired' where owner=who and state='receiving' and expires_at<=expiry-3600;
  delete from nexus_sync4_private.fragments f using nexus_sync4_private.stages s
    where f.owner=who and s.owner=f.owner and s.operation_id=f.operation_id and s.state in ('expired','cancelled');
  if (select count(*) from nexus_sync4_private.stages where owner=who and state='receiving')>=2 then return jsonb_build_object('kind','error','code','stage-limit'); end if;
  if (select count(*) from nexus_sync4_private.stages where owner=who)>=100000 then return jsonb_build_object('kind','error','code','capacity-blocked'); end if;
  insert into nexus_sync4_private.stages values(who,op,hash,request,(request->'manifest'->>'totalBytes')::bigint,
    (request->'manifest'->>'fragmentBytes')::integer,(request->'manifest'->>'fragmentCount')::bigint,expiry,'receiving');
  return jsonb_build_object('kind','staged','operationId',op,'requestDigest',hash,'manifest',request->'manifest','expiresAt',expiry);
end $fn$;

create function public.nexus_sync4_chunk(request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare who uuid:=nexus_private.require_owner(); stage nexus_sync4_private.stages; prior nexus_sync4_private.fragments;
  op uuid; idx bigint; off bigint; payload text; hash text; expected integer;
begin
  if not nexus_sync4_private.exact_fields(request,array['operationId','requestDigest','index','offset','text','sha256'])
    or not nexus_sync4_private.uuid_text(request->'operationId') or not nexus_sync4_private.hex_hash(request->'requestDigest')
    or not nexus_sync4_private.hex_hash(request->'sha256') or not nexus_sync4_private.safe_integer(request->'index')
    or not nexus_sync4_private.safe_integer(request->'offset') or jsonb_typeof(request->'text') is distinct from 'string'
  then return jsonb_build_object('kind','error','code','invalid'); end if;
  op:=(request->>'operationId')::uuid;idx:=(request->>'index')::bigint;off:=(request->>'offset')::bigint;payload:=request->>'text';
  select * into stage from nexus_sync4_private.stages where owner=who and operation_id=op for update;
  if not found then return jsonb_build_object('kind','error','code','not-found'); end if;
  if stage.request_digest<>request->>'requestDigest' then return jsonb_build_object('kind','error','code','request-mismatch'); end if;
  if stage.state<>'receiving' or stage.expires_at<=floor(extract(epoch from clock_timestamp()))::bigint then return jsonb_build_object('kind','error','code','stage-expired'); end if;
  if idx>=stage.fragment_count or off<>idx*stage.fragment_bytes then return jsonb_build_object('kind','error','code','invalid'); end if;
  expected:=least(stage.fragment_bytes,stage.total_bytes-off)::integer;
  if octet_length(payload)<>expected or payload ~ '[^ -~]' then return jsonb_build_object('kind','error','code','invalid'); end if;
  hash:=encode(sha256(convert_to(payload,'UTF8')),'hex');
  if hash<>request->>'sha256' then return jsonb_build_object('kind','error','code','integrity-mismatch'); end if;
  select * into prior from nexus_sync4_private.fragments where owner=who and operation_id=op and index=idx;
  if found then
    if prior.payload<>payload or prior.sha256<>hash or prior.byte_offset<>off then return jsonb_build_object('kind','error','code','request-mismatch'); end if;
  else insert into nexus_sync4_private.fragments values(who,op,idx,off,payload,hash); end if;
  return jsonb_build_object('kind','chunk-stored','operationId',op,'requestDigest',stage.request_digest,'index',idx,'sha256',hash);
end $fn$;

create function public.nexus_sync4_cancel(request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare who uuid:=nexus_private.require_owner(); stage nexus_sync4_private.stages; op uuid;
begin
  if not nexus_sync4_private.exact_fields(request,array['operationId','requestDigest']) or not nexus_sync4_private.uuid_text(request->'operationId')
    or not nexus_sync4_private.hex_hash(request->'requestDigest') then return jsonb_build_object('kind','error','code','invalid'); end if;
  op:=(request->>'operationId')::uuid;
  select * into stage from nexus_sync4_private.stages where owner=who and operation_id=op for update;
  if not found then return jsonb_build_object('kind','error','code','not-found'); end if;
  if stage.request_digest<>request->>'requestDigest' then return jsonb_build_object('kind','error','code','request-mismatch'); end if;
  update nexus_sync4_private.stages set state='cancelled' where owner=who and operation_id=op;
  delete from nexus_sync4_private.fragments where owner=who and operation_id=op;
  return jsonb_build_object('kind','cancelled','operationId',op,'requestDigest',stage.request_digest);
end $fn$;

-- Close ACL while still owner; only then transfer public wrappers to the existing
-- NOBYPASSRLS writer. The temporary SET/CREATE privileges do not survive commit.
revoke all on all functions in schema nexus_sync4_private from public,anon,authenticated,service_role;
grant execute on all functions in schema nexus_sync4_private to nexus_sync_writer;
revoke all on function public.nexus_sync4_status(jsonb),public.nexus_sync4_begin(jsonb),public.nexus_sync4_chunk(jsonb),public.nexus_sync4_cancel(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nexus_sync4_status(jsonb),public.nexus_sync4_begin(jsonb),public.nexus_sync4_chunk(jsonb),public.nexus_sync4_cancel(jsonb) to authenticated;
grant nexus_sync_writer to postgres with inherit false,set true;
grant create on schema public to nexus_sync_writer;
alter function public.nexus_sync4_status(jsonb) owner to nexus_sync_writer;
alter function public.nexus_sync4_begin(jsonb) owner to nexus_sync_writer;
alter function public.nexus_sync4_chunk(jsonb) owner to nexus_sync_writer;
alter function public.nexus_sync4_cancel(jsonb) owner to nexus_sync_writer;
revoke create on schema public from nexus_sync_writer;
grant nexus_sync_writer to postgres with inherit false,set false;
commit;
