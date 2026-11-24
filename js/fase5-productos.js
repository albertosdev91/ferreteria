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
  const editaCatalogo = () => rol() === AG || rol() === ADM;      // Catálogo general: AG y ADMINISTRADOR, sin restricción
  const puedeModificar = () => editaCatalogo();
  const porNombre = (a, b) => txt(a.nombre).localeCompare(txt(b.nombre), 'es');
  const precio = v => n0(v) > 0 ? U.bs(v) : '<span class="suave">—</span>';
  /** Usos / profesiones de un producto (columna "usos": códigos separados por coma). */
  const usosDe = p => txt(p && p.usos).split(',').map(x => x.trim()).filter(Boolean);

  // Íconos de esta fase
  const ICO5 = {
    mas: 'M12 5v14M5 12h14',
    calc: 'M6 2h12a1 1 0 011 1v18a1 1 0 01-1 1H6a1 1 0 01-1-1V3a1 1 0 011-1M8 6h8v4H8zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01',
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
    const [productos, marcas, categorias, imagenes, archivos, usosLista] = await Promise.all([
      Datos.listar('PRODUCTOS'), Datos.listar('MARCAS'), Datos.listar('CATEGORIAS'), Datos.listar('PRODUCTO_IMAGENES', activo),
      Datos.listar('ARCHIVOS', activo), Datos.listar('LISTAS', l => l.lista === 'USO')
    ]);
    usosLista.sort((a, b) => n0(a.orden) - n0(b.orden) || txt(a.nombre).localeCompare(txt(b.nombre), 'es'));
    const usoPorCod = new Map(usosLista.map(u => [String(u.codigo), u]));
    productos.sort((a, b) => (a.estado === 'INACTIVO') - (b.estado === 'INACTIVO') || porNombre(a, b));
    const porId = new Map(productos.map(p => [String(p.id), p]));
    const marcaPorId = new Map(marcas.map(m => [String(m.id), m]));
    const catPorId = new Map(categorias.map(x => [String(x.id), x]));
    const codigos = new Map();      // código de barras → { producto, presentacion }
    const internos = new Map();     // código interno → producto
    const texto = new Map();        // texto para buscar (código, nombre, códigos de barras)
    const indice = [];              // lista preparada para buscar rápido
    productos.forEach(p => {
      PRESENTACIONES.forEach(([col, pres]) => {
        const k = codigoClave(p[col]);
        if (k && !codigos.has(k)) codigos.set(k, { producto: p, presentacion: pres });
      });
      const k = codigoClave(p.codigo);
      if (k && !internos.has(k)) internos.set(k, p);
      const m = marcaPorId.get(String(p.marca_id));
      const t = norm([p.codigo, p.nombre, p.codigo_barras_unidad, p.codigo_barras_paquete, p.codigo_barras_caja].join(' '));
      texto.set(String(p.id), t);
      indice.push({ p: p, t: t, marca: norm(m && m.nombre), ncod: norm(p.codigo), nnom: norm(p.nombre),
        claves: [codigoClave(p.codigo)].concat(PRESENTACIONES.map(([col]) => codigoClave(p[col]))).filter(Boolean) });
    });
    const rutas = new Map();        // ruta de imagen (minúsculas) → fila de ARCHIVOS
    archivos.forEach(a => { if (a.archivo_id) rutas.set(String(a.ruta || a.id).toLowerCase(), a); });
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
      codigos: codigos, internos: internos, texto: texto, indice: indice, imagenes: imgs, rutas: rutas, rutaCategoria: rutaCategoria,
      nombreMarca: id => { const m = marcaPorId.get(String(id)); return m ? m.nombre : ''; },
      usos: usosLista, nombreUso: cod => { const u = usoPorCod.get(String(cod)); return u ? u.nombre : cod; }
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

  /**
   * Separa la búsqueda: lo que va antes de la coma busca en código, códigos de barras y nombre;
   * lo que va después de la coma filtra por marca.  Ej.: "martillo 16, stanley"
   */
  function partirConsulta(q) {
    const s = String(q == null ? '' : q);
    const i = s.indexOf(',');
    return i < 0 ? { texto: s, marca: '' } : { texto: s.slice(0, i), marca: s.slice(i + 1) };
  }

  /** Busca por palabras (en cualquier orden). op: { ids: Set, inactivos, categorias: Set, marca } */
  async function buscar(q, op) {
    op = op || {};
    const c = await cargar();
    const partes = partirConsulta(q);
    const palabras = norm(partes.texto).split(/\s+/).filter(Boolean);
    const marcas = norm(partes.marca).split(/\s+/).filter(Boolean);
    const kq = codigoClave(partes.texto);
    const nq = norm(partes.texto);
    const r = [];
    for (let i = 0; i < c.indice.length; i++) {
      const x = c.indice[i], p = x.p;
      if (!op.inactivos && p.estado === 'INACTIVO') continue;
      if (op.ids && !op.ids.has(String(p.id))) continue;
      if (op.categorias && !op.categorias.has(String(p.categoria_id))) continue;
      if (op.marca && !mismo(p.marca_id, op.marca)) continue;
      if (op.uso && usosDe(p).indexOf(op.uso) < 0) continue;
      let ok = true;
      for (let j = 0; j < palabras.length; j++) if (x.t.indexOf(palabras[j]) < 0) { ok = false; break; }
      if (!ok) continue;
      for (let j = 0; j < marcas.length; j++) if (x.marca.indexOf(marcas[j]) < 0) { ok = false; break; }
      if (!ok) continue;
      let rango = 3;
      if (kq && x.claves.indexOf(kq) >= 0) rango = 0;
      else if (nq && x.ncod.indexOf(nq) === 0) rango = 1;
      else if (nq && x.nnom.indexOf(nq) === 0) rango = 2;
      r.push({ p: p, rango: rango });
    }
    // Sin coma y sin resultados: probar lo escrito como marca (ej. "stanley")
    if (!r.length && palabras.length && !marcas.length && !op.sinMarca) return buscar(', ' + partes.texto, Object.assign({}, op, { sinMarca: true }));
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

  // ---------- "Nuevo stock": último ingreso de mercadería (compra, inventario inicial o traspaso recibido) ----------
  const TIPOS_INGRESO = ['COMPRA', 'INVENTARIO_INICIAL', 'TRASPASO_ENTRADA'];
  /** Map producto_id → fecha del último ingreso en la sucursal (servidor + lo de este equipo aún no enviado). */
  async function ingresos(sucursalId) {
    const m = new Map();
    const poner = (k, fe) => { if (fe && (!m.get(k) || Date.parse(fe) > Date.parse(m.get(k)))) m.set(k, fe); };
    (await Datos.listar('STOCK_ACTUAL', x => mismo(x.sucursal_id, sucursalId))).forEach(x => poner(String(x.producto_id), txt(x.ultimo_ingreso_en)));
    (await Sesion.local.salida()).forEach(x => {
      const f = x.fila;
      if (x.tabla === 'MOVIMIENTOS' && mismo(f.sucursal_id, sucursalId) && Number(f.cantidad) > 0 && TIPOS_INGRESO.indexOf(f.tipo) >= 0) {
        poner(String(f.producto_id), txt(f.fecha || f.creado_en));
      }
    });
    return m;
  }
  /** Días de "Nuevo stock": primero los de la empresa (dias_nuevo_stock:<empresa_id>), si no el general, si no 7. */
  async function diasNuevoStock(empresaId) {
    if (!empresaId && App.contexto.empresa) empresaId = App.contexto.empresa.id;
    const general = await Datos.config('dias_nuevo_stock', '7');
    const n = parseInt(empresaId ? await Datos.config('dias_nuevo_stock:' + empresaId, general) : general, 10);
    return isFinite(n) && n >= 0 ? n : 7;
  }
  const esNuevo = (fecha, dias) => !!fecha && dias > 0 && Date.now() - Date.parse(fecha) <= dias * 86400000;
  const ETQ_NUEVO = ' <span class="etiqueta nuevo">Nuevo stock</span>';

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

  // ---------- Imágenes por rutas ----------
  // Las imágenes se guardan en Google Drive: Mi Unidad > APP-WEB > IMAGENES > PRODUCTOS > CODIGO.png
  // En la hoja se guarda la RUTA (ej. IMAGENES/PRODUCTOS/AMR104.png). La pestaña ARCHIVOS dice
  // qué archivo de Drive corresponde a cada ruta. Sin imagen → IMAGENES/no-img.jpg
  const RUTA_PRODUCTOS = 'IMAGENES/PRODUCTOS';
  const RUTA_SIN_IMAGEN = 'IMAGENES/no-img.jpg';
  const EXT_IMG = ['png', 'jpg', 'jpeg', 'webp'];
  const esUrl = v => /^https?:\/\//i.test(txt(v));
  const esRuta = v => /^[^\/]+(\/[^\/]+)+\.(png|jpe?g|webp|gif)$/i.test(txt(v));
  const nombreArchivo = codigo => txt(codigo).replace(/[\\\/:*?"<>|\s]+/g, '-');
  const urlDrive = id => 'https://lh3.googleusercontent.com/d/' + id;

  /** URL para mostrar una ruta (IMAGENES/…) o un enlace (https://…). '' si no existe. */
  function urlDe(valor, c) {
    const v = txt(valor);
    if (!v) return '';
    if (esUrl(v)) return App.urlImagen(v);
    c = c || cache;
    const a = c && c.rutas.get(v.toLowerCase());
    return a ? urlDrive(a.archivo_id) : '';
  }
  /** Imagen del producto: la suya → la que está en Drive con su código → la primera extra → no-img.jpg */
  function imagenDe(p, c) {
    if (!p) return '';
    c = c || cache;
    let u = urlDe(p.imagen_principal_url, c);
    if (!u && c) {
      const base = RUTA_PRODUCTOS + '/' + nombreArchivo(p.codigo) + '.';
      for (let i = 0; i < EXT_IMG.length && !u; i++) u = urlDe(base + EXT_IMG[i], c);
    }
    if (!u && c) {
      const ex = c.imagenes.get(String(p.id)) || [];
      for (let i = 0; i < ex.length && !u; i++) u = urlDe(ex[i].url, c);
    }
    return u || urlDe(RUTA_SIN_IMAGEN, c);
  }
  function miniatura(p, c, clase) {
    const u = imagenDe(p, c);
    return '<span class="mini' + (clase ? ' ' + clase : '') + '">' + (u ? '<img src="' + esc(u) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '</span>';
  }

  /** Achica la foto (máx. 1200 px) y la devuelve en base64, manteniendo PNG / JPG / WEBP. */
  async function prepararImagen(archivo) {
    const tipos = { 'image/png': 'image/png', 'image/jpeg': 'image/jpeg', 'image/jpg': 'image/jpeg', 'image/webp': 'image/webp' };
    const tipo = tipos[String(archivo.type).toLowerCase()];
    if (!tipo) throw new Error('Use una imagen PNG o JPG.');
    const url = URL.createObjectURL(archivo);
    try {
      const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error('No se pudo leer la imagen.')); i.src = url; });
      const max = 1200;
      const esc2 = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      let blob = archivo;
      if (esc2 < 1 || archivo.size > 1500000) {
        const cv = document.createElement('canvas');
        cv.width = Math.round(img.naturalWidth * esc2);
        cv.height = Math.round(img.naturalHeight * esc2);
        const g = cv.getContext('2d');
        if (tipo === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); }
        g.drawImage(img, 0, 0, cv.width, cv.height);
        blob = await new Promise(ok => cv.toBlob(ok, tipo, 0.85));
      }
      const base64 = await new Promise((ok, mal) => {
        const r = new FileReader();
        r.onload = () => ok(String(r.result).split(',')[1]);
        r.onerror = () => mal(new Error('No se pudo leer la imagen.'));
        r.readAsDataURL(blob);
      });
      return { tipo: tipo, base64: base64, bytes: blob.size };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** Sube una foto a Drive (necesita internet). Devuelve la ruta guardada. */
  async function subirImagen(archivo, codigo, sufijo) {
    if (!navigator.onLine) throw new Error('Necesita internet para subir imágenes.');
    const u = Sesion.actual;
    if (!u.token) throw new Error('Su sesión en el servidor terminó. Vuelva a iniciar sesión con internet.');
    if (!nombreArchivo(codigo)) throw new Error('Escriba primero el código interno: la imagen se guarda con ese nombre.');
    const img = await prepararImagen(archivo);
    let r;
    try {
      r = await Api.llamar('subirImagen', { codigo: codigo, sufijo: sufijo || '', tipo: img.tipo, datos: img.base64 }, u.token, { segundos: 120 });
    } catch (e) {
      if (e.codigo === 'SESION_INVALIDA') { await Sesion.marcarSesionVencida(); window.dispatchEvent(new CustomEvent('sync-estado')); }
      if (e.codigo === 'ACCION') throw new Error('El servidor todavía no acepta imágenes: actualice Api.gs (Fase 5.1) y haga una nueva versión de la implementación.');
      throw e;
    }
    await Sesion.local.guardarDelServidor({ ARCHIVOS: [r.archivo] }, false);
    cache = null;
    await cargar();
    return r.ruta;
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

  // Atajo de teclado: F2 abre "Buscar producto y stock" desde cualquier pantalla
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'F2' || !Sesion.actual || document.querySelector('.modal-fondo, .escaner')) return;
    ev.preventDefault();
    if (App.actual() === 'buscar') { const i = document.getElementById('bQ'); if (i) { i.focus(); i.select(); } }
    else App.ir('buscar');
  });

  // El ADMINISTRADOR también entra al Catálogo general (agrega productos y modifica los de su empresa)
  (function () { const it = App.itemMenu('catalogo'); if (it && it.roles.indexOf(ADM) < 0) it.roles.push(ADM); })();

  window.Catalogo = {
    cargar: cargar, porCodigo: porCodigo, buscar: buscar, stocks: stocks, ingresos: ingresos, diasNuevoStock: diasNuevoStock, factor: factor, textoStock: textoStock,
    imagen: imagenDe, urlImagen: urlDe, partirConsulta: partirConsulta, normalizar: norm, codigoClave: codigoClave
  };

  // ============================================================
  //  PANTALLA: CATÁLOGO GENERAL (solo ADMIN_GENERAL)
  // ============================================================
  const fCat = { buscar: '', categoria: '', marca: '', uso: '', estado: 'ACTIVO', limite: 50 };
  let ultimaVistaCat = [];      // lo que se ve en el catálogo (para exportar)

  App.pantalla('catalogo', {
    refrescar: true,
    async render(el) {
      const raiz = contenedor(el);
      if (!editaCatalogo()) {
        raiz.innerHTML = vacio('lock', 'Su rol no tiene acceso al catálogo general.');
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
        (esAG() ? '<button class="btn btn-borde" data-acc="unidades">' + icoX('etiqueta') + 'Unidades</button>' +
          '<button class="btn btn-borde" data-acc="usos">' + icoX('etiqueta') + 'Usos / profesiones</button>' : '') +
        '<button class="btn btn-borde" data-acc="exportar">' + ico('download') + 'Exportar Excel</button>' +
        '<button class="btn btn-principal" data-acc="nuevo">' + icoX('mas') + 'Nuevo producto</button></div></div>' +
        '<div class="filtros">' +
        '<div class="campo"><label for="catBuscar">Buscar <small class="suave">(después de una coma: marca)</small></label>' +
        '<input class="entrada" id="catBuscar" data-foco placeholder="Ej. martillo 16, stanley" value="' + esc(fCat.buscar) + '" autocomplete="off" enterkeyhint="search"></div>' +
        '<div class="campo corto"><label for="catCat">Categoría</label>' +
        lista('catCat', [['', 'Todas']].concat(arbolCategorias(c, { inactivas: true }).map(x => [x[0], x[1]])), fCat.categoria) + '</div>' +
        '<div class="campo corto"><label for="catUso">Uso / profesión</label>' + lista('catUso', opcionesUsos(c), fCat.uso) + '</div>' +
        '<div class="campo corto"><label for="catEstado">Mostrar</label>' +
        lista('catEstado', [['ACTIVO', 'Activos'], ['INACTIVO', 'Inactivos'], ['TODOS', 'Todos']], fCat.estado) + '</div></div>' +
        '<div id="catLista"></div>';

      const iBuscar = $('#catBuscar', raiz);
      Escaner.boton(iBuscar, { enter: true, titulo: 'Escanee el producto' });

      const pintar = async () => {
        const vista = (await buscar(fCat.buscar, {
          inactivos: true,
          categorias: fCat.categoria ? descendientes(c, fCat.categoria) : null, uso: fCat.uso,
          marca: ''
        })).filter(p => fCat.estado === 'TODOS' || (fCat.estado === 'INACTIVO') === (p.estado === 'INACTIVO'));
        ultimaVistaCat = vista;
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
            const mod = puedeModificar(p, c);
            return '<tr class="clic' + (inactivo ? ' inactivo' : '') + '" data-acc="' + (mod ? 'editar' : 'ver') + '" data-id="' + esc(p.id) + '">' +
              '<td style="width:52px">' + miniatura(p, c) + '</td>' +
              '<td><b>' + esc(p.codigo) + '</b></td>' +
              '<td><b>' + esc(p.nombre) + '</b>' + etiquetaEnvio(pend[p.id]) +
              '<span class="sub">' + esc([c.nombreMarca(p.marca_id), c.rutaCategoria(p.categoria_id)].filter(Boolean).join(' · ') || 'Sin marca ni categoría') + '</span>' +
              (usosDe(p).length ? '<span class="sub">' + usosDe(p).map(u => '<span class="etiqueta uso">' + esc(c.nombreUso(u)) + '</span>').join(' ') + '</span>' : '') +
              (barras ? '<span class="sub mono">' + esc(barras) + '</span>' : '') + '</td>' +
              '<td>' + esc(p.unidad || '—') + '</td><td>' + esc(emp || '—') + '</td>' +
              '<td class="num">' + (nSuc.get(String(p.id)) || 0) + '</td>' +
              '<td>' + etiquetaEstado(p.estado) + '</td>' +
              '<td class="acc"><div class="acciones-fila">' + (mod
                ? '<button class="btn btn-chico btn-borde" data-acc="editar" data-id="' + esc(p.id) + '">Editar</button>' +
                  '<button class="btn btn-chico ' + (inactivo ? 'btn-borde' : 'btn-peligro') + '" data-acc="estado" data-id="' + esc(p.id) + '">' +
                  (inactivo ? 'Activar' : 'Desactivar') + '</button>'
                : '<button class="btn btn-chico btn-borde" data-acc="ver" data-id="' + esc(p.id) + '">Ver</button>') + '</div></td></tr>';
          }).join('') + '</tbody></table></div>' +
          (vista.length > mostrar.length ? '<div class="mas-centro"><button class="btn btn-borde" data-acc="mas">Mostrar más (' +
            (vista.length - mostrar.length) + ' restantes)</button></div>' : '<p class="nota" style="margin-top:10px">' + vista.length + ' producto(s).</p>');
      };
      await pintar();
      restaurarFoco(raiz);

      let espera = null;
      iBuscar.oninput = () => { fCat.buscar = iBuscar.value; fCat.limite = 50; clearTimeout(espera); espera = setTimeout(pintar, 60); };
      iBuscar.onkeydown = async ev => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        const r = await porCodigo(iBuscar.value);
        if (r) { fCat.buscar = ''; iBuscar.value = ''; await pintar(); return puedeModificar(r.producto, c) ? formProducto(r.producto) : verProducto(r.producto); }
      };
      $('#catCat', raiz).onchange = e => { fCat.categoria = e.target.value; fCat.limite = 50; pintar(); };
      $('#catUso', raiz).onchange = e => { fCat.uso = e.target.value; fCat.limite = 50; pintar(); };
      $('#catEstado', raiz).onchange = e => { fCat.estado = e.target.value; fCat.limite = 50; pintar(); };

      raiz.onclick = async ev => {
        const b = ev.target.closest('[data-acc]');
        if (!b) return;
        ev.stopPropagation();
        const p = b.dataset.id ? c.porId.get(String(b.dataset.id)) : null;
        switch (b.dataset.acc) {
          case 'nuevo': return formProducto(null);
          case 'crearCon': return formProducto(null, { codigoBarras: b.dataset.cod });
          case 'editar': return puedeModificar(p, c) ? formProducto(p) : verProducto(p);
          case 'ver': return verProducto(p);
          case 'estado': return puedeModificar(p, c) ? cambiarEstadoProducto(p, nSuc.get(String(p.id)) || 0) : null;
          case 'exportar': return exportarCatalogo();
          case 'categorias': return gestionarMaestro('CATEGORIAS');
          case 'marcas': return gestionarMaestro('MARCAS');
          case 'unidades': return esAG() ? gestionarLista(LISTA_CFG.UNIDAD) : null;
          case 'usos': return esAG() ? gestionarLista(LISTA_CFG.USO) : null;
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

  /** Opciones para filtros: [['', 'Todos'], [codigo, nombre]…] */
  function opcionesUsos(c, todos) {
    return [['', todos || 'Todos']].concat(c.usos.filter(activo).map(u => [u.codigo, u.nombre]));
  }
  function opcionesMarcasFiltro(c) {
    return [['', 'Todas']].concat(c.marcas.filter(activo).sort(porNombre).map(m => [m.id, m.nombre]));
  }

  function opcionesMarcas(c, sel) {
    return [['', '— Sin marca —']].concat(c.marcas.filter(m => activo(m) || mismo(m.id, sel)).sort(porNombre).map(m => [m.id, m.nombre]));
  }
  function opcionesCategorias(c, sel) {
    return [['', '— Sin categoría —']].concat(arbolCategorias(c, { incluir: sel }).map(x => [x[0], x[1]]));
  }

  /** "Potencia: 2000 W" → fila de tabla; "Incluye estuche" → punto de lista. */
  function caracteristicasHtml(texto) {
    const filas = [], puntos = [];
    String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => {
      const i = l.indexOf(':');
      if (i > 0 && i <= 40 && l.slice(i + 1).trim()) filas.push([l.slice(0, i).trim(), l.slice(i + 1).trim()]);
      else puntos.push(l.replace(/^[-•*·]\s*/, ''));
    });
    if (!filas.length && !puntos.length) return '';
    return (filas.length ? '<table class="carac-tabla"><tbody>' + filas.map(f => '<tr><th>' + esc(f[0]) + '</th><td>' + esc(f[1]) + '</td></tr>').join('') + '</tbody></table>' : '') +
      (puntos.length ? '<ul class="carac-lista">' + puntos.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '');
  }

  function checksUsos(c, marcados) {
    const lista2 = c.usos.filter(u => activo(u) || marcados.indexOf(u.codigo) >= 0);
    return lista2.map(u => '<label class="chip-check"><input type="checkbox" name="pUso" value="' + esc(u.codigo) + '"' +
      (marcados.indexOf(u.codigo) >= 0 ? ' checked' : '') + '><span>' + esc(u.nombre) + '</span></label>').join('') +
      '<button type="button" class="chip-check nuevo" data-nuevo-uso>' + icoX('mas') + 'Nuevo uso</button>' +
      (!lista2.length ? '<span class="ayuda">Todavía no hay usos. Créelos con "Nuevo uso" o en el botón <b>Usos / profesiones</b> del catálogo.</span>' : '');
  }

  function filaImagen(url, id) {
    const u = urlDe(url);
    return '<div class="img-fila"' + (id ? ' data-id="' + esc(id) + '"' : '') + '>' +
      '<span class="mini">' + (u ? '<img src="' + esc(u) + '" alt="" onerror="this.remove()">' : '') + '</span>' +
      '<input class="entrada" value="' + esc(url || '') + '" placeholder="IMAGENES/PRODUCTOS/CODIGO-2.jpg o enlace" spellcheck="false">' +
      '<button type="button" class="btn btn-icono" data-quitar title="Quitar" aria-label="Quitar imagen">' + icoX('quitar') + '</button></div>';
  }

  async function formProducto(p, op) {
    op = op || {};
    const nuevo = !p;
    p = p || {};
    const c = await cargar();
    const ctx = App.contexto;
    let unidades = (await Datos.lista('UNIDAD')).map(x => [x.codigo, x.codigo === x.nombre.toUpperCase() ? x.codigo : x.codigo + ' — ' + x.nombre]);
    if (!unidades.length) unidades = [['UNIDAD', 'UNIDAD']];
    const unidadIni = p.unidad || (unidades.some(x => x[0] === 'UNIDAD') ? 'UNIDAD' : unidades[0][0]);
    if (p.unidad && !unidades.some(x => mismo(x[0], p.unidad))) unidades.unshift([p.unidad, p.unidad]);
    const extras = nuevo ? [] : (c.imagenes.get(String(p.id)) || []);
    const alcanceNuevo = nuevo ? await alcanceSucursales() : { empresas: [], sucursales: [] };

    const html = '<div class="form-2">' +
      '<div class="seccion-form">Identificación</div>' +
      campo('pCodigo', 'Código interno', nuevo ? sugerirCodigo(c.productos) : p.codigo, { req: true,
        attrs: ' maxlength="30" autocapitalize="characters" spellcheck="false" autocomplete="off"',
        ayuda: 'Único. Letras, números, punto o guion. Se sugiere uno automático.' }) +
      campoLista('pUnidad', 'Unidad de medida', unidades, unidadIni, { ayuda: 'El stock siempre se cuenta en esta unidad. Para agregar más: botón <b>Unidades</b> del catálogo.' }) +
      campo('pNombre', 'Nombre del producto', p.nombre, { req: true, clase: 'todo', ph: 'Ej. Martillo carpintero 16 oz mango de fibra',
        attrs: ' maxlength="120" autocomplete="off"' }) +
      '<div class="campo"><label for="pMarca">Marca</label><div class="con-mas">' + lista('pMarca', opcionesMarcas(c, p.marca_id), p.marca_id || '') +
      '<button type="button" class="btn btn-borde" data-nueva="MARCAS" title="Crear marca" aria-label="Crear marca">' + icoX('mas') + '</button></div></div>' +
      '<div class="campo"><label for="pCategoria">Categoría</label><div class="con-mas">' + lista('pCategoria', opcionesCategorias(c, p.categoria_id), p.categoria_id || '') +
      '<button type="button" class="btn btn-borde" data-nueva="CATEGORIAS" title="Crear categoría" aria-label="Crear categoría">' + icoX('mas') + '</button></div></div>' +

      '<div class="campo todo"><label>Usos / profesiones <small class="suave">(puede marcar varios)</small></label>' +
      '<div class="usos-checks" id="pUsos">' + checksUsos(c, usosDe(p)) + '</div></div>' +
      '<div class="seccion-form">Códigos de barras</div>' +
      '<p class="nota todo">Con <b>lector USB</b>: toque el campo y escanee. Con el <b>celular</b>: botón de cámara. Puede dejarlos vacíos.</p>' +
      campo('pBarUni', 'De la unidad', nuevo && op.codigoBarras ? op.codigoBarras : p.codigo_barras_unidad, { attrs: ' data-barras autocomplete="off" spellcheck="false"' }) +
      campo('pBarPaq', 'Del paquete', p.codigo_barras_paquete, { attrs: ' data-barras autocomplete="off" spellcheck="false"' }) +
      campo('pBarCaja', 'De la caja', p.codigo_barras_caja, { attrs: ' data-barras autocomplete="off" spellcheck="false"' }) +

      '<div class="seccion-form">Empaque</div>' +
      (!nuevo ? '<div class="campo todo"><label class="check aviso-check"><input type="checkbox" id="pDesbloq"><span><b>Cambiar unidades por paquete o por caja</b>' +
        '<small>Cuidado: cambia cómo se cuentan las cajas del stock y el precio por unidad de la caja cerrada en todas las sucursales. ' +
        'Úselo solo para corregir un error.</small></span></label></div>' : '') +
      campoNum('pUPaq', 'Unidades por paquete', p.unidades_por_paquete, { ph: 'Ej. 12', ayuda: 'Vacío si no se vende en paquete.', attrs: nuevo ? '' : ' readonly' }) +
      campoNum('pUCaja', 'Unidades por caja', p.unidades_por_caja, { ph: 'Ej. 100', ayuda: 'Vacío si no viene en caja.', attrs: nuevo ? '' : ' readonly' }) +
      '<div class="campo todo"><label>Medidas de la caja (cm)</label><div class="tres">' +
      '<input class="entrada" id="pAncho" inputmode="decimal" placeholder="Ancho" aria-label="Ancho en cm" value="' + esc(fmtNum(p.caja_ancho_cm)) + '">' +
      '<input class="entrada" id="pAlto" inputmode="decimal" placeholder="Alto" aria-label="Alto en cm" value="' + esc(fmtNum(p.caja_alto_cm)) + '">' +
      '<input class="entrada" id="pProf" inputmode="decimal" placeholder="Profundidad" aria-label="Profundidad en cm" value="' + esc(fmtNum(p.caja_prof_cm)) + '">' +
      '</div><span class="ayuda" id="pVol">Sirven para repartir el transporte por volumen en las compras.</span></div>' +

      '<div class="seccion-form">Imágenes</div>' +
      '<div class="campo todo"><label for="pImg">Imagen principal</label><div class="img-fila principal">' +
      '<span class="mini grande" id="pImgVista"></span>' +
      '<input class="entrada" id="pImg" value="' + esc(p.imagen_principal_url || '') + '" placeholder="IMAGENES/PRODUCTOS/CODIGO.png" spellcheck="false">' +
      '<button type="button" class="btn btn-principal" id="pSubir">' + ico('upload') + '<span>Subir</span></button>' +
      '<input type="file" id="pArchivo" accept="image/png,image/jpeg,image/webp" hidden></div>' +
      '<span class="ayuda" id="pImgAyuda">Toque <b>Subir</b> para elegir la foto o tomarla con la cámara (necesita internet). Se guarda en Drive en ' +
      '<b>APP-WEB › IMAGENES › PRODUCTOS</b> con el nombre del código (ej. <b>AMR104.png</b>) y aquí queda su ruta. ' +
      'Si lo deja vacío se usa la imagen del Drive con su código o <b>no-img.jpg</b>.</span></div>' +
      '<div class="campo todo"><label>Más imágenes</label><div id="pExtras">' + extras.map(i => filaImagen(i.url, i.id)).join('') + '</div>' +
      '<div class="acciones-fila" style="justify-content:flex-start"><button type="button" class="btn btn-borde btn-chico" id="pSubirOtra">' + ico('upload') + 'Subir otra imagen</button>' +
      '<button type="button" class="btn btn-borde btn-chico" id="pMasImg">' + icoX('imagen') + 'Escribir ruta o enlace</button></div>' +
      '<input type="file" id="pArchivoOtra" accept="image/png,image/jpeg,image/webp" hidden></div>' +
      campo('pDesc', 'Descripción', p.descripcion, { clase: 'todo', area: true, ph: 'Para qué sirve, en pocas palabras.' }) +
      '<div class="seccion-form">Características</div>' +
      '<div class="campo todo"><label for="pCarac">Características técnicas</label>' +
      '<textarea class="entrada mono-suave" id="pCarac" rows="6" maxlength="5000" placeholder="Potencia: 2000 W&#10;Voltaje: 220 V&#10;Peso: 0,8 kg&#10;Incluye 2 boquillas y estuche">' + esc(p.caracteristicas || '') + '</textarea>' +
      '<span class="ayuda">Una por línea. Escriba <b>Nombre: valor</b> para que se vea como tabla (ej. <i>Potencia: 2000 W</i>). ' +
      'Las líneas sin dos puntos se muestran como lista (ej. <i>Incluye 2 boquillas</i>).</span>' +
      '<div class="carac-vista" id="pCaracVista"></div></div>' +
      campo('pFicha', 'Enlace de la ficha técnica (datasheet)', p.ficha_tecnica_url, { clase: 'todo', ph: 'https://…/ficha.pdf', attrs: ' spellcheck="false"',
        ayuda: 'Opcional. Enlace al PDF del fabricante o a un archivo de Google Drive compartido.' }) +

      (!nuevo ? '<div class="seccion-form">Estado</div>' + campoLista('pEstado', 'Estado', [['ACTIVO', 'Activo'], ['INACTIVO', 'Inactivo']], p.estado || 'ACTIVO') : '') +
      (nuevo && alcanceNuevo.sucursales.length ? '<div class="seccion-form">Asignar a sucursales</div>' +
        '<p class="nota todo">Marque dónde se venderá o guardará. Los precios se cargan después en Productos de la sucursal.</p>' +
        '<div class="todo">' + destinosHtml(ctx.sucursal, alcanceNuevo, { libre: true }) + '</div>' : '') +
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
      const v = txt($('#pImg', f).value);
      const u = v ? urlDe(v) : imagenDe(Object.assign({}, p, { codigo: $('#pCodigo', f).value, imagen_principal_url: '' }));
      $('#pImgVista', f).innerHTML = u ? '<img src="' + esc(u) + '" alt="" onerror="this.remove()">' : '';
    };
    // Subir fotos a Drive
    const subir = async (input, boton, sufijo, alTerminar) => {
      const archivo = input.files && input.files[0];
      input.value = '';
      if (!archivo) return;
      const textoAntes = boton.innerHTML;
      boton.disabled = true;
      boton.innerHTML = 'Subiendo…';
      try {
        const ruta = await subirImagen(archivo, txt($('#pCodigo', f).value), sufijo());
        alTerminar(ruta);
        App.aviso('Imagen guardada en Drive: ' + ruta, 'ok');
      } catch (e) {
        mensaje(f, e.message || String(e));
      } finally {
        boton.disabled = false;
        boton.innerHTML = textoAntes;
      }
    };
    $('#pSubir', f).onclick = () => { mensaje(f, ''); $('#pArchivo', f).click(); };
    $('#pArchivo', f).onchange = e => subir(e.target, $('#pSubir', f), () => '', ruta => { $('#pImg', f).value = ruta; vistaPrincipal(); });
    $('#pSubirOtra', f).onclick = () => { mensaje(f, ''); $('#pArchivoOtra', f).click(); };
    $('#pArchivoOtra', f).onchange = e => subir(e.target, $('#pSubirOtra', f), () => {
      const usados = $$('#pExtras .img-fila input', f).map(i => txt(i.value).toLowerCase());
      const base = nombreArchivo($('#pCodigo', f).value).toLowerCase() + '-';
      let n = 2;
      while (usados.some(u => u.indexOf('/' + base + n + '.') >= 0)) n++;
      return String(n);
    }, ruta => {
      $('#pExtras', f).insertAdjacentHTML('beforeend', filaImagen(ruta, ''));
    });
    $('#pCodigo', f).addEventListener('change', vistaPrincipal);
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
      const u = urlDe(ev.target.value);
      $('.mini', fila).innerHTML = u ? '<img src="' + esc(u) + '" alt="" onerror="this.remove()">' : '';
    });
    // Unidades por paquete / caja: al editar, solo con la casilla marcada
    const desbloq = $('#pDesbloq', f);
    if (desbloq) desbloq.onchange = () => {
      ['pUPaq', 'pUCaja'].forEach(id => { const i = $('#' + id, f); i.readOnly = !desbloq.checked; if (!desbloq.checked) i.value = fmtNum(p[id === 'pUPaq' ? 'unidades_por_paquete' : 'unidades_por_caja']); });
      if (desbloq.checked) $('#pUPaq', f).focus();
    };
    // Vista previa de las características
    const vistaCarac = () => { $('#pCaracVista', f).innerHTML = caracteristicasHtml($('#pCarac', f).value); };
    $('#pCarac', f).oninput = vistaCarac;
    vistaCarac();
    // Crear un uso / profesión sin salir del formulario
    $('#pUsos', f).addEventListener('click', async ev => {
      if (!ev.target.closest('[data-nuevo-uso]')) return;
      const marcados = $$('#pUsos input[name="pUso"]:checked', f).map(i => i.value);
      const lista2 = await leerLista('USO');
      const cod = await editarUnidad(null, lista2, LISTA_CFG.USO);
      if (!cod) return;
      const c2 = await cargar();
      $('#pUsos', f).innerHTML = checksUsos(c2, marcados.concat([cod]));
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
        descripcion: v('pDesc'), imagen_principal_url: v('pImg'),
        caracteristicas: String($('#pCarac', f).value || '').replace(/\s+$/, ''), ficha_tecnica_url: v('pFicha'),
        usos: $$('#pUsos input[name="pUso"]:checked', f).map(i => i.value).join(',')
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
      if (d.ficha_tecnica_url && !esUrl(d.ficha_tecnica_url)) return mensaje(f, 'El enlace de la ficha técnica debe empezar con https://');
      const mala = urls.find(u => u && !esUrl(u) && !esRuta(u));
      if (mala) return mensaje(f, 'La imagen «' + mala + '» no es válida. Use una ruta como IMAGENES/PRODUCTOS/AMR104.png o un enlace https://');

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

      const destinos = nuevo ? $$('input[name="aDest"]:checked', f).map(i => i.value) : [];
      if (destinos.length) {
        const todas = await Datos.listar('SUCURSALES');
        destinos.forEach(sid => {
          const s = todas.find(x => mismo(x.id, sid));
          if (s) registros.push({ tabla: 'PRODUCTOS_SUCURSAL', fila: { id: U.uuid(), empresa_id: s.empresa_id, sucursal_id: s.id, producto_id: id,
            ubicacion: '', stock_minimo: '', producto_especial: 'NO', estado: 'ACTIVO' } });
        });
      }
      const asignar = destinos.length;
      if (!nuevo && registros.length === 1 && Object.keys(registros[0].fila).length === 1) {
        App.aviso('Sin cambios', 'info');
        return true;
      }
      await Datos.guardarVarios(registros);
      App.aviso(nuevo ? 'Producto creado' + (asignar ? ' y asignado a ' + asignar + ' sucursal(es)' : '') : 'Producto guardado', 'ok');
      await App.refrescarContexto();
      return true;
    } catch (err) {
      console.error(err);
      return mensaje(f, err.message || String(err));
    }
  }

  // ---------- Unidades de medida (pestaña LISTAS, lista "UNIDAD") ----------
  const UNIDADES_FERRETERIA = ['BOTE', 'COMBO', 'CTA', 'DOCENA', 'KILO', 'KIT', 'PAQUETE', 'PAR', 'ROLLO', 'SET', 'UNIDAD'];
  const UNIDAD_EQUIVALE = { UND: 'UNIDAD', KG: 'KILO', ROL: 'ROLLO', JGO: 'SET' };   // unidades antiguas → nuevas

  const USOS_SUGERIDOS = [['ELECTRICISTA', 'Electricista'], ['FONTANERIA', 'Fontanería / plomería'], ['CARPINTERIA', 'Carpintería'],
    ['CONSTRUCCION', 'Albañilería / construcción'], ['PINTURA', 'Pintura'], ['SOLDADURA', 'Soldadura'], ['MECANICA', 'Mecánica automotriz'],
    ['JARDINERIA', 'Jardinería'], ['HOGAR', 'Hogar'], ['SEGURIDAD', 'Seguridad industrial']];
  const LISTA_CFG = {
    UNIDAD: { lista: 'UNIDAD', titulo: 'Unidades de medida', una: 'unidad', nueva: 'Nueva unidad', ph: 'Ej. METRO', nombreIgual: true,
      nota: 'Son las unidades en que se cuenta el stock (UNIDAD, KILO, ROLLO…). Puede agregar, renombrar u ordenar. ' +
        'El código no se cambia porque lo usan los productos; si ya no sirve, desactívela.',
      cuenta: (p, cod) => txt(p.unidad) === cod, sugeridos: 'Usar la lista de la ferretería', aplicar: lista => usarUnidadesFerreteria(lista) },
    USO: { lista: 'USO', titulo: 'Usos / profesiones', una: 'uso', nueva: 'Nuevo uso', ph: 'Ej. ELECTRICISTA', nombreIgual: false,
      nota: 'Agrupan productos por oficio o tipo de uso (Electricista, Fontanería…). Un producto puede tener varios. ' +
        'Sirven para filtrar las búsquedas y para armar listas en PDF. El código no se cambia; el nombre sí.',
      cuenta: (p, cod) => usosDe(p).indexOf(cod) >= 0, sugeridos: 'Cargar usos sugeridos', aplicar: lista => cargarUsosSugeridos(lista) }
  };
  const leerLista = async nombre => (await Datos.listar('LISTAS', l => l.lista === nombre))
    .sort((a, b) => (a.estado === 'INACTIVO') - (b.estado === 'INACTIVO') || n0(a.orden) - n0(b.orden) || txt(a.codigo).localeCompare(txt(b.codigo)));

  async function gestionarLista(cfg) {
    const f = modalAncho({
      titulo: cfg.titulo,
      html: '<p class="nota">' + cfg.nota + '</p>' +
        '<div class="acciones-fila" style="justify-content:flex-start;margin-bottom:12px">' +
        '<button class="btn btn-principal" data-acc="nueva">' + icoX('mas') + cfg.nueva + '</button>' +
        '<button class="btn btn-borde" data-acc="sugeridos">' + cfg.sugeridos + '</button></div>' +
        '<div id="uLista"></div>',
      botones: [{ t: 'Cerrar', clase: 'btn-principal' }]
    });
    const pintar = async () => {
      const c = await cargar();
      const lista2 = await leerLista(cfg.lista);
      $('#uLista', f).innerHTML = !lista2.length ? '<p class="vacio">Todavía no hay ninguno. Use "' + cfg.sugeridos + '" o "' + cfg.nueva + '".</p>'
        : '<div class="tabla-env"><table class="tabla compacta"><thead><tr><th>Código</th><th>Nombre</th><th class="num">Orden</th>' +
          '<th class="num">Productos</th><th>Estado</th><th></th></tr></thead><tbody>' +
          lista2.map(u => '<tr' + (activo(u) ? '' : ' class="inactivo"') + '><td><b>' + esc(u.codigo) + '</b></td><td>' + esc(u.nombre) + '</td>' +
            '<td class="num">' + esc(u.orden) + '</td><td class="num">' + c.productos.filter(p => cfg.cuenta(p, txt(u.codigo))).length + '</td>' +
            '<td>' + etiquetaEstado(u.estado) + '</td>' +
            '<td class="acc"><div class="acciones-fila"><button class="btn btn-chico btn-borde" data-acc="editar" data-cod="' + esc(u.codigo) + '">Editar</button>' +
            '<button class="btn btn-chico ' + (activo(u) ? 'btn-peligro' : 'btn-borde') + '" data-acc="estado" data-cod="' + esc(u.codigo) + '">' +
            (activo(u) ? 'Desactivar' : 'Activar') + '</button></div></td></tr>').join('') + '</tbody></table></div>';
    };
    f.addEventListener('click', async ev => {
      const b = ev.target.closest('[data-acc]');
      if (!b) return;
      const lista2 = await leerLista(cfg.lista);
      const u = lista2.find(x => x.codigo === b.dataset.cod);
      if (b.dataset.acc === 'nueva' || b.dataset.acc === 'editar') { if (await editarUnidad(u, lista2, cfg)) pintar(); }
      else if (b.dataset.acc === 'estado') {
        const c = await cargar();
        const n = c.productos.filter(p => cfg.cuenta(p, u.codigo)).length;
        if (activo(u) && n && !(await App.confirmar('Desactivar', n + ' producto(s) usan «' + u.nombre +
          '». Lo conservan, pero ya no se podrá elegir para otros productos.', 'Desactivar', 'btn-peligro'))) return;
        await Datos.guardar('LISTAS', { lista: cfg.lista, codigo: u.codigo, estado: activo(u) ? 'INACTIVO' : 'ACTIVO' });
        pintar();
      } else if (b.dataset.acc === 'sugeridos') {
        if (await cfg.aplicar(lista2)) pintar();
      }
    });
    pintar();
  }

  /** Crear / editar una opción de LISTAS. Devuelve el código guardado (o false). */
  function editarUnidad(u, lista, cfg) {
    cfg = cfg || LISTA_CFG.UNIDAD;
    return new Promise(listo => {
      const nueva = !u;
      u = u || {};
      const siguiente = lista.reduce((m, x) => Math.max(m, n0(x.orden)), 0) + 1;
      const fm = App.modal({
        titulo: (nueva ? cfg.nueva : 'Editar ' + cfg.una + ' ' + u.codigo),
        html: campo('uNom', 'Nombre', u.nombre || '', { req: true, ph: cfg.nombreIgual ? cfg.ph : 'Ej. Electricista', attrs: ' maxlength="40"' }) +
          campo('uCod', 'Código', u.codigo, { req: true, ph: cfg.ph, attrs: ' maxlength="20" autocapitalize="characters" spellcheck="false"' + (nueva ? '' : ' readonly'),
            ayuda: nueva ? 'Se llena solo. MAYÚSCULAS y números, sin espacios ni tildes. No se cambia después.' : 'El código no se cambia.' }) +
          campoNum('uOrden', 'Orden en la lista', nueva ? siguiente : u.orden, { ayuda: 'Número más bajo = aparece primero.' }) +
          '<div class="f-msg"></div>',
        botones: [{ t: 'Cancelar', accion: () => listo(false) }, { t: 'Guardar', clase: 'btn-principal', accion: async m => {
          try {
            const cod = txt($('#uCod', m).value).toUpperCase().replace(/\s+/g, '');
            const nom = txt($('#uNom', m).value);
            if (!nom) return mensaje(m, 'Escriba el nombre.');
            if (!/^[A-Z0-9_-]{1,20}$/.test(cod)) return mensaje(m, 'El código debe tener de 1 a 20 MAYÚSCULAS o números, sin espacios ni tildes.');
            if (nueva && lista.some(x => x.codigo === cod)) return mensaje(m, 'El código ' + cod + ' ya existe (puede estar inactivo: actívelo).');
            if (lista.some(x => x.codigo !== cod && norm(x.nombre) === norm(nom))) return mensaje(m, 'Ya existe otro con el nombre «' + nom + '».');
            const orden = leerNumero(m, 'uOrden', 'el orden', { dec: 0 });
            await Datos.guardar('LISTAS', { lista: cfg.lista, codigo: cod, nombre: nom, orden: orden === '' ? siguiente : orden, estado: nueva ? 'ACTIVO' : (u.estado || 'ACTIVO') });
            App.aviso('Guardado', 'ok');
            listo(cod);
          } catch (e) {
            return mensaje(m, e.message || String(e));
          }
        } }]
      });
      const ic = $('#uCod', fm), inom = $('#uNom', fm);
      if (nueva) {
        ic.oninput = () => { ic.dataset.tocado = '1'; ic.value = ic.value.toUpperCase().replace(/\s/g, ''); };
        inom.oninput = () => {
          if (ic.dataset.tocado) return;
          ic.value = norm(inom.value).toUpperCase().replace(/[^A-Z0-9]+/g, cfg.nombreIgual ? '' : '_').replace(/^_+|_+$/g, '').slice(0, 20);
        };
      }
    });
  }

  async function cargarUsosSugeridos(lista2) {
    const faltan = USOS_SUGERIDOS.filter(([cod]) => !lista2.some(x => x.codigo === cod));
    if (!faltan.length) { App.aviso('Los usos sugeridos ya están cargados.', 'info'); return false; }
    if (!(await App.confirmar('Cargar usos sugeridos', 'Se agregarán: ' + faltan.map(x => x[1]).join(', ') + '. Después puede renombrarlos o desactivarlos.', 'Agregar'))) return false;
    const base = lista2.reduce((m, x) => Math.max(m, n0(x.orden)), 0);
    await Datos.guardarVarios(faltan.map(([cod, nom], i) => ({ tabla: 'LISTAS', fila: { lista: 'USO', codigo: cod, nombre: nom, orden: base + i + 1, estado: 'ACTIVO' } })));
    App.aviso(faltan.length + ' uso(s) agregados', 'ok');
    return true;
  }

  /** Deja activas las unidades de la ferretería; pasa UND→UNIDAD, KG→KILO, ROL→ROLLO, JGO→SET en los productos. */
  async function usarUnidadesFerreteria(lista) {
    const c = await cargar();
    const cambiar = c.productos.filter(p => UNIDAD_EQUIVALE[txt(p.unidad)]);
    const usadas = new Set(c.productos.map(p => UNIDAD_EQUIVALE[txt(p.unidad)] || txt(p.unidad)));
    const sobran = lista.filter(x => UNIDADES_FERRETERIA.indexOf(x.codigo) < 0 && activo(x));
    const quedan = sobran.filter(x => usadas.has(x.codigo));
    const ok = await App.confirmar('Usar la lista de la ferretería',
      'Quedarán activas: ' + UNIDADES_FERRETERIA.join(', ') + '.' +
      (cambiar.length ? ' Se cambia la unidad de ' + cambiar.length + ' producto(s): UND→UNIDAD, KG→KILO, ROL→ROLLO, JGO→SET.' : '') +
      (sobran.length - quedan.length ? ' Se desactivan las que nadie usa (' + sobran.filter(x => !usadas.has(x.codigo)).map(x => x.codigo).join(', ') + ').' : '') +
      (quedan.length ? ' Siguen activas porque hay productos que las usan: ' + quedan.map(x => x.codigo).join(', ') + '.' : ''), 'Aplicar');
    if (!ok) return false;
    const registros = UNIDADES_FERRETERIA.map((cod, i) => {
      const ya = lista.find(x => x.codigo === cod);
      return { tabla: 'LISTAS', fila: ya ? { lista: 'UNIDAD', codigo: cod, orden: i + 1, estado: 'ACTIVO' }
        : { lista: 'UNIDAD', codigo: cod, nombre: cod, orden: i + 1, estado: 'ACTIVO' } };
    });
    sobran.filter(x => !usadas.has(x.codigo)).forEach(x => registros.push({ tabla: 'LISTAS', fila: { lista: 'UNIDAD', codigo: x.codigo, estado: 'INACTIVO' } }));
    cambiar.forEach(p => registros.push({ tabla: 'PRODUCTOS', fila: { id: p.id, unidad: UNIDAD_EQUIVALE[txt(p.unidad)] } }));
    await Datos.guardarVarios(registros);
    App.aviso('Unidades actualizadas', 'ok');
    return true;
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
            '<td class="acc">' + (puedeModificar(x, c) ? '<div class="acciones-fila"><button class="btn btn-chico btn-borde" data-acc="editar" data-id="' + esc(x.id) + '">Editar</button>' +
            '<button class="btn btn-chico ' + (activo(x) ? 'btn-peligro' : 'btn-borde') + '" data-acc="estado" data-id="' + esc(x.id) + '">' +
            (activo(x) ? 'Desactivar' : 'Activar') + '</button></div>' : '<span class="suave" title="La creó el administrador general u otra empresa">Solo lectura</span>') +
            '</td></tr>').join('') + '</tbody></table></div>';
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
  const fPS = { buscar: '', categoria: '', uso: '', vista: 'TODOS', limite: 50 };
  let ultimaVistaPS = { sucId: '', items: [] };   // lo que se ve (para exportar)
  const VISTAS_PS = [['TODOS', 'Todos los asignados'], ['NUEVO', 'Nuevo stock'], ['BAJO', 'Stock bajo'], ['CERO', 'Sin stock'], ['ESPECIAL', 'Productos especiales'],
    ['SIN_PRECIO', 'Sin precio'], ['SIN_UBICACION', 'Sin ubicación'], ['INACTIVO', 'Desasignados']];

  /** Productos de una sucursal con su stock y avisos. */
  async function itemsSucursal(sucursalId) {
    const c = await cargar();
    const filas = await Datos.listar('PRODUCTOS_SUCURSAL', x => mismo(x.sucursal_id, sucursalId));
    const stock = await stocks(sucursalId);
    const ing = await ingresos(sucursalId);
    const sucX = await Datos.obtener('SUCURSALES', sucursalId);
    const dias = await diasNuevoStock(sucX && sucX.empresa_id);
    return filas.map(ps => {
      const p = c.porId.get(String(ps.producto_id));
      if (!p) return null;
      const s = stock.get(String(ps.producto_id)) || 0;
      const min = n0(ps.stock_minimo);
      const ingreso = ing.get(String(ps.producto_id)) || '';
      return { ps: ps, p: p, stock: s, activo: activo(ps), bajo: min > 0 && s <= min, cero: s <= 0, ingreso: ingreso, nuevo: esNuevo(ingreso, dias),
        especial: ps.producto_especial === 'SI', sinPrecio: !(n0(ps.precio_unidad) > 0), sinUbicacion: !txt(ps.ubicacion) };
    }).filter(Boolean);
  }

  // Empresa y sucursal que se están viendo en "Productos de la sucursal" (independiente de la barra de arriba)
  const vistaPS = { empresaId: '', sucursalId: '' };
  const ordenSuc = (a, b) => (b.es_central === 'SI') - (a.es_central === 'SI') || porNombre(a, b);

  /** Empresas y sucursales donde el usuario maneja productos. AG: todas. ADMINISTRADOR: las de su empresa. ALMACEN: las suyas. */
  async function alcanceSucursales() {
    if (esAG()) {
      const empresas = (await Datos.listar('EMPRESAS', activo)).sort(porNombre);
      const ids = new Set(empresas.map(e => String(e.id)));
      const sucursales = (await Datos.listar('SUCURSALES', s => activo(s) && ids.has(String(s.empresa_id)))).sort(ordenSuc);
      return { empresas: empresas, sucursales: sucursales };
    }
    const ctx = App.contexto;
    return { empresas: ctx.empresa ? [ctx.empresa] : [], sucursales: ctx.sucursales.slice().sort(ordenSuc) };
  }
  async function sucursalPS() {
    const a = await alcanceSucursales();
    let s = a.sucursales.find(x => mismo(x.id, vistaPS.sucursalId));
    if (!s && vistaPS.empresaId) s = a.sucursales.find(x => mismo(x.empresa_id, vistaPS.empresaId));
    if (!s && App.contexto.sucursal) s = a.sucursales.find(x => mismo(x.id, App.contexto.sucursal.id));
    if (!s) s = a.sucursales[0] || null;
    if (s) { vistaPS.sucursalId = s.id; vistaPS.empresaId = s.empresa_id; }
    return { suc: s, alcance: a };
  }
  const nombreEmpresa = (a, id) => (a.empresas.find(e => mismo(e.id, id)) || {}).nombre || '';

  App.pantalla('productos-sucursal', {
    refrescar: true,
    async render(el) {
      const { suc, alcance } = await sucursalPS();
      const raiz = contenedor(el);
      if (!suc) {
        raiz.innerHTML = '<div class="titulo"><div><h1>Productos de la sucursal</h1></div></div>' +
          vacio('store', esAG() ? 'Todavía no hay empresas con sucursales activas.' : 'No tiene sucursales asignadas. Pida al administrador que le asigne una.');
        return;
      }
      const sucsEmpresa = alcance.sucursales.filter(x => mismo(x.empresa_id, suc.empresa_id));
      const selectores = (esAG() && alcance.empresas.length > 1 ? '<div class="campo"><label for="psEmp">Empresa</label>' +
          lista('psEmp', alcance.empresas.map(e => [e.id, e.nombre]), suc.empresa_id) + '</div>' : '') +
        (sucsEmpresa.length > 1 ? '<div class="campo"><label for="psSuc">Sucursal</label>' +
          lista('psSuc', sucsEmpresa.map(x => [x.id, x.nombre + (x.es_central === 'SI' ? ' (central)' : '')]), suc.id) + '</div>' : '');
      const c = await cargar();
      const items = await itemsSucursal(suc.id);
      const act = items.filter(i => i.activo);
      const pend = await pendientesDe('PRODUCTOS_SUCURSAL');
      const valor = act.reduce((t, i) => t + Math.max(i.stock, 0) * n0(i.ps.costo_promedio), 0);
      const diasNuevo = await diasNuevoStock(suc.empresa_id);
      const cuenta = { NUEVO: act.filter(i => i.nuevo).length, BAJO: act.filter(i => i.bajo).length, CERO: act.filter(i => i.cero).length, ESPECIAL: act.filter(i => i.especial).length };

      const tile = (vista, titulo, cifra, clase) => '<button class="tarjeta tile' + (fPS.vista === vista ? ' elegida' : '') + '" data-vista="' + vista + '">' +
        '<span>' + titulo + '</span><b class="cifra' + (clase ? ' ' + clase : '') + '">' + cifra + '</b></button>';

      raiz.innerHTML =
        '<div class="titulo"><div><h1>Productos de la sucursal</h1><p>' + (esAG() ? esc(nombreEmpresa(alcance, suc.empresa_id)) + ' · ' : '') + esc(suc.nombre) +
        (suc.es_central === 'SI' ? ' (central)' : '') + ' · stock en unidades, precios en Bs.</p></div>' +
        '<div class="acciones-fila">' +
        (esAG() && alcance.sucursales.length > 1 ? '<button class="btn btn-borde" data-acc="copiar">' + icoX('copiar') + 'Copiar de otra sucursal</button>' : '') +
        (editaPrecios() ? '<button class="btn btn-borde" data-acc="imprimir">' + ico('file') + 'Imprimir lista</button>' : '') +
        '<button class="btn btn-borde" data-acc="exportar">' + ico('download') + 'Exportar Excel</button>' +
        '<button class="btn btn-principal" data-acc="asignar">' + icoX('mas') + 'Asignar productos</button></div></div>' +
        (selectores ? '<div class="filtros selector-suc">' + selectores + '</div>' : '') +
        (!editaPrecios() ? '<div class="msg msg-info">Su rol puede ver costos y precios, pero no cambiar los precios.</div>' : '') +
        '<div class="tiles">' +
        tile('TODOS', 'Asignados', act.length) +
        tile('NUEVO', 'Nuevo stock', cuenta.NUEVO, cuenta.NUEVO ? 'verde' : '') +
        tile('BAJO', 'Stock bajo', cuenta.BAJO, cuenta.BAJO ? 'amarilla' : '') +
        tile('CERO', 'Sin stock', cuenta.CERO, cuenta.CERO ? 'roja' : '') +
        tile('ESPECIAL', 'Especiales', cuenta.ESPECIAL) +
        (veCostos() ? '<div class="tarjeta tile"><span>Valor del inventario (al costo)</span><b class="cifra chica">' + U.bs(valor) + '</b></div>' : '') +
        '</div>' +
        '<p class="nota">"Nuevo stock" se muestra ' + (diasNuevo ? diasNuevo + ' día(s)' : '(desactivado)') + ' después de cada ingreso de mercadería (compra, inventario inicial o traspaso recibido).' +
        (editaPrecios() ? ' <a href="#" data-acc="dias">Cambiar días</a>' : '') + '</p>' +
        '<div class="filtros">' +
        '<div class="campo"><label for="psBuscar">Buscar <small class="suave">(también ubicación · después de una coma: marca)</small></label>' +
        '<input class="entrada" id="psBuscar" data-foco value="' + esc(fPS.buscar) + '" autocomplete="off" enterkeyhint="search" placeholder="Ej. clavo 2, truper"></div>' +
        '<div class="campo corto"><label for="psCat">Categoría</label>' +
        lista('psCat', [['', 'Todas']].concat(arbolCategorias(c).map(x => [x[0], x[1]])), fPS.categoria) + '</div>' +
        '<div class="campo corto"><label for="psUso">Uso / profesión</label>' + lista('psUso', opcionesUsos(c), fPS.uso) + '</div>' +
        '<div class="campo corto"><label for="psVista">Mostrar</label>' + lista('psVista', VISTAS_PS, fPS.vista) + '</div></div>' +
        '<div id="psLista"></div>';

      const iBuscar = $('#psBuscar', raiz);
      Escaner.boton(iBuscar, { enter: true, titulo: 'Escanee el producto' });

      const pintar = async () => {
        const cont = $('#psLista', raiz);
        if (!items.length) {
          cont.innerHTML = vacio('box', '<b>Esta sucursal todavía no tiene productos.</b><br>Use <b>Asignar productos</b> para elegirlos del catálogo general' +
            (esAG() && alcance.sucursales.length > 1 ? ' o <b>Copiar de otra sucursal</b>.' : '.'),
            '<button class="btn btn-principal" data-acc="asignar" style="margin-top:12px">' + icoX('mas') + 'Asignar productos</button>');
          return;
        }
        const ids = new Set();
        const b = fPS.buscar.indexOf(',') < 0 ? norm(fPS.buscar) : '';
        const porUbic = b ? new Set(items.filter(i => norm(i.ps.ubicacion).indexOf(b) >= 0).map(i => String(i.p.id))) : null;
        (await buscar(fPS.buscar, { inactivos: true, uso: fPS.uso, categorias: fPS.categoria ? descendientes(c, fPS.categoria) : null })).forEach(p => ids.add(String(p.id)));
        if (porUbic) porUbic.forEach(id => {
          const pp = c.porId.get(id);
          if ((!fPS.categoria || descendientes(c, fPS.categoria).has(String(pp.categoria_id))) && (!fPS.uso || usosDe(pp).indexOf(fPS.uso) >= 0)) ids.add(id);
        });
        const filtro = {
          TODOS: i => i.activo, BAJO: i => i.activo && i.bajo, CERO: i => i.activo && i.cero, ESPECIAL: i => i.activo && i.especial,
          NUEVO: i => i.activo && i.nuevo, SIN_PRECIO: i => i.activo && i.sinPrecio, SIN_UBICACION: i => i.activo && i.sinUbicacion, INACTIVO: i => !i.activo
        }[fPS.vista] || (i => i.activo);
        const vista = items.filter(i => ids.has(String(i.p.id)) && filtro(i))
          .sort(fPS.vista === 'NUEVO' ? (x, y) => Date.parse(y.ingreso) - Date.parse(x.ingreso) : (x, y) => porNombre(x.p, y.p));
        ultimaVistaPS = { sucId: suc.id, items: vista };
        if (!vista.length) {
          cont.innerHTML = vacio('search', 'Ningún producto coincide.');
          return;
        }
        const mostrar = vista.slice(0, fPS.limite);
        const costos = veCostos();
        cont.innerHTML = '<div class="tabla-env"><table class="tabla"><thead><tr><th></th><th>Producto</th><th class="num">Stock</th><th class="num">Mín.</th>' +
          (costos ? '<th class="num">P. adquisición</th>' : '') + '<th class="num">P. unidad</th><th class="num">P. mayor</th><th class="num">P. caja</th><th></th></tr></thead><tbody>' +
          mostrar.map(i => {
            const ps = i.ps, p = i.p;
            const etq = (i.activo ? '' : ' <span class="etiqueta roja">Desasignado</span>') +
              (!activo(p) ? ' <span class="etiqueta roja">Inactivo en catálogo</span>' : '') +
              (i.activo && i.cero ? ' <span class="etiqueta roja">Sin stock</span>' : i.activo && i.bajo ? ' <span class="etiqueta amarilla">Stock bajo</span>' : '') +
              (i.activo && i.nuevo ? ETQ_NUEVO : '') +
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
      iBuscar.oninput = () => { fPS.buscar = iBuscar.value; fPS.limite = 50; clearTimeout(espera); espera = setTimeout(pintar, 60); };
      iBuscar.onkeydown = async ev => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        const r = await porCodigo(iBuscar.value);
        if (!r) return;
        iBuscar.value = ''; fPS.buscar = '';
        await pintar();
        abrirEnSucursal(r.producto, suc);
      };
      $('#psCat', raiz).onchange = e => { fPS.categoria = e.target.value; fPS.limite = 50; pintar(); };
      $('#psUso', raiz).onchange = e => { fPS.uso = e.target.value; fPS.limite = 50; pintar(); };
      const sEmp = $('#psEmp', raiz), sSuc = $('#psSuc', raiz);
      if (sEmp) sEmp.onchange = () => { vistaPS.empresaId = sEmp.value; vistaPS.sucursalId = ''; fPS.limite = 50; App.refrescarContexto(); };
      if (sSuc) sSuc.onchange = () => { vistaPS.sucursalId = sSuc.value; fPS.limite = 50; App.refrescarContexto(); };
      $('#psVista', raiz).onchange = e => { fPS.vista = e.target.value; fPS.limite = 50; App.refrescarContexto(); };

      raiz.onclick = async ev => {
        const t = ev.target.closest('[data-vista]');
        if (t) { fPS.vista = t.dataset.vista; fPS.limite = 50; return App.refrescarContexto(); }
        const b = ev.target.closest('[data-acc]');
        if (!b) return;
        ev.stopPropagation();
        switch (b.dataset.acc) {
          case 'asignar': return asignarProductos(suc, alcance);
          case 'copiar': return esAG() ? copiarDeSucursal(suc, alcance) : null;
          case 'imprimir': return editaPrecios() ? imprimirLista(suc) : null;
          case 'exportar': return exportarSucursal(suc, alcance);
          case 'dias': ev.preventDefault(); return editaPrecios() ? cambiarDiasNuevo(suc.empresa_id, nombreEmpresa(alcance, suc.empresa_id)) : null;
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
  async function abrirEnSucursal(p, suc) {
    suc = suc || App.contexto.sucursal;
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
    const suc = await Datos.obtener('SUCURSALES', ps.sucursal_id);
    if (!suc) { App.aviso('No se encontró la sucursal de este producto. Sincronice e intente de nuevo.', 'error'); return; }
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
      (precios ? '<div class="todo calc-barra"><button type="button" class="btn btn-azul" id="sCalcular">' + icoX('calc') + 'Calcular precios</button>' +
        '<span class="ayuda">Calcula precio por unidad, por mayor y por caja cerrada a partir del precio de adquisición, con porcentajes o a mano.</span></div>' : '') +
      campoNum('sCosto', 'Precio de adquisición (por unidad)', ps.costo_promedio === '' || ps.costo_promedio == null ? '' : redondear(n0(ps.costo_promedio), 4),
        { attrs: costoEditable ? '' : ' readonly', ayuda: 'Lo que cuesta UNA unidad. Con las compras (Fase 6) se recalcula solo (promedio ponderado).' }) +
      campoNum('sPU', 'Precio por unidad', ps.precio_unidad, { attrs: dis, idAyuda: 'mPU', ayuda: '&nbsp;' }) +
      campoNum('sPM', 'Precio por mayor (por unidad)', ps.precio_mayor, { attrs: dis, idAyuda: 'mPM', ayuda: '&nbsp;' }) +
      campoNum('sCM', 'Por mayor desde (unidades)', ps.cantidad_min_mayor, { attrs: dis, ph: 'Ej. 12', ayuda: 'Cantidad mínima para cobrar el precio por mayor.' }) +
      campoNum('sPC', 'Precio por caja cerrada (por unidad)', n0(ps.precio_caja) > 0 ? redondear(n0(ps.precio_caja) / (upc > 1 ? upc : 1), 4) : ps.precio_caja,
        { attrs: dis, idAyuda: 'mPC', ayuda: upc > 1 ? '&nbsp;' : 'El producto no tiene "unidades por caja" en el catálogo.' }) +
      campo('sMotivo', 'Motivo del cambio', '', { clase: 'todo', ph: 'Opcional. Ej. Subió el precio del proveedor', attrs: ' maxlength="120"',
        ayuda: 'Queda en el historial de cambios de precio y ubicación.' }) +
      campoLista('sEstado', 'Estado en esta sucursal', [['ACTIVO', 'Asignado (se puede vender y mover)'], ['INACTIVO', 'Desasignado (no aparece)']], ps.estado || 'ACTIVO') +

      (puedeInicial ? '<div class="seccion-form">Inventario inicial</div>' +
        '<div class="campo todo"><label class="check"><input type="checkbox" id="iIni"><span><b>Registrar el stock que hay hoy</b>' +
        '<small>Solo para empezar: el producto no tiene movimientos en esta sucursal. Después el stock cambia con compras, ventas y ajustes.</small></span></label></div>' +
        '<div class="todo oculto" id="iCampos"><div class="form-2">' +
        campoNum('iCant', 'Cantidad', '', { req: true }) +
        campoLista('iPres', 'En', presIni, 'UNIDAD') +
        campoNum('iCosto', 'Precio de adquisición por unidad (Bs)', ps.costo_promedio ? redondear(n0(ps.costo_promedio), 4) : '', { idAyuda: 'iAyuda', ayuda: '&nbsp;' }) +
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
      botones: [{ t: 'Cancelar' }, { t: 'Guardar', clase: 'btn-principal', accion: m => guardarPS(m, ps, p, { suc: suc, precios: precios, costoEditable: costoEditable, stock: stock, puedeInicial: puedeInicial }) }]
    });

    // Ganancia en vivo
    const ganancia = (precioUnidad, costo) => {
      if (!(precioUnidad > 0) || !(costo > 0)) return '&nbsp;';
      const g = precioUnidad - costo;
      const pct = g / costo * 100;
      return '<span class="' + (g < 0 ? 'txt-rojo' : 'txt-verde') + '">Ganancia ' + U.bs(g) + ' por unidad (' + fmt(pct, 1) + '% sobre la adquisición)' +
        (g < 0 ? ' · ¡por debajo del precio de adquisición!' : '') + '</span>';
    };
    const margenes = () => {
      const costo = num($('#sCosto', f).value) || 0;
      $('#mPU', f).innerHTML = ganancia(num($('#sPU', f).value), costo);
      $('#mPM', f).innerHTML = ganancia(num($('#sPM', f).value), costo);
      if (upc > 1) {
        const pc = num($('#sPC', f).value);
        $('#mPC', f).innerHTML = pc > 0 ? '<b>Caja cerrada de ' + fmt(upc) + ': ' + U.bs(redondear(pc * upc, 2)) + ' en total.</b> ' + ganancia(pc, costo) : '&nbsp;';
      }
    };
    ['sCosto', 'sPU', 'sPM', 'sPC'].forEach(id => { $('#' + id, f).addEventListener('input', margenes); });
    margenes();
    const bCalc = $('#sCalcular', f);
    if (bCalc) bCalc.onclick = () => calcularPrecios(f, p, { costoEditable: costoEditable });

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

  // ---------- Calculadora de precios ----------
  // Precio = adquisición × (1 + % ganancia). Caja cerrada = adquisición × unidades por caja × (1 + %).
  // Se puede escribir el % (calcula el precio) o el precio (calcula el %).
  const PCT_PRESETS = [10, 15, 20, 25, 30, 35, 40, 50, 60, 80, 100];
  const PCT_INICIALES = { unidad: 30, mayor: 20, caja: 15 };
  function pctGuardados() {
    try { return Object.assign({}, PCT_INICIALES, JSON.parse(localStorage.getItem('ferreteria_pct_precios') || '{}')); }
    catch (e) { return Object.assign({}, PCT_INICIALES); }
  }

  function calcularPrecios(fPS, p, op) {
    const upc = n0(p.unidades_por_caja);
    const v = id => num($('#' + id, fPS).value);
    const adq0 = v('sCosto');
    const guardados = pctGuardados();
    const pctDe = (precioU, def) => adq0 > 0 && precioU > 0 ? redondear((precioU / adq0 - 1) * 100, 2) : def;
    const ini = {
      unidad: pctDe(v('sPU'), guardados.unidad),
      mayor: pctDe(v('sPM'), guardados.mayor),
      caja: upc > 1 ? pctDe(v('sPC'), guardados.caja) : 0
    };
    const filas = [['unidad', 'Precio por unidad', 'por unidad'], ['mayor', 'Precio por mayor', 'por unidad']]
      .concat(upc > 1 ? [['caja', 'Precio por caja cerrada', 'por unidad · caja de ' + fmt(upc) + ' ' + (p.unidad || 'u')]] : []);
    const fila = ([k, titulo, sub]) => '<tr data-k="' + k + '"><td><b>' + titulo + '</b><span class="sub">' + esc(sub) + '</span>' +
      (k === 'mayor' ? '<label class="sub">Desde <input class="entrada mini-num" id="kMin" inputmode="decimal" value="' + esc(fmtNum($('#sCM', fPS).value)) + '"> u</label>' : '') + '</td>' +
      '<td><div class="con-sufijo"><input class="entrada" data-pct list="kPresets" inputmode="decimal" value="' + esc(fmtNum(ini[k])) + '"><span>%</span></div></td>' +
      '<td><div class="con-sufijo"><span>Bs</span><input class="entrada" data-precio inputmode="decimal"></div></td>' +
      '<td class="num" data-gan></td></tr>';

    const html = '<p class="nota">Escriba el <b>% de ganancia</b> y se calcula el precio, o escriba el <b>precio</b> y se calcula el %. ' +
      'Al final pulse <b>Copiar a los precios</b> y luego <b>Guardar</b> en el producto.</p>' +
      '<div class="form-2">' +
      campoNum('kAdq', 'Precio de adquisición por unidad (Bs)', adq0 == null ? '' : adq0, { attrs: op.costoEditable ? '' : ' readonly', req: true }) +
      (upc > 1 ? campoNum('kAdqCaja', 'o por caja de ' + fmt(upc) + ' (Bs)', adq0 > 0 ? redondear(adq0 * upc, 2) : '', { attrs: op.costoEditable ? '' : ' readonly',
        ayuda: 'Si sabe lo que cuesta la caja, escríbalo aquí y se calcula el de la unidad.' }) : '') +
      campoLista('kRed', 'Redondear precios calculados', [['0', 'Sin redondear'], ['0.1', 'Hacia arriba a 0,10'], ['0.5', 'Hacia arriba a 0,50'], ['1', 'Hacia arriba a 1 Bs']],
        localStorage.getItem('ferreteria_redondeo') || '0') +
      '</div>' +
      '<datalist id="kPresets">' + PCT_PRESETS.map(x => '<option value="' + x + '">').join('') + '</datalist>' +
      '<div class="chips-pct"><span>% rápido para todos:</span>' + PCT_PRESETS.slice(0, 8).map(x => '<button type="button" class="chip" data-todos="' + x + '">' + x + '%</button>').join('') + '</div>' +
      '<div class="tabla-env"><table class="tabla calc"><thead><tr><th>Precio</th><th>% ganancia</th><th>Precio de venta</th><th class="num">Ganancia por unidad</th></tr></thead><tbody>' +
      filas.map(fila).join('') + '</tbody></table></div><div class="f-msg"></div>';

    const m = modalAncho({
      titulo: 'Calcular precios · ' + p.codigo,
      html: html,
      botones: [{ t: 'Cancelar' }, { t: 'Copiar a los precios', clase: 'btn-principal', accion: mm => copiar(mm) }]
    });
    const adq = () => num($('#kAdq', m).value) || 0;
    const paso = () => Number($('#kRed', m).value) || 0;
    const redondearPrecio = x => { const st = paso(); return st ? redondear(Math.ceil(redondear(x / st, 6)) * st, 2) : redondear(x, 2); };
    const factorFila = () => 1;   // todas las filas son por unidad
    const tr = k => $('tr[data-k="' + k + '"]', m);
    const ganancia = k => {
      const precioV = num($('[data-precio]', tr(k)).value);
      const base = adq() * factorFila(k);
      $('[data-gan]', tr(k)).innerHTML = precioV > 0 && base > 0
        ? '<span class="' + (precioV < base ? 'txt-rojo' : 'txt-verde') + '">' + U.bs(precioV - base) + '</span>' +
          (k === 'caja' ? '<span class="sub">c/u · <b>Caja: ' + U.bs(redondear(precioV * upc, 2)) + '</b></span>' : '')
        : '—';
    };
    const desdePct = k => {
      const pct = num($('[data-pct]', tr(k)).value);
      const base = adq() * factorFila(k);
      $('[data-precio]', tr(k)).value = pct !== null && base > 0 ? fmtNum(redondearPrecio(base * (1 + pct / 100))) : '';
      ganancia(k);
    };
    const desdePrecio = k => {
      const pv = num($('[data-precio]', tr(k)).value);
      const base = adq() * factorFila(k);
      $('[data-pct]', tr(k)).value = pv > 0 && base > 0 ? fmtNum(redondear((pv / base - 1) * 100, 2)) : '';
      ganancia(k);
    };
    const todas = fn => filas.forEach(([k]) => fn(k));

    // Precios iniciales: los que ya tiene el producto (o calculados con el %)
    const actuales = { unidad: v('sPU'), mayor: v('sPM'), caja: v('sPC') };
    todas(k => {
      if (actuales[k] > 0) { $('[data-precio]', tr(k)).value = fmtNum(actuales[k]); desdePrecio(k); }
      else desdePct(k);
    });

    $('#kAdq', m).addEventListener('input', () => {
      const c = $('#kAdqCaja', m);
      if (c) c.value = adq() > 0 ? fmtNum(redondear(adq() * upc, 2)) : '';
      todas(desdePct);
    });
    const cajaAdq = $('#kAdqCaja', m);
    if (cajaAdq) cajaAdq.addEventListener('input', () => {
      const c = num(cajaAdq.value);
      $('#kAdq', m).value = c > 0 ? fmtNum(redondear(c / upc, 4)) : '';
      todas(desdePct);
    });
    $('#kRed', m).onchange = () => todas(desdePct);
    $$('tbody tr', m).forEach(r => {
      $('[data-pct]', r).addEventListener('input', () => desdePct(r.dataset.k));
      $('[data-precio]', r).addEventListener('input', () => desdePrecio(r.dataset.k));
    });
    $$('[data-todos]', m).forEach(b => {
      b.onclick = () => todas(k => { $('[data-pct]', tr(k)).value = b.dataset.todos; desdePct(k); });
    });

    function copiar(mm) {
      try {
        const a = leerNumero(mm, 'kAdq', 'el precio de adquisición', { dec: 4 });
        return aplicar(a);
      } catch (e) {
        return mensaje(mm, e.message || String(e));
      }
      function aplicar(a) {
        const pv = k => { const x = num($('[data-precio]', tr(k)).value); return x === null ? '' : x; };
        for (const [k, titulo] of filas) {
          const x = pv(k);
          if (x !== '' && x < 0) return mensaje(mm, titulo + ': no puede ser negativo.');
        }
        const minMayor = num($('#kMin', mm).value);
        if (pv('mayor') > 0 && !(minMayor > 0)) return mensaje(mm, 'Indique desde cuántas unidades vale el precio por mayor.');
        const poner = (id, val) => { const el = $('#' + id, fPS); if (el && !el.disabled && !el.readOnly) { el.value = fmtNum(val); el.dispatchEvent(new Event('input', { bubbles: true })); } };
        if (op.costoEditable && a !== '') poner('sCosto', a);
        poner('sPU', pv('unidad'));
        poner('sPM', pv('mayor'));
        poner('sCM', minMayor === null ? '' : minMayor);
        if (upc > 1) poner('sPC', pv('caja'));
        // Recordar los % y el redondeo para el próximo producto
        try {
          const g = pctGuardados();
          filas.forEach(([k]) => { const x = num($('[data-pct]', tr(k)).value); if (x !== null) g[k] = x; });
          localStorage.setItem('ferreteria_pct_precios', JSON.stringify(g));
          localStorage.setItem('ferreteria_redondeo', $('#kRed', mm).value);
        } catch (e) { /* sin almacenamiento */ }
        App.aviso('Precios copiados. Revise y pulse Guardar.', 'ok');
        return true;
      }
    }
  }

  async function guardarPS(f, ps, p, op) {
    try {
      const suc = op.suc;
      const nuevo = {
        ubicacion: txt($('#sUbic', f).value),
        stock_minimo: leerNumero(f, 'sMin', 'el stock mínimo', { dec: 3 }),
        producto_especial: $('#sEsp', f).checked ? 'SI' : 'NO',
        estado: $('#sEstado', f).value
      };
      if (op.costoEditable) nuevo.costo_promedio = leerNumero(f, 'sCosto', 'el precio de adquisición', { dec: 4 });
      if (op.precios) {
        nuevo.precio_unidad = leerNumero(f, 'sPU', 'el precio por unidad');
        nuevo.precio_mayor = leerNumero(f, 'sPM', 'el precio por mayor');
        nuevo.cantidad_min_mayor = leerNumero(f, 'sCM', 'la cantidad para precio por mayor', { dec: 3 });
        // Se escribe por unidad; en la hoja se guarda el total de la caja cerrada
        const pcUnidad = leerNumero(f, 'sPC', 'el precio por caja cerrada', { dec: 4 });
        nuevo.precio_caja = pcUnidad === '' ? '' : redondear(pcUnidad * (n0(p.unidades_por_caja) > 1 ? n0(p.unidades_por_caja) : 1), 2);
        if (n0(nuevo.precio_mayor) > 0 && !(n0(nuevo.cantidad_min_mayor) > 0)) return mensaje(f, 'Indique desde cuántas unidades vale el precio por mayor.');
        if (!(n0(nuevo.precio_mayor) > 0) && n0(nuevo.cantidad_min_mayor) > 0) return mensaje(f, 'Escriba el precio por mayor (o borre la cantidad "por mayor desde").');
        const costo = n0(op.costoEditable ? nuevo.costo_promedio : ps.costo_promedio);
        const avisos = [];
        if (n0(nuevo.precio_mayor) > 0 && n0(nuevo.precio_unidad) > 0 && n0(nuevo.precio_mayor) > n0(nuevo.precio_unidad)) avisos.push('el precio por mayor es más alto que el precio por unidad');
        const upc = n0(p.unidades_por_caja);
        if (costo > 0) {
          if (n0(nuevo.precio_unidad) > 0 && n0(nuevo.precio_unidad) < costo) avisos.push('el precio por unidad está por debajo del precio de adquisición');
          if (n0(nuevo.precio_mayor) > 0 && n0(nuevo.precio_mayor) < costo) avisos.push('el precio por mayor está por debajo del precio de adquisición');
          if (upc > 1 && n0(nuevo.precio_caja) > 0 && n0(nuevo.precio_caja) / upc < costo) avisos.push('el precio por caja está por debajo del precio de adquisición');
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
  async function asignarProductos(suc, alcance) {
    alcance = alcance || await alcanceSucursales();
    const c = await cargar();
    const filas = await Datos.listar('PRODUCTOS_SUCURSAL', x => mismo(x.sucursal_id, suc.id));
    const porProd = new Map(filas.map(x => [String(x.producto_id), x]));
    const disponibles = new Set(c.productos.filter(p => activo(p) && !activo(porProd.get(String(p.id)))).map(p => String(p.id)));
    if (!c.productos.some(activo)) {
      App.modal({ titulo: 'Catálogo vacío', html: '<p style="margin:0;line-height:1.5">El catálogo general todavía no tiene productos. ' +
        (editaCatalogo() ? 'Créelos en <a href="#/catalogo">Catálogo general</a>.' : 'Un administrador debe cargarlos primero.') + '</p>' });
      return;
    }
    if (!disponibles.size) { App.aviso('Todos los productos activos del catálogo ya están asignados a esta sucursal.', 'info', 6); return; }
    const sel = new Set();
    const est = { buscar: '', categoria: '', uso: '' };
    const LIM = 200;

    const f = modalAncho({
      titulo: 'Asignar productos · ' + suc.nombre,
      html: '<p class="nota">Marque los productos del catálogo general que se venden o guardan en esta sucursal. ' +
        'Puede escanear uno tras otro: cada código leído se marca solo.</p>' +
        '<div class="filtros"><div class="campo"><label for="aBuscar">Buscar o escanear</label>' +
        '<input class="entrada" id="aBuscar" autocomplete="off" enterkeyhint="search" placeholder="Ej. martillo, stanley"></div>' +
        '<div class="campo corto"><label for="aCat">Categoría</label>' + lista('aCat', [['', 'Todas']].concat(arbolCategorias(c).map(x => [x[0], x[1]])), '') + '</div>' +
        '<div class="campo corto"><label for="aUso">Uso / profesión</label>' + lista('aUso', opcionesUsos(c), '') + '</div></div>' +
        '<div class="barra-sel"><button type="button" class="btn btn-chico btn-borde" id="aTodos">Marcar los de la lista</button>' +
        '<button type="button" class="btn btn-chico btn-borde" id="aNinguno">Quitar todas las marcas</button>' +
        '<b id="aCuenta">0 marcados</b></div>' +
        '<div class="lista-sel" id="aLista"></div>' +
        (alcance.sucursales.length > 1 ? '<div class="seccion-form" style="margin-top:14px">Asignar en</div>' +
          '<p class="nota">Puede asignar los mismos productos a varias sucursales' + (esAG() ? ' y empresas' : '') + ' a la vez. ' +
          'Donde ya estén asignados, no se cambian.</p>' + destinosHtml(suc, alcance) : '') +
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
      vistaActual = await buscar(est.buscar, { ids: disponibles, uso: est.uso, categorias: est.categoria ? descendientes(c, est.categoria) : null });
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
    iB.oninput = () => { est.buscar = iB.value; clearTimeout(espera); espera = setTimeout(pintar, 60); };
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
    $('#aUso', f).onchange = e => { est.uso = e.target.value; pintar(); };
    $('#aTodos', f).onclick = () => { vistaActual.slice(0, LIM).forEach(p => sel.add(String(p.id))); contar(); pintar(); };
    $('#aNinguno', f).onclick = () => { sel.clear(); contar(); pintar(); };
    pintar();
    contar();

    async function guardar(m) {
      try {
        if (!sel.size) return mensaje(m, 'Marque al menos un producto.');
        const ubic = txt($('#aUbic', m).value);
        const min = leerNumero(m, 'aMin', 'el stock mínimo', { dec: 3 });
        const marcadas = $$('input[name="aDest"]:checked', m).map(i => i.value);
        const destinos = alcance.sucursales.filter(x => mismo(x.id, suc.id) || marcadas.indexOf(String(x.id)) >= 0);
        if (!destinos.length) return mensaje(m, 'Marque al menos una sucursal.');
        const ids = new Set(destinos.map(x => String(x.id)));
        const existentes = new Map((await Datos.listar('PRODUCTOS_SUCURSAL', x => ids.has(String(x.sucursal_id))))
          .map(x => [x.sucursal_id + '|' + x.producto_id, x]));
        const registros = [];
        destinos.forEach(d => Array.from(sel).forEach(pid => {
          const ant = existentes.get(d.id + '|' + pid);
          if (ant && activo(ant)) return;                 // ya asignado ahí: no se toca
          if (ant) {
            const fila = { id: ant.id, estado: 'ACTIVO', _origen: 'MANUAL' };
            if (ubic) fila.ubicacion = ubic;
            if (min !== '') fila.stock_minimo = min;
            registros.push({ tabla: 'PRODUCTOS_SUCURSAL', fila: fila });
            return;
          }
          registros.push({ tabla: 'PRODUCTOS_SUCURSAL', fila: { id: U.uuid(), empresa_id: d.empresa_id, sucursal_id: d.id, producto_id: pid,
            ubicacion: ubic, stock_minimo: min, producto_especial: 'NO', estado: 'ACTIVO' } });
        }));
        if (!registros.length) return mensaje(m, 'Esos productos ya estaban asignados en todas las sucursales marcadas.');
        await Datos.guardarVarios(registros);
        App.aviso(registros.length + ' asignación(es) guardadas en ' + destinos.length + ' sucursal(es)', 'ok');
        await App.refrescarContexto();
        return true;
      } catch (err) {
        console.error(err);
        return mensaje(m, err.message || String(err));
      }
    }
  }

  /** Casillas de sucursales destino (agrupadas por empresa para el administrador general). */
  function destinosHtml(suc, alcance, op) {
    op = op || {};
    const grupos = alcance.empresas.filter(e => alcance.sucursales.some(x => mismo(x.empresa_id, e.id)));
    return grupos.map(e => {
      const sucs = alcance.sucursales.filter(x => mismo(x.empresa_id, e.id));
      return (grupos.length > 1 ? '<div class="dest-empresa"><b>' + esc(e.nombre) + '</b>' +
          '<button type="button" class="btn btn-chico btn-borde" data-dest-todas="' + esc(e.id) + '">Todas</button></div>' : '') +
        '<div class="checks" style="margin-bottom:10px">' + sucs.map(x => '<label class="check"><input type="checkbox" name="aDest" value="' + esc(x.id) + '" data-emp="' + esc(x.empresa_id) + '"' +
          (suc && mismo(x.id, suc.id) ? (op.libre ? ' checked' : ' checked disabled') : '') + '><span><b>' + esc(x.nombre) + '</b><small>' + esc(x.codigo || '') +
          (x.es_central === 'SI' ? ' · Central' : '') + (!op.libre && suc && mismo(x.id, suc.id) ? ' · la que está viendo' : '') + '</small></span></label>').join('') + '</div>';
    }).join('') + (grupos.length > 1 || alcance.sucursales.length > 2 ? '<button type="button" class="btn btn-chico btn-borde" data-dest-todas="*">Marcar todas</button>' : '');
  }
  document.addEventListener('click', ev => {
    const b = ev.target.closest('[data-dest-todas]');
    if (!b) return;
    const modal = b.closest('.modal');
    $$('input[name="aDest"]:not(:disabled)', modal).filter(i => b.dataset.destTodas === '*' || i.dataset.emp === b.dataset.destTodas)
      .forEach(i => { i.checked = true; });
  });

  // ---------- Copiar productos de otra sucursal ----------
  async function copiarDeSucursal(suc, alcance) {
    alcance = alcance || await alcanceSucursales();
    const c = await cargar();
    const todasPS = await Datos.listar('PRODUCTOS_SUCURSAL');
    const activosEn = id => todasPS.filter(x => mismo(x.sucursal_id, id) && activo(x) && activo(c.porId.get(String(x.producto_id))));
    const sucDe = id => alcance.sucursales.find(x => mismo(x.id, id));
    const multi = alcance.empresas.length > 1;
    const opcEmp = alcance.empresas.filter(e => alcance.sucursales.some(x => mismo(x.empresa_id, e.id))).map(e => [e.id, e.nombre]);
    const opcSuc = empId => alcance.sucursales.filter(x => mismo(x.empresa_id, empId)).map(x => [x.id, x.nombre + (x.es_central === 'SI' ? ' (central)' : '')]);
    const origenIni = alcance.sucursales.find(x => !mismo(x.id, suc.id) && mismo(x.empresa_id, suc.empresa_id) && x.es_central === 'SI') ||
      alcance.sucursales.find(x => !mismo(x.id, suc.id) && mismo(x.empresa_id, suc.empresa_id)) || alcance.sucursales.find(x => !mismo(x.id, suc.id));
    const caja = (lado, titulo, s0) => '<div class="cp-caja ' + lado + '"><span class="cp-titulo">' + titulo + '</span>' +
      (multi ? campoLista('cp' + lado + 'Emp', 'Empresa', opcEmp, s0.empresa_id) : '') +
      campoLista('cp' + lado + 'Suc', 'Sucursal', opcSuc(s0.empresa_id), s0.id) +
      '<div class="cp-dato" id="cp' + lado + 'Dato"></div></div>';

    const f = modalAncho({
      titulo: 'Copiar productos entre sucursales',
      html: '<p class="nota">Asigna en el <b>destino</b> los productos que tiene el <b>origen</b>. Solo agrega los que faltan: ' +
        'los que ya están asignados en el destino no se modifican. El stock <b>no</b> se copia.</p>' +
        '<div class="cp-flujo">' + caja('O', 'Desde (origen)', origenIni) +
        '<div class="cp-flecha"><svg viewBox="0 0 120 40" aria-hidden="true"><path d="M4 20h104M92 6l16 14-16 14"/></svg><b id="cpCuenta">0</b><small>productos</small></div>' +
        caja('D', 'Hacia (destino)', suc) + '</div>' +
        '<div class="campo"><label>Copiar también</label><div class="checks">' +
        '<label class="check"><input type="checkbox" id="cPrecios" checked><span><b>Precios</b><small>Unidad, mayor y caja</small></span></label>' +
        '<label class="check"><input type="checkbox" id="cCosto" checked><span><b>Precio de adquisición</b></span></label>' +
        '<label class="check"><input type="checkbox" id="cMin" checked><span><b>Stock mínimo</b></span></label>' +
        '<label class="check"><input type="checkbox" id="cEsp" checked><span><b>Producto especial</b></span></label>' +
        '<label class="check"><input type="checkbox" id="cUbic"><span><b>Ubicación</b><small>Solo si las dos sucursales se ordenan igual</small></span></label>' +
        '</div></div><div class="f-msg"></div>',
      botones: [{ t: 'Cancelar' }, { t: 'Copiar', clase: 'btn-principal', accion: m => guardar(m) }]
    });
    const selSuc = lado => $('#cp' + lado + 'Suc', f).value;
    const nuevos = () => {
      const o = selSuc('O'), d = selSuc('D');
      if (!o || !d || mismo(o, d)) return [];
      const yaEnDestino = new Set(activosEn(d).map(x => String(x.producto_id)));
      return activosEn(o).filter(x => !yaEnDestino.has(String(x.producto_id)));
    };
    const actualizar = () => {
      const o = selSuc('O'), d = selSuc('D');
      $('#cpODato', f).innerHTML = '<b>' + activosEn(o).length + '</b> producto(s) asignados';
      $('#cpDDato', f).innerHTML = '<b>' + activosEn(d).length + '</b> producto(s) asignados';
      const n = nuevos().length;
      $('#cpCuenta', f).textContent = mismo(o, d) ? '—' : String(n);
      $('.cp-flujo', f).classList.toggle('cp-igual', mismo(o, d));
      mensaje(f, mismo(o, d) ? 'El origen y el destino son la misma sucursal.' : n ? '' : 'El destino ya tiene todos los productos del origen.', mismo(o, d) ? 'error' : 'info');
      $$('footer .btn', f).pop().textContent = n && !mismo(o, d) ? 'Copiar ' + n + ' producto(s)' : 'Copiar';
    };
    ['O', 'D'].forEach(lado => {
      const e = $('#cp' + lado + 'Emp', f);
      if (e) e.onchange = () => {
        $('#cp' + lado + 'Suc', f).innerHTML = opcSuc(e.value).map(o => '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>').join('');
        actualizar();
      };
      $('#cp' + lado + 'Suc', f).onchange = actualizar;
    });
    actualizar();

    async function guardar(m) {
      try {
        const o = selSuc('O'), d = sucDe(selSuc('D'));
        if (!d || mismo(o, d.id)) return mensaje(m, 'Elija un origen y un destino distintos.');
        const lista2 = nuevos();
        if (!lista2.length) return mensaje(m, 'No hay productos nuevos para copiar.');
        const destino = new Map(todasPS.filter(x => mismo(x.sucursal_id, d.id)).map(x => [String(x.producto_id), x]));
        const chk = id => !!$('#' + id, m) && $('#' + id, m).checked;
        const registros = lista2.map(x => {
          const datos = { producto_especial: chk('cEsp') ? (x.producto_especial || 'NO') : 'NO', estado: 'ACTIVO' };
          if (chk('cMin')) datos.stock_minimo = x.stock_minimo;
          if (chk('cUbic')) datos.ubicacion = x.ubicacion;
          if (chk('cPrecios')) ['precio_unidad', 'precio_mayor', 'cantidad_min_mayor', 'precio_caja'].forEach(k => { datos[k] = x[k]; });
          if (chk('cCosto')) datos.costo_promedio = x.costo_promedio;
          const ant = destino.get(String(x.producto_id));
          return { tabla: 'PRODUCTOS_SUCURSAL', fila: ant
            ? Object.assign({ id: ant.id, _origen: 'MANUAL', _motivo: 'Copiado de otra sucursal' }, datos)
            : Object.assign({ id: U.uuid(), empresa_id: d.empresa_id, sucursal_id: d.id, producto_id: x.producto_id, ubicacion: '', stock_minimo: '' }, datos) };
        });
        await Datos.guardarVarios(registros);
        App.aviso(registros.length + ' producto(s) copiados a ' + d.nombre, 'ok');
        await App.refrescarContexto();
        return true;
      } catch (err) {
        console.error(err);
        return mensaje(m, err.message || String(err));
      }
    }
  }

  /** Cuántos días se muestra "Nuevo stock" en una empresa (CONFIG dias_nuevo_stock:<empresa_id>; AG o ADMINISTRADOR). */
  async function cambiarDiasNuevo(empresaId, nombreEmp) {
    const actual = await diasNuevoStock(empresaId);
    App.modal({
      titulo: 'Aviso "Nuevo stock"' + (nombreEmp ? ' · ' + nombreEmp : ''),
      html: '<p class="nota">Después de cada ingreso de mercadería (compra, inventario inicial o traspaso recibido) el producto muestra ' +
        '<span class="etiqueta nuevo">Nuevo stock</span> durante estos días en todas las sucursales de ' + esc(nombreEmp || 'la empresa') +
        '. Ajustes y ediciones no cuentan.</p>' +
        campoNum('kDias', 'Días', actual, { ayuda: '0 = no mostrar el aviso.' }) + '<div class="f-msg"></div>',
      botones: [{ t: 'Cancelar' }, { t: 'Guardar', clase: 'btn-principal', accion: async m => {
        const v = txt($('#kDias', m).value);
        if (!/^\d{1,3}$/.test(v)) return mensaje(m, 'Escriba un número entero de días (0 a 999).');
        await Datos.guardar('CONFIG', { clave: 'dias_nuevo_stock:' + empresaId, valor: String(Number(v)),
          descripcion: 'Días de "Nuevo stock" para ' + (nombreEmp || empresaId) });
        App.aviso('Guardado: ' + Number(v) + ' día(s)', 'ok');
        await App.refrescarContexto();
      } }]
    });
  }

  // ---------- Exportar a Excel ----------
  const fechaHoy = () => new Date().toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fechaArchivo = () => U.ahoraISO().slice(0, 10);
  const numX = v => { const n = num(v); return n === null ? '' : n; };
  const fechaX = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' }); };

  async function exportarCatalogo() {
    const c = await cargar();
    const vista = ultimaVistaCat.slice();
    App.modal({
      titulo: 'Exportar catálogo general a Excel',
      html: '<div class="checks" style="grid-template-columns:1fr">' +
        '<label class="check"><input type="radio" name="xAlc" value="VISTA" checked><span><b>Lo que estoy viendo (' + vista.length + ')</b><small>Con la búsqueda y los filtros actuales</small></span></label>' +
        '<label class="check"><input type="radio" name="xAlc" value="TODO"><span><b>Todo el catálogo (' + c.productos.length + ')</b><small>Activos e inactivos</small></span></label>' +
        '</div><p class="nota" style="margin-top:10px">Las columnas son las mismas que usará la plantilla de importación (Fase 6): puede corregir en Excel y volver a importar.</p>',
      botones: [{ t: 'Cancelar' }, { t: 'Descargar Excel', clase: 'btn-principal', accion: m => {
        const todo = $('input[name="xAlc"]:checked', m).value === 'TODO';
        const lista2 = (todo ? c.productos : vista).slice().sort(porNombre);
        Excel.descargar('Catalogo_general_' + fechaArchivo() + '.xlsx', [{
          nombre: 'Catálogo', titulo: 'Catálogo general de productos', subtitulo: fechaHoy() + ' · ' + lista2.length + ' producto(s)' + (todo ? '' : ' (filtrados)'),
          columnas: [{ t: 'Código', w: 12 }, { t: 'Nombre', w: 42 }, { t: 'Marca', w: 16 }, { t: 'Categoría', w: 28 }, { t: 'Usos / profesiones', w: 28 },
            { t: 'Unidad', w: 10 }, { t: 'Unid. por paquete', w: 10, tipo: 'num' }, { t: 'Unid. por caja', w: 10, tipo: 'num' },
            { t: 'Cód. barras unidad', w: 18 }, { t: 'Cód. barras paquete', w: 18 }, { t: 'Cód. barras caja', w: 18 },
            { t: 'Caja ancho (cm)', w: 10, tipo: 'num' }, { t: 'Caja alto (cm)', w: 10, tipo: 'num' }, { t: 'Caja profundidad (cm)', w: 12, tipo: 'num' },
            { t: 'Volumen caja (m³)', w: 12, tipo: 'num' }, { t: 'Descripción', w: 40 }, { t: 'Características', w: 50 }, { t: 'Ficha técnica', w: 30 },
            { t: 'Imagen (ruta)', w: 32 }, { t: 'Estado', w: 10 }],
          filas: lista2.map(p => {
            const vol = n0(p.caja_ancho_cm) * n0(p.caja_alto_cm) * n0(p.caja_prof_cm) / 1e6;
            return [txt(p.codigo), txt(p.nombre), c.nombreMarca(p.marca_id), c.rutaCategoria(p.categoria_id), usosDe(p).map(c.nombreUso).join(', '),
              txt(p.unidad), numX(p.unidades_por_paquete), numX(p.unidades_por_caja),
              txt(p.codigo_barras_unidad), txt(p.codigo_barras_paquete), txt(p.codigo_barras_caja),
              numX(p.caja_ancho_cm), numX(p.caja_alto_cm), numX(p.caja_prof_cm), vol ? redondear(vol, 6) : '',
              txt(p.descripcion), txt(p.caracteristicas), txt(p.ficha_tecnica_url), txt(p.imagen_principal_url), p.estado === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO'];
          })
        }]);
        App.aviso('Excel descargado: ' + lista2.length + ' producto(s)', 'ok');
      } }]
    });
  }

  /** Hoja "productos de una sucursal". */
  function hojaSucursal(items, c, empresa, suc, filtrado) {
    const costos = veCostos();
    const columnas = [{ t: 'Empresa', w: 16 }, { t: 'Sucursal', w: 16 }, { t: 'Código', w: 12 }, { t: 'Nombre', w: 40 }, { t: 'Marca', w: 16 },
      { t: 'Categoría', w: 24 }, { t: 'Usos / profesiones', w: 24 }, { t: 'Unidad', w: 9 }, { t: 'Ubicación', w: 16 },
      { t: 'Stock (unidades)', w: 11, tipo: 'num' }, { t: 'Stock en cajas', w: 16 }, { t: 'Stock mínimo', w: 10, tipo: 'num' }, { t: 'Situación', w: 12 },
      { t: 'Último ingreso', w: 12 }, { t: 'Nuevo stock', w: 9 }, { t: 'Producto especial', w: 10 }]
      .concat(costos ? [{ t: 'Precio de adquisición', w: 13, tipo: 'bs' }] : [])
      .concat([{ t: 'Precio unidad', w: 12, tipo: 'bs' }, { t: 'Precio mayor', w: 12, tipo: 'bs' }, { t: 'Mayor desde (u)', w: 10, tipo: 'num' },
        { t: 'Caja cerrada (por unidad)', w: 13, tipo: 'bs' }, { t: 'Total caja cerrada', w: 13, tipo: 'bs' }])
      .concat(costos ? [{ t: 'Valor del inventario', w: 14, tipo: 'bs' }] : []).concat([{ t: 'Estado', w: 12 }]);
    let valor = 0;
    const lista2 = items.slice().sort((a, b) => porNombre(a.p, b.p));
    const filas = lista2.map(i => {
      const p = i.p, ps = i.ps, upc = n0(p.unidades_por_caja);
      const v = Math.max(i.stock, 0) * n0(ps.costo_promedio);
      valor += v;
      const situacion = !i.activo ? 'Desasignado' : i.cero ? 'Sin stock' : i.bajo ? 'Stock bajo' : 'OK';
      return [empresa, suc.nombre, txt(p.codigo), txt(p.nombre), c.nombreMarca(p.marca_id), c.rutaCategoria(p.categoria_id),
        usosDe(p).map(c.nombreUso).join(', '), txt(p.unidad), txt(ps.ubicacion), i.stock, upc > 1 ? (textoStock(i.stock, p).split(' · ')[1] || '') : '',
        numX(ps.stock_minimo), situacion, fechaX(i.ingreso), i.nuevo ? 'Sí' : '', ps.producto_especial === 'SI' ? 'SI' : 'NO']
        .concat(costos ? [n0(ps.costo_promedio) ? redondear(n0(ps.costo_promedio), 4) : ''] : [])
        .concat([numX(ps.precio_unidad), numX(ps.precio_mayor), numX(ps.cantidad_min_mayor),
          n0(ps.precio_caja) ? redondear(n0(ps.precio_caja) / (upc > 1 ? upc : 1), 4) : '', numX(ps.precio_caja)])
        .concat(costos ? [redondear(v, 2)] : []).concat([i.activo ? 'Asignado' : 'Desasignado']);
    });
    const totales = columnas.map(() => null);
    totales[0] = 'TOTAL';
    totales[3] = lista2.length + ' producto(s)';
    if (costos) totales[columnas.length - 2] = redondear(valor, 2);
    return { nombre: suc.nombre, titulo: 'Productos · ' + empresa + ' · ' + suc.nombre,
      subtitulo: fechaHoy() + ' · ' + lista2.length + ' producto(s)' + (filtrado ? ' (con los filtros de la pantalla)' : '') + ' · stock en unidades, precios en Bs',
      columnas: columnas, filas: filas, totales: totales };
  }

  /** Hoja "stock de toda la empresa": una columna por sucursal. */
  async function hojaStockEmpresa(sucs, c, empresa) {
    const st = await stocks();
    const todasPS = await Datos.listar('PRODUCTOS_SUCURSAL', x => activo(x) && sucs.some(s => mismo(s.id, x.sucursal_id)));
    const asignado = new Set(todasPS.map(x => x.sucursal_id + '|' + x.producto_id));
    const productos = Array.from(new Set(todasPS.map(x => String(x.producto_id)))).map(id => c.porId.get(id)).filter(Boolean).sort(porNombre);
    const sumas = sucs.map(() => 0);
    let total = 0;
    const filas = productos.map(p => {
      let t = 0;
      const porSuc = sucs.map((s, i) => {
        if (!asignado.has(s.id + '|' + p.id)) return '';
        const v = st.get(s.id + '|' + p.id) || 0;
        t += v; sumas[i] += v;
        return v;
      });
      total += t;
      return [txt(p.codigo), txt(p.nombre), c.nombreMarca(p.marca_id), txt(p.unidad)].concat(porSuc, [redondear(t, 3)]);
    });
    return { nombre: 'Stock empresa', titulo: 'Stock de toda la empresa · ' + empresa,
      subtitulo: fechaHoy() + ' · ' + productos.length + ' producto(s) · en unidades · vacío = no asignado en esa sucursal',
      columnas: [{ t: 'Código', w: 12 }, { t: 'Nombre', w: 40 }, { t: 'Marca', w: 16 }, { t: 'Unidad', w: 9 }]
        .concat(sucs.map(s => ({ t: s.nombre + (s.es_central === 'SI' ? ' (central)' : ''), w: 14, tipo: 'num' })), [{ t: 'TOTAL', w: 12, tipo: 'num' }]),
      filas: filas, totales: ['TOTAL', productos.length + ' producto(s)', null, null].concat(sumas.map(v => redondear(v, 3)), [redondear(total, 3)]) };
  }

  async function exportarSucursal(suc, alcance) {
    const c = await cargar();
    const sucs = alcance.sucursales.filter(x => mismo(x.empresa_id, suc.empresa_id));
    const empresa = (alcance.empresas.find(e => mismo(e.id, suc.empresa_id)) || App.contexto.empresa || {}).nombre || '';
    const vista = mismo(ultimaVistaPS.sucId, suc.id) ? ultimaVistaPS.items : [];
    const nAsig = (await itemsSucursal(suc.id)).filter(i => i.activo).length;
    App.modal({
      titulo: 'Exportar a Excel',
      html: '<div class="checks" style="grid-template-columns:1fr">' +
        '<label class="check"><input type="checkbox" id="xSuc" checked><span><b>Productos de ' + esc(suc.nombre) + '</b>' +
        '<small>Stock, mínimo, situación, precios y valor del inventario</small></span></label>' +
        '<div class="x-sub"><label class="check chico"><input type="radio" name="xAlc" value="VISTA"' + (vista.length ? ' checked' : ' disabled') + '><span>Lo que estoy viendo (' + vista.length + ')</span></label>' +
        '<label class="check chico"><input type="radio" name="xAlc" value="TODO"' + (vista.length ? '' : ' checked') + '><span>Todos los asignados (' + nAsig + ')</span></label></div>' +
        (sucs.length > 1 ? '<label class="check"><input type="checkbox" id="xTodas"><span><b>Productos de todas las sucursales (' + sucs.length + ')</b>' +
          '<small>Una hoja por sucursal, en el mismo archivo</small></span></label>' +
          '<label class="check"><input type="checkbox" id="xStock"><span><b>Stock de toda la empresa</b>' +
          '<small>Una fila por producto y una columna de stock por sucursal, con el total</small></span></label>' : '') +
        '</div><div class="f-msg"></div>',
      botones: [{ t: 'Cancelar' }, { t: 'Descargar Excel', clase: 'btn-principal', accion: async m => {
        try {
          const chk = id => !!$('#' + id, m) && $('#' + id, m).checked;
          if (!chk('xSuc') && !chk('xTodas') && !chk('xStock')) return mensaje(m, 'Marque qué quiere exportar.');
          App.cargando('Preparando el Excel…');
          const hojas = [];
          if (chk('xSuc') && !chk('xTodas')) {
            const soloVista = $('input[name="xAlc"]:checked', m).value === 'VISTA';
            hojas.push(hojaSucursal(soloVista ? vista : (await itemsSucursal(suc.id)).filter(i => i.activo), c, empresa, suc, soloVista));
          }
          if (chk('xTodas')) {
            for (const s of sucs) hojas.push(hojaSucursal((await itemsSucursal(s.id)).filter(i => i.activo), c, empresa, s, false));
          }
          if (chk('xStock')) hojas.push(await hojaStockEmpresa(sucs, c, empresa));
          const nombre = 'Productos_' + Excel.nombreArchivo(chk('xTodas') || (chk('xStock') && !chk('xSuc')) ? empresa : suc.nombre) + '_' + fechaArchivo() + '.xlsx';
          Excel.descargar(nombre, hojas);
          App.cargando(null);
          App.aviso('Excel descargado: ' + nombre, 'ok');
          return true;
        } catch (err) {
          App.cargando(null);
          console.error(err);
          return mensaje(m, err.message || String(err));
        }
      } }]
    });
  }

  // ---------- Imprimir lista de productos (PDF, tamaño carta) ----------
  const OPC_LISTA = 'ferreteria_lista_imprimir';
  async function imprimirLista(suc) {
    const c = await cargar();
    const items = (await itemsSucursal(suc.id)).filter(i => i.activo && activo(i.p));
    if (!items.length) { App.aviso('Esta sucursal no tiene productos asignados.', 'info'); return; }
    const porId = new Map(items.map(i => [String(i.p.id), i]));
    const marcas = c.marcas.filter(mm => items.some(i => mismo(i.p.marca_id, mm.id))).sort(porNombre);
    let guardado = {};
    try { guardado = JSON.parse(localStorage.getItem(OPC_LISTA) || '{}'); } catch (e) { guardado = {}; }
    const sel = [];   // ids en el orden en que se agregan

    const f = modalAncho({
      titulo: 'Imprimir lista de productos · ' + suc.nombre,
      html: '<div class="form-2">' +
        campo('lNombre', 'Nombre de la lista', guardado.nombre || '', { req: true, clase: 'todo', ph: 'Ej. Lista de precios - Herramientas', attrs: ' maxlength="80"' }) +
        campoNum('lDias', 'Válido por (días)', guardado.dias || 7, { ayuda: 'Se imprime "Válido por N días" con la fecha límite.' }) +
        campoLista('lOrden', 'Ordenar por', [['NOMBRE', 'Nombre'], ['CODIGO', 'Código'], ['MARCA', 'Marca y nombre'], ['AGREGADO', 'Como los agregué']], guardado.orden || 'NOMBRE') +
        '<div class="campo todo"><label>Qué se imprime</label><div class="checks">' +
        '<label class="check"><input type="checkbox" id="lPU"' + (guardado.pu !== false ? ' checked' : '') + '><span><b>Precio por unidad</b></span></label>' +
        '<label class="check"><input type="checkbox" id="lPM"' + (guardado.pm ? ' checked' : '') + '><span><b>Precio por mayor</b><small>Con la cantidad mínima</small></span></label>' +
        '<label class="check"><input type="checkbox" id="lPC"' + (guardado.pc ? ' checked' : '') + '><span><b>Precio por caja cerrada</b><small>Total de la caja y por unidad</small></span></label>' +
        '<label class="check"><input type="checkbox" id="lStock"' + (guardado.stock ? ' checked' : '') + '><span><b>Stock</b><small>Unidades en esta sucursal</small></span></label>' +
        '<label class="check"><input type="checkbox" id="lImg"' + (guardado.img !== false ? ' checked' : '') + '><span><b>Imágenes</b></span></label>' +
        '</div></div>' +
        campo('lNota', 'Texto destacado (opcional)', guardado.nota != null ? guardado.nota : 'Consulta nuestros precios por caja cerrada.',
          { clase: 'todo', area: true, attrs: ' maxlength="300"', ayuda: 'Se imprime resaltado debajo del título. Déjelo vacío si no quiere ningún texto.' }) +
        '<div class="seccion-form">Productos de la lista</div>' +
        '<div class="campo todo"><label for="lBuscar">Buscar y agregar uno por uno <small class="suave">(Enter o escanear agrega el producto)</small></label>' +
        '<input class="entrada" id="lBuscar" autocomplete="off" enterkeyhint="search" placeholder="Código, código de barras o nombre · marca después de una coma">' +
        '<div class="l-sugerencias" id="lSug"></div></div>' +
        '<div class="campo"><label for="lGrupo">O agregar todos los de…</label><div class="con-mas">' +
        lista('lTipo', [['MARCA', 'Marca'], ['CATEGORIA', 'Categoría'], ['USO', 'Uso / profesión']], 'MARCA', ' style="flex:0 0 42%"') +
        '<select class="entrada" id="lGrupo"></select>' +
        '<button type="button" class="btn btn-borde" id="lMasMarca">Agregar</button></div></div>' +
        '<div class="campo"><label>&nbsp;</label><div class="acciones-fila" style="justify-content:flex-start">' +
        '<button type="button" class="btn btn-borde" id="lTodos">Agregar todos (' + items.length + ')</button>' +
        '<button type="button" class="btn btn-peligro" id="lVaciar">Quitar todos</button></div></div>' +
        '<div class="todo"><b id="lCuenta">0 productos en la lista</b><div class="lista-sel l-elegidos" id="lElegidos"></div></div>' +
        '</div><div class="f-msg"></div>',
      botones: [{ t: 'Cancelar' }, { t: 'Imprimir / guardar PDF', clase: 'btn-principal', accion: m => generar(m) }]
    });

    const agregar = ids => {
      let n = 0;
      ids.forEach(id => { id = String(id); if (porId.has(id) && sel.indexOf(id) < 0) { sel.push(id); n++; } });
      pintarElegidos();
      return n;
    };
    const pintarElegidos = () => {
      $('#lCuenta', f).textContent = sel.length + ' producto(s) en la lista';
      $('#lElegidos', f).innerHTML = !sel.length ? '<p class="vacio" style="padding:12px">Todavía no agregó productos.</p>'
        : sel.map(id => {
          const i = porId.get(id);
          return '<div class="check fila-sel">' + miniatura(i.p, c) + '<span style="flex:1;min-width:0"><b>' + esc(i.p.nombre) + '</b><small>' +
            esc([i.p.codigo, c.nombreMarca(i.p.marca_id)].filter(Boolean).join(' · ')) + '</small></span>' +
            '<button type="button" class="btn btn-icono" data-quitar-l="' + esc(id) + '" aria-label="Quitar">' + icoX('quitar') + '</button></div>';
        }).join('');
    };
    const iB = $('#lBuscar', f);
    Escaner.boton(iB, { enter: true, titulo: 'Escanee el producto' });
    const ids = new Set(items.map(i => String(i.p.id)));
    let sugeridos = [];
    const sugerir = async () => {
      sugeridos = txt(iB.value) ? (await buscar(iB.value, { ids: ids })).slice(0, 8) : [];
      $('#lSug', f).innerHTML = sugeridos.map(p => '<button type="button" class="l-sug" data-agregar="' + esc(p.id) + '">' + miniatura(p, c) +
        '<span><b>' + esc(p.nombre) + '</b><small>' + esc([p.codigo, c.nombreMarca(p.marca_id)].filter(Boolean).join(' · ')) + '</small></span>' +
        (sel.indexOf(String(p.id)) >= 0 ? '<em>en la lista</em>' : '<em>+ agregar</em>') + '</button>').join('');
    };
    let espera = null;
    iB.oninput = () => { clearTimeout(espera); espera = setTimeout(sugerir, 60); };
    iB.onkeydown = async ev => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      const r = await porCodigo(iB.value);
      const id = r && ids.has(String(r.producto.id)) ? r.producto.id : (sugeridos.length === 1 ? sugeridos[0].id : null);
      if (!id) { if (txt(iB.value)) App.aviso(r ? 'Ese producto no está asignado a esta sucursal.' : 'Elija el producto de la lista de sugerencias.', 'info'); return; }
      agregar([id]);
      Escaner.pitido();
      iB.value = '';
      sugerir();
      iB.focus();
    };
    f.addEventListener('click', ev => {
      const a = ev.target.closest('[data-agregar]');
      if (a) { agregar([a.dataset.agregar]); sugerir(); return; }
      const q = ev.target.closest('[data-quitar-l]');
      if (q) { sel.splice(sel.indexOf(q.dataset.quitarL), 1); pintarElegidos(); sugerir(); }
    });
    // Opciones del segundo select según el tipo (solo las que tienen productos en esta sucursal)
    const grupos = {
      MARCA: () => marcas.map(mm => [mm.id, mm.nombre + ' (' + items.filter(i => mismo(i.p.marca_id, mm.id)).length + ')']),
      CATEGORIA: () => arbolCategorias(c).map(x => [x[0], x[1], items.filter(i => descendientes(c, x[0]).has(String(i.p.categoria_id))).length])
        .filter(x => x[2]).map(x => [x[0], x[1] + ' (' + x[2] + ')']),
      USO: () => c.usos.filter(activo).map(u => [u.codigo, u.nombre, items.filter(i => usosDe(i.p).indexOf(u.codigo) >= 0).length])
        .filter(x => x[2]).map(x => [x[0], x[1] + ' (' + x[2] + ')'])
    };
    const pintarGrupos = () => {
      const op2 = grupos[$('#lTipo', f).value]();
      $('#lGrupo', f).innerHTML = (op2.length ? [['', '— Elija —']].concat(op2) : [['', '— No hay —']])
        .map(o => '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>').join('');
    };
    $('#lTipo', f).onchange = pintarGrupos;
    pintarGrupos();
    $('#lMasMarca', f).onclick = () => {
      const tipo = $('#lTipo', f).value, val = $('#lGrupo', f).value;
      if (!val) { App.aviso('Elija qué grupo agregar.', 'info'); return; }
      const cats = tipo === 'CATEGORIA' ? descendientes(c, val) : null;
      const n = agregar(items.filter(i => tipo === 'MARCA' ? mismo(i.p.marca_id, val) : tipo === 'CATEGORIA' ? cats.has(String(i.p.categoria_id)) : usosDe(i.p).indexOf(val) >= 0)
        .sort((a, b) => porNombre(a.p, b.p)).map(i => i.p.id));
      App.aviso(n ? n + ' producto(s) agregados' : 'Esos productos ya estaban en la lista', n ? 'ok' : 'info', 2);
    };
    $('#lTodos', f).onclick = () => { agregar(items.slice().sort((a, b) => porNombre(a.p, b.p)).map(i => i.p.id)); };
    $('#lVaciar', f).onclick = () => { sel.length = 0; pintarElegidos(); sugerir(); };
    pintarElegidos();

    async function generar(m) {
      try {
        const nombre = txt($('#lNombre', m).value);
        if (!nombre) return mensaje(m, 'Escriba el nombre de la lista.');
        const dias = leerNumero(m, 'lDias', 'los días de validez', { dec: 0 });
        if (!sel.length) return mensaje(m, 'Agregue al menos un producto.');
        const op = { nombre: nombre, dias: dias === '' ? 0 : dias, orden: $('#lOrden', m).value, pu: $('#lPU', m).checked, pm: $('#lPM', m).checked,
          pc: $('#lPC', m).checked, stock: $('#lStock', m).checked, img: $('#lImg', m).checked, nota: txt($('#lNota', m).value) };
        try { localStorage.setItem(OPC_LISTA, JSON.stringify(op)); } catch (e) { /* sin almacenamiento */ }
        const ventana = window.open('', '_blank');   // se abre ya (si no, el navegador la bloquea)
        const empresa = await Datos.obtener('EMPRESAS', suc.empresa_id) || {};
        const stock = op.stock ? await stocks(suc.id) : new Map();
        let lista2 = sel.map(id => porId.get(id));
        const orden = { NOMBRE: (a, b) => porNombre(a.p, b.p), CODIGO: (a, b) => txt(a.p.codigo).localeCompare(txt(b.p.codigo), 'es', { numeric: true }),
          MARCA: (a, b) => c.nombreMarca(a.p.marca_id).localeCompare(c.nombreMarca(b.p.marca_id), 'es') || porNombre(a.p, b.p) }[op.orden];
        if (orden) lista2 = lista2.slice().sort(orden);
        const html = documentoLista({ op: op, empresa: empresa, suc: suc, items: lista2, stock: stock, c: c });
        if (ventana) {
          ventana.document.open();
          ventana.document.write(html);
          ventana.document.close();
        } else {
          App.aviso('El navegador bloqueó la ventana nueva. Permita las ventanas emergentes para esta app e intente de nuevo.', 'error', 8);
          return false;
        }
        return true;
      } catch (err) {
        console.error(err);
        return mensaje(m, err.message || String(err));
      }
    }
  }

  /** Documento HTML tamaño carta, listo para imprimir o guardar como PDF. */
  function documentoLista(d) {
    const op = d.op, e = d.empresa, suc = d.suc, c = d.c;
    const c1 = App.colorValido(e.color_principal) || '#0f132e';
    const c2 = App.colorValido(e.color_secundario) || '#fe9f31';
    const t1 = App.textoSobre(c1);
    const hoy = new Date();
    const hasta = new Date(hoy.getTime() + op.dias * 86400000);
    const fecha = x => x.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const logo = e.logo_url ? urlDe(e.logo_url, c) : '';
    const bs = v => n0(v) > 0 ? U.bs(v) : '—';
    const cols = ['<th class="n">#</th>'].concat(op.img ? ['<th></th>'] : [], ['<th>Código</th>', '<th>Producto</th>'],
      op.pu ? ['<th class="num">Precio unidad</th>'] : [], op.pm ? ['<th class="num">Precio por mayor</th>'] : [],
      op.pc ? ['<th class="num">Caja cerrada</th>'] : [], op.stock ? ['<th class="num">Stock</th>'] : []);
    const filas = d.items.map((i, n) => {
      const p = i.p, ps = i.ps;
      const upc = n0(p.unidades_por_caja);
      const img = op.img ? imagenDe(p, c) : '';
      return '<tr><td class="n">' + (n + 1) + '</td>' +
        (op.img ? '<td class="img">' + (img ? '<img src="' + esc(img) + '" alt="" onerror="this.remove()">' : '') + '</td>' : '') +
        '<td class="cod">' + esc(p.codigo) + '</td>' +
        '<td><b>' + esc(p.nombre) + '</b><small>' + esc([c.nombreMarca(p.marca_id), p.unidad].filter(Boolean).join(' · ')) + '</small></td>' +
        (op.pu ? '<td class="num"><b>' + bs(ps.precio_unidad) + '</b></td>' : '') +
        (op.pm ? '<td class="num">' + bs(ps.precio_mayor) + (n0(ps.precio_mayor) && n0(ps.cantidad_min_mayor) ? '<small>desde ' + fmt(ps.cantidad_min_mayor) + '</small>' : '') + '</td>' : '') +
        (op.pc ? '<td class="num">' + bs(ps.precio_caja) + (n0(ps.precio_caja) && upc > 1 ? '<small>' + fmt(upc) + ' u · ' + U.bs(n0(ps.precio_caja) / upc) + ' c/u</small>' : '') + '</td>' : '') +
        (op.stock ? '<td class="num">' + fmt(d.stock.get(String(p.id)) || 0) + '</td>' : '') + '</tr>';
    }).join('');
    return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + esc(op.nombre) + '</title><style>' +
      '@page{size:letter;margin:12mm 11mm 14mm}' +
      '*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#1d2033;font-size:11px;background:#e9ebf1}' +
      '.barra{position:sticky;top:0;z-index:2;display:flex;gap:10px;justify-content:center;align-items:center;padding:10px;background:#0f132e;color:#fff;font-size:14px}' +
      '.barra button{font:inherit;font-weight:700;border:0;border-radius:8px;padding:10px 18px;cursor:pointer;background:#fe9f31;color:#0f132e}' +
      '.hoja{width:216mm;min-height:279mm;margin:14px auto;padding:12mm 11mm;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.15)}' +
      '.cab{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px 8px 0 0;background:' + c1 + ';color:' + t1 + '}' +
      '.cab img{width:52px;height:52px;object-fit:contain;background:#fff;border-radius:8px}' +
      '.cab .emp{flex:1;min-width:0}.cab b{display:block;font-size:17px}.cab small{display:block;opacity:.85;font-size:11px}' +
      '.cab .suc{text-align:right;font-size:11.5px}.cab .suc b{font-size:13px}' +
      '.linea{height:5px;background:' + c2 + ';border-radius:0 0 8px 8px;margin-bottom:12px}' +
      'h1{margin:0 0 4px;font-size:19px;color:' + c1 + '}' +
      '.meta{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px;color:#4a4f6a}' +
      '.valido{display:inline-block;padding:3px 10px;border-radius:99px;background:' + c2 + ';color:' + App.textoSobre(c2) + ';font-weight:700}' +
      'table{width:100%;border-collapse:collapse}thead{display:table-header-group}tr{page-break-inside:avoid;break-inside:avoid}' +
      'th{background:#f1f2f6;color:' + c1 + ';text-align:left;padding:6px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.03em;border-bottom:2px solid ' + c1 + '}' +
      'td{padding:5px 6px;border-bottom:1px solid #e3e5ec;vertical-align:middle}td small{display:block;color:#6b708a;font-size:9.5px;margin-top:1px}' +
      'td.img{width:46px}td.img img{width:40px;height:40px;object-fit:contain;display:block}' +
      '.num{text-align:right;white-space:nowrap}.n{width:22px;color:#8a8fa6}.cod{white-space:nowrap;font-family:Consolas,monospace}' +
      '.nota-dest{margin:0 0 10px;padding:8px 12px;border-left:5px solid ' + c2 + ';background:#f6f7fb;font-size:13px;font-weight:700;color:' + c1 + ';white-space:pre-line}' +
      '.pie{margin-top:12px;padding-top:8px;border-top:1px solid #e3e5ec;color:#6b708a;font-size:10px;display:flex;justify-content:space-between;gap:10px}' +
      '@media print{body{background:#fff}.barra{display:none}.hoja{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}' +
      '*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}' +
      '@media (max-width:820px){.hoja{width:auto;margin:0;padding:10px}}' +
      '</style></head><body>' +
      '<div class="barra"><span>Vista previa · tamaño carta</span><button onclick="window.print()">Imprimir / Guardar como PDF</button></div>' +
      '<div class="hoja"><div class="cab">' + (logo ? '<img src="' + esc(logo) + '" alt="" onerror="this.remove()">' : '') +
      '<div class="emp"><b>' + esc(e.nombre || '') + '</b><small>' + esc(e.slogan || '') + '</small>' +
      (e.nit ? '<small>NIT ' + esc(e.nit) + '</small>' : '') + '</div>' +
      '<div class="suc"><b>' + esc(suc.nombre) + '</b>' + (suc.direccion ? '<br>' + esc(suc.direccion) : '') + (suc.telefono ? '<br>Tel. ' + esc(suc.telefono) : '') + '</div></div>' +
      '<div class="linea"></div>' +
      '<h1>' + esc(op.nombre) + '</h1>' +
      '<div class="meta"><span>Fecha: <b>' + fecha(hoy) + '</b> · ' + d.items.length + ' producto(s) · Precios en Bs</span>' +
      (op.dias > 0 ? '<span class="valido">Válido por ' + op.dias + ' día' + (op.dias === 1 ? '' : 's') + ' (hasta el ' + fecha(hasta) + ')</span>' : '') + '</div>' +
      (op.nota ? '<div class="nota-dest">' + esc(op.nota) + '</div>' : '') +
      '<table><thead><tr>' + cols.join('') + '</tr></thead><tbody>' + filas + '</tbody></table>' +
      '<div class="pie"><span>' + esc([e.nombre, suc.nombre, e.telefono ? 'Tel. ' + e.telefono : '', e.direccion].filter(Boolean).join(' · ')) + '</span>' +
      '<span>Generado el ' + esc(U.fechaCorta(U.ahoraISO())) + '</span></div></div>' +
      // Espera las imágenes y abre el cuadro de impresión
      '<script>(function(){var im=[].slice.call(document.images);var n=0,t=im.length;function listo(){setTimeout(function(){window.focus();window.print();},300);}' +
      'if(!t)return listo();var hecho=false;function uno(){if(++n>=t&&!hecho){hecho=true;listo();}}im.forEach(function(i){if(i.complete)uno();else{i.onload=uno;i.addEventListener("error",uno);}});' +
      'setTimeout(function(){if(!hecho){hecho=true;listo();}},6000);})();<\/script>' +
      '</body></html>';
  }

  // ============================================================
  //  PANTALLA: BUSCAR PRODUCTO Y STOCK (todos los roles)
  // ============================================================
  const fBus = { q: '', todo: false, limite: 30, categoria: '', marca: '', uso: '', orden: 'AUTO' };
  const ORDEN_BUS = [['AUTO', 'Automático'], ['MAS', 'Más stock primero'], ['MENOS', 'Menos stock primero'], ['NUEVO', 'Nuevo stock primero'], ['NOMBRE', 'Nombre (A-Z)']];

  App.pantalla('buscar', {
    refrescar: true,
    async render(el) {
      const ctx = App.contexto;
      const suc = ctx.sucursal;
      const raiz = contenedor(el);
      const c = await cargar();
      const asignados = suc ? new Map((await Datos.listar('PRODUCTOS_SUCURSAL', x => mismo(x.sucursal_id, suc.id))).map(x => [String(x.producto_id), x])) : new Map();
      const stock = suc ? await stocks(suc.id) : new Map();
      const ing = suc ? await ingresos(suc.id) : new Map();
      const diasNuevo = await diasNuevoStock(suc && suc.empresa_id);
      const todo = !suc || fBus.todo;

      raiz.innerHTML =
        '<div class="titulo"><div><h1>Buscar producto y stock</h1><p>' + (suc ? 'Stock y precios de ' + esc(suc.nombre) + '.' : 'Sin sucursal elegida: solo datos del catálogo.') +
        ' Escriba, escanee con la cámara o use el lector USB.</p></div></div>' +
        '<div class="buscador"><input class="entrada grande" id="bQ" data-foco value="' + esc(fBus.q) + '" autocomplete="off" ' +
        'enterkeyhint="search" placeholder="Código, código de barras o nombre · marca después de una coma"></div>' +
        '<p class="nota" style="margin:-4px 0 10px">Ej.: <b>martillo 16</b> · <b>martillo, stanley</b> · <b>, truper</b> (todo de una marca) · o escanee el código. Atajo: tecla <b>F2</b> desde cualquier pantalla.</p>' +
        '<div class="filtros">' +
        '<div class="campo corto"><label for="bCat">Categoría</label>' + lista('bCat', [['', 'Todas']].concat(arbolCategorias(c).map(x => [x[0], x[1]])), fBus.categoria) + '</div>' +
        '<div class="campo corto"><label for="bUso">Uso / profesión</label>' + lista('bUso', opcionesUsos(c), fBus.uso) + '</div>' +
        (suc ? '<div class="campo corto"><label for="bOrden">Ordenar</label>' + lista('bOrden', ORDEN_BUS, fBus.orden) + '</div>' : '') +
        (fBus.categoria || fBus.uso ? '<button class="btn btn-borde" data-acc="limpiar">Quitar filtros</button>' : '') + '</div>' +
        (suc ? '<label class="check chico" style="margin:-4px 0 14px"><input type="checkbox" id="bTodo"' + (fBus.todo ? ' checked' : '') + '>' +
          '<span>Incluir productos del catálogo que no están en esta sucursal</span></label>' : '') +
        '<div id="bRes"></div>';
      const iQ = $('#bQ', raiz);
      Escaner.boton(iQ, { enter: true, titulo: 'Escanee el producto' });

      const pintar = async () => {
        const cont = $('#bRes', raiz);
        const hayFiltro = fBus.categoria || fBus.uso;
        if (!txt(fBus.q) && !hayFiltro && !suc) {
          cont.innerHTML = '<div class="tarjeta vacio">' + ico('search') + '<p><b>¿Qué producto busca?</b><br>Puede escribir parte del nombre en cualquier orden ' +
            '(ej. <i>clavo 2</i>), el código interno o el código de barras.</p>' +
            (Escaner.soportado() ? '' : '<p class="nota">En este navegador la cámara no lee códigos: use un lector USB o escriba el código.</p>') + '</div>';
          return;
        }
        const ids = todo ? null : new Set(Array.from(asignados.values()).filter(activo).map(x => String(x.producto_id)));
        let lista2 = await buscar(fBus.q, { ids: ids, uso: fBus.uso, categorias: fBus.categoria ? descendientes(c, fBus.categoria) : null });
        // Orden: "Automático" = por relevancia si se escribió algo; si no, más stock primero
        const orden = fBus.orden === 'AUTO' ? (txt(fBus.q) ? '' : 'MAS') : fBus.orden;
        const st = p => activo(asignados.get(String(p.id))) ? (stock.get(String(p.id)) || 0) : -Infinity;
        const fi = p => { const f = ing.get(String(p.id)); return esNuevo(f, diasNuevo) ? Date.parse(f) : 0; };
        const cmp = { MAS: (a, b) => st(b) - st(a) || porNombre(a, b), MENOS: (a, b) => (st(a) === -Infinity) - (st(b) === -Infinity) || st(a) - st(b) || porNombre(a, b),
          NUEVO: (a, b) => fi(b) - fi(a) || porNombre(a, b), NOMBRE: porNombre }[orden];
        if (cmp) lista2 = lista2.slice().sort(cmp);
        if (!lista2.length) {
          const cod = codigoLimpio(fBus.q);
          cont.innerHTML = vacio('search', (txt(fBus.q) ? 'No se encontró «' + esc(fBus.q) + '»' : 'Ningún producto con esos filtros') +
            (hayFiltro && txt(fBus.q) ? ' con los filtros elegidos' : '') + (todo ? '.' : ' en esta sucursal.'),
            (!todo ? '<button class="btn btn-borde" data-acc="todo" style="margin-top:12px">Buscar en todo el catálogo</button> ' : '') +
            (editaCatalogo() && cod && !/\s/.test(txt(fBus.q)) ? '<button class="btn btn-principal" data-acc="crear" data-cod="' + esc(cod) + '" style="margin-top:12px">' +
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
            '<span class="prod-info"><b>' + esc(p.nombre) + (asig && esNuevo(ing.get(String(p.id)), diasNuevo) ? ETQ_NUEVO : '') + '</b>' +
            '<small>' + esc([p.codigo, c.nombreMarca(p.marca_id)].filter(Boolean).join(' · ')) + '</small>' +
            (asig && txt(ps.ubicacion) ? '<small>📍 ' + esc(ps.ubicacion) + '</small>' : '') +
            (asig ? '<span class="prod-precios">' + (n0(ps.precio_unidad) ? '<span>Unidad <b>' + U.bs(ps.precio_unidad) + '</b></span>' : '<span class="suave">Sin precio</span>') +
              (n0(ps.precio_mayor) ? '<span>Mayor <b>' + U.bs(ps.precio_mayor) + '</b>' + (n0(ps.cantidad_min_mayor) ? ' (' + fmt(ps.cantidad_min_mayor) + '+)' : '') + '</span>' : '') +
              (n0(ps.precio_caja) ? '<span>Caja <b>' + U.bs(ps.precio_caja) + '</b></span>' : '') + '</span>'
              : suc ? '<small class="txt-rojo">No asignado a esta sucursal</small>' : '') + '</span>' +
            (suc ? '<span class="prod-stock ' + clase + '"><b>' + (asig ? fmt(s) : '—') + '</b><small>' + esc(p.unidad || 'UND') + '</small></span>' : '') +
            '</button>';
        }).join('') + '</div>' +
          (lista2.length > mostrar.length ? '<div class="mas-centro"><button class="btn btn-borde" data-acc="mas">Mostrar más (' + (lista2.length - mostrar.length) + ')</button></div>'
            : '<p class="nota" style="margin-top:10px">' + lista2.length + ' producto(s).</p>');
      };
      [['bCat', 'categoria'], ['bUso', 'uso'], ['bOrden', 'orden']].forEach(([id, k]) => {
        const sel = $('#' + id, raiz);
        if (sel) sel.onchange = e => { fBus[k] = e.target.value; fBus.limite = 30; App.refrescarContexto(); };
      });
      await pintar();
      restaurarFoco(raiz);
      if (!focoPrevio && esPantallaFina() && !document.querySelector('.modal-fondo')) iQ.focus();

      let espera = null;
      iQ.oninput = () => { fBus.q = iQ.value; fBus.limite = 30; clearTimeout(espera); espera = setTimeout(pintar, 60); };
      iQ.onkeydown = async ev => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        const r = await porCodigo(iQ.value);
        if (r) { iQ.select(); verProducto(r.producto, { presentacion: r.por === 'barras' ? r.presentacion : '' }); return; }
        const unicos = $$('#bRes .prod-tarjeta', raiz);
        if (unicos.length === 1) verProducto(c.porId.get(String(unicos[0].dataset.id)));
      };
      iQ.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') { iQ.value = ''; fBus.q = ''; pintar(); }
      });
      const chk = $('#bTodo', raiz);
      if (chk) chk.onchange = () => { fBus.todo = chk.checked; App.refrescarContexto(); };
      raiz.onclick = async ev => {
        const b = ev.target.closest('[data-acc]');
        if (!b) return;
        switch (b.dataset.acc) {
          case 'ver': return verProducto(c.porId.get(String(b.dataset.id)));
          case 'mas': fBus.limite += 60; return pintar();
          case 'todo': fBus.todo = true; return App.refrescarContexto();
          case 'limpiar': fBus.categoria = fBus.marca = fBus.uso = ''; return App.refrescarContexto();
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
    const nuevoAqui = suc ? esNuevo((await ingresos(suc.id)).get(String(p.id)), await diasNuevoStock(suc.empresa_id)) : false;
    const upc = n0(p.unidades_por_caja), upp = n0(p.unidades_por_paquete);
    let imgs = [p.imagen_principal_url].concat((c.imagenes.get(String(p.id)) || []).map(i => i.url)).map(v => urlDe(v, c)).filter(Boolean);
    if (!imgs.length && imagenDe(p, c)) imgs = [imagenDe(p, c)];
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
      (usosDe(p).length ? '<p class="ficha-sub" style="margin-top:-6px">' + usosDe(p).map(u => '<span class="etiqueta uso">' + esc(c.nombreUso(u)) + '</span>').join(' ') + '</p>' : '') +
      (suc ? '<div class="ficha-stock ' + (!asig ? 'gris' : (st.get(suc.id + '|' + p.id) || 0) <= 0 ? 'roja' : '') + '"><span>Stock en ' + esc(suc.nombre) +
        (asig && nuevoAqui ? ETQ_NUEVO : '') + '</span>' +
        '<b>' + (asig ? esc(textoStock(st.get(suc.id + '|' + p.id) || 0, p)) : 'No asignado') + '</b>' +
        (asig && txt(ps.ubicacion) ? '<small>📍 ' + esc(ps.ubicacion) + '</small>' : '') + '</div>' : '') +
      (asig ? '<div class="ficha-precios">' +
        precioFila('Precio unidad', ps.precio_unidad, margen(ps.precio_unidad)) +
        precioFila('Precio por mayor', ps.precio_mayor, (n0(ps.cantidad_min_mayor) ? ' <small>desde ' + fmt(ps.cantidad_min_mayor) + '</small>' : '') + margen(ps.precio_mayor)) +
        precioFila('Precio caja' + (upc > 1 ? ' (' + fmt(upc) + ')' : ''), ps.precio_caja, upc > 1 ? ' <small>= ' + U.bs(n0(ps.precio_caja) / upc) + ' c/u</small>' + margen(n0(ps.precio_caja) / upc) : '') +
        (!n0(ps.precio_unidad) && !n0(ps.precio_mayor) && !n0(ps.precio_caja) ? '<div class="dato"><span>Precios</span><b class="suave">Sin precio cargado</b></div>' : '') +
        (veCostos() ? '<div class="dato"><span>Precio de adquisición</span><b>' + (costo ? U.bs(redondear(costo, 2)) : '—') + '</b></div>' : '') +
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
      (txt(p.descripcion) ? '<p class="ficha-desc">' + esc(p.descripcion) + '</p>' : '') +
      (txt(p.caracteristicas) ? '<div class="tarjeta" style="margin-top:14px"><h3>' + icoX('etiqueta') + 'Características</h3>' + caracteristicasHtml(p.caracteristicas) + '</div>' : '') +
      (esUrl(p.ficha_tecnica_url) ? '<p style="margin:12px 0 0"><a class="btn btn-borde" href="' + esc(p.ficha_tecnica_url) + '" target="_blank" rel="noopener">' +
        ico('file') + 'Ver ficha técnica</a></p>' : '');

    const botones = [];
    if (puedeModificar(p, c)) botones.push({ t: 'Editar en catálogo', clase: 'btn-borde', accion: () => { formProducto(p); } });
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
