/* =====================================================================
   Finca Cafetera · Lógica de cada pantalla
   Cada página HTML carga este archivo; según el nombre de la página se
   ejecuta la función que le corresponde.
   ===================================================================== */
import * as api from './api.js?v=3';
import { ICONOS } from './iconos.js?v=3';

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const pagina = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

/* ---------------- Ayudas de interfaz ---------------- */

/* Muestra un aviso arriba del formulario o del contenido. tipo: ok | error | info */
function aviso(tipo, html, contenedor) {
  const destino = contenedor || $('form.formulario') || $('main');
  let caja = $(':scope > .aviso-js', destino);
  if (!caja) {
    caja = document.createElement('div');
    caja.tabIndex = -1;
    destino.prepend(caja);
  }
  caja.className = `aviso aviso-${tipo} aviso-js`;
  caja.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  caja.innerHTML = `<span>${html}</span>`;
  caja.hidden = false;
  caja.focus({ preventScroll: false });
  return caja;
}
const ocultarAvisos = () => $$('.aviso-js, .aviso-ok').forEach(a => { a.hidden = true; });

function errorCampo(id, mensaje) {
  const campo = document.getElementById(id);
  const grupo = campo.closest('.campo');
  grupo.classList.add('campo-error');
  campo.setAttribute('aria-invalid', 'true');
  grupo.querySelector('.mensaje-error').textContent = mensaje;
  campo.focus();
}

/* Pone el botón en modo "trabajando" mientras se espera al servidor */
async function ocupado(boton, texto, tarea) {
  const original = boton.innerHTML;
  boton.disabled = true;
  boton.textContent = texto;
  try { return await tarea(); } finally { boton.disabled = false; boton.innerHTML = original; }
}

/* Escucha el envío de un formulario ya validado por app.js */
function alEnviar(form, manejador) {
  form.addEventListener('formulario-valido', async () => {
    ocultarAvisos();
    const boton = $('button[type="submit"]', form);
    try { await ocupado(boton, 'Guardando…', () => manejador(boton)); }
    catch (e) { console.error(e); aviso('error', api.esc(api.mensajeError(e)), form); }
  });
}

function itemLista({ icono, titulo, sub, valor, claseValor = '', valorSub = '' }) {
  return `<li><span class="marca-tipo">${icono}</span><span class="detalle">${api.esc(titulo)}<small>${api.esc(sub)}</small></span>`
    + `<span class="valor ${claseValor}">${valor}${valorSub ? `<small>${valorSub}</small>` : ''}</span></li>`;
}
const listaVacia = texto => `<li class="vacio">${texto}</li>`;
const listaCargando = () => listaVacia('Cargando…');

function llenarSelect(select, opciones, textoVacio) {
  select.innerHTML = `<option value="">${textoVacio}</option>` + opciones.map(o => `<option value="${o.value}">${api.esc(o.texto)}</option>`).join('');
}

function subtituloEncabezado(texto) {
  const small = $('.barra-app h1 small');
  if (small) small.textContent = texto;
}

/* Filtros "Desde / Hasta" de las pantallas de consulta */
function prepararFiltros(alFiltrar, tipoReporte) {
  const desde = $('#desde'), hasta = $('#hasta');
  const params = new URLSearchParams(location.search);
  const mes = api.mesActual();
  desde.value = params.get('desde') || mes.desde;
  hasta.value = params.get('hasta') || mes.hasta;
  const pdf = $('.filtros a.btn-secundario');
  const ejecutar = async () => {
    if (!desde.value || !hasta.value) return aviso('error', 'Elija las dos fechas para filtrar.', $('main'));
    if (desde.value > hasta.value) return aviso('error', 'La fecha "Desde" no puede ser posterior a la fecha "Hasta".', $('main'));
    ocultarAvisos();
    subtituloEncabezado(api.etiquetaRango(desde.value, hasta.value));
    if (pdf) pdf.href = `vista-previa-reporte.html?tipo=${tipoReporte}&desde=${desde.value}&hasta=${hasta.value}`;
    try { await alFiltrar(desde.value, hasta.value); }
    catch (e) { console.error(e); aviso('error', api.esc(api.mensajeError(e)), $('main')); }
  };
  $('.filtros .btn-primario').addEventListener('click', ejecutar);
  return ejecutar;
}

function conectarCerrarSesion() {
  $$('a[aria-label="Cerrar sesión"], .lista a[href="index.html"]').forEach(a =>
    a.addEventListener('click', e => { e.preventDefault(); api.cerrarSesion(); }));
}

function fijarHoy(...ids) {
  ids.forEach(id => { const c = document.getElementById(id); if (c) { c.value = api.hoyISO(); c.max = api.hoyISO(); } });
}

/* ---------------- Pantallas ---------------- */

