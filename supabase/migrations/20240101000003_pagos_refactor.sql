-- ============================================================
-- Módulo de Pagos: refactor de consistencia
-- Ejecutar DESPUÉS de 20240101000002_cobros_pagos.sql
-- 1) cuotas: columnas monto_pagado y fecha_pago (último pago)
-- 2) estados estandarizados en minúsculas: pendiente|pagado|parcial|vencido
-- 3) pagar_cuota atómica: actualiza cuota, descuenta préstamo e inserta pago
-- 4) la fecha del pago la fija el cliente (p_fecha, YYYY-MM-DD) para ignorar
--    diferencias de zona horaria servidor/cliente al consolidar el día.
-- ============================================================

-- ------------------------------------------------------------
-- pagar_cuota: descartar la firma vieja de 2 argumentos
-- ------------------------------------------------------------
drop function if exists public.pagar_cuota(uuid, numeric);

-- ------------------------------------------------------------
-- cuotas: columnas nuevas
-- ------------------------------------------------------------
alter table public.cuotas add column if not exists monto_pagado numeric(12, 2) not null default 0;
alter table public.cuotas add column if not exists fecha_pago timestamptz;

alter table public.cuotas
  add constraint cuotas_monto_pagado_ck check (monto_pagado >= 0 and monto_pagado <= monto);

-- ------------------------------------------------------------
-- cuotas: estados estandarizados en minúsculas
-- ------------------------------------------------------------
alter table public.cuotas drop constraint cuotas_estado_check;

update public.cuotas set estado = 'pagado' where estado = 'pagada';
update public.cuotas set estado = 'vencido' where estado = 'atrasada';

alter table public.cuotas
  add constraint cuotas_estado_check
  check (estado in ('pendiente', 'pagado', 'parcial', 'vencido'));

-- ------------------------------------------------------------
-- Backfill: monto_pagado y fecha_pago desde el historial de pagos
-- ------------------------------------------------------------
update public.cuotas c
   set monto_pagado = p.total,
       fecha_pago = p.ultima
  from (
    select cuota_id,
           round(sum(monto), 2) as total,
           max(created_at) as ultima
      from public.pagos
     group by cuota_id
  ) p
 where p.cuota_id = c.id
   and p.total > 0;

-- Reconciliar saldo/estado de las cuotas con lo efectivamente pagado
update public.cuotas
   set saldo_pendiente = round(monto - monto_pagado, 2),
       estado = case
         when round(monto - monto_pagado, 2) <= 0 then 'pagado'
         when monto_pagado > 0 then 'parcial'
         else estado
       end;

-- Reconciliar el saldo de cada préstamo como suma de saldos de sus cuotas
update public.prestamos p
   set saldo_pendiente = coalesce((
     select round(sum(c.saldo_pendiente), 2)
       from public.cuotas c
      where c.prestamo_id = p.id
   ), 0);

-- ------------------------------------------------------------
-- Función: pagar_cuota (pago total o abono parcial) — ATÓMICA
-- - Bloquea la cuota (FOR UPDATE) para evitar doble cobro.
-- - Actualiza monto_pagado, saldo_pendiente, estado y fecha_pago.
-- - Descuenta el saldo del préstamo.
-- - Inserta el registro en pagos con la fecha del operador (p_fecha).
-- Todo ocurre en una única transacción.
-- ------------------------------------------------------------
create or replace function public.pagar_cuota(
  p_cuota_id uuid,
  p_monto numeric,
  p_fecha date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prestamo_id uuid;
  v_saldo numeric(12, 2);
  v_nuevo_saldo numeric(12, 2);
  v_estado text;
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;

  select prestamo_id, saldo_pendiente
    into v_prestamo_id, v_saldo
    from public.cuotas
   where id = p_cuota_id
   for update;

  if not found then
    raise exception 'Cuota no encontrada';
  end if;

  if p_monto > v_saldo then
    raise exception 'El abono no puede superar el saldo pendiente de la cuota';
  end if;

  v_nuevo_saldo := round(v_saldo - p_monto, 2);
  v_estado := case when v_nuevo_saldo <= 0 then 'pagado' else 'parcial' end;

  update public.cuotas
     set saldo_pendiente = v_nuevo_saldo,
         monto_pagado = round(coalesce(monto_pagado, 0) + p_monto, 2),
         estado = v_estado,
         fecha_pago = now()
   where id = p_cuota_id;

  update public.prestamos
     set saldo_pendiente = greatest(round(saldo_pendiente - p_monto, 2), 0)
   where id = v_prestamo_id;

  insert into public.pagos (cuota_id, prestamo_id, monto, fecha_pago)
  values (p_cuota_id, v_prestamo_id, p_monto, p_fecha);

  return p_cuota_id;
end;
$$;

grant execute on function public.pagar_cuota(uuid, numeric, date)
  to anon, authenticated;