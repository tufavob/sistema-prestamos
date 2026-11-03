-- ============================================================
-- Política DELETE en pagos (respaldo de atomicidad)
-- Ejecutar en el SQL Editor de Supabase.
--
-- registrarCobro (src/lib/acciones.ts) inserta primero en `pagos` y
-- luego actualiza `cuotas`/`prestamos`. Si la actualización falla, intenta
-- revertir el pago insertado; sin política DELETE ese rollback eliminaba
-- 0 filas y dejaba un ingreso huérfano que inflaba "Recaudado hoy".
-- ============================================================

drop policy if exists "Permitir delete en pagos a autenticados" on public.pagos;

create policy "Permitir delete en pagos a autenticados"
  on public.pagos for delete
  to authenticated
  using (true);
