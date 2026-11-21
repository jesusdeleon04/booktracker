# Identidad verbal

Guía de voz de la aplicación. Los textos centrales viven en `frontend/src/lib/copy.js`;
los títulos de las estanterías de recomendación, en `backend/services/recommender.py` (`plan`).

## Personalidad

Un espacio hecho por gente que lee, no un producto que se vende. Cálido sin ser empalagoso,
curioso sin dar lecciones, elegante sin solemnidad. Habla de tú, en español neutro y cuidado,
y trata a quien lo usa como a un lector adulto.

## Tono

- **Breve antes que bonito.** Una frase precisa vale más que un párrafo de metáforas.
- **Concreto antes que abstracto.** «La mesilla», «el lacre», «la primera línea»: objetos reales.
- **Honesto.** Nada se afirma si los datos no lo respaldan: nombres, autores, valoraciones y
  procedencias salen siempre de datos reales. Si un libro viene de Open Library, se dice.
- **Natural.** Si la frase no se diría en voz alta, se reescribe.

## Vocabulario

| Preferimos | Evitamos |
|---|---|
| libros, lecturas, estantes, mesilla | contenido, items, assets |
| valorar, valoración | calificar, rating |
| sugerencia, «quizá te interese» | recomendación del algoritmo, match, coincidencia |
| tertulia, amigos | red, seguidores, contactos |
| carta, sobre, lacre, correspondencia | mensaje, chat, bandeja |
| escrito, hoja, estudio | documento, nota, post |
| entrar, salir | iniciar/cerrar sesión (salvo en mensajes de error técnicos) |
| guardar, quitar | persistir, eliminar (solo en confirmaciones destructivas) |

**Palabras que no se repiten:** magia, historias, mundos, sueños, palabras, viaje, aventura.
**Expresiones vetadas:** «Descubre…», «Explora un mundo de…», «Todo lo que necesitas…»,
«¡Bienvenido de nuevo!», frases motivacionales, exclamaciones y emojis en la interfaz,
traducciones literales del inglés («Estás todo listo», «Hacer clic»).

## Voz por sección

| Sección | Voz | Ejemplo vigente |
|---|---|---|
| Mis libros | Curiosa, acompañante, reflexiva | «Hay libros que terminan en la última página. Otros se quedan contigo.» |
| Sugerencias | Conversación entre lectores; siempre con el porqué real | «Quizá te interese» · «Comparte ciencia ficción con «X», que valoraste con 5★.» |
| Poesía | Contemplativa y sensible | «Algunos versos encuentran su lugar mucho después de haber sido escritos.» |
| Writer's Studio | Libertad e intimidad | «No hace falta saber cómo empieza.» |
| Correspondencia | La más evocadora: misterio y calidez | «Hay cosas que merecen llegar en un sobre.» |
| Tertulia | Cercana y humana | «Quieren sumarte a su tertulia» |
| Cuenta | Regreso a un espacio propio, sin sentimentalismo | «Tu mesa sigue como la dejaste» |

## Criterios

- **Títulos:** 2 a 6 palabras; una idea; un solo énfasis en cursiva (`<em>`) sobre la palabra que carga el sentido. Sin punto final salvo que sea una frase completa.
- **Subtítulos:** una o dos frases; dicen qué hay y qué hace falta saber (de dónde sale, quién lo ve). Nunca repiten el título.
- **Botones:** verbo en infinitivo o sustantivo claro («Añadir libro», «Entrar», «Escribir una carta»). La personalidad va en el texto que los rodea, no en el control. Google siempre dice «Continuar con Google».
- **Errores:** primero qué ha pasado, después qué puede hacer la persona. Sin culpar, sin jerga («servidor», «token»), sin exclamaciones.
- **Estados vacíos:** una frase que nombre lo que falta con calidez + una acción concreta. Nunca «No hay datos».
- **Avisos (toasts):** una frase corta en pasado o presente; «Terminaste «X».», «Valoración guardada.».
- **Textos legales y de privacidad:** no se reescriben por estilo; solo se cambian por cambios de significado y con revisión.

## Pendiente

- Elegir el nombre definitivo. Mientras tanto, el nombre vive en `brand` (`copy.js`), en la
  página `Privacy.jsx`, en `index.html`, en `Wordmark` (`AppShell.jsx`, dividido en «Book» + «tracker»),
  en `poemPdf.js` y en el README.
- Correos transaccionales: los envía Supabase Auth con sus plantillas por defecto (no están en el
  repositorio). Hay que editarlos en el panel de Supabase cuando se fije el nombre.
