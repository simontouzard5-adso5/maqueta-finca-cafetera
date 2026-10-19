-- =====================================================================
-- 0002 · Datos iniciales: compradores de ejemplo
-- Cambie los nombres si los de su finca son otros (o edítelos después en
-- Supabase → Table Editor → lotes / compradores).
-- Resultado esperado: "Success. No rows returned".
-- =====================================================================

-- Los lotes NO se crean aquí: el administrador los crea desde la app
-- (Producción → Lote → "+ Otro lote…").

insert into public.compradores (nombre, creado_por) values
  ('Cooperativa de Caficultores', null),
  ('Trilladora El Arriero',       null)
on conflict (nombre) do nothing;
