-- Pruebas de la migración de la comunidad. Se ejecutan con scripts/test-sql.sh.
\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
\set C '''cccccccc-0000-0000-0000-000000000003'''

insert into auth.users (id, email) values (:A, 'a@x.com'), (:B, 'b@x.com'), (:C, 'c@x.com');

set timezone = 'UTC';

-- Ayudante: comprueba que una sentencia falle con un mensaje que contenga un texto.
create schema tests;
grant usage on schema tests to anon, authenticated;
create or replace function tests.expect_error(p_sql text, p_contains text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_contains in sqlerrm) = 0 then
      raise exception 'Se esperaba un error con "%", llegó "%"', p_contains, sqlerrm;
    end if;
    return;
  end;
  raise exception 'Se esperaba un error con "%" en: %', p_contains, p_sql;
end
$$;
grant execute on function tests.expect_error(text, text) to anon, authenticated;

create or replace function tests.ok(p_value boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_value is distinct from true then
    raise exception 'Falló: %', p_message;
  end if;
end
$$;
grant execute on function tests.ok(boolean, text) to anon, authenticated;

-- ---------------------------------------------------------------- perfiles
set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select tests.expect_error($$select public.get_league()$$, 'Inicia sesión');

select set_config('request.jwt.claim.sub', :A, false);
select tests.expect_error($$select public.get_league()$$, 'Primero crea tu perfil');
select tests.expect_error($$select public.save_profile('{"username":"A!","display_name":"Ana"}')$$, 'nombre de usuario');
select tests.expect_error($$select public.save_profile('{"username":"ana","display_name":"  "}')$$, 'Escribe tu nombre');

do $$
declare
  p jsonb := public.save_profile('{"username":"Ana_Lee","display_name":"Ana","avatar":"🦊","color":"rose","genres":["Fantasía","Misterio","Fantasía"," "],"bio":"Leo de noche","yearly_goal":"24","reading_moment":"noche","tz":"America/Santiago"}');
begin
  assert p->>'username' = 'ana_lee', 'username en minúsculas';
  assert p->>'color' = 'rose';
  assert jsonb_array_length(p->'genres') = 2, 'géneros sin duplicados ni vacíos';
  assert (p->>'yearly_goal')::int = 24;
  assert p->>'tz' = 'America/Santiago';
  p := public.save_profile('{"username":"ana_lee","display_name":"Ana L.","color":"neon","reading_moment":"siesta","yearly_goal":9999}');
  assert p->>'display_name' = 'Ana L.';
  assert p->>'color' = 'gold', 'color inválido → oro';
  assert p->>'reading_moment' = '', 'momento inválido → vacío';
  assert (p->>'yearly_goal')::int = 365, 'meta acotada';
end
$$;

select set_config('request.jwt.claim.sub', :B, false);
select tests.expect_error($$select public.save_profile('{"username":"ana_lee","display_name":"Otra"}')$$, 'ocupado');
select tests.ok(public.save_profile('{"username":"beto","display_name":"Beto","avatar":"🐢","color":"teal"}') is not null, 'perfil creado');
select set_config('request.jwt.claim.sub', :C, false);
select tests.ok(public.save_profile('{"username":"carla","display_name":"Carla"}') is not null, 'perfil creado');

-- Sin acceso directo a las tablas ni a las funciones internas.
select tests.expect_error($$select * from public.profiles$$, 'permission denied');
select tests.expect_error($$insert into public.posts (user_id, kind) values (auth.uid(), 'joined')$$, 'permission denied');
select tests.expect_error($$select public.join_league(auth.uid())$$, 'permission denied');
select tests.expect_error($$select public.friend_streak(auth.uid(), auth.uid(), current_date)$$, 'permission denied');
reset role;

do $$
begin
  assert (select count(*) from posts where kind = 'joined') = 3, 'una novedad "se unió" por perfil nuevo';
end
$$;

set role anon;
select tests.expect_error($$select public.get_my_profile()$$, 'permission denied');
reset role;

-- ---------------------------------------------------------------- liga
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false);
do $$
declare
  today text := to_char(now() at time zone 'utc', 'YYYY-MM-DD');
  r jsonb;
