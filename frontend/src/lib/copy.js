/**
 * Catálogo central de textos de la interfaz.
 *
 * Aquí viven los textos que se repiten o que definen la voz de cada sección:
 * marca, acceso a la cuenta, encabezados, estados vacíos y avisos. El resto de
 * cadenas (etiquetas de formulario, atributos de accesibilidad…) se quedan
 * junto al componente que las usa porque no se reutilizan.
 *
 * Reglas de voz (resumen; la guía completa está en docs/identidad-verbal.md):
 *  - Cada sección habla con su propia voz, pero siempre en español natural.
 *  - Los controles (botones, enlaces) son claros primero y con personalidad después.
 *  - Nunca se afirma nada que los datos no respalden: nombres, autores, gustos y
 *    procedencias salen siempre de datos reales.
 *
 * El nombre de la aplicación está provisional: se cambia solo aquí (y en los
 * recursos estáticos) cuando se elija el definitivo.
 */

export const brand = {
  name: 'Booktracker',
  /** Texto que se lee en voz alta para el enlace del logotipo. */
  homeLabel: 'Booktracker, inicio',
}

/* ------------------------------------------------------------------ */
/* Acceso a la cuenta                                                  */
/* ------------------------------------------------------------------ */

export const auth = {
  login: {
    title: ['Tu mesa sigue', 'como la dejaste'], // [texto, énfasis]
    subtitle: 'Tu biblioteca, tus escritos y tu poesía te esperan. Si es tu primera vez, preparamos una mesa nueva. Lo tuyo es solo tuyo, salvo lo que decidas compartir.',
    google: 'Continuar con Google',
    withEmail: 'Entrar con correo y contraseña',
    footnote: 'Solo guardamos tu correo y tu nombre para reconocerte. Puedes borrar tus datos desde tu perfil.',
  },
  dialog: {
    titles: { in: 'Vuelve a tu mesa', up: 'Prepara tu mesa', reset: 'Recuperar el acceso' },
    intro: {
      in: 'Tu biblioteca, tus escritos y tu poesía viven en tu cuenta y te siguen a cualquier dispositivo.',
      up: 'Con una cuenta, tu biblioteca, tus escritos y tu poesía te siguen a cualquier dispositivo. Solo tú los ves, salvo lo que decidas compartir.',
      reset: 'Escribe el correo de tu cuenta y te enviamos un enlace para elegir otra contraseña.',
    },
    or: 'o con tu correo',
    email: 'Correo electrónico',
    password: 'Contraseña',
    passwordHint: 'Al menos 6 caracteres.',
    submit: { in: 'Entrar', up: 'Crear cuenta', reset: 'Enviar enlace' },
    switchToIn: 'Ya tengo cuenta',
    switchToUp: 'Aún no tengo cuenta',
    forgot: 'No recuerdo mi contraseña',
    sentTitle: 'Te hemos escrito',
    sentConfirm: (email) => `Hemos enviado un enlace a ${email}. Ábrelo para confirmar tu cuenta y vuelve aquí a entrar.`,
    sentReset: (email) => `Si hay una cuenta con ${email}, le llegará un enlace para elegir otra contraseña. Si no lo ves, mira también en el spam.`,
    back: 'Volver a entrar',
  },
  newPassword: {
    title: 'Una contraseña nueva',
    label: 'Contraseña nueva',
    save: 'Guardar contraseña',
    done: 'Contraseña cambiada.',
  },
  account: {
    unavailable: 'Las cuentas no están configuradas: tu colección se guarda solo en este navegador.',
    checking: 'Comprobando tu sesión…',
    synced: (email) => `Sincronizada con tu cuenta (${email}).`,
    guest: 'Estás de invitado: tu colección vive solo en este navegador. Entra con tu cuenta para llevarla a todos tus dispositivos.',
    signIn: 'Entrar',
    signOut: 'Salir',
    moved: (n) => `${n} ${n === 1 ? 'poema guardado' : 'poemas guardados'} en tu cuenta.`,
    moveFailed: (msg) => `No hemos podido pasarlos: ${msg}`,
  },
  /** Traducción de los fallos del servicio de cuentas. */
  errors: {
    credentials: 'El correo o la contraseña no coinciden.',
    unconfirmed: 'Falta confirmar tu correo: al registrarte te enviamos un enlace.',
    exists: 'Ese correo ya tiene una cuenta. Prueba a entrar con él.',
    weak: 'La contraseña es muy corta: necesita al menos 6 caracteres.',
    rateLimit: 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.',
    offline: 'No hemos podido conectar con el servicio de cuentas. Revisa tu conexión.',
    generic: 'Algo ha fallado y no hemos podido completarlo. Inténtalo de nuevo.',
  },
}

