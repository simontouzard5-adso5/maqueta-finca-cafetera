/* Sistema de Gestión Contable en finca cafetera
   Ayudas de interfaz comunes a todas las pantallas: mostrar contraseña, validación de
   formularios con mensajes en lenguaje cotidiano y cálculo del valor de la venta.
   La conexión con la base de datos está en js/api.js y js/paginas.js. */

document.addEventListener('DOMContentLoaded', () => {

  // Mostrar u ocultar la contraseña
  document.querySelectorAll('[data-mostrar]').forEach(boton => {
    boton.addEventListener('click', () => {
      const campo = document.getElementById(boton.dataset.mostrar);
      const oculto = campo.type === 'password';
      campo.type = oculto ? 'text' : 'password';
      boton.textContent = oculto ? 'Ocultar' : 'Mostrar';
      boton.setAttribute('aria-pressed', oculto);
    });
  });

  // "1.250,5" → 1250.5 · "18.500" → 18500 · "120.5" → 120.5
  const numero = texto => {
    let t = String(texto ?? '').trim().replace(/[\s$]/g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (!/^\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
    return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
  };

  // Validación de formularios. Si todo está bien, avisa con el evento "formulario-valido"
  // y la lógica de cada pantalla (js/paginas.js) se encarga de guardar.
  document.querySelectorAll('form[data-validar]').forEach(form => {
    form.addEventListener('submit', evento => {
      evento.preventDefault();
      const boton = form.querySelector('button[type="submit"]');
      if (boton && boton.disabled) return;
      let primero = null;
      form.querySelectorAll('[data-mensaje]').forEach(campo => {
        const grupo = campo.closest('.campo');
        if (!grupo || grupo.hidden) return;
        const valor = campo.value.trim();
        let error = '';
        if (campo.required && !valor) error = campo.dataset.mensaje;
        else if (campo.dataset.minimo && !(numero(valor) > 0)) error = 'La cantidad debe ser un número mayor que cero.';
        else if (campo.type === 'email' && valor && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(valor)) error = 'Escriba un correo válido, por ejemplo nombre@correo.com.';
        grupo.classList.toggle('campo-error', !!error);
        campo.setAttribute('aria-invalid', !!error);
        grupo.querySelector('.mensaje-error').textContent = error;
        if (error && !primero) primero = campo;
      });
      // Limpia errores de campos que no tienen data-mensaje (los marca js/paginas.js)
      form.querySelectorAll('.campo').forEach(g => {
        const c = g.querySelector('input, select');
        if (c && !c.dataset.mensaje && !primero) { g.classList.remove('campo-error'); c.removeAttribute('aria-invalid'); const m = g.querySelector('.mensaje-error'); if (m) m.textContent = ''; }
      });
      if (primero) { primero.focus(); return; }
      form.dispatchEvent(new CustomEvent('formulario-valido'));
    });
  });

  // Valor total de la venta calculado mientras se escribe (RF-06)
  const cantidad = document.getElementById('cantidad-venta');
  const precio = document.getElementById('precio-kg');
  const total = document.getElementById('valor-total');
  const calcular = () => {
    if (!total) return;
    const valor = Math.round((numero(cantidad.value) || 0) * (numero(precio.value) || 0));
    total.value = '$ ' + valor.toLocaleString('es-CO');
  };
  [cantidad, precio].forEach(c => c && c.addEventListener('input', calcular));
  calcular();

  // Exportar el reporte desde la vista previa
  document.querySelectorAll('[data-imprimir]').forEach(b => b.addEventListener('click', () => window.print()));
});
