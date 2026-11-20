-- BookTracker · Biblioteca de poesía
-- Applied to project xoygqiwdvkpysiedeixr on 2026-11-20 as two migrations
-- (poetry_library + poetry_tighten_grants); kept here as one file for reference.
--
-- Shared bibliographic catalog (authors, poems: one row per source document, no
-- duplicates) separated from each user's private collection (categories,
-- saved poems, favourites, notes, covers). Full texts are stored only when the
-- rights allow it.

create type public.poem_rights as enum ('public_domain', 'open_license', 'protected', 'unknown');

-- ── Catalog (shared, append-only for signed-in users) ─────────────────────
create table public.poetry_authors (
  id uuid primary key default gen_random_uuid(),
  wikidata_id text unique check (wikidata_id ~ '^Q[0-9]+$'),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  name_key text generated always as (lower(btrim(name))) stored,
  birth_year integer check (birth_year between -3000 and 2100),
  death_year integer check (death_year between -3000 and 2100),
  image_url text check (image_url is null or image_url ~ '^https://'),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index poetry_authors_name_without_qid on public.poetry_authors (name_key) where wikidata_id is null;
comment on table public.poetry_authors is 'Autores de poemas (datos bibliográficos de Wikidata). Compartido y de solo inserción.';

create table public.poetry_poems (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('wikisource', 'poetrydb')),
  source_id text not null check (char_length(source_id) between 1 and 600),
  source_name text not null check (char_length(source_name) between 1 and 120),
  source_url text not null check (source_url ~ '^https://'),
  title text not null check (char_length(btrim(title)) between 1 and 500),
  author_id uuid references public.poetry_authors (id) on delete set null,
  author_name text check (char_length(author_name) <= 200),
  translator_name text check (char_length(translator_name) <= 200),
  language text not null check (language ~ '^[a-z]{2,3}$'),
  collection text check (char_length(collection) <= 500),
  year integer check (year between -3000 and 2100),
  linecount integer check (linecount between 0 and 100000),
  first_line text check (char_length(first_line) <= 500),
  rights_status public.poem_rights not null,
  rights_note text check (char_length(rights_note) <= 2000),
  license text check (char_length(license) <= 60),
  license_url text check (license_url is null or license_url ~ '^https://'),
  text text check (char_length(text) <= 300000),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (source, source_id),
  -- Protected or unverified works are stored as references only.
  constraint poetry_poems_text_only_when_free check (
    (text is null and first_line is null) or rights_status in ('public_domain', 'open_license')
  )
);
create index poetry_poems_author_id_idx on public.poetry_poems (author_id);
comment on table public.poetry_poems is 'Referencias bibliográficas de poemas y, solo si son libres en todas las jurisdicciones, su texto.';

-- ── Private collection ────────────────────────────────────────────────────
create table public.poetry_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  name_key text generated always as (lower(btrim(name))) stored,
  color text not null default '#8a9bb8' check (color ~ '^#[0-9a-fA-F]{6}$'),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name_key),
  unique (id, user_id)
);

create table public.poetry_collection (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  poem_id uuid not null references public.poetry_poems (id) on delete restrict,
  category_id uuid,
  is_favorite boolean not null default false,
  cover_path text check (cover_path is null or (char_length(cover_path) <= 300 and split_part(cover_path, '/', 1) = user_id::text)),
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, poem_id),
  unique (id, user_id),
  foreign key (category_id, user_id) references public.poetry_categories (id, user_id) on delete set null (category_id)
);
create index poetry_collection_poem_id_idx on public.poetry_collection (poem_id);
create index poetry_collection_category_idx on public.poetry_collection (category_id, user_id);

create table public.poetry_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (item_id, user_id) references public.poetry_collection (id, user_id) on delete cascade
);
create index poetry_notes_item_idx on public.poetry_notes (item_id, user_id);
create index poetry_notes_user_idx on public.poetry_notes (user_id);

-- ── updated_at ────────────────────────────────────────────────────────────
create function public.poetry_touch_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger poetry_collection_touch before update on public.poetry_collection
  for each row execute function public.poetry_touch_updated_at();
create trigger poetry_notes_touch before update on public.poetry_notes
  for each row execute function public.poetry_touch_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────
alter table public.poetry_authors enable row level security;
alter table public.poetry_poems enable row level security;
alter table public.poetry_categories enable row level security;
alter table public.poetry_collection enable row level security;
alter table public.poetry_notes enable row level security;

