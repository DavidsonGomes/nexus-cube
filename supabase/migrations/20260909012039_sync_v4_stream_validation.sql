-- LOCAL ONLY. Incremental transport integrity primitives, not a schema validator
-- or a public finalize RPC. FIPS 180-4 sections 4.1.2, 5.1.1 and 6.2.
-- Every materialized buffer is <= 32896 bytes; the account is never concatenated.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create type nexus_sync4_private.sha256_state as (words bigint[],tail bytea,total_bytes bigint);

create function nexus_sync4_private.sha256_words_valid(words bigint[]) returns boolean
language sql immutable set search_path='' as $fn$
  select coalesce(array_ndims(words)=1 and array_lower(words,1)=1 and array_length(words,1)=8
    and not exists(select 1 from unnest(words) word where word is null or word<0 or word>4294967295),false)
$fn$;

create function nexus_sync4_private.sha256_init() returns nexus_sync4_private.sha256_state
language sql immutable set search_path='' as $fn$
  select row(array[1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225]::bigint[],''::bytea,0::bigint)::nexus_sync4_private.sha256_state
$fn$;

create function nexus_sync4_private.sha256_blocks(words bigint[],blocks bytea) returns bigint[]
language plpgsql immutable set search_path='' as $fn$
declare
  k constant bigint[]:=array[
    1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,
    3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,
    3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,
    2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,
    666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,
    2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,
    430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,
    1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];
  mask constant bigint:=4294967295;
  h bigint[]:=words; w bigint[]:=array_fill(0::bigint,array[64]);
  a bigint;b bigint;c bigint;d bigint;e bigint;f bigint;g bigint;z bigint;
  s0 bigint;s1 bigint;t1 bigint;t2 bigint;x bigint;y bigint;
  pos integer:=0;i integer;off integer;n integer;
