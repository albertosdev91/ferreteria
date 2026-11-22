/**
 * ============================================================
 *  APP: inicio de sesión, menú por rol, pantallas base
 * ============================================================
 *  Las fases siguientes agregan pantallas así (en su propio archivo .js):
 *
 *    App.pantalla('ventas', {
 *      async render(el) { el.innerHTML = '...'; }
 *    });
 *
 *  y quitan "fase" del elemento correspondiente en MENU.
 *
 *  Fase 4: App.refrescarContexto(), App.colorValido(), App.textoSobre().
 *  ADMIN_GENERAL, ADMINISTRADOR y CONTADOR ven todas las sucursales activas
 *  de la empresa (calculado en el equipo, igual que el servidor).
 * ============================================================
 */
(function () {
  'use strict';

  const AG = 'ADMIN_GENERAL', ADM = 'ADMINISTRADOR', ALM = 'ALMACEN', VEN = 'VENDEDOR', CON = 'CONTADOR';
  const TODOS = [AG, ADM, ALM, VEN, CON];
  const NOMBRE_ROL = { ADMIN_GENERAL: 'Administrador general', ADMINISTRADOR: 'Administrador', ALMACEN: 'Almacén',
    VENDEDOR: 'Vendedor', CONTADOR: 'Contador' };

  // ---------- Menú por rol (fase = pantalla que llega en esa fase) ----------
  const MENU = [
    { grupo: 'General', items: [
      { id: 'inicio', t: 'Inicio', i: 'home', roles: TODOS },
      { id: 'alertas', t: 'Alertas', i: 'bell', roles: [AG, ADM] }
    ] },
    { grupo: 'Organización', items: [
      { id: 'empresas', t: 'Empresas', i: 'building', roles: [AG, ADM], fase: 4 },
      { id: 'sucursales', t: 'Sucursales', i: 'store', roles: [AG, ADM], fase: 4 },
      { id: 'usuarios', t: 'Usuarios', i: 'users', roles: [AG, ADM], fase: 4 },
      { id: 'dispositivos', t: 'Dispositivos', i: 'phone', roles: [AG, ADM], fase: 4 }
    ] },
    { grupo: 'Productos', items: [
      { id: 'catalogo', t: 'Catálogo general', i: 'book', roles: [AG], fase: 5 },
      { id: 'productos-sucursal', t: 'Productos de la sucursal', i: 'box', roles: [AG, ADM, ALM], fase: 5 },
      { id: 'buscar', t: 'Buscar producto y stock', i: 'search', roles: TODOS, fase: 5 }
    ] },
    { grupo: 'Almacén', items: [
      { id: 'proveedores', t: 'Proveedores', i: 'truck', roles: [AG, ADM, ALM], fase: 6 },
      { id: 'compras', t: 'Compras / ingresos', i: 'download', roles: [AG, ADM, ALM], fase: 6 },
      { id: 'cuentas-pagar', t: 'Cuentas por pagar', i: 'file', roles: [AG, ADM, ALM], fase: 6 },
      { id: 'ajustes', t: 'Ajustes de inventario', i: 'sliders', roles: [AG, ADM, ALM], fase: 6 },
      { id: 'importaciones', t: 'Importaciones masivas', i: 'upload', roles: [AG, ADM], fase: 6 }
    ] },
    { grupo: 'Ventas', items: [
      { id: 'clientes', t: 'Clientes', i: 'user', roles: [AG, ADM, VEN], fase: 7 },
      { id: 'cotizaciones', t: 'Cotizaciones', i: 'clipboard', roles: [AG, ADM, VEN], fase: 7 },
      { id: 'ventas', t: 'Ventas', i: 'cart', roles: [AG, ADM, VEN], fase: 7 },
      { id: 'caja', t: 'Caja diaria', i: 'cash', roles: [AG, ADM, VEN], fase: 7 },
      { id: 'pagos', t: 'Pagos y deudas', i: 'wallet', roles: [AG, ADM, VEN], fase: 7 }
    ] },
    { grupo: 'Logística', items: [
      { id: 'pedidos', t: 'Pedidos', i: 'list', roles: [AG, ADM, ALM, VEN], fase: 8 },
      { id: 'traspasos', t: 'Traspasos', i: 'swap', roles: [AG, ADM, ALM, VEN], fase: 8 },
      { id: 'devoluciones', t: 'Devoluciones', i: 'undo', roles: [AG, ADM, ALM, VEN], fase: 9 },
      { id: 'listas', t: 'Listas de productos', i: 'list', roles: [AG, ADM, ALM, VEN], fase: 9 }
    ] },
    { grupo: 'Reportes', items: [
      { id: 'reportes', t: 'Reportes', i: 'chart', roles: [AG, ADM, CON], fase: 10 },
      { id: 'bitacora', t: 'Bitácora de auditoría', i: 'shield', roles: [AG, ADM, CON], fase: 10 }
    ] },
    { grupo: 'Sistema', items: [
      { id: 'sincronizacion', t: 'Sincronización', i: 'sync', roles: TODOS },
      { id: 'cuenta', t: 'Mi cuenta', i: 'user', roles: TODOS }
    ] }
  ];

  // ---------- Íconos (trazos simples) ----------
  const ICONOS = {
    home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
    bell: 'M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 004 0',
    building: 'M4 21V5l8-3v19M12 8h8v13M8 8h.01M8 12h.01M8 16h.01M16 12h.01M16 16h.01M2 21h20',
    store: 'M3 9l2-5h14l2 5M3 9h18v2a3 3 0 01-6 0 3 3 0 01-6 0 3 3 0 01-6 0V9M5 13v8h14v-8M10 21v-5h4v5',
    users: 'M16 20v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 10a4 4 0 100-8 4 4 0 000 8M22 20v-2a4 4 0 00-3-3.9M16 2.1a4 4 0 010 7.8',
    phone: 'M7 2h10a1 1 0 011 1v18a1 1 0 01-1 1H7a1 1 0 01-1-1V3a1 1 0 011-1M11 18h2',
    book: 'M4 19V5a2 2 0 012-2h14v16H6a2 2 0 00-2 2 2 2 0 002 2h14',
    box: 'M21 8l-9-5-9 5v8l9 5 9-5V8M3 8l9 5 9-5M12 13v8',
    search: 'M11 18a7 7 0 100-14 7 7 0 000 14M21 21l-5-5',
    truck: 'M1 4h14v12H1zM15 9h4l3 3v4h-7M5.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3M18.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3',
    download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
    upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
    file: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h8M8 17h5',
    sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
    user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8',
    clipboard: 'M9 3h6v3H9zM9 4H6a1 1 0 00-1 1v15a1 1 0 001 1h12a1 1 0 001-1V5a1 1 0 00-1-1h-3M8 12h8M8 16h6',
    cart: 'M3 3h2l2 12h11l2-8H6M9 20a1 1 0 100-2 1 1 0 000 2M18 20a1 1 0 100-2 1 1 0 000 2',
    cash: 'M2 6h20v12H2zM12 15a3 3 0 100-6 3 3 0 000 6M6 12h.01M18 12h.01',
    wallet: 'M3 7h18v12H3zM3 7l3-4h12l3 4M16 13h2',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    swap: 'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
    undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3',
    chart: 'M3 3v18h18M7 15v-4M12 15V7M17 15v-6',
    shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10',
    sync: 'M21 12a9 9 0 01-15.5 6.2L3 16M3 12a9 9 0 0115.5-6.2L21 8M21 3v5h-5M3 21v-5h5',
    menu: 'M3 6h18M3 12h18M3 18h18',
    logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
    lock: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4',
    check: 'M20 6L9 17l-5-5',
    alert: 'M12 3l10 18H2L12 3M12 10v4M12 18h.01',
    eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12M12 15a3 3 0 100-6 3 3 0 000 6',
    x: 'M18 6L6 18M6 6l12 12',
    chevron: 'M6 9l6 6 6-6',
    wifi: 'M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M2 9a15 15 0 0120 0M12 20h.01',
    wifioff: 'M2 2l20 20M8.5 16a5 5 0 017 0M5 12.5a10 10 0 015-2.6M19 12.5a10 10 0 00-2.4-1.7M2 9a15 15 0 014.2-2.8M22 9a15 15 0 00-11-4M12 20h.01',
    install: 'M12 3v12M7 10l5 5 5-5M5 21h14'
  };
  const ico = (n, extra) => '<svg class="ico ' + (extra || '') + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + (ICONOS[n] || '') + '"/></svg>';

  const $ = (s, el) => (el || document).querySelector(s);
  const esc = U.esc;
  const raiz = () => document.getElementById('app');

  // ============================================================
  //  UTILIDADES DE INTERFAZ
  // ============================================================
  function aviso(texto, tipo, segundos) {
    let cont = $('.avisos');
    if (!cont) { cont = document.createElement('div'); cont.className = 'avisos'; document.body.appendChild(cont); }
    const a = document.createElement('div');
    a.className = 'aviso ' + (tipo || 'info');
    a.innerHTML = '<span>' + esc(texto) + '</span>';
    cont.appendChild(a);
    setTimeout(() => a.remove(), (segundos || 4) * 1000);
  }

  /** Ventana modal. botones: [{ t, clase, accion(modalEl) → false para no cerrar }] */
  function modal(op) {
    const f = document.createElement('div');
    f.className = 'modal-fondo';
    f.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><header><h2>' + esc(op.titulo || '') + '</h2>' +
      (op.cerrable === false ? '' : '<button class="btn btn-icono" data-cerrar aria-label="Cerrar">' + ico('x') + '</button>') +
      '</header><div class="cuerpo">' + (op.html || '') + '</div><footer></footer></div>';
    const pie = $('footer', f);
    const cerrar = () => f.remove();
    (op.botones || [{ t: 'Aceptar', clase: 'btn-principal' }]).forEach(b => {
      const el = document.createElement('button');
      el.className = 'btn ' + (b.clase || 'btn-borde');
      el.textContent = b.t;
      el.onclick = async () => {
        el.disabled = true;
        try { if (!b.accion || (await b.accion(f)) !== false) cerrar(); } finally { el.disabled = false; }
      };
      pie.appendChild(el);
    });
    if (op.cerrable !== false) {
      $('[data-cerrar]', f).onclick = cerrar;
      f.addEventListener('click', e => { if (e.target === f) cerrar(); });
    }
    document.body.appendChild(f);
    const primero = $('input, select', f);
    if (primero) setTimeout(() => primero.focus(), 50);
    return f;
  }

  function confirmar(titulo, texto, botonSi, clase) {
    return new Promise(ok => {
      modal({ titulo: titulo, html: '<p style="margin:0;line-height:1.5">' + esc(texto) + '</p>', botones: [
        { t: 'Cancelar', accion: () => ok(false) },
        { t: botonSi || 'Sí', clase: clase || 'btn-principal', accion: () => ok(true) }
      ] });
    });
  }

  function cargando(texto) {
    let c = $('.cargando');
    if (!texto) { if (c) c.remove(); return; }
    if (!c) { c = document.createElement('div'); c.className = 'cargando'; document.body.appendChild(c); }
    c.innerHTML = '<div class="giro"></div><p>' + esc(texto) + '</p>';
  }

  /** Logo: acepta enlaces normales y de Google Drive. */
  function urlImagen(u) {
    u = String(u || '').trim();
    const m = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/.exec(u);
    return m ? 'https://lh3.googleusercontent.com/d/' + m[1] : u;
  }
  function colorValido(c) { return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(c || '').trim()) ? String(c).trim() : ''; }
  function textoSobre(hexColor) {
    let h = hexColor.replace('#', '');
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#0f132e' : '#ffffff';
  }

  // ============================================================
  //  PANTALLAS
  // ============================================================
  const pantallas = {};
  let instalar = null;     // evento para instalar la app

  const App = {
    MENU: MENU, ROLES: { AG, ADM, ALM, VEN, CON }, NOMBRE_ROL: NOMBRE_ROL,
    ico: ico, aviso: aviso, modal: modal, confirmar: confirmar, cargando: cargando, urlImagen: urlImagen,
    colorValido: colorValido, textoSobre: textoSobre,
    contexto: { empresa: null, sucursal: null, empresas: [], sucursales: [] },

    pantalla(id, def) { pantallas[id] = def; },
    ir(id) { location.hash = '#/' + id; },
    actual() { return (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'inicio'; },
    itemMenu(id) { for (const g of MENU) for (const it of g.items) if (it.id === id) return it; return null; },
    puede(id) { const it = App.itemMenu(id); return !it || it.roles.indexOf(Sesion.actual.rol) >= 0; },

    /** Después de cambiar empresas/sucursales: recarga empresa y sucursal activas, la barra y la pantalla. */
    async refrescarContexto() {
      if (!Sesion.actual || !$('#contenido')) return;
      await cargarContexto();
      pintarEstructura();
      await mostrarPantalla();
    }
  };

  // ============================================================
  //  INICIO DE LA APP
  // ============================================================
  async function arrancar() {
    registrarServiceWorker();
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); instalar = e; });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    try {
      await DB.Sistema.dispositivoId();
      if (await Sesion.reanudar()) return entrar(false);
    } catch (e) {
      console.error(e);
    }
    mostrarLogin();
  }

  // ============================================================
  //  PANTALLA: INICIO DE SESIÓN
  // ============================================================
  async function mostrarLogin(mensaje, usuarioSugerido) {
    document.body.classList.remove('menu-abierto');
    const usuarios = await DB.Sistema.usuarios();
    const nombreEquipo = await DB.Sistema.get('nombre_equipo');
    const sinUrl = !Api.url();
    raiz().innerHTML =
      '<div class="login"><div class="login-caja">' +
      '<div class="login-marca"><img src="icons/icon-192.png" alt=""><div><h1>' + esc(window.CONFIG.NOMBRE_APP) + '</h1>' +
      '<p>Sistema de inventario</p></div></div>' +
      '<form class="login-tarjeta" id="fLogin" autocomplete="on">' +
      '<h2>Iniciar sesión</h2>' +
      (mensaje ? '<div class="msg msg-aviso">' + esc(mensaje) + '</div>' : '') +
      '<div id="lMsg"></div>' +
      (sinUrl ? '<div class="campo"><label for="lUrl">Dirección del servidor (URL /exec)</label>' +
        '<input class="entrada" id="lUrl" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off">' +
        '<span class="ayuda">Se pide una sola vez en este equipo. Mejor aún: péguela en js/config.js.</span></div>' : '') +
      '<div class="campo"><label for="lUsuario">Usuario</label>' +
      '<input class="entrada" id="lUsuario" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>' +
      (usuarios.length ? '<div class="chips">' + usuarios.map(u => '<button type="button" class="chip" data-u="' + esc(u.usuario) + '">' +
        esc(u.nombre || u.usuario) + '</button>').join('') + '</div>' : '') +
      '<div class="campo"><label for="lClave">Clave</label><div class="con-boton">' +
      '<input class="entrada" id="lClave" type="password" name="password" autocomplete="current-password" required>' +
      '<button type="button" class="btn btn-icono" id="lVer" aria-label="Mostrar clave">' + ico('eye') + '</button></div></div>' +
      (!nombreEquipo ? '<div class="campo"><label for="lEquipo">Nombre de este equipo</label>' +
        '<input class="entrada" id="lEquipo" value="' + esc(Sesion.nombreEquipoSugerido()) + '">' +
        '<span class="ayuda">Ej.: "Caja 1 - Sucursal Centro". Lo verá el administrador.</span></div>' : '') +
      '<button class="btn btn-principal btn-bloque" id="lEntrar" type="submit">Entrar</button>' +
      '</form>' +
      '<div class="login-red" id="lRed"></div>' +
      '<div class="login-pie"><span>Versión ' + esc(window.CONFIG.VERSION_APP) + '</span>' +
      '<a id="lServidor">Configurar servidor</a></div>' +
      '</div></div>';

    const red = () => {
      $('#lRed').innerHTML = navigator.onLine
        ? ico('wifi') + '<span>Con internet</span>'
        : ico('wifioff') + '<span>Sin internet: solo entran usuarios que ya usaron este equipo.</span>';
    };
    red();
    window.addEventListener('online', red);
    window.addEventListener('offline', red);

    const iUsuario = $('#lUsuario');
    iUsuario.value = usuarioSugerido || '';
    (usuarioSugerido ? $('#lClave') : iUsuario).focus();
    document.querySelectorAll('.chip').forEach(c => { c.onclick = () => { iUsuario.value = c.dataset.u; $('#lClave').focus(); }; });
    $('#lVer').onclick = () => { const c = $('#lClave'); c.type = c.type === 'password' ? 'text' : 'password'; };
    $('#lServidor').onclick = configurarServidor;

    $('#fLogin').onsubmit = async ev => {
      ev.preventDefault();
      const msg = $('#lMsg');
      msg.innerHTML = '';
      const btn = $('#lEntrar');
      if ($('#lUrl')) {
        const u = $('#lUrl').value.trim();
        if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(u)) {
          msg.innerHTML = '<div class="msg msg-error">La dirección debe empezar con https://script.google.com/ y terminar en /exec</div>';
          return;
        }
        localStorage.setItem('ferreteria_api_url', u);
      }
      btn.disabled = true;
      btn.textContent = 'Entrando…';
      try {
        const equipo = $('#lEquipo') ? $('#lEquipo').value.trim() : '';
        const r = await Sesion.iniciar(iUsuario.value, $('#lClave').value, equipo);
        window.removeEventListener('online', red);
        window.removeEventListener('offline', red);
        if (r.modo === 'local') aviso('Entró sin internet. Lo que registre se enviará al volver la conexión.', 'info', 6);
        if (location.hash) history.replaceState(null, '', location.pathname);
        await entrar(r.modo === 'servidor');
      } catch (e) {
        msg.innerHTML = '<div class="msg msg-error">' + esc(e.message) + '</div>';
        btn.disabled = false;
        btn.textContent = 'Entrar';
      }
    };
  }

  function configurarServidor() {
    const actual = Api.url();
    modal({
      titulo: 'Dirección del servidor',
      html: '<div class="campo"><label for="mUrl">URL de la API (termina en /exec)</label>' +
        '<input class="entrada" id="mUrl" value="' + esc(actual) + '" placeholder="https://script.google.com/macros/s/…/exec"></div>' +
        (window.CONFIG.API_URL ? '<div class="msg msg-info">Este valor viene de js/config.js. Lo que escriba aquí solo vale en este equipo si borra la URL de config.js.</div>' : '') +
        '<div id="mRes"></div>',
      botones: [
        { t: 'Probar', accion: async f => {
          const u = $('#mUrl', f).value.trim();
          const res = $('#mRes', f);
          res.innerHTML = '<div class="msg msg-info">Probando…</div>';
          try {
            const r = await Api.probar(u);
            res.innerHTML = '<div class="msg msg-ok">✔ Responde. API versión ' + esc(r.version) + '</div>';
          } catch (e) {
            res.innerHTML = '<div class="msg msg-error">✘ No responde. Revise la URL, el internet y que la implementación tenga acceso "Cualquier persona".</div>';
          }
          return false;
        } },
        { t: 'Guardar', clase: 'btn-principal', accion: f => {
          const u = $('#mUrl', f).value.trim();
          if (u && !/^https:\/\/script\.google\.com\/.+\/exec$/.test(u)) { aviso('La URL debe terminar en /exec', 'error'); return false; }
          if (u) localStorage.setItem('ferreteria_api_url', u); else localStorage.removeItem('ferreteria_api_url');
          aviso('Guardado', 'ok');
          if (!Sesion.actual) mostrarLogin();
        } }
      ]
    });
  }

  // ============================================================
  //  ENTRAR A LA APP (después de iniciar sesión)
  // ============================================================
  async function entrar(conServidor) {
    const u = Sesion.actual;
    // 1) Clave temporal → obligar a cambiarla
    if (conServidor && u.debe_cambiar_clave) await pedirCambioClave(true);

    // 2) Primera vez en este equipo: descargar los datos
    const yaBajo = await Sesion.local.meta('servidor_en');
    if (!yaBajo && navigator.onLine && u.token) {
      cargando('Preparando este equipo… descargando datos por primera vez. Puede tardar un poco.');
      const r = await Sync.ejecutar({ completo: true });
      cargando(null);
      if (!r) aviso('No se pudo descargar todo. Se reintentará: ' + Sync.estado.mensaje, 'error', 7);
    }

    await cargarContexto();
    pintarEstructura();
    Sync.iniciarAutomatica();
    if (yaBajo) Sync.programar(1);
    mostrarPantalla();
  }

  function pedirCambioClave(obligatorio) {
    return new Promise(ok => {
      modal({
        titulo: obligatorio ? 'Cambie su clave' : 'Cambiar clave',
        cerrable: !obligatorio,
        html: (obligatorio ? '<div class="msg msg-aviso">Su clave es temporal. Escriba una nueva para continuar.</div>' : '') +
          '<div class="campo"><label for="cActual">Clave actual</label><input class="entrada" type="password" id="cActual" autocomplete="current-password"></div>' +
          '<div class="campo"><label for="cNueva">Clave nueva</label><input class="entrada" type="password" id="cNueva" autocomplete="new-password">' +
          '<span class="ayuda">Mínimo 6 caracteres.</span></div>' +
          '<div class="campo"><label for="cRep">Repita la clave nueva</label><input class="entrada" type="password" id="cRep" autocomplete="new-password"></div>' +
          '<div id="cMsg"></div>',
        botones: (obligatorio ? [] : [{ t: 'Cancelar', accion: () => ok(false) }]).concat([{
          t: 'Guardar clave', clase: 'btn-principal', accion: async f => {
            const m = $('#cMsg', f);
            const a = $('#cActual', f).value, n = $('#cNueva', f).value, r = $('#cRep', f).value;
            if (n.length < 6) { m.innerHTML = '<div class="msg msg-error">La clave nueva debe tener al menos 6 caracteres.</div>'; return false; }
            if (n !== r) { m.innerHTML = '<div class="msg msg-error">Las claves nuevas no coinciden.</div>'; return false; }
            if (!navigator.onLine) { m.innerHTML = '<div class="msg msg-error">Necesita internet para cambiar la clave.</div>'; return false; }
            try {
              await Sesion.cambiarClave(a, n);
              aviso('Clave cambiada', 'ok');
              ok(true);
            } catch (e) {
              m.innerHTML = '<div class="msg msg-error">' + esc(e.message) + '</div>';
              return false;
            }
          }
        }])
      });
    });
  }

  // ============================================================
  //  EMPRESA Y SUCURSAL ACTIVAS
  // ============================================================
  /**
   * Sucursales activas de una empresa en las que el usuario puede trabajar.
   * ADMIN_GENERAL, ADMINISTRADOR y CONTADOR: todas las de la empresa (igual que el servidor),
   * así una sucursal recién creada aparece al momento. ALMACEN y VENDEDOR: solo las asignadas.
   */
  async function sucursalesVisibles(empresaId) {
    const u = Sesion.actual;
    const todas = [AG, ADM, CON].indexOf(u.rol) >= 0;
    return (await Datos.listar('SUCURSALES', s => s.estado !== 'INACTIVO' && String(s.empresa_id) === String(empresaId) &&
      (todas || (u.sucursales || []).indexOf(String(s.id)) >= 0)))
      .sort((a, b) => (b.es_central === 'SI') - (a.es_central === 'SI') || String(a.nombre).localeCompare(String(b.nombre)));
  }

  async function cargarContexto() {
    const u = Sesion.actual;
    const empresas = (await Datos.listar('EMPRESAS', e => e.estado !== 'INACTIVO'))
      .filter(e => u.rol === AG || String(e.id) === String(u.empresa_id))
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
    let empresaId = u.rol === AG ? (u.empresa_activa || (empresas[0] && empresas[0].id) || '') : u.empresa_id;
    if (u.rol === AG && empresaId && !empresas.some(e => e.id === empresaId)) empresaId = empresas[0] ? empresas[0].id : '';
    const sucursales = await sucursalesVisibles(empresaId);
    let sucId = u.sucursal_activa;
    if (!sucursales.some(s => s.id === sucId)) sucId = sucursales[0] ? sucursales[0].id : '';
    if (sucId !== u.sucursal_activa || (u.rol === AG && empresaId !== u.empresa_activa)) {
      await Sesion.actualizar({ sucursal_activa: sucId, empresa_activa: u.rol === AG ? empresaId : u.empresa_activa });
    }
    App.contexto = {
      empresas: empresas, sucursales: sucursales,
      empresa: empresas.find(e => e.id === empresaId) || null,
      sucursal: sucursales.find(s => s.id === sucId) || null
    };
    aplicarColoresEmpresa();
  }

  function aplicarColoresEmpresa() {
    const e = App.contexto.empresa;
    const c = e && colorValido(e.color_principal);
    document.documentElement.style.setProperty('--barra', c || '#0f132e');
    document.documentElement.style.setProperty('--barra-texto', c ? textoSobre(c) : '#ffffff');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', c || '#0f132e');
  }

  function elegirContexto() {
    const u = Sesion.actual;
    const ctx = App.contexto;
    const pintarSuc = (lista, sel) => lista.length
      ? lista.map(s => '<option value="' + esc(s.id) + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.nombre) +
        (s.es_central === 'SI' ? ' (Central)' : '') + '</option>').join('')
      : '<option value="">— Sin sucursales —</option>';
    const f = modal({
      titulo: 'Dónde está trabajando',
      html: (u.rol === AG ? '<div class="campo"><label for="xEmp">Empresa</label><select class="entrada" id="xEmp">' +
          (ctx.empresas.length ? ctx.empresas.map(e => '<option value="' + esc(e.id) + '"' + (ctx.empresa && e.id === ctx.empresa.id ? ' selected' : '') +
            '>' + esc(e.nombre) + '</option>').join('') : '<option value="">— No hay empresas —</option>') + '</select></div>' : '') +
        '<div class="campo"><label for="xSuc">Sucursal</label><select class="entrada" id="xSuc">' +
        pintarSuc(ctx.sucursales, ctx.sucursal && ctx.sucursal.id) + '</select></div>',
      botones: [{ t: 'Cancelar' }, { t: 'Cambiar', clase: 'btn-principal', accion: async m => {
        const emp = u.rol === AG ? $('#xEmp', m).value : u.empresa_id;
        await Sesion.actualizar({ empresa_activa: u.rol === AG ? emp : u.empresa_activa, sucursal_activa: $('#xSuc', m).value });
        await cargarContexto();
        pintarEstructura();
        mostrarPantalla();
      } }]
    });
    const sEmp = $('#xEmp', f);
    if (sEmp) sEmp.onchange = async () => { $('#xSuc', f).innerHTML = pintarSuc(await sucursalesVisibles(sEmp.value), ''); };
  }

  // ============================================================
  //  ESTRUCTURA: barra superior + menú lateral
  // ============================================================
  function pintarEstructura() {
    const u = Sesion.actual;
    const ctx = App.contexto;
    const e = ctx.empresa;
    const logo = e && e.logo_url ? urlImagen(e.logo_url) : 'icons/icon-192.png';
    const iniciales = String(u.nombre || u.usuario).split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase();

    let menu = '<div class="usuario"><div class="avatar">' + esc(iniciales) + '</div><div><b>' + esc(u.nombre) + '</b><small>' +
      esc(NOMBRE_ROL[u.rol] || u.rol) + '</small></div></div>';
    MENU.forEach(g => {
      const items = g.items.filter(it => it.roles.indexOf(u.rol) >= 0);
      if (!items.length) return;
      menu += '<div class="grupo">' + esc(g.grupo) + '</div>';
      items.forEach(it => {
        const listo = !it.fase || pantallas[it.id];
        menu += '<a href="#/' + it.id + '" data-id="' + it.id + '">' + ico(it.i) + '<span>' + esc(it.t) + '</span>' +
          (listo ? '' : '<span class="fase">Fase ' + it.fase + '</span>') + '</a>';
      });
    });

    raiz().innerHTML =
      '<header class="barra">' +
      '<button class="btn btn-icono solo-movil" id="bMenu" aria-label="Menú">' + ico('menu') + '</button>' +
      '<div class="empresa"><img src="' + esc(logo) + '" alt="" onerror="this.src=\'icons/icon-192.png\'"><div style="min-width:0">' +
      '<b>' + esc(e ? e.nombre : window.CONFIG.NOMBRE_APP) + '</b><small>' + esc(e && e.slogan ? e.slogan : (NOMBRE_ROL[u.rol] || '')) + '</small></div></div>' +
      '<button class="contexto-btn" id="bCtx" title="Cambiar sucursal">' + ico('store') + '<span>' +
      esc(ctx.sucursal ? ctx.sucursal.nombre : 'Sin sucursal') + '</span>' + ico('chevron') + '</button>' +
      '<button class="pildora" id="bSync" title="Sincronización"><span class="punto" id="sPunto"></span><span class="txt" id="sTxt"></span></button>' +
      '</header>' +
      '<nav class="menu" id="menu">' + menu + '</nav>' +
      '<div class="velo" id="velo"></div>' +
      '<main class="principal"><div id="avisoSup" class="aviso-superior"></div><div id="contenido"></div></main>';

    $('#bMenu').onclick = () => document.body.classList.toggle('menu-abierto');
    $('#velo').onclick = () => document.body.classList.remove('menu-abierto');
    $('#menu').addEventListener('click', e2 => { if (e2.target.closest('a')) document.body.classList.remove('menu-abierto'); });
    $('#bCtx').onclick = elegirContexto;
    $('#bSync').onclick = () => App.ir('sincronizacion');
    pintarIndicador();
    pintarAvisoSuperior();
  }

  async function pintarIndicador() {
    const p = $('#sPunto'), t = $('#sTxt');
    if (!p || !Sesion.local) return;
    const e = Sync.estado.estado;
    const c = await Sesion.local.contarSalida();
    let clase = 'ok', txt = 'Al día';
    if (!navigator.onLine) { clase = 'off'; txt = 'Sin internet'; }
    else if (e === 'sincronizando') { clase = 'sync'; txt = 'Sincronizando'; }
    else if (['error', 'requiere_login', 'bloqueado', 'con_errores'].indexOf(e) >= 0) { clase = 'mal'; txt = 'Revisar'; }
    if (c.pendientes && clase !== 'sync') txt += ' · ' + c.pendientes + ' por enviar';
    if (c.errores) { clase = 'mal'; txt = c.errores + ' con error'; }
    p.className = 'punto ' + clase;
    t.textContent = txt;
  }

  function pintarAvisoSuperior() {
    const el = $('#avisoSup');
    if (!el || !Sesion.actual) return;
    const u = Sesion.actual;
    if (!u.token || u.sesion_vencida) {
      el.innerHTML = '<div class="msg msg-aviso" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' + ico('alert') +
        '<span style="flex:1">Su sesión en el servidor terminó. Puede seguir trabajando; para enviar los datos vuelva a iniciar sesión con internet.</span>' +
        '<button class="btn btn-chico btn-azul" id="bRelogin">Iniciar sesión</button></div>';
      $('#bRelogin').onclick = async () => { const nom = u.usuario; await Sesion.salir(); mostrarLogin('Vuelva a iniciar sesión con internet.', nom); };
    } else {
      el.innerHTML = '';
    }
  }

  // ============================================================
  //  NAVEGACIÓN
  // ============================================================
  async function mostrarPantalla() {
    if (!Sesion.actual || !$('#contenido')) return;
    const id = App.actual();
    document.querySelectorAll('.menu a').forEach(a => a.classList.toggle('activo', a.dataset.id === id));
    const el = $('#contenido');
    const it = App.itemMenu(id);
    if (!App.puede(id)) {
      el.innerHTML = '<div class="tarjeta vacio">' + ico('lock') + '<p>Su rol no tiene acceso a esta sección.</p></div>';
      return;
    }
    const def = pantallas[id];
    if (!def) {
      el.innerHTML = '<div class="titulo"><div><h1>' + esc(it ? it.t : 'Página no encontrada') + '</h1></div></div>' +
        '<div class="tarjeta vacio">' + ico(it ? it.i : 'alert', '') +
        '<p><b>Próximamente.</b><br>Esta sección se construye en la ' + (it && it.fase ? 'Fase ' + it.fase : 'próxima fase') + '.</p></div>';
      return;
    }
    try {
      el.innerHTML = '';
      await def.render(el);
    } catch (e) {
      console.error(e);
      el.innerHTML = '<div class="msg msg-error">Error al mostrar la pantalla: ' + esc(e.message) + '</div>';
    }
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', mostrarPantalla);
  window.addEventListener('sync-estado', () => { pintarIndicador(); pintarAvisoSuperior(); });
  window.addEventListener('pendientes-cambiaron', pintarIndicador);
  window.addEventListener('red', pintarIndicador);
  window.addEventListener('datos-actualizados', async () => {
    if (!Sesion.actual || !$('#contenido')) return;
    const antes = JSON.stringify([App.contexto.empresa && App.contexto.empresa.id, App.contexto.sucursal && App.contexto.sucursal.id,
      App.contexto.sucursales.length, App.contexto.empresa && App.contexto.empresa.color_principal, App.contexto.empresa && App.contexto.empresa.logo_url,
      App.contexto.empresa && App.contexto.empresa.nombre]);
    await cargarContexto();
    const despues = JSON.stringify([App.contexto.empresa && App.contexto.empresa.id, App.contexto.sucursal && App.contexto.sucursal.id,
      App.contexto.sucursales.length, App.contexto.empresa && App.contexto.empresa.color_principal, App.contexto.empresa && App.contexto.empresa.logo_url,
      App.contexto.empresa && App.contexto.empresa.nombre]);
    if (antes !== despues) pintarEstructura();
    const def = pantallas[App.actual()];
    if (antes !== despues || (def && def.refrescar)) mostrarPantalla();
  });
  window.addEventListener('bloqueado', async e => {
    await Sesion.salir();
    mostrarLogin(e.detail.mensaje);
  });

  // ============================================================
  //  PANTALLA: INICIO
  // ============================================================
  App.pantalla('inicio', {
    refrescar: true,
    async render(el) {
      const u = Sesion.actual;
      const ctx = App.contexto;
      const L = Sesion.local;
      const c = await L.contarSalida();
      const ultimo = await L.meta('ultimo_sync_en');
      const hora = new Date().getHours();
      const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';

      let alertas = [];
      if (u.rol === AG || u.rol === ADM) {
        alertas = await Datos.listar('ALERTAS', a => a.estado === 'PENDIENTE' && (!ctx.empresa || !a.empresa_id || a.empresa_id === ctx.empresa.id));
      }
      const accesos = [];
      MENU.forEach(g => g.items.forEach(it => {
        if (['inicio', 'cuenta', 'sincronizacion'].indexOf(it.id) < 0 && it.roles.indexOf(u.rol) >= 0) accesos.push(it);
      }));

      let sinSucursal = '';
      if (!ctx.sucursal) {
        if (u.rol === AG && !ctx.empresas.length) {
          sinSucursal = 'Todavía no hay empresas. <a href="#/empresas"><b>Cree la primera empresa aquí</b></a> (se crea junto con su sucursal central).';
        } else if (u.rol === AG || u.rol === ADM) {
          sinSucursal = 'Esta empresa no tiene sucursales activas. <a href="#/sucursales"><b>Créelas en Sucursales</b></a>.';
        } else {
          sinSucursal = 'No tiene una sucursal asignada en esta empresa. Pida al administrador que le asigne una.';
        }
      }

      el.innerHTML =
        '<div class="titulo"><div><h1>' + saludo + ', ' + esc(String(u.nombre || '').split(' ')[0]) + '</h1>' +
        '<p>' + esc(NOMBRE_ROL[u.rol]) + (ctx.empresa ? ' · ' + esc(ctx.empresa.nombre) : '') + '</p></div>' +
        (instalar ? '<button class="btn btn-principal" id="bInstalar">' + ico('install') + 'Instalar app</button>' : '') + '</div>' +
        (sinSucursal ? '<div class="msg msg-aviso">' + sinSucursal + '</div>' : '') +
        '<div class="rejilla bloque">' +
        '<div class="tarjeta"><h3>' + ico('store') + 'Trabajando en</h3>' +
        '<div class="dato"><span>Empresa</span><b>' + esc(ctx.empresa ? ctx.empresa.nombre : '—') + '</b></div>' +
        '<div class="dato"><span>Sucursal</span><b>' + esc(ctx.sucursal ? ctx.sucursal.nombre : '—') +
        (ctx.sucursal && ctx.sucursal.es_central === 'SI' ? ' <span class="etiqueta naranja">Central</span>' : '') + '</b></div>' +
        '<div class="dato"><span>Sucursales disponibles</span><b>' + ctx.sucursales.length + '</b></div>' +
        '<button class="btn btn-borde btn-chico" id="bCambiarCtx" style="margin-top:10px">Cambiar</button></div>' +
        '<div class="tarjeta"><h3>' + ico('sync') + 'Sincronización</h3>' +
        '<div class="dato"><span>Conexión</span><b>' + (navigator.onLine ? '<span class="etiqueta verde">Con internet</span>' : '<span class="etiqueta">Sin internet</span>') + '</b></div>' +
        '<div class="dato"><span>Por enviar</span><b>' + c.pendientes + (c.errores ? ' · <span class="etiqueta roja">' + c.errores + ' con error</span>' : '') + '</b></div>' +
        '<div class="dato"><span>Última vez</span><b>' + esc(U.fechaCorta(ultimo)) + '</b></div>' +
        '<button class="btn btn-principal btn-chico" id="bSyncAhora" style="margin-top:10px">' + ico('sync') + 'Sincronizar ahora</button></div>' +
        ((u.rol === AG || u.rol === ADM) ? '<div class="tarjeta"><h3>' + ico('bell') + 'Alertas pendientes</h3>' +
          '<div class="cifra">' + alertas.length + '</div>' +
          alertas.slice(0, 3).map(a => '<div class="dato"><span>' + esc(a.mensaje) + '</span></div>').join('') +
          '<a class="btn btn-borde btn-chico" href="#/alertas" style="margin-top:10px">Ver alertas</a></div>' : '') +
        '</div>' +
        '<h3 style="color:var(--azul);margin:20px 0 10px">Accesos</h3>' +
        '<div class="accesos">' + accesos.map(it => {
          const listo = !it.fase || pantallas[it.id];
          return '<a class="acceso" href="#/' + it.id + '">' + ico(it.i) + '<span>' + esc(it.t) + '</span>' +
            (listo ? '' : '<small>Fase ' + it.fase + '</small>') + '</a>';
        }).join('') + '</div>';

      $('#bCambiarCtx', el).onclick = elegirContexto;
      $('#bSyncAhora', el).onclick = async ev => {
        ev.target.disabled = true;
        const r = await Sync.ejecutar();
        aviso(r ? Sync.estado.mensaje : (Sync.estado.mensaje || 'No se pudo sincronizar'), r ? 'ok' : 'error');
        mostrarPantalla();
      };
      const bi = $('#bInstalar', el);
      if (bi) bi.onclick = instalarApp;
    }
  });

  async function instalarApp() {
    if (!instalar) {
      modal({ titulo: 'Instalar la app', html: '<p style="line-height:1.5;margin:0">En el celular: menú del navegador (⋮) → <b>Instalar aplicación</b> ' +
        'o <b>Agregar a pantalla de inicio</b>.<br><br>En la PC (Chrome o Edge): ícono de instalar en la barra de direcciones.</p>' });
      return;
    }
    instalar.prompt();
    await instalar.userChoice;
    instalar = null;
    mostrarPantalla();
  }

  // ============================================================
  //  PANTALLA: SINCRONIZACIÓN
  // ============================================================
  const NOMBRE_TABLA = t => t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ');

  App.pantalla('sincronizacion', {
    refrescar: true,
    async render(el) {
      const L = Sesion.local;
      const u = Sesion.actual;
      const salida = await L.salida();
      const errores = salida.filter(x => x.estado !== 'PENDIENTE');
      const pendientes = salida.filter(x => x.estado === 'PENDIENTE');
      const ultimo = await L.meta('ultimo_sync_en');
      const res = await L.meta('ultimo_resultado');
      const dispId = await DB.Sistema.dispositivoId();
      const equipo = await DB.Sistema.get('nombre_equipo');
      let espacio = '';
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        espacio = (est.usage / 1048576).toFixed(1) + ' MB usados';
      }
      const porTabla = {};
      pendientes.forEach(p => { porTabla[p.tabla] = (porTabla[p.tabla] || 0) + 1; });
      const desc = f => esc(f.numero || f.nombre || f.razon_social || f.codigo || f.mensaje || f.id || '');
      const est = Sync.estado;
      const claseMsg = { ok: 'msg-ok', error: 'msg-error', con_errores: 'msg-error', requiere_login: 'msg-aviso', bloqueado: 'msg-error',
        sin_red: 'msg-aviso', sincronizando: 'msg-info' }[est.estado] || 'msg-info';

      el.innerHTML =
        '<div class="titulo"><div><h1>Sincronización</h1><p>Todo se guarda primero en este equipo y se envía cuando hay internet.</p></div>' +
        '<button class="btn btn-principal" id="bSync">' + ico('sync') + 'Sincronizar ahora</button></div>' +
        (est.mensaje ? '<div class="msg ' + claseMsg + '">' + esc(est.mensaje) + '</div>' : '') +
        '<div class="rejilla bloque">' +
        '<div class="tarjeta"><h3>' + ico('sync') + 'Estado</h3>' +
        '<div class="dato"><span>Conexión</span><b>' + (navigator.onLine ? 'Con internet' : 'Sin internet') + '</b></div>' +
        '<div class="dato"><span>Última sincronización</span><b>' + esc(U.fechaCorta(ultimo)) + '</b></div>' +
        (res ? '<div class="dato"><span>Último resultado</span><b>enviados ' + res.subidos + ' · recibidos ' + res.bajados +
          (res.conflictos ? ' · conflictos ' + res.conflictos : '') + '</b></div>' : '') +
        '<div class="dato"><span>Por enviar</span><b>' + pendientes.length + '</b></div>' +
        '<div class="dato"><span>Con error</span><b>' + errores.length + '</b></div></div>' +
        '<div class="tarjeta"><h3>' + ico('phone') + 'Este equipo</h3>' +
        '<div class="dato"><span>Nombre</span><b>' + esc(equipo || '—') + '</b></div>' +
        '<div class="dato"><span>Código</span><b>' + esc((u.dispositivo && u.dispositivo.codigo) || '—') + '</b></div>' +
        '<div class="dato"><span>Identificador</span><b style="font-size:12px">' + esc(dispId) + '</b></div>' +
        (espacio ? '<div class="dato"><span>Espacio</span><b>' + esc(espacio) + '</b></div>' : '') +
        '<div class="dato"><span>Versión</span><b>' + esc(window.CONFIG.VERSION_APP) + '</b></div></div>' +
        '</div>' +

        (errores.length ? '<div class="tarjeta bloque"><h3>' + ico('alert') + 'Registros con error (' + errores.length + ')</h3>' +
          '<p style="margin:0 0 10px;color:var(--suave);font-size:14px">El servidor no los aceptó. Lea el motivo: puede reintentar (si ya se corrigió) o descartar (se pierde ese cambio).</p>' +
          '<div class="tabla-env"><table class="tabla"><thead><tr><th>Tipo</th><th>Registro</th><th>Motivo</th><th></th></tr></thead><tbody>' +
          errores.map(x => '<tr><td>' + esc(NOMBRE_TABLA(x.tabla)) + '</td><td>' + desc(x.fila) + '</td><td style="color:var(--rojo)">' + esc(x.error) + '</td>' +
            '<td style="white-space:nowrap"><button class="btn btn-chico btn-borde" data-re="' + esc(x.tabla) + '|' + esc(x.clave) + '">Reintentar</button> ' +
            '<button class="btn btn-chico btn-peligro" data-de="' + esc(x.tabla) + '|' + esc(x.clave) + '">Descartar</button></td></tr>').join('') +
          '</tbody></table></div>' +
          '<button class="btn btn-borde btn-chico" id="bReTodos" style="margin-top:10px">Reintentar todos</button></div>' : '') +

        '<div class="tarjeta bloque"><h3>' + ico('upload') + 'Por enviar (' + pendientes.length + ')</h3>' +
        (pendientes.length
          ? '<div class="tabla-env"><table class="tabla"><thead><tr><th>Tipo</th><th>Cantidad</th></tr></thead><tbody>' +
            Object.keys(porTabla).map(t => '<tr><td>' + esc(NOMBRE_TABLA(t)) + '</td><td>' + porTabla[t] + '</td></tr>').join('') +
            '</tbody></table></div>'
          : '<p class="vacio" style="padding:10px">Nada pendiente. ✔</p>') + '</div>' +

        '<div class="tarjeta"><h3>' + ico('download') + 'Datos de este equipo</h3>' +
        '<p style="margin:0 0 12px;color:var(--suave);font-size:14px">Si algo no coincide con la hoja, puede volver a descargar todo. Lo que falta enviar no se borra.</p>' +
        '<button class="btn btn-borde" id="bTodo">' + ico('download') + 'Descargar todo de nuevo</button></div>';

      $('#bSync', el).onclick = async ev => {
        ev.currentTarget.disabled = true;
        const r = await Sync.ejecutar();
        aviso(r ? Sync.estado.mensaje : (Sync.estado.mensaje || 'No se pudo sincronizar'), r ? 'ok' : 'error');
        mostrarPantalla();
      };
      $('#bTodo', el).onclick = async () => {
        if (!navigator.onLine) { aviso('Necesita internet.', 'error'); return; }
        if (!(await confirmar('Descargar todo de nuevo', 'Se reemplaza la copia local por la del servidor. Puede tardar unos minutos.', 'Descargar'))) return;
        cargando('Descargando todos los datos…');
        const r = await Sync.ejecutar({ completo: true });
        cargando(null);
        aviso(r ? 'Datos descargados: ' + r.bajados + ' registros' : Sync.estado.mensaje, r ? 'ok' : 'error');
        mostrarPantalla();
      };
      el.querySelectorAll('[data-re]').forEach(b => { b.onclick = async () => {
        const [t, ...k] = b.dataset.re.split('|');
        await L.reintentar(t, k.join('|'));
        Sync.programar(1);
        mostrarPantalla();
      }; });
      el.querySelectorAll('[data-de]').forEach(b => { b.onclick = async () => {
        if (!(await confirmar('Descartar registro', 'Este cambio no se enviará y se perderá. ¿Continuar?', 'Descartar', 'btn-peligro'))) return;
        const [t, ...k] = b.dataset.de.split('|');
        await L.descartar(t, k.join('|'));
        window.dispatchEvent(new CustomEvent('pendientes-cambiaron'));
        mostrarPantalla();
      }; });
      const rt = $('#bReTodos', el);
      if (rt) rt.onclick = async () => { await L.reintentar(); Sync.programar(1); mostrarPantalla(); };
    }
  });

  // ============================================================
  //  PANTALLA: ALERTAS (administradores)
  // ============================================================
  App.pantalla('alertas', {
    refrescar: true,
    async render(el) {
      const ctx = App.contexto;
      const sucursales = await Datos.listar('SUCURSALES');
      const nomSuc = id => { const s = sucursales.find(x => x.id === id); return s ? s.nombre : ''; };
      const lista = (await Datos.listar('ALERTAS', a => a.estado === 'PENDIENTE' &&
        (!ctx.empresa || !a.empresa_id || a.empresa_id === ctx.empresa.id)))
        .sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en)));
      const color = { STOCK_NEGATIVO: 'roja', CONFLICTO_SYNC: 'amarilla', DESCUENTO_EXCEDIDO: 'amarilla' };
      el.innerHTML = '<div class="titulo"><div><h1>Alertas</h1><p>Avisos del sistema: stock negativo, conflictos de sincronización, descuentos excedidos.</p></div></div>' +
        (lista.length ? '<div class="tabla-env"><table class="tabla"><thead><tr><th>Fecha</th><th>Tipo</th><th>Sucursal</th><th>Mensaje</th><th></th></tr></thead><tbody>' +
          lista.map(a => '<tr><td style="white-space:nowrap">' + esc(U.fechaCorta(a.creado_en)) + '</td>' +
            '<td><span class="etiqueta ' + (color[a.tipo] || '') + '">' + esc(String(a.tipo).replace(/_/g, ' ')) + '</span></td>' +
            '<td>' + esc(nomSuc(a.sucursal_id) || '—') + '</td><td>' + esc(a.mensaje) + '</td>' +
            '<td><button class="btn btn-chico btn-borde" data-id="' + esc(a.id) + '">' + ico('check') + 'Resuelta</button></td></tr>').join('') +
          '</tbody></table></div>'
          : '<div class="tarjeta vacio">' + ico('check') + '<p>No hay alertas pendientes.</p></div>');
      el.querySelectorAll('[data-id]').forEach(b => { b.onclick = async () => {
        await Datos.guardar('ALERTAS', { id: b.dataset.id, estado: 'RESUELTA', resuelto_por: Sesion.actual.usuario_id, resuelto_en: U.ahoraISO() });
        aviso('Alerta marcada como resuelta', 'ok');
        mostrarPantalla();
      }; });
    }
  });

  // ============================================================
  //  PANTALLA: MI CUENTA
  // ============================================================
  App.pantalla('cuenta', {
    async render(el) {
      const u = Sesion.actual;
      const ctx = App.contexto;
      const otros = (await DB.Sistema.usuarios()).filter(x => x.usuario_id !== u.usuario_id);
      const todasSuc = await Datos.listar('SUCURSALES');
      const mias = todasSuc.filter(s => (u.sucursales || []).indexOf(String(s.id)) >= 0).map(s => s.nombre);
      el.innerHTML =
        '<div class="titulo"><div><h1>Mi cuenta</h1></div></div>' +
        '<div class="rejilla bloque">' +
        '<div class="tarjeta"><h3>' + ico('user') + 'Mis datos</h3>' +
        '<div class="dato"><span>Nombre</span><b>' + esc(u.nombre) + '</b></div>' +
        '<div class="dato"><span>Usuario</span><b>' + esc(u.usuario) + '</b></div>' +
        '<div class="dato"><span>Rol</span><b>' + esc(NOMBRE_ROL[u.rol] || u.rol) + '</b></div>' +
        '<div class="dato"><span>Empresa</span><b>' + esc(u.rol === AG ? 'Todas' : (ctx.empresa ? ctx.empresa.nombre : '—')) + '</b></div>' +
        '<div class="dato"><span>Sucursales</span><b>' + (u.rol === AG || u.rol === ADM || u.rol === CON ? 'Todas (' + mias.length + ')' : esc(mias.join(', ') || '—')) + '</b></div>' +
        '<div class="dato"><span>Descuento máximo</span><b>' + esc(u.descuento_max_pct) + '%</b></div>' +
        '<div class="dato"><span>Sesión válida hasta</span><b>' + esc(U.fechaCorta(u.expira_en)) + '</b></div></div>' +
        '<div class="tarjeta"><h3>' + ico('lock') + 'Seguridad</h3>' +
        '<p style="margin:0 0 12px;color:var(--suave);font-size:14px">Cambiar la clave necesita internet.</p>' +
        '<button class="btn btn-borde btn-bloque" id="bClave">' + ico('lock') + 'Cambiar mi clave</button>' +
        '<button class="btn btn-borde btn-bloque" id="bInst" style="margin-top:10px">' + ico('install') + 'Instalar la app</button></div>' +
        '<div class="tarjeta"><h3>' + ico('logout') + 'Salir</h3>' +
        '<p style="margin:0 0 12px;color:var(--suave);font-size:14px"><b>Cambiar de usuario</b>: bloquea la app; puede volver a entrar aunque no haya internet.</p>' +
        '<button class="btn btn-azul btn-bloque" id="bSalir">' + ico('users') + 'Cambiar de usuario</button>' +
        '<p style="margin:14px 0 12px;color:var(--suave);font-size:14px"><b>Cerrar sesión en este equipo</b>: borra sus datos de este equipo (por ejemplo, si el equipo cambia de dueño).</p>' +
        '<button class="btn btn-peligro btn-bloque" id="bCerrar">' + ico('logout') + 'Cerrar sesión en este equipo</button></div>' +
        '</div>' +
        (otros.length ? '<div class="tarjeta"><h3>' + ico('users') + 'Otros usuarios que usan este equipo</h3>' +
          otros.map(o => '<div class="dato"><span>' + esc(o.nombre) + ' (' + esc(o.usuario) + ')</span><b>' + esc(NOMBRE_ROL[o.rol] || o.rol) +
            (o.token ? '' : ' <span class="etiqueta amarilla">sesión vencida</span>') + '</b></div>').join('') + '</div>' : '');

      $('#bClave', el).onclick = () => pedirCambioClave(false);
      $('#bInst', el).onclick = instalarApp;
      $('#bSalir', el).onclick = async () => { const nom = u.usuario; await Sesion.salir(); mostrarLogin('', nom); };
      $('#bCerrar', el).onclick = async () => {
        if (!(await confirmar('Cerrar sesión en este equipo', 'Se borrarán sus datos de este equipo. Para volver a entrar necesitará internet.', 'Cerrar sesión', 'btn-peligro'))) return;
        try {
          await Sesion.cerrarDefinitivo();
          mostrarLogin('Sesión cerrada en este equipo.');
        } catch (e) {
          aviso(e.message, 'error', 6);
        }
      };
    }
  });

  // ============================================================
  //  ACTUALIZACIONES DE LA APP (service worker)
  // ============================================================
  function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    let recargando = false;
    const habiaControlador = !!navigator.serviceWorker.controller;   // primera visita: no recargar
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recargando || !habiaControlador) return;
      recargando = true;
      location.reload();
    });
    navigator.serviceWorker.register('./sw.js').then(reg => {
      const ofrecer = w => {
        const a = document.createElement('div');
        a.className = 'avisos';
        a.innerHTML = '<div class="aviso info"><span>Hay una versión nueva de la app.</span>' +
          '<button class="btn btn-chico btn-principal">Actualizar</button></div>';
        $('button', a).onclick = () => w.postMessage('actualizar');
        document.body.appendChild(a);
      };
      if (reg.waiting && navigator.serviceWorker.controller) ofrecer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) ofrecer(w);
        });
      });
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(e => console.warn('Service worker no registrado:', e));
  }

  window.App = App;
  document.addEventListener('DOMContentLoaded', arrancar);
})();
