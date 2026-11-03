-- ============================================================
-- Calificación automática de clientes
-- Ejecutar en el SQL Editor de Supabase (o consola de migraciones).
--
-- Reglas (zona horaria Perú):
--   * Tiene cuotas vencidas sin cobrar (fecha_vencimiento < HOY y
--     saldo_pendiente > 0)                        -> 'deficiente'
--   * Sin mora pero con historial de pagos        -> 'bueno'
--   * Sin pagos y sin mora                        -> 'nuevo'
--
-- Se recalcula con triggers al insertar/actualizar/eliminar cuotas y
-- pagos, y también bajo demanda con recalcular_calificaciones().
-- ============================================================

-- ------------------------------------------------------------
-- 1) Columna calificacion en clientes
-- ------------------------------------------------------------
alter table public.clientes
  add column if not exists calificacion text not null default 'nuevo';

-- ------------------------------------------------------------
-- 2) Cálculo de la calificación para un cliente
-- ------------------------------------------------------------
create or replace function public.calcular_calificacion_cliente(
  p_cliente_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_mora boolean := false;
  v_tiene_pagos boolean := false;
begin
  if p_cliente_id is null then
    return 'nuevo';
  end if;

  -- Deuda morosa: cuota con saldo pendiente cuyo vencimiento ya pasó.
  select exists (
    select 1
      from public.cuotas c
      join public.prestamos p on p.id = c.prestamo_id
     where p.cliente_id = p_cliente_id
       and c.saldo_pendiente > 0
       and c.fecha_vencimiento < v_hoy
  ) into v_mora;

  if v_mora then
    return 'deficiente';
  end if;

  -- Historial de pagos (pagos totales o abonos).
  select exists (
    select 1
      from public.pagos pg
      join public.cuotas c on c.id = pg.cuota_id
      join public.prestamos p on p.id = c.prestamo_id
     where p.cliente_id = p_cliente_id
  ) into v_tiene_pagos;

  if v_tiene_pagos then
    return 'bueno';
  end if;

  return 'nuevo';
end;
$$;

-- ------------------------------------------------------------
-- 3) Recalcular y persistir la calificación de un cliente
-- ------------------------------------------------------------
create or replace function public.recalcular_calificacion_cliente(
  p_cliente_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calificacion text;
begin
  if p_cliente_id is null then
    return null;
  end if;

  v_calificacion := public.calcular_calificacion_cliente(p_cliente_id);

  update public.clientes
     set calificacion = v_calificacion
   where id = p_cliente_id;

  return v_calificacion;
end;
$$;

-- ------------------------------------------------------------
-- 4) Recalcular todos los clientes (usado por el frontend y backfill)
-- ------------------------------------------------------------
create or replace function public.recalcular_calificaciones()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
begin
  update public.clientes
     set calificacion = public.calcular_calificacion_cliente(id);

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

-- ------------------------------------------------------------
-- 5) Triggers
-- ------------------------------------------------------------
create or replace function public.trg_cuotas_calificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prestamo_id uuid;
  v_cliente_id uuid;
begin
  if tg_op = 'DELETE' then
    v_prestamo_id := old.prestamo_id;
  else
    v_prestamo_id := new.prestamo_id;
  end if;

  select cliente_id
    into v_cliente_id
    from public.prestamos
   where id = v_prestamo_id;

  if v_cliente_id is not null then
    perform public.recalcular_calificacion_cliente(v_cliente_id);
  end if;

  return null;
end;
$$;

drop trigger if exists cuotas_calificacion_trg on public.cuotas;

create trigger cuotas_calificacion_trg
  after insert or update or delete on public.cuotas
  for each row execute function public.trg_cuotas_calificacion();

create or replace function public.trg_pagos_calificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuota_id uuid;
  v_cliente_id uuid;
begin
  if tg_op = 'DELETE' then
    v_cuota_id := old.cuota_id;
  else
    v_cuota_id := new.cuota_id;
  end if;

  select p.cliente_id
    into v_cliente_id
    from public.cuotas c
    join public.prestamos p on p.id = c.prestamo_id
   where c.id = v_cuota_id;

  if v_cliente_id is not null then
    perform public.recalcular_calificacion_cliente(v_cliente_id);
  end if;

  return null;
end;
$$;

drop trigger if exists pagos_calificacion_trg on public.pagos;

create trigger pagos_calificacion_trg
  after insert or update or delete on public.pagos
  for each row execute function public.trg_pagos_calificacion();

-- ------------------------------------------------------------
-- 6) Permisos de ejecución
-- ------------------------------------------------------------
grant execute on function public.calcular_calificacion_cliente(uuid)
  to anon, authenticated;
grant execute on function public.recalcular_calificacion_cliente(uuid)
  to anon, authenticated;
grant execute on function public.recalcular_calificaciones()
  to anon, authenticated;

-- ------------------------------------------------------------
-- 7) Backfill inicial
-- ------------------------------------------------------------
select public.recalcular_calificaciones();
