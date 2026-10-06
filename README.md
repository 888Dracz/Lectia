# 📚✨ Lectia · Lector

Lector de libros **para el celular**, inspirado en Moon+ Reader, con lectura
rápida, minijuegos para leer mejor, biblioteca con estanterías y respaldo
completo. Funciona sin conexión y se instala como una app más (PWA).

**Abrir la app:** <https://888dracz.github.io/lectia/>
(se publica sola cada vez que se fusiona a `main`).

## Qué puede hacer

### 📖 Lector
- Formatos: **EPUB, PDF, Word (.docx), TXT, Markdown, HTML, FB2 y cómics CBZ**.
- Pasar página tocando los bordes o **deslizando el dedo**; tocar el centro muestra los menús.
- **Brillo** deslizando el dedo arriba/abajo por el borde izquierdo.
- 8 temas de lectura: Día, Papel, Sepia, Menta, Atardecer, Noche, AMOLED y Luna.
- Tipografías (Literata, Lora, Merriweather, Atkinson Hyperlegible, Inter…), tamaño,
  interlineado, márgenes, sangría, justificado y separación silábica.
- Modo **páginas** o **desplazamiento** continuo.
- **PDF**: páginas originales con zoom (también con pellizco) y filtro nocturno, o
  **modo texto adaptable**.
- Índice, **marcadores**, **subrayados de colores con notas** (exportables), **búsqueda**,
  diccionario (RAE), copiar y compartir citas.
- **Escuchar** el libro en voz alta (voz del sistema), con velocidad y voz elegibles.
- Barra de estado con capítulo, página, hora, batería y porcentaje.
- Mantiene la pantalla encendida y recuerda dónde te quedaste en cada libro.

### 🗂️ Biblioteca
- Portadas reales (EPUB, PDF, FB2, CBZ) o portadas generadas con estilo.
- Vistas en **cuadrícula**, **estantes de madera** o **lista**; búsqueda y orden.
- Filtros (leyendo, por leer, terminados, favoritos) y **estanterías propias**.
- Tarjeta “Continuar leyendo” con el tiempo estimado para terminar.
- Agregar libros desde el selector de archivos, arrastrándolos (computadora) o con
  **Compartir → Lectia** desde otras apps de Android (con la app instalada).

### ⚡ Entrenar (dinámica de juegos)
- **Lectura rápida (RSVP)**: palabra a palabra con letra de enfoque, de 100 a 1200 ppm,
  en grupos de 1 a 3 palabras. Desde el lector empieza donde vas y te deja donde llegaste.
- **Test de velocidad**: mide tus palabras por minuto y la comprensión.
- **Palabra perdida**, **Ordena la frase**, **Destello** y **Tabla de Schulte**.
- Los juegos usan **el libro que elijas** (desde donde vas leyendo) o textos clásicos.
- **Polvo de hadas** ✨ (experiencia), niveles y rangos, **racha** de días, meta diaria,
  retos del día y **24 logros**.

### 📈 Progreso
Nivel, meta diaria, racha, retos, gráfico de la semana, calendario de lectura,
totales y evolución de tu velocidad.

### 🛟 Respaldo
En **Ajustes → Respaldo**:
- **Respaldo completo**: un `.zip` con tus libros, portadas, estanterías, posiciones,
  subrayados, notas, marcadores, ajustes, logros y estadísticas.
- **Solo datos**: lo mismo pero sin los archivos de los libros (muy liviano).
- Se puede **guardar en el teléfono o compartir** (Google Drive, correo…).
- **Restaurar** en cualquier dispositivo, **combinando** con lo que ya hay o **reemplazándolo**.

> Todo se guarda **solo en tu dispositivo** (IndexedDB). Haz respaldos de vez en
> cuando: si se borran los datos del navegador, la biblioteca solo se recupera
> desde un respaldo.

## Instalar en el celular

1. Abre <https://888dracz.github.io/lectia/> en Chrome (Android) o Safari (iPhone).
2. Android: menú ⋮ → **Instalar app** (o “Agregar a la pantalla principal”).
   iPhone: botón Compartir → **Agregar a inicio**.
3. Ábrela desde su ícono: funciona sin conexión y en Android aparece en el menú
   **Compartir** para enviarle libros desde el explorador de archivos, Drive, Telegram, etc.

## Desarrollo

Requiere Node 22.

```bash
npm install
npm run dev        # servidor de desarrollo (http://localhost:5173)
npm test           # pruebas (vitest)
npm run build      # typecheck + build de producción en dist/
npm run preview    # sirve el build en http://localhost:4173/lectia/
```

### Estructura

```
src/
  books/          # Formatos: epub, pdf (pdf.js), docx (mammoth), txt/md, html, fb2, cbz
  backup/         # Respaldo y restauración (.zip con fflate)
  games/          # Lógica de lectura rápida y generadores de minijuegos
  lib/            # IndexedDB, utilidades de texto, navegación y botón "atrás"
  store/          # Estado (zustand), gamificación (niveles, rachas, logros)
  ui/
    library/      # Biblioteca, estanterías, hoja de cada libro
    reader/       # Lector: vista paginada, PDF, voz, RSVP, subrayados, búsqueda
    games/        # Pantalla Entrenar y minijuegos
    progress/     # Estadísticas y logros
    settings/     # Ajustes y respaldo
  sw.ts           # Service worker: sin conexión + "Compartir → Lectia"
  styles/         # Sistema de diseño (temas claro/oscuro, colores de acento)
```

Las pruebas cubren los formatos (EPUB, TXT, Markdown, FB2, HTML, PDF), los
minijuegos, la lectura rápida, los niveles y rachas, y el respaldo.

### Publicación

`.github/workflows/deploy.yml` publica la app en GitHub Pages. En este
repositorio el entorno `github-pages` solo permite publicar desde la rama
`claude/health-app-cycle-exercise-nutrition-ejjv2a`, así que:

1. Cada push a `main` copia `main` en esa rama y lanza la publicación allí.
2. La publicación (pruebas + build + deploy) corre en esa rama.

Si se permite `main` en **Settings → Environments → github-pages → Deployment
branches**, se puede publicar directamente desde `main`.
`.github/workflows/ci.yml` corre pruebas y build en cada PR.
