-- ============================================================
-- Módulo de Gestión de Clientes: nuevos campos y fotos
-- Ejecutar en el SQL Editor de Supabase (o consola de migraciones).
-- 1) clientes: vivienda, deudas_financieras y URLs de fotos
--    (DNI frontal, DNI posterior y fachada).
-- 2) Bucket público "fotos_clientes" para subir las imágenes.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Columnas nuevas en clientes
-- ------------------------------------------------------------
alter table public.clientes
  add column if not exists vivienda text;

alter table public.clientes
  add column if not exists deudas_financieras text;

alter table public.clientes
  add column if not exists foto_dni_frontal text;

alter table public.clientes
  add column if not exists foto_dni_posterior text;

alter table public.clientes
  add column if not exists foto_fachada text;

alter table public.clientes
  drop constraint if exists clientes_vivienda_check;

alter table public.clientes
  add constraint clientes_vivienda_check
  check (vivienda is null or vivienda in ('propia', 'alquilada'));

-- ------------------------------------------------------------
-- 2) Bucket de almacenamiento para fotos de clientes
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fotos_clientes',
  'fotos_clientes',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

create policy if not exists "Fotos clientes public SELECT"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'fotos_clientes');

create policy if not exists "Fotos clientes anon INSERT"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'fotos_clientes');

create policy if not exists "Fotos clientes anon UPDATE"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'fotos_clientes')
  with check (bucket_id = 'fotos_clientes');

create policy if not exists "Fotos clientes anon DELETE"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'fotos_clientes');