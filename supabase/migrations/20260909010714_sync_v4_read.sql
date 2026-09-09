-- LOCAL WIP. Read side for immutable committed frames; no promotion/writer here.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
create table nexus_sync4_private.frames (
  owner uuid not null references nexus_private.accounts(owner),
  epoch uuid not null, revision bigint not null check(revision>0),
  operation_id uuid not null, request_digest text not null check(request_digest ~ '^[0-9a-f]{64}$'),
  manifest jsonb not null check(nexus_sync4_private.valid_manifest(manifest)),
  primary key(owner,epoch,revision), unique(owner,operation_id)
);
create table nexus_sync4_private.frame_parts (
  owner uuid not null, epoch uuid not null, revision bigint not null, index bigint not null check(index>=0),
  byte_offset bigint not null check(byte_offset>=0),
  payload text not null check(octet_length(payload) between 1 and 32768 and payload !~ '[^ -~]'),
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  primary key(owner,epoch,revision,index),
  foreign key(owner,epoch,revision) references nexus_sync4_private.frames(owner,epoch,revision)
);
create table nexus_sync4_private.heads (
  owner uuid primary key references nexus_private.accounts(owner),
  epoch uuid not null, revision bigint not null check(revision>0),
  legacy_epoch uuid not null, legacy_revision bigint not null check(legacy_revision>=0),
  foreign key(owner,epoch,revision) references nexus_sync4_private.frames(owner,epoch,revision)
);
do $rls$ declare relation text; begin
  foreach relation in array array['frames','frame_parts','heads'] loop
    execute format('alter table nexus_sync4_private.%I enable row level security',relation);
    execute format('alter table nexus_sync4_private.%I force row level security',relation);
    execute format('create policy owner_rows on nexus_sync4_private.%I to nexus_sync_writer using(owner=(select nexus_private.require_owner())) with check(owner=(select nexus_private.require_owner()))',relation);
    execute format('revoke all on nexus_sync4_private.%I from public,anon,authenticated,service_role',relation);
  end loop;
end $rls$;
grant select on nexus_sync4_private.frames,nexus_sync4_private.frame_parts,nexus_sync4_private.heads to nexus_sync_writer;
create function nexus_sync4_private.frame_receipt(value nexus_sync4_private.frames) returns jsonb
language sql immutable set search_path='' as $fn$
  select jsonb_build_object('kind','applied','protocolVersion',4,'operationId',(value).operation_id,
    'requestDigest',(value).request_digest,'head',jsonb_build_object('domainVersion',4,'epoch',(value).epoch,'revision',(value).revision::text),'manifest',(value).manifest)
$fn$;
revoke all on function nexus_sync4_private.frame_receipt(nexus_sync4_private.frames) from public,anon,authenticated,service_role;
grant execute on function nexus_sync4_private.frame_receipt(nexus_sync4_private.frames) to nexus_sync_writer;

create function public.nexus_sync4_read(request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare who uuid:=nexus_private.require_owner(); frame nexus_sync4_private.frames; part nexus_sync4_private.frame_parts;
  idx bigint;
begin
  if not nexus_sync4_private.exact_fields(request,array['head','operationId','requestDigest','index'])
    or not nexus_sync4_private.valid_base(request->'head') or request->'head'->'domainVersion' is distinct from '4'::jsonb
    or not nexus_sync4_private.uuid_text(request->'operationId') or not nexus_sync4_private.hex_hash(request->'requestDigest')
    or not nexus_sync4_private.safe_integer(request->'index') then return jsonb_build_object('kind','error','code','invalid'); end if;
  idx:=(request->>'index')::bigint;
  select * into frame from nexus_sync4_private.frames where owner=who and epoch=(request->'head'->>'epoch')::uuid and revision=(request->'head'->>'revision')::bigint;
  if not found then return jsonb_build_object('kind','error','code','not-found'); end if;
  if frame.operation_id<>(request->>'operationId')::uuid or frame.request_digest<>request->>'requestDigest' then return jsonb_build_object('kind','error','code','request-mismatch'); end if;
  if idx>=(frame.manifest->>'fragmentCount')::bigint then return jsonb_build_object('kind','error','code','invalid'); end if;
  select * into part from nexus_sync4_private.frame_parts where owner=who and epoch=frame.epoch and revision=frame.revision and index=idx;
  if not found then return jsonb_build_object('kind','error','code','integrity-mismatch'); end if;
  if part.byte_offset<>idx*(frame.manifest->>'fragmentBytes')::bigint
    or octet_length(part.payload)<>least((frame.manifest->>'fragmentBytes')::bigint,(frame.manifest->>'totalBytes')::bigint-part.byte_offset)
    or encode(sha256(convert_to(part.payload,'UTF8')),'hex')<>part.sha256 then return jsonb_build_object('kind','error','code','integrity-mismatch'); end if;
  return jsonb_build_object('kind','fragment','receipt',nexus_sync4_private.frame_receipt(frame),
    'fragment',jsonb_build_object('index',idx,'offset',part.byte_offset,'text',part.payload,'sha256',part.sha256),
    'nextIndex',idx+1,'complete',idx+1=(frame.manifest->>'fragmentCount')::bigint);
end $fn$;
revoke all on function public.nexus_sync4_read(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.nexus_sync4_read(jsonb) to authenticated;
grant nexus_sync_writer to postgres with inherit false,set true;
grant create on schema public to nexus_sync_writer;
alter function public.nexus_sync4_read(jsonb) owner to nexus_sync_writer;
revoke create on schema public from nexus_sync_writer;
grant nexus_sync_writer to postgres with inherit false,set false;
commit;
