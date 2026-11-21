-- BookTracker · Tertulia (perfiles, amistades, bloqueos, obsequios, cartas y avisos).
-- Solo tablas nuevas: no modifica ninguna existente. Generado desde backend/social_models.py.
-- El servidor Flask es el único cliente de estas tablas y comprueba amistad y bloqueos en cada
-- consulta. RLS activado sin políticas + sin permisos para anon/authenticated: la API pública de
-- Supabase no puede leerlas ni escribirlas.

CREATE TABLE public.social_profiles (
	user_id INTEGER NOT NULL, 
	username VARCHAR(30) NOT NULL, 
	bio VARCHAR(400), 
	google_name VARCHAR(120), 
	google_avatar_url TEXT, 
	avatar_mode VARCHAR(10) NOT NULL, 
	avatar_data BYTEA, 
	avatar_mime VARCHAR(40), 
	avatar_token VARCHAR(40), 
	favorite_books TEXT, 
	discoverable BOOLEAN NOT NULL, 
	email_lookup BOOLEAN NOT NULL, 
	show_genres VARCHAR(8) NOT NULL, 
	show_authors VARCHAR(8) NOT NULL, 
	show_books VARCHAR(8) NOT NULL, 
	show_reading VARCHAR(8) NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	updated_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (user_id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	UNIQUE (username), 
	UNIQUE (avatar_token)
);

CREATE TABLE public.friend_links (
	id SERIAL NOT NULL, 
	user_low INTEGER NOT NULL, 
	user_high INTEGER NOT NULL, 
	requested_by INTEGER NOT NULL, 
	status VARCHAR(10) NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	responded_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_friend_pair UNIQUE (user_low, user_high), 
	CONSTRAINT ck_friend_pair_order CHECK (user_low < user_high), 
	CONSTRAINT ck_friend_status CHECK (status in ('pending', 'accepted', 'declined')), 
	CONSTRAINT ck_friend_requester CHECK (requested_by = user_low or requested_by = user_high), 
	FOREIGN KEY(user_low) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_high) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(requested_by) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX ix_friend_links_requested_by ON public.friend_links (requested_by);
CREATE INDEX ix_friend_links_user_high ON public.friend_links (user_high);
CREATE INDEX ix_friend_links_user_low ON public.friend_links (user_low);

CREATE TABLE public.user_blocks (
	id SERIAL NOT NULL, 
	blocker_id INTEGER NOT NULL, 
	blocked_id INTEGER NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_block_pair UNIQUE (blocker_id, blocked_id), 
	CONSTRAINT ck_block_self CHECK (blocker_id <> blocked_id), 
	FOREIGN KEY(blocker_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(blocked_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX ix_user_blocks_blocked_id ON public.user_blocks (blocked_id);
CREATE INDEX ix_user_blocks_blocker_id ON public.user_blocks (blocker_id);

CREATE TABLE public.shared_books (
	id SERIAL NOT NULL, 
	sender_id INTEGER NOT NULL, 
	recipient_id INTEGER NOT NULL, 
	client_key VARCHAR(64) NOT NULL, 
	title VARCHAR(400) NOT NULL, 
	subtitle VARCHAR(400), 
	authors TEXT, 
	description TEXT, 
	cover_url TEXT, 
	year INTEGER, 
	publisher VARCHAR(255), 
	page_count INTEGER, 
	isbn13 VARCHAR(20), 
	language VARCHAR(10), 
	categories TEXT, 
	genres TEXT, 
	catalog_id VARCHAR(80), 
	ol_work_key VARCHAR(40), 
	google_id VARCHAR(40), 
	sender_rating FLOAT, 
	note VARCHAR(1000), 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	seen_at TIMESTAMP WITHOUT TIME ZONE, 
	saved_book_id INTEGER, 
	reaction VARCHAR(16), 
	reply VARCHAR(500), 
	replied_at TIMESTAMP WITHOUT TIME ZONE, 
	recipient_hidden_at TIMESTAMP WITHOUT TIME ZONE, 
	sender_hidden_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_shared_book_once UNIQUE (sender_id, recipient_id, client_key), 
	CONSTRAINT ck_shared_book_self CHECK (sender_id <> recipient_id), 
	FOREIGN KEY(sender_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(recipient_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(saved_book_id) REFERENCES books (id) ON DELETE SET NULL
);
CREATE INDEX ix_shared_books_saved_book_id ON public.shared_books (saved_book_id);
CREATE INDEX ix_shared_books_created_at ON public.shared_books (created_at);
CREATE INDEX ix_shared_books_recipient_id ON public.shared_books (recipient_id);
CREATE INDEX ix_shared_books_sender_id ON public.shared_books (sender_id);

CREATE TABLE public.shared_poems (
	id SERIAL NOT NULL, 
	sender_id INTEGER NOT NULL, 
	recipient_id INTEGER NOT NULL, 
	client_key VARCHAR(64) NOT NULL, 
	poem_id VARCHAR(700) NOT NULL, 
	title VARCHAR(500) NOT NULL, 
	alt_title VARCHAR(500), 
	author_name VARCHAR(200), 
	author_qid VARCHAR(20), 
	author_birth INTEGER, 
	author_death INTEGER, 
	translator_name VARCHAR(200), 
	language VARCHAR(10), 
	collection VARCHAR(500), 
	year INTEGER, 
	source_name VARCHAR(120), 
	source_url TEXT, 
	rights_status VARCHAR(16) NOT NULL, 
	rights_label VARCHAR(120), 
	attribution TEXT, 
	linecount INTEGER, 
	text TEXT, 
	note VARCHAR(1000), 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	seen_at TIMESTAMP WITHOUT TIME ZONE, 
	saved_at TIMESTAMP WITHOUT TIME ZONE, 
	reaction VARCHAR(16), 
	reply VARCHAR(500), 
	replied_at TIMESTAMP WITHOUT TIME ZONE, 
	recipient_hidden_at TIMESTAMP WITHOUT TIME ZONE, 
	sender_hidden_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_shared_poem_once UNIQUE (sender_id, recipient_id, client_key), 
	CONSTRAINT ck_shared_poem_self CHECK (sender_id <> recipient_id), 
	CONSTRAINT ck_shared_poem_text_free CHECK (text is null or rights_status in ('public_domain', 'open_license')), 
	FOREIGN KEY(sender_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(recipient_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX ix_shared_poems_created_at ON public.shared_poems (created_at);
CREATE INDEX ix_shared_poems_recipient_id ON public.shared_poems (recipient_id);
CREATE INDEX ix_shared_poems_sender_id ON public.shared_poems (sender_id);

CREATE TABLE public.letters (
	id SERIAL NOT NULL, 
	sender_id INTEGER, 
	sender_name VARCHAR(120) NOT NULL, 
	sender_username VARCHAR(30), 
	source_writing_id INTEGER, 
	in_reply_to_id INTEGER, 
	client_key VARCHAR(64) NOT NULL, 
	subject VARCHAR(300) NOT NULL, 
	content TEXT NOT NULL, 
	word_count INTEGER, 
	stationery VARCHAR(20) NOT NULL, 
	seal VARCHAR(20) NOT NULL, 
	cover_data BYTEA, 
	cover_mime VARCHAR(40), 
	cover_width INTEGER, 
	cover_height INTEGER, 
	sent_at TIMESTAMP WITHOUT TIME ZONE, 
	sender_hidden_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_letter_once UNIQUE (sender_id, client_key), 
	FOREIGN KEY(sender_id) REFERENCES users (id) ON DELETE SET NULL, 
	FOREIGN KEY(source_writing_id) REFERENCES studio_writings (id) ON DELETE SET NULL, 
	FOREIGN KEY(in_reply_to_id) REFERENCES letters (id) ON DELETE SET NULL
);
CREATE INDEX ix_letters_in_reply_to_id ON public.letters (in_reply_to_id);
CREATE INDEX ix_letters_sender_id ON public.letters (sender_id);
CREATE INDEX ix_letters_sent_at ON public.letters (sent_at);
CREATE INDEX ix_letters_source_writing_id ON public.letters (source_writing_id);

CREATE TABLE public.letter_recipients (
	id SERIAL NOT NULL, 
	letter_id INTEGER NOT NULL, 
	recipient_id INTEGER NOT NULL, 
	recipient_name VARCHAR(120) NOT NULL, 
	delivered_at TIMESTAMP WITHOUT TIME ZONE, 
	read_at TIMESTAMP WITHOUT TIME ZONE, 
	hidden_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_letter_recipient UNIQUE (letter_id, recipient_id), 
	FOREIGN KEY(letter_id) REFERENCES letters (id) ON DELETE CASCADE, 
	FOREIGN KEY(recipient_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX ix_letter_recipients_delivered_at ON public.letter_recipients (delivered_at);
CREATE INDEX ix_letter_recipients_letter_id ON public.letter_recipients (letter_id);
CREATE INDEX ix_letter_recipients_recipient_id ON public.letter_recipients (recipient_id);

CREATE TABLE public.notifications (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	kind VARCHAR(24) NOT NULL, 
	actor_id INTEGER, 
	ref_id INTEGER, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	read_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	FOREIGN KEY(actor_id) REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX ix_notifications_actor_id ON public.notifications (actor_id);
CREATE INDEX ix_notifications_created_at ON public.notifications (created_at);
CREATE INDEX ix_notifications_user_id ON public.notifications (user_id);

CREATE TABLE public.social_lookups (
	id SERIAL NOT NULL, 
	user_id INTEGER NOT NULL, 
	created_at TIMESTAMP WITHOUT TIME ZONE, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX ix_social_lookups_created_at ON public.social_lookups (created_at);
CREATE INDEX ix_social_lookups_user_id ON public.social_lookups (user_id);

-- Una carta enviada no se puede modificar (solo se permite marcar/ocultar del remitente y que
-- el remitente quede en NULL si borra su cuenta).
create function public.letters_immutable() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.subject is distinct from old.subject or new.content is distinct from old.content
     or new.stationery is distinct from old.stationery or new.seal is distinct from old.seal
     or new.cover_data is distinct from old.cover_data or new.sent_at is distinct from old.sent_at
     or new.sender_name is distinct from old.sender_name
     or (new.sender_id is distinct from old.sender_id and new.sender_id is not null) then
    raise exception 'Una carta enviada no se puede modificar' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger letters_immutable before update on public.letters
  for each row execute function public.letters_immutable();
revoke execute on function public.letters_immutable() from public, anon, authenticated;

-- Seguridad: nada de esto es accesible desde la API pública.
alter table public.social_profiles enable row level security;
alter table public.friend_links enable row level security;
alter table public.user_blocks enable row level security;
alter table public.shared_books enable row level security;
alter table public.shared_poems enable row level security;
alter table public.letters enable row level security;
alter table public.letter_recipients enable row level security;
alter table public.notifications enable row level security;
alter table public.social_lookups enable row level security;
revoke all on public.social_profiles, public.friend_links, public.user_blocks, public.shared_books, public.shared_poems, public.letters, public.letter_recipients, public.notifications, public.social_lookups from anon, authenticated;
revoke usage on all sequences in schema public from anon, authenticated;
