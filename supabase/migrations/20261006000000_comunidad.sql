-- Lectia · Comunidad
-- Perfiles, rachas de amigos, ligas semanales por divisiones y novedades con
-- "me gusta". No hay chat ni comentarios: las únicas interacciones entre
-- personas son la amistad (para ver rachas y novedades) y los "me gusta".
--
-- Todo el acceso pasa por funciones (RPC) con validación propia: las tablas
-- tienen RLS activado y ningún permiso directo para la app.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create or replace function public.valid_text_list(p text[], p_max_len int)
returns boolean
language sql
immutable
as $$
  select coalesce(bool_and(char_length(x) between 1 and p_max_len), true) from unnest(p) as x
$$;

-- Convierte un valor JSON a entero acotado (o devuelve el valor por defecto).
create or replace function public.json_int(p_value text, p_min int, p_max int, p_default int)
returns int
language plpgsql
immutable
as $$
begin
  if p_value is null or p_value !~ '^-?\d{1,12}(\.\d+)?$' then
    return p_default;
  end if;
  return greatest(p_min, least(p_max, floor(p_value::numeric)))::int;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  display_name text not null,
  avatar text not null default '📚',
  color text not null default 'gold',
  bio text not null default '',
  genres text[] not null default '{}',
  favorite_book text not null default '',
  favorite_authors text not null default '',
  reading_moment text not null default '',
  yearly_goal smallint not null default 12,
  -- Estadísticas que envía la app en cada sincronización.
  tz text not null default 'UTC',
  total_xp integer not null default 0,
  level smallint not null default 1,
  streak integer not null default 0,
  best_streak integer not null default 0,
  last_active_day date,
  books_finished integer not null default 0,
  books_this_year integer not null default 0,
  minutes_total integer not null default 0,
  achievements text[] not null default '{}',
  reading_now jsonb,
  -- Última división en la que compitió (la calcula el servidor).
  division smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_.]{3,20}$'),
  constraint profiles_display_name_len check (char_length(btrim(display_name)) between 1 and 40),
  constraint profiles_avatar_len check (char_length(avatar) between 1 and 16),
  constraint profiles_color_valid check (color in ('gold', 'violet', 'rose', 'teal', 'blue', 'green', 'orange', 'red')),
  constraint profiles_bio_len check (char_length(bio) <= 160),
  constraint profiles_genres_valid check (cardinality(genres) <= 10 and public.valid_text_list(genres, 40)),
  constraint profiles_favorite_book_len check (char_length(favorite_book) <= 120),
  constraint profiles_favorite_authors_len check (char_length(favorite_authors) <= 160),
  constraint profiles_reading_moment_valid check (reading_moment in ('', 'manana', 'tarde', 'noche', 'madrugada')),
  constraint profiles_yearly_goal_range check (yearly_goal between 0 and 365),
  constraint profiles_achievements_valid check (cardinality(achievements) <= 100 and public.valid_text_list(achievements, 40)),
  constraint profiles_reading_now_size check (reading_now is null or octet_length(reading_now::text) <= 600),
  constraint profiles_division_range check (division between 0 and 9)
);

-- Actividad diaria (en la fecha local de cada persona): sirve para las rachas
-- de amigos y para sumar la experiencia semanal de la liga.
create table if not exists public.daily_activity (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  xp integer not null default 0 check (xp between 0 and 5000),
  minutes integer not null default 0 check (minutes between 0 and 1440),
  counted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- Ligas: cada semana (lunes 00:00 UTC) se forman grupos de hasta 30 personas
-- de la misma división. Al terminar, los primeros suben y los últimos bajan.
create table if not exists public.league_groups (
  id uuid primary key default gen_random_uuid(),
  week date not null,
  division smallint not null check (division between 0 and 9),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists league_groups_week_division on public.league_groups (week, division, created_at);

create table if not exists public.league_members (
  week date not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid not null references public.league_groups (id) on delete cascade,
  division smallint not null check (division between 0 and 9),
  xp integer not null default 0,
  -- Última vez que sumó experiencia: en caso de empate gana quien llegó antes.
  reached_at timestamptz not null default now(),
  primary key (week, user_id)
);
create index if not exists league_members_group on public.league_members (group_id);
create index if not exists league_members_user_week on public.league_members (user_id, week desc);

create table if not exists public.friendships (
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (requester, addressee),
  constraint friendships_not_self check (requester <> addressee)
);
create unique index if not exists friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee on public.friendships (addressee);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'joined', 'book_finished', 'share_book', 'share_quote',
    'streak', 'achievement', 'level', 'league'
  )),
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint posts_data_size check (octet_length(data::text) <= 60000)
);
create index if not exists posts_user_created on public.posts (user_id, created_at desc);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_likes_user on public.post_likes (user_id);

