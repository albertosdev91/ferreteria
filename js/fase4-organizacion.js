/**
 * ============================================================
 *  FASE 4: EMPRESAS, SUCURSALES, USUARIOS Y DISPOSITIVOS
 * ============================================================
 *  Pantallas: #/empresas  #/sucursales  #/usuarios  #/dispositivos
 *  Roles: ADMIN_GENERAL (todas las empresas) y ADMINISTRADOR (solo la suya).
 *
 *  - Empresas y sucursales: se guardan en el equipo y se envían solas
 *    (funcionan sin internet).
 *  - Usuarios: necesitan internet (la clave se cifra en el servidor).
 *  - Dispositivos: bloquear / desbloquear equipos.
 * ============================================================
 */
(function () {
  'use strict';

  const R = App.ROLES;
  const AG = R.AG, ADM = R.ADM, ALM = R.ALM, VEN = R.VEN, CON = R.CON;
  const ROLES_TODOS = [AG, ADM, ALM, VEN, CON];
  const ROLES_CON_SUCURSALES = [ALM, VEN];       // los demás ven todas las sucursales de su empresa (o todo)
  const esc = U.esc, ico = App.ico;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  const RX_COD_EMPRESA = /^[A-Z0-9]{2,6}$/;
  const RX_COD_SUCURSAL = /^[A-Z0-9]{2,10}$/;
  const RX_USUARIO = /^[a-z0-9._-]{3,30}$/;
  const RX_COLOR = /^#[0-9a-f]{6}$/i;
  const MIN_CLAVE = 6;
  const COLOR_1 = '#0f132e', COLOR_2 = '#fe9f31';   // colores del sistema (pautas/diseno.md)

  // ============================================================
  //  UTILIDADES
  // ============================================================
  const esAG = () => Sesion.actual.rol === AG;
  const txt = v => String(v == null ? '' : v).trim();
  const mayus = v => txt(v).toUpperCase();
  const minus = v => txt(v).toLowerCase();
  const activo = x => x.estado !== 'INACTIVO';
  const mismo = (a, b) => String(a == null ? '' : a) === String(b == null ? '' : b);
  const porNombre = (a, b) => txt(a.nombre).localeCompare(txt(b.nombre), 'es');
  const ordenSucursales = (a, b) => (b.es_central === 'SI') - (a.es_central === 'SI') || porNombre(a, b);
  const nombreRol = r => App.NOMBRE_ROL[r] || r || '—';
  const contiene = (b, ...campos) => !b || campos.some(c => minus(c).indexOf(b) >= 0);

  function etiquetaEstado(estado) {
    return estado === 'INACTIVO' ? '<span class="etiqueta roja">Inactivo</span>' : '<span class="etiqueta verde">Activo</span>';
  }

  /** Registros de una pestaña que aún no se enviaron (clave → PENDIENTE / ERROR / RECHAZADO) */
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

  /** Campo de formulario. op: { req, clase, tipo, ph, attrs, ayuda (HTML propio), area } */
  function campo(id, etiqueta, valor, op) {
    op = op || {};
    const v = valor == null ? '' : valor;
    const entrada = op.area
      ? '<textarea class="entrada" id="' + id + '" rows="2"' + (op.attrs || '') + '>' + esc(v) + '</textarea>'
      : '<input class="entrada" id="' + id + '" value="' + esc(v) + '"' + (op.tipo ? ' type="' + op.tipo + '"' : '') +
        (op.ph ? ' placeholder="' + esc(op.ph) + '"' : '') + (op.attrs || '') + '>';
    return '<div class="campo' + (op.clase ? ' ' + op.clase : '') + '"' + (op.idCampo ? ' id="' + op.idCampo + '"' : '') + '>' +
      '<label for="' + id + '">' + esc(etiqueta) + (op.req ? ' <span class="req">*</span>' : '') + '</label>' + entrada +
      (op.ayuda ? '<span class="ayuda">' + op.ayuda + '</span>' : '') + '</div>';
  }

  /** opciones: [[valor, texto], ...] */
  function lista(id, opciones, seleccionado, attrs) {
    return '<select class="entrada" id="' + id + '"' + (attrs || '') + '>' + opciones.map(o =>
      '<option value="' + esc(o[0]) + '"' + (mismo(o[0], seleccionado) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
  }

  function campoLista(id, etiqueta, opciones, seleccionado, op) {
    op = op || {};
    return '<div class="campo' + (op.clase ? ' ' + op.clase : '') + '"' + (op.idCampo ? ' id="' + op.idCampo + '"' : '') + '>' +
      '<label for="' + id + '">' + esc(etiqueta) + '</label>' + lista(id, opciones, seleccionado, op.attrs) +
      (op.ayuda ? '<span class="ayuda"' + (op.idAyuda ? ' id="' + op.idAyuda + '"' : '') + '>' + op.ayuda + '</span>' : '') + '</div>';
  }

  /** Muestra un error dentro del formulario. Devuelve false (así el modal no se cierra). */
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

  function hace(iso) {
    if (!iso) return 'Nunca';
    const t = Date.parse(iso);
    if (isNaN(t)) return '—';
    const d = Math.floor((Date.now() - t) / 86400000);
    return d <= 0 ? 'Hoy' : d === 1 ? 'Ayer' : 'Hace ' + d + ' días';
  }

  function claveTemporal() {
    const letras = 'abcdefghjkmnpqrstuvwxyz', numeros = '23456789';
    const r = crypto.getRandomValues(new Uint8Array(8));
    let s = '';
    for (let i = 0; i < 8; i++) s += (i < 5 ? letras[r[i] % letras.length] : numeros[r[i] % numeros.length]);
    return s;   // ej. "kmrta472": fácil de dictar
  }

  /** Crea un contenedor propio dentro de la pantalla (para no dejar eventos colgados en #contenido). */
  function contenedor(el) {
    const c = document.createElement('div');
    el.appendChild(c);
    return c;
  }

  function vacio(icono, texto, boton) {
    return '<div class="tarjeta vacio">' + ico(icono) + '<p>' + texto + '</p>' + (boton || '') + '</div>';
  }

  // ============================================================
  //  EMPRESAS
  // ============================================================
  const fEmp = { buscar: '', estado: 'ACTIVO' };

  App.pantalla('empresas', {
    refrescar: true,
    async render(el) {
      const u = Sesion.actual;
      const ag = esAG();
      const ctx = App.contexto;
      const empresas = (await Datos.listar('EMPRESAS')).filter(e => ag || mismo(e.id, u.empresa_id)).sort(porNombre);
      const sucursales = await Datos.listar('SUCURSALES', activo);
      const usuarios = await Datos.listar('USUARIOS', activo);
      const pend = await pendientesDe('EMPRESAS');
      const raiz = contenedor(el);

      raiz.innerHTML =
        '<div class="titulo"><div><h1>' + (ag ? 'Empresas' : 'Mi empresa') + '</h1>' +
        '<p>' + (ag ? 'Cada empresa tiene sus sucursales, usuarios, logo y colores.' : 'Datos, logo y colores de su empresa (se usan en la app y en los documentos impresos).') + '</p></div>' +
        (ag ? '<button class="btn btn-principal" data-acc="nueva">' + ico('building') + 'Nueva empresa</button>' : '') + '</div>' +
        (ag && empresas.length > 1 ? '<div class="filtros">' +
          '<div class="campo"><label for="feBuscar">Buscar</label><input class="entrada" id="feBuscar" placeholder="Nombre, código, NIT…" value="' + esc(fEmp.buscar) + '"></div>' +
          '<div class="campo corto"><label for="feEstado">Mostrar</label>' +
          lista('feEstado', [['ACTIVO', 'Activas'], ['INACTIVO', 'Inactivas'], ['TODAS', 'Todas']], fEmp.estado) + '</div></div>' : '') +
        '<div id="feLista"></div>';

      const pintar = () => {
        const b = minus(fEmp.buscar);
        const vista = empresas.filter(e => (!ag || empresas.length < 2 || fEmp.estado === 'TODAS' ||
          (fEmp.estado === 'INACTIVO') === (e.estado === 'INACTIVO')) && contiene(b, e.nombre, e.codigo, e.nit, e.encargado));
        $('#feLista', raiz).innerHTML = !empresas.length
          ? vacio('building', ag ? '<b>Todavía no hay empresas.</b><br>Cree la primera: se crea junto con su sucursal central.' : 'Su empresa no aparece. Sincronice o pida ayuda al administrador general.',
            ag ? '<button class="btn btn-principal" data-acc="nueva" style="margin-top:12px">' + ico('building') + 'Crear empresa</button>' : '')
          : !vista.length ? vacio('search', 'Ninguna empresa coincide con la búsqueda.')
          : '<div class="emp-lista">' + vista.map(e => tarjetaEmpresa(e, sucursales, usuarios, pend, ctx, ag)).join('') + '</div>';
      };
      pintar();

      const fb = $('#feBuscar', raiz), fe = $('#feEstado', raiz);
      if (fb) fb.oninput = () => { fEmp.buscar = fb.value; pintar(); };
      if (fe) fe.onchange = () => { fEmp.estado = fe.value; pintar(); };

      raiz.onclick = async ev => {
        const b = ev.target.closest('[data-acc]');
        if (!b) return;
        const id = b.dataset.id;
        const e = empresas.find(x => mismo(x.id, id));
        switch (b.dataset.acc) {
          case 'nueva': return formEmpresa(null);
          case 'editar': return formEmpresa(e);
          case 'sucursales': fSuc.empresaId = id; return App.ir('sucursales');
          case 'usar':
            await Sesion.actualizar({ empresa_activa: id, sucursal_activa: '' });
            await App.refrescarContexto();
            return App.aviso('Ahora trabaja en ' + e.nombre, 'ok');
          case 'estado': return cambiarEstadoEmpresa(e);
        }
      };
    }
  });

  function tarjetaEmpresa(e, sucursales, usuarios, pend, ctx, ag) {
    const c1 = App.colorValido(e.color_principal) || COLOR_1;
    const c2 = App.colorValido(e.color_secundario) || COLOR_2;
    const logo = e.logo_url ? App.urlImagen(e.logo_url) : 'icons/icon-192.png';
    const sucs = sucursales.filter(s => mismo(s.empresa_id, e.id));
    const central = sucs.find(s => s.es_central === 'SI');
    const nUsu = usuarios.filter(x => mismo(x.empresa_id, e.id)).length;
    const aqui = ctx.empresa && mismo(ctx.empresa.id, e.id);
    const inactiva = e.estado === 'INACTIVO';
    return '<div class="tarjeta emp-tarjeta' + (inactiva ? ' apagada' : '') + '">' +
      '<div class="banda" style="background:' + c1 + ';color:' + App.textoSobre(c1) + '">' +
      '<img src="' + esc(logo) + '" alt="" onerror="this.src=\'icons/icon-192.png\'">' +
      '<div style="min-width:0"><b>' + esc(e.nombre) + '</b><small>' + esc(e.slogan || '') + '</small></div></div>' +
      '<div class="linea" style="background:' + c2 + '"></div>' +
      '<div class="cuerpo-t">' +
      '<div class="dato"><span>Estado</span><b>' + etiquetaEstado(e.estado) + (aqui ? ' <span class="etiqueta naranja">Trabajando aquí</span>' : '') +
        etiquetaEnvio(pend[e.id]) + '</b></div>' +
      '<div class="dato"><span>Código</span><b>' + esc(e.codigo || '—') + '</b></div>' +
      '<div class="dato"><span>NIT</span><b>' + esc(e.nit || '—') + '</b></div>' +
      '<div class="dato"><span>Encargado</span><b>' + esc(e.encargado || '—') + '</b></div>' +
      '<div class="dato"><span>Teléfono</span><b>' + esc(e.telefono || '—') + '</b></div>' +
      '<div class="dato"><span>Sucursales activas</span><b>' + sucs.length + '</b></div>' +
      '<div class="dato"><span>Central</span><b>' + (central ? esc(central.nombre) : '<span class="etiqueta amarilla">Sin central</span>') + '</b></div>' +
      '<div class="dato"><span>Usuarios activos</span><b>' + nUsu + '</b></div>' +
      '</div>' +
      '<div class="acciones">' +
      '<button class="btn btn-chico btn-principal" data-acc="editar" data-id="' + esc(e.id) + '">Editar</button>' +
      '<button class="btn btn-chico btn-borde" data-acc="sucursales" data-id="' + esc(e.id) + '">' + ico('store') + 'Sucursales</button>' +
      (ag && !aqui && !inactiva ? '<button class="btn btn-chico btn-borde" data-acc="usar" data-id="' + esc(e.id) + '">Trabajar aquí</button>' : '') +
      (ag ? '<button class="btn btn-chico ' + (inactiva ? 'btn-borde' : 'btn-peligro') + '" data-acc="estado" data-id="' + esc(e.id) + '">' +
        (inactiva ? 'Activar' : 'Desactivar') + '</button>' : '') +
      '</div></div>';
  }

  async function cambiarEstadoEmpresa(e) {
    const activar = e.estado === 'INACTIVO';
    const ok = await App.confirmar(activar ? 'Activar empresa' : 'Desactivar empresa', activar
      ? '«' + e.nombre + '» volverá a aparecer en la app.'
      : '«' + e.nombre + '» dejará de aparecer en la app. No se borra nada y puede volver a activarla. ' +
        'Si quiere impedir que sus usuarios entren, desactívelos también en Usuarios.',
      activar ? 'Activar' : 'Desactivar', activar ? 'btn-principal' : 'btn-peligro');
    if (!ok) return;
    await Datos.guardar('EMPRESAS', { id: e.id, estado: activar ? 'ACTIVO' : 'INACTIVO' });
    App.aviso(activar ? 'Empresa activada' : 'Empresa desactivada', 'ok');
    await App.refrescarContexto();
  }

  function campoColor(id, etiqueta, valor, ayuda) {
    return '<div class="campo"><label for="' + id + '">' + esc(etiqueta) + '</label><div class="color-par">' +
      '<input type="color" id="' + id + 'Sel" value="' + esc(valor) + '" aria-label="Elegir ' + esc(etiqueta) + '">' +
      '<input class="entrada" id="' + id + '" value="' + esc(valor) + '" maxlength="7" spellcheck="false"></div>' +
      (ayuda ? '<span class="ayuda">' + ayuda + '</span>' : '') + '</div>';
  }

  async function formEmpresa(e) {
    const nueva = !e;
    e = e || {};
    const ag = esAG();
    const c1 = App.colorValido(e.color_principal) || COLOR_1;
    const c2 = App.colorValido(e.color_secundario) || COLOR_2;
    const html = '<div class="form-2">' +
      '<div class="seccion-form">Datos de la empresa</div>' +
      campo('eNombre', 'Nombre', e.nombre, { req: true, clase: 'todo', attrs: ' maxlength="80"' }) +
      campo('eCodigo', 'Código corto', e.codigo, { req: nueva, ph: 'Ej. FERR', attrs: ' maxlength="6" autocapitalize="characters" spellcheck="false"' + (ag ? '' : ' readonly'),
        ayuda: ag ? '2 a 6 letras MAYÚSCULAS o números. Sirve para el código de sus sucursales (ej. FERR01).' : 'Lo asigna el administrador general.' }) +
      campo('eNit', 'NIT', e.nit, { attrs: ' inputmode="numeric" maxlength="20"' }) +
      campo('eEncargado', 'Encargado / dueño', e.encargado) +
      campo('eTelefono', 'Teléfono', e.telefono, { tipo: 'tel' }) +
      campo('eDireccion', 'Dirección', e.direccion, { clase: 'todo' }) +
      campo('eSlogan', 'Slogan', e.slogan, { clase: 'todo', ph: 'Ej. Todo para su construcción', attrs: ' maxlength="80"' }) +
      campo('eDescripcion', 'Descripción', e.descripcion, { clase: 'todo', area: true }) +

      '<div class="seccion-form">Logo y colores</div>' +
      campo('eLogo', 'Enlace del logo', e.logo_url, { clase: 'todo', ph: 'https://drive.google.com/file/d/…', attrs: ' spellcheck="false"',
        ayuda: 'Suba la imagen a Google Drive → clic derecho → <b>Compartir</b> → Acceso general: <b>"Cualquier persona con el enlace"</b> → ' +
          '<b>Copiar enlace</b> → péguelo aquí. Mejor una imagen PNG cuadrada.' }) +
      campoColor('eColor1', 'Color principal', c1, 'Barra superior y encabezados.') +
      campoColor('eColor2', 'Color secundario', c2, 'Líneas y detalles.') +
      '<div class="campo todo"><label>Vista previa</label>' +
      '<div class="vista-barra" id="eVista"><img id="eVistaLogo" alt="" src="icons/icon-192.png"><div style="min-width:0"><b id="eVistaNom"></b><small id="eVistaSlo"></small></div></div>' +
      '<div class="vista-linea" id="eVistaLinea"></div>' +
      '<span class="ayuda" id="eVistaAyuda">Así se verá la barra superior y el encabezado de los documentos impresos.</span></div>' +

      (nueva ? '<div class="seccion-form">Sucursal central (depósito)</div>' +
        '<p class="nota todo">Toda empresa tiene una sucursal central. Se crea ahora junto con la empresa; después puede agregar más en <b>Sucursales</b>.</p>' +
        campo('eCenNombre', 'Nombre de la central', 'Central', { req: true }) +
        campo('eCenCodigo', 'Código de la central', '', { req: true, attrs: ' maxlength="10" autocapitalize="characters" spellcheck="false"',
          ayuda: 'Va en la numeración de documentos (ej. V-<b>FERR01</b>-D01-000001). No se cambia después.' }) : '') +

      (!nueva && ag ? '<div class="seccion-form">Estado</div>' +
        campoLista('eEstado', 'Estado', [['ACTIVO', 'Activa'], ['INACTIVO', 'Inactiva']], e.estado || 'ACTIVO') : '') +
      '</div><div class="f-msg"></div>';

    const f = modalAncho({
      titulo: nueva ? 'Nueva empresa' : 'Editar empresa',
      html: html,
      botones: [{ t: 'Cancelar' }, { t: nueva ? 'Crear empresa' : 'Guardar', clase: 'btn-principal', accion: m => guardarEmpresa(m, nueva ? null : e) }]
    });

    // ---- Vista previa en vivo ----
    const vista = () => {
      const col1 = App.colorValido($('#eColor1', f).value) || COLOR_1;
      const col2 = App.colorValido($('#eColor2', f).value) || COLOR_2;
      const v = $('#eVista', f);
      v.style.background = col1;
      v.style.color = App.textoSobre(col1);
      $('#eVistaLinea', f).style.background = col2;
      $('#eVistaNom', f).textContent = txt($('#eNombre', f).value) || 'Nombre de la empresa';
      $('#eVistaSlo', f).textContent = txt($('#eSlogan', f).value);
      const logo = txt($('#eLogo', f).value);
      const img = $('#eVistaLogo', f);
      const nuevaUrl = logo ? App.urlImagen(logo) : 'icons/icon-192.png';
      if (img.dataset.url !== nuevaUrl) {
        img.dataset.url = nuevaUrl;
        $('#eVistaAyuda', f).textContent = 'Así se verá la barra superior y el encabezado de los documentos impresos.';
        img.onerror = () => {
          img.onerror = null;
          img.src = 'icons/icon-192.png';
          if (logo) $('#eVistaAyuda', f).textContent = '⚠ No se pudo cargar el logo. Revise que el archivo de Drive esté compartido con "Cualquier persona con el enlace" (o que tenga internet).';
        };
        img.src = nuevaUrl;
      }
    };
    ['eColor1', 'eColor2'].forEach(id => {
      const sel = $('#' + id + 'Sel', f), tx = $('#' + id, f);
      sel.oninput = () => { tx.value = sel.value; vista(); };
      tx.oninput = () => { const c = App.colorValido(tx.value); if (c && c.length === 7) sel.value = c; vista(); };
    });
    ['eNombre', 'eSlogan', 'eLogo'].forEach(id => { $('#' + id, f).addEventListener('input', vista); });
    vista();

    // ---- Código en mayúsculas y código de la central sugerido ----
    const cod = $('#eCodigo', f), cen = $('#eCenCodigo', f);
    let cenTocado = false;
    if (cen) cen.oninput = () => { cenTocado = true; cen.value = cen.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
    cod.oninput = () => {
      cod.value = cod.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (cen && !cenTocado) cen.value = cod.value ? cod.value + '01' : '';
    };
  }

  async function guardarEmpresa(f, e) {
    try {
      const nueva = !e;
      const ag = esAG();
      const v = id => txt($('#' + id, f).value);
      const d = {
        nombre: v('eNombre'), nit: v('eNit'), encargado: v('eEncargado'), telefono: v('eTelefono'),
        direccion: v('eDireccion'), slogan: v('eSlogan'), descripcion: v('eDescripcion'), logo_url: v('eLogo'),
        color_principal: v('eColor1').toLowerCase(), color_secundario: v('eColor2').toLowerCase()
      };
      if (!d.nombre) return mensaje(f, 'Escriba el nombre de la empresa.');
      const empresas = await Datos.listar('EMPRESAS');
      const otras = empresas.filter(x => !e || !mismo(x.id, e.id));
      if (otras.some(x => minus(x.nombre) === minus(d.nombre))) return mensaje(f, 'Ya existe otra empresa con ese nombre.');
      if (d.color_principal && !RX_COLOR.test(d.color_principal)) return mensaje(f, 'El color principal debe tener la forma #0f132e.');
      if (d.color_secundario && !RX_COLOR.test(d.color_secundario)) return mensaje(f, 'El color secundario debe tener la forma #fe9f31.');
      if (d.logo_url && !/^https?:\/\//i.test(d.logo_url)) return mensaje(f, 'El enlace del logo debe empezar con https://');

      if (ag) {
        d.codigo = mayus(v('eCodigo'));
        if ((nueva || d.codigo) && !RX_COD_EMPRESA.test(d.codigo)) return mensaje(f, 'El código de la empresa debe tener de 2 a 6 letras MAYÚSCULAS o números (sin espacios).');
        if (d.codigo && otras.some(x => mayus(x.codigo) === d.codigo)) return mensaje(f, 'El código ' + d.codigo + ' ya lo usa otra empresa.');
      }

      if (nueva) {
        const cenNombre = v('eCenNombre');
        const cenCodigo = mayus(v('eCenCodigo'));
        if (!cenNombre) return mensaje(f, 'Escriba el nombre de la sucursal central.');
        if (!RX_COD_SUCURSAL.test(cenCodigo)) return mensaje(f, 'El código de la central debe tener de 2 a 10 letras MAYÚSCULAS o números.');
        const sucursales = await Datos.listar('SUCURSALES');
        if (sucursales.some(s => mayus(s.codigo) === cenCodigo)) return mensaje(f, 'El código de sucursal ' + cenCodigo + ' ya existe. Use otro.');
        const id = U.uuid();
        await Datos.guardarVarios([
          { tabla: 'EMPRESAS', fila: Object.assign({ id: id, estado: 'ACTIVO' }, d) },
          { tabla: 'SUCURSALES', fila: { id: U.uuid(), empresa_id: id, codigo: cenCodigo, nombre: cenNombre, direccion: d.direccion,
            telefono: d.telefono, encargado: d.encargado, es_central: 'SI', estado: 'ACTIVO' } }
        ]);
        if (!App.contexto.empresa) await Sesion.actualizar({ empresa_activa: id, sucursal_activa: '' });
        App.aviso('Empresa creada con su sucursal central', 'ok');
      } else {
        if (ag && $('#eEstado', f)) d.estado = $('#eEstado', f).value;
        await Datos.guardar('EMPRESAS', Object.assign({ id: e.id }, d));
        App.aviso('Empresa guardada', 'ok');
      }
      await App.refrescarContexto();
      return true;
    } catch (err) {
      console.error(err);
      return mensaje(f, err.message || String(err));
    }
  }

  // ============================================================
  //  SUCURSALES
  // ============================================================
  const fSuc = { empresaId: '', buscar: '', estado: 'ACTIVO' };

  /** Empresas que el usuario puede administrar (AG: activas; ADM: la suya) */
  async function empresasAdministrables() {
    const u = Sesion.actual;
    return (await Datos.listar('EMPRESAS')).filter(e => esAG() ? activo(e) : mismo(e.id, u.empresa_id)).sort(porNombre);
  }

  App.pantalla('sucursales', {
    refrescar: true,
    async render(el) {
      const u = Sesion.actual;
      const ag = esAG();
      const ctx = App.contexto;
      const empresas = await empresasAdministrables();
      let empId = ag ? (fSuc.empresaId || (ctx.empresa && ctx.empresa.id) || '') : u.empresa_id;
      if (!empresas.some(e => mismo(e.id, empId))) empId = empresas[0] ? empresas[0].id : '';
      fSuc.empresaId = empId;
      const empresa = empresas.find(e => mismo(e.id, empId)) || null;
      const raiz = contenedor(el);

      if (!empresa) {
        raiz.innerHTML = '<div class="titulo"><div><h1>Sucursales</h1></div></div>' +
          vacio('store', ag ? 'Primero cree una empresa.' : 'No se encontró su empresa. Sincronice e intente de nuevo.',
            ag ? '<a class="btn btn-principal" href="#/empresas" style="margin-top:12px">Ir a Empresas</a>' : '');
        return;
      }

      const todas = (await Datos.listar('SUCURSALES', s => mismo(s.empresa_id, empId))).sort(ordenSucursales);
      const usuarios = await Datos.listar('USUARIOS', x => activo(x) && mismo(x.empresa_id, empId));
      const asignaciones = await Datos.listar('USUARIO_SUCURSALES', activo);
      const pend = await pendientesDe('SUCURSALES');
      const central = todas.find(s => s.es_central === 'SI' && activo(s));
      const nAdmins = usuarios.filter(x => x.rol === ADM || x.rol === CON).length;
      const asignadosA = sid => usuarios.filter(x => ROLES_CON_SUCURSALES.indexOf(x.rol) >= 0 &&
        asignaciones.some(a => mismo(a.usuario_id, x.id) && mismo(a.sucursal_id, sid)));

      raiz.innerHTML =
        '<div class="titulo"><div><h1>Sucursales</h1><p>' + esc(empresa.nombre) + ' · la central es el depósito de la empresa.</p></div>' +
        '<button class="btn btn-principal" data-acc="nueva">' + ico('store') + 'Nueva sucursal</button></div>' +
        (!central && todas.some(activo) ? '<div class="msg msg-aviso">Esta empresa no tiene sucursal central. Use <b>Hacer central</b> en una de sus sucursales.</div>' : '') +
        '<div class="filtros">' +
        (ag && empresas.length > 1 ? '<div class="campo"><label for="fsEmp">Empresa</label>' +
          lista('fsEmp', empresas.map(e => [e.id, e.nombre]), empId) + '</div>' : '') +
        '<div class="campo"><label for="fsBuscar">Buscar</label><input class="entrada" id="fsBuscar" placeholder="Nombre, código, dirección…" value="' + esc(fSuc.buscar) + '"></div>' +
        '<div class="campo corto"><label for="fsEstado">Mostrar</label>' +
        lista('fsEstado', [['ACTIVO', 'Activas'], ['INACTIVO', 'Inactivas'], ['TODAS', 'Todas']], fSuc.estado) + '</div></div>' +
        '<div id="fsLista"></div>' +
        (nAdmins ? '<p class="nota">Además, ' + nAdmins + ' administrador(es)/contador(es) de la empresa ven todas las sucursales.</p>' : '');

      const pintar = () => {
        const b = minus(fSuc.buscar);
        const vista = todas.filter(s => (fSuc.estado === 'TODAS' || (fSuc.estado === 'INACTIVO') === (s.estado === 'INACTIVO')) &&
          contiene(b, s.nombre, s.codigo, s.direccion, s.encargado, s.telefono));
        $('#fsLista', raiz).innerHTML = !todas.length
          ? vacio('store', 'Esta empresa todavía no tiene sucursales.', '<button class="btn btn-principal" data-acc="nueva" style="margin-top:12px">Crear sucursal</button>')
          : !vista.length ? vacio('search', 'Ninguna sucursal coincide.')
          : '<div class="tabla-env"><table class="tabla"><thead><tr><th>Código</th><th>Sucursal</th><th>Teléfono</th><th>Encargado</th>' +
            '<th>Usuarios</th><th>Estado</th><th></th></tr></thead><tbody>' +
            vista.map(s => {
              const inactiva = s.estado === 'INACTIVO';
              const n = asignadosA(s.id);
              const aqui = ctx.sucursal && mismo(ctx.sucursal.id, s.id);
              return '<tr' + (inactiva ? ' class="inactivo"' : '') + '><td><b>' + esc(s.codigo || '—') + '</b></td>' +
                '<td><b>' + esc(s.nombre) + '</b>' + (s.es_central === 'SI' ? ' <span class="etiqueta naranja">Central</span>' : '') +
                (aqui ? ' <span class="etiqueta">Aquí trabaja</span>' : '') + etiquetaEnvio(pend[s.id]) +
                (s.direccion ? '<span class="sub">' + esc(s.direccion) + '</span>' : '') + '</td>' +
                '<td>' + esc(s.telefono || '—') + '</td><td>' + esc(s.encargado || '—') + '</td>' +
                '<td title="' + esc(n.map(x => x.nombre).join(', ')) + '">' + n.length + '</td>' +
                '<td>' + etiquetaEstado(s.estado) + '</td>' +
                '<td class="acc"><div class="acciones-fila">' +
                '<button class="btn btn-chico btn-borde" data-acc="editar" data-id="' + esc(s.id) + '">Editar</button>' +
                (!inactiva && s.es_central !== 'SI' ? '<button class="btn btn-chico btn-borde" data-acc="central" data-id="' + esc(s.id) + '">Hacer central</button>' : '') +
                (inactiva ? '<button class="btn btn-chico btn-borde" data-acc="estado" data-id="' + esc(s.id) + '">Activar</button>'
                  : s.es_central !== 'SI' ? '<button class="btn btn-chico btn-peligro" data-acc="estado" data-id="' + esc(s.id) + '">Desactivar</button>' : '') +
                '</div></td></tr>';
            }).join('') + '</tbody></table></div>';
      };
      pintar();

      const fb = $('#fsBuscar', raiz), fe = $('#fsEstado', raiz), fm = $('#fsEmp', raiz);
      fb.oninput = () => { fSuc.buscar = fb.value; pintar(); };
      fe.onchange = () => { fSuc.estado = fe.value; pintar(); };
      if (fm) fm.onchange = () => { fSuc.empresaId = fm.value; App.refrescarContexto(); };

      raiz.onclick = async ev => {
        const b = ev.target.closest('[data-acc]');
        if (!b) return;
        const s = todas.find(x => mismo(x.id, b.dataset.id));
        switch (b.dataset.acc) {
          case 'nueva': return formSucursal(null, empresa, todas, usuarios);
          case 'editar': return formSucursal(s, empresa, todas, usuarios);
          case 'central': return hacerCentral(s, central);
          case 'estado': return cambiarEstadoSucursal(s, asignadosA(s.id));
        }
      };
    }
  });

  /** Siguiente código: PREFIJO + 01, 02… (prefijo = código de la empresa, o SUC) */
  async function sugerirCodigoSucursal(empresa) {
    const prefijo = mayus(empresa.codigo) || 'SUC';
    const rx = new RegExp('^' + prefijo + '(\\d+)$');
    const usados = (await Datos.listar('SUCURSALES')).map(s => mayus(s.codigo));
    let n = 0;
    usados.forEach(c => { const m = rx.exec(c); if (m) n = Math.max(n, Number(m[1])); });
    let cod;
    do { n++; cod = prefijo + String(n).padStart(2, '0'); } while (usados.indexOf(cod) >= 0);
    return cod;
  }

  async function formSucursal(s, empresa, todas, usuarios) {
    const nueva = !s;
    s = s || {};
    const central = todas.find(x => x.es_central === 'SI' && activo(x));
    const esLaCentral = !nueva && central && mismo(central.id, s.id);
    const codigoFijo = !nueva && !!txt(s.codigo);
    const codigo = nueva ? await sugerirCodigoSucursal(empresa) : s.codigo;
    const marcarCentral = nueva ? !central : s.es_central === 'SI';
    const nombres = usuarios.map(x => x.nombre).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es'));

    const html = '<div class="form-2">' +
      campo('sNombre', 'Nombre', s.nombre, { req: true, ph: 'Ej. Sucursal Centro', attrs: ' maxlength="60"' }) +
      campo('sCodigo', 'Código', codigo, { req: true, attrs: ' maxlength="10" autocapitalize="characters" spellcheck="false"' + (codigoFijo ? ' readonly' : ''),
        ayuda: codigoFijo ? 'No se cambia: aparece en la numeración de los documentos.'
          : 'Único en todo el sistema. Va en la numeración (ej. V-<b>' + esc(codigo) + '</b>-D01-000001). Después no se cambia.' }) +
      campo('sDireccion', 'Dirección', s.direccion, { clase: 'todo' }) +
      campo('sTelefono', 'Teléfono', s.telefono, { tipo: 'tel' }) +
      campo('sEncargado', 'Encargado', s.encargado, { attrs: ' list="sEncLista" autocomplete="off"', ayuda: 'Escriba o elija un usuario.' }) +
      '<datalist id="sEncLista">' + nombres.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>' +
      '<div class="campo todo"><label class="check"><input type="checkbox" id="sCentral"' + (marcarCentral ? ' checked' : '') +
      (esLaCentral ? ' disabled' : '') + '><span><b>Es la sucursal central (depósito)</b>' +
      '<small>' + (esLaCentral ? 'Para cambiar la central, use "Hacer central" en otra sucursal.'
        : central ? 'Si la marca, reemplazará a «' + esc(central.nombre) + '» como central.'
        : 'La empresa no tiene central: se recomienda marcarla.') + '</small></span></label></div>' +
      (!nueva ? campoLista('sEstado', 'Estado', [['ACTIVO', 'Activa'], ['INACTIVO', 'Inactiva']], s.estado || 'ACTIVO',
        esLaCentral ? { attrs: ' disabled', ayuda: 'La central no se puede desactivar.' } : {}) : '') +
      '</div><div class="f-msg"></div>';

    const f = modalAncho({
      titulo: nueva ? 'Nueva sucursal · ' + empresa.nombre : 'Editar sucursal',
      html: html,
      botones: [{ t: 'Cancelar' }, { t: nueva ? 'Crear sucursal' : 'Guardar', clase: 'btn-principal',
        accion: m => guardarSucursal(m, nueva ? null : s, empresa, central, codigoFijo) }]
    });
    const c = $('#sCodigo', f);
    if (!codigoFijo) c.oninput = () => { c.value = c.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  }

  async function guardarSucursal(f, s, empresa, central, codigoFijo) {
    try {
      const nueva = !s;
      const v = id => txt($('#' + id, f).value);
      const d = { nombre: v('sNombre'), direccion: v('sDireccion'), telefono: v('sTelefono'), encargado: v('sEncargado'),
        es_central: $('#sCentral', f).checked ? 'SI' : 'NO' };
      if (!codigoFijo) d.codigo = mayus(v('sCodigo'));
      if (!d.nombre) return mensaje(f, 'Escriba el nombre de la sucursal.');
      const todas = await Datos.listar('SUCURSALES');
      const otras = todas.filter(x => !s || !mismo(x.id, s.id));
      if (otras.some(x => mismo(x.empresa_id, empresa.id) && minus(x.nombre) === minus(d.nombre))) {
        return mensaje(f, 'La empresa ya tiene una sucursal con ese nombre.');
      }
      if (!codigoFijo) {
        if (!RX_COD_SUCURSAL.test(d.codigo)) return mensaje(f, 'El código debe tener de 2 a 10 letras MAYÚSCULAS o números (sin espacios).');
        if (otras.some(x => mayus(x.codigo) === d.codigo)) return mensaje(f, 'El código ' + d.codigo + ' ya existe. Use otro.');
      }
      const estadoSel = $('#sEstado', f);
      const estado = nueva ? 'ACTIVO' : (estadoSel && !estadoSel.disabled ? estadoSel.value : (s.estado || 'ACTIVO'));
      if (d.es_central === 'SI' && estado === 'INACTIVO') return mensaje(f, 'La sucursal central no puede estar inactiva.');

      const registros = [];
      // Si pasa a ser central, la anterior deja de serlo (se envía primero)
      if (d.es_central === 'SI' && central && (nueva || !mismo(central.id, s.id))) {
        registros.push({ tabla: 'SUCURSALES', fila: { id: central.id, es_central: 'NO' } });
      }
      if (nueva) registros.push({ tabla: 'SUCURSALES', fila: Object.assign({ id: U.uuid(), empresa_id: empresa.id, estado: 'ACTIVO' }, d) });
      else registros.push({ tabla: 'SUCURSALES', fila: Object.assign({ id: s.id, estado: estado }, d) });
      await Datos.guardarVarios(registros);
      App.aviso(nueva ? 'Sucursal creada' : 'Sucursal guardada', 'ok');
      await App.refrescarContexto();
      return true;
    } catch (err) {
      console.error(err);
      return mensaje(f, err.message || String(err));
    }
  }

  async function hacerCentral(s, central) {
    const ok = await App.confirmar('Cambiar sucursal central', '«' + s.nombre + '» será la sucursal central (depósito) de la empresa.' +
      (central ? ' «' + central.nombre + '» dejará de serlo.' : ''), 'Hacer central');
    if (!ok) return;
    const registros = [];
    if (central) registros.push({ tabla: 'SUCURSALES', fila: { id: central.id, es_central: 'NO' } });
    registros.push({ tabla: 'SUCURSALES', fila: { id: s.id, es_central: 'SI' } });
    await Datos.guardarVarios(registros);
    App.aviso('«' + s.nombre + '» ahora es la central', 'ok');
    await App.refrescarContexto();
  }

  async function cambiarEstadoSucursal(s, asignados) {
    const activar = s.estado === 'INACTIVO';
    if (!activar && s.es_central === 'SI') { App.aviso('La central no se puede desactivar. Primero haga central a otra sucursal.', 'error', 6); return; }
    const ok = await App.confirmar(activar ? 'Activar sucursal' : 'Desactivar sucursal', activar
      ? '«' + s.nombre + '» volverá a estar disponible.'
      : '«' + s.nombre + '» dejará de aparecer para trabajar. No se borra nada (ventas, stock e historial se conservan) y puede volver a activarla.' +
        (asignados.length ? ' Tiene ' + asignados.length + ' usuario(s) asignado(s): ' + asignados.map(x => x.nombre).join(', ') + '.' : ''),
      activar ? 'Activar' : 'Desactivar', activar ? 'btn-principal' : 'btn-peligro');
    if (!ok) return;
    await Datos.guardar('SUCURSALES', { id: s.id, estado: activar ? 'ACTIVO' : 'INACTIVO' });
    App.aviso(activar ? 'Sucursal activada' : 'Sucursal desactivada', 'ok');
    await App.refrescarContexto();
  }

  // ============================================================
  //  USUARIOS (necesita internet para guardar)
  // ============================================================
  const fUsu = { empresaId: null, rol: '', estado: 'ACTIVO', buscar: '' };
  const SOLO_AG = '__AG__';

  App.pantalla('usuarios', {
    refrescar: true,
    async render(el) {
      const u = Sesion.actual;
      const ag = esAG();
      const ctx = App.contexto;
      const empresas = (await Datos.listar('EMPRESAS')).sort(porNombre);
      const nomEmpresa = id => { const e = empresas.find(x => mismo(x.id, id)); return e ? e.nombre : '—'; };
      const sucursales = await Datos.listar('SUCURSALES', activo);
      const asignaciones = await Datos.listar('USUARIO_SUCURSALES', activo);
      const usuarios = (await Datos.listar('USUARIOS')).filter(x => ag || mismo(x.empresa_id, u.empresa_id)).sort(porNombre);
      if (fUsu.empresaId === null) fUsu.empresaId = ag ? (ctx.empresa ? ctx.empresa.id : '') : u.empresa_id;
      const raiz = contenedor(el);

      const sucursalesDe = x => asignaciones.filter(a => mismo(a.usuario_id, x.id))
        .map(a => sucursales.find(s => mismo(s.id, a.sucursal_id))).filter(Boolean).sort(ordenSucursales);

      raiz.innerHTML =
        '<div class="titulo"><div><h1>Usuarios</h1><p>Cada usuario entra con su propio nombre y clave. ' +
        'Almacén y Vendedor trabajan solo en las sucursales que se les asignen.</p></div>' +
        '<button class="btn btn-principal" data-acc="nuevo">' + ico('users') + 'Nuevo usuario</button></div>' +
        avisoConexion() +
        '<div class="filtros">' +
        (ag ? '<div class="campo"><label for="fuEmp">Empresa</label>' +
          lista('fuEmp', [['', 'Todas']].concat(empresas.map(e => [e.id, e.nombre + (activo(e) ? '' : ' (inactiva)')]),
            [[SOLO_AG, 'Administradores generales']]), fUsu.empresaId) + '</div>' : '') +
        '<div class="campo"><label for="fuBuscar">Buscar</label><input class="entrada" id="fuBuscar" placeholder="Nombre, usuario, teléfono…" value="' + esc(fUsu.buscar) + '"></div>' +
        '<div class="campo corto"><label for="fuRol">Rol</label>' +
        lista('fuRol', [['', 'Todos']].concat((ag ? ROLES_TODOS : ROLES_TODOS.slice(1)).map(r => [r, nombreRol(r)])), fUsu.rol) + '</div>' +
        '<div class="campo corto"><label for="fuEstado">Mostrar</label>' +
        lista('fuEstado', [['ACTIVO', 'Activos'], ['INACTIVO', 'Inactivos'], ['TODOS', 'Todos']], fUsu.estado) + '</div></div>' +
        '<div id="fuLista"></div>';

      const pintar = () => {
        const b = minus(fUsu.buscar);
        const vista = usuarios.filter(x =>
          (!ag || !fUsu.empresaId || (fUsu.empresaId === SOLO_AG ? x.rol === AG : mismo(x.empresa_id, fUsu.empresaId))) &&
          (!fUsu.rol || x.rol === fUsu.rol) &&
          (fUsu.estado === 'TODOS' || (fUsu.estado === 'INACTIVO') === (x.estado === 'INACTIVO')) &&
          contiene(b, x.nombre, x.usuario, x.telefono, x.email));
        $('#fuLista', raiz).innerHTML = !vista.length ? vacio('users', usuarios.length ? 'Ningún usuario coincide.' : 'Todavía no hay usuarios.')
          : '<div class="tabla-env"><table class="tabla"><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th>' +
            (ag ? '<th>Empresa</th>' : '') + '<th>Sucursales</th><th>Último acceso</th><th>Estado</th><th></th></tr></thead><tbody>' +
            vista.map(x => {
              const yo = mismo(x.id, u.usuario_id);
              const inactivo = x.estado === 'INACTIVO';
              let sucs;
              if (x.rol === AG) sucs = 'Todas (todas las empresas)';
              else if (ROLES_CON_SUCURSALES.indexOf(x.rol) < 0) sucs = 'Todas las de la empresa';
              else {
                const l = sucursalesDe(x);
                sucs = l.length ? esc(l.map(s => s.nombre).join(', ')) : '<span class="etiqueta roja">Ninguna</span>';
              }
              return '<tr' + (inactivo ? ' class="inactivo"' : '') + '><td><b>' + esc(x.nombre) + '</b>' +
                (yo ? ' <span class="etiqueta naranja">Usted</span>' : '') +
                (x.debe_cambiar_clave === 'SI' ? '<span class="sub">Con clave temporal</span>' : '') +
                (x.telefono || x.email ? '<span class="sub">' + esc([x.telefono, x.email].filter(Boolean).join(' · ')) + '</span>' : '') + '</td>' +
                '<td>' + esc(x.usuario) + '</td><td>' + esc(nombreRol(x.rol)) + '</td>' +
                (ag ? '<td>' + (x.rol === AG ? '—' : esc(nomEmpresa(x.empresa_id))) + '</td>' : '') +
                '<td>' + sucs + '</td><td>' + esc(hace(x.ultimo_acceso_en)) + '</td><td>' + etiquetaEstado(x.estado) + '</td>' +
                '<td class="acc"><div class="acciones-fila">' +
                '<button class="btn btn-chico btn-borde" data-acc="editar" data-id="' + esc(x.id) + '">Editar</button>' +
                (!yo ? '<button class="btn btn-chico btn-borde" data-acc="clave" data-id="' + esc(x.id) + '">' + ico('lock') + 'Clave</button>' +
                  '<button class="btn btn-chico ' + (inactivo ? 'btn-borde' : 'btn-peligro') + '" data-acc="estado" data-id="' + esc(x.id) + '">' +
                  (inactivo ? 'Activar' : 'Desactivar') + '</button>' : '') +
                '</div></td></tr>';
            }).join('') + '</tbody></table></div>';
      };
      pintar();

      const fb = $('#fuBuscar', raiz), fr = $('#fuRol', raiz), fe = $('#fuEstado', raiz), fm = $('#fuEmp', raiz);
      fb.oninput = () => { fUsu.buscar = fb.value; pintar(); };
      fr.onchange = () => { fUsu.rol = fr.value; pintar(); };
      fe.onchange = () => { fUsu.estado = fe.value; pintar(); };
      if (fm) fm.onchange = () => { fUsu.empresaId = fm.value; pintar(); };

      raiz.onclick = async ev => {
        const b = ev.target.closest('[data-acc]');
        if (!b) return;
        const x = usuarios.find(y => mismo(y.id, b.dataset.id));
        switch (b.dataset.acc) {
          case 'nuevo': return formUsuario(null);
          case 'editar': return formUsuario(x);
          case 'clave': return claveUsuario(x);
          case 'estado': return cambiarEstadoUsuario(x);
        }
      };
    }
  });

  function avisoConexion() {
    if (!navigator.onLine) {
      return '<div class="msg msg-aviso">Sin internet: puede ver los usuarios, pero para <b>crearlos o modificarlos</b> necesita conexión.</div>';
    }
    if (!Sesion.actual.token) {
      return '<div class="msg msg-aviso">Su sesión en el servidor terminó. Para crear o modificar usuarios vuelva a iniciar sesión con internet.</div>';
    }
    return '';
  }

  /** Revisa conexión y sesión antes de llamar a la API. Devuelve el texto del problema o ''. */
  function problemaConexion() {
    if (!navigator.onLine) return 'Necesita internet para guardar usuarios.';
    if (!Sesion.actual.token) return 'Su sesión en el servidor terminó. Vuelva a iniciar sesión con internet (Mi cuenta → Cambiar de usuario).';
    return '';
  }

  /** Envía el usuario al servidor y actualiza la copia local. */
  async function enviarUsuario(datos) {
    const u = Sesion.actual;
    let r;
    try {
      r = await Api.llamar('guardarUsuario', datos, u.token, { segundos: 60 });
    } catch (e) {
      if (e.codigo === 'SESION_INVALIDA') {
        await Sesion.marcarSesionVencida();
        window.dispatchEvent(new CustomEvent('sync-estado'));
      }
      throw e;
    }
    await Sesion.local.guardarDelServidor({ USUARIOS: [r.usuario] }, false);
    // Trae las sucursales asignadas (USUARIO_SUCURSALES) desde el servidor
    if (Sync.corriendo) Sync.programar(3); else Sync.ejecutar();
    return r.usuario;
  }

  /** Datos completos de un usuario existente (para cambiar solo una cosa). */
  async function datosUsuario(x) {
    const asign = await Datos.listar('USUARIO_SUCURSALES', a => activo(a) && mismo(a.usuario_id, x.id));
    const sucs = await Datos.listar('SUCURSALES', activo);
    return {
      id: x.id, usuario: x.usuario, nombre: x.nombre, rol: x.rol, empresa_id: x.empresa_id || '',
      telefono: x.telefono || '', email: x.email || '', estado: x.estado || 'ACTIVO',
      sucursales: ROLES_CON_SUCURSALES.indexOf(x.rol) >= 0
        ? asign.map(a => String(a.sucursal_id)).filter(id => sucs.some(s => mismo(s.id, id))) : []
    };
  }

  function mostrarCredenciales(nombre, usuario, clave) {
    const enlace = location.origin + location.pathname;
    const texto = 'Usuario: ' + usuario + '\nClave temporal: ' + clave + '\nApp: ' + enlace;
    App.modal({
      titulo: 'Datos para entregar',
      html: '<p style="margin:0 0 12px;line-height:1.5">Entregue estos datos a <b>' + esc(nombre) + '</b>. ' +
        'Al entrar por primera vez, la app le pedirá que escriba una clave nueva.</p>' +
        '<div class="credenciales"><div class="dato"><span>Usuario</span><b>' + esc(usuario) + '</b></div>' +
        '<div class="dato"><span>Clave temporal</span><b class="mono">' + esc(clave) + '</b></div>' +
        '<div class="dato"><span>Dirección de la app</span><b style="font-size:12.5px">' + esc(enlace) + '</b></div></div>' +
        '<div class="msg msg-aviso">Anótela ahora: por seguridad no se vuelve a mostrar.</div>',
      botones: [
        { t: 'Copiar', accion: async () => {
          try { await navigator.clipboard.writeText(texto); App.aviso('Copiado', 'ok'); }
          catch (e) { App.aviso('No se pudo copiar. Anótelo a mano.', 'error'); }
          return false;
        } },
        { t: 'Listo', clase: 'btn-principal' }
      ]
    });
  }

  async function formUsuario(x) {
    const nuevo = !x;
    x = x || {};
    const u = Sesion.actual;
    const ag = esAG();
    const ctx = App.contexto;
    const yo = !nuevo && mismo(x.id, u.usuario_id);
    const roles = await Datos.listar('ROLES');
    const infoRol = r => roles.find(y => y.rol === r) || {};
    const permitidos = ag ? ROLES_TODOS : [ADM, ALM, VEN, CON];
    const empresas = (await Datos.listar('EMPRESAS')).filter(e => activo(e) || mismo(e.id, x.empresa_id)).sort(porNombre);
    const sucursales = (await Datos.listar('SUCURSALES', activo)).sort(ordenSucursales);
    const asignadas = nuevo ? [] : (await Datos.listar('USUARIO_SUCURSALES', a => activo(a) && mismo(a.usuario_id, x.id))).map(a => String(a.sucursal_id));
    let empIni = x.empresa_id || '';
    if (nuevo) {
      empIni = ag ? (fUsu.empresaId && fUsu.empresaId !== SOLO_AG ? fUsu.empresaId : (ctx.empresa ? ctx.empresa.id : '')) : u.empresa_id;
    }
    const rolIni = x.rol || (nuevo && fUsu.empresaId === SOLO_AG ? AG : VEN);
    const clave = nuevo ? claveTemporal() : '';

    const html = '<div class="form-2">' +
      (yo ? '<div class="msg msg-info todo">Está editando su propio usuario: no puede cambiar su rol, su estado ni su nombre de usuario. ' +
        'Para cambiar su clave use <b>Mi cuenta</b>.</div>' : '') +
      campo('uNombre', 'Nombre completo', x.nombre, { req: true, clase: 'todo', attrs: ' maxlength="80" autocomplete="off"' }) +
      campo('uUsuario', 'Usuario (para iniciar sesión)', x.usuario, { req: true, ph: 'ej. juan.perez',
        attrs: ' maxlength="30" autocapitalize="none" autocomplete="off" spellcheck="false"' + (yo ? ' readonly' : ''),
        ayuda: '3 a 30 letras minúsculas, números, punto o guion. Sin espacios.' }) +
      campo('uTelefono', 'Teléfono', x.telefono, { tipo: 'tel' }) +
      campo('uEmail', 'Correo', x.email, { tipo: 'email', clase: 'todo', attrs: ' autocomplete="off"' }) +
      campoLista('uRol', 'Rol', permitidos.map(r => [r, nombreRol(r)]), rolIni, { attrs: yo ? ' disabled' : '', idAyuda: 'uRolAyuda', ayuda: ' ' }) +
      (ag ? campoLista('uEmpresa', 'Empresa', [['', '— Elija —']].concat(empresas.map(e => [e.id, e.nombre])), empIni,
        { idCampo: 'uEmpCampo', attrs: yo ? ' disabled' : '' }) : '') +
      '<div class="campo todo" id="uSucBloque"></div>' +
      (!nuevo && !yo ? campoLista('uEstado', 'Estado', [['ACTIVO', 'Activo'], ['INACTIVO', 'Inactivo (no puede entrar)']], x.estado || 'ACTIVO') : '') +
      (nuevo
        ? '<div class="seccion-form">Clave</div>' +
          '<div class="campo todo"><label for="uClave">Clave temporal <span class="req">*</span></label><div class="con-boton">' +
          '<input class="entrada mono" id="uClave" value="' + esc(clave) + '" autocomplete="off" spellcheck="false">' +
          '<button type="button" class="btn btn-icono" id="uOtra" title="Generar otra" aria-label="Generar otra clave">' + ico('sync') + '</button></div>' +
          '<span class="ayuda">Mínimo ' + MIN_CLAVE + ' caracteres. Al entrar por primera vez, el usuario deberá cambiarla.</span></div>'
        : !yo
          ? '<div class="seccion-form">Clave</div><div class="campo todo"><label class="check"><input type="checkbox" id="uCambiaClave">' +
            '<span><b>Asignar una clave temporal nueva</b><small>Por ejemplo, si la olvidó. Se cerrará su sesión en todos los equipos.</small></span></label></div>' +
            '<div class="campo todo oculto" id="uClaveCampo"><label for="uClave">Clave temporal</label><div class="con-boton">' +
            '<input class="entrada mono" id="uClave" value="' + esc(claveTemporal()) + '" autocomplete="off" spellcheck="false">' +
            '<button type="button" class="btn btn-icono" id="uOtra" title="Generar otra" aria-label="Generar otra clave">' + ico('sync') + '</button></div></div>'
          : '') +
      '</div>' + (navigator.onLine ? '' : '<div class="msg msg-aviso">Sin internet: no podrá guardar hasta que vuelva la conexión.</div>') +
      '<div class="f-msg"></div>';

    const f = modalAncho({
      titulo: nuevo ? 'Nuevo usuario' : 'Editar usuario',
      html: html,
      botones: [{ t: 'Cancelar' }, { t: nuevo ? 'Crear usuario' : 'Guardar', clase: 'btn-principal', accion: m => guardarUsuario(m, nuevo ? null : x, yo) }]
    });

    const sRol = $('#uRol', f), sEmp = $('#uEmpresa', f), bloque = $('#uSucBloque', f);
    let marcadas = asignadas.slice();
    const leerMarcadas = () => { if ($$('input[name="uSuc"]', bloque).length) marcadas = $$('input[name="uSuc"]:checked', bloque).map(i => i.value); };

    const pintarRol = () => {
      leerMarcadas();
      const rol = sRol.value;
      const info = infoRol(rol);
      $('#uRolAyuda', f).textContent = (info.descripcion || '') +
        (rol !== AG ? ' Descuento máximo: ' + (Number(info.descuento_max_pct) || 0) + '%.' : '');
      if (sEmp) $('#uEmpCampo', f).classList.toggle('oculto', rol === AG);
      const empId = sEmp ? sEmp.value : u.empresa_id;
      if (rol === AG) {
        bloque.innerHTML = '<div class="msg msg-info" style="margin:0">El administrador general ve todas las empresas y sucursales.</div>';
      } else if (ROLES_CON_SUCURSALES.indexOf(rol) < 0) {
        bloque.innerHTML = '<div class="msg msg-info" style="margin:0">' + esc(nombreRol(rol)) + ' ve <b>todas</b> las sucursales de su empresa (no hace falta asignarlas).</div>';
      } else if (!empId) {
        bloque.innerHTML = '<label>Sucursales donde trabaja</label><div class="msg msg-aviso" style="margin:0">Primero elija la empresa.</div>';
      } else {
        const sucs = sucursales.filter(s => mismo(s.empresa_id, empId));
        bloque.innerHTML = '<label>Sucursales donde trabaja <span class="req">*</span></label>' +
          (sucs.length ? '<div class="checks">' + sucs.map(s => '<label class="check"><input type="checkbox" name="uSuc" value="' + esc(s.id) + '"' +
            (marcadas.indexOf(String(s.id)) >= 0 ? ' checked' : '') + '><span><b>' + esc(s.nombre) + '</b><small>' + esc(s.codigo || '') +
            (s.es_central === 'SI' ? ' · Central' : '') + '</small></span></label>').join('') + '</div>' +
            '<span class="ayuda">Puede marcar varias. Solo verá y registrará operaciones en estas sucursales.</span>'
            : '<div class="msg msg-aviso" style="margin:0">Esta empresa no tiene sucursales activas. Créelas primero en Sucursales.</div>');
      }
    };
    sRol.onchange = pintarRol;
    if (sEmp) sEmp.onchange = () => { marcadas = []; bloque.innerHTML = ''; pintarRol(); };
    pintarRol();

    const iu = $('#uUsuario', f);
    if (!yo) iu.oninput = () => { const p = iu.selectionStart; iu.value = iu.value.toLowerCase().replace(/\s/g, ''); iu.setSelectionRange(p, p); };
    // Sugerir usuario a partir del nombre (solo al crear y si no lo escribió)
    if (nuevo) {
      let tocado = false;
      iu.addEventListener('input', () => { tocado = true; });
      $('#uNombre', f).addEventListener('input', ev => {
        if (tocado) return;
        const partes = ev.target.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/);
        iu.value = partes.length > 1 ? (partes[0] + '.' + partes[1]).slice(0, 30) : (partes[0] || '');
      });
    }
    const otra = $('#uOtra', f);
    if (otra) otra.onclick = () => { $('#uClave', f).value = claveTemporal(); };
    const cc = $('#uCambiaClave', f);
    if (cc) cc.onchange = () => $('#uClaveCampo', f).classList.toggle('oculto', !cc.checked);
  }

  async function guardarUsuario(f, x, yo) {
    try {
      const nuevo = !x;
      const ag = esAG();
      const u = Sesion.actual;
      const v = id => ($('#' + id, f) ? txt($('#' + id, f).value) : '');
      const rol = yo ? x.rol : $('#uRol', f).value;
      const d = {
        usuario: yo ? x.usuario : minus(v('uUsuario')), nombre: v('uNombre'), telefono: v('uTelefono'), email: v('uEmail'),
        rol: rol, estado: yo ? 'ACTIVO' : (nuevo ? 'ACTIVO' : $('#uEstado', f).value), sucursales: []
      };
      if (!nuevo) d.id = x.id;
      if (!d.nombre) return mensaje(f, 'Escriba el nombre completo.');
      if (!RX_USUARIO.test(d.usuario)) return mensaje(f, 'El usuario debe tener de 3 a 30 letras minúsculas, números, punto o guion (sin espacios ni tildes).');
      const todos = await Datos.listar('USUARIOS');
      if (todos.some(y => minus(y.usuario) === d.usuario && (nuevo || !mismo(y.id, x.id)))) return mensaje(f, 'El usuario "' + d.usuario + '" ya existe. Elija otro.');
      if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) return mensaje(f, 'El correo no es válido.');
      if (!ag && rol === AG) return mensaje(f, 'No puede crear administradores generales.');

      if (rol !== AG) {
        d.empresa_id = ag ? (yo ? x.empresa_id : v('uEmpresa')) : u.empresa_id;
        if (!d.empresa_id) return mensaje(f, 'Elija la empresa del usuario.');
      }
      if (ROLES_CON_SUCURSALES.indexOf(rol) >= 0) {
        d.sucursales = $$('input[name="uSuc"]:checked', f).map(i => i.value);
        if (!d.sucursales.length) return mensaje(f, 'Marque al menos una sucursal donde trabaja.');
      }
      let clave = '';
      if (nuevo || ($('#uCambiaClave', f) && $('#uCambiaClave', f).checked)) {
        clave = v('uClave');
        if (clave.length < MIN_CLAVE) return mensaje(f, 'La clave debe tener al menos ' + MIN_CLAVE + ' caracteres.');
        d.clave = clave;
      }
      if (!nuevo && !yo && d.estado === 'INACTIVO' && x.estado !== 'INACTIVO' &&
          !(await App.confirmar('Desactivar usuario', d.nombre + ' ya no podrá entrar y se cerrará su sesión en todos los equipos.', 'Desactivar', 'btn-peligro'))) {
        return false;
      }
      const prob = problemaConexion();
      if (prob) return mensaje(f, prob);

      mensaje(f, 'Guardando en el servidor…', 'info');
      const guardado = await enviarUsuario(d);
      if (yo) await Sesion.actualizar({ nombre: guardado.nombre });
      App.aviso(nuevo ? 'Usuario creado' : 'Usuario guardado', 'ok');
      await App.refrescarContexto();
      if (clave) mostrarCredenciales(d.nombre, d.usuario, clave);
      return true;
    } catch (err) {
      console.error(err);
      return mensaje(f, err.message || String(err));
    }
  }

  async function claveUsuario(x) {
    const prob = problemaConexion();
    if (prob) { App.aviso(prob, 'error', 6); return; }
    const f = App.modal({
      titulo: 'Clave temporal para ' + x.nombre,
      html: '<p style="margin:0 0 12px;line-height:1.5">Use esto si el usuario olvidó su clave. Se cerrará su sesión en todos los equipos ' +
        'y al entrar deberá escribir una clave nueva.</p>' +
        '<div class="campo"><label for="kClave">Clave temporal</label><div class="con-boton">' +
        '<input class="entrada mono" id="kClave" value="' + esc(claveTemporal()) + '" autocomplete="off" spellcheck="false">' +
        '<button type="button" class="btn btn-icono" id="kOtra" title="Generar otra" aria-label="Generar otra clave">' + ico('sync') + '</button></div>' +
        '<span class="ayuda">Mínimo ' + MIN_CLAVE + ' caracteres.</span></div><div class="f-msg"></div>',
      botones: [{ t: 'Cancelar' }, { t: 'Asignar clave', clase: 'btn-principal', accion: async m => {
        try {
          const clave = txt($('#kClave', m).value);
          if (clave.length < MIN_CLAVE) return mensaje(m, 'La clave debe tener al menos ' + MIN_CLAVE + ' caracteres.');
          const p = problemaConexion();
          if (p) return mensaje(m, p);
          mensaje(m, 'Guardando en el servidor…', 'info');
          await enviarUsuario(Object.assign(await datosUsuario(x), { clave: clave }));
          App.aviso('Clave asignada', 'ok');
          await App.refrescarContexto();
          mostrarCredenciales(x.nombre, x.usuario, clave);
          return true;
        } catch (err) {
          return mensaje(m, err.message || String(err));
        }
      } }]
    });
    $('#kOtra', f).onclick = () => { $('#kClave', f).value = claveTemporal(); };
  }

  async function cambiarEstadoUsuario(x) {
    const prob = problemaConexion();
    if (prob) { App.aviso(prob, 'error', 6); return; }
    const activar = x.estado === 'INACTIVO';
    const ok = await App.confirmar(activar ? 'Activar usuario' : 'Desactivar usuario', activar
      ? x.nombre + ' podrá volver a entrar con su usuario y clave.'
      : x.nombre + ' ya no podrá entrar y se cerrará su sesión en todos los equipos. No se borra nada de lo que registró.',
      activar ? 'Activar' : 'Desactivar', activar ? 'btn-principal' : 'btn-peligro');
    if (!ok) return;
    App.cargando('Guardando en el servidor…');
    try {
      await enviarUsuario(Object.assign(await datosUsuario(x), { estado: activar ? 'ACTIVO' : 'INACTIVO' }));
      App.cargando(null);
      App.aviso(activar ? 'Usuario activado' : 'Usuario desactivado', 'ok');
      await App.refrescarContexto();
    } catch (err) {
      App.cargando(null);
      App.aviso(err.message || String(err), 'error', 7);
    }
  }

  // ============================================================
  //  DISPOSITIVOS
  // ============================================================
  const fDis = { empresaId: '', estado: 'TODOS', buscar: '' };

  App.pantalla('dispositivos', {
    refrescar: true,
    async render(el) {
      const u = Sesion.actual;
      const ag = esAG();
      const miId = await DB.Sistema.dispositivoId();
      const usuarios = await Datos.listar('USUARIOS');
      const usuario = id => usuarios.find(x => mismo(x.id, id));
      const sucursales = await Datos.listar('SUCURSALES');
      const nomSuc = id => { const s = sucursales.find(x => mismo(x.id, id)); return s ? s.nombre : ''; };
      const empresas = (await Datos.listar('EMPRESAS')).sort(porNombre);
      const pend = await pendientesDe('DISPOSITIVOS');
      const dispositivos = (await Datos.listar('DISPOSITIVOS'))
        .filter(d => ag || (usuario(d.usuario_id) && mismo(usuario(d.usuario_id).empresa_id, u.empresa_id)))
        .sort((a, b) => String(b.ultimo_sync_en || b.registrado_en || '').localeCompare(String(a.ultimo_sync_en || a.registrado_en || '')));
      const raiz = contenedor(el);

      raiz.innerHTML =
        '<div class="titulo"><div><h1>Dispositivos</h1><p>Celulares y computadoras donde se usó la app. ' +
        'Se registran solos la primera vez que alguien inicia sesión.</p></div></div>' +
        '<div class="msg msg-info"><b>Bloquear</b> un equipo (por ejemplo, si se perdió): ya no podrá iniciar sesión con internet ni enviar o recibir datos. ' +
        'Lo que tenga sin enviar se queda en ese equipo. El bloqueo se aplica en el servidor en unos minutos.</div>' +
        '<div class="filtros">' +
        (ag && empresas.length > 1 ? '<div class="campo"><label for="fdEmp">Empresa (del último usuario)</label>' +
          lista('fdEmp', [['', 'Todas']].concat(empresas.map(e => [e.id, e.nombre])), fDis.empresaId) + '</div>' : '') +
        '<div class="campo"><label for="fdBuscar">Buscar</label><input class="entrada" id="fdBuscar" placeholder="Código, nombre, usuario…" value="' + esc(fDis.buscar) + '"></div>' +
        '<div class="campo corto"><label for="fdEstado">Mostrar</label>' +
        lista('fdEstado', [['TODOS', 'Todos'], ['ACTIVO', 'Activos'], ['INACTIVO', 'Bloqueados']], fDis.estado) + '</div></div>' +
        '<div id="fdLista"></div>';

      const pintar = () => {
        const b = minus(fDis.buscar);
        const vista = dispositivos.filter(d => {
          const us = usuario(d.usuario_id);
          return (!fDis.empresaId || (us && mismo(us.empresa_id, fDis.empresaId))) &&
            (fDis.estado === 'TODOS' || (fDis.estado === 'INACTIVO') === (d.estado === 'INACTIVO')) &&
            contiene(b, d.codigo, d.nombre, us && us.nombre, us && us.usuario);
        });
        $('#fdLista', raiz).innerHTML = !vista.length ? vacio('phone', dispositivos.length ? 'Ningún equipo coincide.' : 'Todavía no hay equipos registrados.')
          : '<div class="tabla-env"><table class="tabla"><thead><tr><th>Código</th><th>Equipo</th><th>Último usuario</th>' +
            '<th>Última sincronización</th><th>Registrado</th><th>Estado</th><th></th></tr></thead><tbody>' +
            vista.map(d => {
              const us = usuario(d.usuario_id);
              const este = mismo(d.id, miId);
              const bloqueado = d.estado === 'INACTIVO';
              const dias = d.ultimo_sync_en ? Math.floor((Date.now() - Date.parse(d.ultimo_sync_en)) / 86400000) : null;
              return '<tr' + (bloqueado ? ' class="inactivo"' : '') + '><td><b>' + esc(d.codigo || '—') + '</b></td>' +
                '<td><b>' + esc(d.nombre || 'Equipo') + '</b>' + (este ? ' <span class="etiqueta naranja">Este equipo</span>' : '') +
                etiquetaEnvio(pend[d.id]) + '<span class="sub">' + esc(resumenNavegador(d.navegador)) + '</span></td>' +
                '<td>' + (us ? esc(us.nombre) + '<span class="sub">' + esc(us.usuario) + (nomSuc(d.sucursal_id) ? ' · ' + esc(nomSuc(d.sucursal_id)) : '') + '</span>' : '—') + '</td>' +
                '<td>' + esc(hace(d.ultimo_sync_en)) + (dias !== null && dias >= 7 && !bloqueado
                  ? ' <span class="etiqueta amarilla" title="Puede tener datos sin enviar">Revisar</span>' : '') +
                '<span class="sub">' + esc(d.ultimo_sync_en ? U.fechaCorta(d.ultimo_sync_en) : '') + '</span></td>' +
                '<td>' + esc(U.fechaCorta(d.registrado_en)) + '</td>' +
                '<td>' + (bloqueado ? '<span class="etiqueta roja">Bloqueado</span>' : '<span class="etiqueta verde">Activo</span>') + '</td>' +
                '<td class="acc">' + (este ? '' : '<button class="btn btn-chico ' + (bloqueado ? 'btn-borde' : 'btn-peligro') + '" data-acc="estado" data-id="' +
                  esc(d.id) + '">' + (bloqueado ? 'Desbloquear' : 'Bloquear') + '</button>') + '</td></tr>';
            }).join('') + '</tbody></table></div>';
      };
      pintar();

      const fb = $('#fdBuscar', raiz), fe = $('#fdEstado', raiz), fm = $('#fdEmp', raiz);
      fb.oninput = () => { fDis.buscar = fb.value; pintar(); };
      fe.onchange = () => { fDis.estado = fe.value; pintar(); };
      if (fm) fm.onchange = () => { fDis.empresaId = fm.value; pintar(); };

      raiz.onclick = async ev => {
        const b = ev.target.closest('[data-acc="estado"]');
        if (!b) return;
        const d = dispositivos.find(x => mismo(x.id, b.dataset.id));
        const desbloquear = d.estado === 'INACTIVO';
        const ok = await App.confirmar(desbloquear ? 'Desbloquear equipo' : 'Bloquear equipo', desbloquear
          ? '«' + (d.nombre || d.codigo) + '» (' + d.codigo + ') podrá volver a usarse.'
          : '«' + (d.nombre || d.codigo) + '» (' + d.codigo + ') ya no podrá iniciar sesión con internet ni sincronizar.',
          desbloquear ? 'Desbloquear' : 'Bloquear', desbloquear ? 'btn-principal' : 'btn-peligro');
        if (!ok) return;
        await Datos.guardar('DISPOSITIVOS', { id: d.id, estado: desbloquear ? 'ACTIVO' : 'INACTIVO' });
        App.aviso(desbloquear ? 'Equipo desbloqueado' : 'Equipo bloqueado', 'ok');
        await App.refrescarContexto();
      };
    }
  });

  function resumenNavegador(ua) {
    ua = String(ua || '');
    if (!ua) return '';
    const so = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows'
      : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : '';
    const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox'
      : /Safari\//.test(ua) ? 'Safari' : '';
    return [so, nav].filter(Boolean).join(' · ');
  }
})();
