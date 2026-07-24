-- ============================================================================
-- Pruebas del esquema. Se ejecutan contra el Supabase local:
--
--   npm run db:test
--
-- Si termina sin lanzar excepción, todo pasó. Se corre dentro de una
-- transacción con ROLLBACK al final, así que no deja rastro.
--
-- Lo que se comprueba no es que el SQL compile, sino las tres cosas que pueden
-- romperse en silencio y arruinar la app:
--   1. Que RLS aísle de verdad los hogares.
--   2. Que la vista de mejor precio elija bien, incluidos los casos raros.
--   3. Que el borrado suave se propague en cascada.
-- ============================================================================

\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.check(cond boolean, msg text)
returns void language plpgsql as $$
begin
  if cond is not true then
    raise exception E'\n  ✗ %', msg;
  end if;
  raise notice '  ✓ %', msg;
end;
$$;

-- Entra en la piel de un usuario autenticado: es como PostgREST fija la
-- identidad, y por tanto la única forma honesta de probar RLS.
create or replace function pg_temp.act_as(uid uuid)
returns void language plpgsql as $$
begin
  execute format('set local role authenticated');
  execute format('set local request.jwt.claims = %L', json_build_object('sub', uid, 'role', 'authenticated')::text);
end;
$$;

create or replace function pg_temp.act_as_admin()
returns void language plpgsql as $$
begin
  reset role;
  set local request.jwt.claims = '';
end;
$$;

-- ---------------------------------------------------------------------------
\echo ''
\echo '── norm_text ────────────────────────────────────────────────'
-- ---------------------------------------------------------------------------
select pg_temp.check(public.norm_text('Piña')      = 'pina',  'la ñ se convierte en n, no en otra letra');
select pg_temp.check(public.norm_text('Año Nuevo') = 'ano nuevo', 'año no se corrompe');
select pg_temp.check(public.norm_text('Azúcar')    = 'azucar', 'quita acentos de vocales');
select pg_temp.check(public.norm_text('Pingüino')  = 'pinguino', 'maneja diéresis');
select pg_temp.check(public.norm_text('Açaí')      = 'acai',  'maneja cedilla');
select pg_temp.check(public.norm_text(null)        = '',      'tolera null');
-- El bug original: cadenas de translate de distinta longitud. Se comprueba de
-- frente para que nadie lo reintroduzca al editar la lista de caracteres.
select pg_temp.check(
  length('áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ') =
  length('aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'),
  'las dos cadenas de translate miden lo mismo'
);

-- ---------------------------------------------------------------------------
\echo ''
\echo '── preparación: tres usuarios ───────────────────────────────'
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'ana@test.mx', 'x', now(),
   '{"provider":"email"}', '{"display_name":"Ana"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'beto@test.mx', 'x', now(),
   '{"provider":"email"}', '{"display_name":"Beto"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'ajeno@test.mx', 'x', now(),
   '{"provider":"email"}', '{"display_name":"Ajeno"}', now(), now());

select pg_temp.check(
  (select count(*) from public.profiles
    where id in ('11111111-1111-1111-1111-111111111111',
                 '22222222-2222-2222-2222-222222222222',
                 '33333333-3333-3333-3333-333333333333')) = 3,
  'el trigger de auth.users creó los tres perfiles'
);

-- ---------------------------------------------------------------------------
\echo ''
\echo '── hogar compartido ─────────────────────────────────────────'
-- ---------------------------------------------------------------------------
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

select public.create_household('Casa') as hogar \gset
select pg_temp.check(:'hogar' is not null, 'Ana crea su hogar');
select pg_temp.check(
  (select active_household_id from public.profiles where id = '11111111-1111-1111-1111-111111111111') = :'hogar'::uuid,
  'el hogar queda activo en su perfil'
);

select invite_code as codigo from public.households where id = :'hogar'::uuid \gset
select pg_temp.check(length(:'codigo') = 6, 'el código de invitación tiene 6 caracteres');
select pg_temp.check(:'codigo' !~ '[ILO01]', 'el código evita caracteres que se confunden al dictarlo');

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select public.join_household(:'codigo');
select pg_temp.check(
  (select count(*) from public.household_members where household_id = :'hogar'::uuid) = 2,
  'Beto se une con el código'
);

