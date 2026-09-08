-- ============================================================
-- Módulo de Métricas del Dashboard (Backend)
-- Ejecutar DESPUÉS de 20240101000003_pagos_refactor.sql
-- 1) recaudo_dia(p_dia): SUM(monto) de pagos en el día (rango >= y <=).
-- 2) metricas_dashboard(p_hoy): agrega en la base (sin depender del
--    cliente) las métricas del Dashboard:
--      recaudo_dia, prestamos_activos, monto_inicial_activo,
--      capital_en_calle, total_por_cobrar, ganancia_proyectada,
--      ganancia_real_cobrada
-- Nota: p_hoy es el día calendario del operador (YYYY-MM-DD). Si es NULL
-- se usa CURRENT_DATE. Recibe el día desde el cliente para ignorar
-- diferencias de zona horaria servidor/cliente.
-- ============================================================

-- ------------------------------------------------------------
-- Recaudo del día: SUM(monto) con rango del día.
-- Evita comparaciones de texto exactas; filtra >= día y <= día.
-- ------------------------------------------------------------
create or replace function public.recaudo_dia(p_dia date default null)
returns numeric(12, 2)
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(round(sum(monto), 2), 0)
    from public.pagos
   where fecha_pago >= coalesce(p_dia, current_date)
     and fecha_pago <= coalesce(p_dia, current_date);
$$;

grant execute on function public.recaudo_dia(date)
  to anon, authenticated;

-- ------------------------------------------------------------
-- Métricas agregadas del Dashboard (una sola fila)
-- ------------------------------------------------------------
create or replace function public.metricas_dashboard(p_hoy date default null)
returns table (
  hoy date,
  recaudo_dia numeric(12, 2),
  prestamos_activos integer,
  monto_inicial_activo numeric(12, 2),
  capital_en_calle numeric(12, 2),
  total_por_cobrar numeric(12, 2),
  ganancia_proyectada numeric(12, 2),
  ganancia_real_cobrada numeric(12, 2)
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dia date := coalesce(p_hoy, current_date);
  v_prestamos_activos integer;
  v_monto_inicial numeric(12, 2);
  v_ganancia_proyectada numeric(12, 2);
  v_capital_recuperado numeric(12, 2);
begin
  select count(*),
         coalesce(round(sum(monto), 2), 0),
         coalesce(round(sum(monto_total - monto), 2), 0)
    into v_prestamos_activos, v_monto_inicial, v_ganancia_proyectada
    from public.prestamos
   where saldo_pendiente > 0;

  -- Capital recuperado: parte de principal pagada por cuota (préstamos activos)
  select coalesce(round(sum(
    case when c.monto > 0
      then (p.monto / p.numero_cuotas) * (least(coalesce(c.monto_pagado, 0), c.monto) / c.monto)
      else 0 end
  ), 2), 0)
    into v_capital_recuperado
    from public.cuotas c
    join public.prestamos p on p.id = c.prestamo_id
   where p.saldo_pendiente > 0;

  hoy := v_dia;
  recaudo_dia := (
    select coalesce(round(sum(monto), 2), 0)
      from public.pagos
     where fecha_pago >= v_dia and fecha_pago <= v_dia
  );
  prestamos_activos := v_prestamos_activos;
  monto_inicial_activo := v_monto_inicial;
  capital_en_calle := greatest(v_monto_inicial - v_capital_recuperado, 0);
  total_por_cobrar := (
    select coalesce(round(sum(monto - coalesce(monto_pagado, 0)), 2), 0)
      from public.cuotas c
      join public.prestamos p on p.id = c.prestamo_id
     where c.estado <> 'pagado'
       and p.saldo_pendiente > 0
  );
  ganancia_proyectada := v_ganancia_proyectada;
  ganancia_real_cobrada := (
    select coalesce(round(sum(
      pa.monto * (1 - (p.monto / p.numero_cuotas) / c.monto)
    ), 2), 0)
      from public.pagos pa
      join public.cuotas c on c.id = pa.cuota_id
      join public.prestamos p on p.id = c.prestamo_id
     where c.monto > 0
  );
  return next;
end;
$$;

grant execute on function public.metricas_dashboard(date)
  to anon, authenticated;