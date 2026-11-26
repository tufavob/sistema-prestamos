-- ============================================================
-- Pago único: permitir la frecuencia 'pago_unico' en prestamos.
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de las migraciones
-- 01 a 16. No modifica las frecuencias existentes.
--
-- La aplicación crea siempre 1 sola cuota para 'pago_unico' y fija su
-- fecha_vencimiento a la fecha elegida por el operador (America/Lima).
-- Si esta migración no está aplicada, la app guarda el préstamo con una
-- frecuencia existente y ajusta igualmente la cuota, de modo que reportes
-- y cobros siguen funcionando sin cambios.
-- ============================================================

alter table public.prestamos
  drop constraint if exists prestamos_frecuencia_check;

alter table public.prestamos
  add constraint prestamos_frecuencia_check
  check (
    frecuencia in ('diario', 'semanal', 'quincenal', 'mensual', 'pago_unico')
  );
