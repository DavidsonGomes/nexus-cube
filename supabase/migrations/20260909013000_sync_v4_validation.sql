-- LOCAL WIP. Retomable V4 validation ledger only.
-- This migration deliberately does not publish a head, receipt, or domain row.
-- A parser owns the private record/source inserts; callers provide only op+digest
-- to the entry point. The full account is never concatenated in this step.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create table nexus_sync4_private.frame_validation (
  owner uuid not null,
  operation_id uuid not null,
  request_digest text not null check(request_digest ~ '^[0-9a-f]{64}$'),
  base_epoch uuid not null,
  base_revision bigint not null check(base_revision>=0),
  parser_version integer not null check(parser_version=1),
  canonical_version integer not null check(canonical_version=1),
  state text not null check(state in ('receiving','schema-valid','references-valid','validated','rejected')),
  wire_sha256 text not null check(wire_sha256 ~ '^[0-9a-f]{64}$'),
  source_count bigint not null default 0 check(source_count>=0),
  reference_count bigint not null default 0 check(reference_count>=0),
  source_bytes bigint not null default 0 check(source_bytes>=0),
  import_bytes bigint not null default 0 check(import_bytes>=0),
  created_at timestamptz not null default clock_timestamp(),
  validated_at timestamptz,
  primary key(owner,operation_id),
  foreign key(owner,operation_id) references nexus_sync4_private.stages(owner,operation_id)
);
create table nexus_sync4_private.frame_sources (
  owner uuid not null, operation_id uuid not null, source_id text not null,
  raw_sha256 text not null check(raw_sha256 ~ '^[0-9a-f]{64}$'),
  byte_length bigint not null check(byte_length>=0),
  chunk_count bigint not null check(chunk_count>=0),
  verified boolean not null default false,
  check(source_id = 'src_'||raw_sha256),
  primary key(owner,operation_id,source_id),
  foreign key(owner,operation_id) references nexus_sync4_private.frame_validation(owner,operation_id)
);
create table nexus_sync4_private.frame_batches (
  owner uuid not null, operation_id uuid not null, batch_id text not null,
  source_id text not null, parser_version text not null, canonical_version integer not null check(canonical_version=1),
  semantic_sha256 text not null check(semantic_sha256 ~ '^[0-9a-f]{64}$'),
  plan_sha256 text not null check(plan_sha256 ~ '^[0-9a-f]{64}$'),
  duplicate_of text, completes_batch_id text, record_count bigint not null check(record_count>=0),
  primary key(owner,operation_id,batch_id),
  foreign key(owner,operation_id) references nexus_sync4_private.frame_validation(owner,operation_id),
  check(batch_id ~ '^imp_[0-9a-f]{64}$'), check(source_id ~ '^src_[0-9a-f]{64}$'),
  check(duplicate_of is null or duplicate_of ~ '^imp_[0-9a-f]{64}$'),
  -- Dedicated completion link (co-signed with Lastro): never reuse duplicate_of,
  -- which means an intentional sibling copy. A batch cannot be both.
  check(completes_batch_id is null or completes_batch_id ~ '^imp_[0-9a-f]{64}$'),
  check(duplicate_of is null or completes_batch_id is null)
);
create table nexus_sync4_private.frame_references (
  owner uuid not null, operation_id uuid not null, entity text not null,
  source_id text not null default '', batch_id text not null default '', record_key text not null,
  ordinal bigint not null default 0 check(ordinal>=0), parent_key text, target_id text, list_position text, reason text,
  tombstone boolean not null default false,
  disposition text not null check(disposition in ('included','already-present','pending','excluded')),
  primary key(owner,operation_id,entity,source_id,batch_id,record_key,ordinal),
  foreign key(owner,operation_id) references nexus_sync4_private.frame_validation(owner,operation_id),
  check(entity in ('session','solve','progress','study','settings','source','batch','decision')),
  check(source_id='' or source_id ~ '^src_[0-9a-f]{64}$'),
  check(batch_id='' or batch_id ~ '^imp_[0-9a-f]{64}$')
);
do $rls$ declare relation text; begin
  foreach relation in array array['frame_validation','frame_sources','frame_batches','frame_references'] loop
    execute format('alter table nexus_sync4_private.%I enable row level security',relation);
    execute format('alter table nexus_sync4_private.%I force row level security',relation);
    execute format('create policy owner_rows on nexus_sync4_private.%I to nexus_sync_writer using(owner=(select nexus_private.require_owner())) with check(owner=(select nexus_private.require_owner()))',relation);
    execute format('revoke all on nexus_sync4_private.%I from public,anon,authenticated,service_role',relation);
  end loop;
