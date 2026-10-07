# Comunidad de Lectia (Supabase)

La comunidad (perfiles, ligas por divisiones, rachas de amigos y novedades con
"me gusta") necesita un servidor compartido. Lectia usa
[Supabase](https://supabase.com): funciona desde GitHub Pages sin mantener un
servidor propio y el plan gratuito alcanza de sobra para empezar.

Mientras no se configure, la app muestra la comunidad en **modo demostración**:
lectores de ejemplo, todo guardado solo en el teléfono y un aviso de “Vista
previa” arriba.

## Qué guarda el servidor

| Tabla | Para qué |
| --- | --- |
| `profiles` | Perfil público: nombre, @usuario, avatar, géneros, libro y autores favoritos, meta anual y estadísticas (racha, nivel, libros terminados). |
| `daily_activity` | Por día: polvo de hadas, minutos y si contó para la racha. Sirve para las rachas de amigos y la liga. |
| `league_groups`, `league_members` | Ligas semanales: grupos de hasta 30 personas de la misma división. |
| `friendships` | Solicitudes y amistades. |
| `posts`, `post_likes` | Novedades (libros, citas, logros, rachas, ascensos) y sus "me gusta". |

No hay mensajes, chats ni comentarios. Los archivos de los libros **nunca**
salen del teléfono: al recomendar un libro solo se comparte título, autor y una
miniatura de la portada.

Las tablas no se pueden leer ni escribir directamente: la app solo puede llamar
a las funciones de `migrations/` (con RLS activado y sin permisos sobre las
tablas), que validan todo y solo muestran las novedades a los amigos.

## Reglas del juego

- **Liga semanal**: empieza cada lunes a las 00:00 UTC. Entras al ganar tu
  primer polvo de hadas ✨ de la semana y se te asigna un grupo de hasta 30
  lectores de tu división.
- **Divisiones**: Bronce → Plata → Oro → Zafiro → Rubí → Esmeralda → Amatista
  → Perla → Obsidiana → Diamante. Al terminar la semana suben los primeros
  (10 en las primeras divisiones, luego 7 y 5) y bajan los 5 últimos (desde
  Plata). En grupos chicos las zonas se achican: sube como máximo un tercio y
  baja como máximo un quinto.
- **Rachas de amigos**: días seguidos en que los dos leyeron (o entrenaron),
  contados desde que son amigos. Sigue viva si el último día juntos fue hoy o
  ayer.
- **Protectores de racha** 🧊 (en el teléfono): se gana uno cada 7 días de
  racha, hasta 2. Si un día no lees, se gasta solo y la racha no se corta.
- Cada persona suma como máximo 5000 de polvo de hadas por día en la liga.

## Activarla

1. **Crea un proyecto** gratis en <https://supabase.com/dashboard>.
2. **Crea la base de datos**: en *SQL Editor* pega todo
   `migrations/20261006000000_comunidad.sql` y pulsa *Run*.
   (Con la CLI de Supabase también sirve `supabase db push`.)
3. **Cuentas anónimas**: en *Authentication → Sign In / Providers* activa
   **Allow anonymous sign-ins**. Así cualquiera crea su perfil sin dar su
   correo; luego puede vincular uno para no perderlo.
4. **Código por correo**: en *Authentication → Emails* (plantillas) edita
   **Magic Link** y **Change Email Address** para que incluyan el código:

   ```html
   <h2>Tu código de Lectia</h2>
   <p>Escribe este código en la app: <strong>{{ .Token }}</strong></p>
   ```

   Lectia entra con el código (no con el enlace) porque la app usa el `#`
   para navegar y porque en el celular el enlace suele abrirse fuera de la app
   instalada.
5. **Correo propio (recomendado)**: el correo incluido en Supabase solo envía
   unos pocos mensajes por hora. Para muchas personas configura un SMTP en
   *Authentication → Emails → SMTP Settings*.
6. **Copia las claves** de *Project Settings → API*: la **Project URL** y la
   clave **anon** (o **publishable**). Esta clave es pública por diseño (va
   dentro de la app); la seguridad la ponen las funciones y RLS. Nunca uses la
   clave `service_role` en la app.
7. **Publica con la comunidad**: en GitHub, *Settings → Secrets and variables →
   Actions → Variables*, crea `SUPABASE_URL` y `SUPABASE_ANON_KEY` (también
   sirven como *Secrets*). La próxima publicación ya usará el servidor real.

Para probar en tu computadora, copia `.env.example` como `.env.local`, completa
las dos variables y ejecuta `npm run dev`.

## Pruebas

`supabase/tests/comunidad_test.sql` prueba la migración contra un Postgres 16
cualquiera (imita el esquema `auth` de Supabase con `tests/auth_stub.sql`):

```bash
npm run test:sql            # usa PGHOST, PGUSER, PGPASSWORD si hacen falta
```

La CI lo corre en cada pull request.