/* ------------------------------------------------------------------ */
/* Mis libros (inicio, biblioteca, ficha)                              */
/* ------------------------------------------------------------------ */

export const books = {
  home: {
    reading: { kicker: 'En la mesilla', title: 'Lo que tienes abierto' },
    next: { kicker: 'Para seguir leyendo', title: 'Quizá este sea el siguiente', more: 'Ver más sugerencias' },
    wantKicker: (n) => `${n} esperando turno`,
    recent: { kicker: 'Diario de lectura', title: 'Lo último que terminaste' },
    firstEmpty: {
      title: 'Todavía no hay libros en tus estantes',
      body: 'Busca por título, autor o ISBN y traemos la portada, la sinopsis y los datos. Tú decides en qué estante se queda.',
      add: 'Añadir mi primer libro',
      discover: 'Ver sugerencias',
    },
    nothingOpen: '¿Hay algo en la mesilla? Márcalo como «Leyendo» y aquí seguirás su progreso.',
    challenge: {
      done: (n) => `Meta cumplida: ${n} ${n === 1 ? 'libro' : 'libros'} este año.`,
      left: (n) => `${n === 1 ? 'Falta 1 libro' : `Faltan ${n} libros`} para tu meta del año.`,
    },
    headline: {
      reading: (n) => ({ lead: 'Tienes', em: n === 1 ? 'un libro' : `${n} libros`, tail: n === 1 ? 'abierto.' : 'abiertos.' }),
      shelved: { lead: '¿Qué', em: 'empezamos', tail: 'hoy?' },
      empty: { lead: 'Tu', em: 'biblioteca', tail: 'empieza hoy.' },
    },
  },
  library: {
    title: ['Tus', 'libros'],
    sub: 'Hay libros que terminan en la última página. Otros se quedan contigo.',
    kicker: (c) => `${c.all} ${c.all === 1 ? 'libro' : 'libros'} · ${c.read} ${c.read === 1 ? 'leído' : 'leídos'} · ${c.reading} leyendo · ${c.want} esperando turno`,
    empty: {
      all: ['Tu biblioteca está esperando', 'Añade el libro que tienes en la mesilla, o el que te cambió la vida. Nosotros traemos la portada y los datos.'],
      reading: ['Ahora mismo no lees nada', 'Cuando empieces un libro, márcalo como «Leyendo» y seguiremos tu progreso página a página.'],
      read: ['Todavía no has cerrado ningún libro', 'Los que termines aparecerán aquí, con tu valoración y tu reseña.'],
      want: ['Nada esperando turno', 'Guarda aquí lo que quieras leer algún día. En Descubrir hay por dónde empezar.'],
    },
  },
  detail: {
    finished: 'Terminado. Cuéntanos qué te pareció cuando quieras.',
    rating: 'Tu valoración',
  },
  toasts: {
    finished: (title) => `Terminaste «${title}».`,
    ratingSaved: 'Valoración guardada.',
    dismissed: 'Entendido: no volveremos a sugerirlo.',
    added: (title, shelf) => `«${title}» añadido a ${shelf}.`,
  },
  stats: {
    empty: { title: 'Todavía no hay nada que contar', body: 'Cuando termines algún libro, aquí verás cómo lees: géneros, autores, páginas, ritmo y récords.' },
    sinceYouStarted: 'desde que llevas la cuenta',
  },
  profile: {
    title: ['Tu manera de', 'leer'],
    genresHead: ['Géneros favoritos', 'Lo que más te llama'],
    basedOn: (signals, n) => `A partir de ${signals} señales y ${n} ${n === 1 ? 'libro' : 'libros'} de tu biblioteca`,
  },
}