begin
  r := public.sync_progress(jsonb_build_array(jsonb_build_object('day', today, 'xp', 50, 'minutes', 20, 'counted', true)),
                            jsonb_build_object('total_xp', 1234, 'level', 4, 'streak', 3, 'best_streak', 9,
                                               'last_active_day', today, 'achievements', jsonb_build_array('first-book', 'hour'),
                                               'reading_now', jsonb_build_object('title', 'Rayuela', 'author', 'Cortázar', 'extra', 'x'),
                                               'tz', 'Europe/Madrid'));
  assert (r->>'week_xp')::int = 50, 'entra a la liga con su XP de hoy';
  assert (r->>'division')::int = 0, 'empieza en Bronce';
  -- Idempotente: los mismos totales no suman de nuevo.
  r := public.sync_progress(jsonb_build_array(jsonb_build_object('day', today, 'xp', 50, 'minutes', 20, 'counted', true)), '{}');
  assert (r->>'week_xp')::int = 50, 'sin XP nueva no cambia';
  r := public.sync_progress(jsonb_build_array(jsonb_build_object('day', today, 'xp', 80.7, 'minutes', 30, 'counted', true),
                                              jsonb_build_object('day', 'basura', 'xp', 10),
                                              jsonb_build_object('day', '2001-01-01', 'xp', 999)), '{}');
  assert (r->>'week_xp')::int = 80, 'solo suma la diferencia; ignora días viejos o inválidos';
  -- Un total menor (otro dispositivo) no resta.
  r := public.sync_progress(jsonb_build_array(jsonb_build_object('day', today, 'xp', 10, 'counted', false)), '{}');
  assert (r->>'week_xp')::int = 80;
end
$$;

select set_config('request.jwt.claim.sub', :B, false);
select tests.ok((public.sync_progress(jsonb_build_array(jsonb_build_object('day', to_char(now() at time zone 'utc', 'YYYY-MM-DD'), 'xp', 100000, 'counted', true)), '{}')->>'week_xp')::int = 5000, 'tope_diario');

select set_config('request.jwt.claim.sub', :A, false);
do $$
declare
  l jsonb := public.get_league();
begin
  assert (l->>'joined')::boolean;
  assert jsonb_array_length(l->'members') = 2, 'A y B en el mismo grupo';
  assert l->'members'->0->>'username' = 'beto';
  assert (l->'members'->1->>'rank')::int = 2;
  assert (l->>'promote')::int = 1, 'grupo de 2: sube 1';
  assert (l->>'demote')::int = 0, 'Bronce no baja';
  assert l->'previous' = 'null'::jsonb;
end
$$;
reset role;

do $$
begin
  assert (select streak from profiles where username = 'ana_lee') = 3;
  assert (select reading_now from profiles where username = 'ana_lee') = '{"title":"Rayuela","author":"Cortázar"}'::jsonb, 'reading_now limpio';
  assert (select tz from profiles where username = 'ana_lee') = 'Europe/Madrid';
  assert (select achievements from profiles where username = 'ana_lee') @> array['hour'];
end
$$;

-- Zonas de ascenso y descenso.
do $$
begin
  assert (select promote from league_zones(0, 30)) = 10 and (select demote from league_zones(0, 30)) = 0;
  assert (select promote from league_zones(4, 30)) = 7 and (select demote from league_zones(4, 30)) = 5;
  assert (select promote from league_zones(9, 30)) = 0 and (select demote from league_zones(9, 30)) = 5;
  assert (select promote from league_zones(3, 4)) = 1 and (select demote from league_zones(3, 4)) = 0;
  assert (select promote from league_zones(3, 12)) = 4 and (select demote from league_zones(3, 12)) = 2;
end
$$;

-- Semana anterior: A ganó su grupo de Bronce → sube a Plata.
do $$
declare
  prev date := current_week() - 7;
  g uuid;
