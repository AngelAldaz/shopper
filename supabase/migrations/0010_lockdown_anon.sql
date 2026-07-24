-- ============================================================================
-- Cerrar el esquema public al rol anónimo.
--
-- POR QUÉ HACE FALTA: Supabase concede por privilegios por omisión SELECT sobre
-- las tablas nuevas y EXECUTE sobre las funciones nuevas a `anon`. Un
-- `revoke ... from public` NO deshace eso: PUBLIC es un pseudo-rol distinto de
-- las concesiones explícitas a `anon`.
--
-- Se detectó sondeando el proyecto de producción con la anon key: todas las
-- tablas respondían 200 (con [] gracias a RLS) y todas las funciones auxiliares
-- eran llamables, incluida generate_invite_code, que además ejecuta un bucle
-- contra households para quien la llame.
--
-- Nada de eso filtraba datos, pero dejaba a RLS como ÚNICA barrera. Si algún
-- día se añade una tabla y se olvida el `enable row level security`, o una
-- política tiene un fallo, cualquiera con la anon key —que es pública y viaja
-- en el bundle— lo leería todo. Quitando el privilegio, ese modo de fallo
-- deja de existir: son dos cerrojos independientes.
--
-- Es seguro porque la app nunca consulta PostgREST sin sesión: todas las
-- pantallas de datos viven detrás del guardián de sesión, y el registro y el
-- inicio de sesión van por /auth/v1, no por PostgREST.
-- ============================================================================

revoke all on all tables    in schema public from anon;
revoke all on all routines  in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Que las tablas y funciones que se creen más adelante tampoco se lo concedan,
-- para no depender de acordarse.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on routines  from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ---------------------------------------------------------------------------
-- Helper interno: no debe ser llamable desde la API por nadie.
--
-- create_household y regenerate_invite_code lo siguen usando sin problema
-- porque son SECURITY DEFINER: por dentro corren como el dueño de la función.
-- ---------------------------------------------------------------------------
revoke all on function public.generate_invite_code() from public, anon, authenticated;
