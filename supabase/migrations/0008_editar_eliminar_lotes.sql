-- =====================================================================
-- 0008 · Editar y eliminar lotes (solo administrador activo)
--   fn_renombrar_lote: cambia el nombre (sin repetir el de otro lote).
--   fn_eliminar_lote:  si el lote NO tiene producción, se borra;
--                      si SÍ tiene, se oculta (activo = false) para no
--                      perder el historial. Devuelve 'borrado' u 'ocultado'.
-- Resultado esperado: "Success. No rows returned".
-- =====================================================================

create or replace function public.fn_renombrar_lote(p_id bigint, p_nombre text)
returns public.lotes
language plpgsql security definer set search_path = public
as $$
declare
  v_nombre text := trim(p_nombre);
  v_lote   public.lotes;
begin
  if public.fn_rol_actual() is distinct from 'admin' then
    raise exception 'Solo el administrador puede editar lotes.';
  end if;
  if char_length(v_nombre) < 2 or char_length(v_nombre) > 60 then
    raise exception 'El nombre del lote debe tener entre 2 y 60 caracteres.';
  end if;
  if exists (select 1 from public.lotes where lower(trim(nombre)) = lower(v_nombre) and id <> p_id) then
    raise exception 'Ya existe otro lote con el nombre "%".', v_nombre;
  end if;
  update public.lotes set nombre = v_nombre where id = p_id returning * into v_lote;
  if not found then
    raise exception 'El lote no existe.';
  end if;
  return v_lote;
end;
$$;

create or replace function public.fn_eliminar_lote(p_id bigint)
returns text
language plpgsql security definer set search_path = public
as $$
begin
  if public.fn_rol_actual() is distinct from 'admin' then
    raise exception 'Solo el administrador puede eliminar lotes.';
  end if;
  if not exists (select 1 from public.lotes where id = p_id) then
    raise exception 'El lote no existe.';
  end if;
  if exists (select 1 from public.produccion where lote_id = p_id) then
    update public.lotes set activo = false where id = p_id;
    return 'ocultado';
  end if;
  delete from public.lotes where id = p_id;
  return 'borrado';
end;
$$;

revoke all on function public.fn_renombrar_lote(bigint, text) from public, anon;
revoke all on function public.fn_eliminar_lote(bigint)        from public, anon;
grant execute on function public.fn_renombrar_lote(bigint, text) to authenticated;
grant execute on function public.fn_eliminar_lote(bigint)        to authenticated;