begin
  insert into league_groups (week, division) values (prev, 0) returning id into g;
  insert into league_members (week, user_id, group_id, division, xp) values
    (prev, 'aaaaaaaa-0000-0000-0000-000000000001', g, 0, 300),
    (prev, 'bbbbbbbb-0000-0000-0000-000000000002', g, 0, 200),
    (prev, 'cccccccc-0000-0000-0000-000000000003', g, 0, 100);
  assert next_division('aaaaaaaa-0000-0000-0000-000000000001') = 1, 'el primero sube';
  assert next_division('bbbbbbbb-0000-0000-0000-000000000002') = 0, 'grupo de 3: solo sube 1';
end
$$;

-- Rubí con 10 personas: suben 3 y bajan los 2 últimos.
do $$
declare
  w date := current_week() - 14;
  g uuid;
  i int;
  uid uuid;
begin
  insert into league_groups (week, division) values (w, 4) returning id into g;
  for i in 1..9 loop
    uid := gen_random_uuid();
    insert into auth.users (id) values (uid);
    insert into profiles (id, username, display_name) values (uid, 'relleno' || i, 'Relleno ' || i);
    insert into league_members (week, user_id, group_id, division, xp) values (w, uid, g, 4, 1000 - i);
  end loop;
  uid := gen_random_uuid();
  insert into auth.users (id) values (uid);
  insert into profiles (id, username, display_name) values (uid, 'ultimo', 'Último');
  insert into league_members (week, user_id, group_id, division, xp) values (w, uid, g, 4, 5);
  assert next_division(uid) = 3, 'el último de Rubí baja a Zafiro';
  assert next_division((select id from profiles where username = 'relleno1')) = 5, 'el primero de Rubí sube a Esmeralda';
  assert next_division((select id from profiles where username = 'relleno5')) = 4, 'el del medio se queda';
end
$$;

-- Con la semana anterior ganada, A entra a Plata esta semana.
delete from league_members where week = current_week() and user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false);
do $$
declare
  yesterday text := to_char((now() at time zone 'utc')::date - 1, 'YYYY-MM-DD');
  today text := to_char(now() at time zone 'utc', 'YYYY-MM-DD');
  r jsonb;
  l jsonb;
begin
  l := public.get_league();
  assert not (l->>'joined')::boolean, 'aún no entra esta semana';
  assert (l->>'division')::int = 1, 'muestra la división a la que entrará';
  assert l->'previous'->>'outcome' = 'promoted';
  assert (l->'previous'->>'rank')::int = 1;
  r := public.sync_progress(jsonb_build_array(jsonb_build_object('day', today, 'xp', 120, 'counted', true)), '{}');
  assert (r->>'division')::int = 1, 'entra a Plata';
  assert (r->>'week_xp')::int = 40, 'suma solo la XP nueva de hoy (120 - 80)';
  l := public.get_league();
  assert jsonb_array_length(l->'members') = 1, 'grupo nuevo de Plata';
end
$$;
reset role;
do $$
begin
  assert (select division from profiles where username = 'ana_lee') = 1;
end
$$;

-- ---------------------------------------------------------------- amigos
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false);
select tests.expect_error($$select public.request_friend('nadie_existe')$$, 'No encontramos');
select tests.expect_error($$select public.request_friend('ana_lee')$$, 'No puedes agregarte');
select tests.ok(public.request_friend('@Beto') = 'sent', 'enviada');
select tests.ok(public.request_friend('beto') = 'pending', 'repetida');
select tests.ok(public.request_friend('carla') = 'sent', 'enviada_c');

select set_config('request.jwt.claim.sub', :B, false);
do $$
declare
  f jsonb := public.get_friends(current_date);
  r jsonb;
