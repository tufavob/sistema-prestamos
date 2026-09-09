-- ============================================================
-- Regla de negocio: Bloqueo por Deuda Activa
-- Registrar un préstamo exige que el cliente NO tenga cuotas
-- pendientes (estado <> 'pagado') en ningún préstamo previo.
-- ============================================================

create or replace function public.registrar_prestamo(
  p_cliente_id uuid,
  p_monto numeric,
  p_interes_porcentaje numeric,
  p_frecuencia text,
  p_numero_cuotas integer,
  p_fecha_inicio date
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

  -- Bloqueo por deuda activa: cuotas sin pagar en cualquiera de sus préstamos.
  if exists (
    select 1
      from public.cuotas q
      join public.prestamos p on p.id = q.prestamo_id
     where p.cliente_id = p_cliente_id
       and p.user_id = auth.uid()
       and q.estado <> 'pagado'
  ) then
    raise exception 'El cliente tiene un prestamo vigente con cuotas pendientes';
  end if;

  v_total := p_monto + round((p_monto * p_interes_porcentaje / 100.0), 2);
  -- Redondeo hacia abajo: garantiza base*n <= total, ultima cuota >= base.
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

revoke execute on function public.registrar_prestamo(uuid, numeric, numeric, text, integer, date) from anon;
grant execute on function public.registrar_prestamo(uuid, numeric, numeric, text, integer, date) to authenticated;