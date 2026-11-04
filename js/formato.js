/* =====================================================================
   Finca Cafetera · Formatos compartidos
   Funciones pequeñas que usan tanto js/app.js como js/api.js
   (están en un solo lugar para no repetir código).
   ===================================================================== */

/* Convierte lo que escribe el usuario a número: "1.250,5" → 1250.5 · "18.500" → 18500 · "120.5" → 120.5 */
export function numero(texto) {
  let t = String(texto ?? '').trim().replace(/[\s$]/g, '');
  if (!t) return NaN;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/* Separador de miles: "1000000" → "1.000.000" */
export const miles = digitos => String(digitos).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
