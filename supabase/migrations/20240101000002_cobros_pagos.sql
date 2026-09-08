-- ============================================================
-- Módulo de Cobros del Día (Ruta Diaria)
-- Ejecutar DESPUÉS de 20240101000001_prestamos_cuotas.sql
-- 1) fecha_programada -> fecha_vencimiento
-- 2) estado 'parcial' + columna saldo_pendiente en cuotas
-- 3) tabla pagos (historial) y función pagar_cuota
-- 4) registrar_prestamo actualizado a la nueva columna
-- ============================================================

-- ------------------------------------------------------------
-- cuotas: renombrar columna de vencimiento
-- ------------------------------------------------------------
alter table public.cuotas rename column fecha_programada to fecha_vencimiento;

-- ------------------------------------------------------------
-- cuotas: ampliar estados (+ 'parcial') y saldo pendiente
-- ------------------------------------------------------------
alter table public.cuotas drop constraint cuotas_estado_check;

alter table public.cuotas
  add constraint cuotas_estado_check
  check (estado in ('pendiente', 'parcial', 'pagada', 'atrasada'));

alter table public.cuotas add column saldo_pendiente numeric(12,2);

-- Backfill: lo no pagado debe su saldo; lo pagado, cero.
update public.cuotas
set saldo_pendiente = case when estado = 'pagada' then 0 else monto end
where saldo_pendiente is null;

alter table public.cuotas
  alter column saldo_pendiente set not null,
  alter column saldo_pendiente set default 0;

-- ------------------------------------------------------------
-- tabla: pagos (historial de pagos y abonos)
-- ------------------------------------------------------------
create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  cuota_id uuid not null references public.cuotas(id) on delete cascade,
  prestamo_id uuid not null references public.prestamos(id) on delete cascade,
  monto numeric(12,2) not null check (monto > 0),
  fecha_pago date not null default current_date,
  created_at timestamptz not null default now()
);

create index if not exists pagos_cuota_id_idx on public.pagos (cuota_id);
create index if not exists pagos_prestamo_id_idx on public.pagos (prestamo_id);
create index if not exists pagos_fecha_pago_idx on public.pagos (fecha_pago);

alter table public.pagos enable row level security;

create policy if not exists "Pagos anon SELECT"
  on public.pagos for select
  to anon, authenticated
  using (true);

-- ------------------------------------------------------------
-- Función: pagar_cuota (pago total o abono parcial)
-- Registra el pago en `pagos`, actualiza saldo/estado de la
-- cuota y descuenta el saldo pendiente del préstamo.
-- ------------------------------------------------------------
create or replace function public.pagar_cuota(p_cuota_id uuid, p_monto numeric)
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

  v_nuevo_saldo := v_saldo - p_monto;
  v_estado := case when v_nuevo_saldo = 0 then 'pagada' else 'parcial' end;

  update public.cuotas
     set saldo_pendiente = v_nuevo_saldo,
         estado = v_estado
   where id = p_cuota_id;

  update public.prestamos
     set saldo_pendiente = greatest(saldo_pendiente - p_monto, 0)
   where id = v_prestamo_id;

  insert into public.pagos (cuota_id, prestamo_id, monto, fecha_pago)
  values (p_cuota_id, v_prestamo_id, p_monto, current_date);

  return p_cuota_id;
end;
$$;

grant execute on function public.pagar_cuota(uuid, numeric)
  to anon, authenticated;

-- ------------------------------------------------------------
-- registrar_prestamo actualizado:
-- usa fecha_vencimiento y fija saldo_pendiente por cuota.
-- ------------------------------------------------------------
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
  if p_monto <= 0 then
    raise exception 'El monto debe ser mayor a cero';
  end if;
  if p_interes_porcentaje < 0 then
    raise exception 'El porcentaje de interes no puede ser negativo';
  end if;
  if p_numero_cuotas <= 0 then
    raise exception 'El numero de cuotas debe ser mayor a cero';
  end if;

  v_total := p_monto + round((p_monto * p_interes_porcentaje / 100.0), 2);
  v_cuota_base := round(v_total / p_numero_cuotas, 2);
  v_ultima_cuota := v_total - (v_cuota_base * (p_numero_cuotas - 1));

  insert into public.prestamos (
    cliente_id, monto, interes_porcentaje, frecuencia,
    numero_cuotas, fecha_inicio, monto_total, saldo_pendiente
  ) values (
    p_cliente_id, p_monto, p_interes_porcentaje, p_frecuencia,
    p_numero_cuotas, p_fecha_inicio, v_total, v_total
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
      prestamo_id, numero, monto, fecha_vencimiento, saldo_pendiente
    ) values (
      v_prestamo_id,
      v_i,
      case when v_i = p_numero_cuotas then v_ultima_cuota else v_cuota_base end,
      v_fecha_cuota,
      case when v_i = p_numero_cuotas then v_ultima_cuota else v_cuota_base end
    );
  end loop;

  return v_prestamo_id;
end;
$$;

grant execute on function public.registrar_prestamo(uuid, numeric, numeric, text, integer, date)
  to anon, authenticated;