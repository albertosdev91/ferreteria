/**
 * ============================================================
 *  SESIÓN: inicio de sesión con y sin internet
 * ============================================================
 *  - La PRIMERA vez de cada usuario en un equipo necesita internet.
 *  - Después puede entrar sin internet: la clave se comprueba con una
 *    "huella" cifrada guardada en el equipo (nunca se guarda la clave).
 *  - Si hay internet, siempre se valida con el servidor.
 * ============================================================
 */
(function () {
  'use strict';
  const S = DB.Sistema;
  const ITER = 100000;

  const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  const deHex = h => new Uint8Array((h.match(/../g) || []).map(x => parseInt(x, 16)));

  async function huella(clave, saltHex) {
    if (!window.crypto || !crypto.subtle) return null;      // solo en https
    const llave = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: deHex(saltHex), iterations: ITER }, llave, 256);
    return hex(bits);
  }
  async function crearHuella(clave) {
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const h = await huella(clave, salt);
    return h ? { salt: salt, hash: h, iter: ITER } : null;
  }

  function nombreEquipoSugerido() {
    const ua = navigator.userAgent;
    if (/Android/i.test(ua)) return 'Celular Android';
    if (/iPhone|iPad/i.test(ua)) return 'iPhone / iPad';
    if (/Windows/i.test(ua)) return 'PC Windows';
    if (/Mac/i.test(ua)) return 'Mac';
    if (/Linux/i.test(ua)) return 'PC Linux';
    return 'Equipo';
  }

  const Sesion = {
    actual: null,     // usuario activo (registro de "usuarios" del sistema)
    local: null,      // base local del usuario activo (DB.Local)

    nombreEquipoSugerido: nombreEquipoSugerido,

    /** Al abrir la app: si quedó una sesión abierta, entra directo. */
    async reanudar() {
      const id = await S.get('activo');
      const abierta = await S.get('abierta');
      if (!id || !abierta) return false;
      const u = await S.usuario(id);
      if (!u) return false;
      Sesion.actual = u;
      Sesion.local = DB.Local(u.usuario_id);
      return true;
    },

    /**
     * Inicia sesión. Con internet: servidor. Sin internet: huella local.
     * Devuelve { modo: 'servidor' | 'local' }
     */
    async iniciar(usuario, clave, nombreEquipo) {
      usuario = String(usuario || '').trim().toLowerCase();
      if (!usuario || !clave) throw Object.assign(new Error('Escriba usuario y clave.'), { codigo: 'DATOS' });
      const dispId = await S.dispositivoId();
      const previo = await S.usuarioPorNombre(usuario);

      let r = null;
      try {
        if (navigator.onLine) {
          const nombre = nombreEquipo || (await S.get('nombre_equipo')) || nombreEquipoSugerido();
          r = await Api.llamar('login', {
            usuario: usuario, clave: clave,
            dispositivo: { id: dispId, nombre: nombre, navegador: navigator.userAgent.slice(0, 190),
              sucursal_id: previo && previo.sucursal_activa ? previo.sucursal_activa : '' }
          });
          await S.set('nombre_equipo', nombre);
        }
      } catch (e) {
        if (e.codigo === 'USUARIO_INACTIVO' && previo) await S.borrarUsuario(previo.usuario_id);
        if (e.codigo !== 'SIN_RED') throw e;     // clave mala, bloqueado, etc. → no se entra
        r = null;
      }

      if (r) {
        // ---- Con internet ----
        const ses = r.sesion;
        const h = await crearHuella(clave);
        const u = Object.assign({}, previo || {}, {
          usuario_id: String(ses.usuario.id),
          usuario: usuario,
          nombre: ses.usuario.nombre,
          rol: ses.rol,
          empresa_id: ses.empresa_id || '',
          sucursales: ses.sucursales || [],
          descuento_max_pct: ses.descuento_max_pct || 0,
          dispositivo: ses.dispositivo,
          debe_cambiar_clave: !!ses.debe_cambiar_clave,
          token: r.token,
          expira_en: r.expira_en,
          huella: h || (previo && previo.huella) || null,
          sesion_vencida: false,
          ultimo_login_en: U.ahoraISO()
        });
        await S.guardarUsuario(u);
        await S.set('dispositivo_codigo', ses.dispositivo.codigo);
        await S.mezclarCorrelativos(r.correlativos);
        await Sesion.activar(u);
        return { modo: 'servidor' };
      }

      // ---- Sin internet ----
      if (!previo || !previo.huella) {
        throw Object.assign(new Error('Sin internet. La primera vez que este usuario entra en este equipo necesita internet.'),
          { codigo: 'SIN_RED' });
      }
      const h = await huella(clave, previo.huella.salt);
      if (!h || h !== previo.huella.hash) {
        throw Object.assign(new Error('Usuario o clave incorrectos.'), { codigo: 'CREDENCIALES' });
      }
      await Sesion.activar(previo);
      return { modo: 'local' };
    },

    async activar(u) {
      Sesion.actual = u;
      Sesion.local = DB.Local(u.usuario_id);
      await S.set('activo', u.usuario_id);
      await S.set('abierta', true);
    },

    /** Actualiza datos del usuario activo (y los guarda). */
    async actualizar(cambios) {
      if (!Sesion.actual) return;
      Object.assign(Sesion.actual, cambios);
      await S.guardarUsuario(Sesion.actual);
    },

    /** "Salir": bloquea la app. Puede volver a entrar sin internet. */
    async salir() {
      await S.set('abierta', false);
      Sesion.actual = null;
      Sesion.local = null;
    },

    /**
     * "Cerrar sesión en este equipo": avisa al servidor y borra los datos
     * locales de este usuario. Solo si no quedan registros sin enviar.
     */
    async cerrarDefinitivo() {
      const u = Sesion.actual;
      if (!u) return;
      const c = await Sesion.local.contarSalida();
      if (c.pendientes + c.errores > 0) {
        throw new Error('Hay ' + (c.pendientes + c.errores) + ' registros sin enviar. Sincronice primero (menú Sincronización).');
      }
      if (u.token) { try { await Api.llamar('logout', {}, u.token, { segundos: 20 }); } catch (e) { /* ya no importa */ } }
      await S.borrarUsuario(u.usuario_id);
      await DB.borrarBaseUsuario(u.usuario_id);
      await Sesion.salir();
    },

    async cambiarClave(actual, nueva) {
      const u = Sesion.actual;
      await Api.llamar('cambiarClave', { clave_actual: actual, clave_nueva: nueva }, u.token);
      await Sesion.actualizar({ huella: await crearHuella(nueva), debe_cambiar_clave: false });
    },

    /** El servidor dijo que la sesión terminó: hay que volver a entrar con internet. */
    async marcarSesionVencida() {
      await Sesion.actualizar({ token: '', sesion_vencida: true });
    },

    /** Datos frescos de la acción "sesion" (sucursales asignadas, rol, etc.). */
    async refrescarDesdeServidor(ses) {
      await Sesion.actualizar({
        nombre: ses.usuario.nombre, rol: ses.rol, empresa_id: ses.empresa_id || '',
        sucursales: ses.sucursales || [], descuento_max_pct: ses.descuento_max_pct || 0,
        dispositivo: ses.dispositivo, debe_cambiar_clave: !!ses.debe_cambiar_clave, sesion_vencida: false
      });
      if (ses.dispositivo && ses.dispositivo.codigo) await S.set('dispositivo_codigo', ses.dispositivo.codigo);
    },

    esRol(...roles) { return !!Sesion.actual && roles.indexOf(Sesion.actual.rol) >= 0; }
  };

  window.Sesion = Sesion;
})();
