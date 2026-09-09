-- ============================================================
-- Módulo de Liquidación y Renovación
-- Ejecutar DESPUÉS de 20240101000006_bloqueo_deuda_activa.sql
-- 1) prestamos: columna estado ('activo' | 'liquidado')
-- 2) función liquidar_y_registrar_prestamo: liquida las cuotas
--    pendientes del cliente, marca los préstamos anteriores como
--    'liquidado' y registra el nuevo préstamo con su cronograma.
--    - El nuevo préstamo se registra con el Monto Prestado completo.
--    - Cada cuota liquidada se asienta en `pagos` con la fecha que
--      pasa el operador (por defecto hoy) => Recaudado del día/Dash.
--    - Todo ocurre en una única transacción.
-- ============================================================

-- ------------------------------------------------------------
-- 1) prestamos: estado de vida del préstamo
-- ------------------------------------------------------------
alter table public.prestamos
  add column if not exists estado text not null default 'activo';

alter table public.prestamos
  drop constraint if exists prestamos_estado_check;

alter table public.prestamos
  add constraint prestamos_estado_check
  check (estado in ('activo', 'liquidado'));

create index if not exists prestamos_estado_idx on public.prestamos (estado);

-- ------------------------------------------------------------
-- 2) Función: liquidar_y_registrar_prestamo
-- security definer: ejecuta como dueño y sortea RLS para escribir.
-- Las escrituras se acotan a las filas de user_id = auth.uid().
-- ------------------------------------------------------------
create or replace function public.liquidar_y_registrar_prestamo(
  p_cliente_id uuid,
  p_monto numeric,
  p_interes_porcentaje numeric,
  p_frecuencia text,
  p_numero_cuotas integer,
  p_fecha_inicio date,
  p_fecha_liquidacion date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prestamo_id uuid;
  v_total numeric(12, 2);
  v_cuota_base numeric(12, 2);
  v_ultima_cuota numeric(12, 2);
  v_i integer;
  v_fecha_cuota date;
  v_monto_restante numeric(12, 2);
  v_saldo_liquidado numeric(12, 2) := 0;
  v_prestamos_liquidados uuid[] := '{}';
  v_iter record;
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;
  if p_interes_porcentaje is null or p_interes_porcentaje < 0 then
    raise exception 'El porcentaje de interes no puede ser negativo';
  end if;
  if p_numero_cuotas is null or p_numero_cuotas <= 0 then
    raise exception 'El numero de cuotas debe ser mayor a cero';
  end if;
  if not exists (
    select 1 from public.clientes
     where id = p_cliente_id and user_id = auth.uid()
  ) then
    raise exception 'Cliente no encontrado';
  end if;

  -- Liquidar cuotas pendientes del cliente (bloqueadas frente a cobros concurrentes).
  for v_iter in
    select q.id as cuota_id,
           q.prestamo_id,
           q.monto,
           q.saldo_pendiente
      from public.cuotas q
      join public.prestamos p on p.id = q.prestamo_id
     where p.cliente_id = p_cliente_id
       and p.user_id = auth.uid()
       and q.estado <> 'pagado'
     for update of q
  loop
    v_monto_restante := round(v_iter.saldo_pendiente, 2);
    v_saldo_liquidado := v_saldo_liquidado + v_monto_restante;

    update public.cuotas
       set saldo_pendiente = 0,
           monto_pagado = v_iter.monto,
           estado = 'pagado',
           fecha_pago = now()
     where id = v_iter.cuota_id;

    if v_monto_restante > 0 then
      insert into public.pagos (cuota_id, prestamo_id, monto, fecha_pago, user_id)
      values (v_iter.cuota_id, v_iter.prestamo_id, v_monto_restante, p_fecha_liquidacion, auth.uid());
    end if;

    if not (v_prestamos_liquidados @> array[v_iter.prestamo_id]) then
      v_prestamos_liquidados := array_append(v_prestamos_liquidados, v_iter.prestamo_id);
    end if;
  end loop;

  if v_saldo_liquidado > 0 and p_monto < v_saldo_liquidado then
    raise exception 'El monto del nuevo prestamo es menor al saldo pendiente por liquidar (S/ %)', v_saldo_liquidado;
  end if;

  if array_length(v_prestamos_liquidados, 1) > 0 then
    update public.prestamos
       set estado = 'liquidado',
           saldo_pendiente = 0
     where id = any(v_prestamos_liquidados)
       and user_id = auth.uid();
  end if;

  -- Nuevo préstamo (idéntico a registrar_prestamo: floor + última cuota ajustada).
  v_total := p_monto + round((p_monto * p_interes_porcentaje / 100.0), 2);
  v_cuota_base := floor((v_total / p_numero_cuotas) * 100) / 100;
  v_ultima_cuota := v_total - (v_cuota_base * (p_numero_cuotas - 1));

  if v_cuota_base < 0.01 then
    raise exception 'Monto muy bajo para el numero de cuotas';
  end if;

  insert into public.prestamos (
    cliente_id, monto, interes_porcentaje, frecuencia,
    numero_cuotas, fecha_inicio, monto_total, saldo_pendiente, user_id
  ) values (
    p_cliente_id, p_monto, p_interes_porcentaje, p_frecuencia,
    p_numero_cuotas, p_fecha_inicio, v_total, v_total, auth.uid()
  )
  returning id into v_prestamo_id;

  for v_i in 1 .. p_numero_cuotas loop
    case p_frecuencia
      when 'diario' then
        v_fecha_cuota := p_fecha_inicio + (v_i * 1)::integer;
      when 'semanal' then
        v_fecha_cuota := p_fecha_inicio + (v_i * 7)::integer;
      when 'quincenal' then
        v_fecha_cuota := p_fecha_inicio + (v_i * 15)::integer;
      when 'mensual' then
        v_fecha_cuota := p_fecha_inicio + make_interval(months => v_i);
      else
        raise exception 'Frecuencia invalida';
    end case;

    insert into public.cuotas (
      prestamo_id, numero, monto, fecha_vencimiento, saldo_pendiente, user_id
    ) values (
      v_prestamo_id,
      v_i,
      case when v_i = p_numero_cuotas then v_ultima_cuota else v_cuota_base end,
      v_fecha_cuota,
      case when v_i = p_numero_cuotas then v_ultima_cuota else v_cuota_base end,
      auth.uid()
    );
  end loop;

  return v_prestamo_id;
end;
$$;

revoke execute on function public.liquidar_y_registrar_prestamo(uuid, numeric, numeric, text, integer, date, date) from anon;
grant execute on function public.liquidar_y_registrar_prestamo(uuid, numeric, numeric, text, integer, date, date) to authenticated;