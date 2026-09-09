-- LOCAL WIP. Links the semantic cursor journal to the validation ledger and
-- adds the private commit/CAS for validated frames. No new public RPC here;
-- both entry points stay writer-only until independent acceptance.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

grant update on nexus_sync4_private.heads to nexus_sync_writer;

-- Ties parser_events to frame_sources/frame_batches/frame_references and then
-- records the parser result with counts computed from the tables, never from
-- a client assertion. Only importBytes is parser-owned input.
create function nexus_sync4_private.link_parser_ledger(request jsonb) returns jsonb
language plpgsql set search_path='' as $fn$
declare who uuid:=nexus_private.require_owner(); p nexus_sync4_private.parser_state; stage nexus_sync4_private.stages;
  op uuid; digest text; end_seq bigint; end_offset bigint; source_total bigint; ref_total bigint; source_bytes_total bigint;
begin
  if not nexus_sync4_private.exact_fields(request,array['operationId','requestDigest','importBytes'])
    or not nexus_sync4_private.uuid_text(request->'operationId') or not nexus_sync4_private.hex_hash(request->'requestDigest')
    or not nexus_sync4_private.safe_integer(request->'importBytes') then
    return jsonb_build_object('kind','error','code','invalid');
  end if;
  op:=(request->>'operationId')::uuid; digest:=request->>'requestDigest';
  select * into p from nexus_sync4_private.parser_state where owner=who and operation_id=op for update;
  if not found or p.request_digest<>digest then return jsonb_build_object('kind','error','code','not-found'); end if;
  if p.rejected then return jsonb_build_object('kind','error','code','syntax-invalid'); end if;
  if not p.syntax_valid then return jsonb_build_object('kind','error','code','syntax-incomplete'); end if;
  select * into stage from nexus_sync4_private.stages where owner=who and operation_id=op;
  if not found or stage.state<>'receiving' then return jsonb_build_object('kind','error','code','stage-terminal'); end if;
  if stage.expires_at<=floor(extract(epoch from clock_timestamp()))::bigint then return jsonb_build_object('kind','error','code','stage-expired'); end if;
  if not exists(select 1 from nexus_sync4_private.transport_validation t where t.owner=who and t.operation_id=op and t.request_digest=digest and t.verified) then
    return jsonb_build_object('kind','error','code','transport-incomplete');
  end if;
  select e.sequence_no,e.byte_offset into end_seq,end_offset from nexus_sync4_private.parser_events e
    where e.owner=who and e.operation_id=op and e.event_kind='end';
  if end_seq is null or end_offset<>stage.total_bytes
    or end_seq<>(select max(sequence_no) from nexus_sync4_private.parser_events where owner=who and operation_id=op) then
    return jsonb_build_object('kind','error','code','journal-incomplete');
  end if;
  if exists(select 1 from nexus_sync4_private.parser_events e where e.owner=who and e.operation_id=op
      and e.event_kind in ('batch-begin','batch-record','batch-closed') and (e.batch_id is null or e.batch_id='')) then
    return jsonb_build_object('kind','error','code','batch-event-invalid');
  end if;
  if exists(
    select 1 from nexus_sync4_private.parser_events e where e.owner=who and e.operation_id=op
      and e.event_kind in ('batch-begin','batch-record','batch-closed')
    group by e.batch_id
    having count(*) filter (where e.event_kind='batch-begin')<>1
      or count(*) filter (where e.event_kind='batch-closed')<>1
      or min(e.sequence_no) filter (where e.event_kind='batch-begin')
        >coalesce(min(e.sequence_no) filter (where e.event_kind='batch-record'),9223372036854775807)
      or max(e.sequence_no) filter (where e.event_kind='batch-closed')
        <coalesce(max(e.sequence_no) filter (where e.event_kind='batch-record'),-1)
      or min(e.sequence_no) filter (where e.event_kind='batch-begin')
        >max(e.sequence_no) filter (where e.event_kind='batch-closed')) then
    return jsonb_build_object('kind','error','code','batch-order-invalid');
  end if;
  if exists(select 1 from nexus_sync4_private.parser_events e where e.owner=who and e.operation_id=op and e.event_kind='batch-begin'
      and not exists(select 1 from nexus_sync4_private.frame_batches b where b.owner=e.owner and b.operation_id=e.operation_id
        and b.batch_id=e.batch_id and b.source_id=coalesce(e.source_id,'')))
    or exists(select 1 from nexus_sync4_private.frame_batches b where b.owner=who and b.operation_id=op
      and not exists(select 1 from nexus_sync4_private.parser_events e where e.owner=b.owner and e.operation_id=b.operation_id
        and e.event_kind='batch-begin' and e.batch_id=b.batch_id))
    or exists(select 1 from nexus_sync4_private.frame_batches b where b.owner=who and b.operation_id=op
      and b.record_count<>(select count(*) from nexus_sync4_private.parser_events e where e.owner=b.owner
        and e.operation_id=b.operation_id and e.event_kind='batch-record' and e.batch_id=b.batch_id)) then
    return jsonb_build_object('kind','error','code','batch-ledger-mismatch');
  end if;
  if exists(select 1 from nexus_sync4_private.parser_events e where e.owner=who and e.operation_id=op and e.event_kind='source-closed'
      and not exists(select 1 from nexus_sync4_private.frame_sources s where s.owner=e.owner and s.operation_id=e.operation_id
        and s.source_id=e.source_id and s.verified))
    or exists(select 1 from nexus_sync4_private.frame_sources s where s.owner=who and s.operation_id=op
      and not exists(select 1 from nexus_sync4_private.parser_events e where e.owner=s.owner and e.operation_id=s.operation_id
        and e.event_kind='source-closed' and e.source_id=s.source_id)) then
    return jsonb_build_object('kind','error','code','source-ledger-mismatch');
  end if;
  if exists(select 1 from nexus_sync4_private.parser_events e where e.owner=who and e.operation_id=op
      and e.event_kind='projection-unit' and (e.record_key is null or e.record_key='')) then
    return jsonb_build_object('kind','error','code','projection-event-invalid');
  end if;
  if (select count(*) from nexus_sync4_private.parser_events e where e.owner=who and e.operation_id=op and e.event_kind='projection-unit')
      <>(select count(*) from nexus_sync4_private.frame_references r where r.owner=who and r.operation_id=op)
    or exists(select 1 from nexus_sync4_private.parser_events e where e.owner=who and e.operation_id=op and e.event_kind='projection-unit'
      and not exists(select 1 from nexus_sync4_private.frame_references r where r.owner=e.owner and r.operation_id=e.operation_id
        and r.source_id=coalesce(e.source_id,'') and r.batch_id=coalesce(e.batch_id,'')
        and r.record_key=e.record_key and r.ordinal=coalesce(e.ordinal,0))) then
    return jsonb_build_object('kind','error','code','reference-ledger-mismatch');
  end if;
  select count(*),coalesce(sum(byte_length),0) into source_total,source_bytes_total
    from nexus_sync4_private.frame_sources where owner=who and operation_id=op;
  select count(*) into ref_total from nexus_sync4_private.frame_references where owner=who and operation_id=op;
  return nexus_sync4_private.record_parser_result(jsonb_build_object('operationId',op,'requestDigest',digest,
    'sourceCount',source_total,'referenceCount',ref_total,'sourceBytes',source_bytes_total,
    'importBytes',(request->>'importBytes')::bigint));