create policy "Catálogo legible por usuarios" on public.poetry_authors for select to authenticated using (true);
create policy "Usuarios añaden autores" on public.poetry_authors for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy "Catálogo legible por usuarios" on public.poetry_poems for select to authenticated using (true);
create policy "Usuarios añaden poemas" on public.poetry_poems for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "Leer mis categorías" on public.poetry_categories for select to authenticated using ((select auth.uid()) = user_id);
create policy "Crear mis categorías" on public.poetry_categories for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Editar mis categorías" on public.poetry_categories for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Borrar mis categorías" on public.poetry_categories for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Leer mi colección" on public.poetry_collection for select to authenticated using ((select auth.uid()) = user_id);
create policy "Guardar en mi colección" on public.poetry_collection for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Editar mi colección" on public.poetry_collection for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Quitar de mi colección" on public.poetry_collection for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Leer mis notas" on public.poetry_notes for select to authenticated using ((select auth.uid()) = user_id);
create policy "Escribir mis notas" on public.poetry_notes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Editar mis notas" on public.poetry_notes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Borrar mis notas" on public.poetry_notes for delete to authenticated using ((select auth.uid()) = user_id);

-- Only signed-in users touch these tables; anonymous visitors get nothing.
revoke all on public.poetry_authors, public.poetry_poems, public.poetry_categories,
  public.poetry_collection, public.poetry_notes from anon;
grant select, insert on public.poetry_authors, public.poetry_poems to authenticated;
grant select, insert, update, delete on public.poetry_categories, public.poetry_collection, public.poetry_notes to authenticated;

-- ── RPC: register a poem in the catalog once (runs with the caller's rights) ──
create function public.poetry_save_poem(p jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  a jsonb := p -> 'author';
  v_author uuid;
  v_poem uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para guardar poemas' using errcode = '42501';
  end if;
  if a is not null and coalesce(btrim(a ->> 'name'), '') <> '' then
    insert into public.poetry_authors (wikidata_id, name, birth_year, death_year, image_url)
    values (nullif(a ->> 'qid', ''), a ->> 'name', (a ->> 'birthYear')::integer, (a ->> 'deathYear')::integer,
            nullif(a ->> 'image', ''))
    on conflict do nothing;
    if coalesce(a ->> 'qid', '') <> '' then
      select id into v_author from public.poetry_authors where wikidata_id = a ->> 'qid';
    else
      select id into v_author from public.poetry_authors
       where wikidata_id is null and name_key = lower(btrim(a ->> 'name'));
    end if;
  end if;
  insert into public.poetry_poems (source, source_id, source_name, source_url, title, author_id, author_name,
    translator_name, language, collection, year, linecount, first_line, rights_status, rights_note, license,
    license_url, text)
  values (p ->> 'source', p ->> 'sourceId', p ->> 'sourceName', p ->> 'sourceUrl', p ->> 'title', v_author,
    a ->> 'name', p ->> 'translatorName', p ->> 'language', p ->> 'collection', (p ->> 'year')::integer,
    (p ->> 'linecount')::integer, p ->> 'firstLine', (p ->> 'rightsStatus')::public.poem_rights, p ->> 'rightsNote',
    p ->> 'license', p ->> 'licenseUrl', p ->> 'text')
  on conflict do nothing;
  select id into v_poem from public.poetry_poems where source = p ->> 'source' and source_id = p ->> 'sourceId';
  return v_poem;
end;
$$;
revoke execute on function public.poetry_save_poem(jsonb) from public, anon;
grant execute on function public.poetry_save_poem(jsonb) to authenticated;

-- ── RPC: default categories for the current user (idempotent) ─────────────
create function public.poetry_ensure_default_categories() returns void
language sql security invoker set search_path = '' as $$
  insert into public.poetry_categories (name, color, position)
  values ('Amor', '#c97a7a', 0), ('Melancolía', '#7d8fb3', 1), ('Existencialismo', '#9a8bb0', 2),
         ('Naturaleza', '#7fa07a', 3), ('Espiritualidad', '#c9a35f', 4), ('Soledad', '#6f8f99', 5),
         ('Otros', '#8a8478', 6)
  on conflict (user_id, name_key) do nothing;
$$;
revoke execute on function public.poetry_ensure_default_categories() from public, anon;
grant execute on function public.poetry_ensure_default_categories() to authenticated;
revoke execute on function public.poetry_touch_updated_at() from public, anon, authenticated;

-- ── Storage: private covers, one folder per user ──────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('poetry-covers', 'poetry-covers', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "Ver mis portadas de poesía" on storage.objects for select to authenticated
  using (bucket_id = 'poetry-covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Subir mis portadas de poesía" on storage.objects for insert to authenticated
  with check (bucket_id = 'poetry-covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Cambiar mis portadas de poesía" on storage.objects for update to authenticated
  using (bucket_id = 'poetry-covers' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'poetry-covers' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Borrar mis portadas de poesía" on storage.objects for delete to authenticated
  using (bucket_id = 'poetry-covers' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ── poetry_tighten_grants ─────────────────────────────────────────────────
-- The catalog is append-only for users; nobody may truncate through the API roles.
revoke update, delete, truncate, references, trigger on public.poetry_authors, public.poetry_poems from authenticated;
revoke truncate, references, trigger on public.poetry_categories, public.poetry_collection, public.poetry_notes from authenticated;
