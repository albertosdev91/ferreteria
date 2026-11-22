# Fase 3 — App base (referencia para las próximas fases)

PWA en GitHub Pages. Sin librerías externas. Versión 3.0.0.

## Archivos
| Archivo | Qué hace |
|---|---|
| `index.html` | Página única. Carga los .js en orden. Las fases nuevas agregan su `<script>` al final. |
| `js/config.js` | **Único archivo que edita el usuario**: `API_URL` (…/exec). Si está vacío, la app la pide en el login (se guarda solo en ese equipo). |
| `js/db.js` | IndexedDB. `U` (utilidades) y `DB` (Sistema + Local por usuario). |
| `js/api.js` | `Api.llamar(accion, datos, token)` → POST text/plain. Errores con `.codigo` (+ `SIN_RED`, `SIN_URL`). |
| `js/sesion.js` | Login con/sin internet, cambio de clave, salir / cerrar sesión. |
| `js/sync.js` | `Sync` (subir → bajar) y `Datos` (API para pantallas). |
| `js/app.js` | Login, barra, menú por rol, pantallas Inicio / Alertas / Sincronización / Mi cuenta, registro de pantallas. |
| `sw.js` | Service worker: con internet trae lo nuevo; sin internet usa la copia. **Cada fase: subir `VERSION` y agregar sus archivos a `ARCHIVOS`.** |
| `css/app.css` | Estilos (pautas/diseno.md). Clases: `.btn .btn-principal .btn-azul .btn-borde .btn-peligro .btn-chico`, `.tarjeta`, `.rejilla`, `.dato`, `.tabla-env > table.tabla`, `.campo > label + .entrada`, `.msg-(error/ok/aviso/info)`, `.etiqueta(.verde/.roja/.amarilla/.naranja)`, `.titulo`. |
| `icons/` | 192, 512 y maskable 512 (azul marino + llave naranja). |

## Almacenamiento local
- `ferreteria_sistema`: `meta` (dispositivo_id, nombre_equipo, dispositivo_codigo, activo, abierta), `usuarios` (por usuario que entró en el equipo: token, sesión, huella PBKDF2 de la clave, empresa_activa, sucursal_activa), `correlativos` (`sucursal_id|tipo` → último número; compartido por todos los usuarios del equipo).
- `ferreteria_u_<usuario_id>` (una por usuario, para no mezclar permisos): `datos` (clave [tabla, clave]), `salida` (pendientes por enviar, uno por registro, se combinan si se edita dos veces), `meta` (servidor_en, ultimo_sync_en, seq).
- Clave de fila: `id`; excepto CONFIG→clave, ROLES→rol, LISTAS→`lista|codigo`, STOCK_ACTUAL→`sucursal_id|producto_id`.

## Inicio de sesión
- Con internet: siempre valida con el servidor (`login`), guarda token + huella de la clave + correlativos del servidor (se toma el mayor).
- Sin internet: solo usuarios que ya entraron en ese equipo (huella PBKDF2-SHA256, 100 000 vueltas). La primera vez requiere internet.
- `debe_cambiar_clave` → ventana obligatoria de cambio de clave.
- Primera entrada con internet → descarga completa antes de mostrar la app.
- "Cambiar de usuario" = bloquear (vuelve a entrar sin internet). "Cerrar sesión en este equipo" = logout en el servidor + borra la base local del usuario (solo si no hay pendientes).
- `SESION_INVALIDA` al sincronizar → se puede seguir trabajando; aviso arriba para volver a entrar con internet. `USUARIO_INACTIVO` / `DISPOSITIVO_BLOQUEADO` → se cierra.

## Sincronización (`Sync.ejecutar()`)
1. `sesion` (refresca rol y sucursales). 2. `subir` lo pendiente en lotes de 500 (orden de creación). OK/ACTUALIZADO/SIN_CAMBIOS/CONFLICTO → se quita; RECHAZADO/ERROR → queda con el motivo (pantalla Sincronización: reintentar / descartar). 3. Sube pendientes de otros usuarios del equipo con su propio token. 4. `bajar` desde `servidor_en` (vacío = completo; completo reemplaza la tabla, sin pisar pendientes).
- Automática: al abrir, al volver internet, al volver a la pestaña, cada 5 min y 3 s después de `Datos.guardar`.

## API para pantallas (fases 4+)
```js
App.pantalla('clientes', { refrescar: true, async render(el) { el.innerHTML = '…'; } });
// refrescar: true → se vuelve a dibujar cuando llegan datos nuevos
App.contexto.empresa / .sucursal / .empresas / .sucursales   // empresa y sucursal activas
Sesion.actual.rol, .usuario_id, .empresa_id, .sucursales, .descuento_max_pct, .dispositivo.codigo
Sesion.esRol('ADMINISTRADOR', 'ADMIN_GENERAL')

await Datos.listar('CLIENTES', c => c.estado === 'ACTIVO');
await Datos.obtener('PRODUCTOS', id);
await Datos.guardar('CLIENTES', { razon_social: 'X', empresa_id: App.contexto.empresa.id }); // crea id, creado_en/por, dispositivo_id, actualizado_en/por
await Datos.guardarVarios([{ tabla: 'VENTAS', fila: {...} }, { tabla: 'VENTAS_DETALLE', fila: {...} }, { tabla: 'MOVIMIENTOS', fila: {...} }]); // todo o nada
await Datos.anular('VENTAS', id, 'motivo');
await Datos.numero('V', sucursalId);        // 'V-SUC01-D02-000015'
await Datos.stock(sucursalId, productoId);  // STOCK_ACTUAL + movimientos locales aún no enviados
await Datos.config('dias_vencimiento_cotizacion', '7');
await Datos.lista('METODO_PAGO');           // filas de LISTAS ordenadas

App.aviso('Guardado', 'ok'); App.modal({ titulo, html, botones: [{ t, clase, accion }] });
await App.confirmar('Título', 'Texto', 'Sí'); App.cargando('texto') / App.cargando(null);
App.ico('box');  App.urlImagen(url)  // acepta enlaces de Google Drive
U.uuid(), U.ahoraISO(), U.fechaCorta(iso), U.bs(n), U.esc(texto)
```
- Para habilitar una pantalla del menú: registrarla con `App.pantalla(id, …)`; la etiqueta "Fase N" desaparece sola. Roles del menú en `MENU` (app.js).
- La barra superior usa `color_principal` y `logo_url` de la empresa activa (si no hay, azul marino y el ícono de la app).
