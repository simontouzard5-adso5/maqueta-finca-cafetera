-- =====================================================================
-- 0006 · Cédula o NIT del proveedor en los gastos de insumos
-- Se guarda sin puntos ni espacios, por ejemplo 900123456-7 o 1053784005.
-- Resultado esperado: "Success. No rows returned".
-- =====================================================================

alter table public.gastos
  add column documento_proveedor text
  check (documento_proveedor is null or documento_proveedor ~ '^[0-9]{5,15}(-[0-9])?$');
