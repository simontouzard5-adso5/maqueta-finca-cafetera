/* Sistema de Gestión Contable en finca cafetera
   Comportamiento de la maqueta: validación de formularios, cálculo del valor de la venta
   y ayudas de interacción. No contiene lógica de negocio ni conexión con el servidor. */

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

  // Validación de formularios con mensajes en lenguaje cotidiano
  document.querySelectorAll('form[data-validar]').forEach(form => {
    form.addEventListener('submit', evento => {
      evento.preventDefault();
      let primero = null;
      form.querySelectorAll('[data-mensaje]').forEach(campo => {
        const grupo = campo.closest('.campo');
        const valor = campo.value.trim();
        let error = '';
        if (campo.required && !valor) error = campo.dataset.mensaje;
        else if (campo.dataset.minimo && parseFloat(valor.replace(/\./g, '').replace(',', '.')) <= 0) error = 'La cantidad debe ser mayor que cero.';
        else if (campo.type === 'email' && valor && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(valor)) error = 'Escriba un correo válido, por ejemplo nombre@correo.com.';
        grupo.classList.toggle('campo-error', !!error);
        campo.setAttribute('aria-invalid', !!error);
        grupo.querySelector('.mensaje-error').textContent = error;
        if (error && !primero) primero = campo;
      });
      if (primero) { primero.focus(); return; }
      if (form.dataset.destino) {
        // En la maqueta, el rol se elige por el correo: dueno@... entra como Dueño de finca
        const correo = form.querySelector('#correo');
        const esDueno = correo && /^(dueno|duen|dueño)/i.test(correo.value.trim());
        window.location.href = esDueno ? 'panel-dueno.html' : form.dataset.destino;
        return;
      }
      const aviso = form.querySelector('.aviso-ok');
      if (aviso) { aviso.hidden = false; aviso.focus(); }
    });
  });

  // Valor total de la venta calculado mientras se escribe (RF-06)
  const cantidad = document.getElementById('cantidad-venta');
  const precio = document.getElementById('precio-kg');
  const total = document.getElementById('valor-total');
  const numero = texto => parseFloat(String(texto).replace(/\./g, '').replace(',', '.')) || 0;
  const calcular = () => {
    if (!total) return;
    total.value = '$ ' + Math.round(numero(cantidad.value) * numero(precio.value)).toLocaleString('es-CO');
  };
  [cantidad, precio].forEach(c => c && c.addEventListener('input', calcular));
  calcular();

  // Exportar el reporte desde la vista previa
  document.querySelectorAll('[data-imprimir]').forEach(b => b.addEventListener('click', () => window.print()));
});