end $rls$;
grant select,insert,update,delete on nexus_sync4_private.frame_validation,nexus_sync4_private.frame_sources,nexus_sync4_private.frame_batches,nexus_sync4_private.frame_references to nexus_sync_writer;

create function nexus_sync4_private.begin_validation(request jsonb) returns jsonb
language plpgsql set search_path='' as $fn$
declare who uuid:=nexus_private.require_owner(); stage nexus_sync4_private.stages; check_row nexus_sync4_private.frame_validation; head nexus_private.accounts;
  current_epoch uuid; current_revision bigint; op uuid; digest text;
begin
  if not nexus_sync4_private.exact_fields(request,array['operationId','requestDigest'])
    or not nexus_sync4_private.uuid_text(request->'operationId')
    or not nexus_sync4_private.hex_hash(request->'requestDigest') then
    return jsonb_build_object('kind','error','code','invalid');
  end if;
  op:=(request->>'operationId')::uuid; digest:=request->>'requestDigest';
  select * into head from nexus_private.accounts where owner=who for update;
  if not found then return jsonb_build_object('kind','error','code','upgrade-required'); end if;
  select * into stage from nexus_sync4_private.stages where owner=who and operation_id=op for update;
  if not found then return jsonb_build_object('kind','error','code','not-found'); end if;
  if stage.request_digest<>digest then return jsonb_build_object('kind','error','code','request-mismatch'); end if;
  if stage.state<>'receiving' then return jsonb_build_object('kind','error','code','stage-terminal'); end if;
  if stage.expires_at<=floor(extract(epoch from clock_timestamp()))::bigint then return jsonb_build_object('kind','error','code','stage-expired'); end if;
  if not exists(select 1 from nexus_sync4_private.transport_validation t where t.owner=who and t.operation_id=op and t.request_digest=digest and t.verified) then
    return jsonb_build_object('kind','error','code','transport-incomplete');
  end if;
  select * into check_row from nexus_sync4_private.frame_validation where owner=who and operation_id=op for update;
  if found then
    if check_row.request_digest<>digest then return jsonb_build_object('kind','error','code','request-mismatch'); end if;
    return jsonb_build_object('kind','validation', 'state',check_row.state,'operationId',op,'requestDigest',digest,
      'sourceCount',check_row.source_count,'referenceCount',check_row.reference_count);
  end if;
  if stage.envelope->'base'->>'domainVersion'='4' then
    select h.epoch,h.revision into current_epoch,current_revision from nexus_sync4_private.heads h where h.owner=who;
    if not found or current_epoch<>(stage.envelope->'base'->>'epoch')::uuid or current_revision<>(stage.envelope->'base'->>'revision')::bigint then
      return jsonb_build_object('kind','conflict','code','head-changed');
    end if;
  else
    current_epoch:=head.epoch; current_revision:=head.revision;
    if stage.envelope->'base'->>'epoch'<>current_epoch::text or stage.envelope->'base'->>'revision'<>current_revision::text then
      return jsonb_build_object('kind','conflict','code','head-changed');
    end if;
  end if;
  insert into nexus_sync4_private.frame_validation(owner,operation_id,request_digest,base_epoch,base_revision,parser_version,canonical_version,state,wire_sha256)
    values(who,op,digest,current_epoch,current_revision,1,1,'receiving',stage.envelope->'manifest'->>'sha256');
  return jsonb_build_object('kind','validation','state','receiving','operationId',op,'requestDigest',digest);
end $fn$;

create function nexus_sync4_private.finish_validation(request jsonb) returns jsonb
language plpgsql set search_path='' as $fn$
declare who uuid:=nexus_private.require_owner(); v nexus_sync4_private.frame_validation; stage nexus_sync4_private.stages; head nexus_private.accounts;
  op uuid; digest text; source_total bigint; ref_total bigint; source_bytes_total bigint; current_epoch uuid; current_revision bigint;
