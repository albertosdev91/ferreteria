/**
 * ============================================================
 *  FASE 6: IMPORTACIONES MASIVAS (Excel .xlsx o .csv)
 * ============================================================
 *  #/importaciones  (ADMIN_GENERAL y ADMINISTRADOR · requiere internet)
 *
 *  Tipos:
 *   - Catálogo general: crear o actualizar productos (marcas, categorías y usos nuevos se crean solos).
 *   - Por sucursal: asignar productos · entrada de stock (nuevas adquisiciones) · compra con
 *     transporte · ajustar stock (conteo) · precios (unidad, mayor + desde, caja cerrada) ·
 *     ubicaciones y stock mínimo.
 *
 *  Pasos: 1) elegir el tipo  2) descargar la plantilla (ya trae los productos)  3) llenarla en Excel
 *         4) subir el archivo → vista previa con errores  5) guardar (se envía al servidor al momento).
 *
 *  Las columnas se reconocen por su NOMBRE (en cualquier orden, sin importar tildes ni mayúsculas)
 *  y coinciden con las exportaciones de la Fase 5: se puede exportar, corregir en Excel y volver a importar.
 *  Regla para todas: celda VACÍA = no se cambia · guion "-" = borrar el valor.
 *
 *  Window.LectorExcel.leer(archivo) → { hojas: [{ nombre, filas: [[…]] }] }  (sin librerías)
 * ============================================================
 */
