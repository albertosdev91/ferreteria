/**
 * ============================================================
 *  SINCRONIZACIÓN + FUNCIONES DE DATOS PARA LAS PANTALLAS
 * ============================================================
 *  Sync.ejecutar()  → 1) revisa la sesión  2) SUBE lo pendiente  3) BAJA lo nuevo
 *  Se ejecuta sola: al abrir la app, al volver internet, cada X minutos
 *  y unos segundos después de guardar algo.
 *
 *  Datos.*  → lo que usarán las pantallas de las próximas fases
 *    Datos.listar('PRODUCTOS', f => f.estado === 'ACTIVO')
 *    Datos.guardar('CLIENTES', { razon_social: 'Juan' })          (crea id, fechas, usuario…)
 *    Datos.guardarVarios([{ tabla, fila }, ...])                    (todo o nada)
 *    Datos.anular('VENTAS', id, 'motivo')
 *    Datos.numero('V', sucursalId)   → 'V-SUC01-D02-000015'
 *    Datos.stock(sucursalId, productoId)  → unidades
 * ============================================================
 */
(function () {
  'use strict';

  const emitir = (tipo, detalle) => window.dispatchEvent(new CustomEvent(tipo, { detail: detalle || {} }));

  const Sync = {
    corriendo: false,
    estado: { estado: 'inactivo', mensaje: '', en: '' },
    _temporizador: null,
    _intervalo: null,

    poner(estado, mensaje) {
      Sync.estado = { estado: estado, mensaje: mensaje || '', en: U.ahoraISO() };
      emitir('sync-estado', Sync.estado);
    },

    /** Programa una sincronización en unos segundos (agrupa varios guardados). */
    programar(segundos) {
      clearTimeout(Sync._temporizador);
      Sync._temporizador = setTimeout(() => Sync.ejecutar(), (segundos || 3) * 1000);
    },

    iniciarAutomatica() {
      window.addEventListener('online', () => { emitir('red', { online: true }); Sync.programar(1); });
      window.addEventListener('offline', () => { emitir('red', { online: false }); Sync.poner('sin_red', 'Sin internet. Todo se guarda en el equipo.'); });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) Sync.programar(1); });
      clearInterval(Sync._intervalo);
      Sync._intervalo = setInterval(() => { if (!document.hidden) Sync.ejecutar(); },
        (window.CONFIG.SYNC_CADA_MINUTOS || 5) * 60000);
    },

    /**
     * opciones.completo = true → vuelve a descargar todo
     * Devuelve un resumen { subidos, conflictos, errores, bajados }
     */
    async ejecutar(opciones) {
      opciones = opciones || {};
      const u = Sesion.actual;
      if (!u || Sync.corriendo) return null;
      if (!navigator.onLine) { Sync.poner('sin_red', 'Sin internet. Todo se guarda en el equipo.'); return null; }
      if (!u.token) { Sync.poner('requiere_login', 'Inicie sesión de nuevo (con internet) para sincronizar.'); emitir('requiere-login'); return null; }

      Sync.corriendo = true;
      const res = { subidos: 0, conflictos: 0, errores: 0, bajados: 0 };
      const L = Sesion.local;
      try {
        // 1) Sesión al día (sucursales asignadas, usuario activo, equipo no bloqueado)
        Sync.poner('sincronizando', 'Verificando sesión…');
        const s = await Api.llamar('sesion', {}, u.token, { segundos: 30 });
        await Sesion.refrescarDesdeServidor(s.sesion);

        // 2) SUBIR lo pendiente, por lotes
        const lote = window.CONFIG.SYNC_LOTE || 500;
        let vuelta = 0;
        for (;;) {
          const pend = (await L.salida('PENDIENTE')).slice(0, lote);
          if (!pend.length || vuelta++ > 50) break;
          Sync.poner('sincronizando', 'Enviando ' + pend.length + ' registros…');
          const enviados = pend.map(p => ({ tabla: p.tabla, clave: p.clave, fila: p.fila }));
          const r = await Api.llamar('subir', { registros: enviados.map(e => ({ tabla: e.tabla, fila: e.fila })) }, u.token);
          const a = await L.aplicarResultados(enviados, r.resultados || []);
          res.subidos += a.ok; res.conflictos += a.conflictos; res.errores += a.errores;
          if (pend.length < lote) break;
        }

        // 3) Pendientes de OTROS usuarios de este equipo (si su sesión sigue vigente)
        await Sync.subirOtrosUsuarios(u.usuario_id);

        // 4) BAJAR lo que cambió
        Sync.poner('sincronizando', 'Descargando cambios…');
        const desde = opciones.completo ? '' : ((await L.meta('servidor_en')) || '');
        const b = await Api.llamar('bajar', { desde: desde }, u.token, { segundos: 300 });
        res.bajados = await L.guardarDelServidor(b.tablas, b.completo);
        await L.meta('servidor_en', b.servidor_en);
        await L.meta('ultimo_sync_en', U.ahoraISO());
        await L.meta('ultimo_resultado', res);

        const txt = 'Sincronizado' + (res.subidos ? ' · enviados ' + res.subidos : '') +
          (res.bajados ? ' · recibidos ' + res.bajados : '') + (res.errores ? ' · ' + res.errores + ' con error' : '');
        Sync.poner(res.errores ? 'con_errores' : 'ok', txt);
        emitir('datos-actualizados', res);
        return res;
      } catch (e) {
        await Sync.manejarError(e);
        return null;
      } finally {
        Sync.corriendo = false;
        emitir('pendientes-cambiaron');
      }
    },

    async manejarError(e) {
      switch (e.codigo) {
        case 'SIN_RED':
          Sync.poner('sin_red', e.message); break;
        case 'OCUPADO':
          Sync.poner('error', 'Servidor ocupado. Se reintentará en un momento.'); Sync.programar(30); break;
        case 'SESION_INVALIDA':
          await Sesion.marcarSesionVencida();
          Sync.poner('requiere_login', e.message); emitir('requiere-login'); break;
        case 'USUARIO_INACTIVO':
        case 'DISPOSITIVO_BLOQUEADO':
          await Sesion.marcarSesionVencida();
          Sync.poner('bloqueado', e.message); emitir('bloqueado', { mensaje: e.message }); break;
        default:
          Sync.poner('error', e.message || 'Error al sincronizar.');
      }
    },

    async subirOtrosUsuarios(activoId) {
      const otros = (await DB.Sistema.usuarios()).filter(x => x.usuario_id !== activoId && x.token);
      for (const o of otros) {
        const L = DB.Local(o.usuario_id);
        const pend = (await L.salida('PENDIENTE')).slice(0, window.CONFIG.SYNC_LOTE || 500);
        if (!pend.length) continue;
        try {
          const enviados = pend.map(p => ({ tabla: p.tabla, clave: p.clave, fila: p.fila }));
          const r = await Api.llamar('subir', { registros: enviados.map(e => ({ tabla: e.tabla, fila: e.fila })) }, o.token);
          await L.aplicarResultados(enviados, r.resultados || []);
        } catch (e) {
          if (e.codigo === 'SESION_INVALIDA') { o.token = ''; o.sesion_vencida = true; await DB.Sistema.guardarUsuario(o); }
        }
      }
    }
  };

  // ============================================================
  //  DATOS: funciones para las pantallas
  // ============================================================
  // Pestañas que no usan "id" como clave
  const SIN_ID = ['CONFIG', 'ROLES', 'LISTAS', 'STOCK_ACTUAL'];

  const Datos = {
    listar: (tabla, filtro) => Sesion.local.listar(tabla, filtro),
    obtener: (tabla, clave) => Sesion.local.obtener(tabla, clave),
    stock: (sucursalId, productoId) => Sesion.local.stock(sucursalId, productoId),

    /** Completa id, fechas, usuario y dispositivo. */
    async preparar(tabla, fila) {
      const u = Sesion.actual;
      const ahora = U.ahoraISO();
      const f = Object.assign({}, fila);
      const dispId = await DB.Sistema.dispositivoId();
      let previo = null;
      if (f.id) previo = await Sesion.local.obtener(tabla, f.id);
      else if (SIN_ID.indexOf(tabla) < 0) f.id = U.uuid();
      if (!previo) {
        if (!f.creado_en) f.creado_en = ahora;
        if (!f.creado_por) f.creado_por = u.usuario_id;
        if (!f.dispositivo_id) f.dispositivo_id = dispId;
      }
      f.actualizado_en = ahora;
      f.actualizado_por = u.usuario_id;
      return f;
    },

    async guardar(tabla, fila) {
      const f = await Datos.preparar(tabla, fila);
      await Sesion.local.guardarLocal([{ tabla: tabla, fila: f }]);
      emitir('pendientes-cambiaron');
      Sync.programar();
      return f;
    },

    async guardarVarios(registros) {
      const lista = [];
      for (const r of registros) lista.push({ tabla: r.tabla, fila: await Datos.preparar(r.tabla, r.fila) });
      await Sesion.local.guardarLocal(lista);
      emitir('pendientes-cambiaron');
      Sync.programar();
      return lista.map(x => x.fila);
    },

    async anular(tabla, id, motivo) {
      if (!String(motivo || '').trim()) throw new Error('Escriba el motivo de la anulación.');
      return Datos.guardar(tabla, { id: id, estado: 'ANULADO', motivo_anulacion: String(motivo).trim(),
        anulado_por: Sesion.actual.usuario_id, anulado_en: U.ahoraISO() });
    },

    /** Número de documento: PREFIJO-SUCURSAL-DISPOSITIVO-000001 */
    async numero(tipo, sucursalId) {
      const suc = await Datos.obtener('SUCURSALES', sucursalId);
      if (!suc || !suc.codigo) throw new Error('La sucursal no tiene código (ej. SUC01).');
      const disp = (Sesion.actual.dispositivo && Sesion.actual.dispositivo.codigo) || (await DB.Sistema.get('dispositivo_codigo'));
      if (!disp) throw new Error('Este equipo aún no tiene código. Inicie sesión con internet.');
      const n = await DB.Sistema.siguienteNumero(sucursalId, tipo);
      return tipo + '-' + suc.codigo + '-' + disp + '-' + String(n).padStart(6, '0');
    },

    /** Valor de la pestaña CONFIG */
    async config(clave, porDefecto) {
      const r = await Datos.obtener('CONFIG', clave);
      return r && r.valor !== '' ? String(r.valor) : porDefecto;
    },

    /** Opciones de una lista de la pestaña LISTAS (ordenadas) */
    async lista(nombre) {
      return (await Datos.listar('LISTAS', l => l.lista === nombre && l.estado !== 'INACTIVO'))
        .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0));
    }
  };

  window.Sync = Sync;
  window.Datos = Datos;
})();
