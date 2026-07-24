-- ============================================================================
-- Hogares: la unidad de propiedad de TODO lo demás.
--
-- Reglas que pidió el usuario:
--   · La membresía no caduca nunca.
--   · Quien se sale pierde el acceso; quien se queda conserva todo intacto.
-- ============================================================================

create table public.profiles (
  id                  uuid primary key references auth.users on delete cascade,
  display_name        text        not null default '',
  active_household_id uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.households (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null check (btrim(name) <> ''),
  invite_code text        not null unique,
  created_by  uuid        references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.household_members (
  household_id uuid        not null references public.households on delete cascade,
  user_id      uuid        not null references auth.users on delete cascade,
  role         text        not null default 'member' check (role in ('owner', 'member')),
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_idx on public.household_members (user_id);

-- Si el hogar desaparece, el perfil se queda sin hogar activo en vez de
-- apuntar a una fila que ya no existe.
alter table public.profiles
  add constraint profiles_active_household_fk
  foreign key (active_household_id) references public.households on delete set null;

-- ---------------------------------------------------------------------------
-- ¿Pertenezco a este hogar?
--
-- SECURITY DEFINER no es un atajo: es lo que evita la recursión infinita. Una
-- política sobre household_members que consultara household_members se
-- invocaría a sí misma. Al ejecutarse como el dueño de la función, la consulta
-- de dentro no pasa por RLS y corta el ciclo.
--
-- Devuelve boolean y no filas: es lo que hace que sea seguro exponerla.
-- ---------------------------------------------------------------------------
create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = hid
      and user_id = (select auth.uid())
  );
$$;

-- ¿Comparto hogar con esta persona? Para poder ver su nombre en la lista de
-- miembros sin abrir todos los perfiles de la base.
create or replace function public.shares_household_with(other_user uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members mine
    join public.household_members theirs on theirs.household_id = mine.household_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = other_user
  );
$$;

revoke all on function public.is_household_member(uuid) from public;
revoke all on function public.shares_household_with(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.shares_household_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Alta automática del perfil al registrarse.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.households        enable row level security;
alter table public.household_members enable row level security;

-- auth.uid() va siempre envuelto en (select ...): así Postgres lo evalúa una
-- vez por consulta en lugar de una vez por fila.

create policy "profiles: el mío y los de mi hogar"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_household_with(id));

create policy "profiles: solo edito el mío"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "households: solo los míos"
  on public.households for select to authenticated
  using (public.is_household_member(id));

create policy "households: los edita quien manda"
  on public.households for update to authenticated
  using (
    exists (
      select 1 from public.household_members
      where household_id = households.id
        and user_id = (select auth.uid())
        and role = 'owner'
    )
  )
  with check (public.is_household_member(id));

-- Sin INSERT ni DELETE directos sobre households: se crean y se borran por RPC,
-- que es donde vive la regla de "el último que sale se lleva el hogar".

create policy "miembros: veo a los de mis hogares"
  on public.household_members for select to authenticated
  using (public.is_household_member(household_id));

-- Tampoco hay INSERT/UPDATE/DELETE directos sobre household_members: unirse,
-- salir, expulsar y transferir pasan por RPC. Si se pudiera insertar a mano,
-- cualquiera podría meterse en un hogar ajeno escribiendo su id.
