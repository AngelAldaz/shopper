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