-- Sin acceso directo: todo pasa por las funciones de abajo.
alter table public.profiles enable row level security;
alter table public.daily_activity enable row level security;
alter table public.league_groups enable row level security;
alter table public.league_members enable row level security;
alter table public.friendships enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;

revoke all on public.profiles, public.daily_activity, public.league_groups, public.league_members,
  public.friendships, public.posts, public.post_likes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Utilidades internas
-- ---------------------------------------------------------------------------

create or replace function public.current_week()
returns date
language sql
stable
as $$
  select date_trunc('week', now() at time zone 'utc')::date
$$;

-- Cuántos suben y cuántos bajan en un grupo (igual que src/community/divisions.ts).
create or replace function public.league_zones(p_division int, p_size int, out promote int, out demote int)
language sql
immutable
as $$
  select
    case when p_division >= 9 or p_size < 1 then 0
         else least((array[10, 10, 10, 7, 7, 7, 5, 5, 5, 0])[p_division + 1], greatest(1, p_size / 3)) end,
    case when p_division <= 0 then 0
         else least((array[0, 5, 5, 5, 5, 5, 5, 5, 5, 5])[p_division + 1], p_size / 5) end
$$;

-- Posición final de una persona en su grupo de una semana.
create or replace function public.league_outcome(p_week date, p_user uuid)
returns table (division int, rank int, size int, xp int, outcome text)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select group_id, division from league_members where week = p_week and user_id = p_user
  ),
  ranked as (
    select lm.user_id, lm.xp,
           row_number() over (order by lm.xp desc, lm.reached_at, lm.user_id) as rnk,
           count(*) over () as n
    from league_members lm
    join me on lm.group_id = me.group_id
  )
  select me.division::int, r.rnk::int, r.n::int, r.xp,
         case when r.rnk <= z.promote and r.xp > 0 then 'promoted'
              when r.rnk > r.n - z.demote then 'demoted'
              else 'stayed' end
  from me
  cross join ranked r
  cross join lateral league_zones(me.division, r.n::int) z
  where r.user_id = p_user
$$;