/* ------------------------------------------------------------------ */
/* Recomendaciones y descubrimiento                                    */
/* ------------------------------------------------------------------ */

export const discover = {
  kicker: 'Entre lectores',
  profileKicker: (archetype) => `Según tu perfil · ${archetype}`,
  title: ['Quizá', 'te interese'],
  subWithSignals: 'Salen de catálogos reales y cada uno trae su porqué: tus géneros, tus temas, tus autores y lo que has valorado.',
  subNoSignals: 'Cuando añadas libros o completes tu perfil, estas sugerencias empezarán a parecerse a ti.',
  topPick: 'el que más encaja contigo',
  another: 'Otras ideas',
  anotherHint: 'Pedir otra tanda de sugerencias',
  sectionFailed: (err) => `Esta estantería no ha podido cargar ahora (${err}). Prueba de nuevo en un rato.`,
  moods: {
    kicker: 'Por ánimo',
    title: '¿Qué ánimo traes hoy?',
    sub: 'Elige uno y buscamos libros reales que le vayan, ajustados a tus gustos.',
  },
  immersive: {
    loading: 'Preparando tus sugerencias…',
    loadingSub: 'Buscando en catálogos reales según tu perfil.',
    end: 'Has llegado al final… por ahora.',
    endSub: 'Valora lo que leas y vuelve: las sugerencias se ajustarán.',
  },
}

/* ------------------------------------------------------------------ */
/* Poesía                                                              */
/* ------------------------------------------------------------------ */

export const poetry = {
  kicker: 'Biblioteca de poesía',
  title: ['Versos para', 'leer despacio'],
  sub: 'Algunos versos encuentran su lugar mucho después de haber sido escritos.',
  collection: { title: ['Lo que has', 'guardado'], emptyTitle: 'Tu antología personal empieza aquí' },
}

/* ------------------------------------------------------------------ */
/* Writer's Studio                                                     */
/* ------------------------------------------------------------------ */

export const studio = {
  kicker: "Writer's Studio",
  title: ['Tu estudio, a', 'puerta cerrada'],
  subEmpty: 'Para lo que aún no tiene destino: poemas, relatos, cartas, ideas sueltas.',
  empty: {
    title: 'No hace falta saber cómo empieza.',
    body: 'Basta con escribir la primera línea. Poemas, relatos, cartas que nunca enviarás, ideas de medianoche: todo se guarda solo mientras escribes, y vuelves exactamente donde lo dejaste.',
    cta: 'Empezar a escribir',
  },
}

/* ------------------------------------------------------------------ */
/* Correspondencia y tertulia                                          */
/* ------------------------------------------------------------------ */

export const letters = {
  kicker: 'Correspondencia',
  title: ['Hay cosas que merecen llegar', 'en un sobre'],
  sub: 'Lo que te escriben tus amigos llega cerrado con lacre. Ábrelo cuando tengas un momento para leerlo con calma.',
}