-- ---------------------------------------------------------------------------
\echo ''
\echo '── catálogo y mejor precio ──────────────────────────────────'
-- ---------------------------------------------------------------------------
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');

insert into public.stores (id, household_id, name, color) values
  ('aaaaaaaa-0000-4000-8000-000000000001', :'hogar'::uuid, 'Walmart', '#2E77BB'),
  ('aaaaaaaa-0000-4000-8000-000000000002', :'hogar'::uuid, 'Soriana', '#D94F4F'),
  ('aaaaaaaa-0000-4000-8000-000000000003', :'hogar'::uuid, 'Chedraui', '#E8623D');

insert into public.products (id, household_id, name, brand, unit) values
  ('bbbbbbbb-0000-4000-8000-000000000001', :'hogar'::uuid, 'Huevo blanco', 'San Juan', 'pieza'),
  ('bbbbbbbb-0000-4000-8000-000000000002', :'hogar'::uuid, 'Aguacate hass', null, 'kg'),
  ('bbbbbbbb-0000-4000-8000-000000000003', :'hogar'::uuid, 'Piña', null, 'kg');

select pg_temp.check(
  (select search_key from public.products where id = 'bbbbbbbb-0000-4000-8000-000000000003') = 'pina ',
  'la columna generada search_key normaliza la ñ'
);