-- División con la que alguien entra a la liga de esta semana.
create or replace function public.next_division(p_user uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  prev_week date;
  o record;
begin
  select lm.week into prev_week
  from league_members lm
  where lm.user_id = p_user and lm.week < current_week()
  order by lm.week desc
  limit 1;
  if prev_week is null then
    return 0;
  end if;
  select * into o from league_outcome(prev_week, p_user);
  return greatest(0, least(9, o.division + case o.outcome when 'promoted' then 1 when 'demoted' then -1 else 0 end));
end
$$;

-- Asegura que la persona tenga grupo esta semana (lo crea si hace falta).
create or replace function public.join_league(p_user uuid)
returns public.league_members
language plpgsql
security definer
set search_path = public
as $$
declare
  w date := current_week();
  mem league_members;
  div int;
  gid uuid;
begin
  select * into mem from league_members where week = w and user_id = p_user;
  if found then
    return mem;
  end if;
  div := next_division(p_user);
  -- Un solo reparto a la vez por semana y división.
  perform pg_advisory_xact_lock(hashtext('lectia-league'), (w - date '2020-01-06') * 10 + div);
  select g.id into gid
  from league_groups g
  where g.week = w and g.division = div
    and (select count(*) from league_members m where m.group_id = g.id) < 30
  order by g.created_at
  limit 1;
  if gid is null then
    insert into league_groups (week, division) values (w, div) returning id into gid;
  end if;
  insert into league_members (week, user_id, group_id, division)
  values (w, p_user, gid, div)
  on conflict (week, user_id) do nothing;
  select * into mem from league_members where week = w and user_id = p_user;
  update profiles set division = mem.division where id = p_user;
  return mem;
end
$$;

create or replace function public.friend_ids(p_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select case when requester = p_user then addressee else requester end
  from friendships
  where status = 'accepted' and (requester = p_user or addressee = p_user)
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from friendships
    where status = 'accepted'
      and least(requester, addressee) = least(a, b)
      and greatest(requester, addressee) = greatest(a, b)
  )
$$;

-- Racha de amigos: días seguidos en que los dos leyeron o entrenaron, desde
-- que son amigos. Sigue viva si el último día compartido es hoy o ayer.
create or replace function public.friend_streak(a uuid, b uuid, p_today date, p_since date default null)
returns int
language sql
stable
security definer
set search_path = public
as $$
  with common as (
    select day from daily_activity
    where user_id = a and counted and day <= p_today + 1 and (p_since is null or day >= p_since)
    intersect
    select day from daily_activity
    where user_id = b and counted and day <= p_today + 1 and (p_since is null or day >= p_since)
  ),
  islands as (
    select day, day + (row_number() over (order by day desc))::int as grp from common
  ),
  latest as (
    select grp, max(day) as last_day from islands group by grp order by max(day) desc limit 1
  )
  select coalesce((
    select case when l.last_day >= p_today - 1 then (select count(*) from islands i where i.grp = l.grp) else 0 end
    from latest l
  ), 0)::int
$$;

create or replace function public.profile_json(p public.profiles)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'display_name', p.display_name,
    'avatar', p.avatar,
    'color', p.color,
    'bio', p.bio,
    'genres', to_jsonb(p.genres),
    'favorite_book', p.favorite_book,
    'favorite_authors', p.favorite_authors,
    'reading_moment', p.reading_moment,
    'yearly_goal', p.yearly_goal,
    'tz', p.tz,
    'total_xp', p.total_xp,
    'level', p.level,
    'streak', p.streak,
    'best_streak', p.best_streak,
    'last_active_day', p.last_active_day,
    'books_finished', p.books_finished,
    'books_this_year', p.books_this_year,
    'minutes_total', p.minutes_total,
    'achievements', to_jsonb(p.achievements),
    'reading_now', p.reading_now,
    'division', p.division,
    'created_at', p.created_at
  )
$$;

create or replace function public.require_user()
returns uuid
language plpgsql
stable
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Inicia sesión para usar la comunidad' using errcode = '28000';
  end if;
  return uid;
end
$$;

create or replace function public.require_profile()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_user();
begin
  if not exists (select 1 from profiles where id = uid) then
    raise exception 'Primero crea tu perfil' using errcode = 'P0002';
  end if;
  return uid;
end
$$;

-- ---------------------------------------------------------------------------
-- Perfil
-- ---------------------------------------------------------------------------

create or replace function public.get_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select profile_json(p) from profiles p where p.id = auth.uid()
$$;

