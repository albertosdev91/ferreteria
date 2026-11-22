/**
 * ============================================================
 *  CONEXIÓN CON EL SERVIDOR (Google Apps Script)
 * ============================================================
 *  Api.llamar('accion', datos, token) → respuesta { ok: true, ... }
 *  Si falla lanza un error con .codigo (SESION_INVALIDA, SIN_RED, OCUPADO, ...).
 * ============================================================
 */
(function () {
  'use strict';

  function url() {
    let u = (window.CONFIG.API_URL || '').trim();
    if (!u) { try { u = localStorage.getItem('ferreteria_api_url') || ''; } catch (e) { u = ''; } }
    return u.trim();
  }

  function error(codigo, mensaje) {
    const e = new Error(mensaje);
    e.codigo = codigo;
    return e;
  }

  async function llamar(accion, datos, token, opciones) {
    const dir = url();
    if (!dir) throw error('SIN_URL', 'Falta la dirección del servidor (URL /exec).');
    if (!navigator.onLine) throw error('SIN_RED', 'Sin conexión a internet.');
    const seg = (opciones && opciones.segundos) || window.CONFIG.TIEMPO_ESPERA_SEG || 90;
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), seg * 1000);
    let resp;
    try {
      resp = await fetch(dir, {
        method: 'POST',
        // text/plain evita el bloqueo CORS de Google
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ accion: accion, token: token || '', datos: datos || {} }),
        redirect: 'follow',
        signal: ctrl.signal
      });
    } catch (e) {
      if (e.name === 'AbortError') throw error('SIN_RED', 'El servidor tardó demasiado en responder.');
      throw error('SIN_RED', 'No se pudo conectar con el servidor. Revise su internet.');
    } finally {
      clearTimeout(reloj);
    }
    let r;
    const texto = await resp.text();
    try {
      r = JSON.parse(texto);
    } catch (e) {
      if (/<html/i.test(texto)) {
        throw error('SIN_URL', 'La URL no responde como API. Revise que termine en /exec y que la implementación ' +
          'tenga acceso "Cualquier persona".');
      }
      throw error('ERROR', 'Respuesta no válida del servidor.');
    }
    if (!r.ok) throw error(r.codigo || 'ERROR', r.error || 'Error del servidor.');
    return r;
  }

  /** Prueba rápida (GET): sirve para validar la URL. */
  async function probar(dir) {
    const resp = await fetch(dir || url(), { method: 'GET', redirect: 'follow' });
    const r = JSON.parse(await resp.text());
    if (!r.ok) throw error('ERROR', 'El servidor respondió con error.');
    return r;
  }

  window.Api = { llamar: llamar, probar: probar, url: url };
})();
