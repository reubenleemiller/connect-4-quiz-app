-- QuizFour multiplayer setup
-- Before running: Supabase Dashboard → Authentication → Providers → enable Anonymous sign-ins.
-- Then run this entire script in the SQL Editor for the connect-4-quiz-app project.

create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_id uuid not null references auth.users(id) on delete cascade,
  guest_id uuid references auth.users(id) on delete set null,
  status text not null default 'waiting' check (status in ('waiting', 'active', 'complete')),
  game_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.game_rooms enable row level security;
grant select on table public.game_rooms to authenticated;

drop policy if exists "Players can read their own game rooms" on public.game_rooms;
create policy "Players can read their own game rooms"
on public.game_rooms for select to authenticated
using ((select auth.uid()) = host_id or (select auth.uid()) = guest_id);

-- Remove earlier function signatures before installing the current room-code version.
-- These statements leave existing rooms and game data untouched.
drop function if exists public.create_or_join_game(text, jsonb);
drop function if exists public.create_or_join_game(text, text, jsonb);
drop function if exists public.submit_game_state(uuid, jsonb);

create or replace function public.create_or_join_game(
  p_room_code text default null,
  p_match_mode text default 'random',
  p_initial_state jsonb default '{}'::jsonb
)
returns table (room_id uuid, room_code text, seat smallint, room_status text, game_state jsonb)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.game_rooms;
  v_code text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if v_user_id is null then
    raise exception 'You must be signed in to join a game.';
  end if;

  if p_match_mode not in ('random', 'create', 'code') then
    raise exception 'Unknown matchmaking mode.';
  end if;

  if p_match_mode = 'code' and (p_room_code is null or length(trim(p_room_code)) = 0) then
    raise exception 'Enter a room code to join a private room.';
  end if;

  if p_room_code is not null and length(trim(p_room_code)) > 0 then
    select * into v_room from public.game_rooms
    where code = upper(trim(p_room_code))
    for update;

    if not found then
      raise exception 'That room code does not exist.';
    end if;
    if v_room.host_id = v_user_id then
      return query select v_room.id, v_room.code, 0::smallint, v_room.status, v_room.game_state;
      return;
    end if;
    if v_room.guest_id = v_user_id then
      return query select v_room.id, v_room.code, 1::smallint, v_room.status, v_room.game_state;
      return;
    end if;
    if v_room.guest_id is not null then
      raise exception 'That room is already full.';
    end if;

    update public.game_rooms
    set guest_id = v_user_id, status = 'active', updated_at = now()
    where id = v_room.id
    returning * into v_room;
    return query select v_room.id, v_room.code, 1::smallint, v_room.status, v_room.game_state;
    return;
  end if;

  if p_match_mode = 'random' then
    -- Random matching: atomically claim the oldest available room, if one exists.
    select * into v_room from public.game_rooms
    where status = 'waiting' and guest_id is null and host_id <> v_user_id
    order by created_at
    for update skip locked
    limit 1;

    if found then
      update public.game_rooms
      set guest_id = v_user_id, status = 'active', updated_at = now()
      where id = v_room.id
      returning * into v_room;
      return query select v_room.id, v_room.code, 1::smallint, v_room.status, v_room.game_state;
      return;
    end if;
  end if;

  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '')
    into v_code from generate_series(1, 6);
    exit when not exists (select 1 from public.game_rooms where code = v_code);
  end loop;

  insert into public.game_rooms (code, host_id, game_state)
  values (v_code, v_user_id, p_initial_state)
  returning * into v_room;
  return query select v_room.id, v_room.code, 0::smallint, v_room.status, v_room.game_state;
end;
$$;

create or replace function public.submit_game_state(
  p_room_id uuid,
  p_game_state jsonb
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.game_rooms
  set game_state = p_game_state, updated_at = now(),
      status = case when p_game_state->>'phase' = 'complete' then 'complete' else status end
  where id = p_room_id
    and (host_id = auth.uid() or guest_id = auth.uid());

  if not found then
    raise exception 'You are not a player in this game.';
  end if;
end;
$$;

revoke all on function public.create_or_join_game(text, text, jsonb) from public;
revoke all on function public.submit_game_state(uuid, jsonb) from public;
grant execute on function public.create_or_join_game(text, text, jsonb) to authenticated;
grant execute on function public.submit_game_state(uuid, jsonb) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_rooms'
  ) then
    alter publication supabase_realtime add table public.game_rooms;
  end if;
end $$;
