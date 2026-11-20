# Booktracker

Tu vida como lector en un solo lugar: biblioteca personal, descubrimiento de libros con recomendaciones explicadas y estadísticas de lectura. No es un lector de ebooks: es un cuaderno de lectura visual y editorial.

## Puesta en marcha

Requisitos: **Node 18+** y **Python 3.10+** (probado con Node 24 y Python 3.11).

```bash
npm run setup      # instala dependencias del frontend, de la raíz y de Python
npm run dev        # API en :5000 + interfaz en http://localhost:5173
```

Abre **http://localhost:5173**. La primera vez verás el onboarding.

Otros comandos:

```bash
npm start          # compila el frontend y lo sirve desde Flask en http://127.0.0.1:5000 (un solo proceso)
npm test           # tests del backend (no necesitan red)
```

### Configuración opcional (`backend/.env`)

Copia `backend/.env.example` a `backend/.env`. Todo funciona sin configurar nada.

| Variable | Para qué |
| --- | --- |
| `GOOGLE_BOOKS_API_KEY` | Clave gratuita de Google Books. Sin ella, la cuota anónima de Google suele estar agotada y la app usa Open Library (que funciona perfectamente, pero tiene menos sinopsis en español). La clave solo la usa el backend; nunca llega al navegador. |
| `BOOKTRACKER_CONTACT` | Email o URL que se añade al User-Agent hacia Open Library y Wikimedia (Wikisource, Wikidata, Wikipedia). **Muy recomendable para la poesía**: Wikimedia limita a unas 10 consultas por minuto a los clientes sin contacto y a unas 200 a los identificados. |
| `BOOKTRACKER_DATA_DIR` | Carpeta de la base de datos y la caché (por defecto `backend/data`). |

## Qué incluye

- **Onboarding tipo TikTok**: mosaico de portadas reales, selección visual de 18 géneros, preguntas «esto o aquello», un mazo de libros reales para deslizar (me atrae / paso / ya lo leí), autores y libros favoritos con búsqueda en vivo y la revelación de un **perfil literario** con arquetipo, géneros, temas y propósitos.
- **Biblioteca**: Leídos, Leyendo, Quiero leer y listas personalizadas (se crean tres de ejemplo). Vista de portadas o de lista, filtros por género y autor, orden por fecha, valoración, título, autor o año.
- **Ficha del libro**: portada, título, autores, sinopsis, géneros, temas, editorial, fecha, páginas, ISBN, idioma, estado, calificación por medias estrellas, fechas de inicio y fin, progreso por página, reseña y notas (se guardan solas), listas, edición manual, «Completar datos» desde las fuentes, eliminar con opción de deshacer y libros similares.
- **Añadir libros sin teclear datos**: `Ctrl K`, `/` o el botón «Añadir libro». Escribe título, autor o ISBN y elige un resultado; se importan portada, sinopsis, editorial, fecha, páginas, ISBN y categorías. La app detecta duplicados (por id, ISBN o título y autor normalizados, aunque cambie la traducción del título). Si un libro no existe en ningún catálogo, puedes añadirlo a mano.
- **Descubrir**: estanterías «Para ti», «Porque te gustó…», «Si te interesa [autor]», «Descubrimientos inesperados», «Clásicos que podrían gustarte» y «Fuera de tu zona de confort». Cada libro trae portada, autor, sinopsis y **por qué podría gustarte**. Además: exploración por estado de ánimo, género y tema, un **modo inmersivo** a pantalla completa y «No me interesa» para afinar.
- **Estadísticas**: libros y páginas por año, progreso del reto anual, leídos, en curso y pendientes, valoración media, la evolución mensual dibujada como una estantería, la evolución anual, los géneros y autores más leídos, la distribución de calificaciones y los récords del año.
- **Writer's Studio**: tu estudio de escritura con editor de máquina de escribir; se describe más abajo.
- **Biblioteca de poesía**: antología digital con poemas de fuentes reales, lector editorial, colección personal en Supabase y PDF; se describe más abajo.
- **Perfil**: arquetipo, afinidades, preferencias editables, géneros y autores favoritos, reto anual, tema **Noche** (oscuro) o **Papel** (claro), exportar e importar en JSON, repetir el onboarding y borrar los datos.
- Diseño responsive con barra de navegación inferior en móvil, transiciones entre pantallas, estados vacíos y notificaciones con «Deshacer».

