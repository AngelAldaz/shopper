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