create or replace function public.save_profile(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_user();
  v_username text := lower(btrim(coalesce(p->>'username', '')));
  v_name text := left(btrim(coalesce(p->>'display_name', '')), 40);
  v_color text := coalesce(p->>'color', '');
  v_moment text := coalesce(p->>'reading_moment', '');
  v_genres text[];
  created boolean;
  saved profiles;
begin
  if v_username !~ '^[a-z0-9_.]{3,20}$' then
    raise exception 'El nombre de usuario debe tener de 3 a 20 letras, números, puntos o guiones bajos' using errcode = '22023';
  end if;
  if v_name = '' then
    raise exception 'Escribe tu nombre' using errcode = '22023';
  end if;
  if exists (select 1 from profiles where username = v_username and id <> uid) then
    raise exception 'Ese nombre de usuario ya está ocupado' using errcode = '23505';
  end if;
  if jsonb_typeof(coalesce(p->'genres', '[]'::jsonb)) <> 'array' then
    raise exception 'Géneros no válidos' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct left(btrim(g), 40)) filter (where btrim(g) <> ''), '{}')
    into v_genres
  from jsonb_array_elements_text(coalesce(p->'genres', '[]'::jsonb)) as g;
  if cardinality(v_genres) > 10 then
    raise exception 'Elige como máximo 10 géneros' using errcode = '22023';
  end if;
  if v_color not in ('gold', 'violet', 'rose', 'teal', 'blue', 'green', 'orange', 'red') then
    v_color := 'gold';
  end if;
  if v_moment not in ('', 'manana', 'tarde', 'noche', 'madrugada') then
    v_moment := '';
  end if;

  created := not exists (select 1 from profiles where id = uid);
  insert into profiles (id, username, display_name, avatar, color, bio, genres, favorite_book,
                        favorite_authors, reading_moment, yearly_goal, tz)
  values (
    uid,
    v_username,
    v_name,
    coalesce(nullif(left(btrim(coalesce(p->>'avatar', '')), 16), ''), '📚'),
    v_color,
    left(btrim(coalesce(p->>'bio', '')), 160),
    v_genres,
    left(btrim(coalesce(p->>'favorite_book', '')), 120),
    left(btrim(coalesce(p->>'favorite_authors', '')), 160),
    v_moment,
    json_int(p->>'yearly_goal', 0, 365, 12),
    case when coalesce(p->>'tz', '') ~ '^[A-Za-z0-9_+\-/]{1,64}$' then p->>'tz' else 'UTC' end
  )
  on conflict (id) do update set
    username = excluded.username,
    display_name = excluded.display_name,
    avatar = excluded.avatar,
    color = excluded.color,
    bio = excluded.bio,
    genres = excluded.genres,
    favorite_book = excluded.favorite_book,
    favorite_authors = excluded.favorite_authors,
    reading_moment = excluded.reading_moment,
    yearly_goal = excluded.yearly_goal,
    updated_at = now()
  returning * into saved;

  if created then
    insert into posts (user_id, kind, data) values (uid, 'joined', '{}');
  end if;
  return profile_json(saved);
end
$$;