## Writer's Studio (Estudio de escritura)

Una sección propia, en `/estudio`, para escribir tus textos: poemas, relatos, cartas, diario e ideas.

- **Biblioteca de escritos**: cada texto aparece como una pieza editorial con su portada, título, categoría, fechas de creación y de modificación, y descripción. Puedes buscar por título, filtrar por categoría y ordenar por última modificación, por fecha de creación (recientes o antiguos), por título o en un **orden personal** arrastrando las portadas. Un bloque «Continúa donde lo dejaste» muestra las últimas líneas que escribiste.
- **Editor de máquina de escribir**: una hoja crema que sale del rodillo, en letra mecanografiada (Courier Prime), con el cursor en tinta roja y una línea guía suave. Opcionalmente, la línea activa se mantiene a la altura de los ojos y suena la máquina (teclas, espacio, retorno de carro y campanilla), con sonido sintetizado que viene **desactivado** por defecto. Tiene contador de palabras, de caracteres y tiempo de lectura, y un **modo enfoque** a pantalla completa que oculta la interfaz (`Ctrl+Mayús+F`; `Esc` para salir). También ofrece tres tamaños de letra y descarga en `.txt`.
- **Guardado sin pérdidas**: cada cambio se copia al instante en el navegador y se guarda en el servidor poco después de dejar de escribir (`Ctrl+S` lo fuerza), con un indicador de estado. Si cierras la pestaña o te quedas sin conexión, al volver se recupera lo que no llegó a guardarse y se sincroniza. El cursor vuelve exactamente donde lo dejaste. Si el mismo escrito cambia en otra pestaña, se te pregunta qué versión conservar en lugar de sobrescribir. Crear un escrito es idempotente, de modo que un borrador nunca se duplica.
- **Categorías**: diez iniciales (Poesía, Pensamientos, Reflexiones, Relatos, Cuentos, Ensayos, Cartas, Diario, Ideas, Otros) que puedes crear, renombrar, recolorear y eliminar. Al eliminar una, eliges adónde se mudan sus escritos.
- **Portadas**: subes una imagen desde el dispositivo (en el móvil, desde la galería; las fotos grandes se reducen en el navegador), reutilizas una de tu biblioteca de imágenes del estudio o dejas el escrito sin imagen. En ese caso su portada es la primera página mecanografiada, con su título y sus primeras líneas.
- **Datos**: los textos se guardan en la misma base SQLite (`studio_writings`, `studio_categories` y `studio_images`) y las imágenes en `backend/data/uploads/studio/`. La exportación JSON del perfil incluye los escritos y las categorías. «Borrar todos mis datos» no toca el estudio.

## Biblioteca de poesía y antología digital

Una sección propia, en `/poesia`, con la personalidad del jardín a la hora azul (cielo azul, guirnaldas de luces y papel bajo la luna) dentro de la misma identidad.

