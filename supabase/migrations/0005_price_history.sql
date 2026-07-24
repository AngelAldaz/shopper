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
