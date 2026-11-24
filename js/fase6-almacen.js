/**
 * ============================================================
 *  FASE 6: PROVEEDORES, COMPRAS, CUENTAS POR PAGAR, AJUSTES
 * ============================================================
 *  Pantallas:
 *   #/proveedores    Proveedores de la empresa y los productos que proveen.
 *   #/compras        Compras / ingresos: transporte repartido por cajas o por
 *                    volumen → costo final por unidad. El servidor recalcula el
 *                    precio de adquisición (promedio ponderado). Activa "Nuevo stock".
 *   #/cuentas-pagar  Deudas con proveedores (compras a crédito) y pagos.
 *   #/ajustes        Ajustes de inventario (conteo físico o cantidad +/−).
 *
 *  Roles: ADMIN_GENERAL, ADMINISTRADOR y ALMACEN (en sus sucursales).
 *  Nada se borra: compras, pagos y ajustes se ANULAN con motivo
 *  (los movimientos de stock se revierten con movimientos ANULACION).
 *
 *  Para otras fases e importaciones:  window.F6
 *    F6.calcularCompra(lineas, { gasto, metodo })
 *    await F6.registrosCompra({ suc, proveedor, fecha, ... })  → { regs, id, numero, total }
 *    await F6.registrosAjuste({ suc, tipo, motivo, lineas })   → { regs, id, numero }
 *    await F6.alcance()  → { empresas, sucursales } donde el usuario trabaja
 * ============================================================
 */
