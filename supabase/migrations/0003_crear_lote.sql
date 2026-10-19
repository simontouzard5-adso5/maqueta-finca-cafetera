-- =====================================================================
-- 0003 · Crear lotes desde la app (al registrar producción)
-- Solo el administrador activo puede crear lotes. El número se asigna solo
-- (el siguiente disponible) y no se permiten dos lotes con el mismo nombre.
-- Resultado esperado: "Success. No rows returned".
-- =====================================================================

create unique index if not exists lotes_nombre_unico on public.lotes (lower(trim(nombre)));

create or replace function public.fn_crear_lote(p_nombre text)
returns public.lotes
language plpgsql security definer set search_path = public
as $$
declare
  v_nombre text := trim(p_nombre);
  v_lote   public.lotes;
begin
  if public.fn_rol_actual() is distinct from 'admin' then
    raise exception 'Solo el administrador puede crear lotes.';
  end if;
  if char_length(v_nombre) < 2 or char_length(v_nombre) > 60 then
    raise exception 'El nombre del lote debe tener entre 2 y 60 caracteres.';
  end if;

  -- Si ya existe un lote con ese nombre, se usa ese (y se reactiva si estaba inactivo)
  select * into v_lote from public.lotes where lower(trim(nombre)) = lower(v_nombre);
  if found then
    if not v_lote.activo then
      update public.lotes set activo = true where id = v_lote.id returning * into v_lote;
    end if;
    return v_lote;
  end if;

  lock table public.lotes in share row exclusive mode;   -- evita dos lotes con el mismo número
  insert into public.lotes (numero, nombre)
  values ((select coalesce(max(numero), 0) + 1 from public.lotes), v_nombre)
  returning * into v_lote;
  return v_lote;
end;
$$;

revoke all on function public.fn_crear_lote(text) from public, anon;
grant execute on function public.fn_crear_lote(text) to authenticated;
