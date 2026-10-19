-- =====================================================================
-- Finca Cafetera · Gestión contable
-- 0001 · Esquema inicial: tablas, reglas de seguridad (RLS) y funciones
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar todo → Run.
-- Resultado esperado: "Success. No rows returned".
-- =====================================================================

-- ---------- Tipos ----------
create type public.rol_usuario as enum ('admin', 'dueno');
create type public.tipo_gasto  as enum ('insumos', 'mano_obra', 'transporte');

-- ---------- Perfiles de usuario (uno por cada cuenta de Supabase Auth) ----------
create table public.perfiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  nombres            text not null check (char_length(trim(nombres))   between 1 and 80),
  apellidos          text not null check (char_length(trim(apellidos)) between 1 and 80),
  cedula             text not null unique check (cedula ~ '^[0-9]{6,10}$'),
  fecha_nacimiento   date not null check (fecha_nacimiento > date '1900-01-01'),
  correo             text not null,
  rol                public.rol_usuario not null,
  activo             boolean not null default true,
  debe_cambiar_clave boolean not null default true,
  autoriza_datos     boolean not null check (autoriza_datos),   -- Ley 1581 de 2012 (habeas data)
  creado_en          timestamptz not null default now()
);

-- ---------- Lotes de la finca ----------
create table public.lotes (
  id        bigint generated always as identity primary key,
  numero    integer not null unique check (numero > 0),
  nombre    text not null check (char_length(trim(nombre)) between 1 and 60),
  activo    boolean not null default true,
  creado_en timestamptz not null default now()
);

-- ---------- Compradores de café ----------
create table public.compradores (
  id         bigint generated always as identity primary key,
  nombre     text not null unique check (char_length(trim(nombre)) between 2 and 80),
  activo     boolean not null default true,
  creado_por uuid references public.perfiles (id) default auth.uid(),
  creado_en  timestamptz not null default now()
);

-- ---------- Producción (kilos recolectados por lote y fecha) ----------
create table public.produccion (
  id             bigint generated always as identity primary key,
  lote_id        bigint not null references public.lotes (id),
  fecha          date not null check (fecha > date '2000-01-01'),
  kilos          numeric(10,1) not null check (kilos > 0),
  registrado_por uuid not null default auth.uid() references public.perfiles (id),
  id_cliente     uuid unique,   -- evita duplicados al reenviar registros guardados sin señal
  creado_en      timestamptz not null default now()
);
create index produccion_fecha_idx on public.produccion (fecha);

-- ---------- Gastos ----------
create table public.gastos (
  id             bigint generated always as identity primary key,
  tipo           public.tipo_gasto not null,
  descripcion    text not null check (char_length(trim(descripcion)) between 1 and 200),
  valor          bigint not null check (valor > 0),          -- pesos colombianos, sin decimales
  fecha          date not null check (fecha > date '2000-01-01'),
  registrado_por uuid not null default auth.uid() references public.perfiles (id),
  creado_en      timestamptz not null default now()
);
create index gastos_fecha_idx on public.gastos (fecha);

-- ---------- Ventas ----------
create table public.ventas (
  id             bigint generated always as identity primary key,
  comprador_id   bigint not null references public.compradores (id),
  fecha          date not null check (fecha > date '2000-01-01'),
  kilos          numeric(10,1) not null check (kilos > 0),
  precio_kg      bigint not null check (precio_kg > 0),
  valor_total    bigint generated always as (round(kilos * precio_kg)::bigint) stored,
  registrado_por uuid not null default auth.uid() references public.perfiles (id),
  creado_en      timestamptz not null default now()
);
create index ventas_fecha_idx on public.ventas (fecha);

-- =====================================================================
-- Funciones de apoyo
-- =====================================================================

-- Rol del usuario que hace la consulta (NULL si no tiene perfil o está inactivo)
create or replace function public.fn_rol_actual()
returns public.rol_usuario
language sql stable security definer set search_path = public
as $$
  select rol from public.perfiles where id = auth.uid() and activo
