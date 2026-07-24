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