begin
  if not nexus_sync4_private.exact_fields(request,array['operationId','requestDigest'])
    or not nexus_sync4_private.uuid_text(request->'operationId') or not nexus_sync4_private.hex_hash(request->'requestDigest')
  then return jsonb_build_object('kind','error','code','invalid'); end if;
  op:=(request->>'operationId')::uuid;digest:=request->>'requestDigest';
  select * into head from nexus_private.accounts where owner=who for update;
  select * into v from nexus_sync4_private.frame_validation where owner=who and operation_id=op for update;
  if not found then return jsonb_build_object('kind','error','code','not-found'); end if;
  if v.request_digest<>digest then return jsonb_build_object('kind','error','code','request-mismatch'); end if;
  if v.state='validated' then return jsonb_build_object('kind','validated','operationId',op,'requestDigest',digest,'wireSha256',v.wire_sha256,'sourceCount',v.source_count,'referenceCount',v.reference_count); end if;
  if v.state='rejected' then return jsonb_build_object('kind','error','code','validation-rejected'); end if;
  if v.state<>'references-valid' then return jsonb_build_object('kind','error','code','parser-incomplete'); end if;
  if not exists(select 1 from nexus_sync4_private.parser_state p where p.owner=who and p.operation_id=op and p.request_digest=digest and p.syntax_valid and not p.rejected) then
    return jsonb_build_object('kind','error','code','syntax-incomplete');
  end if;
  select * into stage from nexus_sync4_private.stages where owner=who and operation_id=op for update;
  if not found or stage.state<>'receiving' then return jsonb_build_object('kind','error','code','stage-terminal'); end if;
  if stage.expires_at<=floor(extract(epoch from clock_timestamp()))::bigint then return jsonb_build_object('kind','error','code','stage-expired'); end if;
  if exists(select 1 from nexus_sync4_private.transport_validation t where t.owner=who and t.operation_id=op and not t.verified) then return jsonb_build_object('kind','error','code','transport-incomplete'); end if;
  -- Same branching as begin_validation, keyed on the stage's declared base
  -- domainVersion for symmetry: a domain4 base anchors on the sync4 head, a
  -- domain3 base on the legacy account even right after a promotion.
  if stage.envelope->'base'->>'domainVersion'='4' then
    select h.epoch,h.revision into current_epoch,current_revision from nexus_sync4_private.heads h where h.owner=who;
    if not found then return jsonb_build_object('kind','conflict','code','head-changed'); end if;
  else
    current_epoch:=head.epoch; current_revision:=head.revision;
  end if;
  if current_epoch<>v.base_epoch or current_revision<>v.base_revision then return jsonb_build_object('kind','conflict','code','head-changed'); end if;
  select count(*),coalesce(sum(byte_length),0)
    into source_total, source_bytes_total from nexus_sync4_private.frame_sources where owner=who and operation_id=op;
  select count(*) into ref_total from nexus_sync4_private.frame_references where owner=who and operation_id=op;
  if source_total<>v.source_count or ref_total<>v.reference_count then return jsonb_build_object('kind','error','code','parser-incomplete'); end if;
  if exists(select 1 from nexus_sync4_private.frame_references r where r.owner=who and r.operation_id=op and r.source_id<>'' and not exists(select 1 from nexus_sync4_private.frame_sources s where s.owner=r.owner and s.operation_id=r.operation_id and s.source_id=r.source_id))
    or exists(select 1 from nexus_sync4_private.frame_references r where r.owner=who and r.operation_id=op and r.batch_id<>'' and not exists(select 1 from nexus_sync4_private.frame_batches b where b.owner=r.owner and b.operation_id=r.operation_id and b.batch_id=r.batch_id)) then
    return jsonb_build_object('kind','error','code','reference-incomplete');
  end if;
  if exists(select 1 from nexus_sync4_private.frame_sources where owner=who and operation_id=op and not verified) then return jsonb_build_object('kind','error','code','source-incomplete'); end if;
  if v.source_count<>source_total or v.reference_count<>ref_total or v.source_bytes<>source_bytes_total then return jsonb_build_object('kind','error','code','parser-incomplete'); end if;
  update nexus_sync4_private.frame_validation set state='validated',validated_at=clock_timestamp() where owner=who and operation_id=op;
  return jsonb_build_object('kind','validated','operationId',op,'requestDigest',digest,'wireSha256',v.wire_sha256,
    'sourceCount',source_total,'referenceCount',ref_total,'base',jsonb_build_object('epoch',v.base_epoch,'revision',v.base_revision::text));