-- Perfil público de otra persona (o el propio), con la relación de amistad.
create or replace function public.get_profile(p_username text, p_today date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_user();
  pr profiles;
  f friendships;
  rel text := 'none';
  since date;
begin
  select * into pr from profiles where username = lower(btrim(p_username));
  if not found then
    return null;
  end if;
  if pr.id = uid then
    rel := 'self';
  else
    select * into f from friendships
    where least(requester, addressee) = least(uid, pr.id) and greatest(requester, addressee) = greatest(uid, pr.id);
    if found then
      if f.status = 'accepted' then
        rel := 'friends';
        since := (f.accepted_at at time zone 'utc')::date - 1;
      elsif f.requester = uid then
        rel := 'pending_out';
      else
        rel := 'pending_in';
      end if;
    end if;
  end if;
  return profile_json(pr) || jsonb_build_object(
    'relation', rel,
    'friends_count', (select count(*) from friend_ids(pr.id)),
    'week_xp', coalesce((select xp from league_members where week = current_week() and user_id = pr.id), 0),
    'friend_streak', case when rel = 'friends' then friend_streak(uid, pr.id, p_today, since) else 0 end
  );
end
$$;

create or replace function public.search_users(p_query text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with q as (select lower(btrim(coalesce(p_query, ''))) as s)
  select coalesce(jsonb_agg(x), '[]'::jsonb)
  from (
    select p.id, p.username, p.display_name, p.avatar, p.color, p.streak, p.last_active_day, p.tz, p.level
    from profiles p, q
    where char_length(q.s) >= 2
      and p.id <> require_user()
      and (p.username like replace(replace(ltrim(q.s, '@'), '_', '\_'), '%', '\%') || '%'
           or lower(p.display_name) like '%' || replace(replace(q.s, '_', '\_'), '%', '\%') || '%')
    order by (p.username = ltrim(q.s, '@')) desc, p.username
    limit 20
  ) x
$$;

-- Borra la cuenta y todo lo publicado (perfil, liga, amistades, novedades).
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_user();
begin
  delete from profiles where id = uid;
  begin
    delete from auth.users where id = uid;
  exception when insufficient_privilege then
    -- Lo publicado ya se borró con el perfil; queda solo una cuenta vacía.
    null;
  end;
end
$$;

-- ---------------------------------------------------------------------------
-- Progreso y liga
-- ---------------------------------------------------------------------------

-- La app envía los totales de los últimos días y sus estadísticas. Es
-- idempotente: solo suma a la liga la experiencia nueva desde la última vez.
create or replace function public.sync_progress(p_days jsonb, p_stats jsonb, p_feed_since timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_profile();
  w date := current_week();
  today_utc date := (now() at time zone 'utc')::date;
  d jsonb;
  v_day date;
  v_xp int;
  v_min int;
  old_xp int;
  delta int := 0;
  v_tz text := left(coalesce(p_stats->>'tz', ''), 64);
  v_reading jsonb := p_stats->'reading_now';
  v_achievements text[];
  mem league_members;
begin
  for d in select value from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) limit 14 loop
    begin
      v_day := (d->>'day')::date;
    exception when others then
      continue;
    end;
    continue when v_day is null or v_day < today_utc - 8 or v_day > today_utc + 1;
    v_xp := json_int(d->>'xp', 0, 5000, 0);
    v_min := json_int(d->>'minutes', 0, 1440, 0);
    select xp into old_xp from daily_activity where user_id = uid and day = v_day;
    insert into daily_activity (user_id, day, xp, minutes, counted)
    values (uid, v_day, v_xp, v_min, coalesce(d->>'counted', '') = 'true')
    on conflict (user_id, day) do update set
      xp = greatest(daily_activity.xp, excluded.xp),
      minutes = greatest(daily_activity.minutes, excluded.minutes),
      counted = daily_activity.counted or excluded.counted,
      updated_at = now();
    -- El domingo local puede caer ya en lunes UTC: se acepta un día de margen.
    if v_day >= w - 1 and v_xp > coalesce(old_xp, 0) then
      delta := delta + v_xp - coalesce(old_xp, 0);
    end if;
  end loop;

  if delta > 0 then
    perform join_league(uid);
    update league_members set xp = xp + delta, reached_at = now() where week = w and user_id = uid;
  end if;

  if v_tz !~ '^[A-Za-z0-9_+\-/]+$' then
    v_tz := null;
  end if;
  if v_reading is not null and jsonb_typeof(v_reading) = 'object' then
    v_reading := jsonb_build_object('title', left(v_reading->>'title', 160), 'author', left(coalesce(v_reading->>'author', ''), 120));
  else
    v_reading := null;
  end if;
  select coalesce(array_agg(distinct left(a, 40)) filter (where a <> ''), '{}') into v_achievements
  from (select jsonb_array_elements_text(coalesce(p_stats->'achievements', '[]'::jsonb)) as a limit 100) s;

  update profiles set
    tz = coalesce(v_tz, tz),
    total_xp = json_int(p_stats->>'total_xp', 0, 100000000, total_xp),
    level = json_int(p_stats->>'level', 1, 999, level),
    streak = json_int(p_stats->>'streak', 0, 100000, streak),
    best_streak = json_int(p_stats->>'best_streak', 0, 100000, best_streak),
    last_active_day = case
      when (p_stats->>'last_active_day') ~ '^\d{4}-\d{2}-\d{2}$' then least((p_stats->>'last_active_day')::date, today_utc + 1)
      else last_active_day end,
    books_finished = json_int(p_stats->>'books_finished', 0, 100000, books_finished),
    books_this_year = json_int(p_stats->>'books_this_year', 0, 100000, books_this_year),
    minutes_total = json_int(p_stats->>'minutes_total', 0, 100000000, minutes_total),
    achievements = case when p_stats ? 'achievements' then v_achievements else achievements end,
    reading_now = case when p_stats ? 'reading_now' then v_reading else reading_now end,
    updated_at = now()
  where id = uid;

  select * into mem from league_members where week = w and user_id = uid;
  return jsonb_build_object(
    'week', w,
    'week_xp', coalesce(mem.xp, 0),
    'division', coalesce(mem.division, next_division(uid)),
    'requests', (select count(*) from friendships where addressee = uid and status = 'pending'),
    'new_posts', case when p_feed_since is null then 0 else (
      select count(*) from posts
      where user_id in (select friend_ids(uid)) and created_at > p_feed_since
    ) end
  );
end
$$;

create or replace function public.get_league()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_profile();
  w date := current_week();
  mem league_members;
  joined boolean;
  prev_week date;
  prev record;
  previous jsonb;
  members jsonb := '[]'::jsonb;
  z record;
  size int := 0;
begin
  select * into mem from league_members where week = w and user_id = uid;
  joined := found;
  if joined then
    select coalesce(jsonb_agg(x order by x.rank), '[]'::jsonb), count(*) into members, size
    from (
      select row_number() over (order by lm.xp desc, lm.reached_at, lm.user_id) as rank,
             lm.user_id as id, lm.xp, p.username, p.display_name, p.avatar, p.color,
             p.streak, p.last_active_day, p.tz
      from league_members lm
      join profiles p on p.id = lm.user_id
      where lm.group_id = mem.group_id
    ) x;
  end if;

  select lm.week into prev_week
  from league_members lm
  where lm.user_id = uid and lm.week < w
  order by lm.week desc
  limit 1;
  if prev_week is not null then
    select * into prev from league_outcome(prev_week, uid);
    previous := jsonb_build_object(
      'week', prev_week, 'division', prev.division, 'rank', prev.rank,
      'size', prev.size, 'xp', prev.xp, 'outcome', prev.outcome
    );
  end if;

  select * into z from league_zones(case when joined then mem.division else next_division(uid) end, size);
  return jsonb_build_object(
    'week', w,
    'ends_at', ((w + 7)::timestamp at time zone 'utc'),
    'joined', joined,
    'division', case when joined then mem.division else next_division(uid) end,
    'promote', z.promote,
    'demote', z.demote,
    'members', members,
    'previous', previous
  );
end
$$;

-- ---------------------------------------------------------------------------
-- Amigos
-- ---------------------------------------------------------------------------

create or replace function public.get_friends(p_today date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_profile();
  w date := current_week();
begin
  return jsonb_build_object(
    'friends', (
      select coalesce(jsonb_agg(x order by x.friend_streak desc, x.week_xp desc, x.username), '[]'::jsonb)
      from (
        select p.id, p.username, p.display_name, p.avatar, p.color, p.streak, p.last_active_day, p.tz, p.level,
               f.accepted_at,
               coalesce(lm.xp, 0) as week_xp,
               friend_streak(uid, p.id, p_today, (f.accepted_at at time zone 'utc')::date - 1) as friend_streak
        from friendships f
        join profiles p on p.id = case when f.requester = uid then f.addressee else f.requester end
        left join league_members lm on lm.week = w and lm.user_id = p.id
        where f.status = 'accepted' and (f.requester = uid or f.addressee = uid)
      ) x
    ),
    'incoming', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar', p.avatar,
        'color', p.color, 'streak', p.streak, 'last_active_day', p.last_active_day, 'tz', p.tz,
        'level', p.level, 'created_at', f.created_at) order by f.created_at desc), '[]'::jsonb)
      from friendships f join profiles p on p.id = f.requester
      where f.addressee = uid and f.status = 'pending'
    ),
    'outgoing', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar', p.avatar,
        'color', p.color, 'streak', p.streak, 'last_active_day', p.last_active_day, 'tz', p.tz,
        'level', p.level, 'created_at', f.created_at) order by f.created_at desc), '[]'::jsonb)
      from friendships f join profiles p on p.id = f.addressee
      where f.requester = uid and f.status = 'pending'
    ),
    'my_week_xp', coalesce((select xp from league_members where week = w and user_id = uid), 0)
  );
