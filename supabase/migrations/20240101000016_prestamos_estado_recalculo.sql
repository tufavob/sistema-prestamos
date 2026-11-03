-- ============================================================
-- Recalcular prestamos.estado según sus cuotas reales
-- Ejecutar en el SQL Editor de Supabase (opcional pero recomendado).
--
-- La versión anterior de registrarCobro marcaba el préstamo como
-- 'completado' cuando el saldo llegaba a 0, sin verificar si aún quedaban
-- cuotas sin pagar (por ejemplo, abonos parciales o cuotas impagas).
-- Este script corrige los préstamos que quedaron mal marcados.
--
-- Regla (igual que src/lib/acciones.ts):
--   * Existe al menos una cuota con estado <> 'pagado' -> 'activo'
--   * No queda ninguna cuota sin pagar               -> 'completado'
-- ============================================================

-- 1) Préstamos marcados 'completado' que aún tienen cuotas sin pagar.
update public.prestamos p
   set estado = 'activo'
 where p.estado = 'completado'
   and exists (
     select 1
       from public.cuotas c
      where c.prestamo_id = p.id
        and c.estado is distinct from 'pagado'
   );

-- 2) Préstamos 'activo' con cronograma cuyas cuotas ya están todas pagadas.
update public.prestamos p
   set estado = 'completado'
 where p.estado = 'activo'
   and exists (
     select 1
       from public.cuotas c
      where c.prestamo_id = p.id
   )
   and not exists (
     select 1
       from public.cuotas c
      where c.prestamo_id = p.id
        and c.estado is distinct from 'pagado'
   );