end $fn$;

create function nexus_sync4_private.validate_semantic_units(request jsonb) returns jsonb
language plpgsql set search_path='' as $fn$
declare who uuid:=nexus_private.require_owner(); v nexus_sync4_private.frame_validation; op uuid; digest text; bad bigint;
begin
  if not nexus_sync4_private.exact_fields(request,array['operationId','requestDigest'])
    or not nexus_sync4_private.uuid_text(request->'operationId') or not nexus_sync4_private.hex_hash(request->'requestDigest') then
    return jsonb_build_object('kind','error','code','invalid');
  end if;
  op:=(request->>'operationId')::uuid;digest:=request->>'requestDigest';
  select * into v from nexus_sync4_private.frame_validation where owner=who and operation_id=op for update;
  if not found or v.request_digest<>digest then return jsonb_build_object('kind','error','code','not-found'); end if;
  if v.state in ('validated','rejected') then return jsonb_build_object('kind','error','code','validation-terminal'); end if;
  if not exists(select 1 from nexus_sync4_private.parser_state p where p.owner=who and p.operation_id=op and p.request_digest=digest and p.syntax_valid and not p.rejected) then
    return jsonb_build_object('kind','error','code','syntax-incomplete');
  end if;
  if exists(select 1 from nexus_sync4_private.frame_sources s where s.owner=who and s.operation_id=op and (not s.verified or s.source_id<>'src_'||s.raw_sha256)) then
    return jsonb_build_object('kind','error','code','source-invalid');
  end if;
  if exists(select 1 from nexus_sync4_private.frame_batches b where b.owner=who and b.operation_id=op and not exists(select 1 from nexus_sync4_private.frame_sources s where s.owner=b.owner and s.operation_id=b.operation_id and s.source_id=b.source_id)) then
    return jsonb_build_object('kind','error','code','batch-source-missing');
  end if;
  if exists(select 1 from nexus_sync4_private.frame_batches b where b.owner=who and b.operation_id=op and b.duplicate_of is not null and not exists(select 1 from nexus_sync4_private.frame_batches prior where prior.owner=b.owner and prior.operation_id=b.operation_id and prior.batch_id=b.duplicate_of)) then
    return jsonb_build_object('kind','error','code','duplicate-batch-missing');
  end if;
  if exists(select 1 from nexus_sync4_private.frame_references r where r.owner=who and r.operation_id=op and r.source_id<>'' and not exists(select 1 from nexus_sync4_private.frame_sources s where s.owner=r.owner and s.operation_id=r.operation_id and s.source_id=r.source_id))
    or exists(select 1 from nexus_sync4_private.frame_references r where r.owner=who and r.operation_id=op and r.batch_id<>'' and not exists(select 1 from nexus_sync4_private.frame_batches b where b.owner=r.owner and b.operation_id=r.operation_id and b.batch_id=r.batch_id)) then
    return jsonb_build_object('kind','error','code','reference-link-missing');
  end if;
  if exists(select 1 from nexus_sync4_private.frame_references r where r.owner=who and r.operation_id=op and r.disposition='pending' and (r.reason is null or r.reason not in ('unknown-time','unknown-penalty','unknown-puzzle','unsupported-puzzle','unmapped-fields','unresolved-parent'))) then
    return jsonb_build_object('kind','error','code','pending-reason-invalid');
  end if;
  -- Per the frozen import model (Prisma): an excluded record always carries the
  -- reason 'user-confirmed', and only that disposition may.
  if exists(select 1 from nexus_sync4_private.frame_references r where r.owner=who and r.operation_id=op and r.disposition='excluded' and r.reason is distinct from 'user-confirmed') then
    return jsonb_build_object('kind','error','code','excluded-reason-invalid');
  end if;
  if exists(select 1 from nexus_sync4_private.frame_references r where r.owner=who and r.operation_id=op and r.disposition in ('included','already-present') and (r.target_id is null or r.target_id='')) then
    return jsonb_build_object('kind','error','code','target-missing');
  end if;
  if exists(select 1 from nexus_sync4_private.frame_references r where r.owner=who and r.operation_id=op and r.entity='solve' and r.parent_key is not null and not exists(select 1 from nexus_sync4_private.frame_references p where p.owner=r.owner and p.operation_id=r.operation_id and p.entity='session' and p.record_key=r.parent_key)) then
    return jsonb_build_object('kind','error','code','parent-missing');
  end if;
  select count(*) into bad from nexus_sync4_private.frame_batches b where b.owner=who and b.operation_id=op and b.record_count<>(select count(*) from nexus_sync4_private.frame_references r where r.owner=b.owner and r.operation_id=b.operation_id and r.batch_id=b.batch_id);
  if bad>0 then return jsonb_build_object('kind','error','code','record-count-mismatch'); end if;
  return jsonb_build_object('kind','semantic-valid','operationId',op,'requestDigest',digest);