export const publish = {
  action: 'Publicar en Tertulia',
  manage: 'Publicado en Tertulia',
  title: 'Publicar en Tertulia',
  intro: 'Esto es lo que verán. Tu escrito se publica tal cual: con su título, su categoría, sus saltos de línea y su portada.',
  titleLabel: 'Título',
  introLabel: 'Unas palabras de presentación (opcional)',
  introPlaceholder: 'Puedes dejarlo vacío: el escrito habla solo.',
  audience: '¿Quién puede leerlo?',
  audienceNote: 'La audiencia no se cambia sola: puedes modificarla o retirar la publicación cuando quieras.',
  confirm: 'Publicar',
  confirmFor: (label) => `Publicar para: ${label.toLowerCase()}`,
  publishing: 'Publicando…',
  empty: 'La hoja está en blanco: escribe algo antes de publicarla.',
  done: 'Ya está publicado',
  doneFriends: 'Tus amigos de la Tertulia ya pueden leerlo.',
  donePrivate: 'Queda guardado solo para ti. Puedes abrirlo a tus amigos cuando quieras.',
  view: 'Ver publicación',
  pending: 'Has cambiado el escrito desde que lo publicaste. Lo que leen tus amigos sigue siendo la versión anterior.',
  update: 'Actualizar publicación',
  updated: 'Publicación actualizada. Quien la lea verá que se ha actualizado.',
  withdraw: 'Retirar',
  withdrawn: 'Publicación retirada: ya nadie más puede leerla.',
  upToDate: 'La publicación está al día con tu escrito.',
  saveAudience: 'Guardar audiencia',
}

export const writings = {
  kicker: 'Escritos',
  title: ['Lo que escriben', 'tus amigos'],
  sub: 'Textos que han salido del estudio de cada uno, tal como los escribieron. Solo los ves tú y quien su autor haya elegido.',
  emptyFeed: ['Aún no hay escritos', 'Cuando un amigo publique algo desde su Writer’s Studio, lo encontrarás aquí.'],
  emptyMine: ['Todavía no has publicado nada', 'Abre un escrito en el estudio y pulsa «Publicar en Tertulia». Tú decides quién puede leerlo.'],
  reactions: 'Una reacción discreta',
  replies: 'Respuestas',
  replyHint: 'Tu respuesta solo la leen el autor y tú.',
  replyPlaceholder: 'Escribe unas líneas al autor…',
  authorHint: 'Las respuestas de tus lectores son privadas: cada conversación es solo entre esa persona y tú.',
}

export const tertulia = {
  notices: { kicker: 'Avisos', title: 'Lo que ha llegado' },
  shareBook: {
    label: 'Compartir libro',
    title: 'Compartir libro',
    to: '¿Con quién?',
    note: 'Unas palabras (opcional)',
    notePlaceholder: 'Creo que te gustaría porque…',
    includeRating: (r) => `Incluir mi valoración (${r}★)`,
    send: 'Enviar',
    sending: 'Enviando…',
    cancel: 'Cancelar',
    notInLibrary: 'No está en tu biblioteca: tus amigos recibirán la ficha, sin que se añada a tus estantes.',
    sent: (title, names) => `«${title}» va de camino a ${names}.`,
    doneTitle: 'Enviado',
    doneBody: (names) => `Le llegará a ${names} entre sus obsequios.`,
    close: 'Listo',
  },
  shelf: {
    kicker: 'Mi estantería',
    title: 'Libros que me acompañan',
    sub: 'Elige hasta ocho de tu biblioteca, ponlos en el orden que quieras y decide quién ve la estantería. Nada se muestra si tú no lo eliges.',
    hiddenNote: 'La estantería está oculta: tus libros siguen en tu biblioteca y esta selección se guarda por si la vuelves a mostrar.',
    empty: 'Aún no has elegido ningún libro para tu estantería.',
    show: 'Mostrar mi estantería en mi ficha',
    pickFrom: 'Elige de tu biblioteca',
    favoritesFirst: 'Primero, los de tu lista de Favoritos',
    search: 'Buscar en tu biblioteca',
    moveLeft: (t) => `Mover «${t}» antes`,
    moveRight: (t) => `Mover «${t}» después`,
    remove: (t) => `Quitar «${t}» de la estantería`,
    full: 'Ya tienes ocho: quita uno para añadir otro.',
  },
}

/* ------------------------------------------------------------------ */
/* Errores de conexión comunes                                         */
/* ------------------------------------------------------------------ */

export const errors = {
  server: `No hemos podido conectar con el servidor de ${brand.name}.`,
}
