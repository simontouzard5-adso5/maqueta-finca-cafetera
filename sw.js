/* =====================================================================
   Finca Cafetera · Service worker (funcionamiento sin señal)
   Guarda la aplicación en el teléfono para que abra aunque no haya señal.
   - Pantallas y archivos: primero intenta la red (para tener siempre la
     versión nueva); si no hay señal o tarda demasiado, usa la copia guardada.
   - Los datos de Supabase NO pasan por aquí (los maneja js/api.js).
   Al cambiar la lista de archivos, suba el número de VERSION.
   ===================================================================== */
const VERSION = 'finca-v2';
const ESPERA_RED_MS = 4000;   // con señal muy débil, después de 4 s se usa la copia guardada

const ARCHIVOS = [
  './', 'index.html', 'panel.html', 'panel-dueno.html', 'mas.html',
  'registrar-produccion.html', 'consultar-produccion.html', 'consultar-produccion-dueno.html',
  'registrar-gasto.html', 'consultar-gastos.html', 'registrar-venta.html', 'consultar-ventas.html',
  'resumen-financiero.html', 'resumen-financiero-dueno.html', 'generar-reporte.html', 'vista-previa-reporte.html',
  'lotes.html', 'usuarios.html', 'registrar-usuario.html', 'reiniciar.html',
  'recuperar-clave.html', 'nueva-clave.html', 'sesion-vencida.html',
  'css/estilos.css', 'vendor/bootstrap.min.css', 'vendor/supabase.esm.js',
  'js/app.js', 'js/api.js', 'js/formato.js', 'js/config.js', 'js/iconos.js', 'js/paginas.js',
  'img/logo.png', 'img/favicon.png', 'img/cafetal.webp', 'img/poster-tutorial.webp', 'img/apple-touch-icon.png',
  'fonts/inter-400.woff2', 'fonts/inter-500.woff2', 'fonts/inter-600.woff2', 'fonts/inter-700.woff2',
];

self.addEventListener('install', evento => {
  evento.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // uno por uno: si algún archivo falla, los demás igual quedan guardados
    await Promise.all(ARCHIVOS.map(a => cache.add(new Request(a, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', evento => {
  evento.waitUntil((async () => {
    for (const nombre of await caches.keys()) if (nombre !== VERSION) await caches.delete(nombre);
    await self.clients.claim();
  })());
});

function redConLimite(peticion) {
  return new Promise((resolver, rechazar) => {
    const reloj = setTimeout(() => rechazar(new Error('lento')), ESPERA_RED_MS);
    fetch(peticion).then(r => { clearTimeout(reloj); resolver(r); }, e => { clearTimeout(reloj); rechazar(e); });
  });
}

self.addEventListener('fetch', evento => {
  const peticion = evento.request;
  const url = new URL(peticion.url);
  if (peticion.method !== 'GET' || url.origin !== self.location.origin) return;   // Supabase y otros: sin tocar
  if (url.pathname.endsWith('/sw.js')) return;
  if (peticion.headers.has('range')) return;   // video: lo maneja el navegador

  evento.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const respuesta = await redConLimite(peticion);
      if (respuesta.ok && respuesta.type === 'basic') {
        // se guarda sin los "?v=..." para que cualquier versión de la dirección encuentre la copia
        const limpia = new URL(url); limpia.search = '';
        cache.put(limpia.href, respuesta.clone()).catch(() => {});
      }
      return respuesta;
    } catch {
      const copia = await cache.match(peticion, { ignoreSearch: true });
      if (copia) return copia;
      if (peticion.mode === 'navigate') {
        const inicio = await cache.match('index.html', { ignoreSearch: true });
        if (inicio) return inicio;
      }
      return new Response('Sin señal y este archivo no está guardado en el teléfono.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
