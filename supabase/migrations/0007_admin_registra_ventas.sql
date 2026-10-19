-- =====================================================================
-- 0007 · El administrador también puede registrar ventas
-- Resultado esperado: "Success. No rows returned".
-- =====================================================================

drop policy if exists "ventas: dueno registra" on public.ventas;

create policy "ventas: admin y dueno registran" on public.ventas
  for insert to authenticated
  with check (public.fn_rol_actual() in ('admin', 'dueno') and registrado_por = auth.uid());
