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
/* 900123456-7 → "NIT 900.123.456-7" · 1053784005 → "C.C./NIT 1.053.784.005" */
export const documento = d => {
  const [num, dv] = String(d).split('-');
  const conPuntos = num.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dv !== undefined ? `NIT ${conPuntos}-${dv}` : `C.C./NIT ${conPuntos}`;
};
export const CLASES_INSUMO = { herramienta: 'Herramienta', materiales: 'Materiales', produccion: 'Insumos de producción' };
export const UNIDADES = { kg: 'kg', g: 'g', l: 'L', unidad: 'unid.' };
/* "50 kg", "2 L", "3 unid." */
export const cantidadUnidad = g => g.cantidad == null ? '' :
  Number(g.cantidad).toLocaleString('es-CO', { maximumFractionDigits: 2 }) + ' ' + (UNIDADES[g.unidad] || '');

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
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(m) || (!m && !navigator.onLine)) return 'No hay conexión a internet. Intente de nuevo cuando tenga señal.';
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

/* ---------------- Sin señal ----------------
   - Cada consulta exitosa se guarda en el teléfono; si después no hay señal, se muestra
     lo último guardado (y se avisa con el evento "datos-sin-senal").
   - Los registros hechos sin señal quedan en una cola y se envían solos al volver la conexión. */
export const sinSenal = () => !navigator.onLine;
const CLAVE_DATOS = 'finca_datos_';
function guardarCache(clave, datos) {
  try { localStorage.setItem(CLAVE_DATOS + clave, JSON.stringify({ cuando: Date.now(), datos })); } catch {}
}
function leerCache(clave) {
  try { return JSON.parse(localStorage.getItem(CLAVE_DATOS + clave) || 'null'); } catch { return null; }
}
export function borrarCacheDatos() {
  try { Object.keys(localStorage).filter(k => k.startsWith(CLAVE_DATOS)).forEach(k => localStorage.removeItem(k)); } catch {}
}
async function conCache(clave, consulta) {
  try {
    const datos = await consulta();
    guardarCache(clave, datos);
    return datos;
  } catch (e) {
    if (!esErrorDeRed(e)) throw e;
    const c = leerCache(clave);
    if (!c) throw new Error('No hay señal y todavía no hay datos guardados en el teléfono para esta pantalla. Ábrala una vez con conexión.');
    window.dispatchEvent(new CustomEvent('datos-sin-senal', { detail: { cuando: c.cuando } }));
    return c.datos;
  }
}

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
export function olvidarPerfil() { try { localStorage.removeItem(CLAVE_PERFIL); } catch {} }
export function perfilGuardado() {
  try { return JSON.parse(localStorage.getItem(CLAVE_PERFIL) || 'null')?.perfil || null; } catch { return null; }
}

export async function obtenerPerfil({ usarGuardado = false } = {}) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { olvidarPerfil(); return null; }
  let g = null;
  try { g = JSON.parse(localStorage.getItem(CLAVE_PERFIL) || 'null'); } catch {}
  const propio = g && g.perfil.id === session.user.id ? g : null;
  if (usarGuardado && propio && Date.now() - propio.cuando < MINUTOS_PERFIL * 60000) return propio.perfil;
  try {
    const perfil = revisar(await sb.from('perfiles').select('*').eq('id', session.user.id).maybeSingle());
    try { if (perfil) localStorage.setItem(CLAVE_PERFIL, JSON.stringify({ perfil, cuando: Date.now() })); } catch {}
    return perfil;
  } catch (e) {
    if (esErrorDeRed(e) && propio) return propio.perfil;   // sin señal: se usa el último perfil conocido
    throw e;
  }
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
  borrarCacheDatos();
  try { await sb.auth.signOut(); } catch {}
  try { localStorage.removeItem(CLAVE_INICIO); } catch {}
  location.replace(destino);
}

/* Protege una página: exige sesión válida, usuario activo y uno de los roles permitidos.
   Devuelve el perfil, o null si redirigió a otra página. */
/* ¿Se puede entrar sin señal? (hubo sesión en este teléfono y no han pasado las 8 horas) */
export function puedeEntrarSinSenal() {
  let inicio = 0;
  try { inicio = Number(localStorage.getItem(CLAVE_INICIO)) || 0; } catch {}
  return sinSenal() && !!perfilGuardado() && !!inicio && Date.now() - inicio <= HORAS_SESION * 3600 * 1000;
}

