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
