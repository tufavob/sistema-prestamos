-- ============================================================
-- Método de pago por cuota
-- Ejecutar en el SQL Editor de Supabase (o consola de migraciones).
-- Guarda el medio con el que se cobró cada cuota para el reporte
-- "Ingresos por Método de Pago".
-- Valores: 'efectivo' | 'yape' | 'plin' | 'transferencia'
-- ============================================================

alter table public.cuotas
  add column if not exists metodo_pago text;

alter table public.cuotas
  drop constraint if exists cuotas_metodo_pago_check;

alter table public.cuotas
  add constraint cuotas_metodo_pago_check
  check (
    metodo_pago is null
    or metodo_pago in ('efectivo', 'yape', 'plin', 'transferencia')
  );

create index if not exists cuotas_metodo_pago_idx on public.cuotas (metodo_pago);
