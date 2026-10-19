/* =====================================================================
   Finca Cafetera · Capa de datos
   Conexión con Supabase, sesión, formatos y consultas a la base de datos.
   La seguridad real la imponen las reglas RLS de la base de datos; lo que
   se valida aquí es solo para dar mensajes claros al usuario.
   ===================================================================== */
import { createClient } from '../vendor/supabase.esm.js?v=3';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js?v=3';

export const configurado = /^https:\/\//.test(SUPABASE_URL) && !/^PEGUE/.test(SUPABASE_KEY);
export const sb = configurado ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

export const HORAS_SESION = 8;
export const ROLES = { admin: 'Administrador de finca', dueno: 'Dueño de finca' };
export const PANEL = { admin: 'panel.html', dueno: 'panel-dueno.html' };
export const TIPOS_GASTO = { insumos: 'Insumos', mano_obra: 'Mano de obra', transporte: 'Transporte' };

/* ---------------- Formatos ---------------- */
export const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pesos = n => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-CO');
export const kilos = n => (Number(n) || 0).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' kg';

/* Convierte lo que escribe el usuario a número: "1.250,5" → 1250.5 · "18.500" → 18500 · "120.5" → 120.5 */
export function numero(texto) {
  let t = String(texto ?? '').trim().replace(/[\s$]/g, '');
  if (!t) return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

const dosDigitos = n => String(n).padStart(2, '0');
export const fechaISO = d => `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;
export const hoyISO = () => fechaISO(new Date());
export const fechaCorta = iso => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function mesActual() {
  const h = new Date();
  return {
    desde: fechaISO(new Date(h.getFullYear(), h.getMonth(), 1)),
    hasta: fechaISO(new Date(h.getFullYear(), h.getMonth() + 1, 0)),
    nombre: MESES[h.getMonth()],
  };
}

/* "Septiembre de 2026" si el rango es un mes completo; si no, "01/09/2026 a 15/09/2026" */
export function etiquetaRango(desde, hasta) {
  const [a1, m1, d1] = desde.split('-').map(Number);
  const [a2, m2, d2] = hasta.split('-').map(Number);
  const ultimo = new Date(a2, m2, 0).getDate();
  if (a1 === a2 && m1 === m2 && d1 === 1 && d2 === ultimo) {
    const mes = MESES[m1 - 1];
    return mes[0].toUpperCase() + mes.slice(1) + ' de ' + a1;
  }
  return `${fechaCorta(desde)} a ${fechaCorta(hasta)}`;
}

export const iniciales = p => ((p.nombres || '')[0] || '') + ((p.apellidos || '')[0] || '');
export const nombreCorto = p => (p.nombres || '').split(' ')[0];

/* ---------------- Errores en lenguaje cotidiano ---------------- */
export function mensajeError(e) {
  const m = String(e?.message || e || '');
  if (!navigator.onLine || /Failed to fetch|NetworkError|Load failed|network/i.test(m)) return 'No hay conexión a internet. Intente de nuevo cuando tenga señal.';
  if (/Invalid login credentials/i.test(m)) return 'El correo o la contraseña no son correctos.';
  if (/Email not confirmed/i.test(m)) return 'Este correo aún no está confirmado. Pida ayuda al administrador.';
  if (/row-level security|permission denied/i.test(m)) return 'Su usuario no tiene permiso para hacer esta acción.';
  if (/JWT|session|token/i.test(m)) return 'Su sesión terminó. Ingrese de nuevo.';
  if (/rate limit|too many/i.test(m)) return 'Demasiados intentos. Espere unos minutos e intente de nuevo.';
  if (/Password should be|weak/i.test(m)) return 'La contraseña es muy débil. Use al menos 8 caracteres combinando letras y números.';
  if (/same.*password|different from the old/i.test(m)) return 'La contraseña nueva debe ser diferente a la anterior.';
  return m || 'Ocurrió un error inesperado.';
}
const esErrorDeRed = e => !navigator.onLine || /Failed to fetch|NetworkError|Load failed/i.test(String(e?.message || e));

function revisar({ data, error }) {
  if (error) throw error;
  return data;
}

/* ---------------- Sesión ---------------- */
const CLAVE_INICIO = 'finca_inicio_sesion';

/* El perfil se guarda unos minutos en el navegador para no consultarlo en cada pantalla.
   Es solo para la interfaz: los permisos reales los revisa la base de datos (RLS) en cada consulta. */
const CLAVE_PERFIL = 'finca_perfil';
const MINUTOS_PERFIL = 5;
export function olvidarPerfil() { try { sessionStorage.removeItem(CLAVE_PERFIL); } catch {} }

export async function obtenerPerfil({ usarGuardado = false } = {}) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { olvidarPerfil(); return null; }
  if (usarGuardado) {
    try {
      const g = JSON.parse(sessionStorage.getItem(CLAVE_PERFIL) || 'null');
      if (g && g.perfil.id === session.user.id && Date.now() - g.cuando < MINUTOS_PERFIL * 60000) return g.perfil;
    } catch {}
  }
  const perfil = revisar(await sb.from('perfiles').select('*').eq('id', session.user.id).maybeSingle());
  try { if (perfil) sessionStorage.setItem(CLAVE_PERFIL, JSON.stringify({ perfil, cuando: Date.now() })); } catch {}
  return perfil;
}

export async function iniciarSesion(correo, clave) {
  olvidarPerfil();
  revisar(await sb.auth.signInWithPassword({ email: correo, password: clave }));
  const perfil = await obtenerPerfil();
  if (!perfil) { await sb.auth.signOut(); throw new Error('Su cuenta no tiene un perfil asignado. Pida ayuda al administrador.'); }
  if (!perfil.activo) { await sb.auth.signOut(); throw new Error('Su usuario está inactivo. Hable con el administrador de la finca.'); }
  try { localStorage.setItem(CLAVE_INICIO, String(Date.now())); } catch {}
  return perfil;
}

export async function cerrarSesion(destino = 'index.html') {
  olvidarPerfil();
  try { await sb.auth.signOut(); } catch {}
  try { localStorage.removeItem(CLAVE_INICIO); } catch {}
  location.replace(destino);
}

/* Protege una página: exige sesión válida, usuario activo y uno de los roles permitidos.
   Devuelve el perfil, o null si redirigió a otra página. */
export async function exigirSesion(rolesPermitidos, { permitirCambioClave = false } = {}) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.replace('index.html'); return null; }

  let inicio = 0;
  try { inicio = Number(localStorage.getItem(CLAVE_INICIO)) || 0; } catch {}
  if (!inicio || Date.now() - inicio > HORAS_SESION * 3600 * 1000) {
    await cerrarSesion('sesion-vencida.html'); return null;
  }

  const perfil = await obtenerPerfil({ usarGuardado: true });
  if (!perfil || !perfil.activo) { await cerrarSesion('index.html?motivo=inactivo'); return null; }
  if (perfil.debe_cambiar_clave && !permitirCambioClave) { location.replace('nueva-clave.html'); return null; }
  if (rolesPermitidos && !rolesPermitidos.includes(perfil.rol)) { location.replace(PANEL[perfil.rol]); return null; }
  return perfil;
}

export const marcarInicioSesion = () => { try { localStorage.setItem(CLAVE_INICIO, String(Date.now())); } catch {} };

/* ---------------- Catálogos ---------------- */
export const listarLotes = async () =>
  revisar(await sb.from('lotes').select('id, numero, nombre').eq('activo', true).order('numero'));

export const listarCompradores = async () =>
  revisar(await sb.from('compradores').select('id, nombre').eq('activo', true).order('nombre'));

export async function crearComprador(nombre, perfil) {
  return revisar(await sb.from('compradores').insert({ nombre: nombre.trim(), creado_por: perfil.id }).select('id, nombre').single());
}

export const nombreLote = l => l ? `Lote ${l.numero} · ${l.nombre}` : 'Lote';

/* ---------------- Producción ---------------- */
export const listarProduccion = async (desde, hasta) =>
  revisar(await sb.from('produccion').select('id, fecha, kilos, lote:lotes(id, numero, nombre)')
    .gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }).order('id', { ascending: false }));

/* Registros guardados en el teléfono cuando no hay señal */
const CLAVE_PENDIENTES = 'finca_produccion_pendiente';
export function pendientesProduccion() {
  try { return JSON.parse(localStorage.getItem(CLAVE_PENDIENTES) || '[]'); } catch { return []; }
}
function guardarPendientes(lista) {
  try { localStorage.setItem(CLAVE_PENDIENTES, JSON.stringify(lista)); } catch {}
}

/* Devuelve 'enviado' o 'pendiente' (sin señal: queda guardado en el teléfono) */
export async function registrarProduccion(registro, perfil) {
  const fila = { ...registro, id_cliente: registro.id_cliente || crypto.randomUUID(), registrado_por: perfil.id };
  if (!navigator.onLine) { guardarPendientes([...pendientesProduccion(), fila]); return 'pendiente'; }
  try {
    const { error } = await sb.from('produccion').insert(fila);
    if (error && error.code !== '23505') throw error;   // 23505 = ya estaba guardado
    return 'enviado';
  } catch (e) {
    if (esErrorDeRed(e)) { guardarPendientes([...pendientesProduccion(), fila]); return 'pendiente'; }
    throw e;
  }
}

/* Envía lo que quedó guardado sin señal. Devuelve cuántos se enviaron. */
export async function enviarPendientes(perfil) {
  const lista = pendientesProduccion();
  if (!lista.length || !navigator.onLine) return 0;
  let enviados = 0;
  const restantes = [];
  for (const fila of lista) {
    try {
      const { error } = await sb.from('produccion').insert({ ...fila, registrado_por: perfil.id });
      if (error && error.code !== '23505') throw error;
      enviados++;
    } catch (e) {
      restantes.push(fila);
      if (esErrorDeRed(e)) { restantes.push(...lista.slice(lista.indexOf(fila) + 1)); break; }
    }
  }
  guardarPendientes(restantes);
  return enviados;
}

/* ---------------- Gastos ---------------- */
export async function listarGastos(desde, hasta, tipo) {
  let q = sb.from('gastos').select('id, tipo, descripcion, valor, fecha').gte('fecha', desde).lte('fecha', hasta);
  if (tipo) q = q.eq('tipo', tipo);
  return revisar(await q.order('fecha', { ascending: false }).order('id', { ascending: false }));
}
export const registrarGasto = async (gasto, perfil) =>
  revisar(await sb.from('gastos').insert({ ...gasto, registrado_por: perfil.id }));

/* ---------------- Ventas ---------------- */
export const listarVentas = async (desde, hasta) =>
  revisar(await sb.from('ventas').select('id, fecha, kilos, precio_kg, valor_total, comprador:compradores(id, nombre)')
    .gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }).order('id', { ascending: false }));

export const registrarVenta = async (venta, perfil) =>
  revisar(await sb.from('ventas').insert({ ...venta, registrado_por: perfil.id }).select('valor_total').single());

/* Últimos movimientos de dinero (ventas y gastos) */
export async function ultimosMovimientos(cantidad = 3) {
  const [ventas, gastos] = await Promise.all([
    sb.from('ventas').select('id, fecha, valor_total, creado_en, comprador:compradores(nombre)').order('fecha', { ascending: false }).order('creado_en', { ascending: false }).limit(cantidad).then(revisar),
    sb.from('gastos').select('id, fecha, tipo, descripcion, valor, creado_en').order('fecha', { ascending: false }).order('creado_en', { ascending: false }).limit(cantidad).then(revisar),
  ]);
  return [
    ...ventas.map(v => ({ tipo: 'venta', fecha: v.fecha, creado: v.creado_en, titulo: v.comprador?.nombre || 'Venta', sub: 'Venta', valor: v.valor_total })),
    ...gastos.map(g => ({ tipo: g.tipo, fecha: g.fecha, creado: g.creado_en, titulo: g.descripcion, sub: TIPOS_GASTO[g.tipo], valor: -g.valor })),
  ].sort((a, b) => (b.fecha + b.creado).localeCompare(a.fecha + a.creado)).slice(0, cantidad);
}

/* ---------------- Resumen del período ---------------- */
export async function resumen(desde, hasta) {
  const [produccion, gastos, ventas] = await Promise.all([listarProduccion(desde, hasta), listarGastos(desde, hasta), listarVentas(desde, hasta)]);
  const totalKilos = produccion.reduce((s, p) => s + Number(p.kilos), 0);
  const totalGastos = gastos.reduce((s, g) => s + Number(g.valor), 0);
  const totalVentas = ventas.reduce((s, v) => s + Number(v.valor_total), 0);
  const kilosVendidos = ventas.reduce((s, v) => s + Number(v.kilos), 0);
  return { produccion, gastos, ventas, totalKilos, totalGastos, totalVentas, kilosVendidos, utilidad: totalVentas - totalGastos };
}

/* ---------------- Usuarios ---------------- */
export const listarPerfiles = async () =>
  revisar(await sb.from('perfiles').select('id, nombres, apellidos, correo, rol, activo').order('activo', { ascending: false }).order('nombres'));

export const cambiarEstadoUsuario = async (id, activo) =>
  revisar(await sb.rpc('fn_cambiar_estado_usuario', { p_usuario: id, p_activo: activo }));

export async function crearUsuario(datos) {
  const { data, error } = await sb.functions.invoke('crear-usuario', { body: datos });
  if (error) {
    let detalle = null;
    try { detalle = await error.context.json(); } catch {}
    throw new Error(detalle?.error || (/Failed to send|fetch/i.test(error.message)
      ? 'No se pudo contactar el servicio de creación de usuarios. ¿Ya publicó la función "crear-usuario" en Supabase?'
      : error.message));
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/* ---------------- Contraseña ---------------- */
export const enviarEnlaceRecuperacion = async correo =>
  revisar(await sb.auth.resetPasswordForEmail(correo, { redirectTo: new URL('nueva-clave.html', location.href).href }));

export async function cambiarClave(clave) {
  revisar(await sb.auth.updateUser({ password: clave }));
  revisar(await sb.rpc('fn_marcar_clave_cambiada'));
  olvidarPerfil();
}

/* ---------------- Reiniciar la aplicación ---------------- */
export async function contarRegistros() {
  const contar = async tabla => {
    const { count, error } = await sb.from(tabla).select('id', { count: 'exact', head: true });
    if (error) throw error;
    return count ?? 0;
  };
  const [produccion, gastos, ventas, compradores, perfiles] = await Promise.all(
    ['produccion', 'gastos', 'ventas', 'compradores', 'perfiles'].map(contar));
  return { produccion, gastos, ventas, compradores, usuarios: Math.max(0, perfiles - 1) };
}

export async function reiniciarApp(datos) {
  const { data, error } = await sb.functions.invoke('reiniciar-app', { body: datos });
  if (error) {
    let detalle = null;
    try { detalle = await error.context.json(); } catch {}
    throw new Error(detalle?.error || (/Failed to send|fetch/i.test(error.message)
      ? 'No se pudo contactar el servicio de reinicio. ¿Ya publicó la función "reiniciar-app" en Supabase?'
      : error.message));
  }
  if (data?.error) throw new Error(data.error);
  try { localStorage.removeItem(CLAVE_PENDIENTES); } catch {}
  return data.resultado;
}
