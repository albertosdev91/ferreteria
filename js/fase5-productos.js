/**
 * ============================================================
 *  FASE 5: CATÁLOGO GENERAL, PRODUCTOS POR SUCURSAL, BUSCAR
 * ============================================================
 *  Pantallas:
 *   #/catalogo            Catálogo general (solo ADMIN_GENERAL): productos,
 *                         categorías, marcas, códigos de barras, imágenes.
 *   #/productos-sucursal  Productos de la sucursal activa (AG, ADMINISTRADOR, ALMACEN):
 *                         asignar, copiar de otra sucursal, ubicación, stock mínimo,
 *                         costo, precios, inventario inicial.
 *   #/buscar              Buscar producto y stock (todos los roles), con cámara o lector USB.
 *
 *  Para las próximas fases (ventas, compras, traspasos…):
 *    await Catalogo.cargar()            → { productos, porId, marcas, categorias, … }
 *    await Catalogo.porCodigo('7790…')  → { producto, presentacion, factor } o null
 *    await Catalogo.buscar('martillo')  → productos ordenados
 *    await Catalogo.stocks(sucursalId)  → Map producto_id → unidades
 *    Catalogo.factor(producto, 'CAJA')  → unidades por caja
 *    Catalogo.textoStock(240, producto) → "240 UND · 2 cajas"
 * ============================================================
 */