async function paginaIngreso() {
  const form = $('form.formulario');
  const correo = $('#correo');
  const recordar = $('#recordar');
  const params = new URLSearchParams(location.search);
  if (params.get('motivo') === 'inactivo') aviso('error', 'Su usuario está inactivo o no tiene perfil. Hable con el administrador de la finca.', form);

  try {
    const guardado = localStorage.getItem('finca_correo');
    if (guardado) { correo.value = guardado; recordar.checked = true; }
  } catch {}

  // Si ya tiene una sesión abierta y vigente, entra directo
  const { data: { session } } = await api.sb.auth.getSession();
  if (session && !params.get('motivo')) {
    const perfil = await api.exigirSesion(null, { permitirCambioClave: true });
    if (perfil) location.replace(perfil.debe_cambiar_clave ? 'nueva-clave.html' : api.PANEL[perfil.rol]);
    return;
  }

  alEnviar(form, async boton => {
    boton.textContent = 'Ingresando…';
    const perfil = await api.iniciarSesion(correo.value.trim(), $('#clave').value);
    try {
      if (recordar.checked) localStorage.setItem('finca_correo', correo.value.trim());
      else localStorage.removeItem('finca_correo');
    } catch {}
    location.replace(perfil.debe_cambiar_clave ? 'nueva-clave.html' : api.PANEL[perfil.rol]);
  });
}

async function paginaPanel(perfil) {
  const mes = api.mesActual();
  $('.saludo').textContent = `Hola, ${api.nombreCorto(perfil)} · ${api.ROLES[perfil.rol]}`;
  $('.titulo-seccion').textContent = `Resumen de ${mes.nombre}`;
  conectarCerrarSesion();
  if (perfil.rol === 'admin') {
    api.enviarPendientes(perfil).catch(() => 0).then(enviados => {
      if (enviados) aviso('ok', `Se enviaron ${enviados} registro(s) de producción que estaban guardados en el teléfono.`, $('main'));
    });
  }

  const hayGrafico = !!$('.grafico');
  const [r, movimientos, lotesGrafico] = await Promise.all([
    api.resumen(mes.desde, mes.hasta), api.ultimosMovimientos(3), hayGrafico ? api.listarLotes() : [],
  ]);
  const kpis = $$('.indicadores .kpi');
  const pon = (i, fuerte, debil) => { $('strong', kpis[i]).textContent = fuerte; $('span', kpis[i]).textContent = debil; };
  pon(0, api.kilos(r.totalKilos), `${pl(r.produccion.length, 'registro', 'registros')}`);
  pon(1, api.pesos(r.totalGastos), `${pl(r.gastos.length, 'gasto', 'gastos')}`);
  pon(2, api.pesos(r.totalVentas), api.kilos(r.kilosVendidos));
  pon(3, api.pesos(r.utilidad), r.utilidad >= 0 ? '▲ Ganancia' : '▼ Pérdida');
  kpis[3].classList.toggle('ganancia', r.utilidad >= 0);
  kpis[3].classList.toggle('perdida', r.utilidad < 0);

  // Últimos movimientos
  const lista = $$('ul.lista').pop();
  lista.innerHTML = movimientos.length
    ? movimientos.map(m => itemLista({
        icono: ICONOS[m.tipo] || ICONOS.venta,
        titulo: m.titulo,
        sub: `${m.sub} · ${api.fechaCorta(m.fecha)}`,
        valor: (m.valor >= 0 ? '▲ ' : '▼ ') + api.pesos(Math.abs(m.valor)),
        claseValor: m.valor >= 0 ? 'valor-ganancia' : 'valor-perdida',
      })).join('')
    : listaVacia('Aún no hay ventas ni gastos registrados.');

  // Gráfico de producción por lote (solo en el panel del dueño)
  const grafico = $('.grafico');
  if (grafico) {
    const lotes = lotesGrafico;
    const porLote = lotes.map(l => ({ l, kg: r.produccion.filter(p => p.lote?.id === l.id).reduce((s, p) => s + Number(p.kilos), 0) }));
    const max = Math.max(1, ...porLote.map(x => x.kg));
    const numeroCorto = kg => kg.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    grafico.innerHTML = porLote.map(x => `<div class="barra" style="height:${Math.max(2, Math.round(x.kg / max * 92))}%"><span>${numeroCorto(x.kg)}</span></div>`).join('');
    grafico.setAttribute('aria-label', porLote.map(x => `Lote ${x.l.numero} ${x.l.nombre} ${numeroCorto(x.kg)} kilogramos`).join(', '));
    $('.grafico-etiquetas').innerHTML = porLote.map(x => `<div>${api.esc(x.l.nombre)}</div>`).join('');
  }
}

