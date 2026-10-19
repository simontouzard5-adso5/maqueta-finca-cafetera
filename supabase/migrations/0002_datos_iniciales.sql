-- =====================================================================
-- 0002 · Datos iniciales: lotes y compradores de la finca
-- Cambie los nombres si los de su finca son otros (o edítelos después en
-- Supabase → Table Editor → lotes / compradores).
-- Resultado esperado: "Success. No rows returned".
-- =====================================================================

insert into public.lotes (numero, nombre) values
  (1, 'La Cañada'),
  (2, 'El Guamo'),
  (3, 'El Mirador')
on conflict (numero) do nothing;

insert into public.compradores (nombre, creado_por) values
  ('Cooperativa de Caficultores', null),
  ('Trilladora El Arriero',       null)
on conflict (nombre) do nothing;