begin
  assert jsonb_array_length(f->'incoming') = 1 and f->'incoming'->0->>'username' = 'ana_lee';
  r := public.sync_progress('[]', '{}', now() - interval '1 hour');
  assert (r->>'requests')::int = 1, 'una solicitud pendiente';
  assert public.request_friend('ana_lee') = 'accepted', 'enviarla de vuelta la acepta';
  f := public.get_friends(current_date);
  assert jsonb_array_length(f->'friends') = 1 and jsonb_array_length(f->'incoming') = 0;
  assert (public.get_profile('ana_lee', current_date)->>'relation') = 'friends';
end
$$;

select set_config('request.jwt.claim.sub', :C, false);
select tests.ok((public.get_profile('ana_lee', current_date)->>'relation') = 'pending_in', 'pendiente_entrante');
select public.respond_friend(:A, false);
select tests.ok((public.get_profile('ana_lee', current_date)->>'relation') = 'none', 'rechazada');
select tests.ok((public.get_profile('carla', current_date)->>'relation') = 'self', 'propio');
select tests.ok(public.get_profile('no_existe', current_date) is null, 'inexistente');
select tests.ok(jsonb_array_length(public.search_users('an')) = 1, 'busca_por_nombre');
select tests.ok(jsonb_array_length(public.search_users('@be')) = 1, 'busca_por_usuario');
select tests.ok(jsonb_array_length(public.search_users('_')) = 0, 'comodines_escapados');
reset role;

-- Racha de amigos: los dos leyeron hoy, ayer y anteayer; antes, un hueco.
update friendships set accepted_at = now() - interval '30 days';
insert into daily_activity (user_id, day, counted)
select u, d::date, true
from (values ('aaaaaaaa-0000-0000-0000-000000000001'::uuid), ('bbbbbbbb-0000-0000-0000-000000000002'::uuid)) as v(u),
     generate_series(current_date - 2, current_date, interval '1 day') as d
on conflict (user_id, day) do update set counted = true;
insert into daily_activity (user_id, day, counted) values
  ('aaaaaaaa-0000-0000-0000-000000000001', current_date - 5, true),
  ('bbbbbbbb-0000-0000-0000-000000000002', current_date - 5, true),
  ('aaaaaaaa-0000-0000-0000-000000000001', current_date - 4, true)
on conflict (user_id, day) do update set counted = true;
do $$
declare
  a uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  b uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
begin
  assert friend_streak(a, b, current_date) = 3, 'tres días seguidos juntos';
  assert friend_streak(a, b, current_date + 1) = 3, 'mañana sigue viva aunque aún no lean';
  assert friend_streak(a, b, current_date + 2) = 0, 'se corta si pasa un día sin los dos';
  assert friend_streak(a, b, current_date, current_date - 1) = 2, 'solo cuenta desde que son amigos';
  update daily_activity set counted = false where user_id = b and day = current_date - 1;
  assert friend_streak(a, b, current_date) = 1, 'un día de uno solo corta la racha';
  update daily_activity set counted = true where user_id = b and day = current_date - 1;
end
$$;

set role authenticated;
select set_config('request.jwt.claim.sub', :A, false);
select tests.ok((public.get_friends(current_date)->'friends'->0->>'friend_streak')::int = 3, 'racha_en_lista');
select tests.ok((public.get_profile('beto', current_date)->>'friend_streak')::int = 3, 'racha_en_perfil');
reset role;

-- ---------------------------------------------------------------- novedades
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false);
select tests.expect_error($$select public.create_post('joined', '{}')$$, 'no válido');
select tests.expect_error($$select public.create_post('share_quote', jsonb_build_object('quote', repeat('x', 1001)))$$, 'demasiado largo');
select tests.expect_error($$select public.create_post('share_book', '[1]')$$, 'no válidos');
select tests.ok(public.create_post('share_book', '{"title":"Rayuela","author":"Cortázar","rating":5,"text":"¡Imprescindible!","cover":"data:image/jpeg;base64,AAAA"}') ? 'id', 'publicada');
select tests.ok(public.create_post('share_quote', '{"quote":"Andábamos sin buscarnos","title":"Rayuela","cover":"javascript:alert(1)"}') ? 'id', 'cita');