begin
  n:=octet_length(blocks);
  if not nexus_sync4_private.sha256_words_valid(h) or n is null or n>32896 or n%64<>0 then
    raise exception 'Invalid bounded SHA block state' using errcode='22023';
  end if;
  while pos<n loop
    for i in 1..16 loop
      off:=pos+(i-1)*4;
      w[i]:=(get_byte(blocks,off)::bigint<<24)|(get_byte(blocks,off+1)::bigint<<16)|(get_byte(blocks,off+2)::bigint<<8)|get_byte(blocks,off+3)::bigint;
    end loop;
    for i in 17..64 loop
      x:=w[i-15];y:=w[i-2];
      s0:=(((x>>7)|(x<<25)) # ((x>>18)|(x<<14)) # (x>>3)) & mask;
      s1:=(((y>>17)|(y<<15)) # ((y>>19)|(y<<13)) # (y>>10)) & mask;
      w[i]:=(w[i-16]+s0+w[i-7]+s1)&mask;
    end loop;
    a:=h[1];b:=h[2];c:=h[3];d:=h[4];e:=h[5];f:=h[6];g:=h[7];z:=h[8];
    for i in 1..64 loop
      s1:=(((e>>6)|(e<<26)) # ((e>>11)|(e<<21)) # ((e>>25)|(e<<7)))&mask;
      t1:=(z+s1+((e&f)#((~e)&g))+k[i]+w[i])&mask;
      s0:=(((a>>2)|(a<<30)) # ((a>>13)|(a<<19)) # ((a>>22)|(a<<10)))&mask;
      t2:=(s0+((a&b)#(a&c)#(b&c)))&mask;
      z:=g;g:=f;f:=e;e:=(d+t1)&mask;d:=c;c:=b;b:=a;a:=(t1+t2)&mask;
    end loop;
    h:=array[(h[1]+a)&mask,(h[2]+b)&mask,(h[3]+c)&mask,(h[4]+d)&mask,(h[5]+e)&mask,(h[6]+f)&mask,(h[7]+g)&mask,(h[8]+z)&mask];
    pos:=pos+64;
  end loop;
  return h;
end $fn$;

create function nexus_sync4_private.sha256_state_valid(value nexus_sync4_private.sha256_state) returns boolean
language sql immutable set search_path='' as $fn$
  select coalesce(nexus_sync4_private.sha256_words_valid((value).words)
    and octet_length((value).tail)<64 and (value).total_bytes between 0 and 9007199254740991
    and (value).total_bytes%64=octet_length((value).tail),false)
$fn$;

create function nexus_sync4_private.sha256_update(value nexus_sync4_private.sha256_state,payload bytea)
returns nexus_sync4_private.sha256_state language plpgsql immutable set search_path='' as $fn$
declare combined bytea; consumed integer; n integer:=octet_length(payload); result nexus_sync4_private.sha256_state;
begin
  if not nexus_sync4_private.sha256_state_valid(value) or n is null or n>32768
    or value.total_bytes>9007199254740991-n then
    raise exception 'Invalid bounded SHA update' using errcode='22023';
  end if;
  combined:=value.tail||payload;consumed:=(octet_length(combined)/64)*64;
  result.words:=nexus_sync4_private.sha256_blocks(value.words,substring(combined from 1 for consumed));
  result.tail:=substring(combined from consumed+1);result.total_bytes:=value.total_bytes+n;
  return result;
end $fn$;

create function nexus_sync4_private.sha256_final(value nexus_sync4_private.sha256_state) returns text
language plpgsql immutable set search_path='' as $fn$
declare padding bytea; zero_count integer; words bigint[]; result text:='';word bigint;
begin
  if not nexus_sync4_private.sha256_state_valid(value) then raise exception 'Invalid SHA final state' using errcode='22023'; end if;
  zero_count:=(55-octet_length(value.tail)+64)%64;
  padding:=value.tail||decode('80','hex')||decode(repeat('00',zero_count),'hex')||int8send(value.total_bytes*8);
  words:=nexus_sync4_private.sha256_blocks(value.words,padding);
  foreach word in array words loop result:=result||lpad(to_hex(word),8,'0');end loop;
  return result;
end $fn$;

revoke all on type nexus_sync4_private.sha256_state from public,anon,authenticated,service_role;
grant usage on type nexus_sync4_private.sha256_state to nexus_sync_writer;
revoke all on function nexus_sync4_private.sha256_words_valid(bigint[]),nexus_sync4_private.sha256_init(),
  nexus_sync4_private.sha256_blocks(bigint[],bytea),nexus_sync4_private.sha256_state_valid(nexus_sync4_private.sha256_state),
  nexus_sync4_private.sha256_update(nexus_sync4_private.sha256_state,bytea),nexus_sync4_private.sha256_final(nexus_sync4_private.sha256_state)
  from public,anon,authenticated,service_role;
grant execute on function nexus_sync4_private.sha256_words_valid(bigint[]),nexus_sync4_private.sha256_init(),
  nexus_sync4_private.sha256_blocks(bigint[],bytea),nexus_sync4_private.sha256_state_valid(nexus_sync4_private.sha256_state),
  nexus_sync4_private.sha256_update(nexus_sync4_private.sha256_state,bytea),nexus_sync4_private.sha256_final(nexus_sync4_private.sha256_state)
  to nexus_sync_writer;
-- Transport checkpoint only. A verified hash is NOT a schema/source/refs seal.
-- No head/frame/receipt is changed by this helper and it has no public RPC.
create table nexus_sync4_private.transport_validation (
  owner uuid not null,
  operation_id uuid not null,
  request_digest text not null check(request_digest ~ '^[0-9a-f]{64}$'),
  next_index bigint not null default 0 check(next_index>=0),
  received_bytes bigint not null default 0 check(received_bytes>=0),
  hash_state nexus_sync4_private.sha256_state not null default nexus_sync4_private.sha256_init()
    check(nexus_sync4_private.sha256_state_valid(hash_state)),
  verified boolean not null default false,
  primary key(owner,operation_id),
  foreign key(owner,operation_id) references nexus_sync4_private.stages(owner,operation_id)
);
alter table nexus_sync4_private.transport_validation enable row level security;
alter table nexus_sync4_private.transport_validation force row level security;
create policy owner_rows on nexus_sync4_private.transport_validation to nexus_sync_writer
  using(owner=(select nexus_private.require_owner())) with check(owner=(select nexus_private.require_owner()));
revoke all on nexus_sync4_private.transport_validation from public,anon,authenticated,service_role;
grant select,insert,update,delete on nexus_sync4_private.transport_validation to nexus_sync_writer;

create function nexus_sync4_private.discard_terminal_transport() returns trigger
language plpgsql set search_path='' as $fn$
begin
  -- Cancel/expiry cleanup changes stage state under its existing owner lock.
  -- Keep only the operation marker; parser/SHA state is not historical evidence.
  if new.state<>'receiving' then
    delete from nexus_sync4_private.transport_validation where owner=new.owner and operation_id=new.operation_id;
  end if;
  return new;
end $fn$;
revoke all on function nexus_sync4_private.discard_terminal_transport() from public,anon,authenticated,service_role;
grant execute on function nexus_sync4_private.discard_terminal_transport() to nexus_sync_writer;
create trigger nexus_sync4_discard_terminal_transport after update of state on nexus_sync4_private.stages
for each row execute function nexus_sync4_private.discard_terminal_transport();

create function nexus_sync4_private.advance_transport(request jsonb) returns jsonb
language plpgsql set search_path='' as $fn$
declare who uuid:=nexus_private.require_owner();stage nexus_sync4_private.stages;
  progress nexus_sync4_private.transport_validation;part nexus_sync4_private.fragments;
  op uuid;step integer;expected_length bigint;
begin
  if not nexus_sync4_private.exact_fields(request,array['operationId','requestDigest'])
    or not nexus_sync4_private.uuid_text(request->'operationId')
    or not nexus_sync4_private.hex_hash(request->'requestDigest') then
    return jsonb_build_object('kind','error','code','invalid');
  end if;
  op:=(request->>'operationId')::uuid;
  perform 1 from nexus_private.accounts where owner=who for update;
  select * into stage from nexus_sync4_private.stages where owner=who and operation_id=op for update;
  if not found then return jsonb_build_object('kind','error','code','not-found');end if;
  if stage.request_digest<>request->>'requestDigest' then return jsonb_build_object('kind','error','code','request-mismatch');end if;
  if stage.state<>'receiving' or stage.expires_at<=floor(extract(epoch from clock_timestamp()))::bigint then
    return jsonb_build_object('kind','error','code','stage-expired');
  end if;
  insert into nexus_sync4_private.transport_validation(owner,operation_id,request_digest) values(who,op,stage.request_digest) on conflict do nothing;
  select * into progress from nexus_sync4_private.transport_validation where owner=who and operation_id=op for update;
  if progress.request_digest<>stage.request_digest or progress.received_bytes<>(progress.hash_state).total_bytes
    or progress.next_index>stage.fragment_count or progress.received_bytes>stage.total_bytes then
    raise exception 'Invalid transport checkpoint' using errcode='22000';
  end if;
  if not progress.verified then
    -- Fixed work quantum, not a data cap. No caller chooses the cursor or hash.
    for step in 1..4 loop
      exit when progress.next_index=stage.fragment_count;
      select * into part from nexus_sync4_private.fragments where owner=who and operation_id=op and index=progress.next_index;
      exit when not found; -- gap retains later fragments without hashing them early
      expected_length:=least(stage.fragment_bytes::bigint,stage.total_bytes-progress.received_bytes);
      if part.byte_offset<>progress.received_bytes or part.byte_offset<>part.index*stage.fragment_bytes
        or octet_length(part.payload)<>expected_length or part.payload ~ '[^ -~]'
        or encode(sha256(convert_to(part.payload,'UTF8')),'hex')<>part.sha256 then
        return jsonb_build_object('kind','error','code','integrity-mismatch');
      end if;
      progress.hash_state:=nexus_sync4_private.sha256_update(progress.hash_state,convert_to(part.payload,'UTF8'));
      progress.next_index:=progress.next_index+1;progress.received_bytes:=progress.received_bytes+expected_length;
    end loop;
    if progress.next_index=stage.fragment_count then
      if progress.received_bytes<>stage.total_bytes
        or (select count(*) from nexus_sync4_private.fragments where owner=who and operation_id=op)<>stage.fragment_count
        or nexus_sync4_private.sha256_final(progress.hash_state)<>stage.envelope->'manifest'->>'sha256' then
        return jsonb_build_object('kind','error','code','integrity-mismatch');
      end if;
      progress.verified:=true;
    end if;
    -- Temporal authorization linearizes here, under the stage lock, immediately
    -- before persisting this bounded step. Transaction completion is not a lease.
    if stage.expires_at<=floor(extract(epoch from clock_timestamp()))::bigint then
      return jsonb_build_object('kind','error','code','stage-expired');
    end if;
    update nexus_sync4_private.transport_validation set next_index=progress.next_index,received_bytes=progress.received_bytes,
      hash_state=progress.hash_state,verified=progress.verified where owner=who and operation_id=op;
  end if;
  return jsonb_build_object('kind',case when progress.verified then 'transport-verified' else 'transport-pending' end,
    'operationId',op,'requestDigest',stage.request_digest,'nextIndex',progress.next_index,'receivedBytes',progress.received_bytes);
end $fn$;
revoke all on function nexus_sync4_private.advance_transport(jsonb) from public,anon,authenticated,service_role;
grant execute on function nexus_sync4_private.advance_transport(jsonb) to nexus_sync_writer;
commit;
