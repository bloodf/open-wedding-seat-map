-- Purpose: Creates encrypted collaboration persistence for Wedding Seat Map.
-- Public API: public maps, map_links, map_sessions, map_updates tables plus
-- authorize_map_link, append_map_update_via_session, and list_map_updates_via_session RPCs.
-- Upstream deps: Supabase auth.uid(), pgcrypto, Postgres RLS, optional Supabase Realtime private channels.
-- Downstream consumers: src/services/supabase, src/collaboration, future Edge Functions.
-- Failure modes: anonymous capability access must go through the SECURITY DEFINER RPCs or a server
-- edge function that mints a scoped JWT. Do not expose map_links.token_hash through direct selects.
-- Performance: indexes cover owner lookup, active links, session lookup, and update catch-up order.

create extension if not exists pgcrypto;

do $$
begin
  create type public.map_capability_role as enum ('view', 'edit');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.maps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  title text not null default 'Untitled seating map',
  encrypted_document jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.map_links (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  role public.map_capability_role not null,
  token_hash text not null,
  token_hint text,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint map_links_token_hash_length check (length(token_hash) >= 32),
  constraint map_links_unique_token unique (map_id, token_hash)
);

create table if not exists public.map_sessions (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  link_id uuid references public.map_links(id) on delete set null,
  role public.map_capability_role not null,
  client_id text,
  user_agent text,
  connected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.map_updates (
  id bigint generated always as identity primary key,
  map_id uuid not null references public.maps(id) on delete cascade,
  session_id uuid references public.map_sessions(id) on delete set null,
  encrypted_update jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists maps_owner_id_idx on public.maps(owner_id);
create index if not exists map_links_active_idx on public.map_links(map_id, token_hash)
  where revoked_at is null;
create index if not exists map_sessions_map_id_idx on public.map_sessions(map_id, last_seen_at desc);
create index if not exists map_updates_map_id_id_idx on public.map_updates(map_id, id);

alter table public.maps enable row level security;
alter table public.map_links enable row level security;
alter table public.map_sessions enable row level security;
alter table public.map_updates enable row level security;

create policy "owners can read maps"
  on public.maps for select
  to authenticated
  using (owner_id = auth.uid());

create policy "owners can create maps"
  on public.maps for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "owners can update maps"
  on public.maps for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owners can delete maps"
  on public.maps for delete
  to authenticated
  using (owner_id = auth.uid());

create policy "owners can manage map links"
  on public.map_links for all
  to authenticated
  using (
    exists (
      select 1 from public.maps
      where maps.id = map_links.map_id
        and maps.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.maps
      where maps.id = map_links.map_id
        and maps.owner_id = auth.uid()
    )
  );

create policy "owners can read map sessions"
  on public.map_sessions for select
  to authenticated
  using (
    exists (
      select 1 from public.maps
      where maps.id = map_sessions.map_id
        and maps.owner_id = auth.uid()
    )
  );

create policy "owners can read map updates"
  on public.map_updates for select
  to authenticated
  using (
    exists (
      select 1 from public.maps
      where maps.id = map_updates.map_id
        and maps.owner_id = auth.uid()
    )
  );

create policy "owners can append map updates"
  on public.map_updates for insert
  to authenticated
  with check (
    exists (
      select 1 from public.maps
      where maps.id = map_updates.map_id
        and maps.owner_id = auth.uid()
    )
  );

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists maps_touch_updated_at on public.maps;
create trigger maps_touch_updated_at
  before update on public.maps
  for each row
  execute function public.touch_updated_at();

create or replace function public.authorize_map_link(
  p_map_id uuid,
  p_token_hash text,
  p_client_id text default null,
  p_user_agent text default null
)
returns table (
  session_id uuid,
  capability_role public.map_capability_role,
  capability_map_id uuid,
  capability_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.map_links%rowtype;
  v_session_id uuid;
begin
  if p_token_hash is null or length(p_token_hash) < 32 then
    raise exception 'invalid capability token' using errcode = '28000';
  end if;

  select *
    into v_link
    from public.map_links
   where map_id = p_map_id
     and token_hash = p_token_hash
     and revoked_at is null
     and (expires_at is null or expires_at > now())
   limit 1;

  if not found then
    raise exception 'invalid capability token' using errcode = '28000';
  end if;

  insert into public.map_sessions (map_id, link_id, role, client_id, user_agent)
  values (v_link.map_id, v_link.id, v_link.role, p_client_id, p_user_agent)
  returning id into v_session_id;

  return query
    select v_session_id, v_link.role, v_link.map_id, v_link.expires_at;
end
$$;

create or replace function public.append_map_update_via_session(
  p_session_id uuid,
  p_encrypted_update jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.map_sessions%rowtype;
  v_update_id bigint;
begin
  select sessions.*
    into v_session
    from public.map_sessions sessions
    left join public.map_links links on links.id = sessions.link_id
   where sessions.id = p_session_id
     and sessions.revoked_at is null
     and sessions.role = 'edit'
     and (links.id is null or links.revoked_at is null)
     and (links.id is null or links.expires_at is null or links.expires_at > now())
   limit 1;

  if not found then
    raise exception 'session cannot edit this map' using errcode = '42501';
  end if;

  insert into public.map_updates (map_id, session_id, encrypted_update)
  values (v_session.map_id, v_session.id, p_encrypted_update)
  returning id into v_update_id;

  update public.map_sessions
     set last_seen_at = now()
   where id = p_session_id;

  return v_update_id;
end
$$;

create or replace function public.list_map_updates_via_session(
  p_session_id uuid,
  p_after_update_id bigint default 0
)
returns table (
  update_id bigint,
  update_session_id uuid,
  encrypted_update jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.map_sessions%rowtype;
begin
  select sessions.*
    into v_session
    from public.map_sessions sessions
    left join public.map_links links on links.id = sessions.link_id
   where sessions.id = p_session_id
     and sessions.revoked_at is null
     and (sessions.role = 'view' or sessions.role = 'edit')
     and (links.id is null or links.revoked_at is null)
     and (links.id is null or links.expires_at is null or links.expires_at > now())
   limit 1;

  if not found then
    raise exception 'session cannot view this map' using errcode = '42501';
  end if;

  update public.map_sessions
     set last_seen_at = now()
   where id = p_session_id;

  return query
    select updates.id, updates.session_id, updates.encrypted_update, updates.created_at
      from public.map_updates updates
     where updates.map_id = v_session.map_id
       and updates.id > coalesce(p_after_update_id, 0)
     order by updates.id asc;
end
$$;

grant execute on function public.authorize_map_link(uuid, text, text, text) to anon, authenticated;
grant execute on function public.append_map_update_via_session(uuid, jsonb) to anon, authenticated;
grant execute on function public.list_map_updates_via_session(uuid, bigint) to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.map_updates;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;

comment on table public.map_links is
  'Capability links store SHA-256 token hashes only. Raw tokens live in share URLs and are never persisted.';

comment on table public.map_updates is
  'Append-only encrypted Yjs/document updates. Clients decrypt with the URL key fragment, not with Supabase.';

comment on function public.authorize_map_link(uuid, text, text, text) is
  'Verifies a hashed anonymous capability and creates a scoped map session. Use this RPC or an Edge Function before Realtime join.';

-- Private Realtime guidance:
-- Use client.channel('map:<map_id>', { config: { private: true } }) and enable
-- Supabase Realtime Authorization before production sharing. Create policies on
-- realtime.messages that validate the caller has a current map session or a JWT
-- minted by an Edge Function after authorize_map_link succeeds. Topic format
-- should stay map:<map_id>; never include raw capability tokens or document keys
-- in Realtime topics, presence state, logs, or database rows.