end $fn$;

-- Private commit/CAS for a frame_validation in state validated. The head row is
-- the CAS anchor: epoch/revision must still equal the validated base, and the
-- update itself repeats the predicate so a concurrent commit cannot interleave.
create function nexus_sync4_private.commit_validated_frame(request jsonb) returns jsonb
language plpgsql set search_path='' as $fn$
declare who uuid:=nexus_private.require_owner(); v nexus_sync4_private.frame_validation; stage nexus_sync4_private.stages;
  frame nexus_sync4_private.frames; current4 nexus_sync4_private.heads; op uuid; digest text; new_revision bigint; copied bigint;
begin
  if not nexus_sync4_private.exact_fields(request,array['operationId','requestDigest'])
    or not nexus_sync4_private.uuid_text(request->'operationId') or not nexus_sync4_private.hex_hash(request->'requestDigest') then
    return jsonb_build_object('kind','error','code','invalid');
  end if;
  op:=(request->>'operationId')::uuid; digest:=request->>'requestDigest';
  perform 1 from nexus_private.accounts where owner=who for update;
  if not found then return jsonb_build_object('kind','error','code','upgrade-required'); end if;
  select * into frame from nexus_sync4_private.frames where owner=who and operation_id=op;
  if found then
    if frame.request_digest<>digest then return jsonb_build_object('kind','error','code','request-mismatch'); end if;
    return nexus_sync4_private.frame_receipt(frame);
  end if;
  select * into stage from nexus_sync4_private.stages where owner=who and operation_id=op for update;
  if not found then return jsonb_build_object('kind','error','code','not-found'); end if;
  if stage.request_digest<>digest then return jsonb_build_object('kind','error','code','request-mismatch'); end if;
  if stage.state<>'receiving' or stage.expires_at<=floor(extract(epoch from clock_timestamp()))::bigint then
    return jsonb_build_object('kind','error','code','stage-expired');
  end if;
  if stage.envelope->'base'->>'domainVersion'<>'4' then return jsonb_build_object('kind','error','code','unsupported-version'); end if;
  select * into v from nexus_sync4_private.frame_validation where owner=who and operation_id=op for update;
  if not found or v.request_digest<>digest then return jsonb_build_object('kind','error','code','validation-missing'); end if;
  if v.state<>'validated' then return jsonb_build_object('kind','error','code','validation-incomplete'); end if;
  if not exists(select 1 from nexus_sync4_private.transport_validation t where t.owner=who and t.operation_id=op and t.request_digest=digest and t.verified) then
    return jsonb_build_object('kind','error','code','transport-incomplete');
  end if;
  select * into current4 from nexus_sync4_private.heads where owner=who for update;
  if not found then return jsonb_build_object('kind','error','code','unsupported-version'); end if;
  if current4.epoch<>v.base_epoch or current4.revision<>v.base_revision then
    return jsonb_build_object('kind','conflict','code','head-changed','operationId',op,'requestDigest',digest,
      'current',jsonb_build_object('domainVersion',4,'epoch',current4.epoch,'revision',current4.revision::text));
  end if;
  new_revision:=v.base_revision+1;
  insert into nexus_sync4_private.frames values(who,v.base_epoch,new_revision,op,digest,stage.envelope->'manifest') returning * into frame;
  insert into nexus_sync4_private.frame_parts
    select owner,v.base_epoch,new_revision,index,byte_offset,payload,sha256
    from nexus_sync4_private.fragments where owner=who and operation_id=op;
  get diagnostics copied=row_count;
  if copied<>stage.fragment_count then raise exception 'fragment copy incomplete' using errcode='55000'; end if;
  update nexus_sync4_private.heads set epoch=v.base_epoch,revision=new_revision
    where owner=who and epoch=v.base_epoch and revision=v.base_revision;
  if not found then raise exception 'head changed during commit' using errcode='55000'; end if;
  update nexus_sync4_private.stages set state='cancelled' where owner=who and operation_id=op;
  delete from nexus_sync4_private.fragments where owner=who and operation_id=op;
  return nexus_sync4_private.frame_receipt(frame);
end $fn$;

revoke all on function nexus_sync4_private.link_parser_ledger(jsonb),nexus_sync4_private.commit_validated_frame(jsonb) from public,anon,authenticated,service_role;
grant execute on function nexus_sync4_private.link_parser_ledger(jsonb),nexus_sync4_private.commit_validated_frame(jsonb) to nexus_sync_writer;
commit;
