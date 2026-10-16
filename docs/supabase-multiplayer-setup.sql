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

-- These columns are declared before the normal matchmaking function below so
-- its random queue can explicitly exclude Teacher Mode rooms.
create table if not exists public.teacher_classrooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  deck_state jsonb not null,
  deck_protected boolean not null default true,
  pairing text not null default 'both' check (pairing in ('both', 'private', 'random')),
  created_at timestamptz not null default now()
);

alter table public.game_rooms add column if not exists classroom_id uuid references public.teacher_classrooms(id) on delete cascade;
alter table public.game_rooms add column if not exists match_mode text not null default 'private' check (match_mode in ('private', 'random'));
alter table public.teacher_classrooms add column if not exists deck_protected boolean not null default true;

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
    where status = 'waiting' and guest_id is null and host_id <> v_user_id and classroom_id is null
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

-- Teacher Mode: a teacher owns an immutable deck definition and can share a
-- class link. Student game rooms point back to the classroom, so state syncs
-- cannot replace the teacher's deck with a different one.
create table if not exists public.teacher_classrooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  deck_state jsonb not null,
  deck_protected boolean not null default true,
  pairing text not null default 'both' check (pairing in ('both', 'private', 'random')),
  created_at timestamptz not null default now()
);

alter table public.game_rooms add column if not exists classroom_id uuid references public.teacher_classrooms(id) on delete cascade;
alter table public.game_rooms add column if not exists match_mode text not null default 'private' check (match_mode in ('private', 'random'));
alter table public.teacher_classrooms add column if not exists deck_protected boolean not null default true;
alter table public.teacher_classrooms enable row level security;

drop function if exists public.create_teacher_classroom(text, jsonb, text);
drop function if exists public.create_teacher_classroom(text, jsonb, text, boolean);
drop function if exists public.get_teacher_classroom(text);
drop function if exists public.create_or_join_teacher_game(text, text, text, jsonb);

create or replace function public.create_teacher_classroom(
  p_title text,
  p_deck_state jsonb,
  p_pairing text default 'both',
  p_protect_deck boolean default true
)
returns table (class_code text, title text, pairing text, deck_protected boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_class public.teacher_classrooms;
begin
  if v_user_id is null then raise exception 'You must be signed in to create a teacher link.'; end if;
  if p_pairing not in ('both', 'private', 'random') then raise exception 'Unknown student pairing option.'; end if;
  if p_protect_deck and coalesce(jsonb_array_length(p_deck_state->'questionBank'), 0) = 0 then raise exception 'Attach a question deck before creating a protected student link.'; end if;
  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '') into v_code from generate_series(1, 8);
    exit when not exists (select 1 from public.teacher_classrooms where code = v_code);
  end loop;
  insert into public.teacher_classrooms (code, teacher_id, title, deck_state, deck_protected, pairing)
  values (v_code, v_user_id, left(coalesce(nullif(trim(p_title), ''), 'QuizFour study deck'), 120), p_deck_state, p_protect_deck, p_pairing)
  returning * into v_class;
  return query select v_class.code, v_class.title, v_class.pairing, v_class.deck_protected;
end;
$$;

create or replace function public.get_teacher_classroom(p_class_code text)
returns table (class_code text, title text, pairing text, deck_protected boolean, deck_state jsonb)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'You must be signed in to open a teacher link.'; end if;
  return query
    select c.code, c.title, c.pairing, c.deck_protected, c.deck_state
    from public.teacher_classrooms c
    where c.code = upper(trim(p_class_code));
  if not found then raise exception 'That teacher link does not exist or has expired.'; end if;
end;
$$;

