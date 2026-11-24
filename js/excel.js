/**
 * ============================================================
 *  EXCEL (.xlsx) — se genera en el equipo, sin internet ni librerías
 * ============================================================
 *  Uso (Fase 5 y siguientes):
 *    Excel.descargar('Productos_Central_2026-11-23.xlsx', [
 *      { nombre: 'Central', titulo: 'Productos · Central', subtitulo: 'Ferre Uno · 23/11/2026',
 *        columnas: [{ t: 'Código', w: 12 }, { t: 'Stock', w: 10, tipo: 'num' }, { t: 'Precio', w: 12, tipo: 'bs' }],
 *        filas: [['P00001', 30, 55.5], …],
 *        totales: ['TOTAL', 30, null] }      // opcional
 *    ]);
 *  tipo: 'num' (número con hasta 3 decimales) · 'bs' (dinero, 2 decimales) · texto por defecto.
 * ============================================================
 */
(function () {
  'use strict';

  const enc = new TextEncoder();
  const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  // ---------- ZIP (sin compresión) ----------
  const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(b) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(archivos) {
    const partes = [], central = [];
    let desplazamiento = 0;
    archivos.forEach(a => {
      const nombre = enc.encode(a.nombre);
      const datos = typeof a.datos === 'string' ? enc.encode(a.datos) : a.datos;
      const crc = crc32(datos);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint16(8, 0, true); h.setUint16(10, 0, true); h.setUint16(12, 0x21, true);
      h.setUint32(14, crc, true); h.setUint32(18, datos.length, true); h.setUint32(22, datos.length, true);
      h.setUint16(26, nombre.length, true); h.setUint16(28, 0, true);
      partes.push(new Uint8Array(h.buffer), nombre, datos);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
      c.setUint32(16, crc, true); c.setUint32(20, datos.length, true); c.setUint32(24, datos.length, true);
      c.setUint16(28, nombre.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true);
      c.setUint16(34, 0, true); c.setUint16(36, 0, true); c.setUint32(38, 0, true); c.setUint32(42, desplazamiento, true);
      central.push(new Uint8Array(c.buffer), nombre);
      desplazamiento += 30 + nombre.length + datos.length;
    });
    const tamCentral = central.reduce((s, x) => s + x.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
    fin.setUint32(12, tamCentral, true); fin.setUint32(16, desplazamiento, true); fin.setUint16(20, 0, true);
    return new Blob(partes.concat(central, [new Uint8Array(fin.buffer)]), { type: TIPO_XLSX });
  }

  // ---------- XML de la hoja ----------
  const x = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  const letra = n => { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  // estilos (ver ESTILOS): 0 normal · 1 encabezado · 2 Bs · 3 número · 4 negrita · 5 negrita Bs · 6 negrita número · 7 título · 8 subtítulo
  const ESTILO_TIPO = { bs: 2, num: 3 };
  const ESTILO_TOTAL = { bs: 5, num: 6 };

  function celda(ref, v, estilo) {
    if (v === null || v === undefined || v === '') return '';
    const s = estilo ? ' s="' + estilo + '"' : '';
    if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + s + '><v>' + v + '</v></c>';
    return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + x(v) + '</t></is></c>';
  }

  function hojaXml(h) {
    const cols = h.columnas || [];
    const filas = [];
    let r = 0;
    if (h.titulo) { r++; filas.push('<row r="' + r + '">' + celda('A' + r, h.titulo, 7) + '</row>'); }
    if (h.subtitulo) { r++; filas.push('<row r="' + r + '">' + celda('A' + r, h.subtitulo, 8) + '</row>'); }
    if (h.titulo || h.subtitulo) { r++; filas.push('<row r="' + r + '"/>'); }
    r++;
    const filaEnc = r;
    filas.push('<row r="' + r + '" ht="30" customHeight="1">' + cols.map((c, i) => celda(letra(i) + r, c.t, 1)).join('') + '</row>');
    (h.filas || []).forEach(f => {
      r++;
      filas.push('<row r="' + r + '">' + f.map((v, i) => celda(letra(i) + r, v, ESTILO_TIPO[(cols[i] || {}).tipo] || 0)).join('') + '</row>');
    });
    const ultimaDato = r;
    if (h.totales) {
      r++;
      filas.push('<row r="' + r + '">' + h.totales.map((v, i) => celda(letra(i) + r, v, ESTILO_TOTAL[(cols[i] || {}).tipo] || 4)).join('') + '</row>');
    }
    const ancho = '<cols>' + cols.map((c, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.w || 14) + '" customWidth="1"/>').join('') + '</cols>';
    const panel = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + filaEnc + '" topLeftCell="A' + (filaEnc + 1) +
      '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
    const filtro = cols.length && ultimaDato > filaEnc ? '<autoFilter ref="A' + filaEnc + ':' + letra(cols.length - 1) + ultimaDato + '"/>' : '';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      panel + ancho + '<sheetData>' + filas.join('') + '</sheetData>' + filtro + '</worksheet>';
  }

  const ESTILOS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="#,##0.###"/></numFmts>' +
    '<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="14"/><color rgb="FF0F132E"/><name val="Calibri"/></font>' +
    '<font><sz val="10"/><color rgb="FF5D6280"/><name val="Calibri"/></font></fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF0F132E"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF4D6"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left/><right/><top style="thin"><color rgb="FF0F132E"/></top><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="9">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="165" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  /** Nombre de hoja válido para Excel (máx. 31, sin []:*?/\) y sin repetir. */
  function nombresHojas(hojas) {
    const usados = new Set();
    return hojas.map((h, i) => {
      let base = String(h.nombre || 'Hoja ' + (i + 1)).replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Hoja ' + (i + 1);
      let n = base, k = 2;
      while (usados.has(n.toLowerCase())) { const suf = ' (' + k++ + ')'; n = base.slice(0, 31 - suf.length) + suf; }
      usados.add(n.toLowerCase());
      return n;
    });
  }

  function crear(hojas) {
    const nombres = nombresHojas(hojas);
    const archivos = [
      { nombre: '[Content_Types].xml', datos: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        hojas.map((h, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
        '</Types>' },
      { nombre: '_rels/.rels', datos: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { nombre: 'xl/workbook.xml', datos: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        nombres.map((n, i) => '<sheet name="' + x(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets>' +
        '<definedNames>' + hojas.map((h, i) => {
          const nf = (h.titulo ? 1 : 0) + (h.subtitulo ? 1 : 0) + (h.titulo || h.subtitulo ? 1 : 0) + 1;
          const ultima = nf + (h.filas || []).length;
          return (h.columnas || []).length && (h.filas || []).length ? '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">\'' +
            x(nombres[i]).replace(/'/g, "''") + '\'!$A$' + nf + ':$' + letra(h.columnas.length - 1) + '$' + ultima + '</definedName>' : '';
        }).join('') + '</definedNames></workbook>' },
      { nombre: 'xl/_rels/workbook.xml.rels', datos: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        hojas.map((h, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
        '<Relationship Id="rId' + (hojas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { nombre: 'xl/styles.xml', datos: ESTILOS }
    ].concat(hojas.map((h, i) => ({ nombre: 'xl/worksheets/sheet' + (i + 1) + '.xml', datos: hojaXml(h) })));
    return zip(archivos);
  }

  /** Arma el archivo y lo descarga en el equipo. */
  function descargar(nombreArchivo, hojas) {
    const blob = crear(hojas);
    const nombre = String(nombreArchivo || 'archivo.xlsx').replace(/[\\\/:*?"<>|]+/g, '-');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = /\.xlsx$/i.test(nombre) ? nombre : nombre + '.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return blob;
  }

  /** Texto apto para nombre de archivo: "Sucursal Central" → "Sucursal_Central" */
  const nombreArchivo = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');

  window.Excel = { crear: crear, descargar: descargar, nombreArchivo: nombreArchivo };
})();
