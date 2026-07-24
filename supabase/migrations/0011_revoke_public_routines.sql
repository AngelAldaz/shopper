-- ============================================================================
-- Quitar la concesión implícita a PUBLIC en todas las funciones.
--
-- Postgres crea TODA función con EXECUTE concedido al pseudo-rol PUBLIC. Eso es
-- una vía distinta de la de 0010: allí se revocó al rol `anon`, pero una
-- función que siga concedida a PUBLIC la puede ejecutar cualquiera igual.
--
-- Se detectó sondeando producción tras aplicar 0010: todo quedó bloqueado menos
-- public.norm_text, la única a la que nunca le hice un `revoke ... from public`
-- explícito. No filtra nada (solo pasa a minúsculas y quita acentos), pero es
-- superficie de API que no debería existir, y sobre todo delataba que el cierre
-- no era completo.
--
-- Después de revocar se vuelven a conceder, una por una, solo las que hacen
-- falta en tiempo de ejecución:
--   · is_household_member  → la usan todas las políticas RLS
--   · shares_household_with → la usa la política de profiles
--   · storage_path_is_mine  → la usan las políticas de storage
--   · norm_text             → columna generada e índice único
--
-- Las de trigger (set_row_meta, cascade_soft_delete, record_price_change,
-- handle_new_user) NO se conceden: las invoca el motor al disparar el trigger,
-- no el usuario, y PostgREST tampoco puede exponerlas porque devuelven trigger.
-- ============================================================================

revoke execute on all functions in schema public from public;

-- Que las funciones futuras tampoco nazcan concedidas a PUBLIC.
alter default privileges in schema public revoke execute on functions from public;

grant execute on function public.is_household_member(uuid)   to authenticated;
grant execute on function public.shares_household_with(uuid) to authenticated;
grant execute on function public.storage_path_is_mine(text)  to authenticated;

-- norm_text alimenta la columna generada products.search_key y el índice único
-- de stores. Se concede a authenticated porque esas expresiones se evalúan al
-- insertar y actualizar, con el rol de quien escribe.
grant execute on function public.norm_text(text) to authenticated;

-- Las RPC del hogar vuelven a necesitar su concesión: el revoke de arriba las
-- alcanzó también.
grant execute on function public.create_household(text)              to authenticated;
grant execute on function public.join_household(text)                to authenticated;
grant execute on function public.leave_household(uuid)               to authenticated;
grant execute on function public.transfer_ownership(uuid, uuid)      to authenticated;
grant execute on function public.remove_member(uuid, uuid)           to authenticated;
grant execute on function public.regenerate_invite_code(uuid)        to authenticated;

-- Y el generador de códigos sigue sin ser llamable por nadie desde fuera; las
-- RPC que lo usan por dentro son SECURITY DEFINER.
revoke all on function public.generate_invite_code() from public, anon, authenticated;
