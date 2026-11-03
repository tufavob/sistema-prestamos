-- ============================================================
-- Estados válidos de prestamos: activo | completado | cancelado
-- Ejecutar en el SQL Editor de Supabase.
--
-- La app ahora marca el préstamo como 'completado' cuando el saldo
-- llega a 0 (antes intentaba 'liquidado', valor que la restricción de
-- la base rechaza con:
--   new row for relation "prestamos" violates check constraint
--   "prestamos_estado_check").
--
-- Este script:
--   1) Normaliza estados heredados ('liquidado', 'finalizado', 'pagado')
--      al valor permitido 'completado'.
--   2) Recrea la restricción con los tres valores permitidos.
-- ============================================================

-- 1) Normalizar estados heredados (antes de recrear la restricción).
update public.prestamos
   set estado = 'completado'
 where lower(estado) in ('liquidado', 'finalizado', 'pagado');

-- 2) Restricción definitiva.
alter table public.prestamos
  drop constraint if exists prestamos_estado_check;

alter table public.prestamos
  add constraint prestamos_estado_check
  check (estado in ('activo', 'completado', 'cancelado'));
