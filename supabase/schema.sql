-- ############################################################################
-- ARCHIVO GENERADO — NO EDITAR A MANO.
--
-- Son las 9 migraciones de supabase/migrations/ concatenadas en orden,
-- para poder aplicar el esquema de una sola vez en el SQL Editor de Supabase.
-- Para cambiar algo, edita la migración correspondiente y corre:
--     npm run db:bundle
--
-- Todo va dentro de una transacción: si algo falla, no queda nada a medias.
-- ############################################################################

begin;

-- ╔══════════════════════════════════════════════════════════════════════════
-- ║  0001_helpers.sql
-- ╚══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- Helpers compartidos por todo el esquema.
-- ============================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Normalización de texto para búsqueda.
--
-- Tiene un gemelo en TypeScript (src/lib/norm.ts) que alimenta el typeahead del
-- cliente. Si divergen, el buscador local y el índice del servidor ordenan
-- distinto.
--
-- NO se usa unaccent() a propósito: es STABLE, no IMMUTABLE, y Postgres rechaza
-- las columnas generadas que dependen de ella. translate() y lower() sí son
-- IMMUTABLE.
--
-- ⚠️ Las dos cadenas de translate() tienen que medir EXACTAMENTE lo mismo (48
-- caracteres cada una). Si la destino se queda corta, Postgres no avisa: mapea
-- por posición y los caracteres sobrantes se BORRAN o se cruzan. Una versión
-- anterior tenía 44 y la "ñ" acababa convertida en otra letra, rompiendo en
-- silencio piña, año y ñame.
-- ---------------------------------------------------------------------------
create or replace function public.norm_text(t text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(
    translate(
      coalesce(t, ''),
      'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
      'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
    )
  )
$$;

comment on function public.norm_text(text) is
  'Minúsculas sin acentos. Gemela de norm() en src/lib/norm.ts. Las dos cadenas de translate() deben medir lo mismo.';

-- ---------------------------------------------------------------------------
-- Metadatos de fila: quién y cuándo.
--
-- `updated_at` lo pone SIEMPRE el servidor, pisando lo que mande el cliente.
-- Es el eje de la sincronización incremental y los relojes de los teléfonos se
-- desfasan; el único reloj confiable es este.
--
-- `created_at`, en cambio, sí respeta el valor del cliente: para una fila
-- creada sin señal, el momento real de creación es más útil que el de la
-- sincronización, y no afecta al delta.
-- ---------------------------------------------------------------------------
create or replace function public.set_row_meta()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();

  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(new.created_by, auth.uid());
  else
    -- Nadie puede reescribir la autoría original desde el cliente.
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;

  return new;
end;
$$;


-- ╔══════════════════════════════════════════════════════════════════════════
-- ║  0002_households.sql
-- ╚══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- Hogares: la unidad de propiedad de TODO lo demás.
--
-- Reglas que pidió el usuario:
--   · La membresía no caduca nunca.
--   · Quien se sale pierde el acceso; quien se queda conserva todo intacto.
-- ============================================================================

create table public.profiles (
  id                  uuid primary key references auth.users on delete cascade,
  display_name        text        not null default '',
  active_household_id uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.households (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null check (btrim(name) <> ''),
  invite_code text        not null unique,
  created_by  uuid        references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.household_members (
  household_id uuid        not null references public.households on delete cascade,
  user_id      uuid        not null references auth.users on delete cascade,
  role         text        not null default 'member' check (role in ('owner', 'member')),
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_idx on public.household_members (user_id);

-- Si el hogar desaparece, el perfil se queda sin hogar activo en vez de
-- apuntar a una fila que ya no existe.
alter table public.profiles
  add constraint profiles_active_household_fk
  foreign key (active_household_id) references public.households on delete set null;

-- ---------------------------------------------------------------------------
-- ¿Pertenezco a este hogar?
--
-- SECURITY DEFINER no es un atajo: es lo que evita la recursión infinita. Una
-- política sobre household_members que consultara household_members se
-- invocaría a sí misma. Al ejecutarse como el dueño de la función, la consulta
-- de dentro no pasa por RLS y corta el ciclo.
--
-- Devuelve boolean y no filas: es lo que hace que sea seguro exponerla.
-- ---------------------------------------------------------------------------
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = hid
      and user_id = (select auth.uid())
  );
$$;

-- ¿Comparto hogar con esta persona? Para poder ver su nombre en la lista de
-- miembros sin abrir todos los perfiles de la base.
create or replace function public.shares_household_with(other_user uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members mine
    join public.household_members theirs on theirs.household_id = mine.household_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = other_user
  );
$$;

revoke all on function public.is_household_member(uuid) from public;
revoke all on function public.shares_household_with(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.shares_household_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Alta automática del perfil al registrarse.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.households        enable row level security;
alter table public.household_members enable row level security;

-- auth.uid() va siempre envuelto en (select ...): así Postgres lo evalúa una
-- vez por consulta en lugar de una vez por fila.

create policy "profiles: el mío y los de mi hogar"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_household_with(id));

create policy "profiles: solo edito el mío"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "households: solo los míos"
  on public.households for select to authenticated
  using (public.is_household_member(id));

create policy "households: los edita quien manda"
  on public.households for update to authenticated
  using (
    exists (
      select 1 from public.household_members
      where household_id = households.id
        and user_id = (select auth.uid())
        and role = 'owner'
    )
  )
  with check (public.is_household_member(id));

-- Sin INSERT ni DELETE directos sobre households: se crean y se borran por RPC,
-- que es donde vive la regla de "el último que sale se lleva el hogar".

create policy "miembros: veo a los de mis hogares"
  on public.household_members for select to authenticated
  using (public.is_household_member(household_id));

-- Tampoco hay INSERT/UPDATE/DELETE directos sobre household_members: unirse,
-- salir, expulsar y transferir pasan por RPC. Si se pudiera insertar a mano,
-- cualquiera podría meterse en un hogar ajeno escribiendo su id.

-- ---------------------------------------------------------------------------
-- Permisos de tabla.
--
-- NO son redundantes con RLS: son la capa de abajo. Supabase ya no concede
-- automáticamente SELECT/INSERT/UPDATE a `authenticated` sobre las tablas
-- nuevas del esquema public (los privilegios por omisión solo traen Dxtm), así
-- que sin esto toda consulta responde "permission denied for table ..." aunque
-- las políticas estén perfectas.
--
-- RLS decide QUÉ FILAS; el GRANT decide si la tabla existe siquiera para ese
-- rol. Hacen falta las dos.
-- ---------------------------------------------------------------------------
grant select, update on public.profiles          to authenticated;
grant select, update on public.households        to authenticated;
grant select         on public.household_members to authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════
-- ║  0003_household_rpcs.sql
-- ╚══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- Operaciones de hogar.
--
-- Van por RPC y no por escritura directa porque cada una tiene una regla que
-- RLS no puede expresar: unirse necesita leer un hogar al que todavía NO
-- perteneces, y salir depende de cuánta gente queda dentro.
-- ============================================================================

-- Alfabeto sin I, L, O, 0 ni 1: el código se dicta en voz alta o se teclea a
-- mano, y esos son justo los que se confunden.
create or replace function public.generate_invite_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for _ in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.households where invite_code = code);
  end loop;
  return code;
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid := gen_random_uuid();
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'El hogar necesita un nombre';
  end if;

  insert into public.households (id, name, invite_code, created_by)
  values (v_id, btrim(p_name), public.generate_invite_code(), v_uid);

  insert into public.household_members (household_id, user_id, role)
  values (v_id, v_uid, 'owner');

  update public.profiles
     set active_household_id = v_id, updated_at = now()
   where id = v_uid;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.join_household(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'Necesitas iniciar sesión';
  end if;

  select id into v_id
    from public.households
   where invite_code = upper(btrim(p_code));

  if v_id is null then
    raise exception 'Ese código no existe. Revísalo con quien te invitó.';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_id, v_uid, 'member')
  on conflict (household_id, user_id) do nothing;

  update public.profiles
     set active_household_id = v_id, updated_at = now()
   where id = v_uid;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Salir del hogar.
--
-- Devuelve 'deleted' si el hogar se borró (eras la única persona) o 'left' si
-- sigue en pie. El cliente usa la respuesta para saber qué mensaje mostrar,
-- pero en los dos casos tiene que BORRAR SU ESPEJO LOCAL: aquí se corta el
-- acceso al servidor, no la copia que ya está en el teléfono.
-- ---------------------------------------------------------------------------
create or replace function public.leave_household(p_household_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_role   text;
  v_others int;
begin
  select role into v_role
    from public.household_members
   where household_id = p_household_id and user_id = v_uid;

  if v_role is null then
    raise exception 'No perteneces a este hogar';
  end if;

  select count(*) into v_others
    from public.household_members
   where household_id = p_household_id and user_id <> v_uid;

  if v_others = 0 then
    -- Última persona: el hogar quedaría huérfano y sus datos inalcanzables
    -- para siempre, así que se borra entero. El cliente ya avisó de lo que se
    -- pierde antes de llegar aquí.
    delete from public.households where id = p_household_id;
    update public.profiles set active_household_id = null, updated_at = now() where id = v_uid;
    return 'deleted';
  end if;

  if v_role = 'owner' then
    raise exception 'Antes de salir, pasa el mando a otra persona del hogar';
  end if;

  delete from public.household_members
   where household_id = p_household_id and user_id = v_uid;

  update public.profiles set active_household_id = null, updated_at = now() where id = v_uid;
  return 'left';
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.transfer_ownership(p_household_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.household_members
     where household_id = p_household_id and user_id = v_uid and role = 'owner'
  ) then
    raise exception 'Solo quien manda en el hogar puede pasar el mando';
  end if;

  if not exists (
    select 1 from public.household_members
     where household_id = p_household_id and user_id = p_user_id
  ) then
    raise exception 'Esa persona no pertenece a este hogar';
  end if;

  update public.household_members set role = 'owner'
   where household_id = p_household_id and user_id = p_user_id;

  update public.household_members set role = 'member'
   where household_id = p_household_id and user_id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.remove_member(p_household_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.household_members
     where household_id = p_household_id and user_id = v_uid and role = 'owner'
  ) then
    raise exception 'Solo quien manda en el hogar puede sacar a alguien';
  end if;

  if p_user_id = v_uid then
    -- Salir de tu propio hogar tiene reglas distintas (¿queda alguien?, ¿hay
    -- que pasar el mando?), y están en leave_household.
    raise exception 'Para salir tú, usa salir del hogar';
  end if;

  delete from public.household_members
   where household_id = p_household_id and user_id = p_user_id;

  update public.profiles
     set active_household_id = null, updated_at = now()
   where id = p_user_id and active_household_id = p_household_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- El código no caduca solo; esto es para cuando se filtra. Invalida el anterior
-- sin echar a nadie de los que ya entraron.
-- ---------------------------------------------------------------------------
create or replace function public.regenerate_invite_code(p_household_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not exists (
    select 1 from public.household_members
     where household_id = p_household_id
       and user_id = (select auth.uid())
       and role = 'owner'
  ) then
    raise exception 'Solo quien manda en el hogar puede cambiar el código';
  end if;

  v_code := public.generate_invite_code();
  update public.households
     set invite_code = v_code, updated_at = now()
   where id = p_household_id;

  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Solo las RPC de cara al usuario se exponen. generate_invite_code es interna:
-- si fuese llamable, se podrían sondear códigos existentes.
-- ---------------------------------------------------------------------------
revoke all on function public.generate_invite_code() from public;
revoke all on function public.create_household(text) from public;
revoke all on function public.join_household(text) from public;
revoke all on function public.leave_household(uuid) from public;
revoke all on function public.transfer_ownership(uuid, uuid) from public;
revoke all on function public.remove_member(uuid, uuid) from public;
revoke all on function public.regenerate_invite_code(uuid) from public;

grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.leave_household(uuid) to authenticated;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════
-- ║  0004_catalog.sql
-- ╚══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- Catálogo: supers, productos y el precio de cada producto en cada super.
--
-- Las tres columnas que hacen posible el offline y que llevan TODAS las tablas
-- sincronizables:
--
--   id          lo genera el cliente (crypto.randomUUID). Sin eso, un producto
--               creado sin señal no podría tener precios apuntándole hasta
--               después de sincronizar. El default es solo una red de
--               seguridad para inserciones desde el servidor.
--   updated_at  lo pone el servidor por trigger. Eje del delta.
--   deleted_at  borrado suave. Una fila ausente es indistinguible de una que
--               nunca existió, así que sin esto los borrados nunca llegarían
--               al otro dispositivo.
--
-- Y por lo mismo, todos los índices únicos son PARCIALES (where deleted_at is
-- null): si no, borrar el huevo de Walmart y volverlo a agregar chocaría contra
-- la restricción de un registro que el usuario ya no ve.
-- ============================================================================

create table public.stores (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        not null references public.households on delete cascade,
  name         text        not null check (btrim(name) <> ''),
  color        text        not null default '#D62E6A',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  created_by   uuid        references auth.users on delete set null,
  updated_by   uuid        references auth.users on delete set null
);

create unique index stores_name_uq
  on public.stores (household_id, public.norm_text(name))
  where deleted_at is null;

-- Índice del pull incremental: "dame lo que cambió en mi hogar desde X".
create index stores_sync_idx on public.stores (household_id, updated_at);

create table public.products (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        not null references public.households on delete cascade,
  name         text        not null check (btrim(name) <> ''),
  brand        text,
  unit         text        not null default 'pieza' check (unit in ('pieza', 'kg', 'l')),
  -- Foto genérica de respaldo. La que se enseña normalmente es la del super
  -- concreto (product_prices.photo_path), porque la marca cambia entre tiendas.
  photo_path   text,
  notes        text,
  last_used_at timestamptz,
  search_key   text generated always as (
                 public.norm_text(name || ' ' || coalesce(brand, ''))
               ) stored,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  created_by   uuid        references auth.users on delete set null,
  updated_by   uuid        references auth.users on delete set null
);

-- Respaldo para cuando el catálogo crezca. La búsqueda que siente el usuario
-- corre en el cliente sobre el espejo local, porque debe funcionar sin señal.
create index products_search_trgm
  on public.products using gin (search_key extensions.gin_trgm_ops);
create index products_sync_idx on public.products (household_id, updated_at);

create table public.product_prices (
  id           uuid          primary key default gen_random_uuid(),
  household_id uuid          not null references public.households on delete cascade,
  product_id   uuid          not null references public.products on delete cascade,
  store_id     uuid          not null references public.stores on delete cascade,
  price        numeric(10,2) not null check (price > 0),
  -- La foto de ESTE super: es la que deja ver qué marca es la barata aquí.
  photo_path   text,
  package_note text,
  created_at   timestamptz   not null default now(),
  updated_at   timestamptz   not null default now(),
  deleted_at   timestamptz,
  created_by   uuid          references auth.users on delete set null,
  updated_by   uuid          references auth.users on delete set null
);

-- Un solo precio vivo por producto y super. Editarlo es un UPDATE; quitarlo de
-- un super concreto es marcar deleted_at, sin tocar los demás supers.
create unique index product_prices_uq
  on public.product_prices (product_id, store_id)
  where deleted_at is null;

create index product_prices_sync_idx  on public.product_prices (household_id, updated_at);
create index product_prices_product_idx on public.product_prices (product_id) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Metadatos automáticos
-- ---------------------------------------------------------------------------
create trigger stores_meta         before insert or update on public.stores
  for each row execute function public.set_row_meta();
create trigger products_meta       before insert or update on public.products
  for each row execute function public.set_row_meta();
create trigger product_prices_meta before insert or update on public.product_prices
  for each row execute function public.set_row_meta();

-- ---------------------------------------------------------------------------
-- Borrar un super o un producto arrastra sus precios.
--
-- Sin esto, el espejo local se quedaría con precios huérfanos: filas que
-- apuntan a algo que el usuario ya borró. Las vistas los filtran, pero el
-- cliente tendría que repetir esa lógica en cada consulta.
--
-- Es cascada de borrado SUAVE, así que también viaja por el delta y desaparece
-- del otro teléfono.
-- ---------------------------------------------------------------------------
create or replace function public.cascade_soft_delete()
returns trigger
language plpgsql
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    if tg_table_name = 'stores' then
      update public.product_prices
         set deleted_at = new.deleted_at
       where store_id = new.id and deleted_at is null;
    elsif tg_table_name = 'products' then
      update public.product_prices
         set deleted_at = new.deleted_at
       where product_id = new.id and deleted_at is null;
    end if;
  end if;
  return new;
end;
$$;

create trigger stores_cascade_delete   after update on public.stores
  for each row execute function public.cascade_soft_delete();
create trigger products_cascade_delete after update on public.products
  for each row execute function public.cascade_soft_delete();

-- ---------------------------------------------------------------------------
-- RLS: todo se filtra por pertenencia al hogar.
--
-- El WITH CHECK del insert es tan importante como el USING: sin él, alguien
-- podría escribir filas en un hogar ajeno mandando su household_id.
-- ---------------------------------------------------------------------------
alter table public.stores         enable row level security;
alter table public.products       enable row level security;
alter table public.product_prices enable row level security;

create policy "stores: solo mi hogar" on public.stores
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "products: solo mi hogar" on public.products
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "product_prices: solo mi hogar" on public.product_prices
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Permisos de tabla (ver la nota en 0002: sin esto, "permission denied").
--
-- Se concede SELECT, INSERT y UPDATE pero **deliberadamente NO DELETE**: en
-- esta app todo borrado es suave, o sea un UPDATE de deleted_at. Al no dar el
-- privilegio, ningún error del cliente ni ninguna sesión robada puede destruir
-- datos de verdad; lo peor que puede pasar es marcarlos como borrados, y eso
-- se deshace.
-- ---------------------------------------------------------------------------
grant select, insert, update on public.stores         to authenticated;
grant select, insert, update on public.products       to authenticated;
grant select, insert, update on public.product_prices to authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════
-- ║  0005_price_history.sql
-- ╚══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- Historial de precios.
--
-- Solo lectura para el cliente: lo llena un trigger. Sirve para responder
-- "¿esto subió desde la última vez que lo compré?" sin tener que recordarlo.
-- ============================================================================

create table public.price_history (
  id               bigint        generated always as identity primary key,
  household_id     uuid          not null references public.households on delete cascade,
  product_price_id uuid          references public.product_prices on delete cascade,
  product_id       uuid          not null references public.products on delete cascade,
  store_id         uuid          not null references public.stores on delete cascade,
  price            numeric(10,2) not null,
  recorded_at      timestamptz   not null default now(),
  recorded_by      uuid          references auth.users on delete set null
);

create index price_history_lookup_idx
  on public.price_history (product_id, store_id, recorded_at desc);
create index price_history_sync_idx
  on public.price_history (household_id, recorded_at);

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER a propósito: price_history tiene RLS sin política de INSERT,
-- así que nadie puede escribirla desde el cliente. Solo este trigger, que corre
-- como el dueño de la función y por tanto salta RLS, puede añadir filas. El
-- historial no se puede falsificar.
-- ---------------------------------------------------------------------------
create or replace function public.record_price_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- `is distinct from` y no `<>`: un UPDATE puede tocar la columna price sin
  -- cambiar su valor (p. ej. al reenviar la fila entera desde la cola offline),
  -- y eso no es un cambio de precio.
  if tg_op = 'INSERT' or new.price is distinct from old.price then
    insert into public.price_history (
      household_id, product_price_id, product_id, store_id, price, recorded_by
    )
    values (
      new.household_id, new.id, new.product_id, new.store_id, new.price, auth.uid()
    );
  end if;
  return null;
end;
$$;

create trigger product_prices_history
  after insert or update of price on public.product_prices
  for each row execute function public.record_price_change();

alter table public.price_history enable row level security;

-- Solo SELECT. Sin políticas de insert, update ni delete: el historial es
-- inmutable desde fuera.
create policy "price_history: solo lectura de mi hogar"
  on public.price_history for select to authenticated
  using (public.is_household_member(household_id));

-- Solo SELECT también a nivel de privilegio: doble cerrojo sobre una tabla que
-- debe ser inmutable desde fuera.
grant select on public.price_history to authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════
-- ║  0006_lists.sql
-- ╚══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- Listas de compra.
-- ============================================================================

create table public.shopping_lists (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        not null references public.households on delete cascade,
  name         text        not null check (btrim(name) <> ''),
  status       text        not null default 'activa'
                           check (status in ('activa', 'completada', 'archivada')),
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  created_by   uuid        references auth.users on delete set null,
  updated_by   uuid        references auth.users on delete set null
);

create index shopping_lists_sync_idx on public.shopping_lists (household_id, updated_at);

create table public.list_items (
  id              uuid          primary key default gen_random_uuid(),
  household_id    uuid          not null references public.households on delete cascade,
  list_id         uuid          not null references public.shopping_lists on delete cascade,
  product_id      uuid          not null references public.products on delete cascade,

  -- SIEMPRE en la unidad base del producto: piezas, KILOS o LITROS.
  -- 0.5 con unit='kg' son 500 g. Guardarlo así es lo que hace que el subtotal
  -- sea precio × cantidad para los tres tipos, sin casos especiales.
  quantity        numeric(10,3) not null default 1 check (quantity > 0),

  -- NULL = "el más barato", que es el comportamiento por defecto. Con valor,
  -- el usuario fijó a mano un super concreto porque va a ir a ese de todas
  -- formas.
  pinned_store_id uuid          references public.stores on delete set null,

  is_checked      boolean       not null default false,
  checked_at      timestamptz,
  note            text,
  -- `sort_order` y no `position`: position es palabra clave de SQL y complica
  -- las consultas sin ganar nada.
  sort_order      integer       not null default 0,

  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now(),
  deleted_at      timestamptz,
  created_by      uuid          references auth.users on delete set null,
  updated_by      uuid          references auth.users on delete set null
);

-- Un producto no se repite dentro de una lista: si lo agregas otra vez, se
-- suma a la cantidad existente en lugar de crear una fila duplicada.
create unique index list_items_uq
  on public.list_items (list_id, product_id)
  where deleted_at is null;

create index list_items_sync_idx on public.list_items (household_id, updated_at);
create index list_items_list_idx on public.list_items (list_id) where deleted_at is null;

create trigger shopping_lists_meta before insert or update on public.shopping_lists
  for each row execute function public.set_row_meta();
create trigger list_items_meta     before insert or update on public.list_items
  for each row execute function public.set_row_meta();

-- ---------------------------------------------------------------------------
-- Se amplía la cascada de borrado suave definida en 0004 para cubrir también
-- las listas. Es la misma idea: si algo se borra, lo que dependía de ello no
-- puede quedarse vivo y huérfano en el espejo local de cada teléfono.
-- ---------------------------------------------------------------------------
create or replace function public.cascade_soft_delete()
returns trigger
language plpgsql
as $$
begin
  if new.deleted_at is null or old.deleted_at is not null then
    return new;
  end if;

  if tg_table_name = 'stores' then
    update public.product_prices
       set deleted_at = new.deleted_at
     where store_id = new.id and deleted_at is null;

  elsif tg_table_name = 'products' then
    update public.product_prices
       set deleted_at = new.deleted_at
     where product_id = new.id and deleted_at is null;
    update public.list_items
       set deleted_at = new.deleted_at
     where product_id = new.id and deleted_at is null;

  elsif tg_table_name = 'shopping_lists' then
    update public.list_items
       set deleted_at = new.deleted_at
     where list_id = new.id and deleted_at is null;
  end if;

  return new;
end;
$$;

create trigger shopping_lists_cascade_delete after update on public.shopping_lists
  for each row execute function public.cascade_soft_delete();

-- ---------------------------------------------------------------------------
alter table public.shopping_lists enable row level security;
alter table public.list_items     enable row level security;

create policy "shopping_lists: solo mi hogar" on public.shopping_lists
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "list_items: solo mi hogar" on public.list_items
  for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- Sin DELETE, igual que el catálogo: todo borrado aquí es suave.
grant select, insert, update on public.shopping_lists to authenticated;
grant select, insert, update on public.list_items     to authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════
-- ║  0007_views.sql
-- ╚══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- Vistas: el motor del "mejor precio".
--
-- En ejecución, el cliente calcula esto mismo sobre su espejo local
-- (src/lib/pricing.ts), porque tiene que funcionar sin señal. Estas vistas son
-- la definición de referencia y el patrón contra el que se comparan las pruebas
-- del cliente, para que las dos implementaciones no se separen.
--
-- `security_invoker = on` es obligatorio: sin él, una vista corre con los
-- permisos de quien la creó y se saltaría RLS, filtrando los precios de todos
-- los hogares.
-- ============================================================================

create view public.best_prices
with (security_invoker = on) as
select distinct on (pp.product_id)
  pp.product_id,
  pp.id            as product_price_id,
  pp.store_id,
  pp.price,
  pp.household_id,
  coalesce(pp.photo_path, p.photo_path) as photo_path,
  s.name           as store_name,
  s.color          as store_color,
  pp.updated_at    as price_updated_at
from public.product_prices pp
join public.stores   s on s.id = pp.store_id   and s.deleted_at is null
join public.products p on p.id = pp.product_id and p.deleted_at is null
where pp.deleted_at is null
-- El distinct on se queda con la primera fila de cada product_id según este
-- orden: el más barato, y ante empate el capturado más recientemente.
order by pp.product_id, pp.price asc, pp.updated_at desc;

comment on view public.best_prices is
  'Un renglón por producto: el super donde está más barato, con la foto de ESE super.';

-- ---------------------------------------------------------------------------
create view public.list_items_resolved
with (security_invoker = on) as
select
  li.id,
  li.household_id,
  li.list_id,
  li.product_id,
  li.quantity,
  li.pinned_store_id,
  li.is_checked,
  li.checked_at,
  li.note,
  li.sort_order,
  li.updated_at,
  p.name  as product_name,
  p.brand,
  p.unit,

  -- El coalesce va sobre tienda Y precio a la vez, no por separado. Si fijaste
  -- Walmart y después borraste ese precio, `pin` no trae ninguna fila y los
  -- dos campos caen juntos al mejor precio. Resolviéndolos por separado
  -- saldría el nombre de Walmart con el importe de otra tienda.
  coalesce(pin.store_id,   bp.store_id)                   as effective_store_id,
  coalesce(pin.price,      bp.price)                      as unit_price,
  coalesce(pin.photo_path, bp.photo_path, p.photo_path)   as photo_path,
  round(coalesce(pin.price, bp.price) * li.quantity, 2)   as subtotal

from public.list_items li
join public.products p on p.id = li.product_id
left join public.best_prices bp on bp.product_id = li.product_id
left join public.product_prices pin
       on pin.product_id = li.product_id
      and pin.store_id   = li.pinned_store_id
      and pin.deleted_at is null
where li.deleted_at is null;

comment on view public.list_items_resolved is
  'Cada renglón de lista ya resuelto: super efectivo, precio unitario y subtotal. effective_store_id NULL = al producto le falta precio en todos lados.';

grant select on public.best_prices          to authenticated;
grant select on public.list_items_resolved  to authenticated;


-- ╔══════════════════════════════════════════════════════════════════════════
-- ║  0008_storage.sql
-- ╚══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- Almacén de fotos.
--
-- Bucket PÚBLICO en lectura a propósito: así las fotos las sirve el CDN y el
-- service worker puede cachearlas con CacheFirst para que se vean en el pasillo
-- sin señal. Con URLs firmadas eso no funcionaría — caducan, y una URL caducada
-- en el caché es una foto rota justo cuando más falta hace.
--
-- Fotos de despensa no son información sensible; lo que sí está protegido es
-- ESCRIBIR, que se limita a tu propio hogar.
--
-- Convención de ruta:  {household_id}/{uuid}.webp
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fotos',
  'fotos',
  true,
  2097152, -- 2 MB. El cliente comprime a ~80 KB; esto es solo un tope de cordura.
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- ¿La carpeta raíz de esta ruta es un hogar al que pertenezco?
--
-- El CASE no es adorno: SQL no garantiza que un AND evalúe de izquierda a
-- derecha, así que sin él el cast a uuid podría ejecutarse antes que el regex
-- y reventar con cualquier nombre de archivo que no fuese un uuid.
-- ---------------------------------------------------------------------------
create or replace function public.storage_path_is_mine(object_name text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when object_name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
      then public.is_household_member(split_part(object_name, '/', 1)::uuid)
    else false
  end;
$$;

revoke all on function public.storage_path_is_mine(text) from public;
grant execute on function public.storage_path_is_mine(text) to authenticated;

-- ---------------------------------------------------------------------------
create policy "fotos: lectura pública"
  on storage.objects for select to public
  using (bucket_id = 'fotos');

create policy "fotos: subir solo a mi hogar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.storage_path_is_mine(name));

create policy "fotos: reemplazar solo en mi hogar"
  on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and public.storage_path_is_mine(name))
  with check (bucket_id = 'fotos' and public.storage_path_is_mine(name));

create policy "fotos: borrar solo en mi hogar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.storage_path_is_mine(name));


-- ╔══════════════════════════════════════════════════════════════════════════
-- ║  0009_realtime.sql
-- ╚══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- Realtime.
--
-- El cliente NO aplica el payload que llega por el canal: lo usa solo como
-- señal para disparar un syncPull incremental. Aplicarlo directo competiría con
-- la cola de salida y podría pisar un cambio local que aún no ha subido.
--
-- Para qué sirve en la práctica: si dos personas del hogar están en el súper a
-- la vez, cada una ve los productos que la otra va tachando.
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'stores', 'products', 'product_prices',
    'shopping_lists', 'list_items',
    'households', 'household_members'
  ]
  loop
    -- La publicación ya existe en Supabase y puede traer tablas añadidas antes;
    -- el bloque hace la operación repetible sin fallar en un `db reset`.
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;


commit;
