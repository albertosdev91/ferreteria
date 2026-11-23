/**
 * ============================================================
 *  FASE 5: LECTOR DE CÓDIGO DE BARRAS
 * ============================================================
 *  - Lector USB / Bluetooth: funciona como un teclado. Haga clic en
 *    un campo y escanee: escribe el código y pulsa Enter solo.
 *  - Cámara del celular: Escaner.leer() abre la cámara trasera y
 *    devuelve el código leído (o null si se cancela).
 *    Usa el lector incorporado del navegador (Chrome en Android).
 *    Si el navegador no lo tiene, permite escribir el código a mano.
 *
 *  Uso en otras fases:
 *    const codigo = await Escaner.leer({ titulo: 'Escanee el producto' });
 *    Escaner.boton(inputEl)  → agrega un botón de cámara que llena el campo
 *    Escaner.icono           → SVG de la cámara
 * ============================================================
 */
(function () {
  'use strict';

  const esc = U.esc;
  const svg = d => '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
  const ICONO = svg('M4 7h3l2-3h6l2 3h3a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1M12 17a4 4 0 100-8 4 4 0 000 8');
  const LINTERNA = svg('M9 2h6v5l-2 3v12h-2V10L9 7zM12 13v2');
  const CERRAR = svg('M18 6L6 18M6 6l12 12');

  // Formatos comunes en ferretería (EAN de productos, Code 128/39 de cajas, QR)
  const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'codabar', 'itf', 'qr_code', 'data_matrix'];

  const soportado = () => 'BarcodeDetector' in window && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  let audio = null;
  function pitido() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'square'; o.frequency.value = 1800; g.gain.value = 0.06;
      o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + 0.09);
    } catch (e) { /* sin sonido */ }
    if (navigator.vibrate) navigator.vibrate(70);
  }

  /** Limpia lo que escribe un lector (espacios, saltos de línea). */
  function limpiar(codigo) {
    return String(codigo == null ? '' : codigo).replace(/[\r\n\t]/g, '').trim();
  }

  /**
   * Abre la cámara y devuelve el código leído.
   * op: { titulo, ayuda }
   */
  function leer(op) {
    op = op || {};
    return new Promise(resolver => {
      let stream = null, activo = true, detector = null, linterna = false, anterior = '', repeticiones = 0;
      const capa = document.createElement('div');
      capa.className = 'escaner';
      capa.innerHTML =
        '<div class="esc-cabeza"><b>' + esc(op.titulo || 'Escanear código de barras') + '</b>' +
        '<button class="btn btn-icono" data-x aria-label="Cerrar">' + CERRAR + '</button></div>' +
        '<div class="esc-video"><video playsinline muted></video><div class="esc-marco"><span></span></div>' +
        '<div class="esc-estado">Iniciando la cámara…</div></div>' +
        '<div class="esc-pie">' +
        '<p>' + esc(op.ayuda || 'Ponga el código dentro del recuadro, a unos 15 cm. Con buena luz se lee más rápido.') + '</p>' +
        '<div class="esc-botones"><button class="btn btn-borde oculto" data-luz>' + LINTERNA + 'Linterna</button>' +
        '<button class="btn btn-borde" data-manual>Escribir el código</button></div>' +
        '<form class="esc-manual oculto"><input class="entrada" placeholder="Código" autocomplete="off" inputmode="text">' +
        '<button class="btn btn-principal" type="submit">Usar</button></form></div>';
      document.body.appendChild(capa);
      const video = capa.querySelector('video');
      const estado = capa.querySelector('.esc-estado');

      const terminar = codigo => {
        if (!activo) return;
        activo = false;
        if (stream) stream.getTracks().forEach(t => t.stop());
        capa.remove();
        document.removeEventListener('keydown', tecla);
        resolver(codigo ? limpiar(codigo) : null);
      };
      const tecla = e => { if (e.key === 'Escape') terminar(null); };
      document.addEventListener('keydown', tecla);
      capa.querySelector('[data-x]').onclick = () => terminar(null);

      const manual = capa.querySelector('.esc-manual');
      const mostrarManual = () => {
        manual.classList.remove('oculto');
        setTimeout(() => manual.querySelector('input').focus(), 50);
      };
      capa.querySelector('[data-manual]').onclick = mostrarManual;
      manual.onsubmit = e => { e.preventDefault(); const v = limpiar(manual.querySelector('input').value); if (v) terminar(v); };

      const fallo = texto => {
        estado.textContent = texto;
        estado.classList.add('mal');
        mostrarManual();
      };

      if (!soportado()) {
        fallo('Este navegador no puede leer códigos con la cámara. Use Chrome en Android, un lector USB, o escriba el código.');
        return;
      }

      (async () => {
        try {
          let formatos = FORMATOS;
          try {
            const disponibles = await window.BarcodeDetector.getSupportedFormats();
            formatos = FORMATOS.filter(f => disponibles.indexOf(f) >= 0);
          } catch (e) { /* usar la lista completa */ }
          if (!formatos.length) { fallo('Este equipo no puede leer códigos con la cámara. Escriba el código.'); return; }
          detector = new window.BarcodeDetector({ formats: formatos });
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false
          });
          if (!activo) { stream.getTracks().forEach(t => t.stop()); return; }
          video.srcObject = stream;
          await video.play();
          estado.textContent = 'Buscando un código…';

          // Linterna (solo si la cámara la tiene)
          const pista = stream.getVideoTracks()[0];
          const cap = pista && pista.getCapabilities ? pista.getCapabilities() : {};
          if (cap.torch) {
            const b = capa.querySelector('[data-luz]');
            b.classList.remove('oculto');
            b.onclick = async () => {
              linterna = !linterna;
              try { await pista.applyConstraints({ advanced: [{ torch: linterna }] }); } catch (e) { linterna = false; }
              b.classList.toggle('btn-principal', linterna);
            };
          }

          // Lee varias veces por segundo. Acepta el código cuando sale igual 2 veces (evita lecturas falsas).
          const ciclo = async () => {
            if (!activo) return;
            try {
              if (video.readyState >= 2) {
                const r = await detector.detect(video);
                const v = r && r.length ? limpiar(r[0].rawValue) : '';
                if (v) {
                  repeticiones = v === anterior ? repeticiones + 1 : 1;
                  anterior = v;
                  if (repeticiones >= 2) { pitido(); terminar(v); return; }
                }
              }
            } catch (e) { /* cuadro no listo */ }
            setTimeout(ciclo, 120);
          };
          ciclo();
        } catch (e) {
          if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
            fallo('No hay permiso para usar la cámara. Toque el candado junto a la dirección → Permisos → Cámara → Permitir. Luego intente de nuevo.');
          } else if (e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')) {
            fallo('No se encontró una cámara en este equipo.');
          } else if (e && e.name === 'NotReadableError') {
            fallo('La cámara está ocupada por otra aplicación. Ciérrela e intente de nuevo.');
          } else {
            fallo('No se pudo abrir la cámara: ' + ((e && e.message) || e));
          }
        }
      })();
    });
  }

  /**
   * Agrega un botón de cámara al lado de un campo de texto.
   * Al leer: llena el campo y dispara "input" y, si op.enter, también la tecla Enter.
   */
  function boton(input, op) {
    op = op || {};
    const caja = document.createElement('div');
    caja.className = 'con-camara';
    input.parentNode.insertBefore(caja, input);
    caja.appendChild(input);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-icono';
    b.title = 'Leer con la cámara';
    b.setAttribute('aria-label', 'Leer con la cámara');
    b.innerHTML = ICONO;
    b.onclick = async () => {
      const v = await leer({ titulo: op.titulo });
      if (!v) return;
      input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      if (op.enter) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      if (op.alLeer) op.alLeer(v);
    };
    caja.appendChild(b);
    return b;
  }

  window.Escaner = { leer: leer, boton: boton, soportado: soportado, limpiar: limpiar, pitido: pitido, icono: ICONO };
})();