create or replace function public.create_or_join_teacher_game(
  p_class_code text,
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
  v_class public.teacher_classrooms;
  v_room public.game_rooms;
  v_code text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_state jsonb;
begin
  if v_user_id is null then raise exception 'You must be signed in to join a teacher game.'; end if;
  select * into v_class from public.teacher_classrooms where code = upper(trim(p_class_code));
  if not found then raise exception 'That teacher link does not exist or has expired.'; end if;
  if p_match_mode not in ('random', 'create', 'code') then raise exception 'Unknown matchmaking mode.'; end if;
  if p_match_mode in ('create', 'code') and v_class.pairing not in ('both', 'private') then raise exception 'This teacher only allows random pairing.'; end if;
  if p_match_mode = 'random' and v_class.pairing not in ('both', 'random') then raise exception 'This teacher only allows private study rooms.'; end if;
  if p_match_mode = 'code' and coalesce(trim(p_room_code), '') = '' then raise exception 'Enter a room code to join a private room.'; end if;

  if v_class.deck_protected then
    v_state := coalesce(p_initial_state, '{}'::jsonb) || jsonb_build_object(
      'questionBank', coalesce(v_class.deck_state->'questionBank', '[]'::jsonb),
      'deckTitle', coalesce(v_class.deck_state->>'deckTitle', v_class.title),
      'teacherMode', true,
      'deckProtected', true,
      'classroomTitle', v_class.title
    );
  else
    -- An unlocked teacher link still scopes matchmaking to this classroom,
    -- but each private room owns its own deck and sync state.
    v_state := coalesce(p_initial_state, '{}'::jsonb) || jsonb_build_object(
      'teacherMode', true,
      'deckProtected', false,
      'classroomTitle', v_class.title
    );
  end if;

  if p_room_code is not null and length(trim(p_room_code)) > 0 then
    select * into v_room from public.game_rooms
    where code = upper(trim(p_room_code)) and classroom_id = v_class.id
    for update;
    if not found then raise exception 'That private study room does not exist in this class.'; end if;
    if v_room.host_id = v_user_id then return query select v_room.id, v_room.code, 0::smallint, v_room.status, v_room.game_state; return; end if;
    if v_room.guest_id = v_user_id then return query select v_room.id, v_room.code, 1::smallint, v_room.status, v_room.game_state; return; end if;
    if v_room.guest_id is not null then raise exception 'That private study room is already full.'; end if;
    update public.game_rooms set guest_id = v_user_id, status = 'active', updated_at = now() where id = v_room.id returning * into v_room;
    return query select v_room.id, v_room.code, 1::smallint, v_room.status, v_room.game_state;
    return;
  end if;

  if p_match_mode = 'random' then
    select * into v_room from public.game_rooms
    where classroom_id = v_class.id and match_mode = 'random' and status = 'waiting' and guest_id is null and host_id <> v_user_id
    order by created_at for update skip locked limit 1;
    if found then
      update public.game_rooms set guest_id = v_user_id, status = 'active', updated_at = now() where id = v_room.id returning * into v_room;
      return query select v_room.id, v_room.code, 1::smallint, v_room.status, v_room.game_state;
      return;
    end if;
  end if;

  loop
    select string_agg(substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1), '') into v_code from generate_series(1, 6);
    exit when not exists (select 1 from public.game_rooms where code = v_code);
  end loop;
  insert into public.game_rooms (code, host_id, game_state, classroom_id, match_mode)
  values (v_code, v_user_id, v_state, v_class.id, case when p_match_mode = 'random' then 'random' else 'private' end)
  returning * into v_room;
  return query select v_room.id, v_room.code, 0::smallint, v_room.status, v_room.game_state;
end;
$$;

-- Reinstall this function after Teacher Mode so a synced classroom state
-- always receives the original deck fields from its teacher classroom.
create or replace function public.submit_game_state(p_room_id uuid, p_game_state jsonb)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.game_rooms r
  set game_state = p_game_state || jsonb_build_object(
        'questionBank', coalesce(c.deck_state->'questionBank', '[]'::jsonb),
        'deckTitle', coalesce(c.deck_state->>'deckTitle', c.title),
        'teacherMode', true,
        'classroomTitle', c.title
      ),
      updated_at = now(),
      status = case when p_game_state->>'phase' = 'complete' then 'complete' else r.status end
  from public.teacher_classrooms c
  where r.id = p_room_id and r.classroom_id = c.id and c.deck_protected
    and (r.host_id = auth.uid() or r.guest_id = auth.uid());
  if found then return; end if;

  update public.game_rooms r
  set game_state = p_game_state, updated_at = now(),
      status = case when p_game_state->>'phase' = 'complete' then 'complete' else r.status end
  from public.teacher_classrooms c
  where r.id = p_room_id and r.classroom_id = c.id and not c.deck_protected
    and (r.host_id = auth.uid() or r.guest_id = auth.uid());
  if found then return; end if;

  update public.game_rooms
  set game_state = p_game_state, updated_at = now(),
      status = case when p_game_state->>'phase' = 'complete' then 'complete' else status end
  where id = p_room_id and classroom_id is null
    and (host_id = auth.uid() or guest_id = auth.uid());
  if not found then raise exception 'You are not a player in this game.'; end if;
end;
$$;

revoke all on function public.create_teacher_classroom(text, jsonb, text) from public;
revoke all on function public.create_teacher_classroom(text, jsonb, text, boolean) from public;
revoke all on function public.get_teacher_classroom(text) from public;
revoke all on function public.create_or_join_teacher_game(text, text, text, jsonb) from public;
grant execute on function public.create_teacher_classroom(text, jsonb, text, boolean) to authenticated;
grant execute on function public.get_teacher_classroom(text) to authenticated;
grant execute on function public.create_or_join_teacher_game(text, text, text, jsonb) to authenticated;

-- Make the new RPC signatures available to Supabase's Data API immediately.
notify pgrst, 'reload schema';
