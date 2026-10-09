-- ============================================================
-- Bucket público "clientes-docs" para fotos del expediente
-- (DNI frontal, DNI reverso y fachada del cliente).
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clientes-docs',
  'clientes-docs',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

create policy if not exists "clientes-docs public SELECT"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'clientes-docs');

create policy if not exists "clientes-docs anon INSERT"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'clientes-docs');

create policy if not exists "clientes-docs anon UPDATE"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'clientes-docs')
  with check (bucket_id = 'clientes-docs');

create policy if not exists "clientes-docs anon DELETE"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'clientes-docs');