(function () {
  'use strict';

  const R = App.ROLES;
  const AG = R.AG, ADM = R.ADM, ALM = R.ALM;
  const esc = U.esc, ico = App.ico;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  // ============================================================
  //  UTILIDADES
  // ============================================================
  const txt = v => String(v == null ? '' : v).trim();
  const activo = x => !!x && x.estado !== 'INACTIVO' && x.estado !== 'ANULADO';
  const anulado = x => !!x && x.estado === 'ANULADO';
  const mismo = (a, b) => String(a == null ? '' : a) === String(b == null ? '' : b);
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const num = v => {
    if (v === '' || v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const n = Number(String(v).trim().replace(/\s/g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
  };
  const n0 = v => num(v) || 0;
  const red = (n, d) => { const f = Math.pow(10, d); return Math.round((Number(n) || 0) * f) / f; };
  const fmt = (n, dec) => (Number(n) || 0).toLocaleString('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: dec == null ? 3 : dec });
  const fmtNum = v => (v === '' || v == null ? '' : String(v));
  const bs = v => U.bs(v);
  const rol = () => Sesion.actual.rol;
  const esAG = () => rol() === AG;
  const porNombre = (a, b) => txt(a.nombre || a.razon_social).localeCompare(txt(b.nombre || b.razon_social), 'es');
  const ordenSuc = (a, b) => (b.es_central === 'SI') - (a.es_central === 'SI') || porNombre(a, b);
  const hoy = () => U.ahoraISO().slice(0, 10);
  const zona = () => U.ahoraISO().slice(23);
  /** 'AAAA-MM-DD' → fecha ISO (hoy: hora actual; otro día: mediodía). */
  const fechaISO = d => !d || d === hoy() ? U.ahoraISO() : d + 'T12:00:00.000' + zona();
  const sumarDias = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + Number(n || 0)); return U.ahoraISO(x).slice(0, 10); };
  const fechaCorta = iso => { if (!iso) return '—'; const d = new Date(String(iso).length === 10 ? iso + 'T12:00:00' : iso); return isNaN(d) ? String(iso) : d.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
  const diasHasta = d => Math.round((Date.parse(String(d).slice(0, 10) + 'T12:00:00') - Date.parse(hoy() + 'T12:00:00')) / 86400000);
  const NOMBRE_PRES = { UNIDAD: 'unidad', PAQUETE: 'paquete', CAJA: 'caja' };

  const ICO6 = {
    mas: 'M12 5v14M5 12h14',
    quitar: 'M18 6L6 18M6 6l12 12',
    paquete: 'M3 7l9-4 9 4-9 4-9-4M3 7v10l9 4 9-4V7M12 11v10',
    ojo: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12M12 15a3 3 0 100-6 3 3 0 000 6',
    pago: 'M2 6h20v12H2zM2 10h20M6 15h4'
  };
  const icoX = n => ICO6[n] ? '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICO6[n] + '"/></svg>' : ico(n);

  function contenedor(el) { const c = document.createElement('div'); el.appendChild(c); return c; }
  function vacio(icono, texto, boton) { return '<div class="tarjeta vacio">' + icoX(icono) + '<p>' + texto + '</p>' + (boton || '') + '</div>'; }
  function modalAncho(op, clase) { const f = App.modal(op); $('.modal', f).classList.add(clase || 'ancho'); return f; }
  function mensaje(f, texto, tipo) {
    const m = $('.f-msg', f);
    if (!m) { if (texto) App.aviso(texto, tipo === 'ok' ? 'ok' : 'error', 6); return false; }
    m.innerHTML = texto ? '<div class="msg msg-' + (tipo || 'error') + '">' + esc(texto) + '</div>' : '';
    if (texto) m.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return false;
  }
  function campo(id, etiqueta, valor, op) {
    op = op || {};
    const v = valor == null ? '' : valor;
    const entrada = op.area
      ? '<textarea class="entrada" id="' + id + '" rows="2"' + (op.attrs || '') + '>' + esc(v) + '</textarea>'
      : '<input class="entrada" id="' + id + '" value="' + esc(v) + '"' + (op.tipo ? ' type="' + op.tipo + '"' : '') +
        (op.ph ? ' placeholder="' + esc(op.ph) + '"' : '') + (op.attrs || '') + '>';
    return '<div class="campo' + (op.clase ? ' ' + op.clase : '') + '"' + (op.idCampo ? ' id="' + op.idCampo + '"' : '') + '>' +
      '<label for="' + id + '">' + esc(etiqueta) + (op.req ? ' <span class="req">*</span>' : '') + '</label>' + entrada +
      (op.ayuda ? '<span class="ayuda"' + (op.idAyuda ? ' id="' + op.idAyuda + '"' : '') + '>' + op.ayuda + '</span>' : '') + '</div>';
  }
  function campoNum(id, etiqueta, valor, op) {
    op = Object.assign({}, op || {});
    op.attrs = ' inputmode="decimal" autocomplete="off"' + (op.attrs || '');
    return campo(id, etiqueta, fmtNum(valor), op);
  }
  function lista(id, opciones, sel, attrs) {
    return '<select class="entrada" id="' + id + '"' + (attrs || '') + '>' + opciones.map(o =>
      '<option value="' + esc(o[0]) + '"' + (mismo(o[0], sel) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
  }
  function campoLista(id, etiqueta, opciones, sel, op) {
    op = op || {};
    return '<div class="campo' + (op.clase ? ' ' + op.clase : '') + '"' + (op.idCampo ? ' id="' + op.idCampo + '"' : '') + '>' +
      '<label for="' + id + '">' + esc(etiqueta) + (op.req ? ' <span class="req">*</span>' : '') + '</label>' + lista(id, opciones, sel, op.attrs) +
      (op.ayuda ? '<span class="ayuda">' + op.ayuda + '</span>' : '') + '</div>';
  }
  function leerNumero(f, id, etiqueta, op) {
    op = op || {};
    const el = $('#' + id, f);
    const t = el ? txt(el.value) : '';
    const Mayus = etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
    if (!t) { if (op.req) throw new Error('Escriba ' + etiqueta + '.'); return ''; }
    const n = num(t);
    if (n === null) throw new Error(Mayus + ': escriba solo números (ej. 12,50).');
    if (n < 0) throw new Error(Mayus + ' no puede ser negativo.');
    if (op.mayorCero && n <= 0) throw new Error(Mayus + ' debe ser mayor que 0.');
    return red(n, op.dec == null ? 2 : op.dec);
  }
  /** Ventana para escribir el motivo de una anulación. Devuelve el texto o null. */
  function pedirMotivo(titulo, texto) {
    return new Promise(listo => {
      App.modal({
        titulo: titulo,
        html: '<p style="margin:0 0 12px;line-height:1.5">' + texto + '</p>' +
          campo('xMotivo', 'Motivo de la anulación', '', { req: true, area: true, attrs: ' maxlength="200"' }) + '<div class="f-msg"></div>',
        botones: [{ t: 'Cancelar', accion: () => listo(null) }, { t: 'Anular', clase: 'btn-peligro', accion: m => {
          const v = txt($('#xMotivo', m).value);
          if (v.length < 4) return mensaje(m, 'Escriba el motivo (al menos 4 letras).');
          listo(v);
        } }]
      });
    });
  }
  async function pendientesDe(tabla) {
    const m = {};
    (await Sesion.local.salida()).filter(x => x.tabla === tabla).forEach(x => { m[x.clave] = x.estado; });
    return m;
  }
  function etiquetaEnvio(estado) {
    if (!estado) return '';
    return estado === 'PENDIENTE'
      ? ' <span class="etiqueta amarilla" title="Se enviará al servidor al sincronizar">Por enviar</span>'
      : ' <a class="etiqueta roja" href="#/sincronizacion" title="El servidor no lo aceptó. Vea Sincronización">No aceptado</a>';
  }
  function etiquetaEstadoDoc(x) {
    return anulado(x) ? '<span class="etiqueta roja">Anulado</span>' : '<span class="etiqueta verde">Vigente</span>';
  }
  async function nombresUsuarios() {
    const m = new Map((await Datos.listar('USUARIOS')).map(u => [String(u.id), u.nombre]));
    return id => m.get(String(id)) || '';
  }
  function miniatura(p) {
    const u = Catalogo.imagen(p);
    return '<span class="mini">' + (u ? '<img src="' + esc(u) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '</span>';
  }
  const textoUnid = p => (p && p.unidad) || 'UND';

  // ============================================================
  //  DÓNDE TRABAJA EL USUARIO (empresas y sucursales)
  // ============================================================
  /** AG: todas las empresas y sucursales activas. ADMINISTRADOR: las de su empresa. ALMACEN: las suyas. */
  async function alcance() {
    if (esAG()) {
      const empresas = (await Datos.listar('EMPRESAS', e => e.estado !== 'INACTIVO')).sort(porNombre);
      const ids = new Set(empresas.map(e => String(e.id)));
      const sucursales = (await Datos.listar('SUCURSALES', s => s.estado !== 'INACTIVO' && ids.has(String(s.empresa_id)))).sort(ordenSuc);
      return { empresas: empresas, sucursales: sucursales };
    }
    const ctx = App.contexto;
    return { empresas: ctx.empresa ? [ctx.empresa] : [], sucursales: ctx.sucursales.slice().sort(ordenSuc) };
  }
  /** Deja empresa/sucursal del filtro dentro de lo permitido. todas = permite sucursal '' (todas). */
  function vistaValida(est, a, todas) {
    if (!a.empresas.some(e => mismo(e.id, est.empresaId))) {
      est.empresaId = (App.contexto.empresa && a.empresas.some(e => mismo(e.id, App.contexto.empresa.id)) ? App.contexto.empresa.id : (a.empresas[0] || {}).id) || '';
    }
    const sucs = a.sucursales.filter(s => mismo(s.empresa_id, est.empresaId));
    if (est.sucursalId && !sucs.some(s => mismo(s.id, est.sucursalId))) est.sucursalId = '';
    if (!est.sucursalId && !todas) {
      const ctxS = App.contexto.sucursal && sucs.find(s => mismo(s.id, App.contexto.sucursal.id));
      est.sucursalId = (ctxS || sucs[0] || {}).id || '';
    }
    return sucs;
  }
  function selectorHtml(est, a, op) {
    op = op || {};
    const sucs = a.sucursales.filter(s => mismo(s.empresa_id, est.empresaId));
    let h = '';
    if (esAG() && a.empresas.length > 1) h += '<div class="campo corto"><label for="selEmp">Empresa</label>' + lista('selEmp', a.empresas.map(e => [e.id, e.nombre]), est.empresaId) + '</div>';
    if (!op.soloEmpresa && (sucs.length > 1 || op.todas)) {
      h += '<div class="campo corto"><label for="selSuc">Sucursal</label>' + lista('selSuc', (op.todas && sucs.length > 1 ? [['', 'Todas']] : [])
        .concat(sucs.map(s => [s.id, s.nombre + (s.es_central === 'SI' ? ' (central)' : '')])), est.sucursalId) + '</div>';
    }
    return h;
  }
  function enlazarSelector(raiz, est, alCambiar) {
    const e = $('#selEmp', raiz), s = $('#selSuc', raiz);
    if (e) e.onchange = () => { est.empresaId = e.value; est.sucursalId = ''; est.limite = 50; alCambiar(); };
    if (s) s.onchange = () => { est.sucursalId = s.value; est.limite = 50; alCambiar(); };
  }
  const sucursalesDe = (est, a) => a.sucursales.filter(s => mismo(s.empresa_id, est.empresaId) && (!est.sucursalId || mismo(s.id, est.sucursalId)));

  // ============================================================
  //  DATOS COMUNES
  // ============================================================
  async function proveedoresDe(empresaId, conInactivos) {
    return (await Datos.listar('PROVEEDORES', p => mismo(p.empresa_id, empresaId) && (conInactivos || activo(p)))).sort(porNombre);
  }
  /** Map compra_id → total pagado (pagos vigentes). */
  async function pagosPorCompra() {
    const m = new Map();
    (await Datos.listar('PAGOS_PROVEEDORES', p => !anulado(p))).forEach(p => m.set(String(p.compra_id), red((m.get(String(p.compra_id)) || 0) + n0(p.monto), 2)));
    return m;
  }
  const saldoDe = (compra, pagado) => compra.tipo_pago === 'CREDITO' && !anulado(compra) ? red(n0(compra.total) - (pagado.get(String(compra.id)) || 0), 2) : 0;
  const volumenCaja = p => n0(p.caja_ancho_cm) * n0(p.caja_alto_cm) * n0(p.caja_prof_cm) / 1e6;

  // ============================================================
  //  BUSCADOR DE PRODUCTOS (escribir, escanear o lector USB)
  // ============================================================
  /**
   * op: { sucursalId: () => id, alElegir(producto, presentacion), etiqueta }
   * Enter con un código exacto agrega el producto (y la presentación del código de barras leído).
   */
  function buscadorProductos(cont, op) {
    const id = 'bp' + Math.random().toString(36).slice(2, 8);
    cont.innerHTML = '<div class="campo"><label for="' + id + '">' + (op.etiqueta || 'Agregar producto') +
      ' <small class="suave">(escriba, escanee o use el lector USB · Enter agrega)</small></label>' +
      '<input class="entrada" id="' + id + '" autocomplete="off" enterkeyhint="search" placeholder="Código, código de barras o nombre · marca después de una coma">' +
      '<div class="l-sugerencias"></div></div>';
    const i = $('input', cont);
    const sug = $('.l-sugerencias', cont);
    Escaner.boton(i, { enter: true, titulo: 'Escanee el producto' });
    let lista2 = [];
    let stock = new Map(), sucCache = '';
    const pintar = async () => {
      const q = txt(i.value);
      if (!q) { lista2 = []; sug.innerHTML = ''; return; }
      const sid = op.sucursalId();
      if (sid !== sucCache) { stock = await Catalogo.stocks(sid); sucCache = sid; }
      lista2 = (await Catalogo.buscar(q)).slice(0, 8);
      sug.innerHTML = lista2.map(p => '<button type="button" class="l-sug" data-agregar="' + esc(p.id) + '">' + miniatura(p) +
        '<span><b>' + esc(p.nombre) + '</b><small>' + esc(p.codigo) + ' · stock ' + fmt(stock.get(String(p.id)) || 0) + ' ' + esc(textoUnid(p)) +
        '</small></span><em>+ agregar</em></button>').join('') ||
        '<p class="nota" style="margin:6px 0 0">Ningún producto coincide.</p>';
    };
    let espera = null;
    i.oninput = () => { clearTimeout(espera); espera = setTimeout(pintar, 60); };
    const limpiar = () => { i.value = ''; lista2 = []; sug.innerHTML = ''; i.focus(); };
    i.onkeydown = async ev => {
      if (ev.key === 'Escape') { limpiar(); return; }
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      const r = await Catalogo.porCodigo(i.value);
      if (r && activo(r.producto)) { op.alElegir(r.producto, r.por === 'barras' ? r.presentacion : 'UNIDAD', true); Escaner.pitido(); limpiar(); return; }
      if (r) { App.aviso('«' + r.producto.nombre + '» está inactivo en el catálogo.', 'error'); return; }
      if (lista2.length === 1) { op.alElegir(lista2[0], 'UNIDAD', false); limpiar(); return; }
      if (txt(i.value)) App.aviso(lista2.length ? 'Elija el producto de la lista.' : 'No se encontró «' + txt(i.value) + '».', 'info');
    };
    sug.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-agregar]');
      if (!b) return;
      const c = await Catalogo.cargar();
      const p = c.porId.get(String(b.dataset.agregar));
      if (p) { op.alElegir(p, 'UNIDAD', false); limpiar(); }
    });
    return { foco: () => i.focus() };
  }

  /** Opciones de presentación de un producto: [[UNIDAD, 'Unidad'], [CAJA, 'Caja de 100']] */
  function opcionesPres(p) {
    const upp = n0(p.unidades_por_paquete), upc = n0(p.unidades_por_caja);
    return [['UNIDAD', textoUnid(p)]].concat(upp > 1 ? [['PAQUETE', 'Paquete de ' + fmt(upp)]] : [], upc > 1 ? [['CAJA', 'Caja de ' + fmt(upc)]] : []);
  }

  // ============================================================
  //  PANTALLA: PROVEEDORES
  // ============================================================
  const fProv = { empresaId: '', buscar: '', estado: 'ACTIVO' };

  App.pantalla('proveedores', {
    refrescar: true,
    async render(el) {
      const raiz = contenedor(el);
      const a = await alcance();
      vistaValida(fProv, a, true);
      if (!fProv.empresaId) { raiz.innerHTML = '<div class="titulo"><div><h1>Proveedores</h1></div></div>' + vacio('truck', 'Todavía no hay empresas.'); return; }
      const provs = await proveedoresDe(fProv.empresaId, true);
      const pp = await Datos.listar('PROVEEDOR_PRODUCTOS', x => activo(x));
      const nProd = new Map();
      pp.forEach(x => nProd.set(String(x.proveedor_id), (nProd.get(String(x.proveedor_id)) || 0) + 1));
      const pagado = await pagosPorCompra();
      const deuda = new Map();
      (await Datos.listar('COMPRAS', x => mismo(x.empresa_id, fProv.empresaId) && x.tipo_pago === 'CREDITO' && !anulado(x)))
        .forEach(x => deuda.set(String(x.proveedor_id), red((deuda.get(String(x.proveedor_id)) || 0) + saldoDe(x, pagado), 2)));
      const pend = await pendientesDe('PROVEEDORES');
      const nombreEmp = (a.empresas.find(e => mismo(e.id, fProv.empresaId)) || {}).nombre || '';

      raiz.innerHTML = '<div class="titulo"><div><h1>Proveedores</h1><p>' + esc(nombreEmp) + ' · ' + provs.filter(activo).length + ' activo(s). ' +
        'Son de toda la empresa (todas las sucursales).</p></div>' +
        '<div class="acciones-fila"><button class="btn btn-borde" data-acc="exportar">' + ico('download') + 'Exportar Excel</button>' +
        '<button class="btn btn-principal" data-acc="nuevo">' + icoX('mas') + 'Nuevo proveedor</button></div></div>' +
        '<div class="filtros">' + selectorHtml(fProv, a, { soloEmpresa: true }) +
        '<div class="campo"><label for="pvBuscar">Buscar</label><input class="entrada" id="pvBuscar" value="' + esc(fProv.buscar) + '" autocomplete="off" placeholder="Nombre, NIT, contacto o teléfono"></div>' +
        '<div class="campo corto"><label for="pvEstado">Mostrar</label>' + lista('pvEstado', [['ACTIVO', 'Activos'], ['INACTIVO', 'Inactivos'], ['TODOS', 'Todos']], fProv.estado) + '</div></div>' +
        '<div id="pvLista"></div>';

      const pintar = () => {
        const b = norm(fProv.buscar);
        const vista = provs.filter(p => (fProv.estado === 'TODOS' || (fProv.estado === 'INACTIVO') === (p.estado === 'INACTIVO')) &&
          (!b || norm([p.razon_social, p.nit, p.contacto, p.telefono].join(' ')).indexOf(b) >= 0));
        const cont = $('#pvLista', raiz);
        if (!provs.length) { cont.innerHTML = vacio('truck', '<b>Todavía no hay proveedores.</b><br>Créelos aquí o al registrar una compra.', '<button class="btn btn-principal" data-acc="nuevo" style="margin-top:12px">' + icoX('mas') + 'Nuevo proveedor</button>'); return; }
        if (!vista.length) { cont.innerHTML = vacio('search', 'Ningún proveedor coincide.'); return; }
        cont.innerHTML = '<div class="tabla-env"><table class="tabla"><thead><tr><th>Proveedor</th><th>Contacto</th><th>Condiciones</th>' +
          '<th class="num">Productos</th><th class="num">Deuda</th><th>Estado</th><th></th></tr></thead><tbody>' +
          vista.map(p => '<tr class="clic' + (activo(p) ? '' : ' inactivo') + '" data-acc="editar" data-id="' + esc(p.id) + '">' +
            '<td><b>' + esc(p.razon_social) + '</b>' + etiquetaEnvio(pend[p.id]) + (p.nit ? '<span class="sub">NIT ' + esc(p.nit) + '</span>' : '') + '</td>' +
            '<td>' + esc(p.contacto || '—') + (p.telefono ? '<span class="sub">' + esc(p.telefono) + '</span>' : '') + '</td>' +
            '<td>' + esc(p.condiciones_pago || '—') + (n0(p.plazo_pago_dias) ? '<span class="sub">Plazo ' + fmt(p.plazo_pago_dias) + ' días</span>' : '') + '</td>' +
            '<td class="num">' + (nProd.get(String(p.id)) || 0) + '</td>' +
            '<td class="num">' + (deuda.get(String(p.id)) > 0 ? '<b class="txt-rojo">' + bs(deuda.get(String(p.id))) + '</b>' : '<span class="suave">—</span>') + '</td>' +
            '<td>' + (activo(p) ? '<span class="etiqueta verde">Activo</span>' : '<span class="etiqueta roja">Inactivo</span>') + '</td>' +
            '<td class="acc"><div class="acciones-fila"><button class="btn btn-chico btn-borde" data-acc="productos" data-id="' + esc(p.id) + '">' + icoX('paquete') + 'Productos</button>' +
            '<button class="btn btn-chico btn-borde" data-acc="editar" data-id="' + esc(p.id) + '">Editar</button></div></td></tr>').join('') +
          '</tbody></table></div><p class="nota" style="margin-top:10px">' + vista.length + ' proveedor(es).</p>';
      };
      pintar();
      const iB = $('#pvBuscar', raiz);
      iB.oninput = () => { fProv.buscar = iB.value; pintar(); };
      $('#pvEstado', raiz).onchange = e => { fProv.estado = e.target.value; pintar(); };
      enlazarSelector(raiz, fProv, () => App.refrescarContexto());
      raiz.onclick = async ev => {
        const b = ev.target.closest('[data-acc]');
        if (!b) return;
        ev.stopPropagation();
        const p = provs.find(x => mismo(x.id, b.dataset.id));
        switch (b.dataset.acc) {
          case 'nuevo': if (await formProveedor(null, fProv.empresaId)) App.refrescarContexto(); return;
          case 'editar': if (await formProveedor(p, fProv.empresaId)) App.refrescarContexto(); return;
          case 'productos': return productosProveedor(p);
          case 'exportar': return exportarProveedores(provs, nombreEmp, nProd, deuda);
        }
      };
    }
  });

  /** Crear / editar proveedor. Devuelve el id guardado (o null). */
  function formProveedor(p, empresaId) {
    return new Promise(listo => {
      const nuevo = !p;
      p = p || {};
      App.modal({
        titulo: nuevo ? 'Nuevo proveedor' : 'Editar proveedor',
        html: '<div class="form-2">' +
          campo('vRazon', 'Nombre o razón social', p.razon_social, { req: true, clase: 'todo', attrs: ' maxlength="100" autocomplete="off"' }) +
          campo('vNit', 'NIT', p.nit, { attrs: ' maxlength="20" inputmode="numeric" autocomplete="off"' }) +
          campo('vContacto', 'Persona de contacto', p.contacto, { attrs: ' maxlength="60"' }) +
          campo('vTel', 'Teléfono', p.telefono, { tipo: 'tel', attrs: ' maxlength="30"' }) +
          campo('vEmail', 'Correo', p.email, { tipo: 'email', attrs: ' maxlength="80"' }) +
          campo('vDir', 'Dirección', p.direccion, { clase: 'todo', attrs: ' maxlength="150"' }) +
          campo('vCond', 'Condiciones de pago', p.condiciones_pago, { clase: 'todo', ph: 'Ej. Crédito 30 días · 2% de descuento por pronto pago', attrs: ' maxlength="150"' }) +
          campoNum('vPlazo', 'Plazo de pago (días)', p.plazo_pago_dias, { ayuda: 'Se usa para la fecha de vencimiento de las compras a crédito.' }) +
          (nuevo ? '' : campoLista('vEstado', 'Estado', [['ACTIVO', 'Activo'], ['INACTIVO', 'Inactivo']], p.estado || 'ACTIVO')) +
          '</div><div class="f-msg"></div>',
        botones: [{ t: 'Cancelar', accion: () => listo(null) }, { t: 'Guardar', clase: 'btn-principal', accion: async m => {
          try {
            const razon = txt($('#vRazon', m).value);
            if (!razon) return mensaje(m, 'Escriba el nombre o razón social.');
            const otros = (await proveedoresDe(empresaId, true)).filter(x => !mismo(x.id, p.id));
            if (otros.some(x => norm(x.razon_social) === norm(razon))) return mensaje(m, 'Ya existe un proveedor con ese nombre.');
            const nit = txt($('#vNit', m).value);
            if (nit && otros.some(x => txt(x.nit) === nit) && !(await App.confirmar('NIT repetido', 'Otro proveedor tiene el NIT ' + nit + '. ¿Guardar igual?', 'Guardar'))) return false;
            const plazo = leerNumero(m, 'vPlazo', 'el plazo', { dec: 0 });
            const fila = { razon_social: razon, nit: nit, contacto: txt($('#vContacto', m).value), telefono: txt($('#vTel', m).value),
              email: txt($('#vEmail', m).value), direccion: txt($('#vDir', m).value), condiciones_pago: txt($('#vCond', m).value), plazo_pago_dias: plazo };
            if (nuevo) Object.assign(fila, { id: U.uuid(), empresa_id: empresaId, estado: 'ACTIVO' });
            else Object.assign(fila, { id: p.id, estado: $('#vEstado', m).value });
            await Datos.guardar('PROVEEDORES', fila);
            App.aviso('Proveedor guardado', 'ok');
            listo(fila.id);
            return true;
          } catch (e) { return mensaje(m, e.message || String(e)); }
        } }]
      });
    });
  }

  /** Productos que provee un proveedor (código del proveedor, último costo por unidad). */
  async function productosProveedor(pr) {
    const c = await Catalogo.cargar();
    const f = modalAncho({
      titulo: 'Productos de ' + pr.razon_social,
      html: '<p class="nota">Los productos se agregan solos al registrar compras (con el último costo). También puede agregarlos aquí. ' +
        'El <b>código del proveedor</b> es el que usa él en sus facturas.</p><div id="ppBuscador"></div><div id="ppLista"></div>',
      botones: [{ t: 'Exportar Excel', clase: 'btn-borde', accion: () => { exportar(); return false; } }, { t: 'Cerrar', clase: 'btn-principal' }]
    });
    let filas = [];
    const pintar = async () => {
      filas = (await Datos.listar('PROVEEDOR_PRODUCTOS', x => mismo(x.proveedor_id, pr.id))).filter(x => c.porId.has(String(x.producto_id)));
      const act = filas.filter(activo).sort((a, b) => porNombre(c.porId.get(String(a.producto_id)), c.porId.get(String(b.producto_id))));
      $('#ppLista', f).innerHTML = !act.length ? '<p class="vacio">Todavía no tiene productos.</p>'
        : '<div class="tabla-env"><table class="tabla compacta"><thead><tr><th>Producto</th><th>Cód. proveedor</th><th class="num">Último costo (c/u)</th><th>Última compra</th><th></th></tr></thead><tbody>' +
          act.map(x => {
            const p = c.porId.get(String(x.producto_id));
            return '<tr><td><b>' + esc(p.nombre) + '</b><span class="sub">' + esc(p.codigo) + '</span></td>' +
              '<td><input class="entrada mini-num ancho" data-codprov="' + esc(x.id) + '" value="' + esc(x.codigo_proveedor || '') + '" maxlength="30"></td>' +
              '<td class="num">' + (n0(x.ultimo_costo) ? bs(x.ultimo_costo) : '—') + '</td><td>' + fechaCorta(x.ultima_compra_en) + '</td>' +
              '<td class="acc"><button class="btn btn-icono" data-quitar="' + esc(x.id) + '" title="Quitar" aria-label="Quitar">' + icoX('quitar') + '</button></td></tr>';
          }).join('') + '</tbody></table></div><p class="nota" style="margin-top:8px">' + act.length + ' producto(s).</p>';
    };
    buscadorProductos($('#ppBuscador', f), {
      sucursalId: () => (App.contexto.sucursal || {}).id || '',
      alElegir: async p => {
        const ya = filas.find(x => mismo(x.producto_id, p.id));
        if (ya && activo(ya)) { App.aviso('Ya está en la lista.', 'info', 2); return; }
        await Datos.guardar('PROVEEDOR_PRODUCTOS', ya ? { id: ya.id, estado: 'ACTIVO' }
          : { id: U.uuid(), proveedor_id: pr.id, producto_id: p.id, codigo_proveedor: '', ultimo_costo: '', ultima_compra_en: '', estado: 'ACTIVO' });
        pintar();
      }
    });
    f.addEventListener('change', async ev => {
      const i = ev.target.closest('[data-codprov]');
      if (!i) return;
      await Datos.guardar('PROVEEDOR_PRODUCTOS', { id: i.dataset.codprov, codigo_proveedor: txt(i.value) });
      App.aviso('Código del proveedor guardado', 'ok', 2);
    });
    f.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-quitar]');
      if (!b) return;
      await Datos.guardar('PROVEEDOR_PRODUCTOS', { id: b.dataset.quitar, estado: 'INACTIVO' });
      pintar();
    });
    function exportar() {
      const act = filas.filter(activo).map(x => ({ x: x, p: c.porId.get(String(x.producto_id)) })).sort((a, b) => porNombre(a.p, b.p));
      Excel.descargar('Productos_' + Excel.nombreArchivo(pr.razon_social) + '_' + hoy() + '.xlsx', [{
        nombre: 'Productos', titulo: 'Productos de ' + pr.razon_social, subtitulo: fechaCorta(hoy()) + ' · ' + act.length + ' producto(s)',
        columnas: [{ t: 'Código', w: 12 }, { t: 'Nombre', w: 42 }, { t: 'Marca', w: 16 }, { t: 'Unidad', w: 9 }, { t: 'Cód. proveedor', w: 16 },
          { t: 'Último costo (c/u)', w: 14, tipo: 'bs' }, { t: 'Última compra', w: 12 }],
        filas: act.map(o => [txt(o.p.codigo), txt(o.p.nombre), c.nombreMarca(o.p.marca_id), textoUnid(o.p), txt(o.x.codigo_proveedor),
          n0(o.x.ultimo_costo) || '', o.x.ultima_compra_en ? fechaCorta(o.x.ultima_compra_en) : ''])
      }]);
    }
    pintar();
  }

  function exportarProveedores(provs, empresa, nProd, deuda) {
    Excel.descargar('Proveedores_' + Excel.nombreArchivo(empresa) + '_' + hoy() + '.xlsx', [{
      nombre: 'Proveedores', titulo: 'Proveedores · ' + empresa, subtitulo: fechaCorta(hoy()) + ' · ' + provs.length + ' proveedor(es)',
      columnas: [{ t: 'Razón social', w: 32 }, { t: 'NIT', w: 14 }, { t: 'Contacto', w: 20 }, { t: 'Teléfono', w: 14 }, { t: 'Correo', w: 24 },
        { t: 'Dirección', w: 30 }, { t: 'Condiciones de pago', w: 30 }, { t: 'Plazo (días)', w: 10, tipo: 'num' }, { t: 'Productos', w: 10, tipo: 'num' },
        { t: 'Deuda', w: 13, tipo: 'bs' }, { t: 'Estado', w: 10 }],
      filas: provs.map(p => [txt(p.razon_social), txt(p.nit), txt(p.contacto), txt(p.telefono), txt(p.email), txt(p.direccion), txt(p.condiciones_pago),
        n0(p.plazo_pago_dias) || '', nProd.get(String(p.id)) || 0, deuda.get(String(p.id)) || 0, p.estado === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO'])
    }]);
  }

  // ============================================================
  //  COMPRAS: cálculo del transporte y del costo final por unidad
  // ============================================================
  /**
   * lineas: [{ p, presentacion, cantidad, costoPres }]   tr: { gasto, metodo: 'CAJAS'|'VOLUMEN' }
   * - Cajas de una línea = unidades ÷ unidades por caja (si el producto no tiene caja: cada presentación cuenta como 1 caja).
   * - Volumen de una línea = cajas × volumen de la caja (medidas del catálogo).
   * - Transporte de la línea = gasto × (su peso ÷ peso total). Costo final por unidad = (subtotal + transporte) ÷ unidades.
   */
  function calcularCompra(lineas, tr) {
    const gastoIn = red(n0(tr && tr.gasto), 2);
    const metodo = gastoIn > 0 ? ((tr && tr.metodo) === 'VOLUMEN' ? 'VOLUMEN' : 'CAJAS') : 'NINGUNO';
    const gasto = metodo === 'NINGUNO' ? 0 : gastoIn;
    const r = lineas.map(l => {
      const fac = Catalogo.factor(l.p, l.presentacion);
      const cant = n0(l.cantidad);
      const unidades = red(cant * fac, 3);
      const costoPres = n0(l.costoPres);
      const subtotal = red(cant * costoPres, 2);
      const upc = n0(l.p.unidades_por_caja);
      const cajas = upc > 1 ? red(unidades / upc, 4) : red(cant, 4);
      const vc = volumenCaja(l.p);
      const vol = vc ? red(cajas * vc, 6) : 0;
      return Object.assign({}, l, { fac: fac, cant: cant, unidades: unidades, costoPres: costoPres, subtotal: subtotal, cajas: cajas, vol: vol, transporte: 0, costoFinal: 0 });
    });
    const peso = x => metodo === 'CAJAS' ? x.cajas : metodo === 'VOLUMEN' ? x.vol : 0;
    const totalPeso = r.reduce((s, x) => s + peso(x), 0);
    const faltanMedidas = metodo === 'VOLUMEN' ? r.filter(x => x.cant > 0 && !x.vol).map(x => x.p) : [];
    if (gasto > 0 && totalPeso > 0) {
      let ultimo = -1;
      r.forEach((x, i) => { if (peso(x) > 0) ultimo = i; });
      let resto = gasto;
      r.forEach((x, i) => {
        if (peso(x) <= 0) return;
        x.transporte = i === ultimo ? red(resto, 2) : red(gasto * peso(x) / totalPeso, 2);
        resto = red(resto - x.transporte, 2);
      });
    }
    r.forEach(x => { x.costoFinal = x.unidades > 0 ? red((x.subtotal + x.transporte) / x.unidades, 4) : 0; });
    const subtotal = red(r.reduce((s, x) => s + x.subtotal, 0), 2);
    return { lineas: r, metodo: metodo, gasto: gasto, subtotal: subtotal, totalPeso: totalPeso, faltanMedidas: faltanMedidas, total: red(subtotal + gasto, 2) };
  }

  /** Precio de adquisición aproximado después de la compra (el servidor lo calcula de verdad al sincronizar). */
  function costoPonderado(stock, costo, unidades, costoNuevo) {
    const base = Math.max(Number(stock) || 0, 0);
    return base > 0 && costo > 0 ? (base * costo + unidades * costoNuevo) / (base + unidades) : costoNuevo;
  }

  /**
   * Arma los registros de una compra (no guarda).
   * op: { suc, proveedor (fila o null), fecha (ISO), nroDoc, tipoPago, vence ('AAAA-MM-DD'), observacion, calc, enDeuda, origen }
   */
  async function registrosCompra(op) {
    const suc = op.suc;
    const id = U.uuid();
    const numero = await Datos.numero('CMP', suc.id);
    const total = red(op.calc.subtotal + (op.enDeuda ? op.calc.gasto : 0), 2);
    const ahora = U.ahoraISO();
    const previos = [], cuerpo = [], despues = [];
    cuerpo.push({ tabla: 'COMPRAS', fila: { id: id, numero: numero, empresa_id: suc.empresa_id, sucursal_id: suc.id, proveedor_id: op.proveedor ? op.proveedor.id : '',
      fecha: op.fecha, nro_doc_proveedor: op.nroDoc || '', tipo_pago: op.tipoPago, fecha_vencimiento: op.tipoPago === 'CREDITO' ? op.vence : '',
      subtotal: op.calc.subtotal, gasto_transporte: op.calc.gasto, metodo_prorrateo: op.calc.metodo, total: total,
      observacion: op.observacion || '', estado: 'ACTIVO' } });
    const psSuc = new Map((await Datos.listar('PRODUCTOS_SUCURSAL', x => mismo(x.sucursal_id, suc.id))).map(x => [String(x.producto_id), x]));
    const pp = op.proveedor ? new Map((await Datos.listar('PROVEEDOR_PRODUCTOS', x => mismo(x.proveedor_id, op.proveedor.id))).map(x => [String(x.producto_id), x])) : new Map();
    const vistos = new Set();
    const obs = (op.origen === 'IMPORTACION' ? 'Importación · ' : '') + (op.proveedor ? op.proveedor.razon_social : 'Compra sin proveedor');
    op.calc.lineas.forEach(x => {
      if (!(x.unidades > 0)) return;
      const detId = U.uuid();
      cuerpo.push({ tabla: 'COMPRAS_DETALLE', fila: { id: detId, compra_id: id, producto_id: x.p.id, presentacion: x.presentacion, cantidad: x.cant,
        factor: x.fac, cantidad_unidades: x.unidades, costo_presentacion: x.costoPres, subtotal: x.subtotal, cajas_equivalentes: x.cajas,
        volumen_m3: x.vol, transporte_asignado: x.transporte, costo_final_unidad: x.costoFinal } });
      cuerpo.push({ tabla: 'MOVIMIENTOS', fila: { id: U.uuid(), fecha: ahora, empresa_id: suc.empresa_id, sucursal_id: suc.id, producto_id: x.p.id,
        tipo: 'COMPRA', cantidad: x.unidades, costo_unitario: x.costoFinal > 0 ? x.costoFinal : '', precio_unitario: '', documento_tipo: 'COMPRA',
        documento_id: id, documento_numero: numero, detalle_id: detId, anula_movimiento_id: '', observacion: obs } });
      const pid = String(x.p.id);
      if (vistos.has(pid)) return;
      vistos.add(pid);
      const ps = psSuc.get(pid);
      // Si el producto no estaba asignado a la sucursal, se asigna (antes de la compra)
      if (!ps) previos.push({ tabla: 'PRODUCTOS_SUCURSAL', fila: { id: U.uuid(), empresa_id: suc.empresa_id, sucursal_id: suc.id, producto_id: x.p.id,
        ubicacion: '', stock_minimo: '', producto_especial: 'NO', estado: 'ACTIVO' } });
      else if (ps.estado === 'INACTIVO') previos.push({ tabla: 'PRODUCTOS_SUCURSAL', fila: { id: ps.id, estado: 'ACTIVO', _origen: 'COMPRA', _motivo: 'Compra ' + numero } });
      if (op.proveedor) {
        const e = pp.get(pid);
        const costoU = x.fac > 0 ? red(x.costoPres / x.fac, 4) : 0;
        const datos = { ultima_compra_en: op.fecha, estado: 'ACTIVO' };
        if (costoU > 0) datos.ultimo_costo = costoU;
        despues.push({ tabla: 'PROVEEDOR_PRODUCTOS', fila: e ? Object.assign({ id: e.id }, datos)
          : Object.assign({ id: U.uuid(), proveedor_id: op.proveedor.id, producto_id: x.p.id, codigo_proveedor: '', ultimo_costo: '' }, datos) });
      }
    });
    return { regs: previos.concat(cuerpo, despues), id: id, numero: numero, total: total };
  }

  /** Movimientos que revierten (ANULACION) los movimientos de un documento. */
  async function movimientosAnulacion(docId, motivo) {
    const todos = await Datos.listar('MOVIMIENTOS', m => mismo(m.documento_id, docId));
    const yaAnulados = new Set(todos.filter(m => m.tipo === 'ANULACION').map(m => String(m.anula_movimiento_id)));
    const ahora = U.ahoraISO();
    return todos.filter(m => m.tipo !== 'ANULACION' && !yaAnulados.has(String(m.id))).map(m => ({ tabla: 'MOVIMIENTOS', fila: {
      id: U.uuid(), fecha: ahora, empresa_id: m.empresa_id, sucursal_id: m.sucursal_id, producto_id: m.producto_id, tipo: 'ANULACION',
      cantidad: red(-Number(m.cantidad), 3), costo_unitario: m.costo_unitario == null ? '' : m.costo_unitario, precio_unitario: '',
      documento_tipo: m.documento_tipo, documento_id: docId, documento_numero: m.documento_numero, detalle_id: m.detalle_id,
      anula_movimiento_id: m.id, observacion: 'Anulación: ' + motivo } }));
  }

  // ============================================================
  //  PANTALLA: COMPRAS / INGRESOS
  // ============================================================
  const fCmp = { empresaId: '', sucursalId: '', proveedor: '', estado: 'ACTIVO', pago: '', buscar: '', desde: '', hasta: '', limite: 50 };

  App.pantalla('compras', {
    refrescar: true,
    async render(el) {
      const raiz = contenedor(el);
      const a = await alcance();
      vistaValida(fCmp, a, true);
      if (!a.sucursales.length) { raiz.innerHTML = '<div class="titulo"><div><h1>Compras / ingresos</h1></div></div>' + vacio('store', 'No tiene sucursales donde trabajar.'); return; }
      const sucs = sucursalesDe(fCmp, a);
      const ids = new Set(sucs.map(s => String(s.id)));
      const compras = (await Datos.listar('COMPRAS', x => ids.has(String(x.sucursal_id)))).sort((x, y) => String(y.fecha).localeCompare(String(x.fecha)) || String(y.numero).localeCompare(String(x.numero)));
      const provs = await proveedoresDe(fCmp.empresaId, true);
      const nomProv = id => (provs.find(p => mismo(p.id, id)) || {}).razon_social || '';
      const pagado = await pagosPorCompra();
      const pend = await pendientesDe('COMPRAS');
      const nomSuc = id => (a.sucursales.find(s => mismo(s.id, id)) || {}).nombre || '';
      const mes = hoy().slice(0, 7);
      const delMes = compras.filter(x => !anulado(x) && String(x.fecha).slice(0, 7) === mes);
      const porPagar = compras.reduce((s, x) => s + Math.max(saldoDe(x, pagado), 0), 0);
      const vencidas = compras.filter(x => saldoDe(x, pagado) > 0.005 && x.fecha_vencimiento && diasHasta(x.fecha_vencimiento) < 0);

      raiz.innerHTML = '<div class="titulo"><div><h1>Compras / ingresos</h1><p>Mercadería que entra a la sucursal. El transporte se reparte por cajas o por volumen ' +
        'y el precio de adquisición se recalcula solo (promedio ponderado).</p></div>' +
        '<div class="acciones-fila"><button class="btn btn-borde" data-acc="exportar">' + ico('download') + 'Exportar Excel</button>' +
        '<button class="btn btn-principal" data-acc="nueva">' + icoX('mas') + 'Nueva compra</button></div></div>' +
        '<div class="tiles"><div class="tarjeta tile"><span>Compras de este mes</span><b class="cifra">' + delMes.length + '</b></div>' +
        '<div class="tarjeta tile"><span>Total del mes</span><b class="cifra chica">' + bs(delMes.reduce((s, x) => s + n0(x.subtotal) + n0(x.gasto_transporte), 0)) + '</b></div>' +
        '<a class="tarjeta tile" href="#/cuentas-pagar"><span>Por pagar (crédito)</span><b class="cifra chica' + (porPagar > 0 ? ' amarilla' : '') + '">' + bs(porPagar) + '</b></a>' +
        '<a class="tarjeta tile" href="#/cuentas-pagar"><span>Compras vencidas</span><b class="cifra' + (vencidas.length ? ' roja' : '') + '">' + vencidas.length + '</b></a></div>' +
        '<div class="filtros">' + selectorHtml(fCmp, a, { todas: true }) +
        '<div class="campo"><label for="cmBuscar">Buscar</label><input class="entrada" id="cmBuscar" value="' + esc(fCmp.buscar) + '" autocomplete="off" placeholder="Número, factura o proveedor"></div>' +
        '<div class="campo corto"><label for="cmProv">Proveedor</label>' + lista('cmProv', [['', 'Todos']].concat(provs.map(p => [p.id, p.razon_social])), fCmp.proveedor) + '</div>' +
        '<div class="campo corto"><label for="cmPago">Pago</label>' + lista('cmPago', [['', 'Todos'], ['CONTADO', 'Contado'], ['CREDITO', 'Crédito']], fCmp.pago) + '</div>' +
        '<div class="campo corto"><label for="cmEstado">Estado</label>' + lista('cmEstado', [['ACTIVO', 'Vigentes'], ['ANULADO', 'Anuladas'], ['TODOS', 'Todas']], fCmp.estado) + '</div>' +
        '<div class="campo corto"><label for="cmDesde">Desde</label><input class="entrada" type="date" id="cmDesde" value="' + esc(fCmp.desde) + '"></div>' +
        '<div class="campo corto"><label for="cmHasta">Hasta</label><input class="entrada" type="date" id="cmHasta" value="' + esc(fCmp.hasta) + '"></div></div>' +
        '<div id="cmLista"></div>';

      let vista = [];
      const pintar = () => {
        const b = norm(fCmp.buscar);
        vista = compras.filter(x => (fCmp.estado === 'TODOS' || (fCmp.estado === 'ANULADO') === anulado(x)) &&
          (!fCmp.proveedor || mismo(x.proveedor_id, fCmp.proveedor)) && (!fCmp.pago || x.tipo_pago === fCmp.pago) &&
          (!fCmp.desde || String(x.fecha).slice(0, 10) >= fCmp.desde) && (!fCmp.hasta || String(x.fecha).slice(0, 10) <= fCmp.hasta) &&
          (!b || norm([x.numero, x.nro_doc_proveedor, nomProv(x.proveedor_id), x.observacion].join(' ')).indexOf(b) >= 0));
        const cont = $('#cmLista', raiz);
        if (!compras.length) { cont.innerHTML = vacio('download', '<b>Todavía no hay compras.</b><br>Registre la mercadería que llega con <b>Nueva compra</b>.', '<button class="btn btn-principal" data-acc="nueva" style="margin-top:12px">' + icoX('mas') + 'Nueva compra</button>'); return; }
        if (!vista.length) { cont.innerHTML = vacio('search', 'Ninguna compra coincide.'); return; }
        const mostrar = vista.slice(0, fCmp.limite);
        cont.innerHTML = '<div class="tabla-env"><table class="tabla"><thead><tr><th>Número</th><th>Fecha</th><th>Proveedor</th>' + (sucs.length > 1 ? '<th>Sucursal</th>' : '') +
          '<th>Pago</th><th class="num">Mercadería</th><th class="num">Transporte</th><th class="num">Saldo</th><th>Estado</th></tr></thead><tbody>' +
          mostrar.map(x => {
            const saldo = saldoDe(x, pagado);
            const venc = x.tipo_pago === 'CREDITO' && saldo > 0.005 && x.fecha_vencimiento && diasHasta(x.fecha_vencimiento) < 0;
            return '<tr class="clic' + (anulado(x) ? ' inactivo' : '') + '" data-acc="ver" data-id="' + esc(x.id) + '"><td><b class="mono">' + esc(x.numero) + '</b>' + etiquetaEnvio(pend[x.id]) +
              (x.nro_doc_proveedor ? '<span class="sub">Factura ' + esc(x.nro_doc_proveedor) + '</span>' : '') + '</td>' +
              '<td>' + fechaCorta(x.fecha) + '</td><td>' + esc(nomProv(x.proveedor_id) || '—') + '</td>' + (sucs.length > 1 ? '<td>' + esc(nomSuc(x.sucursal_id)) + '</td>' : '') +
              '<td>' + (x.tipo_pago === 'CREDITO' ? '<span class="etiqueta amarilla">Crédito</span>' + (x.fecha_vencimiento ? '<span class="sub' + (venc ? ' txt-rojo' : '') + '">Vence ' + fechaCorta(x.fecha_vencimiento) + '</span>' : '') : 'Contado') + '</td>' +
              '<td class="num">' + bs(x.subtotal) + '</td><td class="num">' + (n0(x.gasto_transporte) ? bs(x.gasto_transporte) + '<span class="sub">' + (x.metodo_prorrateo === 'VOLUMEN' ? 'por volumen' : 'por cajas') + '</span>' : '—') + '</td>' +
              '<td class="num">' + (x.tipo_pago === 'CREDITO' && !anulado(x) ? (saldo > 0.005 ? '<b class="' + (venc ? 'txt-rojo' : 'txt-amarillo') + '">' + bs(saldo) + '</b>' : '<span class="etiqueta verde">Pagada</span>') : '—') + '</td>' +
              '<td>' + etiquetaEstadoDoc(x) + '</td></tr>';
          }).join('') + '</tbody></table></div>' +
          (vista.length > mostrar.length ? '<div class="mas-centro"><button class="btn btn-borde" data-acc="mas">Mostrar más (' + (vista.length - mostrar.length) + ')</button></div>'
            : '<p class="nota" style="margin-top:10px">' + vista.length + ' compra(s) · mercadería ' + bs(vista.filter(x => !anulado(x)).reduce((s, x) => s + n0(x.subtotal), 0)) + '.</p>');
      };
      pintar();
      const iB = $('#cmBuscar', raiz);
      iB.oninput = () => { fCmp.buscar = iB.value; fCmp.limite = 50; pintar(); };
      [['cmProv', 'proveedor'], ['cmPago', 'pago'], ['cmEstado', 'estado'], ['cmDesde', 'desde'], ['cmHasta', 'hasta']].forEach(([id, k]) => {
        $('#' + id, raiz).onchange = e => { fCmp[k] = e.target.value; fCmp.limite = 50; pintar(); };
      });
      enlazarSelector(raiz, fCmp, () => App.refrescarContexto());
      raiz.onclick = ev => {
        const b = ev.target.closest('[data-acc]');
        if (!b) return;
        switch (b.dataset.acc) {
          case 'nueva': return formCompra({ sucursalId: fCmp.sucursalId });
          case 'ver': { const x = compras.find(y => mismo(y.id, b.dataset.id)); return x ? verCompra(x) : null; }
          case 'mas': fCmp.limite += 100; return pintar();
          case 'exportar': return exportarCompras(vista, nomProv, nomSuc, pagado);
        }
      };
    }
  });

  /** Formulario de compra. op: { sucursalId, productos: [p] } */
  async function formCompra(op) {
    op = op || {};
    const a = await alcance();
    if (!a.sucursales.length) { App.aviso('No tiene sucursales donde registrar compras.', 'error'); return; }
    let suc = a.sucursales.find(s => mismo(s.id, op.sucursalId)) ||
      (App.contexto.sucursal && a.sucursales.find(s => mismo(s.id, App.contexto.sucursal.id))) || a.sucursales[0];
    const diasCredito = parseInt(await Datos.config('dias_credito_compra', '30'), 10) || 30;
    const est = { lineas: [], stock: new Map(), ps: new Map(), pp: new Map(), provs: [] };
    const cargarSucursal = async () => {
      est.stock = await Catalogo.stocks(suc.id);
      est.ps = new Map((await Datos.listar('PRODUCTOS_SUCURSAL', x => mismo(x.sucursal_id, suc.id))).map(x => [String(x.producto_id), x]));
      est.provs = await proveedoresDe(suc.empresa_id);
    };
    await cargarSucursal();
    const nombreSuc = s => (esAG() && a.empresas.length > 1 ? ((a.empresas.find(e => mismo(e.id, s.empresa_id)) || {}).nombre || '') + ' · ' : '') + s.nombre;
    const opcProv = () => [['', '— Sin proveedor —']].concat(est.provs.map(p => [p.id, p.razon_social]));

    const f = modalAncho({
      titulo: 'Nueva compra / ingreso',
      cerrable: false,
      html: '<div class="form-2">' +
        '<div class="seccion-form">Datos de la compra</div>' +
        campoLista('cSuc', 'Sucursal que recibe', a.sucursales.map(s => [s.id, nombreSuc(s)]), suc.id, { attrs: a.sucursales.length > 1 ? '' : ' disabled' }) +
        '<div class="campo"><label for="cProv">Proveedor</label><div class="con-mas">' + lista('cProv', opcProv(), '') +
        '<button type="button" class="btn btn-borde" id="cNuevoProv" title="Nuevo proveedor" aria-label="Nuevo proveedor">' + icoX('mas') + '</button></div></div>' +
        campo('cFecha', 'Fecha de la compra', hoy(), { tipo: 'date', req: true }) +
        campo('cDoc', 'N.º de factura o nota del proveedor', '', { attrs: ' maxlength="30" autocomplete="off"' }) +
        campoLista('cTipo', 'Pago', [['CONTADO', 'Contado (ya pagado)'], ['CREDITO', 'Crédito (queda como deuda)']], 'CONTADO') +
        campo('cVence', 'Vence el', sumarDias(hoy(), diasCredito), { tipo: 'date', idCampo: 'cVenceCampo', ayuda: 'Fecha límite para pagar al proveedor.' }) +
        campo('cObs', 'Observación', '', { clase: 'todo', attrs: ' maxlength="200"' }) +
        '<div class="seccion-form">Productos</div>' +
        '<div class="todo" id="cBuscador"></div>' +
        '<div class="todo" id="cLineas"></div>' +
        '<div class="seccion-form">Transporte</div>' +
        campoNum('cGasto', 'Gasto de transporte (Bs)', '', { ph: '0', ayuda: 'Flete, pasajes, carguío… Se suma al costo de los productos.' }) +
        campoLista('cMetodo', 'Repartir el transporte', [['CAJAS', 'Por cantidad de cajas'], ['VOLUMEN', 'Por volumen (m³ de las cajas)']], 'CAJAS',
          { ayuda: 'Por volumen usa las medidas de la caja del catálogo.' }) +
        '<div class="campo todo"><label class="check"><input type="checkbox" id="cEnDeuda"><span><b>El proveedor cobra el transporte</b>' +
        '<small>Marque si el flete viene en la misma factura: se suma al monto a pagar al proveedor.</small></span></label></div>' +
        '<div class="todo" id="cTotales"></div>' +
        '</div><div class="f-msg"></div>',
      botones: [{ t: 'Cancelar', accion: async () => !est.lineas.length || await App.confirmar('Salir sin guardar', 'Se perderán los productos cargados en esta compra.', 'Salir', 'btn-peligro') },
        { t: 'Guardar compra', clase: 'btn-principal', accion: m => guardar(m) }]
    });

    const transporte = () => ({ gasto: num($('#cGasto', f).value) || 0, metodo: $('#cMetodo', f).value });
    const costoSugerido = p => {
      const x = est.pp.get(String(p.id));
      if (x && n0(x.ultimo_costo) > 0) return n0(x.ultimo_costo);
      const ps = est.ps.get(String(p.id));
      return ps && n0(ps.costo_promedio) > 0 ? red(n0(ps.costo_promedio), 4) : 0;
    };
    const cargarProveedorProductos = async () => {
      const pid = $('#cProv', f).value;
      est.pp = pid ? new Map((await Datos.listar('PROVEEDOR_PRODUCTOS', x => mismo(x.proveedor_id, pid) && activo(x))).map(x => [String(x.producto_id), x])) : new Map();
    };

    const pintarLineas = () => {
      const cont = $('#cLineas', f);
      if (!est.lineas.length) {
        cont.innerHTML = '<p class="vacio" style="padding:14px">Agregue los productos que llegaron: escriba el nombre o escanee el código.</p>';
        recalcular();
        return;
      }
      cont.innerHTML = '<div class="tabla-env"><table class="tabla compacta lineas"><thead><tr><th>Producto</th><th>Presentación</th><th class="num">Cantidad</th>' +
        '<th class="num">Costo por presentación</th><th class="num">Subtotal</th><th class="num">Transporte</th><th class="num">Costo final c/u</th><th></th></tr></thead><tbody>' +
        est.lineas.map((l, i) => '<tr data-i="' + i + '"><td class="prod"><b>' + esc(l.p.nombre) + '</b><span class="sub">' + esc(l.p.codigo) +
          (est.ps.get(String(l.p.id)) && est.ps.get(String(l.p.id)).estado !== 'INACTIVO' ? '' : ' · <span class="txt-amarillo">se asignará a la sucursal</span>') + '</span><span class="sub" data-info></span></td>' +
          '<td>' + lista('', opcionesPres(l.p), l.presentacion, ' data-campo="presentacion"') + '</td>' +
          '<td class="num"><input class="entrada num-in" data-campo="cantidad" inputmode="decimal" value="' + esc(fmtNum(l.cantidad)) + '"></td>' +
          '<td class="num"><div class="con-sufijo"><span>Bs</span><input class="entrada num-in" data-campo="costoPres" inputmode="decimal" value="' + esc(fmtNum(l.costoPres)) + '"></div><span class="sub" data-cu></span></td>' +
          '<td class="num" data-sub></td><td class="num" data-tr></td><td class="num" data-cf></td>' +
          '<td class="acc"><button type="button" class="btn btn-icono" data-quitar="' + i + '" title="Quitar" aria-label="Quitar">' + icoX('quitar') + '</button></td></tr>').join('') +
        '</tbody></table></div>';
      recalcular();
    };

    const recalcular = () => {
      const calc = calcularCompra(est.lineas, transporte());
      calc.lineas.forEach((x, i) => {
        const tr = $('tr[data-i="' + i + '"]', f);
        if (!tr) return;
        const st = est.stock.get(String(x.p.id)) || 0;
        const ps = est.ps.get(String(x.p.id));
        const c0 = ps ? n0(ps.costo_promedio) : 0;
        const nuevo = x.unidades > 0 && x.costoFinal > 0 ? costoPonderado(st, c0, x.unidades, x.costoFinal) : 0;
        $('[data-info]', tr).innerHTML = x.unidades > 0 ? 'Entran <b>' + fmt(x.unidades) + ' ' + esc(textoUnid(x.p)) + '</b> · stock ' + fmt(st) + ' → ' + fmt(st + x.unidades) +
          (calc.metodo !== 'NINGUNO' ? ' · ' + (calc.metodo === 'VOLUMEN' ? (x.vol ? fmt(x.vol, 4) + ' m³' : '<span class="txt-rojo">sin medidas de caja</span>') : fmt(x.cajas, 2) + ' caja(s)') : '') +
          (nuevo ? '<br>P. adquisición ' + (c0 ? bs(red(c0, 2)) : '—') + ' → <b>' + bs(red(nuevo, 2)) + '</b> aprox.' : '') : '';
        $('[data-cu]', tr).textContent = x.fac > 1 && x.costoPres > 0 ? '= ' + bs(red(x.costoPres / x.fac, 4)) + ' c/u' : '';
        $('[data-sub]', tr).textContent = bs(x.subtotal);
        $('[data-tr]', tr).textContent = x.transporte ? bs(x.transporte) : '—';
        $('[data-cf]', tr).innerHTML = x.costoFinal ? '<b>' + bs(x.costoFinal) + '</b>' : '—';
      });
      const enDeuda = $('#cEnDeuda', f).checked;
      const credito = $('#cTipo', f).value === 'CREDITO';
      const unidades = calc.lineas.reduce((s, x) => s + x.unidades, 0);
      $('#cTotales', f).innerHTML = '<div class="totales">' +
        '<div><span>Productos</span><b>' + calc.lineas.length + ' · ' + fmt(unidades) + ' unidades</b></div>' +
        '<div><span>Mercadería</span><b>' + bs(calc.subtotal) + '</b></div>' +
        '<div><span>Transporte</span><b>' + bs(calc.gasto) + '</b></div>' +
        '<div><span>Costo total que entra al inventario</span><b>' + bs(calc.total) + '</b></div>' +
        '<div class="grande"><span>' + (credito ? 'Queda como deuda con el proveedor' : 'Pagado al proveedor') + '</span><b>' + bs(red(calc.subtotal + (enDeuda ? calc.gasto : 0), 2)) + '</b></div>' +
        (calc.faltanMedidas.length ? '<div class="msg msg-error">Para repartir por volumen faltan las medidas de la caja de: ' + calc.faltanMedidas.map(p => esc(p.codigo)).join(', ') +
          '. Cárguelas en el Catálogo general o reparta por cajas.</div>' : '') + '</div>';
      return calc;
    };

    const ponerVence = () => {
      const credito = $('#cTipo', f).value === 'CREDITO';
      $('#cVenceCampo', f).classList.toggle('oculto', !credito);
      $('#cEnDeuda', f).closest('.campo').classList.toggle('oculto', !(num($('#cGasto', f).value) > 0));
    };
    const elegir = (p, presentacion) => {
      const pres = presentacion || 'UNIDAD';
      const ya = est.lineas.find(l => mismo(l.p.id, p.id) && l.presentacion === pres);
      if (ya) { ya.cantidad = n0(ya.cantidad) + 1; App.aviso(p.nombre + ': ' + fmt(ya.cantidad) + ' ' + NOMBRE_PRES[pres] + '(s)', 'ok', 2); }
      else est.lineas.push({ p: p, presentacion: pres, cantidad: 1, costoPres: red(costoSugerido(p) * Catalogo.factor(p, pres), 4) || '', auto: true });
      pintarLineas();
      const fila = $('tr[data-i="' + (ya ? est.lineas.indexOf(ya) : est.lineas.length - 1) + '"] [data-campo="cantidad"]', f);
      if (fila && !ya) { fila.focus(); fila.select(); }
    };
    const bus = buscadorProductos($('#cBuscador', f), { sucursalId: () => suc.id, alElegir: elegir, etiqueta: 'Agregar producto' });

    // Eventos de las líneas
    $('#cLineas', f).addEventListener('input', ev => {
      const tr = ev.target.closest('tr[data-i]');
      if (!tr) return;
      const l = est.lineas[Number(tr.dataset.i)];
      const campoL = ev.target.dataset.campo;
      if (campoL === 'cantidad') l.cantidad = ev.target.value;
      if (campoL === 'costoPres') { l.costoPres = ev.target.value; l.auto = false; }
      recalcular();
    });
    $('#cLineas', f).addEventListener('change', ev => {
      const tr = ev.target.closest('tr[data-i]');
      if (!tr || ev.target.dataset.campo !== 'presentacion') return;
      const l = est.lineas[Number(tr.dataset.i)];
      const antes = Catalogo.factor(l.p, l.presentacion);
      l.presentacion = ev.target.value;
      // Si el costo lo puso el sistema, se ajusta a la nueva presentación
      if (l.auto && n0(l.costoPres) > 0) l.costoPres = red(n0(l.costoPres) / antes * Catalogo.factor(l.p, l.presentacion), 4);
      pintarLineas();
    });
    $('#cLineas', f).addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && ev.target.matches('input')) { ev.preventDefault(); bus.foco(); }
    });
    $('#cLineas', f).addEventListener('click', ev => {
      const b = ev.target.closest('[data-quitar]');
      if (!b) return;
      est.lineas.splice(Number(b.dataset.quitar), 1);
      pintarLineas();
    });
    ['cGasto', 'cMetodo', 'cEnDeuda', 'cTipo'].forEach(id => { $('#' + id, f).addEventListener('input', () => { ponerVence(); recalcular(); }); $('#' + id, f).addEventListener('change', () => { ponerVence(); recalcular(); }); });
    $('#cSuc', f).onchange = async e => {
      const nueva = a.sucursales.find(s => mismo(s.id, e.target.value));
      const cambiaEmpresa = !mismo(nueva.empresa_id, suc.empresa_id);
      suc = nueva;
      await cargarSucursal();
      if (cambiaEmpresa) { $('#cProv', f).innerHTML = opcProv().map(o => '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>').join(''); await cargarProveedorProductos(); }
      pintarLineas();
    };
    $('#cProv', f).onchange = async () => {
      await cargarProveedorProductos();
      const pr = est.provs.find(p => mismo(p.id, $('#cProv', f).value));
      if (pr && n0(pr.plazo_pago_dias) > 0) $('#cVence', f).value = sumarDias($('#cFecha', f).value || hoy(), pr.plazo_pago_dias);
      // Costos sugeridos de este proveedor para las líneas que no se tocaron
      est.lineas.forEach(l => { if (l.auto) { const c0 = costoSugerido(l.p); if (c0) l.costoPres = red(c0 * Catalogo.factor(l.p, l.presentacion), 4); } });
      pintarLineas();
    };
    $('#cFecha', f).onchange = () => {
      const pr = est.provs.find(p => mismo(p.id, $('#cProv', f).value));
      $('#cVence', f).value = sumarDias($('#cFecha', f).value || hoy(), pr && n0(pr.plazo_pago_dias) > 0 ? pr.plazo_pago_dias : diasCredito);
    };
    $('#cNuevoProv', f).onclick = async () => {
      const id = await formProveedor(null, suc.empresa_id);
      if (!id) return;
      est.provs = await proveedoresDe(suc.empresa_id);
      $('#cProv', f).innerHTML = opcProv().map(o => '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>').join('');
      $('#cProv', f).value = id;
      $('#cProv', f).dispatchEvent(new Event('change'));
    };
    ponerVence();
    for (const p of (op.productos || [])) elegir(p, 'UNIDAD');
    pintarLineas();

    async function guardar(m) {
      try {
        const calc = recalcular();
        if (!calc.lineas.length) return mensaje(m, 'Agregue al menos un producto.');
        for (let i = 0; i < calc.lineas.length; i++) {
          const x = calc.lineas[i], l = est.lineas[i];
          if (num(l.cantidad) === null || !(x.cant > 0)) return mensaje(m, x.p.nombre + ': escriba una cantidad mayor que 0.');
          if (txt(l.costoPres) && (num(l.costoPres) === null || num(l.costoPres) < 0)) return mensaje(m, x.p.nombre + ': el costo debe ser un número (ej. 12,50).');
        }
        const gasto = leerNumero(m, 'cGasto', 'el gasto de transporte');
        if (calc.faltanMedidas.length) return mensaje(m, 'Para repartir por volumen faltan las medidas de caja de: ' + calc.faltanMedidas.map(p => p.codigo).join(', ') + '.');
        if (gasto > 0 && !(calc.totalPeso > 0)) return mensaje(m, 'No se pudo repartir el transporte. Revise las cantidades.');
        const fechaD = $('#cFecha', m).value;
        if (!fechaD) return mensaje(m, 'Elija la fecha de la compra.');
        if (fechaD > hoy()) return mensaje(m, 'La fecha de la compra no puede ser futura.');
        const tipoPago = $('#cTipo', m).value;
        const prov = est.provs.find(p => mismo(p.id, $('#cProv', m).value)) || null;
        if (tipoPago === 'CREDITO' && !prov) return mensaje(m, 'Una compra a crédito necesita un proveedor.');
        const vence = $('#cVence', m).value;
        if (tipoPago === 'CREDITO' && (!vence || vence < fechaD)) return mensaje(m, 'La fecha de vencimiento debe ser igual o posterior a la fecha de la compra.');
        const sinCosto = calc.lineas.filter(x => !(x.costoPres > 0));
        if (sinCosto.length && !(await App.confirmar('Productos sin costo', sinCosto.length + ' producto(s) no tienen costo (' + sinCosto.slice(0, 4).map(x => x.p.codigo).join(', ') +
          (sinCosto.length > 4 ? '…' : '') + '). Su precio de adquisición no cambiará. ¿Guardar igual?', 'Guardar'))) return false;
        const enDeuda = gasto > 0 && $('#cEnDeuda', m).checked;
        const unidades = calc.lineas.reduce((s, x) => s + x.unidades, 0);
        if (!(await App.confirmar('Guardar compra', 'Entran ' + fmt(unidades) + ' unidades de ' + calc.lineas.length + ' producto(s) a ' + suc.nombre +
          '. Costo total ' + bs(calc.total) + (tipoPago === 'CREDITO' ? '. Deuda con ' + prov.razon_social + ': ' + bs(red(calc.subtotal + (enDeuda ? calc.gasto : 0), 2)) : '') + '.', 'Guardar'))) return false;
        const r = await registrosCompra({ suc: suc, proveedor: prov, fecha: fechaISO(fechaD), nroDoc: txt($('#cDoc', m).value), tipoPago: tipoPago,
          vence: vence, observacion: txt($('#cObs', m).value), calc: calc, enDeuda: enDeuda, origen: 'MANUAL' });
        await Datos.guardarVarios(r.regs);
        App.aviso('Compra ' + r.numero + ' guardada. El precio de adquisición se recalcula al sincronizar.', 'ok', 6);
        await App.refrescarContexto();
        return true;
      } catch (e) {
        console.error(e);
        return mensaje(m, e.message || String(e));
      }
    }
  }

  async function verCompra(x) {
    const c = await Catalogo.cargar();
    const det = await Datos.listar('COMPRAS_DETALLE', d => mismo(d.compra_id, x.id));
    const pagos = (await Datos.listar('PAGOS_PROVEEDORES', p => mismo(p.compra_id, x.id))).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    const vigentes = pagos.filter(p => !anulado(p));
    const pagado = red(vigentes.reduce((s, p) => s + n0(p.monto), 0), 2);
    const saldo = x.tipo_pago === 'CREDITO' && !anulado(x) ? red(n0(x.total) - pagado, 2) : 0;
    const prov = x.proveedor_id ? await Datos.obtener('PROVEEDORES', x.proveedor_id) : null;
    const suc = await Datos.obtener('SUCURSALES', x.sucursal_id) || {};
    const nomUsu = await nombresUsuarios();
    const html = (anulado(x) ? '<div class="msg msg-error"><b>Anulada</b> el ' + fechaCorta(x.anulado_en) + ' por ' + esc(nomUsu(x.anulado_por)) + ': ' + esc(x.motivo_anulacion) + '</div>' : '') +
      '<div class="rejilla" style="margin-bottom:14px"><div class="tarjeta">' +
      '<div class="dato"><span>Número</span><b class="mono">' + esc(x.numero) + '</b></div>' +
      '<div class="dato"><span>Fecha</span><b>' + fechaCorta(x.fecha) + '</b></div>' +
      '<div class="dato"><span>Sucursal</span><b>' + esc(suc.nombre || '') + '</b></div>' +
      '<div class="dato"><span>Proveedor</span><b>' + esc(prov ? prov.razon_social : '—') + '</b></div>' +
      (x.nro_doc_proveedor ? '<div class="dato"><span>Factura / nota</span><b>' + esc(x.nro_doc_proveedor) + '</b></div>' : '') +
      '<div class="dato"><span>Registró</span><b>' + esc(nomUsu(x.creado_por)) + '</b></div></div>' +
      '<div class="tarjeta"><div class="dato"><span>Mercadería</span><b>' + bs(x.subtotal) + '</b></div>' +
      '<div class="dato"><span>Transporte</span><b>' + (n0(x.gasto_transporte) ? bs(x.gasto_transporte) + ' (' + (x.metodo_prorrateo === 'VOLUMEN' ? 'por volumen' : 'por cajas') + ')' : '—') + '</b></div>' +
      '<div class="dato"><span>Pago</span><b>' + (x.tipo_pago === 'CREDITO' ? 'Crédito · vence ' + fechaCorta(x.fecha_vencimiento) : 'Contado') + '</b></div>' +
      '<div class="dato"><span>Total a pagar al proveedor</span><b>' + bs(x.total) + '</b></div>' +
      (x.tipo_pago === 'CREDITO' ? '<div class="dato"><span>Pagado</span><b>' + bs(pagado) + '</b></div><div class="dato"><span>Saldo</span><b class="' + (saldo > 0.005 ? 'txt-rojo' : 'txt-verde') + '">' + bs(saldo) + '</b></div>' : '') +
      '</div></div>' +
      (x.observacion ? '<p class="nota">' + esc(x.observacion) + '</p>' : '') +
      '<div class="tabla-env"><table class="tabla compacta"><thead><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Costo</th><th class="num">Subtotal</th>' +
      '<th class="num">Transporte</th><th class="num">Costo final c/u</th></tr></thead><tbody>' +
      det.map(d => {
        const p = c.porId.get(String(d.producto_id)) || { nombre: '(producto)', codigo: '' };
        return '<tr><td><b>' + esc(p.nombre) + '</b><span class="sub">' + esc(p.codigo) + '</span></td>' +
          '<td class="num">' + fmt(d.cantidad) + ' ' + esc(d.presentacion === 'UNIDAD' ? textoUnid(p) : NOMBRE_PRES[d.presentacion] + '(s)') +
          (n0(d.factor) > 1 ? '<span class="sub">= ' + fmt(d.cantidad_unidades) + ' ' + esc(textoUnid(p)) + '</span>' : '') + '</td>' +
          '<td class="num">' + bs(d.costo_presentacion) + '</td><td class="num">' + bs(d.subtotal) + '</td>' +
          '<td class="num">' + (n0(d.transporte_asignado) ? bs(d.transporte_asignado) : '—') + '</td><td class="num"><b>' + bs(d.costo_final_unidad) + '</b></td></tr>';
      }).join('') + '</tbody></table></div>' +
      (pagos.length ? '<h3 class="sub-titulo">Pagos</h3><div class="tabla-env"><table class="tabla compacta"><thead><tr><th>Número</th><th>Fecha</th><th>Método</th><th class="num">Monto</th><th>Estado</th></tr></thead><tbody>' +
        pagos.map(p => '<tr' + (anulado(p) ? ' class="inactivo"' : '') + '><td class="mono">' + esc(p.numero) + '</td><td>' + fechaCorta(p.fecha) + '</td><td>' + esc(p.metodo_pago) +
          (p.referencia ? '<span class="sub">' + esc(p.referencia) + '</span>' : '') + '</td><td class="num">' + bs(p.monto) + '</td><td>' + etiquetaEstadoDoc(p) + '</td></tr>').join('') + '</tbody></table></div>' : '');
    const botones = [];
    if (!anulado(x) && saldo > 0.005) botones.push({ t: 'Registrar pago', clase: 'btn-azul', accion: () => { formPago({ compras: [x] }); } });
    if (!anulado(x)) botones.push({ t: 'Anular compra', clase: 'btn-peligro', accion: () => anularCompra(x, vigentes, det) });
    botones.push({ t: 'Cerrar', clase: 'btn-principal' });
    modalAncho({ titulo: 'Compra ' + x.numero, html: html, botones: botones });
  }

  async function anularCompra(x, pagosVigentes, det) {
    if (pagosVigentes.length) {
      App.modal({ titulo: 'No se puede anular', html: '<p style="margin:0;line-height:1.5">La compra tiene ' + pagosVigentes.length + ' pago(s) registrados. Anule primero los pagos en <a href="#/cuentas-pagar">Cuentas por pagar</a>.</p>' });
      return true;
    }
    const st = await Catalogo.stocks(x.sucursal_id);
    const c = await Catalogo.cargar();
    const negativos = det.filter(d => (st.get(String(d.producto_id)) || 0) - n0(d.cantidad_unidades) < 0).map(d => (c.porId.get(String(d.producto_id)) || {}).codigo);
    const motivo = await pedirMotivo('Anular compra ' + x.numero, 'Se quita del stock lo que entró con esta compra y se corrige el precio de adquisición. No se borra nada.' +
      (negativos.length ? '<br><b class="txt-rojo">Atención:</b> quedarán con stock negativo: ' + esc(negativos.join(', ')) + '.' : ''));
    if (!motivo) return false;
    const regs = [{ tabla: 'COMPRAS', fila: { id: x.id, estado: 'ANULADO', motivo_anulacion: motivo, anulado_por: Sesion.actual.usuario_id, anulado_en: U.ahoraISO() } }]
      .concat(await movimientosAnulacion(x.id, motivo));
    await Datos.guardarVarios(regs);
    App.aviso('Compra ' + x.numero + ' anulada', 'ok');
    await App.refrescarContexto();
    return true;
  }

  function exportarCompras(vista, nomProv, nomSuc, pagado) {
    if (!vista.length) { App.aviso('No hay compras para exportar.', 'info'); return; }
    Excel.descargar('Compras_' + hoy() + '.xlsx', [{
      nombre: 'Compras', titulo: 'Compras / ingresos', subtitulo: fechaCorta(hoy()) + ' · ' + vista.length + ' compra(s) (con los filtros de la pantalla)',
      columnas: [{ t: 'Número', w: 22 }, { t: 'Fecha', w: 11 }, { t: 'Sucursal', w: 16 }, { t: 'Proveedor', w: 26 }, { t: 'Factura / nota', w: 14 },
        { t: 'Pago', w: 9 }, { t: 'Vence', w: 11 }, { t: 'Mercadería', w: 13, tipo: 'bs' }, { t: 'Transporte', w: 12, tipo: 'bs' }, { t: 'Reparto', w: 10 },
        { t: 'A pagar al proveedor', w: 14, tipo: 'bs' }, { t: 'Saldo', w: 12, tipo: 'bs' }, { t: 'Estado', w: 10 }, { t: 'Motivo anulación', w: 26 }],
      filas: vista.map(x => [txt(x.numero), fechaCorta(x.fecha), nomSuc(x.sucursal_id), nomProv(x.proveedor_id), txt(x.nro_doc_proveedor), x.tipo_pago,
        x.fecha_vencimiento ? fechaCorta(x.fecha_vencimiento) : '', n0(x.subtotal), n0(x.gasto_transporte), x.metodo_prorrateo === 'NINGUNO' ? '' : txt(x.metodo_prorrateo),
        n0(x.total), saldoDe(x, pagado) || '', anulado(x) ? 'ANULADA' : 'VIGENTE', txt(x.motivo_anulacion)]),
      totales: ['TOTAL', null, null, null, null, null, null, red(vista.filter(x => !anulado(x)).reduce((s, x) => s + n0(x.subtotal), 0), 2),
        red(vista.filter(x => !anulado(x)).reduce((s, x) => s + n0(x.gasto_transporte), 0), 2), null, null,
        red(vista.reduce((s, x) => s + Math.max(saldoDe(x, pagado), 0), 0), 2), null, null]
    }]);
  }

  // ============================================================
  //  PANTALLA: CUENTAS POR PAGAR
  // ============================================================
  const fCxp = { empresaId: '', sucursalId: '', proveedor: '', vista: 'PENDIENTES', limite: 50 };

  App.pantalla('cuentas-pagar', {
    refrescar: true,
    async render(el) {
      const raiz = contenedor(el);
      const a = await alcance();
      vistaValida(fCxp, a, true);
      if (!a.sucursales.length) { raiz.innerHTML = '<div class="titulo"><div><h1>Cuentas por pagar</h1></div></div>' + vacio('store', 'No tiene sucursales donde trabajar.'); return; }
      const sucs = sucursalesDe(fCxp, a);
      const ids = new Set(sucs.map(s => String(s.id)));
      const provs = await proveedoresDe(fCxp.empresaId, true);
      const nomProv = id => (provs.find(p => mismo(p.id, id)) || {}).razon_social || '';
      const nomSuc = id => (a.sucursales.find(s => mismo(s.id, id)) || {}).nombre || '';
      const pagado = await pagosPorCompra();
      const creditos = (await Datos.listar('COMPRAS', x => ids.has(String(x.sucursal_id)) && x.tipo_pago === 'CREDITO' && !anulado(x)))
        .map(x => ({ x: x, saldo: saldoDe(x, pagado), dias: x.fecha_vencimiento ? diasHasta(x.fecha_vencimiento) : 9999 }))
        .sort((p, q) => p.dias - q.dias || String(p.x.fecha).localeCompare(String(q.x.fecha)));
      const pend = creditos.filter(o => o.saldo > 0.005);
      const total = red(pend.reduce((s, o) => s + o.saldo, 0), 2);
      const vencido = red(pend.filter(o => o.dias < 0).reduce((s, o) => s + o.saldo, 0), 2);
      const semana = red(pend.filter(o => o.dias >= 0 && o.dias <= 7).reduce((s, o) => s + o.saldo, 0), 2);
      const porProv = new Map();
      pend.forEach(o => {
        const k = String(o.x.proveedor_id);
        const g = porProv.get(k) || { id: k, n: 0, saldo: 0, vencido: 0 };
        g.n++; g.saldo = red(g.saldo + o.saldo, 2); if (o.dias < 0) g.vencido = red(g.vencido + o.saldo, 2);
        porProv.set(k, g);
      });
      const pagos = (await Datos.listar('PAGOS_PROVEEDORES', p => ids.has(String(p.sucursal_id)))).sort((p, q) => String(q.fecha).localeCompare(String(p.fecha)) || String(q.numero).localeCompare(String(p.numero)));
      const compraDe = new Map(creditos.map(o => [String(o.x.id), o.x]));
      const pendEnvio = await pendientesDe('PAGOS_PROVEEDORES');

      raiz.innerHTML = '<div class="titulo"><div><h1>Cuentas por pagar</h1><p>Compras a crédito con saldo pendiente y pagos a proveedores.</p></div>' +
        '<div class="acciones-fila"><button class="btn btn-borde" data-acc="exportar">' + ico('download') + 'Exportar Excel</button></div></div>' +
        '<div class="tiles"><div class="tarjeta tile"><span>Total por pagar</span><b class="cifra chica' + (total > 0 ? ' amarilla' : '') + '">' + bs(total) + '</b></div>' +
        '<button class="tarjeta tile' + (fCxp.vista === 'VENCIDAS' ? ' elegida' : '') + '" data-vista="VENCIDAS"><span>Vencido</span><b class="cifra chica' + (vencido > 0 ? ' roja' : '') + '">' + bs(vencido) + '</b></button>' +
        '<div class="tarjeta tile"><span>Vence en 7 días</span><b class="cifra chica">' + bs(semana) + '</b></div>' +
        '<button class="tarjeta tile' + (fCxp.vista === 'PENDIENTES' ? ' elegida' : '') + '" data-vista="PENDIENTES"><span>Compras con saldo</span><b class="cifra">' + pend.length + '</b></button></div>' +
        (porProv.size ? '<div class="tarjeta bloque"><h3>' + ico('truck') + 'Deuda por proveedor</h3><div class="tabla-env"><table class="tabla compacta"><thead><tr><th>Proveedor</th><th class="num">Compras</th>' +
          '<th class="num">Vencido</th><th class="num">Saldo</th><th></th></tr></thead><tbody>' +
          Array.from(porProv.values()).sort((p, q) => q.saldo - p.saldo).map(g => '<tr><td><b>' + esc(nomProv(g.id)) + '</b></td><td class="num">' + g.n + '</td>' +
            '<td class="num">' + (g.vencido ? '<b class="txt-rojo">' + bs(g.vencido) + '</b>' : '—') + '</td><td class="num"><b>' + bs(g.saldo) + '</b></td>' +
            '<td class="acc"><button class="btn btn-chico btn-azul" data-acc="pagarProv" data-id="' + esc(g.id) + '">' + icoX('pago') + 'Pagar</button></td></tr>').join('') +
          '</tbody></table></div></div>' : '') +
        '<div class="filtros">' + selectorHtml(fCxp, a, { todas: true }) +
        '<div class="campo corto"><label for="cxProv">Proveedor</label>' + lista('cxProv', [['', 'Todos']].concat(provs.map(p => [p.id, p.razon_social])), fCxp.proveedor) + '</div>' +
        '<div class="campo corto"><label for="cxVista">Mostrar</label>' + lista('cxVista', [['PENDIENTES', 'Con saldo'], ['VENCIDAS', 'Vencidas'], ['PAGADAS', 'Pagadas'],
          ['TODAS', 'Todas las compras a crédito'], ['PAGOS', 'Pagos registrados']], fCxp.vista) + '</div></div>' +
        '<div id="cxLista"></div>';

      const pintar = () => {
        const cont = $('#cxLista', raiz);
        const okProv = id => !fCxp.proveedor || mismo(id, fCxp.proveedor);
        if (fCxp.vista === 'PAGOS') {
          const vista = pagos.filter(p => okProv(p.proveedor_id));
          if (!vista.length) { cont.innerHTML = vacio('wallet', 'No hay pagos registrados.'); return; }
          const mostrar = vista.slice(0, fCxp.limite);
          cont.innerHTML = '<div class="tabla-env"><table class="tabla"><thead><tr><th>Número</th><th>Fecha</th><th>Proveedor</th><th>Compra</th><th>Método</th>' +
            '<th class="num">Monto</th><th>Estado</th><th></th></tr></thead><tbody>' +
            mostrar.map(p => '<tr' + (anulado(p) ? ' class="inactivo"' : '') + '><td class="mono"><b>' + esc(p.numero) + '</b>' + etiquetaEnvio(pendEnvio[p.id]) + '</td><td>' + fechaCorta(p.fecha) + '</td>' +
              '<td>' + esc(nomProv(p.proveedor_id)) + '</td><td class="mono">' + esc((compraDe.get(String(p.compra_id)) || {}).numero || '') + '</td>' +
              '<td>' + esc(p.metodo_pago) + (p.referencia ? '<span class="sub">' + esc(p.referencia) + '</span>' : '') + '</td><td class="num"><b>' + bs(p.monto) + '</b></td>' +
              '<td>' + etiquetaEstadoDoc(p) + (anulado(p) ? '<span class="sub">' + esc(p.motivo_anulacion) + '</span>' : '') + '</td>' +
              '<td class="acc">' + (anulado(p) ? '' : '<button class="btn btn-chico btn-peligro" data-acc="anularPago" data-id="' + esc(p.id) + '">Anular</button>') + '</td></tr>').join('') +
            '</tbody></table></div>' + (vista.length > mostrar.length ? '<div class="mas-centro"><button class="btn btn-borde" data-acc="mas">Mostrar más</button></div>' :
              '<p class="nota" style="margin-top:10px">' + vista.length + ' pago(s) · ' + bs(vista.filter(p => !anulado(p)).reduce((s, p) => s + n0(p.monto), 0)) + ' pagado.</p>');
          return;
        }
        const filtro = { PENDIENTES: o => o.saldo > 0.005, VENCIDAS: o => o.saldo > 0.005 && o.dias < 0, PAGADAS: o => o.saldo <= 0.005, TODAS: () => true }[fCxp.vista] || (o => o.saldo > 0.005);
        const vista = creditos.filter(o => filtro(o) && okProv(o.x.proveedor_id));
        if (!vista.length) { cont.innerHTML = vacio('check', fCxp.vista === 'PENDIENTES' ? 'No hay deudas pendientes. ✔' : 'No hay compras en esta vista.'); return; }
        const mostrar = vista.slice(0, fCxp.limite);
        cont.innerHTML = '<div class="tabla-env"><table class="tabla"><thead><tr><th>Compra</th><th>Proveedor</th>' + (sucs.length > 1 ? '<th>Sucursal</th>' : '') +
          '<th>Vence</th><th class="num">Total</th><th class="num">Pagado</th><th class="num">Saldo</th><th></th></tr></thead><tbody>' +
          mostrar.map(o => {
            const x = o.x;
            const venceTxt = !x.fecha_vencimiento ? '—' : o.saldo <= 0.005 ? fechaCorta(x.fecha_vencimiento) :
              o.dias < 0 ? '<b class="txt-rojo">Vencida hace ' + (-o.dias) + ' día(s)</b>' : o.dias === 0 ? '<b class="txt-amarillo">Vence hoy</b>' : 'En ' + o.dias + ' día(s)';
            return '<tr class="clic" data-acc="ver" data-id="' + esc(x.id) + '"><td><b class="mono">' + esc(x.numero) + '</b><span class="sub">' + fechaCorta(x.fecha) +
              (x.nro_doc_proveedor ? ' · factura ' + esc(x.nro_doc_proveedor) : '') + '</span></td><td>' + esc(nomProv(x.proveedor_id)) + '</td>' +
              (sucs.length > 1 ? '<td>' + esc(nomSuc(x.sucursal_id)) + '</td>' : '') +
              '<td>' + venceTxt + (x.fecha_vencimiento && o.saldo > 0.005 ? '<span class="sub">' + fechaCorta(x.fecha_vencimiento) + '</span>' : '') + '</td>' +
              '<td class="num">' + bs(x.total) + '</td><td class="num">' + bs(pagado.get(String(x.id)) || 0) + '</td>' +
              '<td class="num">' + (o.saldo > 0.005 ? '<b class="' + (o.dias < 0 ? 'txt-rojo' : '') + '">' + bs(o.saldo) + '</b>' : '<span class="etiqueta verde">Pagada</span>') + '</td>' +
              '<td class="acc">' + (o.saldo > 0.005 ? '<button class="btn btn-chico btn-azul" data-acc="pagar" data-id="' + esc(x.id) + '">' + icoX('pago') + 'Pagar</button>' : '') + '</td></tr>';
          }).join('') + '</tbody></table></div>' +
          (vista.length > mostrar.length ? '<div class="mas-centro"><button class="btn btn-borde" data-acc="mas">Mostrar más</button></div>'
            : '<p class="nota" style="margin-top:10px">' + vista.length + ' compra(s) · saldo ' + bs(vista.reduce((s, o) => s + Math.max(o.saldo, 0), 0)) + '.</p>');
      };
      pintar();
      $('#cxProv', raiz).onchange = e => { fCxp.proveedor = e.target.value; fCxp.limite = 50; pintar(); };
      $('#cxVista', raiz).onchange = e => { fCxp.vista = e.target.value; fCxp.limite = 50; App.refrescarContexto(); };
      enlazarSelector(raiz, fCxp, () => App.refrescarContexto());
      raiz.onclick = async ev => {
        const t = ev.target.closest('[data-vista]');
        if (t) { fCxp.vista = t.dataset.vista; return App.refrescarContexto(); }
        const b = ev.target.closest('[data-acc]');
        if (!b) return;
        ev.stopPropagation();
        switch (b.dataset.acc) {
          case 'ver': { const o = creditos.find(y => mismo(y.x.id, b.dataset.id)); return o ? verCompra(o.x) : null; }
          case 'pagar': { const o = creditos.find(y => mismo(y.x.id, b.dataset.id)); return o ? formPago({ compras: [o.x] }) : null; }
          case 'pagarProv': return formPago({ compras: pend.filter(o => mismo(o.x.proveedor_id, b.dataset.id)).map(o => o.x), proveedor: provs.find(p => mismo(p.id, b.dataset.id)) });
          case 'anularPago': {
            const p = pagos.find(y => mismo(y.id, b.dataset.id));
            const motivo = await pedirMotivo('Anular pago ' + p.numero, 'El monto (' + bs(p.monto) + ') vuelve a quedar como deuda de la compra.');
            if (!motivo) return;
            await Datos.anular('PAGOS_PROVEEDORES', p.id, motivo);
            App.aviso('Pago anulado', 'ok');
            return App.refrescarContexto();
          }
          case 'mas': fCxp.limite += 100; return pintar();
          case 'exportar': return exportarCxp(creditos, pagos, nomProv, nomSuc, pagado, compraDe);
        }
      };
    }
  });

  /**
   * Registrar un pago. op.compras: una compra, o varias del mismo proveedor (el monto se reparte
   * empezando por la que vence primero).
   */
  async function formPago(op) {
    const pagado = await pagosPorCompra();
    const compras = op.compras.map(x => ({ x: x, saldo: saldoDe(x, pagado) })).filter(o => o.saldo > 0.005)
      .sort((p, q) => String(p.x.fecha_vencimiento || '9').localeCompare(String(q.x.fecha_vencimiento || '9')) || String(p.x.fecha).localeCompare(String(q.x.fecha)));
    if (!compras.length) { App.aviso('No hay saldo pendiente.', 'info'); return; }
    const total = red(compras.reduce((s, o) => s + o.saldo, 0), 2);
    const prov = op.proveedor || (compras[0].x.proveedor_id ? await Datos.obtener('PROVEEDORES', compras[0].x.proveedor_id) : null);
    const metodos = (await Datos.lista('METODO_PAGO')).map(m => [m.codigo, m.nombre]);
    const varias = compras.length > 1;
    const f = App.modal({
      titulo: 'Pago a ' + (prov ? prov.razon_social : 'proveedor'),
      html: '<p class="nota">' + (varias ? compras.length + ' compras con saldo. El pago se aplica primero a la que vence antes.' : 'Compra ' + esc(compras[0].x.numero) + '.') +
        ' Saldo total: <b>' + bs(total) + '</b>.</p>' +
        '<div class="form-2">' +
        campoNum('pMonto', 'Monto (Bs)', total, { req: true }) +
        campo('pFecha', 'Fecha', hoy(), { tipo: 'date', req: true }) +
        campoLista('pMetodo', 'Método de pago', metodos.length ? metodos : [['EFECTIVO', 'Efectivo']], 'EFECTIVO') +
        campo('pRef', 'Referencia', '', { ph: 'N.º de transferencia, cheque, recibo…', attrs: ' maxlength="60"' }) +
        campo('pObs', 'Observación', '', { clase: 'todo', attrs: ' maxlength="150"' }) +
        '</div><div id="pReparto"></div><div class="f-msg"></div>',
      botones: [{ t: 'Cancelar' }, { t: 'Registrar pago', clase: 'btn-principal', accion: m => guardar(m) }]
    });
    const repartir = monto => {
      let resto = red(monto, 2);
      return compras.map(o => { const a2 = red(Math.min(resto, o.saldo), 2); resto = red(resto - a2, 2); return { x: o.x, saldo: o.saldo, monto: a2 }; }).filter(r => r.monto > 0);
    };
    const pintar = () => {
      const m = num($('#pMonto', f).value) || 0;
      const r = repartir(m);
      $('#pReparto', f).innerHTML = (varias && m > 0 ? '<div class="tabla-env" style="margin-bottom:10px"><table class="tabla compacta"><thead><tr><th>Compra</th><th>Vence</th><th class="num">Saldo</th><th class="num">Se paga</th></tr></thead><tbody>' +
        compras.map(o => { const a2 = r.find(y => y.x === o.x); return '<tr><td class="mono">' + esc(o.x.numero) + '</td><td>' + fechaCorta(o.x.fecha_vencimiento) + '</td><td class="num">' + bs(o.saldo) +
          '</td><td class="num"><b>' + (a2 ? bs(a2.monto) : '—') + '</b></td></tr>'; }).join('') + '</tbody></table></div>' : '') +
        (m > total + 0.005 ? '<div class="msg msg-error">El monto es mayor que el saldo (' + bs(total) + ').</div>' : '');
    };
    $('#pMonto', f).addEventListener('input', pintar);
    pintar();

    async function guardar(m) {
      try {
        const monto = leerNumero(m, 'pMonto', 'el monto', { req: true, mayorCero: true });
        if (monto > total + 0.005) return mensaje(m, 'El monto no puede ser mayor que el saldo (' + bs(total) + ').');
        const fechaD = $('#pFecha', m).value;
        if (!fechaD) return mensaje(m, 'Elija la fecha del pago.');
        if (fechaD > hoy()) return mensaje(m, 'La fecha del pago no puede ser futura.');
        const reparto = repartir(monto);
        const regs = [];
        for (const r of reparto) {
          regs.push({ tabla: 'PAGOS_PROVEEDORES', fila: { id: U.uuid(), numero: await Datos.numero('PPR', r.x.sucursal_id), empresa_id: r.x.empresa_id,
            sucursal_id: r.x.sucursal_id, proveedor_id: r.x.proveedor_id, compra_id: r.x.id, fecha: fechaISO(fechaD), monto: r.monto,
            metodo_pago: $('#pMetodo', m).value, referencia: txt($('#pRef', m).value), observacion: txt($('#pObs', m).value), estado: 'ACTIVO' } });
        }
        await Datos.guardarVarios(regs);
        App.aviso('Pago registrado: ' + bs(monto) + (regs.length > 1 ? ' en ' + regs.length + ' compras' : ''), 'ok');
        await App.refrescarContexto();
        return true;
      } catch (e) { return mensaje(m, e.message || String(e)); }
    }
  }

  function exportarCxp(creditos, pagos, nomProv, nomSuc, pagado, compraDe) {
    Excel.descargar('Cuentas_por_pagar_' + hoy() + '.xlsx', [{
      nombre: 'Por pagar', titulo: 'Cuentas por pagar', subtitulo: fechaCorta(hoy()) + ' · compras a crédito',
      columnas: [{ t: 'Compra', w: 22 }, { t: 'Fecha', w: 11 }, { t: 'Sucursal', w: 16 }, { t: 'Proveedor', w: 26 }, { t: 'Factura / nota', w: 14 }, { t: 'Vence', w: 11 },
        { t: 'Días', w: 8, tipo: 'num' }, { t: 'Total', w: 13, tipo: 'bs' }, { t: 'Pagado', w: 13, tipo: 'bs' }, { t: 'Saldo', w: 13, tipo: 'bs' }, { t: 'Situación', w: 12 }],
      filas: creditos.map(o => [txt(o.x.numero), fechaCorta(o.x.fecha), nomSuc(o.x.sucursal_id), nomProv(o.x.proveedor_id), txt(o.x.nro_doc_proveedor),
        o.x.fecha_vencimiento ? fechaCorta(o.x.fecha_vencimiento) : '', o.saldo > 0.005 && o.dias !== 9999 ? o.dias : '', n0(o.x.total), pagado.get(String(o.x.id)) || 0,
        Math.max(o.saldo, 0), o.saldo <= 0.005 ? 'Pagada' : o.dias < 0 ? 'Vencida' : 'Pendiente']),
      totales: ['TOTAL', null, null, null, null, null, null, red(creditos.reduce((s, o) => s + n0(o.x.total), 0), 2), null, red(creditos.reduce((s, o) => s + Math.max(o.saldo, 0), 0), 2), null]
    }, {
      nombre: 'Pagos', titulo: 'Pagos a proveedores', subtitulo: fechaCorta(hoy()),
      columnas: [{ t: 'Número', w: 22 }, { t: 'Fecha', w: 11 }, { t: 'Proveedor', w: 26 }, { t: 'Compra', w: 22 }, { t: 'Método', w: 14 }, { t: 'Referencia', w: 18 },
        { t: 'Monto', w: 13, tipo: 'bs' }, { t: 'Estado', w: 10 }, { t: 'Motivo anulación', w: 24 }],
      filas: pagos.map(p => [txt(p.numero), fechaCorta(p.fecha), nomProv(p.proveedor_id), (compraDe.get(String(p.compra_id)) || {}).numero || '', txt(p.metodo_pago), txt(p.referencia),
        n0(p.monto), anulado(p) ? 'ANULADO' : 'VIGENTE', txt(p.motivo_anulacion)])
    }]);
  }

  // ============================================================
  //  AJUSTES DE INVENTARIO
  // ============================================================
  /**
   * Arma los registros de un ajuste (no guarda).
   * op: { suc, tipo: 'CONTEO'|'CANTIDAD', motivo, observacion, lineas: [{ p, stockSistema, contada, diferencia, costo, obs }] }
   */
  async function registrosAjuste(op) {
    const suc = op.suc;
    const id = U.uuid();
    const numero = await Datos.numero('AJS', suc.id);
    const ahora = U.ahoraISO();
    const regs = [{ tabla: 'AJUSTES', fila: { id: id, numero: numero, empresa_id: suc.empresa_id, sucursal_id: suc.id, fecha: ahora, tipo: op.tipo,
      motivo: op.motivo, observacion: op.observacion || '', estado: 'ACTIVO' } }];
    op.lineas.forEach(l => {
      const detId = U.uuid();
      regs.push({ tabla: 'AJUSTES_DETALLE', fila: { id: detId, ajuste_id: id, producto_id: l.p.id, stock_sistema: red(l.stockSistema, 3),
        cantidad_contada: op.tipo === 'CONTEO' ? red(l.contada, 3) : '', diferencia: red(l.diferencia, 3), costo_unitario: l.costo > 0 ? red(l.costo, 4) : '',
        observacion: l.obs || '' } });
      if (Math.abs(l.diferencia) < 0.0005) return;
      regs.push({ tabla: 'MOVIMIENTOS', fila: { id: U.uuid(), fecha: ahora, empresa_id: suc.empresa_id, sucursal_id: suc.id, producto_id: l.p.id,
        tipo: l.diferencia > 0 ? 'AJUSTE_ENTRADA' : 'AJUSTE_SALIDA', cantidad: red(l.diferencia, 3), costo_unitario: l.costo > 0 ? red(l.costo, 4) : '',
        precio_unitario: '', documento_tipo: 'AJUSTE', documento_id: id, documento_numero: numero, detalle_id: detId, anula_movimiento_id: '',
        observacion: (op.origen === 'IMPORTACION' ? 'Importación · ' : '') + (op.nombreMotivo || op.motivo) } });
    });
    return { regs: regs, id: id, numero: numero };
  }

  const fAjs = { empresaId: '', sucursalId: '', estado: 'ACTIVO', tipo: '', buscar: '', limite: 50 };

  App.pantalla('ajustes', {
    refrescar: true,
    async render(el) {
      const raiz = contenedor(el);
      const a = await alcance();
      vistaValida(fAjs, a, true);
      if (!a.sucursales.length) { raiz.innerHTML = '<div class="titulo"><div><h1>Ajustes de inventario</h1></div></div>' + vacio('store', 'No tiene sucursales donde trabajar.'); return; }
      const sucs = sucursalesDe(fAjs, a);
      const ids = new Set(sucs.map(s => String(s.id)));
      const ajustes = (await Datos.listar('AJUSTES', x => ids.has(String(x.sucursal_id)))).sort((p, q) => String(q.fecha).localeCompare(String(p.fecha)));
      const det = await Datos.listar('AJUSTES_DETALLE');
      const resumen = new Map();
      det.forEach(d => {
        const r = resumen.get(String(d.ajuste_id)) || { n: 0, mas: 0, menos: 0, valor: 0 };
        r.n++;
        const dif = n0(d.diferencia);
        if (dif > 0) r.mas += dif; else r.menos += dif;
        r.valor += dif * n0(d.costo_unitario);
        resumen.set(String(d.ajuste_id), r);
      });
      const motivos = new Map((await Datos.listar('LISTAS', l => l.lista === 'MOTIVO_AJUSTE')).map(l => [String(l.codigo), l.nombre]));
      const nomSuc = id => (a.sucursales.find(s => mismo(s.id, id)) || {}).nombre || '';
      const nomUsu = await nombresUsuarios();
      const pend = await pendientesDe('AJUSTES');
      const mes = hoy().slice(0, 7);
      const delMes = ajustes.filter(x => !anulado(x) && String(x.fecha).slice(0, 7) === mes);
      const valorMes = delMes.reduce((s, x) => s + ((resumen.get(String(x.id)) || {}).valor || 0), 0);

      raiz.innerHTML = '<div class="titulo"><div><h1>Ajustes de inventario</h1><p>Corrigen el stock sin tocar los movimientos: por conteo físico o por cantidad (+/−). ' +
        'Siempre con motivo; se anulan, nunca se borran.</p></div>' +
        '<div class="acciones-fila"><button class="btn btn-borde" data-acc="exportar">' + ico('download') + 'Exportar Excel</button>' +
        '<button class="btn btn-borde" data-acc="nuevoConteo">' + ico('clipboard') + 'Conteo físico</button>' +
        '<button class="btn btn-principal" data-acc="nuevo">' + icoX('mas') + 'Nuevo ajuste</button></div></div>' +
        '<div class="tiles"><div class="tarjeta tile"><span>Ajustes de este mes</span><b class="cifra">' + delMes.length + '</b></div>' +
        '<div class="tarjeta tile"><span>Valor ajustado en el mes (al costo)</span><b class="cifra chica ' + (valorMes < 0 ? 'roja' : '') + '">' + bs(valorMes) + '</b></div></div>' +
        '<div class="filtros">' + selectorHtml(fAjs, a, { todas: true }) +
        '<div class="campo"><label for="ajBuscar">Buscar</label><input class="entrada" id="ajBuscar" value="' + esc(fAjs.buscar) + '" autocomplete="off" placeholder="Número u observación"></div>' +
        '<div class="campo corto"><label for="ajTipo">Tipo</label>' + lista('ajTipo', [['', 'Todos'], ['CONTEO', 'Conteo físico'], ['CANTIDAD', 'Por cantidad']], fAjs.tipo) + '</div>' +
        '<div class="campo corto"><label for="ajEstado">Estado</label>' + lista('ajEstado', [['ACTIVO', 'Vigentes'], ['ANULADO', 'Anulados'], ['TODOS', 'Todos']], fAjs.estado) + '</div></div>' +
        '<div id="ajLista"></div>';

      let vista = [];
      const pintar = () => {
        const b = norm(fAjs.buscar);
        vista = ajustes.filter(x => (fAjs.estado === 'TODOS' || (fAjs.estado === 'ANULADO') === anulado(x)) && (!fAjs.tipo || x.tipo === fAjs.tipo) &&
          (!b || norm([x.numero, x.observacion, motivos.get(String(x.motivo))].join(' ')).indexOf(b) >= 0));
        const cont = $('#ajLista', raiz);
        if (!ajustes.length) { cont.innerHTML = vacio('sliders', '<b>Todavía no hay ajustes.</b><br>Use <b>Conteo físico</b> para registrar lo que contó, o <b>Nuevo ajuste</b> para sumar o restar.'); return; }
        if (!vista.length) { cont.innerHTML = vacio('search', 'Ningún ajuste coincide.'); return; }
        const mostrar = vista.slice(0, fAjs.limite);
        cont.innerHTML = '<div class="tabla-env"><table class="tabla"><thead><tr><th>Número</th><th>Fecha</th>' + (sucs.length > 1 ? '<th>Sucursal</th>' : '') +
          '<th>Tipo / motivo</th><th class="num">Productos</th><th class="num">Entradas</th><th class="num">Salidas</th><th class="num">Valor</th><th>Estado</th></tr></thead><tbody>' +
          mostrar.map(x => {
            const r = resumen.get(String(x.id)) || { n: 0, mas: 0, menos: 0, valor: 0 };
            return '<tr class="clic' + (anulado(x) ? ' inactivo' : '') + '" data-acc="ver" data-id="' + esc(x.id) + '"><td><b class="mono">' + esc(x.numero) + '</b>' + etiquetaEnvio(pend[x.id]) +
              '<span class="sub">' + esc(nomUsu(x.creado_por)) + '</span></td><td>' + fechaCorta(x.fecha) + '</td>' + (sucs.length > 1 ? '<td>' + esc(nomSuc(x.sucursal_id)) + '</td>' : '') +
              '<td>' + (x.tipo === 'CONTEO' ? 'Conteo físico' : 'Por cantidad') + '<span class="sub">' + esc(motivos.get(String(x.motivo)) || x.motivo) + (x.observacion ? ' · ' + esc(x.observacion) : '') + '</span></td>' +
              '<td class="num">' + r.n + '</td><td class="num txt-verde">' + (r.mas ? '+' + fmt(r.mas) : '—') + '</td><td class="num txt-rojo">' + (r.menos ? fmt(r.menos) : '—') + '</td>' +
              '<td class="num ' + (r.valor < 0 ? 'txt-rojo' : '') + '">' + (r.valor ? bs(red(r.valor, 2)) : '—') + '</td><td>' + etiquetaEstadoDoc(x) + '</td></tr>';
          }).join('') + '</tbody></table></div>' +
          (vista.length > mostrar.length ? '<div class="mas-centro"><button class="btn btn-borde" data-acc="mas">Mostrar más</button></div>' : '<p class="nota" style="margin-top:10px">' + vista.length + ' ajuste(s).</p>');
      };
      pintar();
      const iB = $('#ajBuscar', raiz);
      iB.oninput = () => { fAjs.buscar = iB.value; pintar(); };
      $('#ajTipo', raiz).onchange = e => { fAjs.tipo = e.target.value; pintar(); };
      $('#ajEstado', raiz).onchange = e => { fAjs.estado = e.target.value; pintar(); };
      enlazarSelector(raiz, fAjs, () => App.refrescarContexto());
      raiz.onclick = ev => {
        const b = ev.target.closest('[data-acc]');
        if (!b) return;
        switch (b.dataset.acc) {
          case 'nuevo': return formAjuste({ sucursalId: fAjs.sucursalId, tipo: 'CANTIDAD' });
          case 'nuevoConteo': return formAjuste({ sucursalId: fAjs.sucursalId, tipo: 'CONTEO' });
          case 'ver': { const x = ajustes.find(y => mismo(y.id, b.dataset.id)); return x ? verAjuste(x, motivos) : null; }
          case 'mas': fAjs.limite += 100; return pintar();
          case 'exportar': return exportarAjustes(vista, det, motivos, nomSuc, nomUsu);
        }
      };
    }
  });

  /** Formulario de ajuste. op: { sucursalId, tipo: 'CONTEO'|'CANTIDAD', productos: [p], fija: true (no cambiar sucursal) } */
  async function formAjuste(op) {
    op = op || {};
    const a = await alcance();
    if (!a.sucursales.length) { App.aviso('No tiene sucursales donde ajustar.', 'error'); return; }
    let suc = a.sucursales.find(s => mismo(s.id, op.sucursalId)) ||
      (App.contexto.sucursal && a.sucursales.find(s => mismo(s.id, App.contexto.sucursal.id))) || a.sucursales[0];
    const motivosL = (await Datos.lista('MOTIVO_AJUSTE')).map(m => [m.codigo, m.nombre]);
    if (!motivosL.length) motivosL.push(['OTRO', 'Otro']);
    const est = { tipo: op.tipo === 'CONTEO' ? 'CONTEO' : 'CANTIDAD', lineas: [], stock: new Map(), ps: new Map() };
    const cargarSucursal = async () => {
      est.stock = await Catalogo.stocks(suc.id);
      est.ps = new Map((await Datos.listar('PRODUCTOS_SUCURSAL', x => mismo(x.sucursal_id, suc.id))).map(x => [String(x.producto_id), x]));
    };
    await cargarSucursal();
    const nombreSuc = s => (esAG() && a.empresas.length > 1 ? ((a.empresas.find(e => mismo(e.id, s.empresa_id)) || {}).nombre || '') + ' · ' : '') + s.nombre;
    const motivoIni = est.tipo === 'CONTEO' && motivosL.some(m => m[0] === 'CONTEO') ? 'CONTEO' : (motivosL.find(m => m[0] !== 'CONTEO') || motivosL[0])[0];

    const f = modalAncho({
      titulo: 'Ajuste de inventario',
      cerrable: false,
      html: '<div class="form-2">' +
        campoLista('aSuc', 'Sucursal', a.sucursales.map(s => [s.id, nombreSuc(s)]), suc.id, { attrs: a.sucursales.length > 1 && !op.fija ? '' : ' disabled' }) +
        campoLista('aMotivo', 'Motivo', motivosL, motivoIni, { req: true }) +
        '<div class="campo todo"><label>Cómo se ajusta</label><div class="checks dos">' +
        '<label class="check"><input type="radio" name="aTipo" value="CONTEO"' + (est.tipo === 'CONTEO' ? ' checked' : '') + '><span><b>Por conteo físico</b><small>Escriba lo que contó; el sistema calcula la diferencia.</small></span></label>' +
        '<label class="check"><input type="radio" name="aTipo" value="CANTIDAD"' + (est.tipo === 'CANTIDAD' ? ' checked' : '') + '><span><b>Por cantidad (+/−)</b><small>Sume o reste una cantidad (merma, daño, error…).</small></span></label></div></div>' +
        campo('aObs', 'Observación', '', { clase: 'todo', ph: 'Ej. Conteo de fin de mes, pasillo 3', attrs: ' maxlength="200"' }) +
        '<div class="seccion-form">Productos</div>' +
        '<div class="todo" id="aBuscador"></div><div class="todo" id="aLineas"></div><div class="todo" id="aTotales"></div>' +
        '</div><div class="f-msg"></div>',
      botones: [{ t: 'Cancelar', accion: async () => !est.lineas.length || await App.confirmar('Salir sin guardar', 'Se perderán los productos cargados en este ajuste.', 'Salir', 'btn-peligro') },
        { t: 'Guardar ajuste', clase: 'btn-principal', accion: m => guardar(m) }]
    });

    /** Unidades de una línea: cajas × upc + paquetes × upp + unidades. null si no escribió nada. */
    const unidadesLinea = l => {
      const p = l.p;
      const vals = [l.cajas, l.paquetes, l.unid];
      if (vals.every(v => !txt(v))) return null;
      return red(n0(l.cajas) * (n0(p.unidades_por_caja) || 1) + n0(l.paquetes) * (n0(p.unidades_por_paquete) || 1) + n0(l.unid), 3);
    };
    const calcular = () => est.lineas.map(l => {
      const stockSistema = est.stock.get(String(l.p.id)) || 0;
      const u = unidadesLinea(l);
      const ps = est.ps.get(String(l.p.id));
      const costo = ps ? n0(ps.costo_promedio) : 0;
      let diferencia = 0, contada = null;
      if (u !== null) {
        if (est.tipo === 'CONTEO') { contada = u; diferencia = red(u - stockSistema, 3); }
        else diferencia = l.signo === '-' ? -u : u;
      }
      const partes = [];
      if (txt(l.cajas)) partes.push(fmt(n0(l.cajas)) + ' caja(s)');
      if (txt(l.paquetes)) partes.push(fmt(n0(l.paquetes)) + ' paq.');
      if (txt(l.unid)) partes.push(fmt(n0(l.unid)) + ' ' + textoUnid(l.p));
      return { p: l.p, l: l, u: u, stockSistema: stockSistema, contada: contada, diferencia: diferencia, costo: costo, obs: partes.length > 1 ? partes.join(' + ') : '' };
    });

    const pintarLineas = () => {
      const cont = $('#aLineas', f);
      if (!est.lineas.length) { cont.innerHTML = '<p class="vacio" style="padding:14px">Agregue los productos a ajustar: escriba el nombre o escanee el código.</p>'; recalcular(); return; }
      const conteo = est.tipo === 'CONTEO';
      cont.innerHTML = '<div class="tabla-env"><table class="tabla compacta lineas"><thead><tr><th>Producto</th><th class="num">Stock en el sistema</th>' +
        (conteo ? '' : '<th>Entra / sale</th>') + '<th>' + (conteo ? 'Cantidad contada' : 'Cantidad') + '</th><th class="num">Diferencia</th><th class="num">Valor</th><th></th></tr></thead><tbody>' +
        est.lineas.map((l, i) => {
          const p = l.p, upc = n0(p.unidades_por_caja), upp = n0(p.unidades_por_paquete);
          const ps = est.ps.get(String(p.id));
          const ent = (k, ph, etq) => '<label class="cant-in"><input class="entrada num-in" data-campo="' + k + '" inputmode="decimal" placeholder="' + ph + '" value="' + esc(fmtNum(l[k])) + '"><small>' + etq + '</small></label>';
          return '<tr data-i="' + i + '"><td class="prod"><b>' + esc(p.nombre) + '</b><span class="sub">' + esc(p.codigo) + (ps && txt(ps.ubicacion) ? ' · 📍 ' + esc(ps.ubicacion) : '') +
            (!ps || ps.estado === 'INACTIVO' ? ' · <span class="txt-amarillo">no asignado a la sucursal</span>' : '') + '</span></td>' +
            '<td class="num" data-sis></td>' +
            (conteo ? '' : '<td>' + lista('', [['+', '+ Entra'], ['-', '− Sale']], l.signo, ' data-campo="signo"') + '</td>') +
            '<td><div class="cant-pres">' + (upc > 1 ? ent('cajas', '0', 'cajas de ' + fmt(upc)) : '') + (upp > 1 ? ent('paquetes', '0', 'paq. de ' + fmt(upp)) : '') +
            ent('unid', '0', esc(textoUnid(p)).toLowerCase()) + '</div></td>' +
            '<td class="num" data-dif></td><td class="num" data-val></td>' +
            '<td class="acc"><button type="button" class="btn btn-icono" data-quitar="' + i + '" title="Quitar" aria-label="Quitar">' + icoX('quitar') + '</button></td></tr>';
        }).join('') + '</tbody></table></div>';
      recalcular();
    };
    const recalcular = () => {
      const calc = calcular();
      calc.forEach((x, i) => {
        const tr = $('tr[data-i="' + i + '"]', f);
        if (!tr) return;
        $('[data-sis]', tr).innerHTML = '<b>' + fmt(x.stockSistema) + '</b><span class="sub">' + esc(textoUnid(x.p)) + '</span>';
        $('[data-dif]', tr).innerHTML = x.u === null ? '<span class="suave">—</span>' : '<b class="' + (x.diferencia > 0 ? 'txt-verde' : x.diferencia < 0 ? 'txt-rojo' : '') + '">' +
          (x.diferencia > 0 ? '+' : '') + fmt(x.diferencia) + '</b><span class="sub">queda ' + fmt(red(x.stockSistema + x.diferencia, 3)) + '</span>';
        $('[data-val]', tr).textContent = x.u !== null && x.costo > 0 && x.diferencia ? bs(red(x.diferencia * x.costo, 2)) : '—';
      });
      const mas = calc.reduce((s, x) => s + Math.max(x.diferencia, 0), 0), menos = calc.reduce((s, x) => s + Math.min(x.diferencia, 0), 0);
      const valor = calc.reduce((s, x) => s + x.diferencia * x.costo, 0);
      $('#aTotales', f).innerHTML = calc.length ? '<div class="totales"><div><span>Productos</span><b>' + calc.length + '</b></div>' +
        '<div><span>Entran</span><b class="txt-verde">+' + fmt(mas) + '</b></div><div><span>Salen</span><b class="txt-rojo">' + fmt(menos) + '</b></div>' +
        '<div class="grande"><span>Valor del ajuste (al precio de adquisición)</span><b class="' + (valor < 0 ? 'txt-rojo' : '') + '">' + bs(red(valor, 2)) + '</b></div></div>' : '';
      return calc;
    };
    const elegir = (p, presentacion, escaneado) => {
      let l = est.lineas.find(x => mismo(x.p.id, p.id));
      const campoP = presentacion === 'CAJA' ? 'cajas' : presentacion === 'PAQUETE' ? 'paquetes' : 'unid';
      // Escanear varias veces el mismo producto va sumando (útil para contar)
      if (l) { if (escaneado) { l[campoP] = n0(l[campoP]) + 1; App.aviso(p.nombre + ': +1 ' + NOMBRE_PRES[presentacion || 'UNIDAD'], 'ok', 2); } }
      else {
        l = { p: p, cajas: '', paquetes: '', unid: '', signo: '-' };
        if (est.tipo === 'CONTEO' && escaneado) l[campoP] = 1;
        est.lineas.push(l);
      }
      pintarLineas();
      const idx = est.lineas.indexOf(l);
      const inp = $('tr[data-i="' + idx + '"] [data-campo="' + campoP + '"]', f);
      if (inp && !n0(l[campoP])) inp.focus();
    };
    const bus = buscadorProductos($('#aBuscador', f), { sucursalId: () => suc.id, alElegir: elegir });
    $('#aLineas', f).addEventListener('input', ev => {
      const tr = ev.target.closest('tr[data-i]');
      if (!tr || !ev.target.dataset.campo) return;
      est.lineas[Number(tr.dataset.i)][ev.target.dataset.campo] = ev.target.value;
      recalcular();
    });
    $('#aLineas', f).addEventListener('change', ev => {
      const tr = ev.target.closest('tr[data-i]');
      if (!tr || ev.target.dataset.campo !== 'signo') return;
      est.lineas[Number(tr.dataset.i)].signo = ev.target.value;
      recalcular();
    });
    $('#aLineas', f).addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.matches('input')) { ev.preventDefault(); bus.foco(); } });
    $('#aLineas', f).addEventListener('click', ev => {
      const b = ev.target.closest('[data-quitar]');
      if (!b) return;
      est.lineas.splice(Number(b.dataset.quitar), 1);
      pintarLineas();
    });
    $$('input[name="aTipo"]', f).forEach(r => {
      r.onchange = () => {
        est.tipo = r.value;
        const mot = $('#aMotivo', f);
        if (est.tipo === 'CONTEO' && motivosL.some(m => m[0] === 'CONTEO')) mot.value = 'CONTEO';
        else if (est.tipo === 'CANTIDAD' && mot.value === 'CONTEO') mot.value = (motivosL.find(m => m[0] !== 'CONTEO') || motivosL[0])[0];
        pintarLineas();
      };
    });
    $('#aSuc', f).onchange = async e => {
      suc = a.sucursales.find(s => mismo(s.id, e.target.value));
      await cargarSucursal();
      pintarLineas();
    };
    for (const p of (op.productos || [])) elegir(p, '', false);
    pintarLineas();

    async function guardar(m) {
      try {
        const calc = recalcular();
        if (!calc.length) return mensaje(m, 'Agregue al menos un producto.');
        const sinDato = calc.find(x => x.u === null);
        if (sinDato) return mensaje(m, sinDato.p.nombre + ': escriba la cantidad' + (est.tipo === 'CONTEO' ? ' contada (0 si no hay ninguno).' : '.'));
        const malo = est.lineas.find(l => [l.cajas, l.paquetes, l.unid].some(v => txt(v) && (num(v) === null || num(v) < 0)));
        if (malo) return mensaje(m, malo.p.nombre + ': escriba solo números positivos.');
        if (est.tipo === 'CANTIDAD' && calc.some(x => !x.diferencia)) return mensaje(m, 'Hay productos con cantidad 0. Quítelos o escriba la cantidad.');
        if (!calc.some(x => x.diferencia)) return mensaje(m, 'No hay diferencias: el stock contado es igual al del sistema. No hace falta ajustar.');
        const motivo = $('#aMotivo', m).value;
        if (!motivo) return mensaje(m, 'Elija el motivo.');
        const negativos = calc.filter(x => x.stockSistema + x.diferencia < 0);
        const valor = calc.reduce((s, x) => s + x.diferencia * x.costo, 0);
        if (!(await App.confirmar('Guardar ajuste', calc.filter(x => x.diferencia).length + ' producto(s) cambian de stock en ' + suc.nombre + '. Valor del ajuste: ' + bs(red(valor, 2)) + '.' +
          (negativos.length ? ' Atención: ' + negativos.map(x => x.p.codigo).join(', ') + ' quedarán con stock negativo.' : ''), 'Guardar'))) return false;
        const r = await registrosAjuste({ suc: suc, tipo: est.tipo, motivo: motivo, nombreMotivo: (motivosL.find(x => x[0] === motivo) || [])[1],
          observacion: txt($('#aObs', m).value), lineas: calc, origen: 'MANUAL' });
        // Si un producto no estaba asignado a la sucursal, se asigna
        const asignar = [];
        calc.forEach(x => {
          const ps = est.ps.get(String(x.p.id));
          if (!ps) asignar.push({ tabla: 'PRODUCTOS_SUCURSAL', fila: { id: U.uuid(), empresa_id: suc.empresa_id, sucursal_id: suc.id, producto_id: x.p.id, ubicacion: '', stock_minimo: '', producto_especial: 'NO', estado: 'ACTIVO' } });
          else if (ps.estado === 'INACTIVO' && x.stockSistema + x.diferencia > 0) asignar.push({ tabla: 'PRODUCTOS_SUCURSAL', fila: { id: ps.id, estado: 'ACTIVO', _origen: 'MANUAL', _motivo: 'Ajuste ' + r.numero } });
        });
        await Datos.guardarVarios(asignar.concat(r.regs));
        App.aviso('Ajuste ' + r.numero + ' guardado', 'ok');
        await App.refrescarContexto();
        return true;
      } catch (e) {
        console.error(e);
        return mensaje(m, e.message || String(e));
      }
    }
  }

  async function verAjuste(x, motivos) {
    const c = await Catalogo.cargar();
    const det = await Datos.listar('AJUSTES_DETALLE', d => mismo(d.ajuste_id, x.id));
    const suc = await Datos.obtener('SUCURSALES', x.sucursal_id) || {};
    const nomUsu = await nombresUsuarios();
    const valor = det.reduce((s, d) => s + n0(d.diferencia) * n0(d.costo_unitario), 0);
    const conteo = x.tipo === 'CONTEO';
    const html = (anulado(x) ? '<div class="msg msg-error"><b>Anulado</b> el ' + fechaCorta(x.anulado_en) + ' por ' + esc(nomUsu(x.anulado_por)) + ': ' + esc(x.motivo_anulacion) + '</div>' : '') +
      '<div class="tarjeta" style="margin-bottom:14px"><div class="dato"><span>Número</span><b class="mono">' + esc(x.numero) + '</b></div>' +
      '<div class="dato"><span>Fecha</span><b>' + esc(U.fechaCorta(x.fecha)) + '</b></div><div class="dato"><span>Sucursal</span><b>' + esc(suc.nombre || '') + '</b></div>' +
      '<div class="dato"><span>Tipo</span><b>' + (conteo ? 'Conteo físico' : 'Por cantidad (+/−)') + '</b></div>' +
      '<div class="dato"><span>Motivo</span><b>' + esc(motivos.get(String(x.motivo)) || x.motivo) + '</b></div>' +
      (x.observacion ? '<div class="dato"><span>Observación</span><b>' + esc(x.observacion) + '</b></div>' : '') +
      '<div class="dato"><span>Registró</span><b>' + esc(nomUsu(x.creado_por)) + '</b></div>' +
      '<div class="dato"><span>Valor</span><b class="' + (valor < 0 ? 'txt-rojo' : '') + '">' + bs(red(valor, 2)) + '</b></div></div>' +
      '<div class="tabla-env"><table class="tabla compacta"><thead><tr><th>Producto</th><th class="num">Sistema</th>' + (conteo ? '<th class="num">Contado</th>' : '') +
      '<th class="num">Diferencia</th><th class="num">Valor</th></tr></thead><tbody>' +
      det.map(d => {
        const p = c.porId.get(String(d.producto_id)) || { nombre: '(producto)', codigo: '' };
        const dif = n0(d.diferencia);
        return '<tr><td><b>' + esc(p.nombre) + '</b><span class="sub">' + esc(p.codigo) + (d.observacion ? ' · ' + esc(d.observacion) : '') + '</span></td>' +
          '<td class="num">' + fmt(d.stock_sistema) + '</td>' + (conteo ? '<td class="num">' + fmt(d.cantidad_contada) + '</td>' : '') +
          '<td class="num"><b class="' + (dif > 0 ? 'txt-verde' : dif < 0 ? 'txt-rojo' : '') + '">' + (dif > 0 ? '+' : '') + fmt(dif) + '</b></td>' +
          '<td class="num">' + (dif && n0(d.costo_unitario) ? bs(red(dif * n0(d.costo_unitario), 2)) : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    const botones = [];
    if (!anulado(x)) botones.push({ t: 'Anular ajuste', clase: 'btn-peligro', accion: async () => {
      const motivo = await pedirMotivo('Anular ajuste ' + x.numero, 'El stock vuelve a como estaba antes de este ajuste. No se borra nada.');
      if (!motivo) return false;
      await Datos.guardarVarios([{ tabla: 'AJUSTES', fila: { id: x.id, estado: 'ANULADO', motivo_anulacion: motivo, anulado_por: Sesion.actual.usuario_id, anulado_en: U.ahoraISO() } }]
        .concat(await movimientosAnulacion(x.id, motivo)));
      App.aviso('Ajuste ' + x.numero + ' anulado', 'ok');
      await App.refrescarContexto();
    } });
    botones.push({ t: 'Cerrar', clase: 'btn-principal' });
    modalAncho({ titulo: 'Ajuste ' + x.numero, html: html, botones: botones });
  }

  async function exportarAjustes(vista, det, motivos, nomSuc, nomUsu) {
    if (!vista.length) { App.aviso('No hay ajustes para exportar.', 'info'); return; }
    const c = await Catalogo.cargar();
    const porAjuste = new Map(vista.map(x => [String(x.id), x]));
    const filas = det.filter(d => porAjuste.has(String(d.ajuste_id))).map(d => {
      const x = porAjuste.get(String(d.ajuste_id));
      const p = c.porId.get(String(d.producto_id)) || {};
      return [txt(x.numero), fechaCorta(x.fecha), nomSuc(x.sucursal_id), x.tipo === 'CONTEO' ? 'Conteo' : 'Cantidad', motivos.get(String(x.motivo)) || x.motivo,
        txt(p.codigo), txt(p.nombre), n0(d.stock_sistema), d.cantidad_contada === '' ? '' : n0(d.cantidad_contada), n0(d.diferencia), n0(d.costo_unitario) || '',
        red(n0(d.diferencia) * n0(d.costo_unitario), 2), nomUsu(x.creado_por), anulado(x) ? 'ANULADO' : 'VIGENTE'];
    });
    Excel.descargar('Ajustes_' + hoy() + '.xlsx', [{
      nombre: 'Ajustes', titulo: 'Ajustes de inventario', subtitulo: fechaCorta(hoy()) + ' · ' + vista.length + ' ajuste(s) · una fila por producto',
      columnas: [{ t: 'Número', w: 22 }, { t: 'Fecha', w: 11 }, { t: 'Sucursal', w: 16 }, { t: 'Tipo', w: 9 }, { t: 'Motivo', w: 16 }, { t: 'Código', w: 12 }, { t: 'Producto', w: 36 },
        { t: 'Stock sistema', w: 11, tipo: 'num' }, { t: 'Contado', w: 10, tipo: 'num' }, { t: 'Diferencia', w: 10, tipo: 'num' }, { t: 'Costo c/u', w: 11, tipo: 'bs' },
        { t: 'Valor', w: 12, tipo: 'bs' }, { t: 'Usuario', w: 18 }, { t: 'Estado', w: 10 }],
      filas: filas
    }]);
  }

  // ============================================================
  //  "Ajustar stock" y "Registrar compra" dentro de Productos de la sucursal → Editar
  //  (fase5-productos.js avisa con el evento 'ferreteria:form-ps' al abrir el formulario)
  // ============================================================
  window.addEventListener('ferreteria:form-ps', ev => {
    const d = ev.detail || {};
    if ([AG, ADM, ALM].indexOf(rol()) < 0 || !d.modal || !d.producto || !d.sucursal) return;
    if (d.producto.estado === 'INACTIVO') return;
    const caja = $('.ps-stock', d.modal);
    if (!caja) return;
    const div = document.createElement('div');
    div.className = 'ps-botones';
    div.innerHTML = '<button type="button" class="btn btn-chico btn-azul" data-f6="ajuste">' + ico('sliders') + 'Ajustar stock</button>' +
      '<button type="button" class="btn btn-chico btn-borde" data-f6="compra">' + ico('download') + 'Compra</button>';
    caja.appendChild(div);
    div.addEventListener('click', e => {
      const b = e.target.closest('[data-f6]');
      if (!b) return;
      d.modal.remove();
      if (b.dataset.f6 === 'ajuste') formAjuste({ sucursalId: d.sucursal.id, tipo: 'CONTEO', productos: [d.producto], fija: true });
      else formCompra({ sucursalId: d.sucursal.id, productos: [d.producto] });
    });
  });

  window.F6 = {
    alcance: alcance, calcularCompra: calcularCompra, registrosCompra: registrosCompra, registrosAjuste: registrosAjuste,
    proveedoresDe: proveedoresDe, formProveedor: formProveedor, formCompra: formCompra, formAjuste: formAjuste,
    util: { txt: txt, num: num, n0: n0, red: red, fmt: fmt, norm: norm, mismo: mismo, activo: activo, hoy: hoy, fechaISO: fechaISO, sumarDias: sumarDias,
      fechaCorta: fechaCorta, campo: campo, campoNum: campoNum, campoLista: campoLista, lista: lista, mensaje: mensaje, modalAncho: modalAncho,
      contenedor: contenedor, vacio: vacio, leerNumero: leerNumero, icoX: icoX, volumenCaja: volumenCaja, opcionesPres: opcionesPres }
  };
})();