end $fn$;

-- Called only by the server parser after it has consumed the complete stream.
-- No public role can execute this function; values here are parser-owned state,
-- never a client supplied digest or budget assertion.
create function nexus_sync4_private.record_parser_result(request jsonb) returns jsonb
language plpgsql set search_path='' as $fn$
declare who uuid:=nexus_private.require_owner(); v nexus_sync4_private.frame_validation; op uuid; digest text; semantic jsonb;
begin
  if not nexus_sync4_private.exact_fields(request,array['operationId','requestDigest','sourceCount','referenceCount','sourceBytes','importBytes'])
    or not nexus_sync4_private.uuid_text(request->'operationId') or not nexus_sync4_private.hex_hash(request->'requestDigest')
    or not nexus_sync4_private.safe_integer(request->'sourceCount')
    or not nexus_sync4_private.safe_integer(request->'referenceCount') or not nexus_sync4_private.safe_integer(request->'sourceBytes')
    or not nexus_sync4_private.safe_integer(request->'importBytes') then return jsonb_build_object('kind','error','code','invalid'); end if;
  op:=(request->>'operationId')::uuid;digest:=request->>'requestDigest';
  select * into v from nexus_sync4_private.frame_validation where owner=who and operation_id=op for update;
  if not found or v.request_digest<>digest then return jsonb_build_object('kind','error','code','not-found'); end if;
  if v.state in ('validated','rejected') then return jsonb_build_object('kind','error','code','validation-terminal'); end if;
  if not exists(select 1 from nexus_sync4_private.transport_validation t where t.owner=who and t.operation_id=op and t.request_digest=digest and t.verified) then return jsonb_build_object('kind','error','code','transport-incomplete'); end if;
  if (request->>'sourceCount')::bigint<>(select count(*) from nexus_sync4_private.frame_sources where owner=who and operation_id=op)
    or (request->>'referenceCount')::bigint<>(select count(*) from nexus_sync4_private.frame_references where owner=who and operation_id=op)
    or (request->>'sourceBytes')::bigint<>(select coalesce(sum(byte_length),0) from nexus_sync4_private.frame_sources where owner=who and operation_id=op)
  then return jsonb_build_object('kind','error','code','parser-incomplete'); end if;
  semantic:=nexus_sync4_private.validate_semantic_units(jsonb_build_object('operationId',op,'requestDigest',digest));
  if semantic->>'kind'<>'semantic-valid' then return semantic; end if;
  update nexus_sync4_private.frame_validation set state='references-valid',source_count=(request->>'sourceCount')::bigint,
    reference_count=(request->>'referenceCount')::bigint,source_bytes=(request->>'sourceBytes')::bigint,import_bytes=(request->>'importBytes')::bigint
    where owner=who and operation_id=op;
  return jsonb_build_object('kind','parser-recorded','operationId',op,'requestDigest',digest);
end $fn$;

revoke all on function nexus_sync4_private.begin_validation(jsonb),nexus_sync4_private.validate_semantic_units(jsonb),nexus_sync4_private.finish_validation(jsonb),nexus_sync4_private.record_parser_result(jsonb) from public,anon,authenticated,service_role;
grant execute on function nexus_sync4_private.begin_validation(jsonb),nexus_sync4_private.validate_semantic_units(jsonb),nexus_sync4_private.finish_validation(jsonb),nexus_sync4_private.record_parser_result(jsonb) to nexus_sync_writer;
commit;