end
$$;

-- Devuelve: 'sent' (solicitud enviada), 'accepted' (ya te la habían enviado:
-- ahora son amigos), 'pending' (ya estaba enviada) o 'friends' (ya lo eran).
create or replace function public.request_friend(p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_profile();
  target uuid;
  f friendships;
begin
  select id into target from profiles where username = lower(btrim(ltrim(btrim(p_username), '@')));
  if target is null then
    raise exception 'No encontramos a nadie con ese nombre de usuario' using errcode = 'P0002';
  end if;
  if target = uid then
    raise exception 'No puedes agregarte a ti' using errcode = '22023';
  end if;
  select * into f from friendships
  where least(requester, addressee) = least(uid, target) and greatest(requester, addressee) = greatest(uid, target);
  if found then
    if f.status = 'accepted' then
      return 'friends';
    elsif f.requester = uid then
      return 'pending';
    end if;
    update friendships set status = 'accepted', accepted_at = now()
    where requester = target and addressee = uid;
    return 'accepted';
  end if;
  if (select count(*) from friendships where requester = uid and status = 'pending') >= 100 then
    raise exception 'Tienes demasiadas solicitudes sin responder' using errcode = '53400';
  end if;
  insert into friendships (requester, addressee) values (uid, target);
  return 'sent';
end
$$;

create or replace function public.respond_friend(p_user uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_profile();
begin
  if p_accept then
    update friendships set status = 'accepted', accepted_at = now()
    where requester = p_user and addressee = uid and status = 'pending';
  else
    delete from friendships where requester = p_user and addressee = uid and status = 'pending';
  end if;
end
$$;

-- Quita una amistad o cancela una solicitud enviada.
create or replace function public.remove_friend(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_profile();
begin
  delete from friendships
  where least(requester, addressee) = least(uid, p_user) and greatest(requester, addressee) = greatest(uid, p_user);
end
$$;

-- ---------------------------------------------------------------------------
-- Novedades y "me gusta"
-- ---------------------------------------------------------------------------

create or replace function public.can_see_posts_of(p_viewer uuid, p_author uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_viewer = p_author or are_friends(p_viewer, p_author)
$$;

-- Novedades propias y de amigos; con p_user, solo las de esa persona.
create or replace function public.get_feed(p_before timestamptz default null, p_limit int default 20, p_user uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := require_profile();
begin
  if p_user is not null and not can_see_posts_of(uid, p_user) then
    return '[]'::jsonb;
  end if;
  return (
    select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb)
    from (
      select po.id, po.kind, po.data, po.created_at, po.user_id,
             pr.username, pr.display_name, pr.avatar, pr.color,
             (select count(*) from post_likes l where l.post_id = po.id) as likes,
             exists (select 1 from post_likes l where l.post_id = po.id and l.user_id = uid) as liked,
             (
               select coalesce(jsonb_agg(jsonb_build_object(
                 'username', q.username, 'display_name', q.display_name, 'avatar', q.avatar, 'color', q.color)), '[]'::jsonb)
               from (
                 select lp.username, lp.display_name, lp.avatar, lp.color
                 from post_likes l2 join profiles lp on lp.id = l2.user_id
                 where l2.post_id = po.id
                 order by l2.created_at desc
                 limit 3
               ) q
             ) as likers
      from posts po
      join profiles pr on pr.id = po.user_id
      where (case when p_user is null
                  then po.user_id = uid or po.user_id in (select friend_ids(uid))
                  else po.user_id = p_user end)
        and (p_before is null or po.created_at < p_before)
      order by po.created_at desc
      limit greatest(1, least(coalesce(p_limit, 20), 50))
    ) x
  );
end
$$;

create or replace function public.create_post(p_kind text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_profile();
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
  saved posts;
begin
  if p_kind not in ('book_finished', 'share_book', 'share_quote', 'streak', 'achievement', 'level', 'league') then
    raise exception 'Tipo de novedad no válido' using errcode = '22023';
  end if;
  if jsonb_typeof(v_data) <> 'object' then
    raise exception 'Datos no válidos' using errcode = '22023';
  end if;
  if char_length(coalesce(v_data->>'title', '')) > 200
     or char_length(coalesce(v_data->>'author', '')) > 160
     or char_length(coalesce(v_data->>'text', '')) > 400
     or char_length(coalesce(v_data->>'quote', '')) > 1000
     or char_length(coalesce(v_data->>'note', '')) > 400 then
    raise exception 'El texto es demasiado largo' using errcode = '22001';
  end if;
  if v_data ? 'cover' and coalesce(v_data->>'cover', '') !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' then
    v_data := v_data - 'cover';
  end if;
  if (select count(*) from posts where user_id = uid and created_at > now() - interval '1 day') >= 40 then
    raise exception 'Has publicado mucho hoy. Vuelve mañana' using errcode = '53400';
  end if;
  insert into posts (user_id, kind, data) values (uid, p_kind, v_data) returning * into saved;
  return jsonb_build_object('id', saved.id, 'created_at', saved.created_at);
end
$$;

create or replace function public.delete_post(p_post uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_profile();
begin
  delete from posts where id = p_post and user_id = uid;
end
$$;

-- Da o quita "me gusta". Solo en novedades de amigos (no en las propias).
create or replace function public.toggle_like(p_post uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := require_profile();
  author uuid;
  now_liked boolean;
begin
  select user_id into author from posts where id = p_post;
  if author is null or author = uid or not are_friends(uid, author) then
    raise exception 'No puedes dar me gusta a esta novedad' using errcode = '42501';
  end if;
  delete from post_likes where post_id = p_post and user_id = uid;
  if found then
    now_liked := false;
  else
    insert into post_likes (post_id, user_id) values (p_post, uid);
    now_liked := true;
  end if;
  return jsonb_build_object(
    'liked', now_liked,
    'likes', (select count(*) from post_likes where post_id = p_post)
  );
end
$$;

-- ---------------------------------------------------------------------------
-- Permisos: la app (rol authenticated) solo puede llamar a las funciones
-- públicas. Las internas quedan para uso de las propias funciones.
-- ---------------------------------------------------------------------------

-- Internas: con acceso a datos de otras personas, solo para las funciones.
revoke execute on function
  public.league_outcome(date, uuid),
  public.next_division(uuid),
  public.join_league(uuid),
  public.friend_ids(uuid),
  public.are_friends(uuid, uuid),
  public.friend_streak(uuid, uuid, date, date),
  public.require_profile(),
  public.can_see_posts_of(uuid, uuid)
from public, anon, authenticated;

-- Públicas: solo con sesión iniciada (también las cuentas anónimas).
revoke execute on function
  public.get_my_profile(),
  public.save_profile(jsonb),
  public.get_profile(text, date),
  public.search_users(text),
  public.delete_account(),
  public.sync_progress(jsonb, jsonb, timestamptz),
  public.get_league(),
  public.get_friends(date),
  public.request_friend(text),
  public.respond_friend(uuid, boolean),
  public.remove_friend(uuid),
  public.get_feed(timestamptz, int, uuid),
  public.create_post(text, jsonb),
  public.delete_post(uuid),
  public.toggle_like(uuid)
from public, anon;

grant execute on function
  public.get_my_profile(),
  public.save_profile(jsonb),
  public.get_profile(text, date),
  public.search_users(text),
  public.delete_account(),
  public.sync_progress(jsonb, jsonb, timestamptz),
  public.get_league(),
  public.get_friends(date),
  public.request_friend(text),
  public.respond_friend(uuid, boolean),
  public.remove_friend(uuid),
  public.get_feed(timestamptz, int, uuid),
  public.create_post(text, jsonb),
  public.delete_post(uuid),
  public.toggle_like(uuid)
to authenticated;