-- El mismo huevo en tres supers a distinto precio: el caso central de la app.
insert into public.product_prices (id, household_id, product_id, store_id, price) values
  ('cccccccc-0000-4000-8000-000000000001', :'hogar'::uuid, 'bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 62.00),
  ('cccccccc-0000-4000-8000-000000000002', :'hogar'::uuid, 'bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002', 58.50),
  ('cccccccc-0000-4000-8000-000000000003', :'hogar'::uuid, 'bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000003', 71.00),
  ('cccccccc-0000-4000-8000-000000000004', :'hogar'::uuid, 'bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 89.90);

select pg_temp.check(
  (select store_id from public.best_prices where product_id = 'bbbbbbbb-0000-4000-8000-000000000001')
    = 'aaaaaaaa-0000-4000-8000-000000000002'::uuid,
  'best_prices elige Soriana, que es el más barato de los tres'
);
select pg_temp.check(
  (select count(*) from public.best_prices where product_id = 'bbbbbbbb-0000-4000-8000-000000000001') = 1,
  'best_prices da exactamente un renglón por producto'
);
select pg_temp.check(
  (select count(*) from public.best_prices where product_id = 'bbbbbbbb-0000-4000-8000-000000000003') = 0,
  'un producto sin ningún precio no aparece en best_prices'
);

-- Baja el precio del más caro por debajo del resto: la elección debe moverse.
update public.product_prices set price = 49.00
 where id = 'cccccccc-0000-4000-8000-000000000003';
select pg_temp.check(
  (select store_id from public.best_prices where product_id = 'bbbbbbbb-0000-4000-8000-000000000001')
    = 'aaaaaaaa-0000-4000-8000-000000000003'::uuid,
  'al bajar el precio de Chedraui, best_prices cambia de super solo'
);

-- ---------------------------------------------------------------------------
\echo ''
\echo '── historial de precios ─────────────────────────────────────'
-- ---------------------------------------------------------------------------
select pg_temp.check(
  (select count(*) from public.price_history
    where product_id = 'bbbbbbbb-0000-4000-8000-000000000001'
      and store_id = 'aaaaaaaa-0000-4000-8000-000000000003') = 2,
  'el historial guarda el alta y el cambio de precio'
);

-- Un UPDATE que toca price sin cambiar el valor no es un cambio de precio.
update public.product_prices set price = 49.00
 where id = 'cccccccc-0000-4000-8000-000000000003';
select pg_temp.check(
  (select count(*) from public.price_history
    where product_id = 'bbbbbbbb-0000-4000-8000-000000000001'
      and store_id = 'aaaaaaaa-0000-4000-8000-000000000003') = 2,
  'reescribir el mismo precio no ensucia el historial'
);

-- ---------------------------------------------------------------------------
\echo ''
\echo '── quitar de UN super sin tocar los demás ───────────────────'
-- ---------------------------------------------------------------------------
update public.product_prices set deleted_at = now()
 where id = 'cccccccc-0000-4000-8000-000000000003';

select pg_temp.check(
  (select count(*) from public.product_prices
    where product_id = 'bbbbbbbb-0000-4000-8000-000000000001' and deleted_at is null) = 2,
  'quitar el huevo de Chedraui deja vivos los otros dos supers'
);
select pg_temp.check(
  (select store_id from public.best_prices where product_id = 'bbbbbbbb-0000-4000-8000-000000000001')
    = 'aaaaaaaa-0000-4000-8000-000000000002'::uuid,
  'y best_prices vuelve a Soriana'
);

-- El índice único es parcial, así que se puede volver a dar de alta.
insert into public.product_prices (household_id, product_id, store_id, price)
values (:'hogar'::uuid, 'bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000003', 55.00);
select pg_temp.check(true, 'se puede volver a agregar un precio borrado (índice único parcial)');

-- ---------------------------------------------------------------------------
\echo ''
\echo '── listas, gramaje y super fijado ───────────────────────────'
-- ---------------------------------------------------------------------------
insert into public.shopping_lists (id, household_id, name)
values ('dddddddd-0000-4000-8000-000000000001', :'hogar'::uuid, 'Despensa');

insert into public.list_items (id, household_id, list_id, product_id, quantity) values
  ('eeeeeeee-0000-4000-8000-000000000001', :'hogar'::uuid, 'dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 1),
  -- 500 g de aguacate a 89.90 el kilo → 44.95
  ('eeeeeeee-0000-4000-8000-000000000002', :'hogar'::uuid, 'dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 0.5),
  -- Producto sin ningún precio: tiene que aparecer, pero sin super.
  ('eeeeeeee-0000-4000-8000-000000000003', :'hogar'::uuid, 'dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000003', 1);

select pg_temp.check(
  (select subtotal from public.list_items_resolved where id = 'eeeeeeee-0000-4000-8000-000000000002') = 44.95,
  '500 g de un producto a 89.90 por kilo dan 44.95'
);
select pg_temp.check(
  (select effective_store_id from public.list_items_resolved where id = 'eeeeeeee-0000-4000-8000-000000000003') is null,
  'un producto sin precios sale con super nulo en vez de desaparecer'
);

-- Fijar un super a mano manda sobre el más barato.
update public.list_items set pinned_store_id = 'aaaaaaaa-0000-4000-8000-000000000001'
 where id = 'eeeeeeee-0000-4000-8000-000000000001';
select pg_temp.check(
  (select effective_store_id from public.list_items_resolved where id = 'eeeeeeee-0000-4000-8000-000000000001')
    = 'aaaaaaaa-0000-4000-8000-000000000001'::uuid
  and (select unit_price from public.list_items_resolved where id = 'eeeeeeee-0000-4000-8000-000000000001') = 62.00,
  'fijar Walmart a mano gana sobre el más barato, con SU precio'
);

-- EL CASO QUE JUSTIFICA EL COALESCE CONJUNTO: fijaste un super y luego se borró
-- ese precio. Tienda e importe tienen que caer JUNTOS al mejor precio; si se
-- resolvieran por separado saldría "Walmart" con el importe de Soriana.
update public.product_prices set deleted_at = now()
 where product_id = 'bbbbbbbb-0000-4000-8000-000000000001'
   and store_id = 'aaaaaaaa-0000-4000-8000-000000000001';

select pg_temp.check(
  (select effective_store_id from public.list_items_resolved where id = 'eeeeeeee-0000-4000-8000-000000000001')
    = 'aaaaaaaa-0000-4000-8000-000000000002'::uuid
  and (select unit_price from public.list_items_resolved where id = 'eeeeeeee-0000-4000-8000-000000000001') = 58.50,
  'si el precio fijado se borra, tienda e importe caen juntos al más barato'
);

-- ---------------------------------------------------------------------------
\echo ''
\echo '── cascada de borrado suave ─────────────────────────────────'
-- ---------------------------------------------------------------------------
update public.stores set deleted_at = now() where id = 'aaaaaaaa-0000-4000-8000-000000000002';
select pg_temp.check(
  (select count(*) from public.product_prices
    where store_id = 'aaaaaaaa-0000-4000-8000-000000000002' and deleted_at is null) = 0,
  'borrar un super arrastra sus precios'
);

update public.products set deleted_at = now() where id = 'bbbbbbbb-0000-4000-8000-000000000002';
select pg_temp.check(
  (select count(*) from public.list_items
    where product_id = 'bbbbbbbb-0000-4000-8000-000000000002' and deleted_at is null) = 0,
  'borrar un producto arrastra sus renglones de lista'
);

update public.shopping_lists set deleted_at = now() where id = 'dddddddd-0000-4000-8000-000000000001';
select pg_temp.check(
  (select count(*) from public.list_items
    where list_id = 'dddddddd-0000-4000-8000-000000000001' and deleted_at is null) = 0,
  'borrar una lista arrastra todos sus renglones'
);

-- ---------------------------------------------------------------------------
\echo ''
\echo '── RLS: aislamiento entre hogares ───────────────────────────'
-- ---------------------------------------------------------------------------
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select pg_temp.check(
  (select count(*) from public.stores) = 3,
  'Beto, que está en el hogar, ve los supers'
);

select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
select pg_temp.check((select count(*) from public.stores)         = 0, 'un ajeno no ve ningún super');
select pg_temp.check((select count(*) from public.products)       = 0, 'un ajeno no ve ningún producto');
select pg_temp.check((select count(*) from public.product_prices) = 0, 'un ajeno no ve ningún precio');
select pg_temp.check((select count(*) from public.shopping_lists) = 0, 'un ajeno no ve ninguna lista');
select pg_temp.check((select count(*) from public.list_items)     = 0, 'un ajeno no ve ningún renglón');
select pg_temp.check((select count(*) from public.price_history)  = 0, 'un ajeno no ve el historial');
select pg_temp.check((select count(*) from public.best_prices)    = 0, 'las vistas también respetan RLS (security_invoker)');
select pg_temp.check((select count(*) from public.households)     = 0, 'un ajeno no ve el hogar');

-- Escribir en un hogar ajeno mandando su id tiene que rebotar.
do $$
begin
  insert into public.stores (household_id, name)
  values ((select id from public.households limit 1), 'Intruso');
  raise exception '  ✗ un ajeno pudo escribir en un hogar que no es suyo';
exception
  when insufficient_privilege or not_null_violation then
    raise notice '  ✓ un ajeno no puede escribir en un hogar ajeno';
end;
$$;

-- ---------------------------------------------------------------------------
\echo ''
\echo '── salir del hogar ──────────────────────────────────────────'
-- ---------------------------------------------------------------------------
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
do $$
begin
  perform public.leave_household((select active_household_id from public.profiles
                                   where id = '11111111-1111-1111-1111-111111111111'));
  raise exception '  ✗ quien manda pudo salir dejando el hogar sin dueño';
exception
  when raise_exception then
    if sqlerrm like '%pasa el mando%' then
      raise notice '  ✓ quien manda no puede salir sin pasar el mando';
    else
      raise;
    end if;
end;
$$;

select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select public.leave_household(:'hogar'::uuid) as salida \gset
select pg_temp.check(:'salida' = 'left', 'un miembro sale y el hogar sigue en pie');
select pg_temp.check(
  (select count(*) from public.stores) = 0,
  'quien se sale deja de ver los datos al instante'
);

select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select pg_temp.check(
  (select count(*) from public.stores) = 3,
  'quien se queda conserva todo intacto'
);

select public.leave_household(:'hogar'::uuid) as salida2 \gset
select pg_temp.check(:'salida2' = 'deleted', 'la última persona en salir se lleva el hogar');

select pg_temp.act_as_admin();
select pg_temp.check(
  (select count(*) from public.households where id = :'hogar'::uuid) = 0,
  'y el hogar queda efectivamente borrado'
);

\echo ''
\echo '════════════════════════════════════════════════════════════'
\echo '  Todas las comprobaciones pasaron.'
\echo '════════════════════════════════════════════════════════════'
\echo ''

rollback;
