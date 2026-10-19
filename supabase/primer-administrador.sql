-- =====================================================================
-- Primer administrador (se ejecuta UNA sola vez)
--
-- Antes de ejecutarlo:
--   1. Cree la cuenta en Supabase → Authentication → Users → Add user →
--      Create new user (correo + contraseña, marque "Auto Confirm User").
--   2. Cambie abajo los 5 datos entre comillas por los suyos.
--      El correo debe ser EXACTAMENTE el mismo del paso 1.
--
-- Resultado esperado: "Success. 1 rows affected" (o "No rows returned").
-- Si dice 0 filas, el correo no coincide con el usuario creado.
-- =====================================================================

insert into public.perfiles
  (id, nombres, apellidos, cedula, fecha_nacimiento, correo, rol, debe_cambiar_clave, autoriza_datos)
select
  u.id,
  'SUS NOMBRES',          -- ← cambie
  'SUS APELLIDOS',        -- ← cambie
  '1234567890',           -- ← cédula, solo números (6 a 10 dígitos)
  date '1990-01-01',      -- ← fecha de nacimiento AAAA-MM-DD
  u.email,
  'admin',
  false,
  true
from auth.users u
where lower(u.email) = lower('correo@ejemplo.com');   -- ← cambie por el correo del paso 1
