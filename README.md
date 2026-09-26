# Companion UNIR · DAW 1º

El companion funciona de dos formas:

## Guardar o compartir el progreso con un enlace

El estado actual se codifica automáticamente después de `#progreso=` en la URL. Desde la pestaña **Progreso**, pulsa **Copiar enlace** para guardar ese punto exacto o enviárselo a otra persona. Al abrir el enlace, el progreso se restaura y queda guardado también en ese navegador.

El fragmento situado después de `#` no se envía al servidor ni a GitHub Pages. Solo contiene temas marcados y contadores de tests y actividades; no incluye nombres, cuentas ni documentos.

## Abrir `index.html`

Puedes hacer doble clic en `index.html`. En este modo no hace falta instalar nada y el progreso se guarda en el `localStorage` de ese navegador.

## Guardar los cambios en un archivo

Para que el progreso se guarde físicamente en `progress.json`:

1. Ejecuta `start-server.command` en macOS/Linux o `start-server.bat` en Windows.
2. Abre [http://127.0.0.1:4173/](http://127.0.0.1:4173/) en el navegador.

El archivo `progress.json` se crea al guardar el primer cambio. Si ya había progreso en el navegador, se copia automáticamente al arrancar el servidor por primera vez.

El panel no incluye temarios ni PDFs: conserva únicamente títulos, semanas, progreso y enlaces oficiales. Para compartirlo, incluye los archivos del proyecto salvo `progress.json`; cada compañero empezará con el panel vacío y podrá abrir `index.html` directamente o iniciar el servidor local. Los enlaces de cada tema abren su ruta exacta en el Visor de Campus y los de Cronograma/entregas abren Campus, así que requieren la sesión de Campus de cada persona.

Si alguna vez quieres compartir también un progreso concreto, copia `progress.json` junto al resto de archivos antes de comprimirlo.
