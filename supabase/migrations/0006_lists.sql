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
