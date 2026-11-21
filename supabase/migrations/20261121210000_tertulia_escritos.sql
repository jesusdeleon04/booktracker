-- BookTracker · Tertulia: escritos publicados (Writer's Studio → Tertulia).
-- Solo aditivo: una columna nueva con valor por defecto en social_profiles y tablas nuevas.
-- No toca ni borra datos existentes. Generado desde backend/social_models.py.
-- Seguridad: igual que el resto de Tertulia. El servidor Flask es el único cliente de estas
-- tablas y comprueba amistad, bloqueos y audiencia en cada consulta (services/social.py,
-- can_read_publication). RLS activado sin políticas + sin permisos para anon/authenticated:
-- la API pública de Supabase no puede leerlas ni escribirlas.

alter table public.social_profiles
  add column if not exists show_writings varchar(8) not null default 'friends';

CREATE TABLE IF NOT EXISTS public.publications (
	id SERIAL NOT NULL,
	author_id INTEGER NOT NULL,
	source_writing_id INTEGER,
	client_key VARCHAR(64) NOT NULL,
	title VARCHAR(300) NOT NULL,
	intro VARCHAR(600),
	content TEXT NOT NULL,
	word_count INTEGER,
	category_name VARCHAR(80),
	category_color VARCHAR(20),
	cover_data BYTEA,
	cover_mime VARCHAR(40),
	cover_width INTEGER,
	cover_height INTEGER,
	audience VARCHAR(8) NOT NULL,
	published_at TIMESTAMP WITHOUT TIME ZONE,
	updated_at TIMESTAMP WITHOUT TIME ZONE,
	withdrawn_at TIMESTAMP WITHOUT TIME ZONE,
	created_at TIMESTAMP WITHOUT TIME ZONE,
	PRIMARY KEY (id),
	CONSTRAINT uq_publication_once UNIQUE (author_id, client_key),
	CONSTRAINT ck_publication_audience CHECK (audience in ('private', 'friends')),
	FOREIGN KEY(author_id) REFERENCES users (id) ON DELETE CASCADE,
	FOREIGN KEY(source_writing_id) REFERENCES studio_writings (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS ix_publications_author_id ON public.publications (author_id);
CREATE INDEX IF NOT EXISTS ix_publications_published_at ON public.publications (published_at);
CREATE INDEX IF NOT EXISTS ix_publications_source_writing_id ON public.publications (source_writing_id);
CREATE TABLE IF NOT EXISTS public.publication_reactions (
	id SERIAL NOT NULL,
	publication_id INTEGER NOT NULL,
	user_id INTEGER NOT NULL,
	reaction VARCHAR(16) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE,
	PRIMARY KEY (id),
	CONSTRAINT uq_publication_reaction UNIQUE (publication_id, user_id),
	FOREIGN KEY(publication_id) REFERENCES publications (id) ON DELETE CASCADE,
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_publication_reactions_publication_id ON public.publication_reactions (publication_id);
CREATE INDEX IF NOT EXISTS ix_publication_reactions_user_id ON public.publication_reactions (user_id);
CREATE TABLE IF NOT EXISTS public.publication_comments (
	id SERIAL NOT NULL,
	publication_id INTEGER NOT NULL,
	thread_user_id INTEGER NOT NULL,
	author_id INTEGER NOT NULL,
	body VARCHAR(1000) NOT NULL,
	created_at TIMESTAMP WITHOUT TIME ZONE,
	PRIMARY KEY (id),
	FOREIGN KEY(publication_id) REFERENCES publications (id) ON DELETE CASCADE,
	FOREIGN KEY(thread_user_id) REFERENCES users (id) ON DELETE CASCADE,
	FOREIGN KEY(author_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_publication_comments_created_at ON public.publication_comments (created_at);
CREATE INDEX IF NOT EXISTS ix_publication_comments_publication_id ON public.publication_comments (publication_id);
CREATE INDEX IF NOT EXISTS ix_publication_comments_thread_user_id ON public.publication_comments (thread_user_id);
CREATE INDEX IF NOT EXISTS ix_publication_comments_author_id ON public.publication_comments (author_id);

alter table public.publications enable row level security;
alter table public.publication_reactions enable row level security;
alter table public.publication_comments enable row level security;
revoke all on public.publications, public.publication_reactions, public.publication_comments from anon, authenticated;
revoke usage on all sequences in schema public from anon, authenticated;