async function paginaRegistrarProduccion(perfil) {
  const form = $('form.formulario');
  const lote = $('#lote');
  const bannerSinSenal = $('.aviso-info');
  fijarHoy('fecha');

  // Campo para escribir un lote que no está en la lista
  const campoNuevo = document.createElement('div');
  campoNuevo.className = 'campo';
  campoNuevo.hidden = true;
  campoNuevo.innerHTML = `<label class="form-label" for="lote-nuevo">Nombre del lote nuevo <span class="obligatorio" aria-hidden="true">*</span></label>
    <input class="form-control" id="lote-nuevo" maxlength="60" placeholder="Ej.: La Esperanza" aria-describedby="lote-nuevo-ayuda lote-nuevo-error">
    <div class="form-text" id="lote-nuevo-ayuda">El número del lote se asigna solo. Quedará guardado para los próximos registros.</div>
    <div class="mensaje-error" id="lote-nuevo-error" aria-live="polite"></div>`;
  lote.closest('.campo').after(campoNuevo);

  let lotes = [];
  const cargarLotes = async () => {
    lotes = await api.listarLotes();
    llenarSelect(lote, lotes.map(l => ({ value: l.id, texto: api.nombreLote(l) })), 'Seleccione un lote');
    lote.insertAdjacentHTML('beforeend', '<option value="nuevo">+ Otro lote…</option>');
  };
  lote.addEventListener('change', () => { campoNuevo.hidden = lote.value !== 'nuevo'; if (!campoNuevo.hidden) $('#lote-nuevo').focus(); });
  await cargarLotes();
  // Si todavía no hay lotes, se abre directo el campo para crear el primero
  if (!lotes.length) { lote.value = 'nuevo'; campoNuevo.hidden = false; }

  const actualizarBanner = () => {
    const n = api.pendientesProduccion().length;
    bannerSinSenal.hidden = !n && navigator.onLine;
    $('span', bannerSinSenal).innerHTML = navigator.onLine
      ? `<strong>Registros pendientes.</strong> ${n} registro(s) guardados en el teléfono se están enviando.`
      : `<strong>Sin señal.</strong> ${n} registro(s) guardados en el teléfono; se enviarán al recuperar la conexión.`;
  };
  const sincronizar = async () => {
    const enviados = await api.enviarPendientes(perfil).catch(() => 0);
    actualizarBanner();
    if (enviados) aviso('ok', `Se enviaron ${enviados} registro(s) que estaban guardados en el teléfono.`, form);
  };
  window.addEventListener('online', sincronizar);
  window.addEventListener('offline', actualizarBanner);
  actualizarBanner();
  sincronizar();

  alEnviar(form, async () => {
    const kg = api.numero($('#kilos').value);
    if (!(kg > 0)) return errorCampo('kilos', 'La cantidad debe ser un número mayor que cero.');
    if (Math.round(kg * 10) !== kg * 10) return errorCampo('kilos', 'Use máximo un decimal, por ejemplo 485,5.');
    if ($('#fecha').value > api.hoyISO()) return errorCampo('fecha', 'La fecha no puede ser posterior a hoy.');
    let loteElegido = lotes.find(l => String(l.id) === lote.value);
    if (lote.value === 'nuevo') {
      const nombre = $('#lote-nuevo').value.trim();
      if (nombre.length < 2) return errorCampo('lote-nuevo', 'Escriba el nombre del lote (mínimo 2 letras).');
      loteElegido = await api.crearLote(nombre);
      await cargarLotes();
      lote.value = String(loteElegido.id);
      campoNuevo.hidden = true;
      $('#lote-nuevo').value = '';
    }
    const estado = await api.registrarProduccion({ lote_id: loteElegido.id, fecha: $('#fecha').value, kilos: kg }, perfil);
    $('#kilos').value = '';
    actualizarBanner();
    if (estado === 'enviado') aviso('ok', `Guardado: ${api.esc(api.nombreLote(loteElegido))} · ${api.kilos(kg)}`, form);
    else aviso('info', `<strong>Sin señal.</strong> El registro de ${api.kilos(kg)} quedó guardado en el teléfono y se enviará al recuperar la conexión.`, form);
  });
}

async function paginaConsultarProduccion() {
  const lista = $('ul.lista');
  const ejecutar = prepararFiltros(async (desde, hasta) => {
    lista.innerHTML = listaCargando();
    const filas = await api.listarProduccion(desde, hasta);
    const total = filas.reduce((s, p) => s + Number(p.kilos), 0);
    const lotesDistintos = new Set(filas.map(p => p.lote?.id)).size;
    $('.total strong').textContent = api.kilos(total);
    $('.total > span').innerHTML = `${pl(filas.length, 'registro', 'registros')}<br>${pl(lotesDistintos, 'lote', 'lotes')}`;
    lista.innerHTML = filas.length
      ? filas.map(p => itemLista({ icono: ICONOS.produccion, titulo: api.nombreLote(p.lote), sub: api.fechaCorta(p.fecha), valor: api.kilos(p.kilos) })).join('')
      : listaVacia('No hay producción registrada en estas fechas.');
  }, 'produccion');
  await ejecutar();
}

