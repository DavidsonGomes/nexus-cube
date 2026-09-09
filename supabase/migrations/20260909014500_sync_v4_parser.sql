-- LOCAL WIP. Incremental wire parser, separate from semantic projection.
-- It consumes bounded fragments and never concatenates the account stream.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create table nexus_sync4_private.parser_state (
  owner uuid not null, operation_id uuid not null,
  request_digest text not null check(request_digest ~ '^[0-9a-f]{64}$'),
  next_index bigint not null default 0 check(next_index>=0),
  depth integer not null default 0 check(depth>=0 and depth<=256),
  stack text not null default '',
  in_string boolean not null default false,
  escaped boolean not null default false,
  unicode_left integer not null default 0 check(unicode_left between 0 and 4),
  root_seen boolean not null default false,
  syntax_valid boolean not null default false,
  rejected boolean not null default false,
  primary key(owner,operation_id),
  foreign key(owner,operation_id) references nexus_sync4_private.stages(owner,operation_id)
);
alter table nexus_sync4_private.parser_state enable row level security;
alter table nexus_sync4_private.parser_state force row level security;
create policy owner_rows on nexus_sync4_private.parser_state to nexus_sync_writer
  using(owner=(select nexus_private.require_owner())) with check(owner=(select nexus_private.require_owner()));
revoke all on nexus_sync4_private.parser_state from public,anon,authenticated,service_role;
grant select,insert,update,delete on nexus_sync4_private.parser_state to nexus_sync_writer;

create function nexus_sync4_private.advance_parser(request jsonb) returns jsonb
language plpgsql set search_path='' as $fn$
declare who uuid:=nexus_private.require_owner(); stage nexus_sync4_private.stages; p nexus_sync4_private.parser_state; part nexus_sync4_private.fragments;
  op uuid; digest text; step integer; pos integer; ch text; expected bigint; top text; max_steps integer:=4;
begin
  if not nexus_sync4_private.exact_fields(request,array['operationId','requestDigest'])
    or not nexus_sync4_private.uuid_text(request->'operationId') or not nexus_sync4_private.hex_hash(request->'requestDigest') then
    return jsonb_build_object('kind','error','code','invalid');
  end if;
  op:=(request->>'operationId')::uuid;digest:=request->>'requestDigest';
  select * into stage from nexus_sync4_private.stages where owner=who and operation_id=op for update;
  if not found then return jsonb_build_object('kind','error','code','not-found'); end if;
  if stage.request_digest<>digest then return jsonb_build_object('kind','error','code','request-mismatch'); end if;
  if stage.state<>'receiving' or stage.expires_at<=floor(extract(epoch from clock_timestamp()))::bigint then return jsonb_build_object('kind','error','code','stage-expired'); end if;
  insert into nexus_sync4_private.parser_state(owner,operation_id,request_digest) values(who,op,digest) on conflict do nothing;
  select * into p from nexus_sync4_private.parser_state where owner=who and operation_id=op for update;
  if p.rejected then return jsonb_build_object('kind','error','code','syntax-invalid'); end if;
  if p.syntax_valid then return jsonb_build_object('kind','syntax-valid','operationId',op,'nextIndex',p.next_index); end if;
  for step in 0..max_steps-1 loop
    exit when p.next_index>=stage.fragment_count;
    select * into part from nexus_sync4_private.fragments where owner=who and operation_id=op and index=p.next_index;
    exit when not found;
    expected:=least(stage.fragment_bytes::bigint,stage.total_bytes-(p.next_index*stage.fragment_bytes));
    if part.byte_offset<>p.next_index*stage.fragment_bytes or octet_length(part.payload)<>expected
      or part.payload ~ '[^ -~]' or encode(sha256(convert_to(part.payload,'UTF8')),'hex')<>part.sha256 then
      update nexus_sync4_private.parser_state set rejected=true where owner=who and operation_id=op;
      return jsonb_build_object('kind','error','code','integrity-mismatch');
    end if;
    for pos in 1..char_length(part.payload) loop
      ch:=substr(part.payload,pos,1);
      if p.in_string then
        if p.unicode_left>0 then
          if ch !~ '^[0-9a-fA-F]$' then p.rejected:=true; exit; end if;
          p.unicode_left:=p.unicode_left-1;
        elsif p.escaped then
          if ch='u' then p.unicode_left:=4; elsif ch not in ('"','\\','/','b','f','n','r','t') then p.rejected:=true; exit; end if;
          p.escaped:=false;
        elsif ch='\\' then p.escaped:=true;
        elsif ch='"' then p.in_string:=false;
        elsif ascii(ch)<32 then p.rejected:=true; exit;
        end if;
      elsif ch='"' then p.in_string:=true;
      elsif ch in ('{','[') then
        if p.depth=0 and p.root_seen then p.rejected:=true; exit; end if;
        p.root_seen:=true;p.depth:=p.depth+1;p.stack:=p.stack||ch;
        if p.depth>256 then p.rejected:=true; exit; end if;
      elsif ch in ('}',']') then
        if p.depth=0 then p.rejected:=true; exit; end if;
        top:=right(p.stack,1);
        if (ch=']' and top<>'[') or (ch='}' and top<>'{') then p.rejected:=true; exit; end if;
        p.stack:=left(p.stack,length(p.stack)-1);p.depth:=p.depth-1;
      elsif ch in (chr(9),chr(10),chr(13),' ') then p.rejected:=true; exit;
      end if;
    end loop;
    if p.rejected then update nexus_sync4_private.parser_state set rejected=true where owner=who and operation_id=op; return jsonb_build_object('kind','error','code','syntax-invalid'); end if;
    p.next_index:=p.next_index+1;
  end loop;
  if p.next_index=stage.fragment_count then
    if p.depth<>0 or p.in_string or p.escaped or p.unicode_left<>0 or not p.root_seen then p.rejected:=true;
    else p.syntax_valid:=true; end if;
  end if;
  update nexus_sync4_private.parser_state set next_index=p.next_index,depth=p.depth,stack=p.stack,in_string=p.in_string,escaped=p.escaped,
    unicode_left=p.unicode_left,root_seen=p.root_seen,syntax_valid=p.syntax_valid,rejected=p.rejected where owner=who and operation_id=op;
  return jsonb_build_object('kind',case when p.rejected then 'error' when p.syntax_valid then 'syntax-valid' else 'syntax-pending' end,
    'code',case when p.rejected then 'syntax-invalid' else null end,'operationId',op,'nextIndex',p.next_index);
end $fn$;
revoke all on function nexus_sync4_private.advance_parser(jsonb) from public,anon,authenticated,service_role;
grant execute on function nexus_sync4_private.advance_parser(jsonb) to nexus_sync_writer;
commit;