(function () {
  'use strict';

  const R = App.ROLES;
  const AG = R.AG, ADM = R.ADM, ALM = R.ALM, VEN = R.VEN;
  const esc = U.esc, ico = App.ico;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  // ============================================================
  //  UTILIDADES
  // ============================================================
  const txt = v => String(v == null ? '' : v).trim();
  const activo = x => !!x && x.estado !== 'INACTIVO';
  const mismo = (a, b) => String(a == null ? '' : a) === String(b == null ? '' : b);
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const codigoClave = s => String(s == null ? '' : s).replace(/\s+/g, '').toUpperCase();   // para comparar códigos
  const codigoLimpio = s => String(s == null ? '' : s).replace(/\s+/g, '');                // para guardar
  const num = v => {
    if (v === '' || v == null) return null;
    const n = Number(String(v).trim().replace(',', '.'));
    return isFinite(n) ? n : null;
  };
  const n0 = v => num(v) || 0;
  const redondear = (n, d) => { const f = Math.pow(10, d); return Math.round(n * f) / f; };
  const fmt = (n, dec) => (Number(n) || 0).toLocaleString('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: dec == null ? 3 : dec });
  const fmtNum = v => (v === '' || v == null ? '' : String(v));
  const rol = () => Sesion.actual.rol;
  const esAG = () => rol() === AG;
  const veCostos = () => rol() !== VEN;
  const editaPrecios = () => rol() === AG || rol() === ADM;
  const manejaSucursal = () => [AG, ADM, ALM].indexOf(rol()) >= 0;
  const porNombre = (a, b) => txt(a.nombre).localeCompare(txt(b.nombre), 'es');
  const precio = v => n0(v) > 0 ? U.bs(v) : '<span class="suave">—</span>';

  // Íconos de esta fase
  const ICO5 = {
    mas: 'M12 5v14M5 12h14',
    etiqueta: 'M3 3h8l10 10-8 8L3 11V3M7.5 7.5h.01',
    imagen: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15.5 9.5h.01',
    copiar: 'M8 8h12v12H8zM4 16V4h12',
    quitar: 'M18 6L6 18M6 6l12 12'
  };
  const icoX = n => ICO5[n] ? '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICO5[n] + '"/></svg>' : ico(n);

  function etiquetaEstado(estado, si, no) {
    return estado === 'INACTIVO' ? '<span class="etiqueta roja">' + (no || 'Inactivo') + '</span>' : '<span class="etiqueta verde">' + (si || 'Activo') + '</span>';
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

  /** Campo de formulario. op: { req, clase, tipo, ph, attrs, ayuda, area, idCampo } */
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
  /** Campo numérico (acepta coma o punto). */
  function campoNum(id, etiqueta, valor, op) {
    op = Object.assign({}, op || {});
    op.attrs = ' inputmode="decimal" autocomplete="off"' + (op.attrs || '');
    return campo(id, etiqueta, fmtNum(valor), op);
  }
  function lista(id, opciones, seleccionado, attrs) {
    return '<select class="entrada" id="' + id + '"' + (attrs || '') + '>' + opciones.map(o =>
      '<option value="' + esc(o[0]) + '"' + (mismo(o[0], seleccionado) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
  }
  function campoLista(id, etiqueta, opciones, seleccionado, op) {
    op = op || {};
    return '<div class="campo' + (op.clase ? ' ' + op.clase : '') + '">' +
      '<label for="' + id + '">' + esc(etiqueta) + '</label>' + lista(id, opciones, seleccionado, op.attrs) +
      (op.ayuda ? '<span class="ayuda">' + op.ayuda + '</span>' : '') + '</div>';
  }
  function mensaje(f, texto, tipo) {
    const m = $('.f-msg', f);
    m.innerHTML = texto ? '<div class="msg msg-' + (tipo || 'error') + '">' + esc(texto) + '</div>' : '';
    if (texto) m.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return false;
  }
  function modalAncho(op) {
    const f = App.modal(op);
    $('.modal', f).classList.add('ancho');
    return f;
  }
  function contenedor(el) {
    const c = document.createElement('div');
    el.appendChild(c);
    return c;
  }
  function vacio(icono, texto, boton) {
    return '<div class="tarjeta vacio">' + icoX(icono) + '<p>' + texto + '</p>' + (boton || '') + '</div>';
  }
  /** Lee un número de un campo. Lanza un error con mensaje claro si no es válido. */
  function leerNumero(f, id, etiqueta, op) {
    op = op || {};
    const el = $('#' + id, f);
    const t = el ? txt(el.value) : '';
    if (!t) {
      if (op.req) throw new Error('Escriba ' + etiqueta + '.');
      return '';
    }
    const n = num(t);
    if (n === null) throw new Error(etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1) + ': escriba solo números (ej. 12,50).');
    if (n < 0) throw new Error(etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1) + ' no puede ser negativo.');
    if (op.mayorCero && n <= 0) throw new Error(etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1) + ' debe ser mayor que 0.');
    return redondear(n, op.dec == null ? 2 : op.dec);
  }
  /** Campos que cambiaron (compara números como números). */
  function diferencias(antes, nuevo) {
    const r = {};
    Object.keys(nuevo).forEach(k => {
      const a = antes ? antes[k] : '', b = nuevo[k];
      const na = num(a), nb = num(b);
      const igual = na !== null && nb !== null ? Math.abs(na - nb) < 1e-9 : txt(a) === txt(b);
      if (!igual) r[k] = b;
    });
    return r;
  }
  const esPantallaFina = () => window.matchMedia && window.matchMedia('(pointer: fine)').matches;

  // Mantiene el cursor en el buscador cuando la pantalla se redibuja por una sincronización
  let focoPrevio = null;
  window.addEventListener('datos-actualizados', () => {
    const a = document.activeElement;
    focoPrevio = a && a.id && a.hasAttribute && a.hasAttribute('data-foco') ? { id: a.id, ini: a.selectionStart, fin: a.selectionEnd } : null;
  });
  function restaurarFoco(raiz) {
    const f = focoPrevio;
    focoPrevio = null;
    if (!f || document.querySelector('.modal-fondo, .escaner')) return;
    const i = raiz.querySelector('#' + f.id);
    if (!i) return;
    i.focus();
    try { i.setSelectionRange(f.ini, f.fin); } catch (e) { /* no aplica */ }
  }

  // ============================================================
  //  CATALOGO: datos compartidos (también para las próximas fases)
  // ============================================================
  let cache = null;
  window.addEventListener('datos-actualizados', () => { cache = null; });
  window.addEventListener('pendientes-cambiaron', () => { cache = null; });

  const PRESENTACIONES = [['codigo_barras_unidad', 'UNIDAD'], ['codigo_barras_paquete', 'PAQUETE'], ['codigo_barras_caja', 'CAJA']];
  const NOMBRE_PRES = { UNIDAD: 'unidad', PAQUETE: 'paquete', CAJA: 'caja' };

  async function cargar() {
    if (cache) return cache;
    const [productos, marcas, categorias, imagenes] = await Promise.all([
      Datos.listar('PRODUCTOS'), Datos.listar('MARCAS'), Datos.listar('CATEGORIAS'), Datos.listar('PRODUCTO_IMAGENES', activo)
    ]);
    productos.sort((a, b) => (a.estado === 'INACTIVO') - (b.estado === 'INACTIVO') || porNombre(a, b));
    const porId = new Map(productos.map(p => [String(p.id), p]));
    const marcaPorId = new Map(marcas.map(m => [String(m.id), m]));
    const catPorId = new Map(categorias.map(x => [String(x.id), x]));
    const codigos = new Map();      // código de barras → { producto, presentacion }
    const internos = new Map();     // código interno → producto
    const texto = new Map();        // texto para buscar
    productos.forEach(p => {
      PRESENTACIONES.forEach(([col, pres]) => {
        const k = codigoClave(p[col]);
        if (k && !codigos.has(k)) codigos.set(k, { producto: p, presentacion: pres });
      });
      const k = codigoClave(p.codigo);
      if (k && !internos.has(k)) internos.set(k, p);
      const m = marcaPorId.get(String(p.marca_id));
      texto.set(String(p.id), norm([p.codigo, p.nombre, m && m.nombre, p.codigo_barras_unidad, p.codigo_barras_paquete,
        p.codigo_barras_caja].join(' ')));
    });
    const imgs = new Map();
    imagenes.sort((a, b) => n0(a.orden) - n0(b.orden)).forEach(i => {
      const k = String(i.producto_id);
      if (!imgs.has(k)) imgs.set(k, []);
      imgs.get(k).push(i);
    });
    const rutaCategoria = id => {
      const partes = [];
      let x = catPorId.get(String(id)), g = 0;
      while (x && g++ < 10) { partes.unshift(x.nombre); x = x.categoria_padre_id ? catPorId.get(String(x.categoria_padre_id)) : null; }
      return partes.join(' › ');
    };
    cache = {
      productos: productos, porId: porId, marcas: marcas, categorias: categorias, marcaPorId: marcaPorId, catPorId: catPorId,
      codigos: codigos, internos: internos, texto: texto, imagenes: imgs, rutaCategoria: rutaCategoria,
      nombreMarca: id => { const m = marcaPorId.get(String(id)); return m ? m.nombre : ''; }
    };
    return cache;
  }

  function factor(p, presentacion) {
    if (presentacion === 'CAJA') return n0(p && p.unidades_por_caja) || 1;
    if (presentacion === 'PAQUETE') return n0(p && p.unidades_por_paquete) || 1;
    return 1;
  }

  /** Busca un código de barras (o el código interno). */
  async function porCodigo(codigo) {
    const k = codigoClave(codigo);
    if (!k) return null;
    const c = await cargar();
    const b = c.codigos.get(k);
    if (b) return { producto: b.producto, presentacion: b.presentacion, factor: factor(b.producto, b.presentacion), por: 'barras' };
    const p = c.internos.get(k);
    return p ? { producto: p, presentacion: 'UNIDAD', factor: 1, por: 'codigo' } : null;
  }

  /** Busca por palabras (en cualquier orden). op: { ids: Set, inactivos, categorias: Set, marca } */
  async function buscar(q, op) {
    op = op || {};
    const c = await cargar();
    const palabras = norm(q).split(/\s+/).filter(Boolean);
    const kq = codigoClave(q);
    const nq = norm(q);
    const r = [];
    c.productos.forEach(p => {
      if (!op.inactivos && !activo(p)) return;
      if (op.ids && !op.ids.has(String(p.id))) return;
      if (op.categorias && !op.categorias.has(String(p.categoria_id))) return;
      if (op.marca && !mismo(p.marca_id, op.marca)) return;
      const t = c.texto.get(String(p.id)) || '';
      if (palabras.some(w => t.indexOf(w) < 0)) return;
      let rango = 3;
      if (kq && (codigoClave(p.codigo) === kq || PRESENTACIONES.some(([col]) => codigoClave(p[col]) === kq))) rango = 0;
      else if (nq && norm(p.codigo).indexOf(nq) === 0) rango = 1;
      else if (nq && norm(p.nombre).indexOf(nq) === 0) rango = 2;
      r.push({ p: p, rango: rango });
    });
    r.sort((a, b) => a.rango - b.rango || porNombre(a.p, b.p));
    return r.map(x => x.p);
  }

  /**
   * Stock en UNIDADES (servidor + movimientos de este equipo aún no enviados).
   * Con sucursalId: Map producto_id → stock. Sin sucursalId: Map "sucursal|producto" → stock.
   */
  async function stocks(sucursalId) {
    const m = new Map();
    const clave = f => sucursalId ? String(f.producto_id) : f.sucursal_id + '|' + f.producto_id;
    (await Datos.listar('STOCK_ACTUAL', s => !sucursalId || mismo(s.sucursal_id, sucursalId)))
      .forEach(s => m.set(clave(s), Number(s.stock) || 0));
    (await Sesion.local.salida()).forEach(x => {
      if (x.tabla !== 'MOVIMIENTOS' || (sucursalId && !mismo(x.fila.sucursal_id, sucursalId))) return;
      const k = clave(x.fila);
      m.set(k, (m.get(k) || 0) + (Number(x.fila.cantidad) || 0));
    });
    m.forEach((v, k) => m.set(k, redondear(v, 3)));
    return m;
  }

  function textoStock(u, p) {
    u = Number(u) || 0;
    let s = fmt(u) + ' ' + ((p && p.unidad) || 'u');
    const caja = n0(p && p.unidades_por_caja);
    if (caja > 1 && Math.abs(u) >= caja) {
      const c = Math.trunc(u / caja);
      const r = redondear(u - c * caja, 3);
      s += ' · ' + fmt(c) + (Math.abs(c) === 1 ? ' caja' : ' cajas') + (r ? ' + ' + fmt(r) : '');
    }
    return s;
  }

  function imagenDe(p, c) {
    if (!p) return '';
    if (txt(p.imagen_principal_url)) return App.urlImagen(p.imagen_principal_url);
    const ex = c && c.imagenes.get(String(p.id));
    return ex && ex.length ? App.urlImagen(ex[0].url) : '';
  }
  function miniatura(p, c, clase) {
    const u = imagenDe(p, c);
    return '<span class="mini' + (clase ? ' ' + clase : '') + '">' + (u ? '<img src="' + esc(u) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '</span>';
  }

  function descendientes(c, id) {
    const s = new Set([String(id)]);
    let cambio = true;
    while (cambio) {
      cambio = false;
      c.categorias.forEach(x => {
        if (x.categoria_padre_id && s.has(String(x.categoria_padre_id)) && !s.has(String(x.id))) { s.add(String(x.id)); cambio = true; }
      });
    }
    return s;
  }

  /** Categorías en forma de árbol: [[id, texto con sangría, fila]] */
  function arbolCategorias(c, op) {
    op = op || {};
    const hijos = new Map();
    c.categorias.forEach(x => {
      const padre = x.categoria_padre_id && c.catPorId.has(String(x.categoria_padre_id)) ? String(x.categoria_padre_id) : '';
      if (!hijos.has(padre)) hijos.set(padre, []);
      hijos.get(padre).push(x);
    });
    hijos.forEach(l => l.sort(porNombre));
    const out = [];
    const visitar = (padre, nivel) => (hijos.get(padre) || []).forEach(x => {
      if (op.excluir && op.excluir.has(String(x.id))) return;
      const ver = activo(x) || op.inactivas || mismo(x.id, op.incluir);
      if (ver) out.push([x.id, '   '.repeat(nivel) + (nivel ? '└ ' : '') + x.nombre + (activo(x) ? '' : ' (inactiva)'), x]);
      if (nivel < 8) visitar(String(x.id), nivel + 1);
    });
    visitar('', 0);
    return out;
  }

  window.Catalogo = {
    cargar: cargar, porCodigo: porCodigo, buscar: buscar, stocks: stocks, factor: factor, textoStock: textoStock,
    imagen: imagenDe, normalizar: norm, codigoClave: codigoClave
  };

  // ============================================================
  //  PANTALLA: CATÁLOGO GENERAL (solo ADMIN_GENERAL)
  // ============================================================
  const fCat = { buscar: '', categoria: '', marca: '', estado: 'ACTIVO', limite: 50 };

  App.pantalla('catalogo', {
    refrescar: true,
    async render(el) {
      const raiz = contenedor(el);
      if (!esAG()) {
        raiz.innerHTML = vacio('lock', 'Solo el administrador general edita el catálogo general.');
        return;
      }
      const c = await cargar();
      const nSuc = new Map();
      (await Datos.listar('PRODUCTOS_SUCURSAL', activo)).forEach(x => nSuc.set(String(x.producto_id), (nSuc.get(String(x.producto_id)) || 0) + 1));
      const pend = await pendientesDe('PRODUCTOS');
      const nActivos = c.productos.filter(activo).length;

      raiz.innerHTML =
        '<div class="titulo"><div><h1>Catálogo general</h1><p>Lista única de productos para todas las empresas. ' +
        nActivos + ' producto(s) activo(s).</p></div>' +
        '<div class="acciones-fila"><button class="btn btn-borde" data-acc="categorias">' + icoX('etiqueta') + 'Categorías</button>' +
        '<button class="btn btn-borde" data-acc="marcas">' + icoX('etiqueta') + 'Marcas</button>' +
        '<button class="btn btn-principal" data-acc="nuevo">' + icoX('mas') + 'Nuevo producto</button></div></div>' +
        '<div class="filtros">' +
        '<div class="campo"><label for="catBuscar">Buscar (nombre, código o código de barras)</label>' +
        '<input class="entrada" id="catBuscar" data-foco placeholder="Ej. martillo 16 oz" value="' + esc(fCat.buscar) + '" autocomplete="off" enterkeyhint="search"></div>' +
        '<div class="campo corto"><label for="catCat">Categoría</label>' +
        lista('catCat', [['', 'Todas']].concat(arbolCategorias(c, { inactivas: true }).map(x => [x[0], x[1]])), fCat.categoria) + '</div>' +
        '<div class="campo corto"><label for="catMarca">Marca</label>' +
        lista('catMarca', [['', 'Todas']].concat(c.marcas.slice().sort(porNombre).map(m => [m.id, m.nombre + (activo(m) ? '' : ' (inactiva)')])), fCat.marca) + '</div>' +
        '<div class="campo corto"><label for="catEstado">Mostrar</label>' +
        lista('catEstado', [['ACTIVO', 'Activos'], ['INACTIVO', 'Inactivos'], ['TODOS', 'Todos']], fCat.estado) + '</div></div>' +
        '<div id="catLista"></div>';

      const iBuscar = $('#catBuscar', raiz);
      Escaner.boton(iBuscar, { enter: true, titulo: 'Escanee el producto' });

      const pintar = async () => {
        const vista = (await buscar(fCat.buscar, {
          inactivos: true,
          categorias: fCat.categoria ? descendientes(c, fCat.categoria) : null,
          marca: fCat.marca
        })).filter(p => fCat.estado === 'TODOS' || (fCat.estado === 'INACTIVO') === (p.estado === 'INACTIVO'));
        const cont = $('#catLista', raiz);
        if (!c.productos.length) {
          cont.innerHTML = vacio('book', '<b>El catálogo está vacío.</b><br>Cree el primer producto. (En la Fase 6 podrá importarlos desde Excel.)',
            '<button class="btn btn-principal" data-acc="nuevo" style="margin-top:12px">' + icoX('mas') + 'Nuevo producto</button>');
          return;
        }
        if (!vista.length) {
          const cod = codigoLimpio(fCat.buscar);
          cont.innerHTML = vacio('search', 'Ningún producto coincide.',
            cod && !/\s/.test(txt(fCat.buscar)) ? '<button class="btn btn-principal" data-acc="crearCon" data-cod="' + esc(cod) +
              '" style="margin-top:12px">' + icoX('mas') + 'Crear producto con el código ' + esc(cod) + '</button>' : '');
          return;
        }
        const mostrar = vista.slice(0, fCat.limite);
        cont.innerHTML = '<div class="tabla-env"><table class="tabla"><thead><tr><th></th><th>Código</th><th>Producto</th><th>Unidad</th>' +
          '<th>Empaque</th><th class="num">Sucursales</th><th>Estado</th><th></th></tr></thead><tbody>' +
          mostrar.map(p => {
            const inactivo = p.estado === 'INACTIVO';
            const emp = [n0(p.unidades_por_paquete) ? 'Paq. ' + fmt(p.unidades_por_paquete) : '', n0(p.unidades_por_caja) ? 'Caja ' + fmt(p.unidades_por_caja) : '']
              .filter(Boolean).join(' · ');
            const barras = PRESENTACIONES.map(([col]) => txt(p[col])).filter(Boolean).join(' · ');
            return '<tr class="clic' + (inactivo ? ' inactivo' : '') + '" data-acc="editar" data-id="' + esc(p.id) + '">' +
              '<td style="width:52px">' + miniatura(p, c) + '</td>' +
              '<td><b>' + esc(p.codigo) + '</b></td>' +
              '<td><b>' + esc(p.nombre) + '</b>' + etiquetaEnvio(pend[p.id]) +
              '<span class="sub">' + esc([c.nombreMarca(p.marca_id), c.rutaCategoria(p.categoria_id)].filter(Boolean).join(' · ') || 'Sin marca ni categoría') + '</span>' +
              (barras ? '<span class="sub mono">' + esc(barras) + '</span>' : '') + '</td>' +
              '<td>' + esc(p.unidad || '—') + '</td><td>' + esc(emp || '—') + '</td>' +
              '<td class="num">' + (nSuc.get(String(p.id)) || 0) + '</td>' +
              '<td>' + etiquetaEstado(p.estado) + '</td>' +
              '<td class="acc"><div class="acciones-fila"><button class="btn btn-chico btn-borde" data-acc="editar" data-id="' + esc(p.id) + '">Editar</button>' +
              '<button class="btn btn-chico ' + (inactivo ? 'btn-borde' : 'btn-peligro') + '" data-acc="estado" data-id="' + esc(p.id) + '">' +
              (inactivo ? 'Activar' : 'Desactivar') + '</button></div></td></tr>';
          }).join('') + '</tbody></table></div>' +
          (vista.length > mostrar.length ? '<div class="mas-centro"><button class="btn btn-borde" data-acc="mas">Mostrar más (' +
            (vista.length - mostrar.length) + ' restantes)</button></div>' : '<p class="nota" style="margin-top:10px">' + vista.length + ' producto(s).</p>');
      };
      await pintar();
      restaurarFoco(raiz);

      let espera = null;
      iBuscar.oninput = () => { fCat.buscar = iBuscar.value; fCat.limite = 50; clearTimeout(espera); espera = setTimeout(pintar, 150); };
      iBuscar.onkeydown = async ev => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        const r = await porCodigo(iBuscar.value);
        if (r) { fCat.buscar = ''; iBuscar.value = ''; await pintar(); formProducto(r.producto); }
      };
      $('#catCat', raiz).onchange = e => { fCat.categoria = e.target.value; fCat.limite = 50; pintar(); };
      $('#catMarca', raiz).onchange = e => { fCat.marca = e.target.value; fCat.limite = 50; pintar(); };
      $('#catEstado', raiz).onchange = e => { fCat.estado = e.target.value; fCat.limite = 50; pintar(); };

      raiz.onclick = async ev => {
        const b = ev.target.closest('[data-acc]');
        if (!b) return;
        ev.stopPropagation();
        const p = b.dataset.id ? c.porId.get(String(b.dataset.id)) : null;
        switch (b.dataset.acc) {
          case 'nuevo': return formProducto(null);
          case 'crearCon': return formProducto(null, { codigoBarras: b.dataset.cod });
          case 'editar': return formProducto(p);
          case 'estado': return cambiarEstadoProducto(p, nSuc.get(String(p.id)) || 0);
          case 'categorias': return gestionarMaestro('CATEGORIAS');
          case 'marcas': return gestionarMaestro('MARCAS');
          case 'mas': fCat.limite += 100; return pintar();
        }
      };
    }
  });

  async function cambiarEstadoProducto(p, nSuc) {
    const activar = p.estado === 'INACTIVO';
    const ok = await App.confirmar(activar ? 'Activar producto' : 'Desactivar producto', activar
      ? '«' + p.nombre + '» volverá a estar disponible en el catálogo.'
      : '«' + p.nombre + '» ya no aparecerá para asignar ni vender. No se borra nada (stock e historial se conservan).' +
        (nSuc ? ' Está asignado a ' + nSuc + ' sucursal(es).' : ''),
      activar ? 'Activar' : 'Desactivar', activar ? 'btn-principal' : 'btn-peligro');
    if (!ok) return;
    await Datos.guardar('PRODUCTOS', { id: p.id, estado: activar ? 'ACTIVO' : 'INACTIVO' });
    App.aviso(activar ? 'Producto activado' : 'Producto desactivado', 'ok');
    await App.refrescarContexto();
  }

  function sugerirCodigo(productos) {
    let n = 0;
    productos.forEach(p => { const m = /^P(\d+)$/i.exec(txt(p.codigo)); if (m) n = Math.max(n, Number(m[1])); });
    return 'P' + String(n + 1).padStart(5, '0');
  }

  function opcionesMarcas(c, sel) {
    return [['', '— Sin marca —']].concat(c.marcas.filter(m => activo(m) || mismo(m.id, sel)).sort(porNombre).map(m => [m.id, m.nombre]));
  }
  function opcionesCategorias(c, sel) {
    return [['', '— Sin categoría —']].concat(arbolCategorias(c, { incluir: sel }).map(x => [x[0], x[1]]));
  }

  function filaImagen(url, id) {
    const u = txt(url) ? App.urlImagen(url) : '';
    return '<div class="img-fila"' + (id ? ' data-id="' + esc(id) + '"' : '') + '>' +
      '<span class="mini">' + (u ? '<img src="' + esc(u) + '" alt="" onerror="this.remove()">' : '') + '</span>' +
      '<input class="entrada" value="' + esc(url || '') + '" placeholder="https://drive.google.com/file/d/…" spellcheck="false">' +
      '<button type="button" class="btn btn-icono" data-quitar title="Quitar" aria-label="Quitar imagen">' + icoX('quitar') + '</button></div>';
  }

  async function formProducto(p, op) {
    op = op || {};
    const nuevo = !p;
    p = p || {};
    const c = await cargar();
    const ctx = App.contexto;
    let unidades = (await Datos.lista('UNIDAD')).map(x => [x.codigo, x.codigo + ' — ' + x.nombre]);
    if (!unidades.length) unidades = [['UND', 'UND — Unidad']];
    if (p.unidad && !unidades.some(x => mismo(x[0], p.unidad))) unidades.unshift([p.unidad, p.unidad]);
    const extras = nuevo ? [] : (c.imagenes.get(String(p.id)) || []);

    const html = '<div class="form-2">' +
      '<div class="seccion-form">Identificación</div>' +
      campo('pCodigo', 'Código interno', nuevo ? sugerirCodigo(c.productos) : p.codigo, { req: true,
        attrs: ' maxlength="30" autocapitalize="characters" spellcheck="false" autocomplete="off"',
        ayuda: 'Único. Letras, números, punto o guion. Se sugiere uno automático.' }) +
      campoLista('pUnidad', 'Unidad de medida', unidades, p.unidad || 'UND', { ayuda: 'El stock siempre se cuenta en esta unidad.' }) +
      campo('pNombre', 'Nombre del producto', p.nombre, { req: true, clase: 'todo', ph: 'Ej. Martillo carpintero 16 oz mango de fibra',
        attrs: ' maxlength="120" autocomplete="off"' }) +
      '<div class="campo"><label for="pMarca">Marca</label><div class="con-mas">' + lista('pMarca', opcionesMarcas(c, p.marca_id), p.marca_id || '') +
      '<button type="button" class="btn btn-borde" data-nueva="MARCAS" title="Crear marca" aria-label="Crear marca">' + icoX('mas') + '</button></div></div>' +
      '<div class="campo"><label for="pCategoria">Categoría</label><div class="con-mas">' + lista('pCategoria', opcionesCategorias(c, p.categoria_id), p.categoria_id || '') +
      '<button type="button" class="btn btn-borde" data-nueva="CATEGORIAS" title="Crear categoría" aria-label="Crear categoría">' + icoX('mas') + '</button></div></div>' +

      '<div class="seccion-form">Códigos de barras</div>' +
      '<p class="nota todo">Con <b>lector USB</b>: toque el campo y escanee. Con el <b>celular</b>: botón de cámara. Puede dejarlos vacíos.</p>' +
      campo('pBarUni', 'De la unidad', nuevo && op.codigoBarras ? op.codigoBarras : p.codigo_barras_unidad, { attrs: ' data-barras autocomplete="off" spellcheck="false"' }) +
      campo('pBarPaq', 'Del paquete', p.codigo_barras_paquete, { attrs: ' data-barras autocomplete="off" spellcheck="false"' }) +
      campo('pBarCaja', 'De la caja', p.codigo_barras_caja, { attrs: ' data-barras autocomplete="off" spellcheck="false"' }) +

      '<div class="seccion-form">Empaque</div>' +
      campoNum('pUPaq', 'Unidades por paquete', p.unidades_por_paquete, { ph: 'Ej. 12', ayuda: 'Vacío si no se vende en paquete.' }) +
      campoNum('pUCaja', 'Unidades por caja', p.unidades_por_caja, { ph: 'Ej. 100', ayuda: 'Vacío si no viene en caja.' }) +
      '<div class="campo todo"><label>Medidas de la caja (cm)</label><div class="tres">' +
      '<input class="entrada" id="pAncho" inputmode="decimal" placeholder="Ancho" aria-label="Ancho en cm" value="' + esc(fmtNum(p.caja_ancho_cm)) + '">' +
      '<input class="entrada" id="pAlto" inputmode="decimal" placeholder="Alto" aria-label="Alto en cm" value="' + esc(fmtNum(p.caja_alto_cm)) + '">' +
      '<input class="entrada" id="pProf" inputmode="decimal" placeholder="Profundidad" aria-label="Profundidad en cm" value="' + esc(fmtNum(p.caja_prof_cm)) + '">' +
      '</div><span class="ayuda" id="pVol">Sirven para repartir el transporte por volumen en las compras.</span></div>' +

      '<div class="seccion-form">Imágenes</div>' +
      '<div class="campo todo"><label for="pImg">Imagen principal</label><div class="img-fila principal">' +
      '<span class="mini grande" id="pImgVista"></span>' +
      '<input class="entrada" id="pImg" value="' + esc(p.imagen_principal_url || '') + '" placeholder="https://drive.google.com/file/d/…" spellcheck="false"></div>' +
      '<span class="ayuda">Suba la foto a Google Drive → <b>Compartir</b> → <b>"Cualquier persona con el enlace"</b> → <b>Copiar enlace</b> → péguelo aquí.</span></div>' +
      '<div class="campo todo"><label>Más imágenes</label><div id="pExtras">' + extras.map(i => filaImagen(i.url, i.id)).join('') + '</div>' +
      '<button type="button" class="btn btn-borde btn-chico" id="pMasImg" style="align-self:flex-start">' + icoX('imagen') + 'Agregar otra imagen</button></div>' +
      campo('pDesc', 'Descripción', p.descripcion, { clase: 'todo', area: true, ph: 'Medidas, material, uso…' }) +

      (!nuevo ? '<div class="seccion-form">Estado</div>' + campoLista('pEstado', 'Estado', [['ACTIVO', 'Activo'], ['INACTIVO', 'Inactivo']], p.estado || 'ACTIVO') : '') +
      (nuevo && ctx.sucursal ? '<div class="campo todo"><label class="check"><input type="checkbox" id="pAsignar" checked><span><b>Asignarlo también a «' +
        esc(ctx.sucursal.nombre) + '»</b><small>Así aparece de inmediato en esa sucursal. Los precios se cargan en Productos de la sucursal.</small></span></label></div>' : '') +
      '</div><div class="f-msg"></div>';

    const f = modalAncho({
      titulo: nuevo ? 'Nuevo producto' : 'Editar producto · ' + p.codigo,
      html: html,
      botones: [{ t: 'Cancelar' }, { t: nuevo ? 'Crear producto' : 'Guardar', clase: 'btn-principal', accion: m => guardarProducto(m, nuevo ? null : p, extras) }]
    });

    // Código en mayúsculas
    const iCod = $('#pCodigo', f);
    iCod.oninput = () => { iCod.value = iCod.value.toUpperCase().replace(/\s/g, ''); };
    // Códigos de barras: cámara + Enter pasa al siguiente campo (lectores USB)
    const barras = $$('[data-barras]', f);
    barras.forEach((i, n) => {
      Escaner.boton(i, { titulo: 'Escanee el código de barras' });
      i.addEventListener('keydown', ev => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        (barras[n + 1] || $('#pUPaq', f)).focus();
      });
    });
    // Volumen de la caja
    const vol = () => {
      const a = num($('#pAncho', f).value), b = num($('#pAlto', f).value), d = num($('#pProf', f).value);
      $('#pVol', f).textContent = a && b && d
        ? 'Volumen de la caja: ' + fmt(a * b * d / 1e6, 4) + ' m³'
        : 'Sirven para repartir el transporte por volumen en las compras.';
    };
    ['pAncho', 'pAlto', 'pProf'].forEach(id => { $('#' + id, f).oninput = vol; });
    vol();
    // Vista previa de imágenes
    const vistaPrincipal = () => {
      const u = txt($('#pImg', f).value);
      $('#pImgVista', f).innerHTML = u ? '<img src="' + esc(App.urlImagen(u)) + '" alt="" onerror="this.remove()">' : '';
    };
    $('#pImg', f).oninput = vistaPrincipal;
    vistaPrincipal();
    const cajaExtras = $('#pExtras', f);
    $('#pMasImg', f).onclick = () => {
      cajaExtras.insertAdjacentHTML('beforeend', filaImagen('', ''));
      $('.img-fila:last-child input', cajaExtras).focus();
    };
    cajaExtras.addEventListener('click', ev => { const b = ev.target.closest('[data-quitar]'); if (b) b.closest('.img-fila').remove(); });
    cajaExtras.addEventListener('input', ev => {
      const fila = ev.target.closest('.img-fila');
      const u = txt(ev.target.value);
      $('.mini', fila).innerHTML = u ? '<img src="' + esc(App.urlImagen(u)) + '" alt="" onerror="this.remove()">' : '';
    });
    // Crear marca / categoría sin salir del formulario
    $$('[data-nueva]', f).forEach(b => {
      b.onclick = async () => {
        const tabla = b.dataset.nueva;
        const id = await editarMaestro(tabla, null);
        if (!id) return;
        const c2 = await cargar();
        const sel = $(tabla === 'MARCAS' ? '#pMarca' : '#pCategoria', f);
        sel.innerHTML = (tabla === 'MARCAS' ? opcionesMarcas(c2, id) : opcionesCategorias(c2, id))
          .map(o => '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>').join('');
        sel.value = id;
      };
    });
  }

  async function guardarProducto(f, p, extrasPrevias) {
    try {
      const nuevo = !p;
      const c = await cargar();
      const v = id => txt($('#' + id, f).value);
      const d = {
        codigo: v('pCodigo').toUpperCase().replace(/\s/g, ''), nombre: v('pNombre'), unidad: v('pUnidad'),
        marca_id: v('pMarca'), categoria_id: v('pCategoria'),
        codigo_barras_unidad: codigoLimpio(v('pBarUni')), codigo_barras_paquete: codigoLimpio(v('pBarPaq')),
        codigo_barras_caja: codigoLimpio(v('pBarCaja')),
        descripcion: v('pDesc'), imagen_principal_url: v('pImg')
      };
      if (!d.codigo) return mensaje(f, 'Escriba el código interno del producto.');
      if (!/^[A-Z0-9._\-\/]{1,30}$/.test(d.codigo)) return mensaje(f, 'El código interno solo puede tener letras, números, punto, guion o barra (sin espacios).');
      if (!d.nombre) return mensaje(f, 'Escriba el nombre del producto.');
      const otros = c.productos.filter(x => nuevo || !mismo(x.id, p.id));
      const repetido = otros.find(x => codigoClave(x.codigo) === codigoClave(d.codigo));
      if (repetido) return mensaje(f, 'El código ' + d.codigo + ' ya lo usa «' + repetido.nombre + '».');
      if (otros.some(x => norm(x.nombre) === norm(d.nombre) && mismo(x.marca_id, d.marca_id))) {
        if (!(await App.confirmar('Nombre repetido', 'Ya existe otro producto llamado «' + d.nombre + '» con la misma marca. ¿Guardar de todos modos?', 'Guardar'))) return false;
      }

      // Números del empaque
      d.unidades_por_paquete = leerNumero(f, 'pUPaq', 'las unidades por paquete', { dec: 3, mayorCero: true });
      d.unidades_por_caja = leerNumero(f, 'pUCaja', 'las unidades por caja', { dec: 3, mayorCero: true });
      d.caja_ancho_cm = leerNumero(f, 'pAncho', 'el ancho de la caja', { mayorCero: true });
      d.caja_alto_cm = leerNumero(f, 'pAlto', 'el alto de la caja', { mayorCero: true });
      d.caja_prof_cm = leerNumero(f, 'pProf', 'la profundidad de la caja', { mayorCero: true });
      if (d.codigo_barras_paquete && !(n0(d.unidades_por_paquete) > 1)) return mensaje(f, 'Tiene código de barras del paquete: indique cuántas unidades trae el paquete (más de 1).');
      if (d.codigo_barras_caja && !(n0(d.unidades_por_caja) > 1)) return mensaje(f, 'Tiene código de barras de la caja: indique cuántas unidades trae la caja (más de 1).');

      // Códigos de barras: no repetidos en el mismo producto ni en otro
      const propios = PRESENTACIONES.map(([col, pres]) => [d[col], pres]).filter(x => x[0]);
      for (let i = 0; i < propios.length; i++) {
        for (let j = i + 1; j < propios.length; j++) {
          if (codigoClave(propios[i][0]) === codigoClave(propios[j][0])) {
            return mensaje(f, 'El código ' + propios[i][0] + ' está repetido en ' + NOMBRE_PRES[propios[i][1]] + ' y ' + NOMBRE_PRES[propios[j][1]] + '. Cada presentación necesita un código distinto.');
          }
        }
        const k = codigoClave(propios[i][0]);
        const ya = c.codigos.get(k);
        if (ya && (nuevo || !mismo(ya.producto.id, p.id))) {
          return mensaje(f, 'El código de barras ' + propios[i][0] + ' ya es de «' + ya.producto.nombre + '» (' + NOMBRE_PRES[ya.presentacion] + ').');
        }
        const int = c.internos.get(k);
        if (int && (nuevo || !mismo(int.id, p.id))) return mensaje(f, 'El código de barras ' + propios[i][0] + ' es el código interno de «' + int.nombre + '».');
      }
      const choque = c.codigos.get(codigoClave(d.codigo));
      if (choque && (nuevo || !mismo(choque.producto.id, p.id))) return mensaje(f, 'El código interno ' + d.codigo + ' es el código de barras de «' + choque.producto.nombre + '».');

      // Imágenes
      const urls = [d.imagen_principal_url].concat($$('#pExtras .img-fila input', f).map(i => txt(i.value)));
      if (urls.some(u => u && !/^https?:\/\//i.test(u))) return mensaje(f, 'Los enlaces de imagen deben empezar con https://');

      const id = nuevo ? U.uuid() : p.id;
      if (!nuevo && $('#pEstado', f)) d.estado = $('#pEstado', f).value;
      if (nuevo) d.estado = 'ACTIVO';
      const registros = [{ tabla: 'PRODUCTOS', fila: Object.assign({ id: id }, nuevo ? d : diferencias(p, d)) }];

      const filas = $$('#pExtras .img-fila', f).map((el, i) => ({ id: el.dataset.id || '', url: txt($('input', el).value), orden: i + 1 })).filter(x => x.url);
      extrasPrevias.forEach(prev => {
        const ahora = filas.find(x => mismo(x.id, prev.id));
        if (!ahora) registros.push({ tabla: 'PRODUCTO_IMAGENES', fila: { id: prev.id, estado: 'INACTIVO' } });
        else if (txt(prev.url) !== ahora.url || n0(prev.orden) !== ahora.orden) {
          registros.push({ tabla: 'PRODUCTO_IMAGENES', fila: { id: prev.id, url: ahora.url, orden: ahora.orden } });
        }
      });
      filas.filter(x => !x.id).forEach(x => registros.push({ tabla: 'PRODUCTO_IMAGENES',
        fila: { id: U.uuid(), producto_id: id, url: x.url, orden: x.orden, estado: 'ACTIVO' } }));

      const asignar = nuevo && $('#pAsignar', f) && $('#pAsignar', f).checked && App.contexto.sucursal;
      if (asignar) {
        const s = App.contexto.sucursal;
        registros.push({ tabla: 'PRODUCTOS_SUCURSAL', fila: { id: U.uuid(), empresa_id: s.empresa_id, sucursal_id: s.id, producto_id: id,
          ubicacion: '', stock_minimo: '', producto_especial: 'NO', estado: 'ACTIVO' } });
      }
      if (!nuevo && registros.length === 1 && Object.keys(registros[0].fila).length === 1) {
        App.aviso('Sin cambios', 'info');
        return true;
      }
      await Datos.guardarVarios(registros);
      App.aviso(nuevo ? 'Producto creado' + (asignar ? ' y asignado a ' + App.contexto.sucursal.nombre : '') : 'Producto guardado', 'ok');
      await App.refrescarContexto();
      return true;
    } catch (err) {
      console.error(err);
      return mensaje(f, err.message || String(err));
    }
  }

  // ---------- Categorías y marcas ----------
  async function gestionarMaestro(tabla) {
    const esCat = tabla === 'CATEGORIAS';
    const est = { buscar: '', estado: 'ACTIVO' };
    const f = modalAncho({
      titulo: esCat ? 'Categorías' : 'Marcas',
      html: '<div class="filtros">' +
        '<div class="campo"><label for="mBuscar">Buscar</label><input class="entrada" id="mBuscar" autocomplete="off"></div>' +
        '<div class="campo corto"><label for="mEstado">Mostrar</label>' + lista('mEstado', [['ACTIVO', 'Activas'], ['INACTIVO', 'Inactivas'], ['TODAS', 'Todas']], 'ACTIVO') + '</div>' +
        '<button class="btn btn-principal" data-acc="nueva">' + icoX('mas') + (esCat ? 'Nueva categoría' : 'Nueva marca') + '</button></div>' +
        (esCat ? '<p class="nota">Puede crear subcategorías: al crear o editar, elija en qué categoría va "dentro".</p>' : '') +
        '<div id="mLista"></div>',
      botones: [{ t: 'Cerrar', clase: 'btn-principal' }]
    });
    const pintar = async () => {
      const c = await cargar();
      const uso = new Map();
      c.productos.filter(activo).forEach(p => {
        const k = String(esCat ? p.categoria_id : p.marca_id);
        uso.set(k, (uso.get(k) || 0) + 1);
      });
      const b = norm(est.buscar);
      const filas = (esCat ? arbolCategorias(c, { inactivas: true }).map(x => x[2]) : c.marcas.slice().sort(porNombre))
        .filter(x => (est.estado === 'TODAS' || (est.estado === 'INACTIVO') === (x.estado === 'INACTIVO')) && (!b || norm(x.nombre).indexOf(b) >= 0));
      $('#mLista', f).innerHTML = !filas.length ? '<p class="vacio">' + ((esCat ? c.categorias : c.marcas).length ? 'Nada coincide.' : 'Todavía no hay ninguna.') + '</p>'
        : '<div class="tabla-env"><table class="tabla"><thead><tr><th>Nombre</th>' + (esCat ? '<th>Ruta</th>' : '') +
          '<th class="num">Productos</th><th>Estado</th><th></th></tr></thead><tbody>' +
          filas.map(x => '<tr' + (activo(x) ? '' : ' class="inactivo"') + '><td><b>' + esc(x.nombre) + '</b></td>' +
            (esCat ? '<td>' + esc(c.rutaCategoria(x.id)) + '</td>' : '') +
            '<td class="num">' + (uso.get(String(x.id)) || 0) + '</td><td>' + etiquetaEstado(x.estado, 'Activa', 'Inactiva') + '</td>' +
            '<td class="acc"><div class="acciones-fila"><button class="btn btn-chico btn-borde" data-acc="editar" data-id="' + esc(x.id) + '">Editar</button>' +
            '<button class="btn btn-chico ' + (activo(x) ? 'btn-peligro' : 'btn-borde') + '" data-acc="estado" data-id="' + esc(x.id) + '">' +
            (activo(x) ? 'Desactivar' : 'Activar') + '</button></div></td></tr>').join('') + '</tbody></table></div>';
    };
    $('#mBuscar', f).oninput = e => { est.buscar = e.target.value; pintar(); };
    $('#mEstado', f).onchange = e => { est.estado = e.target.value; pintar(); };
    f.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-acc]');
      if (!b) return;
      const c = await cargar();
      const x = (esCat ? c.categorias : c.marcas).find(y => mismo(y.id, b.dataset.id));
      if (b.dataset.acc === 'nueva') { if (await editarMaestro(tabla, null)) pintar(); }
      else if (b.dataset.acc === 'editar') { if (await editarMaestro(tabla, x)) pintar(); }
      else if (b.dataset.acc === 'estado') {
        const n = c.productos.filter(p => activo(p) && mismo(esCat ? p.categoria_id : p.marca_id, x.id)).length;
        if (activo(x) && !(await App.confirmar('Desactivar', '«' + x.nombre + '» ya no aparecerá para elegir.' +
          (n ? ' Los ' + n + ' producto(s) que la usan no cambian.' : ''), 'Desactivar', 'btn-peligro'))) return;
        await Datos.guardar(tabla, { id: x.id, estado: activo(x) ? 'INACTIVO' : 'ACTIVO' });
        pintar();
      }
    });
    pintar();
  }

  /** Crear / editar una marca o categoría. Devuelve el id guardado (o null). */
  function editarMaestro(tabla, x) {
    return new Promise(async listo => {
      const esCat = tabla === 'CATEGORIAS';
      const c = await cargar();
      const nueva = !x;
      x = x || {};
      const excluir = nueva ? null : descendientes(c, x.id);
      const html = campo('xNombre', 'Nombre', x.nombre, { req: true, attrs: ' maxlength="60" autocomplete="off"' }) +
        (esCat ? campoLista('xPadre', 'Dentro de', [['', '— Ninguna (categoría principal) —']].concat(
          arbolCategorias(c, { excluir: excluir, incluir: x.categoria_padre_id }).map(y => [y[0], y[1]])), x.categoria_padre_id || '',
          { ayuda: 'Para subcategorías. Ej.: "Destornilladores" dentro de "Herramientas manuales".' }) : '') +
        '<div class="f-msg"></div>';
      let resultado = null;
      App.modal({
        titulo: (nueva ? 'Nueva ' : 'Editar ') + (esCat ? 'categoría' : 'marca'),
        html: html,
        botones: [{ t: 'Cancelar', accion: () => listo(null) }, { t: 'Guardar', clase: 'btn-principal', accion: async m => {
          const nombre = txt($('#xNombre', m).value);
          const padre = esCat ? $('#xPadre', m).value : '';
          if (!nombre) return mensaje(m, 'Escriba el nombre.');
          const lista2 = esCat ? c.categorias : c.marcas;
          if (lista2.some(y => !mismo(y.id, x.id) && norm(y.nombre) === norm(nombre) && (!esCat || mismo(y.categoria_padre_id, padre)))) {
            return mensaje(m, 'Ya existe ' + (esCat ? 'una categoría' : 'una marca') + ' con ese nombre' + (esCat ? ' en ese mismo lugar.' : '.'));
          }
          const fila = { nombre: nombre };
          if (esCat) fila.categoria_padre_id = padre;
          if (nueva) { fila.id = U.uuid(); fila.estado = 'ACTIVO'; } else fila.id = x.id;
          await Datos.guardar(tabla, fila);
          App.aviso(esCat ? 'Categoría guardada' : 'Marca guardada', 'ok');
          resultado = fila.id;
          listo(resultado);
        } }]
      });
    });
  }

  // ============================================================
  //  PANTALLA: PRODUCTOS DE LA SUCURSAL
  // ============================================================
  const fPS = { buscar: '', categoria: '', vista: 'TODOS', limite: 50 };
  const VISTAS_PS = [['TODOS', 'Todos los asignados'], ['BAJO', 'Stock bajo'], ['CERO', 'Sin stock'], ['ESPECIAL', 'Productos especiales'],
    ['SIN_PRECIO', 'Sin precio'], ['SIN_UBICACION', 'Sin ubicación'], ['INACTIVO', 'Desasignados']];

  /** Productos de una sucursal con su stock y avisos. */
  async function itemsSucursal(sucursalId) {
    const c = await cargar();
    const filas = await Datos.listar('PRODUCTOS_SUCURSAL', x => mismo(x.sucursal_id, sucursalId));
    const stock = await stocks(sucursalId);
    return filas.map(ps => {
      const p = c.porId.get(String(ps.producto_id));
      if (!p) return null;
      const s = stock.get(String(ps.producto_id)) || 0;
      const min = n0(ps.stock_minimo);
      return { ps: ps, p: p, stock: s, activo: activo(ps), bajo: min > 0 && s <= min, cero: s <= 0,
        especial: ps.producto_especial === 'SI', sinPrecio: !(n0(ps.precio_unidad) > 0), sinUbicacion: !txt(ps.ubicacion) };
    }).filter(Boolean);
  }

  App.pantalla('productos-sucursal', {
    refrescar: true,
    async render(el) {
      const ctx = App.contexto;
      const suc = ctx.sucursal;
      const raiz = contenedor(el);
      if (!suc) {
        raiz.innerHTML = '<div class="titulo"><div><h1>Productos de la sucursal</h1></div></div>' +
          vacio('store', 'Elija una sucursal (botón de arriba) para ver sus productos.');
        return;
      }
      const c = await cargar();
      const items = await itemsSucursal(suc.id);
      const act = items.filter(i => i.activo);
      const pend = await pendientesDe('PRODUCTOS_SUCURSAL');
      const valor = act.reduce((t, i) => t + Math.max(i.stock, 0) * n0(i.ps.costo_promedio), 0);
      const cuenta = { BAJO: act.filter(i => i.bajo).length, CERO: act.filter(i => i.cero).length, ESPECIAL: act.filter(i => i.especial).length };

      const tile = (vista, titulo, cifra, clase) => '<button class="tarjeta tile' + (fPS.vista === vista ? ' elegida' : '') + '" data-vista="' + vista + '">' +
        '<span>' + titulo + '</span><b class="cifra' + (clase ? ' ' + clase : '') + '">' + cifra + '</b></button>';

      raiz.innerHTML =
        '<div class="titulo"><div><h1>Productos de la sucursal</h1><p>' + esc(suc.nombre) +
        (suc.es_central === 'SI' ? ' (central)' : '') + ' · stock en unidades, precios en Bs.</p></div>' +
        '<div class="acciones-fila">' +
        (ctx.sucursales.length > 1 ? '<button class="btn btn-borde" data-acc="copiar">' + icoX('copiar') + 'Copiar de otra sucursal</button>' : '') +
        '<button class="btn btn-principal" data-acc="asignar">' + icoX('mas') + 'Asignar productos</button></div></div>' +
        (!editaPrecios() ? '<div class="msg msg-info">Su rol puede ver costos y precios, pero no cambiar los precios.</div>' : '') +
        '<div class="tiles">' +
        tile('TODOS', 'Asignados', act.length) +
        tile('BAJO', 'Stock bajo', cuenta.BAJO, cuenta.BAJO ? 'amarilla' : '') +
        tile('CERO', 'Sin stock', cuenta.CERO, cuenta.CERO ? 'roja' : '') +
        tile('ESPECIAL', 'Especiales', cuenta.ESPECIAL) +
        (veCostos() ? '<div class="tarjeta tile"><span>Valor del inventario (al costo)</span><b class="cifra chica">' + U.bs(valor) + '</b></div>' : '') +
        '</div>' +
        '<div class="filtros">' +
        '<div class="campo"><label for="psBuscar">Buscar (nombre, código, código de barras o ubicación)</label>' +
        '<input class="entrada" id="psBuscar" data-foco value="' + esc(fPS.buscar) + '" autocomplete="off" enterkeyhint="search" placeholder="Escriba o escanee"></div>' +
        '<div class="campo corto"><label for="psCat">Categoría</label>' +
        lista('psCat', [['', 'Todas']].concat(arbolCategorias(c).map(x => [x[0], x[1]])), fPS.categoria) + '</div>' +
        '<div class="campo corto"><label for="psVista">Mostrar</label>' + lista('psVista', VISTAS_PS, fPS.vista) + '</div></div>' +
        '<div id="psLista"></div>';

      const iBuscar = $('#psBuscar', raiz);
      Escaner.boton(iBuscar, { enter: true, titulo: 'Escanee el producto' });

      const pintar = async () => {
        const cont = $('#psLista', raiz);
        if (!items.length) {
          cont.innerHTML = vacio('box', '<b>Esta sucursal todavía no tiene productos.</b><br>Use <b>Asignar productos</b> para elegirlos del catálogo general' +
            (ctx.sucursales.length > 1 ? ' o <b>Copiar de otra sucursal</b>.' : '.'),
            '<button class="btn btn-principal" data-acc="asignar" style="margin-top:12px">' + icoX('mas') + 'Asignar productos</button>');
          return;
        }
        const ids = new Set();
        const b = norm(fPS.buscar);
        const porUbic = b ? new Set(items.filter(i => norm(i.ps.ubicacion).indexOf(b) >= 0).map(i => String(i.p.id))) : null;
        (await buscar(fPS.buscar, { inactivos: true, categorias: fPS.categoria ? descendientes(c, fPS.categoria) : null })).forEach(p => ids.add(String(p.id)));
        if (porUbic) porUbic.forEach(id => { if (!fPS.categoria || descendientes(c, fPS.categoria).has(String(c.porId.get(id).categoria_id))) ids.add(id); });
        const filtro = {
          TODOS: i => i.activo, BAJO: i => i.activo && i.bajo, CERO: i => i.activo && i.cero, ESPECIAL: i => i.activo && i.especial,
          SIN_PRECIO: i => i.activo && i.sinPrecio, SIN_UBICACION: i => i.activo && i.sinUbicacion, INACTIVO: i => !i.activo
        }[fPS.vista] || (i => i.activo);
        const vista = items.filter(i => ids.has(String(i.p.id)) && filtro(i)).sort((x, y) => porNombre(x.p, y.p));
        if (!vista.length) {
          cont.innerHTML = vacio('search', 'Ningún producto coincide.');
          return;
        }
        const mostrar = vista.slice(0, fPS.limite);
        const costos = veCostos();
        cont.innerHTML = '<div class="tabla-env"><table class="tabla"><thead><tr><th></th><th>Producto</th><th class="num">Stock</th><th class="num">Mín.</th>' +
          (costos ? '<th class="num">Costo</th>' : '') + '<th class="num">P. unidad</th><th class="num">P. mayor</th><th class="num">P. caja</th><th></th></tr></thead><tbody>' +
          mostrar.map(i => {
            const ps = i.ps, p = i.p;
            const etq = (i.activo ? '' : ' <span class="etiqueta roja">Desasignado</span>') +
              (!activo(p) ? ' <span class="etiqueta roja">Inactivo en catálogo</span>' : '') +
              (i.activo && i.cero ? ' <span class="etiqueta roja">Sin stock</span>' : i.activo && i.bajo ? ' <span class="etiqueta amarilla">Stock bajo</span>' : '') +
              (i.especial ? ' <span class="etiqueta naranja">Especial</span>' : '') +
              (i.activo && i.sinPrecio ? ' <span class="etiqueta">Sin precio</span>' : '') + etiquetaEnvio(pend[ps.id]);
            return '<tr class="clic' + (i.activo ? '' : ' inactivo') + '" data-acc="editar" data-id="' + esc(ps.id) + '">' +
              '<td style="width:52px">' + miniatura(p, c) + '</td>' +
              '<td><b>' + esc(p.nombre) + '</b>' + etq + '<span class="sub">' + esc(p.codigo) +
              (c.nombreMarca(p.marca_id) ? ' · ' + esc(c.nombreMarca(p.marca_id)) : '') +
              (txt(ps.ubicacion) ? ' · 📍 ' + esc(ps.ubicacion) : '') + '</span></td>' +
              '<td class="num"><b class="' + (i.cero ? 'txt-rojo' : i.bajo ? 'txt-amarillo' : '') + '">' + fmt(i.stock) + '</b><span class="sub">' + esc(p.unidad || '') + '</span></td>' +
              '<td class="num">' + (n0(ps.stock_minimo) ? fmt(ps.stock_minimo) : '—') + '</td>' +
              (costos ? '<td class="num">' + (n0(ps.costo_promedio) ? U.bs(redondear(n0(ps.costo_promedio), 2)) : '—') + '</td>' : '') +
              '<td class="num">' + precio(ps.precio_unidad) + '</td>' +
              '<td class="num">' + precio(ps.precio_mayor) + (n0(ps.precio_mayor) && n0(ps.cantidad_min_mayor) ? '<span class="sub">desde ' + fmt(ps.cantidad_min_mayor) + '</span>' : '') + '</td>' +
              '<td class="num">' + precio(ps.precio_caja) + (n0(ps.precio_caja) && n0(p.unidades_por_caja) ? '<span class="sub">' + fmt(p.unidades_por_caja) + ' u</span>' : '') + '</td>' +
              '<td class="acc"><button class="btn btn-chico btn-borde" data-acc="editar" data-id="' + esc(ps.id) + '">Editar</button></td></tr>';
          }).join('') + '</tbody></table></div>' +
          (vista.length > mostrar.length ? '<div class="mas-centro"><button class="btn btn-borde" data-acc="mas">Mostrar más (' +
            (vista.length - mostrar.length) + ' restantes)</button></div>' : '<p class="nota" style="margin-top:10px">' + vista.length + ' producto(s).</p>');
      };
      await pintar();
      restaurarFoco(raiz);

      let espera = null;
      iBuscar.oninput = () => { fPS.buscar = iBuscar.value; fPS.limite = 50; clearTimeout(espera); espera = setTimeout(pintar, 150); };
      iBuscar.onkeydown = async ev => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        const r = await porCodigo(iBuscar.value);
        if (!r) return;
        iBuscar.value = ''; fPS.buscar = '';
        await pintar();
        abrirEnSucursal(r.producto);
      };
      $('#psCat', raiz).onchange = e => { fPS.categoria = e.target.value; fPS.limite = 50; pintar(); };
      $('#psVista', raiz).onchange = e => { fPS.vista = e.target.value; fPS.limite = 50; App.refrescarContexto(); };

      raiz.onclick = async ev => {
        const t = ev.target.closest('[data-vista]');
        if (t) { fPS.vista = t.dataset.vista; fPS.limite = 50; return App.refrescarContexto(); }
        const b = ev.target.closest('[data-acc]');
        if (!b) return;
        ev.stopPropagation();
        switch (b.dataset.acc) {
          case 'asignar': return asignarProductos();
          case 'copiar': return copiarDeSucursal();
          case 'mas': fPS.limite += 100; return pintar();
          case 'editar': {
            const i = items.find(x => mismo(x.ps.id, b.dataset.id));
            if (i) return formPS(i.ps, i.p);
          }
        }
      };
    }
  });

  /** Abre el producto en la sucursal activa; si no está asignado, ofrece asignarlo. */
  async function abrirEnSucursal(p) {
    const suc = App.contexto.sucursal;
    if (!suc || !manejaSucursal()) return;
    const ps = (await Datos.listar('PRODUCTOS_SUCURSAL', x => mismo(x.sucursal_id, suc.id) && mismo(x.producto_id, p.id)))[0];
    if (ps && activo(ps)) return formPS(ps, p);
    if (!activo(p)) { App.aviso('«' + p.nombre + '» está inactivo en el catálogo general.', 'error', 6); return; }
    const ok = await App.confirmar('Producto no asignado', '«' + p.nombre + '» (' + p.codigo + ') existe en el catálogo pero no está asignado a ' +
      suc.nombre + '. ¿Asignarlo ahora?', 'Asignar');
    if (!ok) return;
    const fila = ps ? { id: ps.id, estado: 'ACTIVO' }
      : { id: U.uuid(), empresa_id: suc.empresa_id, sucursal_id: suc.id, producto_id: p.id, ubicacion: '', stock_minimo: '', producto_especial: 'NO', estado: 'ACTIVO' };
    const guardada = await Datos.guardar('PRODUCTOS_SUCURSAL', fila);
    App.aviso('Asignado a ' + suc.nombre, 'ok');
    await App.refrescarContexto();
    formPS(Object.assign({}, ps || {}, guardada), p);
  }

  async function formPS(ps, p) {
    const suc = App.contexto.sucursal;
    if (!suc || !mismo(ps.sucursal_id, suc.id)) { App.aviso('Este producto es de otra sucursal.', 'error'); return; }
    const c = await cargar();
    const precios = editaPrecios();
    const costoEditable = precios;
    const stock = await Datos.stock(suc.id, p.id);
    const movs = await Datos.listar('MOVIMIENTOS', m => mismo(m.sucursal_id, suc.id) && mismo(m.producto_id, p.id));
    const movsPend = (await Sesion.local.salida()).filter(x => x.tabla === 'MOVIMIENTOS' && mismo(x.fila.sucursal_id, suc.id) && mismo(x.fila.producto_id, p.id));
    const puedeInicial = manejaSucursal() && !movs.length && !movsPend.length && stock === 0 && activo(p);
    const historial = (await Datos.listar('HISTORIAL_CAMBIOS', h => mismo(h.sucursal_id, suc.id) && mismo(h.producto_id, p.id)))
      .sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en))).slice(0, 12);
    const usuarios = await Datos.listar('USUARIOS');
    const nomUsu = id => { const u = usuarios.find(x => mismo(x.id, id)); return u ? u.nombre : ''; };
    const upc = n0(p.unidades_por_caja), upp = n0(p.unidades_por_paquete);
    const NOMBRE_CAMPO = { ubicacion: 'Ubicación', stock_minimo: 'Stock mínimo', producto_especial: 'Especial', costo_promedio: 'Costo',
      precio_unidad: 'Precio unidad', precio_mayor: 'Precio mayor', cantidad_min_mayor: 'Mayor desde', precio_caja: 'Precio caja' };
    const dis = precios ? '' : ' disabled';
    const presIni = [['UNIDAD', 'Unidades (' + (p.unidad || 'UND') + ')']].concat(upp > 1 ? [['PAQUETE', 'Paquetes de ' + fmt(upp)]] : [])
      .concat(upc > 1 ? [['CAJA', 'Cajas de ' + fmt(upc)]] : []);

    const html =
      '<div class="ps-cabeza">' + miniatura(p, c, 'grande') + '<div style="min-width:0"><b>' + esc(p.nombre) + '</b>' +
      '<small>' + esc([p.codigo, c.nombreMarca(p.marca_id), c.rutaCategoria(p.categoria_id)].filter(Boolean).join(' · ')) + '</small>' +
      '<small>Empaque: ' + esc([p.unidad || 'UND', upp > 1 ? 'paquete ' + fmt(upp) : '', upc > 1 ? 'caja ' + fmt(upc) : ''].filter(Boolean).join(' · ')) + '</small></div>' +
      '<div class="ps-stock"><span>Stock</span><b class="' + (stock <= 0 ? 'txt-rojo' : '') + '">' + fmt(stock) + '</b><small>' + esc([p.unidad || 'UND'].concat(textoStock(stock, p).split(' · ').slice(1)).join(' · ')) + '</small></div></div>' +
      '<div class="form-2">' +
      '<div class="seccion-form">En esta sucursal</div>' +
      campo('sUbic', 'Ubicación', ps.ubicacion, { ph: 'Ej. Pasillo 3 - Estante B', attrs: ' maxlength="60" autocomplete="off"' }) +
      campoNum('sMin', 'Stock mínimo (' + (p.unidad || 'UND') + ')', ps.stock_minimo, { ayuda: 'Aparece como "Stock bajo" al llegar a este número.' }) +
      '<div class="campo todo"><label class="check"><input type="checkbox" id="sEsp"' + (ps.producto_especial === 'SI' ? ' checked' : '') + '>' +
      '<span><b>Producto especial</b><small>Por ejemplo, de pedido especial o de control especial. Tiene su propio reporte.</small></span></label></div>' +

      '<div class="seccion-form">Costo y precios (Bs)</div>' +
      (!precios ? '<div class="msg msg-info todo">Su rol puede ver los precios, pero no cambiarlos.</div>' : '') +
      campoNum('sCosto', 'Costo por unidad', ps.costo_promedio === '' || ps.costo_promedio == null ? '' : redondear(n0(ps.costo_promedio), 4),
        { attrs: costoEditable ? '' : ' readonly', ayuda: 'Costo promedio. Se recalcula solo con cada compra (Fase 6).' }) +
      campoNum('sPU', 'Precio por unidad', ps.precio_unidad, { attrs: dis, idAyuda: 'mPU', ayuda: '&nbsp;' }) +
      campoNum('sPM', 'Precio por mayor (por unidad)', ps.precio_mayor, { attrs: dis, idAyuda: 'mPM', ayuda: '&nbsp;' }) +
      campoNum('sCM', 'Por mayor desde (unidades)', ps.cantidad_min_mayor, { attrs: dis, ph: 'Ej. 12', ayuda: 'Cantidad mínima para cobrar el precio por mayor.' }) +
      campoNum('sPC', 'Precio por caja' + (upc > 1 ? ' (' + fmt(upc) + ' u)' : ''), ps.precio_caja, { attrs: dis, idAyuda: 'mPC',
        ayuda: upc > 1 ? '&nbsp;' : 'El producto no tiene "unidades por caja" en el catálogo.' }) +
      campo('sMotivo', 'Motivo del cambio', '', { clase: 'todo', ph: 'Opcional. Ej. Subió el precio del proveedor', attrs: ' maxlength="120"',
        ayuda: 'Queda en el historial de cambios de precio y ubicación.' }) +
      campoLista('sEstado', 'Estado en esta sucursal', [['ACTIVO', 'Asignado (se puede vender y mover)'], ['INACTIVO', 'Desasignado (no aparece)']], ps.estado || 'ACTIVO') +

      (puedeInicial ? '<div class="seccion-form">Inventario inicial</div>' +
        '<div class="campo todo"><label class="check"><input type="checkbox" id="iIni"><span><b>Registrar el stock que hay hoy</b>' +
        '<small>Solo para empezar: el producto no tiene movimientos en esta sucursal. Después el stock cambia con compras, ventas y ajustes.</small></span></label></div>' +
        '<div class="todo oculto" id="iCampos"><div class="form-2">' +
        campoNum('iCant', 'Cantidad', '', { req: true }) +
        campoLista('iPres', 'En', presIni, 'UNIDAD') +
        campoNum('iCosto', 'Costo por unidad (Bs)', ps.costo_promedio ? redondear(n0(ps.costo_promedio), 4) : '', { idAyuda: 'iAyuda', ayuda: '&nbsp;' }) +
        '</div></div>' : '') +

      (historial.length ? '<div class="seccion-form">Últimos cambios</div><div class="todo tabla-env"><table class="tabla compacta"><thead><tr>' +
        '<th>Fecha</th><th>Campo</th><th>Antes</th><th>Ahora</th><th>Quién / motivo</th></tr></thead><tbody>' +
        historial.map(h => '<tr><td>' + esc(U.fechaCorta(h.creado_en)) + '</td><td>' + esc(NOMBRE_CAMPO[h.campo] || h.campo) + '</td>' +
          '<td>' + esc(h.valor_anterior === '' ? '—' : h.valor_anterior) + '</td><td><b>' + esc(h.valor_nuevo === '' ? '—' : h.valor_nuevo) + '</b></td>' +
          '<td>' + esc(nomUsu(h.creado_por)) + (h.origen && h.origen !== 'MANUAL' ? ' · ' + esc(h.origen) : '') +
          (h.motivo ? '<span class="sub">' + esc(h.motivo) + '</span>' : '') + '</td></tr>').join('') + '</tbody></table></div>' : '') +
      '</div><div class="f-msg"></div>';

    const f = modalAncho({
      titulo: p.codigo + ' · ' + suc.nombre,
      html: html,
      botones: [{ t: 'Cancelar' }, { t: 'Guardar', clase: 'btn-principal', accion: m => guardarPS(m, ps, p, { precios: precios, costoEditable: costoEditable, stock: stock, puedeInicial: puedeInicial }) }]
    });

    // Ganancia en vivo
    const ganancia = (precioUnidad, costo) => {
      if (!(precioUnidad > 0) || !(costo > 0)) return '&nbsp;';
      const g = precioUnidad - costo;
      const pct = g / costo * 100;
      return '<span class="' + (g < 0 ? 'txt-rojo' : 'txt-verde') + '">Ganancia ' + U.bs(g) + ' por unidad (' + fmt(pct, 1) + '% sobre el costo)' +
        (g < 0 ? ' · ¡por debajo del costo!' : '') + '</span>';
    };
    const margenes = () => {
      const costo = num($('#sCosto', f).value) || 0;
      $('#mPU', f).innerHTML = ganancia(num($('#sPU', f).value), costo);
      $('#mPM', f).innerHTML = ganancia(num($('#sPM', f).value), costo);
      if (upc > 1) {
        const pc = num($('#sPC', f).value);
        $('#mPC', f).innerHTML = pc > 0 ? 'Equivale a ' + U.bs(pc / upc) + ' por unidad. ' + ganancia(pc / upc, costo) : '&nbsp;';
      }
    };
    ['sCosto', 'sPU', 'sPM', 'sPC'].forEach(id => { $('#' + id, f).addEventListener('input', margenes); });
    margenes();

    if (puedeInicial) {
      const chk = $('#iIni', f);
      chk.onchange = () => { $('#iCampos', f).classList.toggle('oculto', !chk.checked); if (chk.checked) $('#iCant', f).focus(); };
      const ayudaIni = () => {
        const pres = $('#iPres', f).value;
        const fac = factor(p, pres);
        const cant = num($('#iCant', f).value) || 0;
        const costo = num($('#iCosto', f).value);
        $('#iAyuda', f).innerHTML = cant > 0 ? 'Entran ' + fmt(cant * fac) + ' ' + esc(p.unidad || 'UND') +
          (costo > 0 ? ' · valor ' + U.bs(cant * fac * costo) : '') + '.' : 'Costo de UNA unidad, aunque cuente en cajas.';
      };
      ['iCant', 'iPres', 'iCosto'].forEach(id => { $('#' + id, f).addEventListener('input', ayudaIni); $('#' + id, f).addEventListener('change', ayudaIni); });
      ayudaIni();
    }
  }

  async function guardarPS(f, ps, p, op) {
    try {
      const suc = App.contexto.sucursal;
      const nuevo = {
        ubicacion: txt($('#sUbic', f).value),
        stock_minimo: leerNumero(f, 'sMin', 'el stock mínimo', { dec: 3 }),
        producto_especial: $('#sEsp', f).checked ? 'SI' : 'NO',
        estado: $('#sEstado', f).value
      };
      if (op.costoEditable) nuevo.costo_promedio = leerNumero(f, 'sCosto', 'el costo', { dec: 4 });
      if (op.precios) {
        nuevo.precio_unidad = leerNumero(f, 'sPU', 'el precio por unidad');
        nuevo.precio_mayor = leerNumero(f, 'sPM', 'el precio por mayor');
        nuevo.cantidad_min_mayor = leerNumero(f, 'sCM', 'la cantidad para precio por mayor', { dec: 3 });
        nuevo.precio_caja = leerNumero(f, 'sPC', 'el precio por caja');
        if (n0(nuevo.precio_mayor) > 0 && !(n0(nuevo.cantidad_min_mayor) > 0)) return mensaje(f, 'Indique desde cuántas unidades vale el precio por mayor.');
        if (!(n0(nuevo.precio_mayor) > 0) && n0(nuevo.cantidad_min_mayor) > 0) return mensaje(f, 'Escriba el precio por mayor (o borre la cantidad "por mayor desde").');
        const costo = n0(op.costoEditable ? nuevo.costo_promedio : ps.costo_promedio);
        const avisos = [];
        if (n0(nuevo.precio_mayor) > 0 && n0(nuevo.precio_unidad) > 0 && n0(nuevo.precio_mayor) > n0(nuevo.precio_unidad)) avisos.push('el precio por mayor es más alto que el precio por unidad');
        const upc = n0(p.unidades_por_caja);
        if (costo > 0) {
          if (n0(nuevo.precio_unidad) > 0 && n0(nuevo.precio_unidad) < costo) avisos.push('el precio por unidad está por debajo del costo');
          if (n0(nuevo.precio_mayor) > 0 && n0(nuevo.precio_mayor) < costo) avisos.push('el precio por mayor está por debajo del costo');
          if (upc > 1 && n0(nuevo.precio_caja) > 0 && n0(nuevo.precio_caja) / upc < costo) avisos.push('el precio por caja está por debajo del costo');
        }
        if (avisos.length && !(await App.confirmar('Revise los precios', 'Atención: ' + avisos.join('; ') + '. ¿Guardar de todos modos?', 'Guardar'))) return false;
      }
      const cambios = diferencias(Object.assign({}, ps, { producto_especial: ps.producto_especial || 'NO', estado: ps.estado || 'ACTIVO' }), nuevo);
      const registros = [];

      // Inventario inicial
      let movimiento = null;
      if (op.puedeInicial && $('#iIni', f) && $('#iIni', f).checked) {
        if (nuevo.estado === 'INACTIVO') return mensaje(f, 'Para registrar inventario inicial el producto debe quedar asignado.');
        const cant = leerNumero(f, 'iCant', 'la cantidad del inventario inicial', { dec: 3, req: true, mayorCero: true });
        const costoIni = leerNumero(f, 'iCosto', 'el costo del inventario inicial', { dec: 4 });
        const pres = $('#iPres', f).value;
        const fac = factor(p, pres);
        const unidades = redondear(cant * fac, 3);
        if (costoIni === '' && !(await App.confirmar('Sin costo', 'No escribió el costo. Sin costo no se pueden calcular las ganancias. ¿Continuar?', 'Continuar'))) return false;
        movimiento = { id: U.uuid(), fecha: U.ahoraISO(), empresa_id: suc.empresa_id, sucursal_id: suc.id, producto_id: p.id,
          tipo: 'INVENTARIO_INICIAL', cantidad: unidades, costo_unitario: costoIni === '' ? '' : costoIni, precio_unitario: '',
          documento_tipo: 'INVENTARIO_INICIAL', documento_id: '', documento_numero: '', detalle_id: '', anula_movimiento_id: '',
          observacion: 'Inventario inicial: ' + fmt(cant) + ' ' + (pres === 'UNIDAD' ? (p.unidad || 'UND') : NOMBRE_PRES[pres] + '(s) de ' + fmt(fac)) };
        if (costoIni !== '' && costoIni !== n0(ps.costo_promedio)) cambios.costo_promedio = costoIni;
      }

      if (Object.keys(cambios).length) {
        registros.push({ tabla: 'PRODUCTOS_SUCURSAL', fila: Object.assign({ id: ps.id, _origen: 'MANUAL',
          _motivo: txt($('#sMotivo', f).value) || (movimiento ? 'Inventario inicial' : '') }, cambios) });
      }
      if (movimiento) registros.push({ tabla: 'MOVIMIENTOS', fila: movimiento });
      if (!registros.length) { App.aviso('Sin cambios', 'info'); return true; }
      if (cambios.estado === 'INACTIVO' && op.stock !== 0 &&
        !(await App.confirmar('Desasignar con stock', 'El producto tiene ' + fmt(op.stock) + ' ' + (p.unidad || 'UND') +
          ' en esta sucursal. Si lo desasigna, no aparecerá para vender ni traspasar. ¿Continuar?', 'Desasignar', 'btn-peligro'))) return false;

      await Datos.guardarVarios(registros);
      App.aviso(movimiento ? 'Guardado con inventario inicial de ' + fmt(movimiento.cantidad) + ' ' + (p.unidad || 'UND') : 'Guardado', 'ok');
      await App.refrescarContexto();
      return true;
    } catch (err) {
      console.error(err);
      return mensaje(f, err.message || String(err));
    }
  }

  // ---------- Asignar productos del catálogo ----------
  async function asignarProductos() {
    const suc = App.contexto.sucursal;
    const c = await cargar();
    const filas = await Datos.listar('PRODUCTOS_SUCURSAL', x => mismo(x.sucursal_id, suc.id));
    const porProd = new Map(filas.map(x => [String(x.producto_id), x]));
    const disponibles = new Set(c.productos.filter(p => activo(p) && !activo(porProd.get(String(p.id)))).map(p => String(p.id)));
    if (!c.productos.some(activo)) {
      App.modal({ titulo: 'Catálogo vacío', html: '<p style="margin:0;line-height:1.5">El catálogo general todavía no tiene productos. ' +
        (esAG() ? 'Créelos en <a href="#/catalogo">Catálogo general</a>.' : 'El administrador general debe cargarlos primero.') + '</p>' });
      return;
    }
    if (!disponibles.size) { App.aviso('Todos los productos activos del catálogo ya están asignados a esta sucursal.', 'info', 6); return; }
    const sel = new Set();
    const est = { buscar: '', categoria: '' };
    const LIM = 200;

    const f = modalAncho({
      titulo: 'Asignar productos · ' + suc.nombre,
      html: '<p class="nota">Marque los productos del catálogo general que se venden o guardan en esta sucursal. ' +
        'Puede escanear uno tras otro: cada código leído se marca solo.</p>' +
        '<div class="filtros"><div class="campo"><label for="aBuscar">Buscar o escanear</label>' +
        '<input class="entrada" id="aBuscar" autocomplete="off" enterkeyhint="search" placeholder="Nombre, código o código de barras"></div>' +
        '<div class="campo corto"><label for="aCat">Categoría</label>' + lista('aCat', [['', 'Todas']].concat(arbolCategorias(c).map(x => [x[0], x[1]])), '') + '</div></div>' +
        '<div class="barra-sel"><button type="button" class="btn btn-chico btn-borde" id="aTodos">Marcar los de la lista</button>' +
        '<button type="button" class="btn btn-chico btn-borde" id="aNinguno">Quitar todas las marcas</button>' +
        '<b id="aCuenta">0 marcados</b></div>' +
        '<div class="lista-sel" id="aLista"></div>' +
        '<div class="form-2" style="margin-top:14px"><div class="seccion-form">Datos iniciales (opcional, para todos los marcados)</div>' +
        campo('aUbic', 'Ubicación', '', { ph: 'Ej. Depósito', attrs: ' maxlength="60"' }) +
        campoNum('aMin', 'Stock mínimo', '', { ayuda: 'Los precios se cargan después, producto por producto (o por Excel en la Fase 6).' }) +
        '</div><div class="f-msg"></div>',
      botones: [{ t: 'Cancelar' }, { t: 'Asignar', clase: 'btn-principal', accion: m => guardar(m) }]
    });
    const iB = $('#aBuscar', f);
    Escaner.boton(iB, { enter: true, titulo: 'Escanee el producto' });
    const botonOk = $$('footer .btn', f).pop();
    const contar = () => {
      $('#aCuenta', f).textContent = sel.size + ' marcado(s)';
      botonOk.textContent = sel.size ? 'Asignar ' + sel.size : 'Asignar';
    };
    let vistaActual = [];
    const pintar = async () => {
      vistaActual = await buscar(est.buscar, { ids: disponibles, categorias: est.categoria ? descendientes(c, est.categoria) : null });
      const mostrar = vistaActual.slice(0, LIM);
      $('#aLista', f).innerHTML = !mostrar.length ? '<p class="vacio">Ningún producto disponible coincide.</p>'
        : mostrar.map(p => {
          const ant = porProd.get(String(p.id));
          return '<label class="check fila-sel">' + '<input type="checkbox" value="' + esc(p.id) + '"' + (sel.has(String(p.id)) ? ' checked' : '') + '>' +
            miniatura(p, c) + '<span><b>' + esc(p.nombre) + '</b><small>' + esc([p.codigo, c.nombreMarca(p.marca_id)].filter(Boolean).join(' · ')) +
            (ant ? ' · estaba desasignado: se vuelve a asignar' : '') + '</small></span></label>';
        }).join('') + (vistaActual.length > LIM ? '<p class="nota" style="padding:8px">Se muestran ' + LIM + ' de ' + vistaActual.length + '. Escriba más para filtrar.</p>' : '');
    };
    $('#aLista', f).addEventListener('change', ev => {
      const i = ev.target;
      if (i.type !== 'checkbox') return;
      if (i.checked) sel.add(i.value); else sel.delete(i.value);
      contar();
    });
    let espera = null;
    iB.oninput = () => { est.buscar = iB.value; clearTimeout(espera); espera = setTimeout(pintar, 150); };
    iB.onkeydown = async ev => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      const r = await porCodigo(iB.value);
      if (!r) { if (codigoLimpio(iB.value)) App.aviso('El código ' + codigoLimpio(iB.value) + ' no está en el catálogo.', 'error'); return; }
      if (!disponibles.has(String(r.producto.id))) { App.aviso('«' + r.producto.nombre + '» ya está asignado (o inactivo).', 'info'); }
      else { sel.add(String(r.producto.id)); Escaner.pitido(); App.aviso('Marcado: ' + r.producto.nombre, 'ok', 2); contar(); }
      iB.value = ''; est.buscar = '';
      pintar();
      iB.focus();
    };
    $('#aCat', f).onchange = e => { est.categoria = e.target.value; pintar(); };
    $('#aTodos', f).onclick = () => { vistaActual.slice(0, LIM).forEach(p => sel.add(String(p.id))); contar(); pintar(); };
    $('#aNinguno', f).onclick = () => { sel.clear(); contar(); pintar(); };
    pintar();
    contar();

    async function guardar(m) {
      try {
        if (!sel.size) return mensaje(m, 'Marque al menos un producto.');
        const ubic = txt($('#aUbic', m).value);
        const min = leerNumero(m, 'aMin', 'el stock mínimo', { dec: 3 });
        const registros = Array.from(sel).map(pid => {
          const ant = porProd.get(pid);
          if (ant) {
            const fila = { id: ant.id, estado: 'ACTIVO', _origen: 'MANUAL' };
            if (ubic) fila.ubicacion = ubic;
            if (min !== '') fila.stock_minimo = min;
            return { tabla: 'PRODUCTOS_SUCURSAL', fila: fila };
          }
          return { tabla: 'PRODUCTOS_SUCURSAL', fila: { id: U.uuid(), empresa_id: suc.empresa_id, sucursal_id: suc.id, producto_id: pid,
            ubicacion: ubic, stock_minimo: min, producto_especial: 'NO', estado: 'ACTIVO' } };
        });
        await Datos.guardarVarios(registros);
        App.aviso(registros.length + ' producto(s) asignado(s) a ' + suc.nombre, 'ok');
        await App.refrescarContexto();
        return true;
      } catch (err) {
        console.error(err);
        return mensaje(m, err.message || String(err));
      }
    }
  }

  // ---------- Copiar productos de otra sucursal ----------
  async function copiarDeSucursal() {
    const ctx = App.contexto;
    const suc = ctx.sucursal;
    const otras = ctx.sucursales.filter(s => !mismo(s.id, suc.id));
    const c = await cargar();
    const destino = new Map((await Datos.listar('PRODUCTOS_SUCURSAL', x => mismo(x.sucursal_id, suc.id))).map(x => [String(x.producto_id), x]));
    const origenDe = async id => (await Datos.listar('PRODUCTOS_SUCURSAL', x => mismo(x.sucursal_id, id) && activo(x)))
      .filter(x => activo(c.porId.get(String(x.producto_id))) && !activo(destino.get(String(x.producto_id))));

    const f = modalAncho({
      titulo: 'Copiar productos a ' + suc.nombre,
      html: '<p class="nota">Asigna a <b>' + esc(suc.nombre) + '</b> los productos que tiene otra sucursal. ' +
        'Solo agrega los que faltan: los que ya están asignados aquí no se modifican. El stock <b>no</b> se copia.</p>' +
        '<div class="form-2">' + campoLista('cOrigen', 'Copiar desde', otras.map(s => [s.id, s.nombre + (s.es_central === 'SI' ? ' (central)' : '')]),
          (otras.find(s => s.es_central === 'SI') || otras[0]).id, { clase: 'todo' }) +
        '<div class="campo todo"><label>Copiar también</label><div class="checks">' +
        (editaPrecios() ? '<label class="check"><input type="checkbox" id="cPrecios" checked><span><b>Precios</b><small>Unidad, mayor y caja</small></span></label>' +
          '<label class="check"><input type="checkbox" id="cCosto" checked><span><b>Costo</b><small>Costo promedio actual</small></span></label>' : '') +
        '<label class="check"><input type="checkbox" id="cMin" checked><span><b>Stock mínimo</b></span></label>' +
        '<label class="check"><input type="checkbox" id="cEsp" checked><span><b>Producto especial</b></span></label>' +
        '<label class="check"><input type="checkbox" id="cUbic"><span><b>Ubicación</b><small>Solo si las dos sucursales se ordenan igual</small></span></label>' +
        '</div></div></div><div class="msg msg-info" id="cResumen">Calculando…</div><div class="f-msg"></div>',
      botones: [{ t: 'Cancelar' }, { t: 'Copiar', clase: 'btn-principal', accion: m => guardar(m) }]
    });
    const resumen = async () => {
      const lista2 = await origenDe($('#cOrigen', f).value);
      $('#cResumen', f).textContent = lista2.length ? 'Se agregarán ' + lista2.length + ' producto(s).' : 'No hay productos nuevos para copiar desde esa sucursal.';
    };
    $('#cOrigen', f).onchange = resumen;
    resumen();

    async function guardar(m) {
      try {
        const lista2 = await origenDe($('#cOrigen', m).value);
        if (!lista2.length) return mensaje(m, 'No hay productos nuevos para copiar desde esa sucursal.');
        const chk = id => !!$('#' + id, m) && $('#' + id, m).checked;
        const registros = lista2.map(o => {
          const datos = { producto_especial: chk('cEsp') ? (o.producto_especial || 'NO') : 'NO', estado: 'ACTIVO' };
          if (chk('cMin')) datos.stock_minimo = o.stock_minimo;
          if (chk('cUbic')) datos.ubicacion = o.ubicacion;
          if (chk('cPrecios')) ['precio_unidad', 'precio_mayor', 'cantidad_min_mayor', 'precio_caja'].forEach(k => { datos[k] = o[k]; });
          if (chk('cCosto')) datos.costo_promedio = o.costo_promedio;
          const ant = destino.get(String(o.producto_id));
          return { tabla: 'PRODUCTOS_SUCURSAL', fila: ant
            ? Object.assign({ id: ant.id, _origen: 'MANUAL', _motivo: 'Copiado de otra sucursal' }, datos)
            : Object.assign({ id: U.uuid(), empresa_id: suc.empresa_id, sucursal_id: suc.id, producto_id: o.producto_id, ubicacion: '', stock_minimo: '' }, datos) };
        });
        await Datos.guardarVarios(registros);
        App.aviso(registros.length + ' producto(s) copiados a ' + suc.nombre, 'ok');
        await App.refrescarContexto();
        return true;
      } catch (err) {
        console.error(err);
        return mensaje(m, err.message || String(err));
      }
    }
  }

  // ============================================================
  //  PANTALLA: BUSCAR PRODUCTO Y STOCK (todos los roles)
  // ============================================================
  const fBus = { q: '', todo: false, limite: 30 };

  App.pantalla('buscar', {
    refrescar: true,
    async render(el) {
      const ctx = App.contexto;
      const suc = ctx.sucursal;
      const raiz = contenedor(el);
      const c = await cargar();
      const asignados = suc ? new Map((await Datos.listar('PRODUCTOS_SUCURSAL', x => mismo(x.sucursal_id, suc.id))).map(x => [String(x.producto_id), x])) : new Map();
      const stock = suc ? await stocks(suc.id) : new Map();
      const todo = !suc || fBus.todo;

      raiz.innerHTML =
        '<div class="titulo"><div><h1>Buscar producto y stock</h1><p>' + (suc ? 'Stock y precios de ' + esc(suc.nombre) + '.' : 'Sin sucursal elegida: solo datos del catálogo.') +
        ' Escriba, escanee con la cámara o use el lector USB.</p></div></div>' +
        '<div class="buscador"><input class="entrada grande" id="bQ" data-foco value="' + esc(fBus.q) + '" autocomplete="off" ' +
        'enterkeyhint="search" placeholder="Nombre, código o código de barras"></div>' +
        (suc ? '<label class="check chico" style="margin:-4px 0 14px"><input type="checkbox" id="bTodo"' + (fBus.todo ? ' checked' : '') + '>' +
          '<span>Incluir productos del catálogo que no están en esta sucursal</span></label>' : '') +
        '<div id="bRes"></div>';
      const iQ = $('#bQ', raiz);
      Escaner.boton(iQ, { enter: true, titulo: 'Escanee el producto' });

      const pintar = async () => {
        const cont = $('#bRes', raiz);
        if (!txt(fBus.q)) {
          cont.innerHTML = '<div class="tarjeta vacio">' + ico('search') + '<p><b>¿Qué producto busca?</b><br>Puede escribir parte del nombre en cualquier orden ' +
            '(ej. <i>clavo 2</i>), el código interno o el código de barras.</p>' +
            (Escaner.soportado() ? '' : '<p class="nota">En este navegador la cámara no lee códigos: use un lector USB o escriba el código.</p>') + '</div>';
          return;
        }
        const ids = todo ? null : new Set(Array.from(asignados.values()).filter(activo).map(x => String(x.producto_id)));
        const lista2 = await buscar(fBus.q, { ids: ids });
        if (!lista2.length) {
          const cod = codigoLimpio(fBus.q);
          cont.innerHTML = vacio('search', 'No se encontró «' + esc(fBus.q) + '»' + (todo ? '.' : ' en esta sucursal.'),
            (!todo ? '<button class="btn btn-borde" data-acc="todo" style="margin-top:12px">Buscar en todo el catálogo</button> ' : '') +
            (esAG() && cod && !/\s/.test(txt(fBus.q)) ? '<button class="btn btn-principal" data-acc="crear" data-cod="' + esc(cod) + '" style="margin-top:12px">' +
              icoX('mas') + 'Crear producto con este código</button>' : ''));
          return;
        }
        const mostrar = lista2.slice(0, fBus.limite);
        cont.innerHTML = '<div class="prod-tarjetas">' + mostrar.map(p => {
          const ps = asignados.get(String(p.id));
          const asig = activo(ps);
          const s = stock.get(String(p.id)) || 0;
          const min = asig ? n0(ps.stock_minimo) : 0;
          const clase = !asig ? 'gris' : s <= 0 ? 'roja' : min > 0 && s <= min ? 'amarilla' : 'verde';
          return '<button class="prod-tarjeta" data-acc="ver" data-id="' + esc(p.id) + '">' + miniatura(p, c, 'grande') +
            '<span class="prod-info"><b>' + esc(p.nombre) + '</b><small>' + esc([p.codigo, c.nombreMarca(p.marca_id)].filter(Boolean).join(' · ')) + '</small>' +
            (asig && txt(ps.ubicacion) ? '<small>📍 ' + esc(ps.ubicacion) + '</small>' : '') +
            (asig ? '<span class="prod-precios">' + (n0(ps.precio_unidad) ? '<span>Unidad <b>' + U.bs(ps.precio_unidad) + '</b></span>' : '<span class="suave">Sin precio</span>') +
              (n0(ps.precio_mayor) ? '<span>Mayor <b>' + U.bs(ps.precio_mayor) + '</b>' + (n0(ps.cantidad_min_mayor) ? ' (' + fmt(ps.cantidad_min_mayor) + '+)' : '') + '</span>' : '') +
              (n0(ps.precio_caja) ? '<span>Caja <b>' + U.bs(ps.precio_caja) + '</b></span>' : '') + '</span>'
              : suc ? '<small class="txt-rojo">No asignado a esta sucursal</small>' : '') + '</span>' +
            (suc ? '<span class="prod-stock ' + clase + '"><b>' + (asig ? fmt(s) : '—') + '</b><small>' + esc(p.unidad || 'UND') + '</small></span>' : '') +
            '</button>';
        }).join('') + '</div>' +
          (lista2.length > mostrar.length ? '<div class="mas-centro"><button class="btn btn-borde" data-acc="mas">Mostrar más (' + (lista2.length - mostrar.length) + ')</button></div>' : '');
      };
      await pintar();
      restaurarFoco(raiz);
      if (!focoPrevio && esPantallaFina() && !document.querySelector('.modal-fondo')) iQ.focus();

      let espera = null;
      iQ.oninput = () => { fBus.q = iQ.value; fBus.limite = 30; clearTimeout(espera); espera = setTimeout(pintar, 150); };
      iQ.onkeydown = async ev => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        const r = await porCodigo(iQ.value);
        if (r) { iQ.select(); verProducto(r.producto, { presentacion: r.por === 'barras' ? r.presentacion : '' }); }
      };
      const chk = $('#bTodo', raiz);
      if (chk) chk.onchange = () => { fBus.todo = chk.checked; App.refrescarContexto(); };
      raiz.onclick = async ev => {
        const b = ev.target.closest('[data-acc]');
        if (!b) return;
        switch (b.dataset.acc) {
          case 'ver': return verProducto(c.porId.get(String(b.dataset.id)));
          case 'mas': fBus.limite += 60; return pintar();
          case 'todo': fBus.todo = true; return App.refrescarContexto();
          case 'crear': return formProducto(null, { codigoBarras: b.dataset.cod });
        }
      };
    }
  });

  /** Ficha completa del producto. op.presentacion: la presentación cuyo código se escaneó. */
  async function verProducto(p, op) {
    op = op || {};
    if (!p) return;
    const c = await cargar();
    const ctx = App.contexto;
    const suc = ctx.sucursal;
    const todosPS = await Datos.listar('PRODUCTOS_SUCURSAL', x => mismo(x.producto_id, p.id));
    const ps = suc ? todosPS.find(x => mismo(x.sucursal_id, suc.id)) : null;
    const asig = activo(ps);
    const st = await stocks();
    const upc = n0(p.unidades_por_caja), upp = n0(p.unidades_por_paquete);
    const imgs = [txt(p.imagen_principal_url)].concat((c.imagenes.get(String(p.id)) || []).map(i => txt(i.url))).filter(Boolean).map(App.urlImagen);
    const costo = asig ? n0(ps.costo_promedio) : 0;
    const vol = n0(p.caja_ancho_cm) * n0(p.caja_alto_cm) * n0(p.caja_prof_cm) / 1e6;
    const leida = op.presentacion ? '<div class="msg msg-ok">Código leído: <b>' + NOMBRE_PRES[op.presentacion] + '</b>' +
      (op.presentacion !== 'UNIDAD' ? ' (' + fmt(factor(p, op.presentacion)) + ' ' + esc(p.unidad || 'UND') + ')' : '') + '</div>' : '';

    const filasStock = ctx.sucursales.map(s => {
      const x = todosPS.find(y => mismo(y.sucursal_id, s.id));
      const v = st.get(s.id + '|' + p.id) || 0;
      return '<tr' + (suc && mismo(s.id, suc.id) ? ' class="resaltada"' : '') + '><td><b>' + esc(s.nombre) + '</b>' + (s.es_central === 'SI' ? ' <span class="etiqueta naranja">Central</span>' : '') +
        (x && txt(x.ubicacion) ? '<span class="sub">📍 ' + esc(x.ubicacion) + '</span>' : '') + '</td>' +
        '<td class="num">' + (activo(x) ? '<b>' + fmt(v) + '</b>' + (upc > 1 && Math.abs(v) >= upc ? '<span class="sub">' + esc(textoStock(v, p).split(' · ')[1] || '') + '</span>' : '')
          : '<span class="suave">No asignado</span>') + '</td></tr>';
    }).join('');

    const precioFila = (t, v, extra) => n0(v) > 0 ? '<div class="dato"><span>' + t + '</span><b>' + U.bs(v) + (extra || '') + '</b></div>' : '';
    const margen = v => veCostos() && costo > 0 && n0(v) > 0 ? ' <small class="' + (n0(v) < costo ? 'txt-rojo' : 'txt-verde') + '">(' + fmt((n0(v) - costo) / costo * 100, 1) + '%)</small>' : '';

    const html = leida +
      '<div class="ficha">' +
      '<div class="galeria">' + (imgs.length ? '<img class="g-principal" src="' + esc(imgs[0]) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
        (imgs.length > 1 ? '<div class="g-miniaturas">' + imgs.map((u, i) => '<img src="' + esc(u) + '" alt="" data-i="' + i + '" loading="lazy" onerror="this.remove()">').join('') + '</div>' : '')
        : '<div class="g-vacia">' + icoX('imagen') + '<small>Sin imagen</small></div>') + '</div>' +
      '<div class="ficha-datos"><h3 class="ficha-nombre">' + esc(p.nombre) + '</h3>' +
      '<p class="ficha-sub">' + esc([p.codigo, c.nombreMarca(p.marca_id), c.rutaCategoria(p.categoria_id)].filter(Boolean).join(' · ')) +
      (activo(p) ? '' : ' <span class="etiqueta roja">Inactivo</span>') + '</p>' +
      (suc ? '<div class="ficha-stock ' + (!asig ? 'gris' : (st.get(suc.id + '|' + p.id) || 0) <= 0 ? 'roja' : '') + '"><span>Stock en ' + esc(suc.nombre) + '</span>' +
        '<b>' + (asig ? esc(textoStock(st.get(suc.id + '|' + p.id) || 0, p)) : 'No asignado') + '</b>' +
        (asig && txt(ps.ubicacion) ? '<small>📍 ' + esc(ps.ubicacion) + '</small>' : '') + '</div>' : '') +
      (asig ? '<div class="ficha-precios">' +
        precioFila('Precio unidad', ps.precio_unidad, margen(ps.precio_unidad)) +
        precioFila('Precio por mayor', ps.precio_mayor, (n0(ps.cantidad_min_mayor) ? ' <small>desde ' + fmt(ps.cantidad_min_mayor) + '</small>' : '') + margen(ps.precio_mayor)) +
        precioFila('Precio caja' + (upc > 1 ? ' (' + fmt(upc) + ')' : ''), ps.precio_caja, upc > 1 ? ' <small>= ' + U.bs(n0(ps.precio_caja) / upc) + ' c/u</small>' + margen(n0(ps.precio_caja) / upc) : '') +
        (!n0(ps.precio_unidad) && !n0(ps.precio_mayor) && !n0(ps.precio_caja) ? '<div class="dato"><span>Precios</span><b class="suave">Sin precio cargado</b></div>' : '') +
        (veCostos() ? '<div class="dato"><span>Costo por unidad</span><b>' + (costo ? U.bs(redondear(costo, 2)) : '—') + '</b></div>' : '') +
        (n0(ps.stock_minimo) ? '<div class="dato"><span>Stock mínimo</span><b>' + fmt(ps.stock_minimo) + '</b></div>' : '') +
        (ps.producto_especial === 'SI' ? '<div class="dato"><span>Tipo</span><b><span class="etiqueta naranja">Producto especial</span></b></div>' : '') +
        '</div>' : '') +
      '</div></div>' +
      '<div class="rejilla" style="margin-top:14px">' +
      (ctx.sucursales.length ? '<div class="tarjeta"><h3>' + ico('store') + 'Stock por sucursal</h3><div class="tabla-env"><table class="tabla compacta"><tbody>' + filasStock + '</tbody></table></div></div>' : '') +
      '<div class="tarjeta"><h3>' + icoX('etiqueta') + 'Códigos y empaque</h3>' +
      '<div class="dato"><span>Unidad de medida</span><b>' + esc(p.unidad || '—') + '</b></div>' +
      PRESENTACIONES.map(([col, pres]) => txt(p[col]) ? '<div class="dato"><span>Código ' + NOMBRE_PRES[pres] + '</span><b class="mono' +
        (op.presentacion === pres ? ' resalta' : '') + '">' + esc(p[col]) + '</b></div>' : '').join('') +
      (upp ? '<div class="dato"><span>Paquete</span><b>' + fmt(upp) + ' ' + esc(p.unidad || 'u') + '</b></div>' : '') +
      (upc ? '<div class="dato"><span>Caja</span><b>' + fmt(upc) + ' ' + esc(p.unidad || 'u') + '</b></div>' : '') +
      (vol ? '<div class="dato"><span>Medidas caja</span><b>' + fmt(p.caja_ancho_cm) + '×' + fmt(p.caja_alto_cm) + '×' + fmt(p.caja_prof_cm) + ' cm (' + fmt(vol, 4) + ' m³)</b></div>' : '') +
      '</div></div>' +
      (txt(p.descripcion) ? '<p class="ficha-desc">' + esc(p.descripcion) + '</p>' : '');

    const botones = [];
    if (esAG()) botones.push({ t: 'Editar en catálogo', clase: 'btn-borde', accion: () => { formProducto(p); } });
    if (suc && manejaSucursal() && activo(p)) {
      botones.push(asig
        ? { t: 'Editar en la sucursal', clase: 'btn-borde', accion: () => { formPS(ps, p); } }
        : { t: 'Asignar a esta sucursal', clase: 'btn-borde', accion: () => { abrirEnSucursal(p); } });
    }
    botones.push({ t: 'Cerrar', clase: 'btn-principal' });
    const f = modalAncho({ titulo: 'Producto · ' + p.codigo, html: html, botones: botones });
    const principal = $('.g-principal', f);
    $$('.g-miniaturas img', f).forEach(i => { i.onclick = () => { principal.style.visibility = ''; principal.src = i.src; }; });
  }
})();