async function paginaRegistrarGasto(perfil) {
  const form = $('form.formulario');
  const tipos = { t1: 'insumos', t2: 'mano_obra', t3: 'transporte' };
  fijarHoy('fecha-g');
  alEnviar(form, async () => {
    const valor = api.numero($('#valor').value);
    if (!(valor > 0) || !Number.isInteger(valor)) return errorCampo('valor', 'Escriba el valor en pesos, sin decimales. Ej.: 320.000');
    if ($('#fecha-g').value > api.hoyISO()) return errorCampo('fecha-g', 'La fecha no puede ser posterior a hoy.');
    const tipo = tipos[$('input[name="tipo"]:checked').id];
    await api.registrarGasto({ tipo, descripcion: $('#desc').value.trim(), valor, fecha: $('#fecha-g').value }, perfil);
    aviso('ok', `Gasto guardado: ${api.esc($('#desc').value.trim())} · ${api.pesos(valor)}`, form);
    $('#desc').value = ''; $('#valor').value = '';
  });
}

async function paginaConsultarGastos() {
  const lista = $('ul.lista');
  const tipos = { Insumos: 'insumos', 'Mano de obra': 'mano_obra', Transporte: 'transporte' };
  const ejecutar = prepararFiltros(async (desde, hasta) => {
    lista.innerHTML = listaCargando();
    const filas = await api.listarGastos(desde, hasta, tipos[$('#tipo-g').value]);
    $('.total strong').textContent = api.pesos(filas.reduce((s, g) => s + Number(g.valor), 0));
    $('.total > span').textContent = `${pl(filas.length, 'gasto', 'gastos')}`;
    lista.innerHTML = filas.length
      ? filas.map(g => itemLista({ icono: ICONOS[g.tipo], titulo: g.descripcion, sub: `${api.TIPOS_GASTO[g.tipo]} · ${api.fechaCorta(g.fecha)}`, valor: api.pesos(g.valor) })).join('')
      : listaVacia('No hay gastos registrados en estas fechas.');
  }, 'gastos');
  $('#tipo-g').addEventListener('change', ejecutar);
  await ejecutar();
}

async function paginaRegistrarVenta(perfil) {
  const form = $('form.formulario');
  const comprador = $('#comprador');
  fijarHoy('fecha-v');
  $('#cantidad-venta').value = '';
  $('#precio-kg').value = '';
  $('#cantidad-venta').dispatchEvent(new Event('input'));

  // Campo para escribir un comprador que no está en la lista
  const campoNuevo = document.createElement('div');
  campoNuevo.className = 'campo';
  campoNuevo.hidden = true;
  campoNuevo.innerHTML = `<label class="form-label" for="comprador-nuevo">Nombre del comprador nuevo <span class="obligatorio" aria-hidden="true">*</span></label>
    <input class="form-control" id="comprador-nuevo" maxlength="80" placeholder="Ej.: Trilladora La Esperanza" aria-describedby="comprador-nuevo-error">
    <div class="mensaje-error" id="comprador-nuevo-error" aria-live="polite"></div>`;
  comprador.closest('.campo').after(campoNuevo);

  const cargarCompradores = async () => {
    const lista = await api.listarCompradores();
    llenarSelect(comprador, lista.map(c => ({ value: c.id, texto: c.nombre })), 'Seleccione un comprador');
    comprador.insertAdjacentHTML('beforeend', '<option value="nuevo">+ Otro comprador…</option>');
  };
  comprador.addEventListener('change', () => { campoNuevo.hidden = comprador.value !== 'nuevo'; if (!campoNuevo.hidden) $('#comprador-nuevo').focus(); });
  await cargarCompradores();

  alEnviar(form, async () => {
    const kg = api.numero($('#cantidad-venta').value);
    const precio = api.numero($('#precio-kg').value);
    if (!(kg > 0)) return errorCampo('cantidad-venta', 'La cantidad debe ser mayor que cero.');
    if (Math.round(kg * 10) !== kg * 10) return errorCampo('cantidad-venta', 'Use máximo un decimal.');
    if (!(precio > 0) || !Number.isInteger(precio)) return errorCampo('precio-kg', 'Escriba el precio en pesos, sin decimales.');
    if ($('#fecha-v').value > api.hoyISO()) return errorCampo('fecha-v', 'La fecha no puede ser posterior a hoy.');

    let compradorId = Number(comprador.value);
    if (comprador.value === 'nuevo') {
      const nombre = $('#comprador-nuevo').value.trim();
      if (nombre.length < 2) return errorCampo('comprador-nuevo', 'Escriba el nombre del comprador.');
      const creado = await api.crearComprador(nombre, perfil);
      compradorId = creado.id;
      await cargarCompradores();
      comprador.value = String(creado.id);
      campoNuevo.hidden = true;
      $('#comprador-nuevo').value = '';
    }
    const venta = await api.registrarVenta({ comprador_id: compradorId, fecha: $('#fecha-v').value, kilos: kg, precio_kg: precio }, perfil);
    aviso('ok', `Venta guardada por ${api.pesos(venta.valor_total)}.`, form);
    $('#cantidad-venta').value = ''; $('#precio-kg').value = '';
    $('#cantidad-venta').dispatchEvent(new Event('input'));
  });
}

