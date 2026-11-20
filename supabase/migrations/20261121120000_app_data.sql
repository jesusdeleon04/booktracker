-- BookTracker · datos de la app (libros, listas, perfil, estudio).
-- Generado desde backend/models.py para PostgreSQL. El servidor Flask se conecta con el rol de
-- base de datos (que se salta RLS) y filtra siempre por user_id; RLS queda activado SIN políticas
-- para que la API pública de Supabase (anon / authenticated) no pueda leer nada de estas tablas.

CREATE TABLE users (
	id SERIAL NOT NULL, 
	handle VARCHAR(80) NOT NULL, 
	supabase_uid VARCHAR(40), 
	email VARCHAR(255), 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	UNIQUE (handle)
);

CREATE UNIQUE INDEX ix_users_supabase_uid ON users (supabase_uid);

CREATE TABLE books (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	title VARCHAR(400) NOT NULL, 
	subtitle VARCHAR(400), 
	authors TEXT, 
	description TEXT, 
	publisher VARCHAR(255), 
	published_date VARCHAR(40), 
	year INTEGER, 
	page_count INTEGER, 
	isbn13 VARCHAR(20), 
	isbn10 VARCHAR(20), 
	language VARCHAR(10), 
	categories TEXT, 
	genres TEXT, 
	cover_url TEXT, 
	cover_alt_url TEXT, 
	source VARCHAR(20), 
	google_id VARCHAR(40), 
	ol_work_key VARCHAR(40), 
	dedupe_key VARCHAR(300), 
	status VARCHAR(12) NOT NULL, 
	rating FLOAT, 
	started_at VARCHAR(10), 
	finished_at VARCHAR(10), 
	current_page INTEGER, 
	notes TEXT, 
	review TEXT, 
	added_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_books_dedupe_key ON books (dedupe_key);
CREATE INDEX ix_books_google_id ON books (google_id);
CREATE INDEX ix_books_isbn13 ON books (isbn13);
CREATE INDEX ix_books_ol_work_key ON books (ol_work_key);
CREATE INDEX ix_books_user_id ON books (user_id);

CREATE TABLE shelves (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	description VARCHAR(400), 
	color VARCHAR(20), 
	emoji VARCHAR(8), 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_shelves_user_id ON shelves (user_id);

CREATE TABLE shelf_items (
	id SERIAL NOT NULL, 
	shelf_id INTEGER NOT NULL, 
	book_id INTEGER NOT NULL, 
	added_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_shelf_book UNIQUE (shelf_id, book_id), 
	FOREIGN KEY(shelf_id) REFERENCES shelves (id) ON DELETE CASCADE, 
	FOREIGN KEY(book_id) REFERENCES books (id) ON DELETE CASCADE
);

CREATE INDEX ix_shelf_items_book_id ON shelf_items (book_id);
CREATE INDEX ix_shelf_items_shelf_id ON shelf_items (shelf_id);

CREATE TABLE reader_profiles (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	display_name VARCHAR(80), 
	genres TEXT, 
	preferences TEXT, 
	favorite_authors TEXT, 
	reading_goal INTEGER, 
	theme VARCHAR(10), 
	onboarded_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	UNIQUE (user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);


CREATE TABLE interactions (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	item_id VARCHAR(60) NOT NULL, 
	kind VARCHAR(12) NOT NULL, 
	title VARCHAR(400), 
	authors TEXT, 
	terms TEXT, 
	genres TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_interaction_item UNIQUE (user_id, item_id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_interactions_user_id ON interactions (user_id);

CREATE TABLE studio_categories (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	name VARCHAR(80) NOT NULL, 
	color VARCHAR(20), 
	position INTEGER, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX ix_studio_categories_user_id ON studio_categories (user_id);

CREATE TABLE studio_images (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	filename VARCHAR(120) NOT NULL, 
	mime VARCHAR(40) NOT NULL, 
	width INTEGER, 
	height INTEGER, 
	size_bytes INTEGER, 
	data BYTEA, 
	token VARCHAR(40), 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX ix_studio_images_token ON studio_images (token);
CREATE INDEX ix_studio_images_user_id ON studio_images (user_id);

CREATE TABLE studio_writings (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	title VARCHAR(300), 
	content TEXT, 
	description VARCHAR(600), 
	category_id INTEGER, 
	cover_image_id INTEGER, 
	word_count INTEGER, 
	char_count INTEGER, 
	caret INTEGER, 
	scroll FLOAT, 
	position INTEGER, 
	version INTEGER NOT NULL, 
	client_key VARCHAR(64), 
	inspiration TEXT, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	last_written_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(category_id) REFERENCES studio_categories (id) ON DELETE SET NULL, 
	FOREIGN KEY(cover_image_id) REFERENCES studio_images (id) ON DELETE SET NULL
);

CREATE INDEX ix_studio_writings_client_key ON studio_writings (client_key);
CREATE INDEX ix_studio_writings_user_id ON studio_writings (user_id);

CREATE INDEX ix_studio_writings_category_id ON studio_writings (category_id);
CREATE INDEX ix_studio_writings_cover_image_id ON studio_writings (cover_image_id);

-- Seguridad
alter table public.users enable row level security;
revoke all on public.users from anon, authenticated;
alter table public.books enable row level security;
revoke all on public.books from anon, authenticated;
alter table public.shelves enable row level security;
revoke all on public.shelves from anon, authenticated;
alter table public.shelf_items enable row level security;
revoke all on public.shelf_items from anon, authenticated;
alter table public.reader_profiles enable row level security;
revoke all on public.reader_profiles from anon, authenticated;
alter table public.interactions enable row level security;
revoke all on public.interactions from anon, authenticated;
alter table public.studio_categories enable row level security;
revoke all on public.studio_categories from anon, authenticated;
alter table public.studio_images enable row level security;
revoke all on public.studio_images from anon, authenticated;
alter table public.studio_writings enable row level security;
revoke all on public.studio_writings from anon, authenticated;
revoke usage on all sequences in schema public from anon, authenticated;
