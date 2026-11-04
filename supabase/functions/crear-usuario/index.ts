// =====================================================================
// Edge Function: crear-usuario
// Crea la cuenta (Supabase Auth) y el perfil de un usuario nuevo.
// Solo la puede usar un ADMINISTRADOR ACTIVO. Devuelve una contraseña
// temporal que el usuario deberá cambiar en su primer ingreso.
//
// Se publica desde Supabase → Edge Functions → Deploy a new function →
// Via Editor → nombre: crear-usuario → pegar este código → Deploy function.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

// Solo la aplicación publicada puede llamar a esta función desde el navegador.
// Si cambia la dirección de la app, actualícela aquí y vuelva a publicar la función.
const ORIGENES_PERMITIDOS = ["https://finca-cafetera.vercel.app"];

function encabezadosCors(req: Request): Record<string, string> {
  const origen = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENES_PERMITIDOS.includes(origen) ? origen : ORIGENES_PERMITIDOS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Contraseña temporal: 10 caracteres sin letras confusas (0/O, 1/l/I), y siempre con al menos
// una minúscula, una mayúscula y un número (así cumple las reglas de contraseña de Supabase).
function claveTemporal(): string {
  const grupos = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789"];
  const todas = grupos.join("");
  const azar = (n: number) => { const b = new Uint32Array(1); crypto.getRandomValues(b); return b[0] % n; };
  const clave = grupos.map((g) => g[azar(g.length)]);
  while (clave.length < 10) clave.push(todas[azar(todas.length)]);
  for (let i = clave.length - 1; i > 0; i--) { const j = azar(i + 1); [clave[i], clave[j]] = [clave[j], clave[i]]; }
  return clave.join("");
}

Deno.serve(async (req: Request) => {
  const cors = encabezadosCors(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // 1. ¿Quién llama? (se verifica con su propio token, nunca con datos del navegador)
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: quien, error: errQuien } = await admin.auth.getUser(token);
    if (errQuien || !quien.user) return json({ error: "Su sesión no es válida. Ingrese de nuevo." }, 401);

    // 2. Debe ser administrador y estar activo
    const { data: perfilQuien } = await admin
      .from("perfiles").select("rol, activo").eq("id", quien.user.id).maybeSingle();
    if (!perfilQuien || perfilQuien.rol !== "admin" || !perfilQuien.activo) {
      return json({ error: "Solo un administrador activo puede crear usuarios." }, 403);
    }

    // 3. Validar los datos recibidos
    const d = await req.json();
    const nombres = String(d.nombres ?? "").trim();
    const apellidos = String(d.apellidos ?? "").trim();
    const cedula = String(d.cedula ?? "").trim();
    const fecha_nacimiento = String(d.fecha_nacimiento ?? "");
    const correo = String(d.correo ?? "").trim().toLowerCase();
    const rol = String(d.rol ?? "");
    const autoriza = d.autoriza_datos === true;

    if (!nombres || !apellidos) return json({ error: "Escriba nombres y apellidos." }, 400);
    if (!/^[0-9]{6,10}$/.test(cedula)) return json({ error: "La cédula debe tener entre 6 y 10 dígitos." }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_nacimiento)) return json({ error: "Fecha de nacimiento no válida." }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(correo)) return json({ error: "Correo no válido." }, 400);
    if (rol !== "admin" && rol !== "dueno") return json({ error: "Rol no válido." }, 400);
    if (!autoriza) return json({ error: "El usuario debe autorizar el tratamiento de sus datos." }, 400);

    const { data: cedulaUsada } = await admin.from("perfiles").select("id").eq("cedula", cedula).maybeSingle();
    if (cedulaUsada) return json({ error: "Ya existe un usuario con esa cédula." }, 409);

    // 4. Crear la cuenta
    const password = claveTemporal();
    const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
      email: correo,
      password,
      email_confirm: true,
      user_metadata: { nombres, apellidos },
    });
    if (errCrear || !creado.user) {
      const msg = /already|registered|exists/i.test(errCrear?.message ?? "")
        ? "Ya existe un usuario con ese correo."
        : "No se pudo crear la cuenta: " + (errCrear?.message ?? "error desconocido");
      return json({ error: msg }, 400);
    }

    // 5. Crear el perfil (si falla, se borra la cuenta para no dejarla a medias)
    const { error: errPerfil } = await admin.from("perfiles").insert({
      id: creado.user.id,
      nombres, apellidos, cedula, fecha_nacimiento, correo, rol,
      debe_cambiar_clave: true,
      autoriza_datos: true,
    });
    if (errPerfil) {
      await admin.auth.admin.deleteUser(creado.user.id);
      return json({ error: "No se pudo guardar el perfil: " + errPerfil.message }, 400);
    }

    return json({ ok: true, password_temporal: password });
  } catch (e) {
    console.error(e);   // el detalle queda en los registros de Supabase, no se muestra al usuario
    return json({ error: "Ocurrió un error inesperado en el servidor. Intente de nuevo." }, 500);
  }
});
