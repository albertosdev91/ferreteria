/**
 * ============================================================
 *  CONFIGURACIÓN DE LA APP  —  este es el ÚNICO archivo que usted edita
 * ============================================================
 *  1. Pegue entre las comillas la URL de su API (termina en /exec).
 *     Ejemplo: 'https://script.google.com/macros/s/AKfy.../exec'
 *  2. Guarde el archivo (en GitHub: botón "Commit changes").
 *
 *  Si lo deja vacío, la app le pedirá la URL en la pantalla de inicio de sesión
 *  (solo para ese equipo).
 * ============================================================
 */
window.CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbyLewjDxEoYkzI26nK5FAaNfiNsJGbh2cyg64jb3qwkcx9EeMAAQaK5q4R6xExu1rri/exec',                       // ← PEGUE AQUÍ SU URL /exec

  NOMBRE_APP: 'Ferretería',
  VERSION_APP: '5.3.0',

  SYNC_CADA_MINUTOS: 5,              // sincronización automática cuando hay internet
  SYNC_LOTE: 500,                    // registros por envío (la API acepta hasta 2000)
  TIEMPO_ESPERA_SEG: 90              // tiempo máximo de espera de una respuesta del servidor
};
