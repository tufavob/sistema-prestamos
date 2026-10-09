-- ============================================================
-- Políticas RLS para operaciones directas (sin RPC)
-- Ejecutar DESPUÉS de 20240101000005_auth_rls.sql
--
-- Habilita para usuarios autenticados el I/U/S directo que hacen
-- ahora registrarCobro (lib/acciones.ts) y el detalle del préstamo:
--   - pagos:   INSERT + SELECT
--   - cuotas:  UPDATE + SELECT
--   - prestamos: UPDATE + SELECT
-- ============================================================

-- ------------------------------------------------------------
-- 1) pagos
-- ------------------------------------------------------------
drop policy if exists "Permitir insert en pagos a autenticados" on public.pagos;
drop policy if exists "Permitir select en pagos a autenticados" on public.pagos;

create policy "Permitir insert en pagos a autenticados"
  on public.pagos for insert
  to authenticated
  with check (true);

create policy "Permitir select en pagos a autenticados"
  on public.pagos for select
  to authenticated
  using (true);

-- ------------------------------------------------------------
-- 2) cuotas
-- ------------------------------------------------------------
drop policy if exists "Permitir update en cuotas a autenticados" on public.cuotas;
drop policy if exists "Permitir select en cuotas a autenticados" on public.cuotas;

create policy "Permitir update en cuotas a autenticados"
  on public.cuotas for update
  to authenticated
  using (true);

create policy "Permitir select en cuotas a autenticados"
  on public.cuotas for select
  to authenticated
  using (true);

-- ------------------------------------------------------------
-- 3) prestamos
-- ------------------------------------------------------------
drop policy if exists "Permitir update en prestamos a autenticados" on public.prestamos;
drop policy if exists "Permitir select en prestamos a autenticados" on public.prestamos;

create policy "Permitir update en prestamos a autenticados"
  on public.prestamos for update
  to authenticated
  using (true);

create policy "Permitir select en prestamos a autenticados"
  on public.prestamos for select
  to authenticated
  using (true);