$$;

-- Activar o desactivar a otro usuario (solo administrador, nunca a sí mismo)
create or replace function public.fn_cambiar_estado_usuario(p_usuario uuid, p_activo boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if public.fn_rol_actual() is distinct from 'admin' then
    raise exception 'Solo el administrador puede cambiar el estado de un usuario.';
  end if;
  if p_usuario = auth.uid() then
    raise exception 'No puede desactivar su propia cuenta.';
  end if;
  update public.perfiles set activo = p_activo where id = p_usuario;
  if not found then
    raise exception 'El usuario no existe.';
  end if;
end;
$$;

-- Marca que el usuario ya cambió su contraseña temporal
create or replace function public.fn_marcar_clave_cambiada()
returns void
language sql security definer set search_path = public
as $$
  update public.perfiles set debe_cambiar_clave = false where id = auth.uid()
$$;

revoke all on function public.fn_rol_actual()                            from public, anon;
revoke all on function public.fn_cambiar_estado_usuario(uuid, boolean)   from public, anon;
revoke all on function public.fn_marcar_clave_cambiada()                 from public, anon;
grant execute on function public.fn_rol_actual()                          to authenticated;
grant execute on function public.fn_cambiar_estado_usuario(uuid, boolean) to authenticated;
grant execute on function public.fn_marcar_clave_cambiada()               to authenticated;

-- =====================================================================
-- Permisos de tabla: nadie sin sesión ve nada; con sesión solo leer/insertar.
-- Las reglas de abajo (RLS) deciden QUIÉN puede hacer cada cosa.
-- =====================================================================
revoke all on public.perfiles, public.lotes, public.compradores,
              public.produccion, public.gastos, public.ventas from anon, authenticated;

grant select on public.perfiles, public.lotes, public.compradores,
                public.produccion, public.gastos, public.ventas to authenticated;
grant insert on public.compradores, public.produccion, public.gastos, public.ventas to authenticated;

alter table public.perfiles    enable row level security;
alter table public.lotes       enable row level security;
alter table public.compradores enable row level security;
alter table public.produccion  enable row level security;
alter table public.gastos      enable row level security;
alter table public.ventas      enable row level security;

-- Perfiles: cada quien ve el suyo; el administrador ve todos.
create policy "perfiles: ver propio o admin ve todos" on public.perfiles
  for select to authenticated
  using (id = auth.uid() or public.fn_rol_actual() = 'admin');

-- Lotes y compradores: cualquier usuario activo los puede ver.
create policy "lotes: usuarios activos leen" on public.lotes
  for select to authenticated using (public.fn_rol_actual() is not null);

create policy "compradores: usuarios activos leen" on public.compradores
  for select to authenticated using (public.fn_rol_actual() is not null);

create policy "compradores: usuarios activos agregan" on public.compradores
  for insert to authenticated
  with check (public.fn_rol_actual() is not null and creado_por = auth.uid());

-- Producción: todos los activos consultan; solo el administrador registra.
create policy "produccion: usuarios activos leen" on public.produccion
  for select to authenticated using (public.fn_rol_actual() is not null);

create policy "produccion: admin registra" on public.produccion
  for insert to authenticated
  with check (public.fn_rol_actual() = 'admin' and registrado_por = auth.uid());

-- Gastos: todos los activos consultan; solo el administrador registra.
create policy "gastos: usuarios activos leen" on public.gastos
  for select to authenticated using (public.fn_rol_actual() is not null);

create policy "gastos: admin registra" on public.gastos
  for insert to authenticated
  with check (public.fn_rol_actual() = 'admin' and registrado_por = auth.uid());

-- Ventas: todos los activos consultan; solo el dueño registra.
create policy "ventas: usuarios activos leen" on public.ventas
  for select to authenticated using (public.fn_rol_actual() is not null);

create policy "ventas: dueno registra" on public.ventas
  for insert to authenticated
  with check (public.fn_rol_actual() = 'dueno' and registrado_por = auth.uid());