export async function exigirSesion(rolesPermitidos, { permitirCambioClave = false } = {}) {
  let session = null;
  try { ({ data: { session } } = await sb.auth.getSession()); } catch {}
  if (!session && !puedeEntrarSinSenal()) { location.replace('index.html'); return null; }

  let inicio = 0;
  try { inicio = Number(localStorage.getItem(CLAVE_INICIO)) || 0; } catch {}
  if (!inicio || Date.now() - inicio > HORAS_SESION * 3600 * 1000) {
    await cerrarSesion('sesion-vencida.html'); return null;
  }

  const perfil = session ? await obtenerPerfil({ usarGuardado: true }) : perfilGuardado();
  if (!perfil || !perfil.activo) { await cerrarSesion('index.html?motivo=inactivo'); return null; }
  if (perfil.debe_cambiar_clave && !permitirCambioClave) { location.replace('nueva-clave.html'); return null; }
  if (rolesPermitidos && !rolesPermitidos.includes(perfil.rol)) { location.replace(PANEL[perfil.rol]); return null; }
  return perfil;
}

export const marcarInicioSesion = () => { try { localStorage.setItem(CLAVE_INICIO, String(Date.now())); } catch {} };

/* ---------------- Catálogos ---------------- */
export const listarLotes = () => conCache('lotes', async () =>
  revisar(await sb.from('lotes').select('id, numero, nombre').eq('activo', true).order('numero')));

export const listarCompradores = () => conCache('compradores', async () =>
  revisar(await sb.from('compradores').select('id, nombre').eq('activo', true).order('nombre')));

export async function crearComprador(nombre, perfil) {
  if (sinSenal()) throw new Error('Para agregar un comprador nuevo necesita conexión. Elija uno de la lista o intente cuando tenga señal.');
  return revisar(await sb.from('compradores').insert({ nombre: nombre.trim(), creado_por: perfil.id }).select('id, nombre').single());
}

export async function crearLote(nombre) {
  if (!navigator.onLine) throw new Error('Para crear un lote nuevo necesita conexión a internet.');
  return revisar(await sb.rpc('fn_crear_lote', { p_nombre: nombre.trim() }));
}

export const renombrarLote = async (id, nombre) =>
  revisar(await sb.rpc('fn_renombrar_lote', { p_id: id, p_nombre: nombre.trim() }));
export const eliminarLote = async id => revisar(await sb.rpc('fn_eliminar_lote', { p_id: id }));
/* Cuántos registros de producción tiene cada lote: { lote_id: cantidad } */
export async function produccionPorLote() {
  const filas = await conCache('produccion_lotes', async () => revisar(await sb.from('produccion').select('lote_id')));
  return filas.reduce((m, f) => { m[f.lote_id] = (m[f.lote_id] || 0) + 1; return m; }, {});
}

export const nombreLote = l => l ? `Lote ${l.numero} · ${l.nombre}` : 'Lote';

/* ---------------- Producción ---------------- */
export const listarProduccion = (desde, hasta) => conCache(`produccion_${desde}_${hasta}`, async () =>
  revisar(await sb.from('produccion').select('id, fecha, kilos, lote:lotes(id, numero, nombre)')
    .gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }).order('id', { ascending: false })));

/* ---------------- Cola de registros hechos sin señal ----------------
   Cada registro lleva un id_cliente único: si se reenvía, la base de datos lo reconoce
   y no lo duplica. Cada registro guarda quién lo hizo, y solo se envía con esa misma cuenta. */
const CLAVE_COLA = 'finca_pendientes';
const CLAVE_COLA_VIEJA = 'finca_produccion_pendiente';   // formato anterior (solo producción)
function leerCola() {
  let cola = [];
  try { cola = JSON.parse(localStorage.getItem(CLAVE_COLA) || '[]'); } catch {}
  try {
    const viejos = JSON.parse(localStorage.getItem(CLAVE_COLA_VIEJA) || '[]');
    if (viejos.length) {
      cola = [...cola, ...viejos.map(fila => ({ tabla: 'produccion', fila, cuando: Date.now() }))];
      localStorage.setItem(CLAVE_COLA, JSON.stringify(cola));
      localStorage.removeItem(CLAVE_COLA_VIEJA);
    }
  } catch {}
  return cola;
}
function guardarCola(cola) {
  try { localStorage.setItem(CLAVE_COLA, JSON.stringify(cola)); } catch {}
  window.dispatchEvent(new CustomEvent('pendientes-cambio', { detail: { cantidad: cola.length } }));
}
/* Pendientes de una persona (o de todas si no se indica) */
export const pendientes = perfil => leerCola().filter(p => !perfil || p.fila.registrado_por === perfil.id);
export const pendientesProduccion = perfil => pendientes(perfil).filter(p => p.tabla === 'produccion');