select set_config('request.jwt.claim.sub', :B, false);
do $$
declare
  feed jsonb := public.get_feed();
  quote jsonb;
  book jsonb;
  r jsonb;
begin
  select x into quote from jsonb_array_elements(feed) x where x->>'kind' = 'share_quote';
  select x into book from jsonb_array_elements(feed) x where x->>'kind' = 'share_book';
  assert quote is not null and book is not null, 'B ve las novedades de su amiga';
  assert not (quote->'data' ? 'cover'), 'portada no válida descartada';
  assert book->'data'->>'cover' = 'data:image/jpeg;base64,AAAA';
  assert jsonb_array_length(public.get_feed(null, 20, 'aaaaaaaa-0000-0000-0000-000000000001')) = 3, 'novedades en su perfil';
  r := public.toggle_like((book->>'id')::uuid);
  assert (r->>'liked')::boolean and (r->>'likes')::int = 1;
  feed := public.get_feed();
  select x into book from jsonb_array_elements(feed) x where x->>'kind' = 'share_book';
  assert (book->>'liked')::boolean and book->'likers'->0->>'username' = 'beto';
  r := public.toggle_like((book->>'id')::uuid);
  assert not (r->>'liked')::boolean and (r->>'likes')::int = 0, 'quitar me gusta';
  r := public.toggle_like((book->>'id')::uuid);
  assert (public.get_feed(now() - interval '1 day')) = '[]'::jsonb, 'paginación por fecha';
end
$$;

select set_config('request.jwt.claim.sub', :C, false);
do $$
declare
  post uuid;
begin
  assert not exists (select 1 from jsonb_array_elements(public.get_feed()) x where x->>'username' = 'ana_lee'), 'C no es amiga: no ve las novedades de A';
  assert public.get_feed(null, 20, 'aaaaaaaa-0000-0000-0000-000000000001') = '[]'::jsonb;
end
$$;
reset role;

do $$
declare
  post uuid := (select id from posts where kind = 'share_book');
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);
  perform tests.expect_error(format('select public.toggle_like(%L)', post), 'No puedes dar me gusta');
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  perform tests.expect_error(format('select public.toggle_like(%L)', post), 'No puedes dar me gusta');
  perform set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);
  perform public.delete_post(post);
end
$$;
do $$
begin
  assert exists (select 1 from posts where kind = 'share_book'), 'nadie borra novedades ajenas';
  assert (select count(*) from post_likes) = 1;
end
$$;

-- Novedades nuevas de amigos desde la última visita.
set role authenticated;
select set_config('request.jwt.claim.sub', :B, false);
select tests.ok((public.sync_progress('[]', '{}', now() - interval '1 hour')->>'new_posts')::int = 3, 'novedades_nuevas');

-- Al dejar de ser amigos ya no se ven sus novedades.
select public.remove_friend(:A);
select tests.ok(not exists (select 1 from jsonb_array_elements(public.get_feed()) x where x->>'username' = 'ana_lee'), 'sin_novedades');
select tests.ok((public.get_profile('ana_lee', current_date)->>'relation') = 'none', 'ya_no_amigos');

select set_config('request.jwt.claim.sub', :A, false);
do $$
declare
  post uuid := (select (x->>'id')::uuid from jsonb_array_elements(public.get_feed()) x where x->>'kind' = 'share_book');
begin
  perform public.delete_post(post);
  assert not exists (select 1 from jsonb_array_elements(public.get_feed()) x where x->>'kind' = 'share_book'), 'borra la propia';
end
$$;

-- ---------------------------------------------------------------- borrar cuenta
select set_config('request.jwt.claim.sub', :C, false);
select public.delete_account();
reset role;
do $$
begin
  assert not exists (select 1 from profiles where username = 'carla');
  assert not exists (select 1 from auth.users where id = 'cccccccc-0000-0000-0000-000000000003');
  assert not exists (select 1 from league_members where user_id = 'cccccccc-0000-0000-0000-000000000003');
end
$$;
