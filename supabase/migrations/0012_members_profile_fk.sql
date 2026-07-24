-- ============================================================================
-- Relación explícita entre miembros y perfiles.
--
-- Sin esto, pedir los miembros de un hogar junto a su nombre falla con
-- PGRST200: "Could not find a relationship between 'household_members' and
-- 'profiles'". PostgREST solo sabe unir tablas si existe una clave foránea
-- entre ellas, y household_members.user_id apuntaba a auth.users, que está en
-- otro esquema y fuera de su alcance.
--
-- La alternativa era pedir miembros y perfiles por separado y unirlos en el
-- cliente. Se descarta: la clave foránea es además lo correcto desde el
-- modelado — una membresía SÍ referencia a un perfil, y así queda garantizado
-- que no puede existir una sin él.
--
-- No hay riesgo de orden: el perfil lo crea un trigger AFTER INSERT sobre
-- auth.users, así que ya existe cuando alguien crea un hogar o se une.
-- ============================================================================

alter table public.household_members
  add constraint household_members_profile_fk
  foreign key (user_id) references public.profiles (id) on delete cascade;
