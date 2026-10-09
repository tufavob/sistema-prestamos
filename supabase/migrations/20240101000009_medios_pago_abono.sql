-- ============================================================
-- Medios de pago y abonos parciales en pagos
-- Ejecutar en el SQL Editor de Supabase (o consola de migraciones).
-- 1) medio_pago: 'efectivo' | 'yape' | 'plin' | 'transferencia'
-- 2) es_abono_parcial: true cuando el pago no cubre el saldo total
--    de la cuota (abono parcial); false en pagos completos.
-- ============================================================

alter table public.pagos
  add column if not exists medio_pago text not null default 'efectivo';

alter table public.pagos
  add column if not exists es_abono_parcial boolean not null default false;

alter table public.pagos
  drop constraint if exists pagos_medio_pago_check;

alter table public.pagos
  add constraint pagos_medio_pago_check
  check (medio_pago in ('efectivo', 'yape', 'plin', 'transferencia'));

create index if not exists pagos_medio_pago_idx on public.pagos (medio_pago);
create index if not exists pagos_es_abono_parcial_idx on public.pagos (es_abono_parcial);