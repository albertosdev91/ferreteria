/**
 * ============================================================
 *  BASE DE DATOS LOCAL (IndexedDB) — funciona sin internet
 * ============================================================
 *  - "ferreteria_sistema": datos del equipo (id del dispositivo, usuarios que
 *    ya iniciaron sesión aquí, correlativos de numeración).
 *  - "ferreteria_u_<usuario_id>": una base por usuario (así un vendedor no ve
 *    datos que bajó un administrador en el mismo equipo).
 *      · datos   → copia local de las pestañas de Google Sheets
 *      · salida  → registros hechos en este equipo que faltan enviar
 *      · meta    → fecha de la última sincronización, etc.
 * ============================================================
 */
(function () {
  'use strict';

  // ---------- Utilidades generales ----------
  const U = {
    uuid() {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      const b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
      const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
      return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
    },
    /** Fecha ISO con zona horaria del equipo: 2026-11-22T09:15:00.000-04:00 */
    ahoraISO(d) {
      d = d || new Date();
      const p = (n, l) => String(n).padStart(l || 2, '0');
      const off = -d.getTimezoneOffset();
      const s = off >= 0 ? '+' : '-';
      const a = Math.abs(off);
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' +
        p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.' + p(d.getMilliseconds(), 3) + s + p(Math.floor(a / 60)) + ':' + p(a % 60);
    },
    fechaCorta(iso) {
      if (!iso) return '—';
      const d = new Date(iso);
      if (isNaN(d)) return String(iso);
      return d.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
        d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
    },
    bs(n) {
      return 'Bs ' + (Number(n) || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
  };

  // Clave de cada fila según la pestaña (casi todas usan "id")
  const CLAVES = {
    CONFIG: f => String(f.clave),
    ROLES: f => String(f.rol),
    LISTAS: f => f.lista + '|' + f.codigo,
    STOCK_ACTUAL: f => f.sucursal_id + '|' + f.producto_id
  };
  const claveDe = (tabla, fila) => (CLAVES[tabla] || (f => String(f.id || '')))(fila);

  // ---------- Envoltorio de IndexedDB con promesas ----------
  function abrir(nombre, version, crear) {
    return new Promise((ok, mal) => {
      const r = indexedDB.open(nombre, version);
      r.onupgradeneeded = () => crear(r.result, r.transaction);
      r.onsuccess = () => {
        const db = r.result;
        db.onversionchange = () => db.close();
        ok(db);
      };
      r.onerror = () => mal(r.error);
      r.onblocked = () => mal(new Error('Cierre las otras pestañas de la app y vuelva a intentar.'));
    });
  }
  const req = r => new Promise((ok, mal) => { r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });
  const fin = tx => new Promise((ok, mal) => {
    tx.oncomplete = () => ok(); tx.onerror = () => mal(tx.error); tx.onabort = () => mal(tx.error || new Error('Operación cancelada'));
  });

  // ============================================================
  //  BASE DEL SISTEMA (una por equipo)
  // ============================================================
  let dbSis = null;
  async function sistema() {
    if (!dbSis) {
      dbSis = await abrir('ferreteria_sistema', 1, db => {
        db.createObjectStore('meta', { keyPath: 'k' });
        db.createObjectStore('usuarios', { keyPath: 'usuario_id' });
        db.createObjectStore('correlativos', { keyPath: 'k' });
      });
    }
    return dbSis;
  }

  const Sistema = {
    async get(k) {
      const db = await sistema();
      const r = await req(db.transaction('meta').objectStore('meta').get(k));
      return r ? r.v : undefined;
    },
    async set(k, v) {
      const db = await sistema();
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({ k: k, v: v });
      return fin(tx);
    },
    /** Identificador único de este equipo (se crea una sola vez). */
    async dispositivoId() {
      let id = await Sistema.get('dispositivo_id');
      if (!id) {
        id = localStorage.getItem('ferreteria_dispositivo_id') || U.uuid();
        await Sistema.set('dispositivo_id', id);
      }
      try { localStorage.setItem('ferreteria_dispositivo_id', id); } catch (e) { /* sin espacio */ }
      return id;
    },
    async usuarios() {
      const db = await sistema();
      return req(db.transaction('usuarios').objectStore('usuarios').getAll());
    },
    async usuario(id) {
      const db = await sistema();
      return req(db.transaction('usuarios').objectStore('usuarios').get(id));
    },
    async usuarioPorNombre(nombre) {
      nombre = String(nombre || '').trim().toLowerCase();
      return (await Sistema.usuarios()).find(u => u.usuario === nombre);
    },
    async guardarUsuario(u) {
      const db = await sistema();
      const tx = db.transaction('usuarios', 'readwrite');
      tx.objectStore('usuarios').put(u);
      return fin(tx);
    },
    async borrarUsuario(id) {
      const db = await sistema();
      const tx = db.transaction('usuarios', 'readwrite');
      tx.objectStore('usuarios').delete(id);
      return fin(tx);
    },

    /** Al iniciar sesión: el servidor manda los últimos números usados por este equipo. */
    async mezclarCorrelativos(lista) {
      const db = await sistema();
      const tx = db.transaction('correlativos', 'readwrite');
      const st = tx.objectStore('correlativos');
      for (const c of (lista || [])) {
        const k = c.sucursal_id + '|' + c.tipo_documento;
        const act = await req(st.get(k));
        const n = Number(c.ultimo_numero) || 0;
        if (!act || n > act.ultimo) st.put({ k: k, ultimo: n });
      }
      return fin(tx);
    },
    /** Reserva el siguiente número (seguro aunque se pulse dos veces). */
    async siguienteNumero(sucursalId, tipo) {
      const db = await sistema();
      const tx = db.transaction('correlativos', 'readwrite');
      const st = tx.objectStore('correlativos');
      const k = sucursalId + '|' + tipo;
      const act = await req(st.get(k));
      const n = (act ? act.ultimo : 0) + 1;
      st.put({ k: k, ultimo: n });
      await fin(tx);
      return n;
    }
  };

  // ============================================================
  //  BASE DEL USUARIO (datos + pendientes por enviar)
  // ============================================================
  const abiertas = {};
  async function baseUsuario(usuarioId) {
    if (!usuarioId) throw new Error('No hay usuario activo.');
    if (!abiertas[usuarioId]) {
      abiertas[usuarioId] = await abrir('ferreteria_u_' + usuarioId, 1, db => {
        const d = db.createObjectStore('datos', { keyPath: ['tabla', 'clave'] });
        d.createIndex('tabla', 'tabla');
        const s = db.createObjectStore('salida', { keyPath: ['tabla', 'clave'] });
        s.createIndex('seq', 'seq');
        db.createObjectStore('meta', { keyPath: 'k' });
      });
    }
    return abiertas[usuarioId];
  }

  function Local(usuarioId) {
    const L = {
      usuarioId: usuarioId,
      base: () => baseUsuario(usuarioId),

      async meta(k, v) {
        const db = await L.base();
        if (arguments.length < 2) {
          const r = await req(db.transaction('meta').objectStore('meta').get(k));
          return r ? r.v : undefined;
        }
        const tx = db.transaction('meta', 'readwrite');
        tx.objectStore('meta').put({ k: k, v: v });
        return fin(tx);
      },

      /** Todas las filas de una pestaña (opcional: filtro). */
      async listar(tabla, filtro) {
        const db = await L.base();
        const filas = await req(db.transaction('datos').objectStore('datos').index('tabla').getAll(tabla));
        const r = filas.map(x => x.fila);
        return filtro ? r.filter(filtro) : r;
      },
      async obtener(tabla, clave) {
        const db = await L.base();
        const r = await req(db.transaction('datos').objectStore('datos').get([tabla, String(clave)]));
        return r ? r.fila : null;
      },
      async contar(tabla) {
        const db = await L.base();
        return req(db.transaction('datos').objectStore('datos').index('tabla').count(tabla));
      },

      /**
       * Guarda filas hechas en ESTE equipo: quedan en la base local y en "salida"
       * para enviarse al servidor. registros = [{ tabla, fila }]. Todo o nada.
       */
      async guardarLocal(registros) {
        const db = await L.base();
        const tx = db.transaction(['datos', 'salida', 'meta'], 'readwrite');
        const datos = tx.objectStore('datos');
        const salida = tx.objectStore('salida');
        const meta = tx.objectStore('meta');
        const m = await req(meta.get('seq'));
        let seq = m ? m.v : 0;
        for (const r of registros) {
          const clave = claveDe(r.tabla, r.fila);
          if (!clave) throw new Error('Registro sin id en ' + r.tabla);
          const previo = await req(datos.get([r.tabla, clave]));
          const fila = Object.assign({}, previo ? previo.fila : {}, r.fila);
          datos.put({ tabla: r.tabla, clave: clave, fila: fila });
          const pend = await req(salida.get([r.tabla, clave]));
          // Si ya estaba pendiente, se combina (se envía una sola vez con lo último)
          salida.put({
            tabla: r.tabla, clave: clave,
            fila: Object.assign({}, pend && pend.estado === 'PENDIENTE' ? pend.fila : {}, r.fila),
            seq: pend ? pend.seq : ++seq, estado: 'PENDIENTE', error: '', creado: pend ? pend.creado : U.ahoraISO()
          });
        }
        meta.put({ k: 'seq', v: seq });
        return fin(tx);
      },

      /** Guarda lo que llegó del servidor (sin pisar lo que falta enviar). */
      async guardarDelServidor(tablas, completo) {
        const db = await L.base();
        let total = 0;
        for (const tabla of Object.keys(tablas || {})) {
          const filas = tablas[tabla] || [];
          const tx = db.transaction(['datos', 'salida'], 'readwrite');
          const datos = tx.objectStore('datos');
          const salida = tx.objectStore('salida');
          const pendientes = new Set((await req(salida.getAll())).filter(p => p.tabla === tabla).map(p => p.clave));
          if (completo) {
            // Descarga completa: se reemplaza la pestaña (menos lo pendiente)
            const actuales = await req(datos.index('tabla').getAllKeys(tabla));
            actuales.forEach(k => { if (!pendientes.has(k[1])) datos.delete(k); });
          }
          for (const f of filas) {
            const clave = claveDe(tabla, f);
            if (!clave || clave === 'undefined' || pendientes.has(clave)) continue;
            datos.put({ tabla: tabla, clave: clave, fila: f });
            total++;
          }
          await fin(tx);
        }
        return total;
      },

      // ---------- Pendientes por enviar ----------
      async salida(estado) {
        const db = await L.base();
        const r = await req(db.transaction('salida').objectStore('salida').index('seq').getAll());
        return estado ? r.filter(x => x.estado === estado) : r;
      },
      async contarSalida() {
        const r = await L.salida();
        return {
          pendientes: r.filter(x => x.estado === 'PENDIENTE').length,
          errores: r.filter(x => x.estado !== 'PENDIENTE').length
        };
      },
      /** resultados del servidor → quita lo aceptado y marca lo rechazado */
      async aplicarResultados(enviados, resultados) {
        const db = await L.base();
        const tx = db.transaction('salida', 'readwrite');
        const st = tx.objectStore('salida');
        const resumen = { ok: 0, conflictos: 0, errores: 0 };
        for (let i = 0; i < enviados.length; i++) {
          const e = enviados[i];
          const r = resultados[i] || { estado: 'ERROR', error: 'Sin respuesta del servidor' };
          const actual = await req(st.get([e.tabla, e.clave]));
          if (['OK', 'ACTUALIZADO', 'SIN_CAMBIOS', 'CONFLICTO'].indexOf(r.estado) >= 0) {
            // Solo se borra si no cambió mientras se enviaba
            if (actual && JSON.stringify(actual.fila) === JSON.stringify(e.fila)) st.delete([e.tabla, e.clave]);
            if (r.estado === 'CONFLICTO') resumen.conflictos++; else resumen.ok++;
          } else if (actual) {
            actual.estado = r.estado === 'RECHAZADO' ? 'RECHAZADO' : 'ERROR';
            actual.error = r.error || r.estado;
            st.put(actual);
            resumen.errores++;
          }
        }
        await fin(tx);
        return resumen;
      },
      async reintentar(tabla, clave) {
        const db = await L.base();
        const tx = db.transaction('salida', 'readwrite');
        const st = tx.objectStore('salida');
        const lista = tabla ? [await req(st.get([tabla, clave]))] : await req(st.getAll());
        lista.filter(x => x && x.estado !== 'PENDIENTE').forEach(x => { x.estado = 'PENDIENTE'; x.error = ''; st.put(x); });
        return fin(tx);
      },
      async descartar(tabla, clave) {
        const db = await L.base();
        const tx = db.transaction(['salida', 'datos'], 'readwrite');
        tx.objectStore('salida').delete([tabla, clave]);
        tx.objectStore('datos').delete([tabla, clave]);   // volverá a bajar la versión del servidor, si existe
        return fin(tx);
      },

      /** Stock en UNIDADES = último stock del servidor + movimientos de este equipo aún no enviados. */
      async stock(sucursalId, productoId) {
        const s = await L.obtener('STOCK_ACTUAL', sucursalId + '|' + productoId);
        let total = s ? Number(s.stock) || 0 : 0;
        const pend = await L.salida();
        pend.filter(p => p.tabla === 'MOVIMIENTOS' && p.fila.sucursal_id === sucursalId && p.fila.producto_id === productoId)
          .forEach(p => { total += Number(p.fila.cantidad) || 0; });
        return Math.round(total * 1000) / 1000;
      },

      /** Borra la copia local (lo pendiente NO se borra). */
      async vaciarDatos() {
        const db = await L.base();
        const tx = db.transaction(['datos', 'meta', 'salida'], 'readwrite');
        const pend = new Set((await req(tx.objectStore('salida').getAll())).map(p => p.tabla + '|' + p.clave));
        const claves = await req(tx.objectStore('datos').getAllKeys());
        claves.forEach(k => { if (!pend.has(k[0] + '|' + k[1])) tx.objectStore('datos').delete(k); });
        tx.objectStore('meta').delete('servidor_en');
        return fin(tx);
      }
    };
    return L;
  }

  async function borrarBaseUsuario(usuarioId) {
    if (abiertas[usuarioId]) { abiertas[usuarioId].close(); delete abiertas[usuarioId]; }
    await new Promise(ok => {
      const r = indexedDB.deleteDatabase('ferreteria_u_' + usuarioId);
      r.onsuccess = r.onerror = r.onblocked = () => ok();
    });
  }

  window.U = U;
  window.DB = { Sistema: Sistema, Local: Local, claveDe: claveDe, borrarBaseUsuario: borrarBaseUsuario };
})();