- **Explorar**: poema del día (el mismo para todos ese día, libre en todas las jurisdicciones), autores destacados con retrato, temas, épocas, movimientos (Siglo de Oro, Romanticismo, Simbolismo, Modernismo, Generación del 27, Vanguardias…), poesía clásica, latinoamericana, universal y contemporánea, y descubrimientos al azar.
- **Búsqueda** por autor, título, fragmento de verso, tema, movimiento, época o idioma. La app interpreta la consulta («poemas de amor», «romanticismo», «poesía del siglo XIX en francés», «Neruda») y consulta cada fuente por separado.
- **Lector editorial**: respeta versos, estrofas, sangrías y puntuación originales. Ajustes de tamaño, papel (crema, marfil, sepia, pergamino, hora azul), tipografía, ancho del texto y alineación, que se recuerdan, y **modo concentración** a pantalla completa.
- **Mi colección de poesía**: guardar con categoría (Amor, Melancolía, Existencialismo, Naturaleza, Espiritualidad, Soledad, Otros y las tuyas), favoritos, notas personales fechadas, portada opcional, fecha de guardado, búsqueda y orden. Separada por completo del Writer's Studio.
- **PDF**: edición A5 en tres estilos (Clásico, Moderno, Mecanografiado) con tipografías libres incrustadas, colofón con la fuente, la atribución y el estado de derechos. Solo para textos libres.
- **Relación con el estudio**: «Escribir una reflexión» (crea un escrito con el poema citado si es libre, o solo la referencia si no) y «Crear un escrito inspirado»; el escrito enlaza al poema. En el editor, el botón de la luna abre la **Antología** para consultar tus poemas guardados mientras escribes.

### Fuentes