async function paginaConsultarVentas() {
  const lista = $('ul.lista');
  const ejecutar = prepararFiltros(async (desde, hasta) => {
    lista.innerHTML = listaCargando();
    const filas = await api.listarVentas(desde, hasta);
    $('.total strong').textContent = api.pesos(filas.reduce((s, v) => s + Number(v.valor_total), 0));
    $('.total > span').innerHTML = `${pl(filas.length, 'venta', 'ventas')}<br>${api.kilos(filas.reduce((s, v) => s + Number(v.kilos), 0))}`;
    lista.innerHTML = filas.length
      ? filas.map(v => itemLista({ icono: ICONOS.venta, titulo: v.comprador?.nombre, sub: `${api.fechaCorta(v.fecha)} · ${api.kilos(v.kilos)}`, valor: api.pesos(v.valor_total), valorSub: `${api.pesos(v.precio_kg)} por kg` })).join('')
      : listaVacia('No hay ventas registradas en estas fechas.');
  }, 'ventas');
  await ejecutar();
}

async function paginaResumen() {
  const params = new URLSearchParams(location.search);
  const mes = api.mesActual();
  const desde = params.get('desde') || mes.desde, hasta = params.get('hasta') || mes.hasta;
  const r = await api.resumen(desde, hasta);
  const caja = $('.total');
  caja.style.background = r.utilidad >= 0 ? 'var(--color-1)' : 'var(--color-alerta)';
  $('small', caja).textContent = `Utilidad neta · ${api.etiquetaRango(desde, hasta).toLowerCase()}`;
  $('strong', caja).textContent = api.pesos(r.utilidad);
  const margen = r.totalVentas ? Math.round(r.utilidad / r.totalVentas * 100) : 0;
  $(':scope > span', caja).innerHTML = (r.utilidad >= 0 ? '▲ Ganancia' : '▼ Pérdida') + (r.totalVentas ? `<br>margen del ${margen} %` : '<br>sin ventas');

  const kpis = $$('.indicadores .kpi');
  $('strong', kpis[0]).textContent = api.pesos(r.totalVentas); $('span', kpis[0]).textContent = `${pl(r.ventas.length, 'venta', 'ventas')}`;
  $('strong', kpis[1]).textContent = api.pesos(r.totalGastos); $('span', kpis[1]).textContent = `${pl(r.gastos.length, 'gasto', 'gastos')}`;

  const filas = (items, total, color) => items.length
    ? items.map(([nombre, valor], i) => `<div class="fila"><span>${api.esc(nombre)}</span><strong>${api.pesos(valor)}</strong></div>`
        + `<div class="medidor"${i === items.length - 1 ? ' style="margin-bottom:0"' : ''}><div style="width:${total ? Math.round(valor / total * 100) : 0}%${color ? ';background:' + color : ''}"></div></div>`).join('')
    : '<p class="form-text mb-0">Sin datos en este período.</p>';

  const porTipo = Object.entries(api.TIPOS_GASTO).map(([k, n]) => [n, r.gastos.filter(g => g.tipo === k).reduce((s, g) => s + Number(g.valor), 0)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
  const porComprador = {};
  r.ventas.forEach(v => { const n = v.comprador?.nombre || 'Sin nombre'; porComprador[n] = (porComprador[n] || 0) + Number(v.valor_total); });
  const compradores = Object.entries(porComprador).sort((a, b) => b[1] - a[1]);

  const secG = $('#t-g').closest('section'), secI = $('#t-i').closest('section');
  secG.innerHTML = secG.querySelector('h2').outerHTML + filas(porTipo, r.totalGastos);
  secI.innerHTML = secI.querySelector('h2').outerHTML + filas(compradores, r.totalVentas, 'var(--color-1)');
}

async function paginaGenerarReporte() {
  const form = $('form.formulario');
  const mes = api.mesActual();
  $('#desde-r').value = mes.desde;
  $('#hasta-r').value = mes.hasta;
  const tipos = { r1: 'produccion', r2: 'gastos', r3: 'ventas' };
  alEnviar(form, async () => {
    const desde = $('#desde-r').value, hasta = $('#hasta-r').value;
    if (desde > hasta) return errorCampo('hasta-r', 'La fecha final debe ser igual o posterior a la inicial.');
    location.href = `vista-previa-reporte.html?tipo=${tipos[$('input[name="rep"]:checked').id]}&desde=${desde}&hasta=${hasta}`;
  });
}

async function paginaVistaPrevia(perfil) {
  const params = new URLSearchParams(location.search);
  const mes = api.mesActual();
  const tipo = ['produccion', 'gastos', 'ventas'].includes(params.get('tipo')) ? params.get('tipo') : 'produccion';
  const desde = params.get('desde') || mes.desde, hasta = params.get('hasta') || mes.hasta;
  const titulos = { produccion: 'Reporte de producción', gastos: 'Reporte de gastos', ventas: 'Reporte de ventas' };

  // "Volver" lleva a donde corresponde según el rol
  const volver = perfil.rol === 'admin' ? 'generar-reporte.html'
    : { produccion: 'consultar-produccion-dueno.html', gastos: 'consultar-gastos.html', ventas: 'consultar-ventas.html' }[tipo];
  $$('a[aria-label="Volver"], .acciones-hoja a.btn-secundario').forEach(a => { a.href = `${volver}?desde=${desde}&hasta=${hasta}`; });

  subtituloEncabezado(api.etiquetaRango(desde, hasta));
  document.title = `${titulos[tipo]} · Finca Cafetera`;
  const hoja = $('article.hoja');
  hoja.setAttribute('aria-label', titulos[tipo]);
  $('.marca', hoja).innerHTML = `<img src="img/logo.svg" alt="">${titulos[tipo]}`;
  $('.hoja-encabezado .text-end', hoja).innerHTML = `${api.fechaCorta(desde)}<br>a ${api.fechaCorta(hasta)}`;
  const tabla = $('table', hoja);
  const pie = $('p.form-text', hoja);
  pie.textContent = `Generado por ${perfil.nombres} ${perfil.apellidos} el ${api.fechaCorta(api.hoyISO())}.`;
  const dm = iso => api.fechaCorta(iso).slice(0, 5);
  const e = api.esc;

  if (tipo === 'produccion') {
    const filas = await api.listarProduccion(desde, hasta);
    const total = filas.reduce((s, p) => s + Number(p.kilos), 0);
    tabla.innerHTML = `<caption>Producción de café por fecha y lote</caption>
      <thead><tr><th scope="col">Fecha</th><th scope="col">Lote</th><th scope="col" class="num">Cantidad</th></tr></thead>
      <tbody>${filas.map(p => `<tr><td>${dm(p.fecha)}</td><td>${e(api.nombreLote(p.lote))}</td><td class="num">${api.kilos(p.kilos)}</td></tr>`).join('') || '<tr><td colspan="3">Sin registros en este período.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="2">Total · ${pl(filas.length, 'registro', 'registros')}</td><td class="num">${api.kilos(total)}</td></tr></tfoot>`;
  } else if (tipo === 'gastos') {
    const filas = await api.listarGastos(desde, hasta);
    const total = filas.reduce((s, g) => s + Number(g.valor), 0);
    tabla.innerHTML = `<caption>Gastos por fecha y tipo</caption>
      <thead><tr><th scope="col">Fecha</th><th scope="col">Descripción</th><th scope="col">Tipo</th><th scope="col" class="num">Valor</th></tr></thead>
      <tbody>${filas.map(g => `<tr><td>${dm(g.fecha)}</td><td>${e(g.descripcion)}</td><td>${api.TIPOS_GASTO[g.tipo]}</td><td class="num">${api.pesos(g.valor)}</td></tr>`).join('') || '<tr><td colspan="4">Sin registros en este período.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="3">Total · ${pl(filas.length, 'gasto', 'gastos')}</td><td class="num">${api.pesos(total)}</td></tr></tfoot>`;
  } else {
    const filas = await api.listarVentas(desde, hasta);
    const total = filas.reduce((s, v) => s + Number(v.valor_total), 0);
    const kg = filas.reduce((s, v) => s + Number(v.kilos), 0);
    tabla.innerHTML = `<caption>Ventas de café por fecha y comprador</caption>
      <thead><tr><th scope="col">Fecha</th><th scope="col">Comprador</th><th scope="col" class="num">Cantidad</th><th scope="col" class="num">Valor</th></tr></thead>
      <tbody>${filas.map(v => `<tr><td>${dm(v.fecha)}</td><td>${e(v.comprador?.nombre)}</td><td class="num">${api.kilos(v.kilos)}</td><td class="num">${api.pesos(v.valor_total)}</td></tr>`).join('') || '<tr><td colspan="4">Sin registros en este período.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="2">Total · ${pl(filas.length, 'venta', 'ventas')}</td><td class="num">${api.kilos(kg)}</td><td class="num">${api.pesos(total)}</td></tr></tfoot>`;
  }
}

async function paginaUsuarios(perfil) {
  const lista = $('ul.lista');
  const cargar = async () => {
    const usuarios = await api.listarPerfiles();
    subtituloEncabezado(`${pl(usuarios.filter(u => u.activo).length, 'persona', 'personas')} con acceso`);
    lista.innerHTML = usuarios.map(u => {
      const propio = u.id === perfil.id;
      const boton = propio ? '<span class="etiqueta activa">Usted</span>'
        : `<button type="button" class="boton-estado" data-id="${u.id}" data-activo="${u.activo}">${u.activo ? 'Desactivar' : 'Activar'}</button>`;
      return `<li><span class="avatar" style="width:40px;height:40px;font-size:14px;${u.activo ? '' : 'background:var(--borde)'}" aria-hidden="true">${api.esc(api.iniciales(u))}</span>`
        + `<span class="detalle">${api.esc(u.nombres + ' ' + u.apellidos)}<small>${api.ROLES[u.rol]} · ${u.activo ? 'Activo' : 'Inactivo'}</small></span>${boton}</li>`;
    }).join('');
  };
  lista.addEventListener('click', async e => {
    const b = e.target.closest('.boton-estado');
    if (!b) return;
    const activar = b.dataset.activo !== 'true';
    const nombre = b.closest('li').querySelector('.detalle').firstChild.textContent;
    if (!confirm(`¿${activar ? 'Activar' : 'Desactivar'} a ${nombre}?${activar ? '' : ' No podrá ingresar a la aplicación.'}`)) return;
    try { await ocupado(b, '…', () => api.cambiarEstadoUsuario(b.dataset.id, activar)); await cargar(); aviso('ok', `${api.esc(nombre)} quedó ${activar ? 'activo' : 'inactivo'}.`, $('main')); }
    catch (err) { aviso('error', api.esc(api.mensajeError(err)), $('main')); }
  });
  await cargar();
}

async function paginaRegistrarUsuario() {
  const form = $('form.formulario');
  $('#nacimiento').max = api.hoyISO();
  const roles = { 'Administrador de finca': 'admin', 'Dueño de finca': 'dueno' };
  alEnviar(form, async boton => {
    const cedula = $('#cedula').value.replace(/\D/g, '');
    if (!/^\d{6,10}$/.test(cedula)) return errorCampo('cedula', 'La cédula debe tener entre 6 y 10 dígitos, sin puntos.');
    if (!$('#autoriza').checked) { aviso('error', 'Para crear el usuario debe autorizar el tratamiento de sus datos personales (marque la casilla).', form); $('#autoriza').focus(); return; }
    boton.textContent = 'Creando usuario…';
    const r = await api.crearUsuario({
      nombres: $('#nombres').value.trim(), apellidos: $('#apellidos').value.trim(), cedula,
      fecha_nacimiento: $('#nacimiento').value, correo: $('#correo-u').value.trim(),
      rol: roles[$('#rol').value], autoriza_datos: true,
    });
    const nombre = `${$('#nombres').value.trim()} ${$('#apellidos').value.trim()}`;
    const correo = $('#correo-u').value.trim();
    form.reset();
    aviso('ok', `Usuario creado: ${api.esc(nombre)}.<br>Entréguele estos datos para su primer ingreso:<br>Correo: <strong>${api.esc(correo)}</strong><br>Contraseña temporal: <strong class="clave-temporal">${api.esc(r.password_temporal)}</strong><br><small>Al ingresar, la aplicación le pedirá crear su propia contraseña. Esta clave no se volverá a mostrar.</small>`, form);
  });
}

async function paginaMas(perfil) {
  $('.perfil .avatar').textContent = api.iniciales(perfil);
  $('.perfil strong').textContent = `${perfil.nombres} ${perfil.apellidos}`;
  $('.perfil .saludo').textContent = api.ROLES[perfil.rol];
  conectarCerrarSesion();
}

async function paginaRecuperarClave() {
  const form = $('form.formulario');
  alEnviar(form, async boton => {
    boton.textContent = 'Enviando…';
    await api.enviarEnlaceRecuperacion($('#correo-rec').value.trim());
    aviso('ok', 'Si el correo está registrado, le enviamos un enlace para crear una contraseña nueva. Revise también la carpeta de no deseados.', form);
  });
}

async function paginaNuevaClave() {
  const form = $('form.formulario');
  // Si llega desde el enlace del correo, Supabase abre la sesión automáticamente con el enlace
  await new Promise(r => setTimeout(r, 300));
  const { data: { session } } = await api.sb.auth.getSession();
  if (!session) {
    aviso('error', 'El enlace venció o ya fue usado. <a href="recuperar-clave.html">Pida uno nuevo</a>.', form);
    $('button[type="submit"]', form).disabled = true;
    return;
  }
  api.marcarInicioSesion();
  const perfil = await api.obtenerPerfil();
  if (perfil?.debe_cambiar_clave) $('.saludo').textContent = `Hola, ${api.nombreCorto(perfil)}. Por seguridad, cree su propia contraseña antes de continuar.`;

  alEnviar(form, async () => {
    const clave = $('#clave-nueva').value, otra = $('#clave-confirmar').value;
    if (clave.length < 8 || !/[A-Za-z]/.test(clave) || !/\d/.test(clave)) return errorCampo('clave-nueva', 'Use al menos 8 caracteres, con letras y números.');
    if (clave !== otra) return errorCampo('clave-confirmar', 'Las dos contraseñas no coinciden.');
    await api.cambiarClave(clave);
    const p = await api.obtenerPerfil();
    aviso('ok', 'Contraseña actualizada. Entrando…', form);
    setTimeout(() => location.replace(p && p.activo ? api.PANEL[p.rol] : 'index.html'), 900);
  });
}

async function paginaReiniciar() {
  const form = $('form.formulario');
  const pintar = c => $$('[data-conteo]').forEach(el => { el.textContent = c[el.dataset.conteo].toLocaleString('es-CO'); });
  pintar(await api.contarRegistros());

  alEnviar(form, async boton => {
    if ($('#frase').value.trim().toUpperCase() !== 'BORRAR TODO') return errorCampo('frase', 'Escriba exactamente BORRAR TODO.');
    const extra = [$('#borrar-compradores').checked && 'los compradores', $('#borrar-usuarios').checked && 'los demás usuarios'].filter(Boolean);
    if (!confirm('Último aviso: se borrarán toda la producción, los gastos y las ventas'
      + (extra.length ? ', y también ' + extra.join(' y ') : '') + '. Esto no se puede deshacer. ¿Continuar?')) return;
    boton.textContent = 'Borrando…';
    const r = await api.reiniciarApp({
      frase: $('#frase').value.trim(),
      clave: $('#clave-confirmar-reinicio').value,
      borrar_compradores: $('#borrar-compradores').checked,
      borrar_usuarios: $('#borrar-usuarios').checked,
    });
    form.reset();
    const partes = [pl(r.produccion, 'registro de producción', 'registros de producción'), pl(r.gastos, 'gasto', 'gastos'), pl(r.ventas, 'venta', 'ventas')];
    if (r.compradores !== undefined) partes.push(pl(r.compradores, 'comprador', 'compradores'));
    if (r.usuarios !== undefined) partes.push(pl(r.usuarios, 'usuario', 'usuarios'));
    aviso('ok', `Listo, la aplicación quedó en ceros. Se borraron: ${partes.join(', ')}.`, form);
    pintar(await api.contarRegistros());
  });
}

/* ---------------- Mapa: página → roles permitidos y función ---------------- */
const ADMIN = ['admin'], DUENO = ['dueno'], TODOS = ['admin', 'dueno'];
const PAGINAS = {
  'index.html':                      { publica: true, fn: paginaIngreso },
  'recuperar-clave.html':            { publica: true, fn: paginaRecuperarClave },
  'nueva-clave.html':                { publica: true, fn: paginaNuevaClave },
  'sesion-vencida.html':             { publica: true },
  'error.html':                      { publica: true },
  'panel.html':                      { roles: ADMIN, fn: paginaPanel },
  'registrar-produccion.html':       { roles: ADMIN, fn: paginaRegistrarProduccion },
  'consultar-produccion.html':       { roles: ADMIN, fn: paginaConsultarProduccion },
  'registrar-gasto.html':            { roles: ADMIN, fn: paginaRegistrarGasto },
  'generar-reporte.html':            { roles: ADMIN, fn: paginaGenerarReporte },
  'resumen-financiero.html':         { roles: ADMIN, fn: paginaResumen },
  'usuarios.html':                   { roles: ADMIN, fn: paginaUsuarios },
  'registrar-usuario.html':          { roles: ADMIN, fn: paginaRegistrarUsuario },
  'mas.html':                        { roles: ADMIN, fn: paginaMas },
  'reiniciar.html':                  { roles: ADMIN, fn: paginaReiniciar },
  'panel-dueno.html':                { roles: DUENO, fn: paginaPanel },
  'consultar-produccion-dueno.html': { roles: DUENO, fn: paginaConsultarProduccion },
  'consultar-gastos.html':           { roles: DUENO, fn: paginaConsultarGastos },
  'consultar-ventas.html':           { roles: DUENO, fn: paginaConsultarVentas },
  'registrar-venta.html':            { roles: DUENO, fn: paginaRegistrarVenta },
  'resumen-financiero-dueno.html':   { roles: DUENO, fn: paginaResumen },
  'vista-previa-reporte.html':       { roles: TODOS, fn: paginaVistaPrevia },
};

(async function iniciar() {
  const config = PAGINAS[pagina] || PAGINAS['index.html'];
  if (!api.configurado) {
    aviso('error', '<strong>Falta conectar la base de datos.</strong> Pegue la URL y la llave de Supabase en el archivo <code>js/config.js</code>.', $('main'));
    $$('button[type="submit"]').forEach(b => { b.disabled = true; });
    return;
  }
  try {
    if (config.publica) { if (config.fn) await config.fn(); return; }
    const perfil = await api.exigirSesion(config.roles);
    if (!perfil) return;
    document.documentElement.classList.remove('verificando');
    await config.fn(perfil);
  } catch (e) {
    console.error(e);
    document.documentElement.classList.remove('verificando');
    aviso('error', api.esc(api.mensajeError(e)), $('main'));
  }
})();