/* Guarda en la base de datos, o en la cola si no hay señal. Devuelve 'enviado' o 'pendiente'. */
async function guardarOEncolar(tabla, datos, perfil) {
  const fila = { ...datos, id_cliente: datos.id_cliente || crypto.randomUUID(), registrado_por: perfil.id };
  const encolar = () => { guardarCola([...leerCola(), { tabla, fila, cuando: Date.now() }]); return 'pendiente'; };
  if (sinSenal()) return encolar();
  try {
    const { error } = await sb.from(tabla).insert(fila);
    if (error && error.code !== '23505') throw error;   // 23505 = ya estaba guardado
    return 'enviado';
  } catch (e) {
    if (esErrorDeRed(e)) return encolar();
    throw e;
  }
}
export const registrarProduccion = (registro, perfil) => guardarOEncolar('produccion', registro, perfil);

/* Envía lo que quedó guardado sin señal. Devuelve { enviados, conError }. */
let enviando = false;
export async function enviarPendientes(perfil) {
  const resultado = { enviados: 0, conError: 0 };
  if (enviando || sinSenal() || !perfil) return resultado;
  const propios = pendientes(perfil);
  if (!propios.length) return resultado;
  enviando = true;
  const quedan = [];
  try {
    for (let i = 0; i < propios.length; i++) {
      const p = propios[i];
      try {
        const { error } = await sb.from(p.tabla).insert(p.fila);
        if (error && error.code !== '23505') throw error;
        resultado.enviados++;
      } catch (e) {
        quedan.push(p);
        if (esErrorDeRed(e)) { quedan.push(...propios.slice(i + 1)); break; }
        resultado.conError++;
        p.error = mensajeError(e);
      }
    }
  } finally {
    // se conservan: los que no se pudieron enviar, los de otras cuentas y los que llegaron mientras se enviaba
    const ids = new Set(propios.map(p => p.fila.id_cliente));
    guardarCola([...quedan, ...leerCola().filter(p => !ids.has(p.fila.id_cliente))]);
    enviando = false;
  }
  return resultado;
}

/* ---------------- Gastos ---------------- */
export function listarGastos(desde, hasta, tipo) {
  return conCache(`gastos_${desde}_${hasta}_${tipo || 'todos'}`, async () => {
    let q = sb.from('gastos').select('id, tipo, descripcion, valor, fecha, proveedor, documento_proveedor, clase_insumo, cantidad, unidad').gte('fecha', desde).lte('fecha', hasta);
    if (tipo) q = q.eq('tipo', tipo);
    return revisar(await q.order('fecha', { ascending: false }).order('id', { ascending: false }));
  });
}
export const registrarGasto = (gasto, perfil) => guardarOEncolar('gastos', gasto, perfil);

/* ---------------- Ventas ---------------- */
export const listarVentas = (desde, hasta) => conCache(`ventas_${desde}_${hasta}`, async () =>
  revisar(await sb.from('ventas').select('id, fecha, kilos, precio_kg, valor_total, comprador:compradores(id, nombre)')
    .gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }).order('id', { ascending: false })));

/* Devuelve { estado: 'enviado' | 'pendiente', valor_total } (el total se calcula igual que en la base de datos) */
export async function registrarVenta(venta, perfil) {
  const estado = await guardarOEncolar('ventas', venta, perfil);
  return { estado, valor_total: Math.round(venta.kilos * venta.precio_kg) };
}

/* Últimos movimientos de dinero (ventas y gastos) */
export const ultimosMovimientos = (cantidad = 3) => conCache(`movimientos_${cantidad}`, () => ultimosMovimientosRed(cantidad));
async function ultimosMovimientosRed(cantidad) {
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
export const listarPerfiles = () => conCache('perfiles', async () =>
  revisar(await sb.from('perfiles').select('id, nombres, apellidos, correo, rol, activo').order('activo', { ascending: false }).order('nombres')));

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
  guardarCola([]);
  borrarCacheDatos();
  return data.resultado;
}