| Fuente | Qué aporta |
| --- | --- |
| [Wikisource](https://wikisource.org) (es, en, fr, de) | Textos de dominio público o con licencia libre, con su maquetación original. |
| [PoetryDB](https://poetrydb.org) | Poesía clásica en inglés (textos del Proyecto Gutenberg). |
| [Wikidata](https://www.wikidata.org) | Autores: fechas de nacimiento y muerte, retratos (Wikimedia Commons), movimientos, obras y referencias bibliográficas. |
| [Wikipedia](https://es.wikipedia.org) | Biografías breves de los autores. |

Las listas editoriales (destacados, secciones, movimientos) solo guardan identificadores de Wikidata verificados (`backend/services/poetry/curated.py`); fechas, retratos y derechos se consultan siempre en vivo y se guardan en caché.

### Derechos de autor

`backend/services/poetry/rights.py` decide, para la jurisdicción elegida (Internacional prudente, España, México, Colombia, Argentina, Chile, Perú, Uruguay, Venezuela, UE o EE. UU.), si un texto es **dominio público**, **licencia abierta**, **protegido** o **sin verificar**. Comprueba la muerte del autor y, si es una traducción, también la del traductor. No da nada por libre solo porque esté en internet. La API **nunca envía el texto** de una obra protegida o dudosa: muestra la referencia, la explicación y el enlace a la fuente, y no permite el PDF ni copiar el poema. En la nube solo se guarda el texto de poemas libres en todas las jurisdicciones; del resto, solo la referencia.

### Datos en Supabase

Migración en `supabase/migrations/20261120120000_poetry_library.sql`.

- **Catálogo compartido, sin duplicados**: `poetry_authors` y `poetry_poems` (único por fuente e id). Los usuarios autenticados pueden leerlo y añadir filas, pero no modificarlas.
- **Datos privados**: `poetry_categories`, `poetry_collection` (favorito, categoría, portada) y `poetry_notes`. Cada usuario solo ve y edita lo suyo (RLS).
- **Portadas**: bucket privado `poetry-covers`, con una carpeta por usuario y URLs firmadas.
- **Funciones RPC**: `poetry_save_poem` y `poetry_ensure_default_categories`. Usan `security invoker`, así que respetan RLS.

Sin sesión, la colección funciona en **modo invitado** (en este navegador). Al iniciar sesión puedes pasarla a tu cuenta.

## Identidad visual

La estética nace de cuatro fotografías de referencia: un escritorio de nogal con un libro abierto, un cuaderno escrito a pluma y un café; un escritor ante su máquina de escribir, en sepia, rodeado de hojas manuscritas; una biblioteca en un ático bajo guirnaldas de luces, y un jardín a la hora azul. De ahí salen:

- **Luz de lámpara**: un foco ámbar cálido desde arriba, viñeta en los bordes y vetas de madera muy sutiles. El ámbar es el color de acción y de «Leyendo».
- **Papel y tinta**: hojas crema para el perfil y la revelación del arquetipo (con letra capital y versalitas), cuadernos con renglones y letra manuscrita para tu reseña y tus notas, y notas «pegadas con cinta» con el porqué de cada recomendación.
- **Tipografía de libro**: Cormorant Garamond y EB Garamond para títulos y textos, Courier Prime (máquina de escribir) para etiquetas y Caveat para las anotaciones manuscritas.
- **Guirnaldas de luces** colgando sobre la bienvenida, el inicio y Descubrir, y portadas en **sepia** en la bienvenida.
- **Hora azul** como color secundario («Quiero leer») y **musgo** para «Leído».

Todos los colores y fuentes están definidos como variables en `frontend/src/styles.css`.

## Arquitectura

```
backend/                     Flask + SQLAlchemy + SQLite
  app.py                     app factory; en producción sirve frontend/dist
  config.py                  configuración (.env opcional)
  models.py                  User, Book, Shelf/ShelfItem (listas), ReaderProfile, Interaction
  routes/                    library.py (libros y listas), profile.py (perfil, onboarding, feedback, export/import),
                             discover.py (catálogo, recomendaciones, exploración, salud de las fuentes),
                             studio.py (Writer's Studio), poetry.py (biblioteca de poesía, solo lectura)
  services/
    http_client.py           GET con caché en SQLite (TTL), límite de concurrencia por host y "circuit breaker"
    sources.py               clientes de Open Library y Google Books → un formato común de libro
    catalog.py               búsqueda combinada, ISBN, deduplicación, enriquecimiento (obra canónica, autores latinizados)
    taxonomy.py              géneros, temas transversales, estados de ánimo y propósitos (fuente única, servida en /api/meta)
    taste.py                 modelo de gustos del lector a partir de todas las señales
    recommender.py           planificación, obtención, puntuación, diversidad y explicación de las recomendaciones
    users.py                 current_user(): único punto a cambiar para añadir autenticación
    poetry/                  rights.py (derechos por jurisdicción), wikisource.py (búsqueda en lote y extracción de versos),
                             poetrydb.py, wikidata.py (autores, obras, Wikipedia), curated.py, catalog.py (orquestación)
  tests/                     tests offline de la lógica principal y de la API
frontend/                    React 19 + Vite + Tailwind 4 + Motion + Zustand
  src/pages/                 Home, Onboarding, Discover, Feed (inmersivo), Explore, Library, ListDetail, BookDetail, Stats, Profile,
                             studio/ (Studio, Editor), poetry/ (Poetry, PoetrySearch, PoemView, PoetAuthor, PoetList, PoetryCollection)
  src/lib/poemPdf.js         PDF editorial (pdf-lib, carga diferida)
  src/lib/poetryCloud.js     colección de poesía: Supabase (con sesión) o este navegador (invitado)
  src/components/            book/ (Cover, BookPreview, RecCard…), search/ (paleta global), layout/, ui/
  src/store/useStore.js      estado global con actualizaciones optimistas
  src/lib/                   cliente de la API, estadísticas, formato y emparejamiento con la biblioteca
```

### Fuentes de datos

Se consultan **Open Library** y **Google Books** en paralelo y se fusionan los resultados. Si una fuente falla o agota su cuota, el *circuit breaker* la desactiva unos minutos y la otra sigue respondiendo. Todas las respuestas se guardan en caché (`backend/data/api_cache.db`), así que repetir una búsqueda o volver a Descubrir es instantáneo y respetuoso con los límites de las APIs.

### Cómo recomienda

1. **Perfil de gustos** (`taste.py`). Combina pesos por género, tema, materia y autor que salen de los géneros, preferencias, propósitos y autores del onboarding; de la biblioteca, según estado y calificación (un 5★ atrae mucho, un 1–2★ aleja y «Quiero leer» cuenta como intención), y de los gestos del mazo y de «No me interesa».
2. **Candidatos reales**. Cada estantería traduce su intención a consultas reales a las APIs: géneros principales, temas recurrentes, las materias de un libro ancla, la obra de un autor, géneros vecinos o géneros lejanos. Nunca se inventan títulos.
3. **Puntuación**. Afinidad de género y de tema, similitud del coseno entre las materias y palabras clave del libro y tu perfil, afinidad de autor, encaje con tus preferencias (extensión, época, ritmo, foco, complejidad) y calidad (lectores y valoraciones), menos las señales negativas. Como los **temas son transversales**, si lees filosofía existencialista y psicología, puede recomendarte ciencia ficción o novela que trate la conciencia o el absurdo.
4. **Diversidad y explicación**. Se limitan las repeticiones por autor y género, y cada recomendación lleva sus razones («Comparte existencialismo con *El extranjero*, que calificaste con 5★»).

El puntuador es una función pura `score_book(candidato, gustos)`, así que puede sustituirse por un modelo aprendido o por embeddings sin tocar la API ni la interfaz.

### Persistencia y autenticación

Los datos viven en `backend/data/booktracker.db` (SQLite) y persisten entre sesiones. Todas las tablas tienen `user_id` y todas las consultas pasan por `services/users.py::current_user()`. Para añadir cuentas reales (sesiones, JWT u OAuth) basta con cambiar esa función y añadir las rutas de login. La exportación e importación en JSON permite hacer copias de seguridad.

## Supabase

El frontend usa un cliente único de Supabase en `frontend/src/lib/supabase.js` (exporta `supabase`, `getSupabase()`, `supabaseConfig` y `checkSupabaseConnection()`). Hoy lo usa la **colección de poesía** (autenticación por email y contraseña, tablas con RLS y Storage). La biblioteca de libros y el estudio siguen en Flask + SQLite.

### Modo multiusuario (cuentas de Google o correo)

Por defecto la app es de un único usuario local, como siempre. Con `BOOKTRACKER_AUTH=supabase` (variables en `backend/.env.example`):

- El navegador inicia sesión con Supabase (Google o correo) y envía su token; el servidor lo valida con Supabase y crea el usuario la primera vez. Todas las rutas de datos exigen sesión y filtran por `user_id`, así que cada cuenta solo ve lo suyo.
- Los datos van a PostgreSQL de Supabase (`DATABASE_URL`, esquema en `supabase/migrations/20261121120000_app_data.sql`, con RLS activado y sin políticas: la API pública no puede leer esas tablas). Las portadas del estudio se guardan en la base de datos y se muestran con una URL impredecible.
- **Copia e importación**: «Exportar biblioteca» incluye libros, listas, perfil, escritos y portadas en un solo JSON. Al importar en una cuenta que ya tiene datos se pide confirmación antes de reemplazarlos.

- Configuración en `frontend/.env.local`, que está en `.gitignore`. La plantilla es `frontend/.env.example`. Solo admite la clave **publicable** (`sb_publishable_…`); el módulo se niega a arrancar si recibe una clave secreta.
- Servidor MCP de Supabase para Claude Code en `.mcp.json`, con alcance de proyecto y limitado a `project_ref=xoygqiwdvkpysiedeixr`. Hay que aprobarlo y autorizarlo una vez desde Claude Code (`/mcp`).

## Notas

- La versión anterior del proyecto («Biblioteca Intelectual Personal», con escritorio, ideas y canvas) se conserva intacta en `old_app/bip_v2/`.
- Los datos de Open Library son colaborativos: a veces una edición tiene una portada equivocada o la sinopsis está en otro idioma (la ficha lo indica). Desde la ficha puedes editar cualquier dato o pulsar «Completar datos».
