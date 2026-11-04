-- =====================================================================
-- 0009 · Registros sin señal para gastos y ventas
-- Cada gasto y venta hecho sin señal lleva un código único (id_cliente).
-- Si el teléfono lo envía dos veces (por ejemplo, porque la señal se cortó
-- justo al enviar), la base de datos lo reconoce y no lo duplica.
-- Resultado esperado: "Success. No rows returned".
-- =====================================================================

alter table public.gastos add column if not exists id_cliente uuid unique;
alter table public.ventas add column if not exists id_cliente uuid unique;
