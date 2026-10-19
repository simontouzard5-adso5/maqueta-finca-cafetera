// =====================================================================
// Edge Function: reiniciar-app
// Deja la aplicación en ceros para entregarla al cliente.
//   Siempre borra: producción, gastos y ventas.
//   Opcional:      compradores y los demás usuarios (nunca a quien la ejecuta).
//   Nunca borra:   los lotes ni la cuenta del administrador que la ejecuta.
// Solo la puede usar un ADMINISTRADOR ACTIVO que confirme con su contraseña
// y escriba la frase BORRAR TODO. Todo se verifica aquí, en el servidor.
//
// Se publica desde Supabase → Edge Functions → Deploy a new function →
// Via Editor → nombre: reiniciar-app → pegar este código → Deploy function.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const FRASE = "BORRAR TODO";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. ¿Quién llama?
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: quien, error: errQuien } = await admin.auth.getUser(token);
    if (errQuien || !quien.user) return json({ error: "Su sesión no es válida. Ingrese de nuevo." }, 401);

    // 2. Debe ser administrador activo
    const { data: perfil } = await admin
      .from("perfiles").select("rol, activo").eq("id", quien.user.id).maybeSingle();
    if (!perfil || perfil.rol !== "admin" || !perfil.activo) {
      return json({ error: "Solo un administrador activo puede reiniciar la aplicación." }, 403);
    }

    // 3. Confirmaciones
    const d = await req.json();
    if (String(d.frase ?? "").trim().toUpperCase() !== FRASE) {
      return json({ error: `Escriba exactamente ${FRASE} para confirmar.` }, 400);
    }
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!anonKey) return json({ error: "Falta la llave pública en el servidor (SUPABASE_ANON_KEY)." }, 500);
    const verificador = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: errClave } = await verificador.auth.signInWithPassword({
      email: quien.user.email!,
      password: String(d.clave ?? ""),
    });
    if (errClave) return json({ error: "La contraseña no es correcta." }, 403);

    const borrarCompradores = d.borrar_compradores === true;
    const borrarUsuarios = d.borrar_usuarios === true;
    const resultado: Record<string, number> = {};

    // 4. Borrar movimientos (primero, porque dependen de usuarios y compradores)
    for (const tabla of ["ventas", "gastos", "produccion"]) {
      const { count, error } = await admin.from(tabla).delete({ count: "exact" }).gte("id", 0);
      if (error) return json({ error: `No se pudo borrar ${tabla}: ${error.message}` }, 500);
      resultado[tabla] = count ?? 0;
    }

    // 5. Compradores
    if (borrarCompradores) {
      const { count, error } = await admin.from("compradores").delete({ count: "exact" }).gte("id", 0);
      if (error) return json({ error: "No se pudo borrar compradores: " + error.message }, 500);
      resultado.compradores = count ?? 0;
    }

    // 6. Usuarios (todos menos quien ejecuta)
    if (borrarUsuarios) {
      const { data: otros, error } = await admin.from("perfiles").select("id").neq("id", quien.user.id);
      if (error) return json({ error: "No se pudo leer usuarios: " + error.message }, 500);
      const ids = (otros ?? []).map((p) => p.id);
      if (ids.length) {
        // los compradores que ellos crearon quedan sin autor (no se borran por esto)
        await admin.from("compradores").update({ creado_por: null }).in("creado_por", ids);
      }
      let borrados = 0;
      for (const id of ids) {
        const { error: errBorrar } = await admin.auth.admin.deleteUser(id);   // borra también su perfil
        if (errBorrar) return json({ error: "No se pudo borrar un usuario: " + errBorrar.message, resultado }, 500);
        borrados++;
      }
      resultado.usuarios = borrados;
    }

    return json({ ok: true, resultado });
  } catch (e) {
    return json({ error: "Error inesperado: " + String(e) }, 500);
  }
});