(function () {
  'use strict';

  const R = App.ROLES;
  const AG = R.AG, ADM = R.ADM;
  const esc = U.esc, ico = App.ico;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const F = window.F6.util;
  const { txt, num, n0, red, fmt, norm, mismo, hoy } = F;
  const activo = x => !!x && x.estado !== 'INACTIVO';
  const rol = () => Sesion.actual.rol;
  const esAG = () => rol() === AG;
  const bs = v => U.bs(v);
  const porNombre = (a, b) => txt(a.nombre).localeCompare(txt(b.nombre), 'es');

  // ============================================================
  //  LECTOR DE EXCEL (.xlsx) Y CSV — en el equipo, sin librerías
  // ============================================================
  function abrirZip(buf) {
    const dv = new DataView(buf);
    const u8 = new Uint8Array(buf);
    let fin = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break; }
    if (fin < 0) throw new Error('El archivo no es un Excel (.xlsx) válido.');
    const n = dv.getUint16(fin + 10, true);
    let p = dv.getUint32(fin + 16, true);
    const archivos = {};
    const dec = new TextDecoder();
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const metodo = dv.getUint16(p + 10, true), comp = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      archivos[dec.decode(u8.subarray(p + 46, p + 46 + nl)).replace(/\\/g, '/')] = { metodo: metodo, comp: comp, off: off };
      p += 46 + nl + el + cl;
    }
    return {
      async texto(nombre) {
        const a = archivos[nombre] || archivos[Object.keys(archivos).find(k => k.toLowerCase() === String(nombre).toLowerCase())];
        if (!a) return null;
        const nl = dv.getUint16(a.off + 26, true), el = dv.getUint16(a.off + 28, true);
        const datos = u8.subarray(a.off + 30 + nl + el, a.off + 30 + nl + el + a.comp);
        if (a.metodo === 0) return dec.decode(datos);
        if (a.metodo !== 8) throw new Error('El Excel usa una compresión que no se puede leer. Guárdelo de nuevo como .xlsx.');
        if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede leer archivos .xlsx. Use Chrome o Edge actualizados, o guarde el archivo como CSV.');
        const flujo = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Response(flujo).text();
      }
    };
  }
  const nodos = (doc, tag) => Array.from(doc.getElementsByTagNameNS('*', tag));
  const hijo = (el, tag) => Array.from(el.children).find(x => x.localName === tag);
  const columnaDe = ref => { const m = /^([A-Z]+)/.exec(ref); let n = 0; for (const ch of (m ? m[1] : 'A')) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  function attrRel(el, local) {
    for (const a of Array.from(el.attributes)) if (a.localName === local && a.name !== local) return a.value;
    return el.getAttribute('r:' + local) || '';
  }

  async function leerXlsx(buf) {
    const zip = abrirZip(buf);
    const parser = new DOMParser();
    const xml = async nombre => { const t = await zip.texto(nombre); return t == null ? null : parser.parseFromString(t, 'application/xml'); };
    const compartidos = [];
    const sst = await xml('xl/sharedStrings.xml');
    if (sst) nodos(sst, 'si').forEach(si => compartidos.push(nodos(si, 't').map(t => t.textContent).join('')));
    const wb = await xml('xl/workbook.xml');
    if (!wb) throw new Error('El archivo no es un libro de Excel válido.');
    const rels = await xml('xl/_rels/workbook.xml.rels');
    const destino = {};
    if (rels) nodos(rels, 'Relationship').forEach(r => { destino[r.getAttribute('Id')] = r.getAttribute('Target'); });
    const hojas = [];
    for (const s of nodos(wb, 'sheet')) {
      const target = destino[attrRel(s, 'id')] || '';
      if (!target) continue;
      let ruta = target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      while (/[^/]+\/\.\.\//.test(ruta)) ruta = ruta.replace(/[^/]+\/\.\.\//, '');
      const doc = await xml(ruta);
      if (doc) hojas.push({ nombre: s.getAttribute('name') || 'Hoja', filas: filasHoja(doc, compartidos) });
    }
    return { hojas: hojas };
  }
  function filasHoja(doc, compartidos) {
    const filas = [];
    nodos(doc, 'row').forEach(rEl => {
      const rn = Number(rEl.getAttribute('r')) || filas.length + 1;
      const fila = [];
      let col = 0;
      Array.from(rEl.children).filter(x => x.localName === 'c').forEach(cEl => {
        const ref = cEl.getAttribute('r');
        if (ref) col = columnaDe(ref);
        const t = cEl.getAttribute('t');
        const vEl = hijo(cEl, 'v');
        let v = '';
        if (t === 's') v = compartidos[Number(vEl && vEl.textContent)] || '';
        else if (t === 'inlineStr') v = nodos(cEl, 't').map(x => x.textContent).join('');
        else if (t === 'b') v = vEl && vEl.textContent === '1' ? 'SI' : 'NO';
        else if (t === 'e') v = '';
        else if (t === 'str') v = vEl ? vEl.textContent : '';
        else { const x = vEl ? vEl.textContent : ''; v = x === '' ? '' : (isFinite(Number(x)) ? Number(x) : x); }
        fila[col] = v;
        col++;
      });
      filas[rn - 1] = fila;
    });
    for (let i = 0; i < filas.length; i++) if (!filas[i]) filas[i] = [];
    return filas;
  }
  function decodificar(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('windows-1252').decode(buf); }
  }
  function leerCSV(t) {
    t = t.replace(/^﻿/, '');
    const muestra = t.split(/\r?\n/).slice(0, 10).join('\n');
    const cuenta = ch => (muestra.split(ch).length - 1);
    const sep = [';', '\t', ','].reduce((m, ch) => cuenta(ch) > cuenta(m) ? ch : m, ',');
    const filas = [];
    let fila = [], cur = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) {
        if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { fila.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && t[i + 1] === '\n') i++;
        fila.push(cur); filas.push(fila); fila = []; cur = '';
      } else cur += ch;
    }
    if (cur !== '' || fila.length) { fila.push(cur); filas.push(fila); }
    return filas;
  }
  async function leerArchivo(archivo) {
    const buf = await archivo.arrayBuffer();
    const u8 = new Uint8Array(buf);
    if (u8[0] === 0x50 && u8[1] === 0x4b) return leerXlsx(buf);
    if (u8[0] === 0xD0 && u8[1] === 0xCF) throw new Error('Es un Excel antiguo (.xls). Ábralo en Excel y use "Guardar como" → "Libro de Excel (.xlsx)".');
    return { hojas: [{ nombre: 'CSV', filas: leerCSV(decodificar(buf)) }] };
  }
  window.LectorExcel = { leer: leerArchivo };

  // ============================================================
  //  COLUMNAS: se reconocen por el nombre (igual que las exportaciones de la Fase 5)
  // ============================================================
  /** "Caja ancho (cm)" → "caja ancho" · "Cód. barras unidad" → "cod barras unidad" */
  const claveCol = s => norm(String(s == null ? '' : s).replace(/\([^)]*\)/g, ' ')).replace(/[^a-z0-9]+/g, ' ').trim();
  const ALIAS = {
    codigo: ['codigo', 'codigo interno'],
    nombre: ['nombre', 'producto', 'nombre del producto'],
    marca: ['marca'],
    categoria: ['categoria'],
    usos: ['usos profesiones', 'usos', 'uso', 'uso profesion'],
    unidad: ['unidad', 'unidad de medida'],
    upp: ['unid por paquete', 'unidades por paquete'],
    upc: ['unid por caja', 'unidades por caja'],
    cbu: ['cod barras unidad', 'codigo de barras unidad', 'codigo barras unidad'],
    cbp: ['cod barras paquete', 'codigo de barras paquete', 'codigo barras paquete'],
    cbc: ['cod barras caja', 'codigo de barras caja', 'codigo barras caja'],
    ancho: ['caja ancho', 'ancho'],
    alto: ['caja alto', 'alto'],
    prof: ['caja profundidad', 'caja prof', 'profundidad'],
    descripcion: ['descripcion'],
    caracteristicas: ['caracteristicas'],
    ficha: ['ficha tecnica'],
    imagen: ['imagen', 'imagen principal'],
    estado: ['estado'],
    asignar: ['asignar'],
    ubicacion: ['ubicacion'],
    minimo: ['stock minimo', 'minimo'],
    especial: ['producto especial', 'especial'],
    costo: ['precio de adquisicion', 'costo por unidad', 'costo unitario'],
    pu: ['precio unidad', 'precio por unidad'],
    pm: ['precio mayor', 'precio por mayor'],
    desde: ['mayor desde', 'por mayor desde'],
    pcu: ['caja cerrada', 'caja cerrada por unidad'],
    pct: ['total caja cerrada', 'precio caja total'],
    contado: ['stock contado', 'cantidad contada', 'contado', 'conteo', 'stock'],
    cantidad: ['cantidad', 'cantidad a ingresar', 'cantidad comprada'],
    presentacion: ['presentacion'],
    costoPres: ['costo por presentacion', 'costo'],
    observacion: ['observacion']
  };
  /** Busca la fila de encabezados (la que tiene "Código") en las primeras 15 filas. */
  function encabezados(filas, campos) {
    for (let i = 0; i < Math.min(filas.length, 15); i++) {
      const claves = (filas[i] || []).map(claveCol);
      if (!claves.some(k => ALIAS.codigo.indexOf(k) >= 0)) continue;
      const mapa = {};
      campos.forEach(c => {
        const j = claves.findIndex(k => ALIAS[c].indexOf(k) >= 0);
        if (j >= 0) mapa[c] = j;
      });
      return { fila: i, mapa: mapa, reconocidas: Object.keys(mapa) };
    }
    return null;
  }
  const textoCelda = v => typeof v === 'number' ? v.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 10 }) : String(v == null ? '' : v).trim();
  const codigoClave = s => Catalogo.codigoClave(s);
  const codigoLimpio = s => String(s == null ? '' : s).replace(/\s+/g, '');
  const BORRAR = '-';
  const siNo = v => { const x = norm(v); return x === 'si' || x === 's' || x === 'x' || x === '1' || x === 'yes' || x === 'true'; };
  const esNo = v => { const x = norm(v); return x === 'no' || x === 'n' || x === '0' || x === 'false'; };
  function buscarProducto(c, cod) {
    const k = codigoClave(cod);
    if (!k) return null;
    return c.internos.get(k) || (c.codigos.get(k) || {}).producto || null;
  }

  // ============================================================
  //  TIPOS DE IMPORTACIÓN
  // ============================================================
  const TIPOS = {
    CATALOGO: { titulo: 'Catálogo general', icono: 'book', porSucursal: false,
      desc: 'Crear productos nuevos o actualizar los existentes (por su código). Marcas, categorías y usos nuevos se crean solos.',
      campos: ['codigo', 'nombre', 'marca', 'categoria', 'usos', 'unidad', 'upp', 'upc', 'cbu', 'cbp', 'cbc', 'ancho', 'alto', 'prof', 'descripcion', 'caracteristicas', 'ficha', 'imagen', 'estado'] },
    ASIGNAR: { titulo: 'Asignar productos a la sucursal', icono: 'box', porSucursal: true,
      desc: 'Elige del catálogo qué productos maneja la sucursal, con ubicación, mínimo, precio de adquisición y precios iniciales.',
      campos: ['codigo', 'asignar', 'ubicacion', 'minimo', 'especial', 'costo', 'pu', 'pm', 'desde', 'pcu', 'pct'] },
    ENTRADA: { titulo: 'Entrada de stock (nuevas adquisiciones)', icono: 'download', porSucursal: true,
      desc: 'Ingresa mercadería en bloque (como una compra, sin transporte). Recalcula el precio de adquisición y marca "Nuevo stock".',
      campos: ['codigo', 'presentacion', 'cantidad', 'costoPres', 'costo'] },
    COMPRA: { titulo: 'Compra con transporte', icono: 'truck', porSucursal: true,
      desc: 'Una compra a un proveedor con gasto de transporte repartido por cajas o por volumen → costo final por unidad.',
      campos: ['codigo', 'presentacion', 'cantidad', 'costoPres', 'costo'] },
    AJUSTE: { titulo: 'Ajustar stock (conteo físico)', icono: 'sliders', porSucursal: true,
      desc: 'Escriba lo que contó de cada producto; se registra un ajuste con la diferencia y el motivo.',
      campos: ['codigo', 'contado', 'observacion'] },
    PRECIOS: { titulo: 'Precios', icono: 'cash', porSucursal: true,
      desc: 'Precio por unidad, por mayor (+ desde cuántas unidades) y por caja cerrada. Queda en el historial de cambios.',
      campos: ['codigo', 'pu', 'pm', 'desde', 'pcu', 'pct'] },
    UBICACIONES: { titulo: 'Ubicaciones y stock mínimo', icono: 'store', porSucursal: true,
      desc: 'Ubicación en la sucursal, stock mínimo y producto especial.',
      campos: ['codigo', 'ubicacion', 'minimo', 'especial'] }
  };
  const ORDEN_TIPOS = ['CATALOGO', 'ASIGNAR', 'ENTRADA', 'COMPRA', 'AJUSTE', 'PRECIOS', 'UBICACIONES'];
  const REQUERIDAS = { ENTRADA: ['cantidad'], COMPRA: ['cantidad'], AJUSTE: ['contado'] };
  const NOMBRE_CAMPO = { cantidad: 'Cantidad', contado: 'Stock contado' };

  // ---------- Ayudas para leer valores ----------
  /** Lee un número de la celda. Devuelve undefined (vacío: no cambia), '' (guion: borrar) o el número. */
  function leerNum(v, etq, errores, op) {
    op = op || {};
    const t = textoCelda(v);
    if (t === '') return undefined;
    if (t === BORRAR) return '';
    const n = num(t);
    if (n === null) { errores.push(etq + ': «' + t + '» no es un número'); return undefined; }
    if (n < 0) { errores.push(etq + ' no puede ser negativo'); return undefined; }
    if (op.mayorCero && n === 0) return '';
    return red(n, op.dec == null ? 2 : op.dec);
  }
  const igualValor = (a, b) => {
    const na = num(a), nb = num(b);
    if (na !== null && nb !== null) return Math.abs(na - nb) < 1e-6;
    return txt(a) === txt(b);
  };
  const mostrarValor = v => (v === '' || v == null ? '—' : typeof v === 'number' ? fmt(v, 4) : String(v).length > 40 ? String(v).slice(0, 40) + '…' : String(v));

  /** Precios de una fila (unidad, mayor, desde, caja cerrada). ps = fila actual de PRODUCTOS_SUCURSAL (o null). */
  function leerPrecios(get, p, ps, errores, avisos) {
    const d = {};
    const upc = n0(p.unidades_por_caja) > 1 ? n0(p.unidades_por_caja) : 1;
    const pu = leerNum(get('pu'), 'Precio unidad', errores, { mayorCero: true });
    const pm = leerNum(get('pm'), 'Precio mayor', errores, { mayorCero: true });
    const desde = leerNum(get('desde'), 'Mayor desde', errores, { dec: 3, mayorCero: true });
    const pcu = leerNum(get('pcu'), 'Caja cerrada (por unidad)', errores, { dec: 4, mayorCero: true });
    const pct = leerNum(get('pct'), 'Total caja cerrada', errores, { mayorCero: true });
    if (pu !== undefined) d.precio_unidad = pu;
    if (pm !== undefined) d.precio_mayor = pm;
    if (desde !== undefined) d.cantidad_min_mayor = desde;
    // Caja cerrada: manda el precio por unidad; si ése no cambió y el total sí, se usa el total
    const totalAct = n0(ps && ps.precio_caja);
    const puAct = totalAct ? red(totalAct / upc, 4) : 0;
    let caja;
    if (pcu !== undefined) caja = pcu === '' ? '' : red(pcu * upc, 2);
    if (pct !== undefined && (caja === undefined || (pcu !== '' && Math.abs(n0(pcu) - puAct) < 0.005 && Math.abs(n0(pct) - totalAct) >= 0.005))) caja = pct;
    if (caja !== undefined) d.precio_caja = caja;
    if (upc === 1 && n0(d.precio_caja) > 0 && n0(p.unidades_por_caja) <= 1) avisos.push('el producto no tiene "unidades por caja": el precio de caja queda por 1 unidad');
    const fin = k => (k in d ? n0(d[k]) : n0(ps && ps[k]));
    if (fin('precio_mayor') > 0 && !(fin('cantidad_min_mayor') > 0)) errores.push('Tiene precio por mayor pero falta "Mayor desde"');
    if (fin('precio_mayor') > 0 && fin('precio_unidad') > 0 && fin('precio_mayor') > fin('precio_unidad')) avisos.push('el precio por mayor es más alto que el de unidad');
    const costo = 'costo_promedio' in d ? n0(d.costo_promedio) : n0(ps && ps.costo_promedio);
    if (costo > 0) {
      if (fin('precio_unidad') > 0 && fin('precio_unidad') < costo) avisos.push('precio unidad bajo el precio de adquisición');
      if (fin('precio_mayor') > 0 && fin('precio_mayor') < costo) avisos.push('precio mayor bajo el precio de adquisición');
      if (fin('precio_caja') > 0 && fin('precio_caja') / upc < costo) avisos.push('caja cerrada bajo el precio de adquisición');
    }
    return d;
  }
  const NOMBRES = { ubicacion: 'Ubicación', stock_minimo: 'Mínimo', producto_especial: 'Especial', costo_promedio: 'P. adquisición',
    precio_unidad: 'P. unidad', precio_mayor: 'P. mayor', cantidad_min_mayor: 'Mayor desde', precio_caja: 'Total caja',
    nombre: 'Nombre', marca_id: 'Marca', categoria_id: 'Categoría', usos: 'Usos', unidad: 'Unidad', unidades_por_paquete: 'Unid. paquete',
    unidades_por_caja: 'Unid. caja', codigo_barras_unidad: 'Barras unidad', codigo_barras_paquete: 'Barras paquete', codigo_barras_caja: 'Barras caja',
    caja_ancho_cm: 'Ancho', caja_alto_cm: 'Alto', caja_prof_cm: 'Profundidad', descripcion: 'Descripción', caracteristicas: 'Características',
    ficha_tecnica_url: 'Ficha técnica', imagen_principal_url: 'Imagen', estado: 'Estado' };
  function cambiosDe(antes, d, mostrar) {
    const r = {}, textos = [];
    Object.keys(d).forEach(k => {
      if (igualValor(antes ? antes[k] : '', d[k])) return;
      r[k] = d[k];
      textos.push((NOMBRES[k] || k) + ': ' + (mostrar ? mostrar(k, antes ? antes[k] : '') : mostrarValor(antes ? antes[k] : '')) + ' → ' + (mostrar ? mostrar(k, d[k]) : mostrarValor(d[k])));
    });
    return { datos: r, textos: textos };
  }

  // ============================================================
  //  ANÁLISIS (vista previa) de cada tipo
  //  Cada fila → { n, codigo, p, accion: NUEVO|CAMBIA|IGUAL|ERROR|OMITE, textos, errores, avisos, ... }
  // ============================================================
  function filasDatos(hoja, enc) {
    const out = [];
    for (let i = enc.fila + 1; i < hoja.filas.length; i++) {
      const f = hoja.filas[i] || [];
      if (!f.some(v => textoCelda(v) !== '')) continue;
      if (/^total$/i.test(textoCelda(f[0]))) continue;   // fila de totales de las exportaciones
      const get = campo => enc.mapa[campo] == null ? '' : f[enc.mapa[campo]];
      out.push({ n: i + 1, get: get });
    }
    return out;
  }

  // ---------- Catálogo general ----------
  async function analizarCatalogo(filas, ctx) {
    const c = ctx.c;
    const unidades = new Set((await Datos.listar('LISTAS', l => l.lista === 'UNIDAD')).map(l => String(l.codigo)));
    const marcaPorNombre = new Map(c.marcas.map(m => [norm(m.nombre), m]));
    const catHijos = new Map();
    c.categorias.forEach(x => catHijos.set((x.categoria_padre_id || '') + '|' + norm(x.nombre), x));
    const usoPor = new Map();
    c.usos.forEach(u => { usoPor.set(norm(u.nombre), u.codigo); usoPor.set(norm(u.codigo), u.codigo); });
    const nuevos = ctx.nuevos = { marcas: new Map(), categorias: new Map(), usos: new Map() };
    const usados = new Map();       // código interno (clave) → fila
    const reclamados = new Map();   // código de barras (clave) → texto de quién lo usa en el archivo
    const resultado = [];

    const marcaId = (nombre, item) => {
      const k = norm(nombre);
      const m = marcaPorNombre.get(k);
      if (m) return m.id;
      if (!nuevos.marcas.has(k)) nuevos.marcas.set(k, { id: U.uuid(), nombre: txt(nombre) });
      item.crea.push('marca:' + k);
      item.avisos.push('marca nueva «' + txt(nombre) + '»');
      return nuevos.marcas.get(k).id;
    };
    const categoriaId = (ruta, item) => {
      let padre = '';
      const partes = String(ruta).split(/\s*[›>\/]\s*/).map(txt).filter(Boolean);
      partes.forEach((nombre, i) => {
        const k = padre + '|' + norm(nombre);
        let x = catHijos.get(k) || nuevos.categorias.get(k);
        if (!x) {
          x = { id: U.uuid(), nombre: nombre, categoria_padre_id: padre, nivel: i };
          nuevos.categorias.set(k, x);
          item.avisos.push('categoría nueva «' + partes.slice(0, i + 1).join(' › ') + '»');
        }
        if (nuevos.categorias.has(k)) item.crea.push('cat:' + k);
        padre = x.id;
      });
      return padre;
    };
    const usosCodigos = (texto, item) => String(texto).split(/[,;]/).map(txt).filter(Boolean).map(nombre => {
      const k = norm(nombre);
      let cod = usoPor.get(k);
      if (!cod) {
        cod = norm(nombre).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20) || 'USO';
        if (!nuevos.usos.has(cod)) { nuevos.usos.set(cod, { codigo: cod, nombre: nombre }); item.avisos.push('uso nuevo «' + nombre + '»'); }
        usoPor.set(k, cod);
      }
      if (nuevos.usos.has(cod)) item.crea.push('uso:' + cod);
      return cod;
    }).filter((x, i, a) => a.indexOf(x) === i).join(',');

    filas.forEach(fila => {
      const g = campo => textoCelda(fila.get(campo));
      const item = { n: fila.n, codigo: g('codigo').toUpperCase(), p: null, accion: 'ERROR', textos: [], errores: [], avisos: [], crea: [] };
      resultado.push(item);
      const cod = codigoLimpio(item.codigo);
      if (!cod) { item.errores.push('Falta el código'); return; }
      if (!/^[A-Z0-9._\-\/]{1,30}$/.test(cod)) { item.errores.push('El código solo puede tener letras, números, punto, guion o barra (máx. 30)'); return; }
      const k = codigoClave(cod);
      if (usados.has(k)) { item.errores.push('Código repetido en el archivo (también en la fila ' + usados.get(k) + ')'); return; }
      usados.set(k, fila.n);
      const p = c.internos.get(k) || null;
      item.p = p;
      const d = {};
      const texto = (campo, col, op) => {
        const v = g(campo);
        if (v === '') return;
        if (v === BORRAR) { if (op && op.obligatorio) item.errores.push((NOMBRES[col] || col) + ' no se puede borrar'); else d[col] = ''; return; }
        if (op && op.max && v.length > op.max) { item.errores.push((NOMBRES[col] || col) + ' es muy largo (máx. ' + op.max + ')'); return; }
        d[col] = v;
      };
      texto('nombre', 'nombre', { obligatorio: true, max: 120 });
      texto('descripcion', 'descripcion', { max: 1000 });
      texto('caracteristicas', 'caracteristicas', { max: 5000 });
      texto('ficha', 'ficha_tecnica_url');
      texto('imagen', 'imagen_principal_url');
      if (d.ficha_tecnica_url && !/^https?:\/\//i.test(d.ficha_tecnica_url)) item.errores.push('La ficha técnica debe ser un enlace https://');
      if (d.imagen_principal_url && !/^https?:\/\//i.test(d.imagen_principal_url) && !/^[^\/]+(\/[^\/]+)+\.(png|jpe?g|webp|gif)$/i.test(d.imagen_principal_url)) {
        item.errores.push('Imagen: use una ruta como IMAGENES/PRODUCTOS/' + cod + '.png o un enlace https://');
      }
      const marca = g('marca');
      if (marca === BORRAR) d.marca_id = ''; else if (marca) d.marca_id = marcaId(marca, item);
      const cat = g('categoria');
      if (cat === BORRAR) d.categoria_id = ''; else if (cat) d.categoria_id = categoriaId(cat, item);
      const usos = g('usos');
      if (usos === BORRAR) d.usos = ''; else if (usos) d.usos = usosCodigos(usos, item);
      const unidad = g('unidad').toUpperCase();
      if (unidad && unidad !== BORRAR) {
        if (!unidades.has(unidad)) item.errores.push('La unidad «' + unidad + '» no existe (créela en Catálogo general → Unidades)');
        else d.unidad = unidad;
      }
      [['upp', 'unidades_por_paquete', 3], ['upc', 'unidades_por_caja', 3], ['ancho', 'caja_ancho_cm', 2], ['alto', 'caja_alto_cm', 2], ['prof', 'caja_prof_cm', 2]].forEach(([campo, col, dec]) => {
        const v = leerNum(fila.get(campo), NOMBRES[col], item.errores, { dec: dec, mayorCero: true });
        if (v !== undefined) d[col] = v;
      });
      [['cbu', 'codigo_barras_unidad'], ['cbp', 'codigo_barras_paquete'], ['cbc', 'codigo_barras_caja']].forEach(([campo, col]) => {
        const v = g(campo);
        if (v === BORRAR) d[col] = ''; else if (v) d[col] = codigoLimpio(v);
      });
      const estado = g('estado').toUpperCase();
      if (estado) {
        if (estado === 'ACTIVO' || estado === 'INACTIVO') d.estado = estado;
        else item.errores.push('Estado debe ser ACTIVO o INACTIVO');
      }
      if (!p) {
        if (!d.nombre) item.errores.push('Producto nuevo sin nombre');
        if (!d.unidad) d.unidad = unidades.has('UNIDAD') ? 'UNIDAD' : (Array.from(unidades)[0] || 'UNIDAD');
        if (!d.estado) d.estado = 'ACTIVO';
      }
      // Reglas sobre el producto como quedará
      const fin = Object.assign({}, p || {}, d);
      if (fin.codigo_barras_paquete && !(n0(fin.unidades_por_paquete) > 1)) item.errores.push('Tiene código de barras del paquete: falta "Unid. por paquete" (más de 1)');
      if (fin.codigo_barras_caja && !(n0(fin.unidades_por_caja) > 1)) item.errores.push('Tiene código de barras de la caja: falta "Unid. por caja" (más de 1)');
      const barras = ['codigo_barras_unidad', 'codigo_barras_paquete', 'codigo_barras_caja'].map(col => codigoClave(fin[col])).filter(Boolean);
      if (new Set(barras).size !== barras.length) item.errores.push('Un mismo código de barras está repetido en el producto');
      barras.forEach(b => {
        const dueno = c.codigos.get(b), interno = c.internos.get(b);
        if (dueno && (!p || !mismo(dueno.producto.id, p.id))) item.errores.push('El código de barras ' + b + ' ya es de «' + dueno.producto.nombre + '»');
        else if (interno && (!p || !mismo(interno.id, p.id))) item.errores.push('El código de barras ' + b + ' es el código interno de «' + interno.nombre + '»');
        else if (reclamados.has(b)) item.errores.push('El código de barras ' + b + ' está repetido en el archivo (' + reclamados.get(b) + ')');
      });
      const choque = c.codigos.get(k);
      if (choque && (!p || !mismo(choque.producto.id, p.id))) item.errores.push('El código ' + cod + ' es el código de barras de «' + choque.producto.nombre + '»');
      if (item.errores.length) return;
      barras.forEach(b => reclamados.set(b, 'fila ' + fila.n));
      if (p && (('unidades_por_caja' in d && !igualValor(p.unidades_por_caja, d.unidades_por_caja)) || ('unidades_por_paquete' in d && !igualValor(p.unidades_por_paquete, d.unidades_por_paquete)))) {
        item.avisos.push('cambian las unidades por paquete/caja: afecta cómo se cuentan las cajas y el precio por unidad de la caja en todas las sucursales');
      }
      if (!p) {
        item.accion = 'NUEVO';
        item.datos = Object.assign({ codigo: cod }, d);
        item.textos.push(d.nombre);
        return;
      }
      const nombreRef = (col, v) => col === 'marca_id' ? (c.nombreMarca(v) || (Array.from(nuevos.marcas.values()).find(m => m.id === v) || {}).nombre || '—')
        : col === 'categoria_id' ? (c.rutaCategoria(v) || (Array.from(nuevos.categorias.values()).find(x => x.id === v) || {}).nombre || '—') : mostrarValor(v);
      const cam = cambiosDe(p, d, nombreRef);
      item.datos = cam.datos;
      item.textos = cam.textos;
      item.accion = cam.textos.length ? 'CAMBIA' : 'IGUAL';
    });
    return resultado;
  }

  async function registrosCatalogo(items, ctx) {
    const regs = [];
    const crea = new Set();
    items.forEach(i => i.crea.forEach(k => crea.add(k)));
    ctx.nuevos.marcas.forEach((m, k) => { if (crea.has('marca:' + k)) regs.push({ tabla: 'MARCAS', fila: { id: m.id, nombre: m.nombre, estado: 'ACTIVO' } }); });
    Array.from(ctx.nuevos.categorias.entries()).sort((a, b) => a[1].nivel - b[1].nivel).forEach(([k, x]) => {
      if (crea.has('cat:' + k)) regs.push({ tabla: 'CATEGORIAS', fila: { id: x.id, nombre: x.nombre, categoria_padre_id: x.categoria_padre_id, estado: 'ACTIVO' } });
    });
    const maxOrden = (await Datos.listar('LISTAS', l => l.lista === 'USO')).reduce((m, l) => Math.max(m, n0(l.orden)), 0);
    let o = maxOrden;
    ctx.nuevos.usos.forEach((u, cod) => { if (crea.has('uso:' + cod)) regs.push({ tabla: 'LISTAS', fila: { lista: 'USO', codigo: cod, nombre: u.nombre, orden: ++o, estado: 'ACTIVO' } }); });
    const asignarA = ctx.opciones.asignarSuc ? ctx.sucursales.find(s => mismo(s.id, ctx.opciones.asignarSuc)) : null;
    items.forEach(i => {
      if (i.accion === 'NUEVO') {
        const id = U.uuid();
        regs.push({ tabla: 'PRODUCTOS', fila: Object.assign({ id: id }, i.datos) });
        if (asignarA && i.datos.estado !== 'INACTIVO') regs.push({ tabla: 'PRODUCTOS_SUCURSAL', fila: { id: U.uuid(), empresa_id: asignarA.empresa_id, sucursal_id: asignarA.id, producto_id: id,
          ubicacion: '', stock_minimo: '', producto_especial: 'NO', estado: 'ACTIVO', _origen: 'IMPORTACION' } });
      } else if (i.accion === 'CAMBIA') {
        regs.push({ tabla: 'PRODUCTOS', fila: Object.assign({ id: i.p.id }, i.datos) });
      }
    });
    return { regs: regs };
  }

  // ---------- Asignar productos ----------
  function analizarAsignar(filas, ctx, enc) {
    const c = ctx.c;
    const conColumna = enc.mapa.asignar != null;
    const vistos = new Map();
    const precios = [AG, ADM].indexOf(rol()) >= 0;
    return filas.map(fila => {
      const g = campo => textoCelda(fila.get(campo));
      const item = { n: fila.n, codigo: g('codigo'), p: null, accion: 'ERROR', textos: [], errores: [], avisos: [] };
      if (conColumna && !siNo(g('asignar'))) { item.accion = 'OMITE'; return item; }
      const p = buscarProducto(c, item.codigo);
      if (!item.codigo) { item.errores.push('Falta el código'); return item; }
      if (!p) { item.errores.push('El código no está en el catálogo general'); return item; }
      item.p = p;
      if (!activo(p)) { item.errores.push('Producto inactivo en el catálogo'); return item; }
      if (vistos.has(String(p.id))) { item.errores.push('Repetido en el archivo (fila ' + vistos.get(String(p.id)) + ')'); return item; }
      vistos.set(String(p.id), fila.n);
      const ps = ctx.ps.get(String(p.id));
      if (ps && activo(ps)) { item.accion = 'IGUAL'; item.textos.push('Ya está asignado (para cambiar datos use Precios o Ubicaciones)'); return item; }
      const d = { estado: 'ACTIVO' };
      const ub = g('ubicacion');
      if (ub && ub !== BORRAR) d.ubicacion = ub.slice(0, 60);
      const min = leerNum(fila.get('minimo'), 'Stock mínimo', item.errores, { dec: 3, mayorCero: true });
      if (min !== undefined) d.stock_minimo = min;
      const esp = g('especial');
      if (esp) d.producto_especial = siNo(esp) ? 'SI' : 'NO';
      if (precios) {
        const costo = leerNum(fila.get('costo'), 'Precio de adquisición', item.errores, { dec: 4, mayorCero: true });
        if (costo !== undefined) d.costo_promedio = costo;
        Object.assign(d, leerPrecios(fila.get, p, Object.assign({}, ps || {}, d), item.errores, item.avisos));
      }
      if (item.errores.length) return item;
      item.accion = ps ? 'CAMBIA' : 'NUEVO';
      item.datos = d;
      item.ps = ps;
      item.textos.push(ps ? 'Estaba desasignado: se vuelve a asignar' : 'Se asigna');
      Object.keys(d).filter(k => k !== 'estado' && d[k] !== '').forEach(k => item.textos.push((NOMBRES[k] || k) + ' ' + mostrarValor(d[k])));
      return item;
    });
  }
  function registrosAsignar(items, ctx) {
    const suc = ctx.suc;
    return { regs: items.filter(i => i.accion === 'NUEVO' || i.accion === 'CAMBIA').map(i => ({ tabla: 'PRODUCTOS_SUCURSAL', fila: i.ps
      ? Object.assign({ id: i.ps.id, _origen: 'IMPORTACION', _motivo: 'Importación: asignar' }, i.datos)
      : Object.assign({ id: U.uuid(), empresa_id: suc.empresa_id, sucursal_id: suc.id, producto_id: i.p.id, ubicacion: '', stock_minimo: '', producto_especial: 'NO' }, i.datos) })) };
  }

  // ---------- Precios ----------
  function analizarPrecios(filas, ctx) {
    const vistos = new Map();
    return filas.map(fila => {
      const g = campo => textoCelda(fila.get(campo));
      const item = { n: fila.n, codigo: g('codigo'), p: null, accion: 'ERROR', textos: [], errores: [], avisos: [] };
      if (!item.codigo) { item.errores.push('Falta el código'); return item; }
      const p = buscarProducto(ctx.c, item.codigo);
      if (!p) { item.errores.push('El código no está en el catálogo general'); return item; }
      item.p = p;
      if (vistos.has(String(p.id))) { item.errores.push('Repetido en el archivo (fila ' + vistos.get(String(p.id)) + ')'); return item; }
      vistos.set(String(p.id), fila.n);
      const ps = ctx.ps.get(String(p.id));
      if (!ps) { item.errores.push('No está asignado a esta sucursal (use "Asignar productos")'); return item; }
      const d = leerPrecios(fila.get, p, ps, item.errores, item.avisos);
      if (item.errores.length) return item;
      const cam = cambiosDe(ps, d);
      item.ps = ps;
      item.datos = cam.datos;
      item.textos = cam.textos;
      item.accion = cam.textos.length ? 'CAMBIA' : 'IGUAL';
      return item;
    });
  }
  function registrosCambiosPS(items, motivo) {
    return { regs: items.filter(i => i.accion === 'CAMBIA').map(i => ({ tabla: 'PRODUCTOS_SUCURSAL',
      fila: Object.assign({ id: i.ps.id, _origen: 'IMPORTACION', _motivo: motivo }, i.datos) })) };
  }

  // ---------- Ubicaciones y stock mínimo ----------
  function analizarUbicaciones(filas, ctx) {
    const vistos = new Map();
    return filas.map(fila => {
      const g = campo => textoCelda(fila.get(campo));
      const item = { n: fila.n, codigo: g('codigo'), p: null, accion: 'ERROR', textos: [], errores: [], avisos: [] };
      if (!item.codigo) { item.errores.push('Falta el código'); return item; }
      const p = buscarProducto(ctx.c, item.codigo);
      if (!p) { item.errores.push('El código no está en el catálogo general'); return item; }
      item.p = p;
      if (vistos.has(String(p.id))) { item.errores.push('Repetido en el archivo (fila ' + vistos.get(String(p.id)) + ')'); return item; }
      vistos.set(String(p.id), fila.n);
      const ps = ctx.ps.get(String(p.id));
      if (!ps) { item.errores.push('No está asignado a esta sucursal (use "Asignar productos")'); return item; }
      const d = {};
      const ub = g('ubicacion');
      if (ub === BORRAR) d.ubicacion = ''; else if (ub) d.ubicacion = ub.slice(0, 60);
      const min = leerNum(fila.get('minimo'), 'Stock mínimo', item.errores, { dec: 3, mayorCero: true });
      if (min !== undefined) d.stock_minimo = min;
      const esp = g('especial');
      if (esp) {
        if (siNo(esp)) d.producto_especial = 'SI';
        else if (esNo(esp) || esp === BORRAR) d.producto_especial = 'NO';
        else item.errores.push('Producto especial debe ser SI o NO');
      }
      if (item.errores.length) return item;
      const cam = cambiosDe(Object.assign({}, ps, { producto_especial: ps.producto_especial || 'NO' }), d);
      item.ps = ps;
      item.datos = cam.datos;
      item.textos = cam.textos;
      item.accion = cam.textos.length ? 'CAMBIA' : 'IGUAL';
      if (!activo(ps)) item.avisos.push('está desasignado en la sucursal');
      return item;
    });
  }

  // ---------- Ajustar stock (conteo físico) ----------
  function analizarAjuste(filas, ctx) {
    const vistos = new Map();
    return filas.map(fila => {
      const g = campo => textoCelda(fila.get(campo));
      const item = { n: fila.n, codigo: g('codigo'), p: null, accion: 'ERROR', textos: [], errores: [], avisos: [] };
      const contadoTxt = g('contado');
      if (contadoTxt === '') { item.accion = 'OMITE'; return item; }
      if (!item.codigo) { item.errores.push('Falta el código'); return item; }
      const p = buscarProducto(ctx.c, item.codigo);
      if (!p) { item.errores.push('El código no está en el catálogo general'); return item; }
      item.p = p;
      if (vistos.has(String(p.id))) { item.errores.push('Repetido en el archivo (fila ' + vistos.get(String(p.id)) + ')'); return item; }
      vistos.set(String(p.id), fila.n);
      const contado = num(contadoTxt);
      if (contado === null) { item.errores.push('Stock contado: «' + contadoTxt + '» no es un número'); return item; }
      if (contado < 0) { item.errores.push('Stock contado no puede ser negativo'); return item; }
      const stock = ctx.stock.get(String(p.id)) || 0;
      const ps = ctx.ps.get(String(p.id));
      item.stock = stock;
      item.contado = red(contado, 3);
      item.diferencia = red(contado - stock, 3);
      item.costo = ps ? n0(ps.costo_promedio) : 0;
      item.obs = g('observacion').slice(0, 150);
      item.ps = ps;
      if (!ps || !activo(ps)) item.avisos.push(ps ? 'está desasignado: se vuelve a asignar' : 'no está asignado: se asigna a la sucursal');
      if (Math.abs(item.diferencia) < 0.0005) { item.accion = 'IGUAL'; item.textos.push('Sistema ' + fmt(stock) + ' = contado'); return item; }
      item.accion = 'CAMBIA';
      item.textos.push('Sistema ' + fmt(stock) + ' → contado ' + fmt(item.contado) + ' (' + (item.diferencia > 0 ? '+' : '') + fmt(item.diferencia) + ' ' + ((p.unidad) || 'UND') + ')' +
        (item.costo ? ' · ' + bs(red(item.diferencia * item.costo, 2)) : ''));
      return item;
    });
  }
  async function registrosAjusteImp(items, ctx) {
    const validos = items.filter(i => i.accion === 'CAMBIA');
    const motivos = await Datos.lista('MOTIVO_AJUSTE');
    const motivo = ctx.opciones.motivo || 'CONTEO';
    const r = await window.F6.registrosAjuste({ suc: ctx.suc, tipo: 'CONTEO', motivo: motivo, nombreMotivo: (motivos.find(m => m.codigo === motivo) || {}).nombre,
      observacion: ctx.opciones.observacion || 'Importación de conteo', origen: 'IMPORTACION',
      lineas: validos.map(i => ({ p: i.p, stockSistema: i.stock, contada: i.contado, diferencia: i.diferencia, costo: i.costo, obs: i.obs })) });
    return { regs: asignarFaltantes(validos, ctx, 'Ajuste ' + r.numero).concat(r.regs), documento_id: r.id, numero: r.numero };
  }
  function asignarFaltantes(items, ctx, motivo) {
    const regs = [], vistos = new Set();
    items.forEach(i => {
      if (vistos.has(String(i.p.id))) return;
      vistos.add(String(i.p.id));
      const ps = ctx.ps.get(String(i.p.id));
      if (!ps) regs.push({ tabla: 'PRODUCTOS_SUCURSAL', fila: { id: U.uuid(), empresa_id: ctx.suc.empresa_id, sucursal_id: ctx.suc.id, producto_id: i.p.id, ubicacion: '', stock_minimo: '', producto_especial: 'NO', estado: 'ACTIVO' } });
      else if (!activo(ps)) regs.push({ tabla: 'PRODUCTOS_SUCURSAL', fila: { id: ps.id, estado: 'ACTIVO', _origen: 'IMPORTACION', _motivo: motivo } });
    });
    return regs;
  }

  // ---------- Entrada de stock y compra con transporte ----------
  function presentacionDe(v) {
    const x = norm(v).replace(/[^a-z]/g, '');
    if (!x || ['u', 'un', 'und', 'unid', 'unidad', 'unidades', 'pza', 'pieza'].indexOf(x) >= 0) return 'UNIDAD';
    if (['paq', 'pq', 'pqt', 'paquete', 'paquetes'].indexOf(x) >= 0) return 'PAQUETE';
    if (['cj', 'cja', 'caja', 'cajas'].indexOf(x) >= 0) return 'CAJA';
    return null;
  }
  function analizarEntrada(filas, ctx) {
    const items = filas.map(fila => {
      const g = campo => textoCelda(fila.get(campo));
      const item = { n: fila.n, codigo: g('codigo'), p: null, accion: 'ERROR', textos: [], errores: [], avisos: [] };
      const cantTxt = g('cantidad');
      if (cantTxt === '' || num(cantTxt) === 0) { item.accion = 'OMITE'; return item; }
      if (!item.codigo) { item.errores.push('Falta el código'); return item; }
      const p = buscarProducto(ctx.c, item.codigo);
      if (!p) { item.errores.push('El código no está en el catálogo general'); return item; }
      item.p = p;
      if (!activo(p)) { item.errores.push('Producto inactivo en el catálogo'); return item; }
      const pres = presentacionDe(g('presentacion'));
      if (!pres) { item.errores.push('Presentación «' + g('presentacion') + '» no válida (UNIDAD, PAQUETE o CAJA)'); return item; }
      if (pres === 'PAQUETE' && !(n0(p.unidades_por_paquete) > 1)) { item.errores.push('El producto no tiene "unidades por paquete" en el catálogo'); return item; }
      if (pres === 'CAJA' && !(n0(p.unidades_por_caja) > 1)) { item.errores.push('El producto no tiene "unidades por caja" en el catálogo'); return item; }
      const cant = num(cantTxt);
      if (cant === null || cant < 0) { item.errores.push('Cantidad: «' + cantTxt + '» no es un número positivo'); return item; }
      const fac = Catalogo.factor(p, pres);
      let costoPres = leerNum(fila.get('costoPres'), 'Costo por presentación', item.errores, { dec: 4 });
      if (costoPres === undefined || costoPres === '') {
        const cu = leerNum(fila.get('costo'), 'Costo por unidad', item.errores, { dec: 4 });
        costoPres = cu === undefined || cu === '' ? 0 : red(cu * fac, 4);
      }
      if (item.errores.length) return item;
      if (!(costoPres > 0)) item.avisos.push('sin costo: el precio de adquisición no cambia');
      const ps = ctx.ps.get(String(p.id));
      if (!ps || !activo(ps)) item.avisos.push(ps ? 'está desasignado: se vuelve a asignar' : 'no está asignado: se asigna a la sucursal');
      item.accion = 'NUEVO';
      item.linea = { p: p, presentacion: pres, cantidad: red(cant, 3), costoPres: costoPres };
      return item;
    });
    // Transporte y costo final por unidad (igual que en la pantalla de compras)
    const validos = items.filter(i => i.accion === 'NUEVO');
    const calc = window.F6.calcularCompra(validos.map(i => i.linea), ctx.tipoId === 'COMPRA' ? { gasto: ctx.opciones.gasto, metodo: ctx.opciones.metodo } : null);
    ctx.calc = calc;
    calc.lineas.forEach((x, k) => {
      const i = validos[k];
      const st = ctx.stock.get(String(x.p.id)) || 0;
      i.textos.push('Entran ' + fmt(x.unidades) + ' ' + (x.p.unidad || 'UND') + ' (' + fmt(x.cant) + ' ' + (x.presentacion === 'UNIDAD' ? (x.p.unidad || 'UND') : x.presentacion.toLowerCase() + '(s)') +
        ') · stock ' + fmt(st) + ' → ' + fmt(red(st + x.unidades, 3)));
      if (x.costoPres > 0) i.textos.push('Costo ' + bs(x.costoPres) + (x.fac > 1 ? ' por ' + x.presentacion.toLowerCase() : '') + (x.transporte ? ' + transporte ' + bs(x.transporte) : '') +
        ' → costo final ' + bs(x.costoFinal) + ' c/u');
    });
    calc.faltanMedidas.forEach(p => { const i = validos.find(v => mismo(v.p.id, p.id)); if (i) { i.accion = 'ERROR'; i.errores.push('Faltan las medidas de la caja en el catálogo (para repartir por volumen)'); } });
    return items;
  }
  async function registrosEntrada(items, ctx) {
    const validos = items.filter(i => i.accion === 'NUEVO');
    const o = ctx.opciones;
    const calc = window.F6.calcularCompra(validos.map(i => i.linea), ctx.tipoId === 'COMPRA' ? { gasto: o.gasto, metodo: o.metodo } : null);
    const prov = o.proveedor ? await Datos.obtener('PROVEEDORES', o.proveedor) : null;
    const tipoPago = ctx.tipoId === 'COMPRA' ? (o.tipoPago || 'CONTADO') : 'CONTADO';
    const r = await window.F6.registrosCompra({ suc: ctx.suc, proveedor: prov, fecha: F.fechaISO(o.fecha || hoy()), nroDoc: o.nroDoc || '', tipoPago: tipoPago,
      vence: o.vence || '', observacion: (ctx.tipoId === 'COMPRA' ? 'Compra importada' : 'Entrada de stock importada') + (o.archivo ? ' · ' + o.archivo : ''),
      calc: calc, enDeuda: ctx.tipoId === 'COMPRA' && !!o.enDeuda && calc.gasto > 0, origen: 'IMPORTACION' });
    return { regs: r.regs, documento_id: r.id, numero: r.numero };
  }

  const ANALIZAR = {
    CATALOGO: analizarCatalogo, ASIGNAR: analizarAsignar, ENTRADA: analizarEntrada, COMPRA: analizarEntrada,
    AJUSTE: analizarAjuste, PRECIOS: analizarPrecios, UBICACIONES: analizarUbicaciones
  };
  const REGISTROS = {
    CATALOGO: registrosCatalogo, ASIGNAR: registrosAsignar, ENTRADA: registrosEntrada, COMPRA: registrosEntrada, AJUSTE: registrosAjusteImp,
    PRECIOS: items => registrosCambiosPS(items, 'Importación de precios'), UBICACIONES: items => registrosCambiosPS(items, 'Importación de ubicaciones')
  };

  // ============================================================
  //  PLANTILLAS (Excel ya lleno con los productos)
  // ============================================================
  const INSTRUCCIONES_COMUNES = [
    'No cambie los nombres de las columnas (puede cambiar el orden o borrar las que no use; "Código" es obligatoria).',
    'Celda VACÍA = no se cambia. Un guion "-" = borrar el valor.',
    'Números con coma o punto decimal (12,50 o 12.50), sin separador de miles.',
    'Puede borrar las filas que no quiera tocar. Al subir el archivo verá una vista previa con los errores antes de guardar.',
    'Necesita internet para importar.'
  ];
  const INSTRUCCIONES = {
    CATALOGO: ['CATÁLOGO GENERAL: cada fila es un producto, identificado por su Código interno.',
      'Si el código ya existe, se actualizan las columnas que tengan algo escrito. Si no existe, se crea el producto (Nombre obligatorio).',
      'Marca y Categoría se escriben con su nombre; las nuevas se crean solas. Subcategorías: "Herramientas › Martillos".',
      'Usos / profesiones: varios separados por coma (ej. Electricista, Hogar). Unidad: una de la lista de Unidades.',
      'Estado: ACTIVO o INACTIVO. "Volumen caja" se calcula solo (no hace falta llenarlo).',
      'El catálogo es el mismo para todas las empresas: los cambios se aplican en todas las sucursales.'],
    ASIGNAR: ['ASIGNAR PRODUCTOS: escriba SI en la columna "Asignar" de los productos que maneja esta sucursal.',
      'Si borra la columna "Asignar", se asignan todas las filas del archivo.',
      'Opcional: ubicación, stock mínimo, producto especial (SI/NO), precio de adquisición y precios.',
      'Caja cerrada (por unidad): precio de UNA unidad cuando se vende la caja completa (el total se calcula solo).'],
    ENTRADA: ['ENTRADA DE STOCK: escriba la Cantidad que ingresa (las filas sin cantidad se ignoran).',
      'Presentación: UNIDAD, PAQUETE o CAJA. "Costo por presentación": lo que costó UNA de esa presentación (ej. una caja).',
      'Se registra como una compra (sin transporte): suma stock, recalcula el precio de adquisición (promedio ponderado) y marca "Nuevo stock".'],
    COMPRA: ['COMPRA CON TRANSPORTE: escriba la Cantidad comprada (las filas sin cantidad se ignoran).',
      'Presentación: UNIDAD, PAQUETE o CAJA. "Costo por presentación": lo que costó UNA de esa presentación (ej. una caja).',
      'El proveedor, la factura, el pago y el gasto de transporte se eligen en la app antes de subir el archivo.',
      'El transporte se reparte por cajas o por volumen (medidas de la caja del catálogo) y da el costo final por unidad.'],
    AJUSTE: ['AJUSTAR STOCK (CONTEO): escriba en "Stock contado" lo que contó, en UNIDADES (las filas vacías se ignoran).',
      'Se compara con el stock del sistema al momento de importar y se registra un ajuste con la diferencia.',
      'También sirve el Excel exportado de Productos de la sucursal: corrija la columna "Stock (unidades)".'],
    PRECIOS: ['PRECIOS: precio por unidad, precio por mayor (por unidad) + "Mayor desde" (cantidad mínima) y caja cerrada.',
      'Caja cerrada (por unidad): precio de UNA unidad al vender la caja completa. También puede escribir el "Total caja cerrada".',
      'Escriba 0 o "-" para quitar un precio. También sirve el Excel exportado de Productos de la sucursal.'],
    UBICACIONES: ['UBICACIONES: ubicación en la sucursal (ej. Pasillo 3 - Estante B), stock mínimo y producto especial (SI/NO).',
      'Escriba "-" para borrar una ubicación. También sirve el Excel exportado de Productos de la sucursal.']
  };
  function hojaInstrucciones(tipoId, ctx) {
    const lineas = INSTRUCCIONES[tipoId].concat([''], INSTRUCCIONES_COMUNES);
    return { nombre: 'Instrucciones', titulo: 'Cómo llenar: ' + TIPOS[tipoId].titulo, subtitulo: ctx.suc ? 'Sucursal: ' + ctx.suc.nombre : 'Catálogo general',
      columnas: [{ t: 'Instrucciones', w: 120 }], filas: lineas.map(l => [l]) };
  }
  async function plantilla(tipoId, ctx) {
    const c = ctx.c;
    const nombreSuc = ctx.suc ? ctx.suc.nombre : '';
    const costos = [AG, ADM].indexOf(rol()) >= 0;
    const asignados = () => Array.from(ctx.ps.values()).filter(activo).map(ps => ({ ps: ps, p: c.porId.get(String(ps.producto_id)) }))
      .filter(x => x.p && activo(x.p)).sort((a, b) => porNombre(a.p, b.p));
    const nx = v => (v === '' || v == null || !n0(v) ? '' : n0(v));
    let hoja;
    if (tipoId === 'CATALOGO') {
      const lista2 = c.productos.slice().sort(porNombre);
      hoja = { columnas: [{ t: 'Código', w: 12 }, { t: 'Nombre', w: 42 }, { t: 'Marca', w: 16 }, { t: 'Categoría', w: 28 }, { t: 'Usos / profesiones', w: 26 },
        { t: 'Unidad', w: 10 }, { t: 'Unid. por paquete', w: 10, tipo: 'num' }, { t: 'Unid. por caja', w: 10, tipo: 'num' },
        { t: 'Cód. barras unidad', w: 18 }, { t: 'Cód. barras paquete', w: 18 }, { t: 'Cód. barras caja', w: 18 },
        { t: 'Caja ancho (cm)', w: 10, tipo: 'num' }, { t: 'Caja alto (cm)', w: 10, tipo: 'num' }, { t: 'Caja profundidad (cm)', w: 12, tipo: 'num' },
        { t: 'Descripción', w: 40 }, { t: 'Características', w: 50 }, { t: 'Ficha técnica', w: 30 }, { t: 'Imagen (ruta)', w: 32 }, { t: 'Estado', w: 10 }],
        filas: lista2.map(p => [txt(p.codigo), txt(p.nombre), c.nombreMarca(p.marca_id), c.rutaCategoria(p.categoria_id),
          txt(p.usos).split(',').filter(Boolean).map(c.nombreUso).join(', '), txt(p.unidad), nx(p.unidades_por_paquete), nx(p.unidades_por_caja),
          txt(p.codigo_barras_unidad), txt(p.codigo_barras_paquete), txt(p.codigo_barras_caja), nx(p.caja_ancho_cm), nx(p.caja_alto_cm), nx(p.caja_prof_cm),
          txt(p.descripcion), txt(p.caracteristicas), txt(p.ficha_tecnica_url), txt(p.imagen_principal_url), p.estado === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO']) };
      if (!lista2.length) hoja.filas = [['P00001', 'Martillo carpintero 16 oz', 'Truper', 'Herramientas › Martillos', 'Carpintería, Hogar', 'UNIDAD', '', 12, '7501206612345', '', '7501206699999', 40, 25, 30, 'Ejemplo: borre esta fila', '', '', '', 'ACTIVO']];
    } else if (tipoId === 'ASIGNAR') {
      const lista2 = c.productos.filter(p => activo(p) && !activo(ctx.ps.get(String(p.id)))).sort(porNombre);
      hoja = { columnas: [{ t: 'Código', w: 12 }, { t: 'Nombre', w: 42 }, { t: 'Marca', w: 16 }, { t: 'Categoría', w: 26 }, { t: 'Unidad', w: 9 }, { t: 'Unid. por caja', w: 10, tipo: 'num' },
        { t: 'Asignar', w: 9 }, { t: 'Ubicación', w: 16 }, { t: 'Stock mínimo', w: 10, tipo: 'num' }, { t: 'Producto especial', w: 10 }]
        .concat(costos ? [{ t: 'Precio de adquisición', w: 13, tipo: 'bs' }, { t: 'Precio unidad', w: 12, tipo: 'bs' }, { t: 'Precio mayor', w: 12, tipo: 'bs' },
          { t: 'Mayor desde (u)', w: 10, tipo: 'num' }, { t: 'Caja cerrada (por unidad)', w: 13, tipo: 'bs' }] : []),
        filas: lista2.map(p => [txt(p.codigo), txt(p.nombre), c.nombreMarca(p.marca_id), c.rutaCategoria(p.categoria_id), txt(p.unidad), nx(p.unidades_por_caja), '', '', '', '']
          .concat(costos ? ['', '', '', '', ''] : [])) };
    } else if (tipoId === 'ENTRADA' || tipoId === 'COMPRA') {
      hoja = { columnas: [{ t: 'Código', w: 12 }, { t: 'Nombre', w: 42 }, { t: 'Marca', w: 16 }, { t: 'Unidad', w: 9 }, { t: 'Unid. por paquete', w: 10, tipo: 'num' },
        { t: 'Unid. por caja', w: 10, tipo: 'num' }, { t: 'Stock en el sistema', w: 11, tipo: 'num' }, { t: 'Adquisición actual (c/u)', w: 13, tipo: 'bs' },
        { t: 'Presentación', w: 12 }, { t: 'Cantidad', w: 10, tipo: 'num' }, { t: 'Costo por presentación (Bs)', w: 15, tipo: 'bs' }],
        filas: asignados().map(x => [txt(x.p.codigo), txt(x.p.nombre), c.nombreMarca(x.p.marca_id), txt(x.p.unidad), nx(x.p.unidades_por_paquete), nx(x.p.unidades_por_caja),
          ctx.stock.get(String(x.p.id)) || 0, nx(red(n0(x.ps.costo_promedio), 4)), n0(x.p.unidades_por_caja) > 1 ? 'CAJA' : 'UNIDAD', '', '']) };
    } else if (tipoId === 'AJUSTE') {
      hoja = { columnas: [{ t: 'Código', w: 12 }, { t: 'Nombre', w: 42 }, { t: 'Marca', w: 16 }, { t: 'Unidad', w: 9 }, { t: 'Ubicación', w: 16 }, { t: 'Unid. por caja', w: 10, tipo: 'num' },
        { t: 'Stock en el sistema', w: 12, tipo: 'num' }, { t: 'Stock contado', w: 12, tipo: 'num' }, { t: 'Observación', w: 30 }],
        filas: asignados().sort((a, b) => txt(a.ps.ubicacion).localeCompare(txt(b.ps.ubicacion), 'es') || porNombre(a.p, b.p))
          .map(x => [txt(x.p.codigo), txt(x.p.nombre), c.nombreMarca(x.p.marca_id), txt(x.p.unidad), txt(x.ps.ubicacion), nx(x.p.unidades_por_caja), ctx.stock.get(String(x.p.id)) || 0, '', '']) };
    } else if (tipoId === 'PRECIOS') {
      hoja = { columnas: [{ t: 'Código', w: 12 }, { t: 'Nombre', w: 42 }, { t: 'Marca', w: 16 }, { t: 'Unidad', w: 9 }, { t: 'Unid. por caja', w: 10, tipo: 'num' }]
        .concat(costos ? [{ t: 'Precio de adquisición', w: 13, tipo: 'bs' }] : [])
        .concat([{ t: 'Precio unidad', w: 12, tipo: 'bs' }, { t: 'Precio mayor', w: 12, tipo: 'bs' }, { t: 'Mayor desde (u)', w: 10, tipo: 'num' },
          { t: 'Caja cerrada (por unidad)', w: 13, tipo: 'bs' }, { t: 'Total caja cerrada', w: 13, tipo: 'bs' }]),
        filas: asignados().map(x => {
          const upc = n0(x.p.unidades_por_caja) > 1 ? n0(x.p.unidades_por_caja) : 1;
          return [txt(x.p.codigo), txt(x.p.nombre), c.nombreMarca(x.p.marca_id), txt(x.p.unidad), nx(x.p.unidades_por_caja)]
            .concat(costos ? [nx(red(n0(x.ps.costo_promedio), 4))] : [])
            .concat([nx(x.ps.precio_unidad), nx(x.ps.precio_mayor), nx(x.ps.cantidad_min_mayor), n0(x.ps.precio_caja) ? red(n0(x.ps.precio_caja) / upc, 4) : '', nx(x.ps.precio_caja)]);
        }) };
    } else {
      hoja = { columnas: [{ t: 'Código', w: 12 }, { t: 'Nombre', w: 42 }, { t: 'Marca', w: 16 }, { t: 'Unidad', w: 9 }, { t: 'Ubicación', w: 22 }, { t: 'Stock mínimo', w: 10, tipo: 'num' },
        { t: 'Producto especial', w: 10 }],
        filas: asignados().map(x => [txt(x.p.codigo), txt(x.p.nombre), c.nombreMarca(x.p.marca_id), txt(x.p.unidad), txt(x.ps.ubicacion), nx(x.ps.stock_minimo), x.ps.producto_especial === 'SI' ? 'SI' : 'NO']) };
    }
    hoja.nombre = 'Plantilla';
    hoja.titulo = 'Importar: ' + TIPOS[tipoId].titulo + (nombreSuc ? ' · ' + nombreSuc : '');
    hoja.subtitulo = F.fechaCorta(hoy()) + ' · ' + hoja.filas.length + ' fila(s) · vea la hoja "Instrucciones"';
    Excel.descargar('Plantilla_' + tipoId.toLowerCase() + (nombreSuc ? '_' + Excel.nombreArchivo(nombreSuc) : '') + '_' + hoy() + '.xlsx', [hoja, hojaInstrucciones(tipoId, ctx)]);
    App.aviso('Plantilla descargada (' + hoja.filas.length + ' fila(s))', 'ok');
  }

  // ============================================================
  //  PANTALLA: IMPORTACIONES MASIVAS
  // ============================================================
  const imp = { tipo: '', empresaId: '', sucursalId: '', libro: null, archivo: '', hoja: 0, filtro: 'TODOS', limite: 200, confirmaErrores: false,
    opciones: { motivo: 'CONTEO', observacion: '', proveedor: '', fecha: '', nroDoc: '', tipoPago: 'CONTADO', vence: '', gasto: '', metodo: 'CAJAS', enDeuda: false, asignarSuc: '' } };
  const ETQ_ACCION = { NUEVO: '<span class="etiqueta verde">Nuevo</span>', CAMBIA: '<span class="etiqueta naranja">Cambia</span>',
    IGUAL: '<span class="etiqueta">Sin cambios</span>', ERROR: '<span class="etiqueta roja">Error</span>', OMITE: '<span class="etiqueta">Se ignora</span>' };

  App.pantalla('importaciones', {
    refrescar: false,
    async render(el) {
      const raiz = F.contenedor(el);
      if ([AG, ADM].indexOf(rol()) < 0) { raiz.innerHTML = F.vacio('lock', 'Solo los administradores importan datos.'); return; }
      const a = await window.F6.alcance();
      const tipo = TIPOS[imp.tipo];
      if (!a.empresas.some(e => mismo(e.id, imp.empresaId))) imp.empresaId = (App.contexto.empresa || a.empresas[0] || {}).id || '';
      const sucsEmp = a.sucursales.filter(s => mismo(s.empresa_id, imp.empresaId));
      if (!sucsEmp.some(s => mismo(s.id, imp.sucursalId))) imp.sucursalId = ((App.contexto.sucursal && sucsEmp.find(s => mismo(s.id, App.contexto.sucursal.id))) || sucsEmp[0] || {}).id || '';
      const suc = a.sucursales.find(s => mismo(s.id, imp.sucursalId)) || null;
      const enLinea = navigator.onLine && !!Sesion.actual.token;

      let html = '<div class="titulo"><div><h1>Importaciones masivas</h1><p>Cargue o actualice muchos productos a la vez desde Excel. ' +
        'Siempre verá una vista previa con los errores antes de guardar.</p></div></div>' +
        (!enLinea ? '<div class="msg msg-aviso">Necesita internet (y la sesión iniciada con internet) para importar. Puede preparar y revisar el archivo, pero no guardarlo.</div>' : '') +
        '<div class="pasos"><span class="' + (imp.tipo ? 'hecho' : 'actual') + '">1. Qué importar</span><span class="' + (imp.tipo ? (imp.libro ? 'hecho' : 'actual') : '') + '">2. Plantilla y archivo</span>' +
        '<span class="' + (imp.libro ? 'actual' : '') + '">3. Vista previa y guardar</span></div>' +
        '<div class="imp-tipos">' + ORDEN_TIPOS.map(id => {
          const t = TIPOS[id];
          return '<button class="tarjeta imp-tipo' + (imp.tipo === id ? ' elegida' : '') + '" data-tipo="' + id + '">' + ico(t.icono) + '<span><b>' + esc(t.titulo) + '</b>' +
            '<small>' + esc(t.desc) + '</small>' + (t.porSucursal ? '' : '<em>Todas las empresas</em>') + '</span></button>';
        }).join('') + '</div>';

      if (tipo) {
        html += '<div class="tarjeta bloque imp-paso"><h3>' + ico(tipo.icono) + esc(tipo.titulo) + '</h3>' +
          (imp.tipo === 'CATALOGO' && rol() === ADM ? '<div class="msg msg-aviso"><b>Atención:</b> el catálogo es el mismo para <b>todas las empresas</b>. Los cambios se aplican en todas las sucursales donde esté cada producto.</div>' : '') +
          '<div class="filtros">' +
          (tipo.porSucursal ? (esAG() && a.empresas.length > 1 ? '<div class="campo corto"><label for="iEmp">Empresa</label>' + F.lista('iEmp', a.empresas.map(e => [e.id, e.nombre]), imp.empresaId) + '</div>' : '') +
            '<div class="campo corto"><label for="iSuc">Sucursal</label>' + F.lista('iSuc', sucsEmp.map(s => [s.id, s.nombre + (s.es_central === 'SI' ? ' (central)' : '')]), imp.sucursalId) + '</div>' : '') +
          '</div>' + (tipo.porSucursal && !suc ? '<div class="msg msg-error">No hay sucursales en esta empresa.</div>' : await opcionesHtml(suc, a)) +
          '<div class="acciones-fila" style="justify-content:flex-start">' +
          '<button class="btn btn-borde" data-acc="plantilla"' + (tipo.porSucursal && !suc ? ' disabled' : '') + '>' + ico('download') + 'Descargar plantilla</button>' +
          '<button class="btn btn-principal" data-acc="archivo"' + (tipo.porSucursal && !suc ? ' disabled' : '') + '>' + ico('upload') + (imp.libro ? 'Elegir otro archivo' : 'Elegir archivo Excel') + '</button>' +
          '<input type="file" id="iArchivo" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden></div>' +
          '<p class="nota" style="margin:10px 0 0">La plantilla ya trae ' + (imp.tipo === 'CATALOGO' ? 'todo el catálogo' : imp.tipo === 'ASIGNAR' ? 'los productos del catálogo que faltan en la sucursal' : 'los productos de la sucursal') +
          ' y una hoja de instrucciones. Acepta .xlsx y .csv. ' + (imp.tipo !== 'CATALOGO' && imp.tipo !== 'ASIGNAR' && imp.tipo !== 'ENTRADA' && imp.tipo !== 'COMPRA' ? 'También sirve el Excel exportado de Productos de la sucursal.' : imp.tipo === 'CATALOGO' ? 'También sirve el Excel exportado del Catálogo general.' : '') + '</p>' +
          '</div><div id="iPrevia"></div>';
      }
      html += '<div id="iHistorial"></div>';
      raiz.innerHTML = html;

      // ---------- eventos ----------
      raiz.onclick = async ev => {
        const t = ev.target.closest('[data-tipo]');
        if (t) {
          if (imp.tipo !== t.dataset.tipo) { imp.libro = null; imp.archivo = ''; imp.confirmaErrores = false; imp.filtro = 'TODOS'; }
          imp.tipo = t.dataset.tipo;
          return App.refrescarContexto();
        }
        const b = ev.target.closest('[data-acc]');
        if (!b) return;
        switch (b.dataset.acc) {
          case 'plantilla':
            try { App.cargando('Preparando la plantilla…'); await plantilla(imp.tipo, await contexto(suc, a)); }
            catch (e) { App.aviso(e.message || String(e), 'error', 6); }
            finally { App.cargando(null); }
            return;
          case 'archivo': return $('#iArchivo', raiz).click();
          case 'guardar': return guardar(suc, a);
          case 'quitar': imp.libro = null; imp.archivo = ''; return App.refrescarContexto();
          case 'mas': imp.limite += 500; return pintarPrevia(raiz, suc, a);
          case 'nuevoProv': {
            const id = await window.F6.formProveedor(null, suc.empresa_id);
            if (id) { imp.opciones.proveedor = id; App.refrescarContexto(); }
            return;
          }
        }
      };
      const sEmp = $('#iEmp', raiz), sSuc = $('#iSuc', raiz);
      if (sEmp) sEmp.onchange = () => { imp.empresaId = sEmp.value; imp.sucursalId = ''; imp.opciones.proveedor = ''; App.refrescarContexto(); };
      if (sSuc) sSuc.onchange = () => { const antes = (a.sucursales.find(s => mismo(s.id, imp.sucursalId)) || {}).empresa_id; imp.sucursalId = sSuc.value;
        if (!mismo(antes, (a.sucursales.find(s => mismo(s.id, imp.sucursalId)) || {}).empresa_id)) imp.opciones.proveedor = ''; App.refrescarContexto(); };
      const inp = $('#iArchivo', raiz);
      if (inp) inp.onchange = async () => {
        const archivo = inp.files && inp.files[0];
        inp.value = '';
        if (!archivo) return;
        try {
          App.cargando('Leyendo ' + archivo.name + '…');
          const libro = await leerArchivo(archivo);
          if (!libro.hojas.length) throw new Error('El archivo no tiene hojas con datos.');
          imp.libro = libro;
          imp.archivo = archivo.name;
          imp.hoja = Math.max(0, libro.hojas.findIndex(h => encabezados(h.filas, TIPOS[imp.tipo].campos)));
          imp.filtro = 'TODOS'; imp.limite = 200; imp.confirmaErrores = false;
        } catch (e) {
          App.aviso(e.message || String(e), 'error', 8);
        } finally { App.cargando(null); }
        App.refrescarContexto();
      };
      // Opciones (se guardan en el módulo para no perderlas)
      $$('[data-op]', raiz).forEach(i => {
        const fn = () => {
          imp.opciones[i.dataset.op] = i.type === 'checkbox' ? i.checked : i.value;
          if (i.dataset.op === 'tipoPago' || i.dataset.op === 'gasto') ponerVisibles(raiz);
          if (i.dataset.op === 'proveedor' || i.dataset.op === 'fecha') ponerVence(raiz, a, suc);
          if (['gasto', 'metodo'].indexOf(i.dataset.op) >= 0 && imp.libro) { clearTimeout(i._t); i._t = setTimeout(() => pintarPrevia(raiz, suc, a), 250); }
        };
        i.addEventListener('input', fn);
        i.addEventListener('change', fn);
      });
      ponerVisibles(raiz);
      if (imp.libro && tipo) await pintarPrevia(raiz, suc, a);
      pintarHistorial(raiz, a);
    }
  });

  async function contexto(suc, a) {
    const ctx = { c: await Catalogo.cargar(), tipoId: imp.tipo, opciones: Object.assign({ archivo: imp.archivo }, imp.opciones), sucursales: a.sucursales };
    if (TIPOS[imp.tipo].porSucursal && suc) {
      ctx.suc = suc;
      ctx.ps = new Map((await Datos.listar('PRODUCTOS_SUCURSAL', x => mismo(x.sucursal_id, suc.id))).map(x => [String(x.producto_id), x]));
      ctx.stock = await Catalogo.stocks(suc.id);
    }
    return ctx;
  }

  async function opcionesHtml(suc, a) {
    const o = imp.opciones;
    if (imp.tipo === 'AJUSTE') {
      const motivos = (await Datos.lista('MOTIVO_AJUSTE')).map(m => [m.codigo, m.nombre]);
      return '<div class="form-2">' + F.campoLista('oMotivo', 'Motivo del ajuste', motivos.length ? motivos : [['CONTEO', 'Conteo físico']], o.motivo, { attrs: ' data-op="motivo"', req: true }) +
        F.campo('oObs', 'Observación', o.observacion, { ph: 'Ej. Inventario de fin de año', attrs: ' data-op="observacion" maxlength="200"' }) + '</div>';
    }
    if (imp.tipo === 'ENTRADA' || imp.tipo === 'COMPRA') {
      const provs = await window.F6.proveedoresDe(suc.empresa_id);
      const compra = imp.tipo === 'COMPRA';
      if (!o.fecha) o.fecha = hoy();
      if (!o.vence) o.vence = F.sumarDias(o.fecha, 30);
      return '<div class="form-2">' +
        '<div class="campo"><label for="oProv">Proveedor' + (compra ? ' <span class="req">*</span>' : '') + '</label><div class="con-mas">' +
        F.lista('oProv', [['', compra ? '— Elija —' : '— Sin proveedor / varios —']].concat(provs.map(p => [p.id, p.razon_social])), o.proveedor, ' data-op="proveedor"') +
        '<button type="button" class="btn btn-borde" data-acc="nuevoProv" title="Nuevo proveedor" aria-label="Nuevo proveedor">' + F.icoX('mas') + '</button></div></div>' +
        F.campo('oFecha', 'Fecha', o.fecha, { tipo: 'date', attrs: ' data-op="fecha"' }) +
        F.campo('oDoc', 'N.º de factura o nota', o.nroDoc, { attrs: ' data-op="nroDoc" maxlength="30"' }) +
        (compra ? F.campoLista('oPago', 'Pago', [['CONTADO', 'Contado'], ['CREDITO', 'Crédito (queda como deuda)']], o.tipoPago, { attrs: ' data-op="tipoPago"' }) +
          F.campo('oVence', 'Vence el', o.vence, { tipo: 'date', attrs: ' data-op="vence"', idCampo: 'oVenceCampo' }) +
          F.campoNum('oGasto', 'Gasto de transporte (Bs)', o.gasto, { attrs: ' data-op="gasto"' }) +
          F.campoLista('oMetodo', 'Repartir el transporte', [['CAJAS', 'Por cantidad de cajas'], ['VOLUMEN', 'Por volumen (m³)']], o.metodo, { attrs: ' data-op="metodo"' }) +
          '<div class="campo todo" id="oEnDeudaCampo"><label class="check"><input type="checkbox" data-op="enDeuda"' + (o.enDeuda ? ' checked' : '') + '><span><b>El proveedor cobra el transporte</b>' +
          '<small>Se suma al monto a pagar al proveedor.</small></span></label></div>' : '') + '</div>';
    }
    if (imp.tipo === 'CATALOGO') {
      return '<div class="form-2"><div class="campo todo"><label for="oAsig">Asignar los productos NUEVOS también a</label>' +
        F.lista('oAsig', [['', '— No asignar (lo hago después) —']].concat(a.sucursales.map(s => [s.id, (esAG() && a.empresas.length > 1 ? ((a.empresas.find(e => mismo(e.id, s.empresa_id)) || {}).nombre || '') + ' · ' : '') + s.nombre])),
          imp.opciones.asignarSuc, ' data-op="asignarSuc"') + '</div></div>';
    }
    return '';
  }
  function ponerVisibles(raiz) {
    const v = $('#oVenceCampo', raiz), d = $('#oEnDeudaCampo', raiz);
    if (v) v.classList.toggle('oculto', imp.opciones.tipoPago !== 'CREDITO');
    if (d) d.classList.toggle('oculto', !(num(imp.opciones.gasto) > 0));
  }
  async function ponerVence(raiz, a, suc) {
    const v = $('#oVence', raiz);
    if (!v || !suc) return;
    const prov = imp.opciones.proveedor ? await Datos.obtener('PROVEEDORES', imp.opciones.proveedor) : null;
    const dias = prov && n0(prov.plazo_pago_dias) > 0 ? n0(prov.plazo_pago_dias) : (parseInt(await Datos.config('dias_credito_compra', '30'), 10) || 30);
    v.value = imp.opciones.vence = F.sumarDias(imp.opciones.fecha || hoy(), dias);
  }

  /** Analiza el archivo y dibuja la vista previa. */
  async function pintarPrevia(raiz, suc, a) {
    const cont = $('#iPrevia', raiz);
    if (!cont || !imp.libro || !TIPOS[imp.tipo]) return;
    const tipo = TIPOS[imp.tipo];
    const hojas = imp.libro.hojas;
    const hoja = hojas[imp.hoja] || hojas[0];
    const enc = encabezados(hoja.filas, tipo.campos);
    const cabeza = '<div class="tarjeta bloque"><div class="imp-archivo">' + ico('file') + '<span><b>' + esc(imp.archivo) + '</b>' +
      (hojas.length > 1 ? '<small>Hoja: ' + F.lista('iHoja', hojas.map((h, i) => [i, h.nombre]), imp.hoja, ' style="display:inline-block;width:auto;min-height:34px;padding:4px 8px"') + '</small>' : '<small>Hoja: ' + esc(hoja.nombre) + '</small>') +
      '</span><button class="btn btn-chico btn-borde" data-acc="quitar">Quitar archivo</button></div>';
    const enlazarHoja = () => { const s = $('#iHoja', cont); if (s) s.onchange = () => { imp.hoja = Number(s.value); imp.limite = 200; pintarPrevia(raiz, suc, a); }; };
    if (!enc) {
      cont.innerHTML = cabeza + '<div class="msg msg-error">No se encontró la fila de encabezados: debe haber una columna llamada <b>Código</b> en las primeras 15 filas.</div></div>';
      enlazarHoja();
      return;
    }
    const faltan = (REQUERIDAS[imp.tipo] || []).filter(cmp => enc.mapa[cmp] == null);
    if (faltan.length) {
      cont.innerHTML = cabeza + '<div class="msg msg-error">Falta la columna <b>' + faltan.map(cmp => NOMBRE_CAMPO[cmp] || cmp).join(', ') + '</b>. Descargue la plantilla para ver el formato.</div></div>';
      enlazarHoja();
      return;
    }
    const ctx = await contexto(suc, a);
    const filas = filasDatos(hoja, enc);
    const items = await ANALIZAR[imp.tipo](filas, ctx, enc);
    imp._items = items;
    imp._ctx = ctx;
    const cuenta = k => items.filter(i => i.accion === k).length;
    const n = { NUEVO: cuenta('NUEVO'), CAMBIA: cuenta('CAMBIA'), IGUAL: cuenta('IGUAL'), ERROR: cuenta('ERROR'), OMITE: cuenta('OMITE') };
    const validos = n.NUEVO + n.CAMBIA;
    const noUsadas = (hoja.filas[enc.fila] || []).map(textoCelda).filter((h, j) => h && !Object.keys(enc.mapa).some(k => enc.mapa[k] === j));
    const vista = items.filter(i => imp.filtro === 'TODOS' ? i.accion !== 'OMITE' : imp.filtro === 'VALIDOS' ? (i.accion === 'NUEVO' || i.accion === 'CAMBIA') : i.accion === imp.filtro);
    const mostrar = vista.slice(0, imp.limite);
    const esCompra = imp.tipo === 'ENTRADA' || imp.tipo === 'COMPRA';
    const calc = ctx.calc;
    const etqNuevo = esCompra ? 'Entran' : imp.tipo === 'ASIGNAR' ? 'Se asignan' : 'Nuevos';

    let html = cabeza +
      '<p class="nota" style="margin:8px 0 10px">Columnas reconocidas: <b>' + enc.reconocidas.map(k => (hoja.filas[enc.fila] || [])[enc.mapa[k]]).map(textoCelda).map(esc).join(', ') + '</b>' +
      (noUsadas.length ? ' · no se usan: ' + noUsadas.map(esc).join(', ') : '') + '.</p>' +
      '<div class="tiles">' +
      '<button class="tarjeta tile' + (imp.filtro === 'VALIDOS' ? ' elegida' : '') + '" data-filtro="VALIDOS"><span>Se guardan</span><b class="cifra verde">' + validos + '</b></button>' +
      (n.NUEVO ? '<button class="tarjeta tile' + (imp.filtro === 'NUEVO' ? ' elegida' : '') + '" data-filtro="NUEVO"><span>' + etqNuevo + '</span><b class="cifra">' + n.NUEVO + '</b></button>' : '') +
      (n.CAMBIA ? '<button class="tarjeta tile' + (imp.filtro === 'CAMBIA' ? ' elegida' : '') + '" data-filtro="CAMBIA"><span>Cambian</span><b class="cifra">' + n.CAMBIA + '</b></button>' : '') +
      '<button class="tarjeta tile' + (imp.filtro === 'IGUAL' ? ' elegida' : '') + '" data-filtro="IGUAL"><span>Sin cambios</span><b class="cifra">' + n.IGUAL + '</b></button>' +
      '<button class="tarjeta tile' + (imp.filtro === 'ERROR' ? ' elegida' : '') + '" data-filtro="ERROR"><span>Con error</span><b class="cifra' + (n.ERROR ? ' roja' : '') + '">' + n.ERROR + '</b></button>' +
      (n.OMITE ? '<button class="tarjeta tile' + (imp.filtro === 'OMITE' ? ' elegida' : '') + '" data-filtro="OMITE"><span>Se ignoran (vacías)</span><b class="cifra">' + n.OMITE + '</b></button>' : '') +
      '</div>' +
      (esCompra && calc && calc.lineas.length ? '<div class="totales" style="margin-bottom:12px"><div><span>Mercadería</span><b>' + bs(calc.subtotal) + '</b></div>' +
        '<div><span>Transporte</span><b>' + bs(calc.gasto) + '</b></div><div class="grande"><span>Costo total que entra al inventario</span><b>' + bs(calc.total) + '</b></div></div>' : '') +
      '<div class="filtros"><div class="campo corto"><label for="iFiltro">Mostrar</label>' + F.lista('iFiltro', [['TODOS', 'Todas las filas'], ['VALIDOS', 'Las que se guardan'],
        ['NUEVO', etqNuevo], ['CAMBIA', 'Cambian'], ['IGUAL', 'Sin cambios'], ['ERROR', 'Con error'], ['OMITE', 'Ignoradas']], imp.filtro) + '</div></div>' +
      (!vista.length ? '<p class="vacio">No hay filas en esta vista.</p>' :
        '<div class="tabla-env"><table class="tabla compacta imp-tabla"><thead><tr><th class="num">Fila</th><th>Código</th><th>Producto</th><th>Resultado</th><th>Detalle</th></tr></thead><tbody>' +
        mostrar.map(i => '<tr class="' + (i.accion === 'ERROR' ? 'con-error' : '') + '"><td class="num">' + i.n + '</td><td class="mono">' + esc(i.codigo || '—') + '</td>' +
          '<td>' + esc(i.p ? i.p.nombre : (i.datos && i.datos.nombre) || '') + '</td><td>' + ETQ_ACCION[i.accion] + '</td>' +
          '<td>' + (i.errores.length ? '<span class="txt-rojo">' + i.errores.map(esc).join(' · ') + '</span>' : '') +
          (i.textos.length ? '<span class="imp-det">' + i.textos.map(esc).join('<br>') + '</span>' : '') +
          (i.avisos.length ? '<span class="txt-amarillo imp-det">⚠ ' + i.avisos.map(esc).join(' · ') + '</span>' : '') + '</td></tr>').join('') +
        '</tbody></table></div>' + (vista.length > mostrar.length ? '<div class="mas-centro"><button class="btn btn-borde" data-acc="mas">Mostrar más (' + (vista.length - mostrar.length) + ')</button></div>' : '')) +
      (n.ERROR && validos ? '<label class="check" style="margin-top:12px"><input type="checkbox" id="iConErrores"' + (imp.confirmaErrores ? ' checked' : '') + '><span><b>Guardar solo las ' + validos +
        ' filas correctas</b><small>Las ' + n.ERROR + ' filas con error no se guardan. Puede corregirlas en Excel e importarlas después.</small></span></label>' : '') +
      '<div class="acciones-fila" style="justify-content:flex-end;margin-top:12px">' +
      '<button class="btn btn-principal" data-acc="guardar"' + (!validos ? ' disabled' : '') + '>' + ico('check') + (validos ? 'Guardar ' + validos + ' fila(s)' : 'Nada para guardar') + '</button></div></div>';
    cont.innerHTML = html;
    enlazarHoja();
    $('#iFiltro', cont).onchange = e => { imp.filtro = e.target.value; imp.limite = 200; pintarPrevia(raiz, suc, a); };
    $$('[data-filtro]', cont).forEach(b => { b.onclick = () => { imp.filtro = b.dataset.filtro; imp.limite = 200; pintarPrevia(raiz, suc, a); }; });
    const chk = $('#iConErrores', cont);
    if (chk) chk.onchange = () => { imp.confirmaErrores = chk.checked; };
  }

  async function guardar(suc, a) {
    const items = imp._items || [];
    const ctx = imp._ctx;
    const tipo = TIPOS[imp.tipo];
    const validos = items.filter(i => i.accion === 'NUEVO' || i.accion === 'CAMBIA');
    const errores = items.filter(i => i.accion === 'ERROR').length;
    if (!validos.length) { App.aviso('No hay filas para guardar.', 'info'); return; }
    if (errores && !imp.confirmaErrores) { App.aviso('Hay ' + errores + ' fila(s) con error. Corríjalas o marque "Guardar solo las filas correctas".', 'error', 7); return; }
    if (!navigator.onLine || !Sesion.actual.token) { App.aviso('Necesita internet (y la sesión iniciada con internet) para importar.', 'error', 7); return; }
    const o = imp.opciones;
    if (imp.tipo === 'COMPRA') {
      if (!o.proveedor) { App.aviso('Elija el proveedor de la compra.', 'error'); return; }
      if (o.tipoPago === 'CREDITO' && (!o.vence || o.vence < (o.fecha || hoy()))) { App.aviso('Revise la fecha de vencimiento.', 'error'); return; }
      if (num(o.gasto) === null && txt(o.gasto)) { App.aviso('El gasto de transporte debe ser un número.', 'error'); return; }
    }
    if ((imp.tipo === 'ENTRADA' || imp.tipo === 'COMPRA') && (o.fecha || hoy()) > hoy()) { App.aviso('La fecha no puede ser futura.', 'error'); return; }
    if (imp.tipo === 'AJUSTE' && !o.motivo) { App.aviso('Elija el motivo del ajuste.', 'error'); return; }
    const resumen = { CATALOGO: validos.length + ' producto(s) del catálogo general' + (rol() === ADM ? ' (se aplica en TODAS las empresas)' : ''),
      ASIGNAR: validos.length + ' producto(s) asignados a ' + (suc && suc.nombre), ENTRADA: 'entrada de ' + validos.length + ' producto(s) a ' + (suc && suc.nombre),
      COMPRA: 'compra de ' + validos.length + ' producto(s) para ' + (suc && suc.nombre), AJUSTE: 'ajuste de ' + validos.length + ' producto(s) en ' + (suc && suc.nombre),
      PRECIOS: 'precios de ' + validos.length + ' producto(s) en ' + (suc && suc.nombre), UBICACIONES: 'ubicaciones de ' + validos.length + ' producto(s) en ' + (suc && suc.nombre) }[imp.tipo];
    if (!(await App.confirmar('Guardar importación', 'Se guarda: ' + resumen + '. Se envía al servidor ahora mismo. ¿Continuar?', 'Guardar'))) return;
    try {
      App.cargando('Preparando ' + validos.length + ' fila(s)…');
      ctx.opciones = Object.assign({ archivo: imp.archivo }, imp.opciones);   // opciones elegidas al final
      const r = await REGISTROS[imp.tipo](validos, ctx);
      const empresaId = suc ? suc.empresa_id : (App.contexto.empresa ? App.contexto.empresa.id : '');
      r.regs.push({ tabla: 'IMPORTACIONES', fila: { id: U.uuid(), empresa_id: empresaId, sucursal_id: tipo.porSucursal && suc ? suc.id : '', tipo: imp.tipo,
        archivo_nombre: imp.archivo.slice(0, 120), filas_total: items.filter(i => i.accion !== 'OMITE').length, filas_ok: validos.length, filas_error: errores,
        documento_id: r.documento_id || '', estado: errores ? 'CON_ERRORES' : 'OK' } });
      App.cargando('Guardando ' + r.regs.length + ' registro(s) en el equipo…');
      await Datos.guardarVarios(r.regs);
      App.cargando('Enviando al servidor… (no cierre la app)');
      for (let k = 0; k < 240 && Sync.corriendo; k++) await new Promise(ok => setTimeout(ok, 500));
      await Sync.ejecutar();
      const c = await Sesion.local.contarSalida();
      App.cargando(null);
      imp.libro = null; imp.archivo = ''; imp._items = null; imp.confirmaErrores = false;
      if (imp.tipo === 'COMPRA' || imp.tipo === 'ENTRADA') Object.assign(imp.opciones, { nroDoc: '', gasto: '', enDeuda: false });
      App.modal({ titulo: 'Importación guardada', html: '<div class="msg msg-ok">Se guardaron ' + validos.length + ' fila(s)' + (r.numero ? ' · documento <b class="mono">' + esc(r.numero) + '</b>' : '') + '.</div>' +
        (c.errores ? '<div class="msg msg-error">El servidor no aceptó ' + c.errores + ' registro(s). Revíselos en <a href="#/sincronizacion">Sincronización</a>.</div>'
          : c.pendientes ? '<div class="msg msg-aviso">Quedan ' + c.pendientes + ' registro(s) por enviar: se enviarán solos en unos minutos.</div>'
          : '<div class="msg msg-info">Todo quedó enviado al servidor ✔</div>') });
      await App.refrescarContexto();
    } catch (e) {
      App.cargando(null);
      console.error(e);
      App.aviso(e.message || String(e), 'error', 8);
    }
  }

  async function pintarHistorial(raiz, a) {
    const cont = $('#iHistorial', raiz);
    if (!cont) return;
    const ids = new Set(a.empresas.map(e => String(e.id)));
    const filas = (await Datos.listar('IMPORTACIONES', x => esAG() || ids.has(String(x.empresa_id)))).sort((p, q) => String(q.creado_en).localeCompare(String(p.creado_en))).slice(0, 15);
    if (!filas.length) { cont.innerHTML = ''; return; }
    const usuarios = new Map((await Datos.listar('USUARIOS')).map(u => [String(u.id), u.nombre]));
    const nomSuc = id => (a.sucursales.find(s => mismo(s.id, id)) || {}).nombre || '';
    cont.innerHTML = '<div class="tarjeta"><h3>' + ico('list') + 'Últimas importaciones</h3><div class="tabla-env"><table class="tabla compacta"><thead><tr><th>Fecha</th><th>Tipo</th><th>Sucursal</th>' +
      '<th>Archivo</th><th class="num">Guardadas</th><th class="num">Con error</th><th>Usuario</th></tr></thead><tbody>' +
      filas.map(x => '<tr><td>' + esc(U.fechaCorta(x.creado_en)) + '</td><td>' + esc((TIPOS[x.tipo] || {}).titulo || x.tipo) + '</td><td>' + esc(x.sucursal_id ? nomSuc(x.sucursal_id) : 'Catálogo') + '</td>' +
        '<td>' + esc(x.archivo_nombre) + '</td><td class="num">' + fmt(x.filas_ok) + '</td><td class="num' + (n0(x.filas_error) ? ' txt-rojo' : '') + '">' + fmt(x.filas_error) + '</td>' +
        '<td>' + esc(usuarios.get(String(x.creado_por)) || '') + '</td></tr>').join('') + '</tbody></table></div></div>';
  }
})();
