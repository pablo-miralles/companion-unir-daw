# Companion UNIR · DAW 1º

El companion funciona de dos formas:

## Cómo se guarda tu progreso (sin tecnicismos)

- **Se guarda solo.** Cada vez que marcas un tema, test o actividad, el cambio queda guardado en el navegador que estás usando (Chrome, Safari, Edge…). No hay botón de guardar ni hace falta cuenta.
- **Solo vive en ese navegador.** Si abres la página en otro ordenador, en el móvil, en otro navegador o en una ventana de incógnito, empezará vacía. Si borras el historial o los datos de navegación, también se pierde.
- **Haz una copia con un enlace.** En la pestaña **Progreso**, pulsa **Copiar enlace con mi progreso** y guárdalo (Favoritos, una nota, un correo a ti mismo…). Al abrir ese enlace en cualquier sitio recuperas el progreso tal como estaba al copiarlo. Cuando avances, copia uno nuevo.
- **Es privado.** El progreso va dentro del propio enlace, después de `#progreso=`, y esa parte nunca se envía a ningún servidor. Solo contiene qué temas has marcado y los contadores de tests y actividades; ni nombres, ni cuentas, ni documentos.

## Abrir `index.html`

Puedes hacer doble clic en `index.html`. En este modo no hace falta instalar nada y el progreso se guarda en el `localStorage` de ese navegador.

## Guardar los cambios en un archivo

Para que el progreso se guarde físicamente en `progress.json`:

1. Ejecuta `start-server.command` en macOS/Linux o `start-server.bat` en Windows.
2. Abre [http://127.0.0.1:4173/](http://127.0.0.1:4173/) en el navegador.

El archivo `progress.json` se crea al guardar el primer cambio. Si ya había progreso en el navegador, se copia automáticamente al arrancar el servidor por primera vez.

El panel no incluye temarios ni PDFs: conserva únicamente títulos, semanas, progreso y enlaces oficiales. Para compartirlo, incluye los archivos del proyecto salvo `progress.json`; cada compañero empezará con el panel vacío y podrá abrir `index.html` directamente o iniciar el servidor local. Los enlaces de cada tema abren su ruta exacta en el Visor de Campus y los de Cronograma/entregas abren Campus, así que requieren la sesión de Campus de cada persona.

Si alguna vez quieres compartir también un progreso concreto, copia `progress.json` junto al resto de archivos antes de comprimirlo.
