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
