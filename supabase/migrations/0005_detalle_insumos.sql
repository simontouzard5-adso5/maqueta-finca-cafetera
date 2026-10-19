-- =====================================================================
-- 0005 · Detalle de los gastos de insumos
-- Para los gastos de tipo "insumos" se guarda además:
--   proveedor (nombre o razón social), clase (herramienta, materiales,
--   insumos de producción), cantidad y unidad (kg, g, litros, unidades).
-- Los gastos de mano de obra y transporte no llevan estos datos.
-- Resultado esperado: "Success. No rows returned".
-- =====================================================================

create type public.clase_insumo  as enum ('herramienta', 'materiales', 'produccion');
create type public.unidad_medida as enum ('kg', 'g', 'l', 'unidad');

alter table public.gastos
  add column proveedor    text check (proveedor is null or char_length(trim(proveedor)) between 2 and 120),
  add column clase_insumo public.clase_insumo,
  add column cantidad     numeric(12,2) check (cantidad is null or cantidad > 0),
  add column unidad       public.unidad_medida;

-- Los insumos nuevos deben traer los 4 datos; los otros tipos no los llevan.
-- (NOT VALID: no se revisan los gastos que ya estaban registrados antes de este cambio)
alter table public.gastos add constraint gastos_detalle_insumo check (
  (tipo = 'insumos'  and proveedor is not null and clase_insumo is not null and cantidad is not null and unidad is not null)
  or
  (tipo <> 'insumos' and proveedor is null and clase_insumo is null and cantidad is null and unidad is null)
) not valid;
