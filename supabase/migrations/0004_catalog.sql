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
