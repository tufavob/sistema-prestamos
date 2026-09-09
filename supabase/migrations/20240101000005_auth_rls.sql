-- ============================================================
-- Módulo de Autenticación y RLS por usuario (multi-tenant single-op)
-- Ejecutar DESPUÉS de 20240101000004_metricas_dashboard.sql
-- Requiere: al menos un usuario creado en Supabase Auth (Auth > Users)
-- si ya existen datos (para poder asignarle la propiedad de los mismos).
--
-- 1) clientes/prestamos/cuotas/pagos: columna user_id (dueno de la fila)
--    + backfill al primer usuario + NOT NULL + default auth.uid()
-- 2) RLS por auth.uid() (reemplaza las policies anon "usar true")
-- 3) RPCs de escritura validan propiedad y registran user_id
-- 4) metricas/recaudo pasan a security invoker (RLS restringe por usuario)
-- 5) revoke de permisos a anon (solo authenticated)
-- 6) corrección del redondeo de la última cuota (floor) y validaciones
-- 7) índice único por DNI (evita duplicados) si no existen duplicados
-- ============================================================

-- ------------------------------------------------------------
-- 1) user_id en las 4 tablas
-- ------------------------------------------------------------
alter table public.clientes  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.prestamos  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.cuotas    add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.pagos     add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Si hay datos pero no hay ningún usuario de auth, impedir continuar.
do $$
declare v_clientes integer;
begin
  select count(*) into v_clientes from public.clientes;
  if v_clientes > 0 and not exists (select 1 from auth.users limit 1) then
    raise exception 'Primero crea un usuario en Supabase (Auth > Users) y vuelve a aplicar esta migración para que los datos existentes se asignen a ese usuario.';
  end if;
end $$;

-- Backfill: los registros existentes pasan a ser del primer usuario.
update public.clientes c
   set user_id = (select id from auth.users order by created_at asc limit 1)
 where c.user_id is null;

update public.prestamos p
   set user_id = c.user_id
  from public.clientes c
 where c.id = p.cliente_id
   and p.user_id is null;

update public.cuotas q
   set user_id = p.user_id
  from public.prestamos p
 where p.id = q.prestamo_id
   and q.user_id is null;

update public.pagos g
   set user_id = q.user_id
  from public.cuotas q
 where q.id = g.cuota_id
   and g.user_id is null;

alter table public.clientes  alter column user_id set not null, alter column user_id set default auth.uid();
alter table public.prestamos alter column user_id set not null, alter column user_id set default auth.uid();
alter table public.cuotas    alter column user_id set not null, alter column user_id set default auth.uid();
alter table public.pagos     alter column user_id set not null, alter column user_id set default auth.uid();

create index if not exists clientes_user_id_idx  on public.clientes (user_id);
create index if not exists prestamos_user_id_idx on public.prestamos (user_id);
create index if not exists cuotas_user_id_idx    on public.cuotas (user_id);
create index if not exists pagos_user_id_idx     on public.pagos (user_id);

-- ------------------------------------------------------------
-- 2) RLS por dueño (reemplaza las policies anon "usar true")
-- ------------------------------------------------------------
drop policy if exists "Clientes anon SELECT"  on public.clientes;
drop policy if exists "Clientes anon INSERT"  on public.clientes;
drop policy if exists "Prestamos anon SELECT" on public.prestamos;
drop policy if exists "Cuotas anon SELECT"    on public.cuotas;
drop policy if exists "Pagos anon SELECT"     on public.pagos;

create policy "Clientes owner SELECT"
  on public.clientes for select
  to authenticated
  using (user_id = auth.uid());

create policy "Clientes owner INSERT"
  on public.clientes for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Prestamos owner SELECT"
  on public.prestamos for select
  to authenticated
  using (user_id = auth.uid());

create policy "Cuotas owner SELECT"
  on public.cuotas for select
  to authenticated
  using (user_id = auth.uid());

create policy "Pagos owner SELECT"
  on public.pagos for select
  to authenticated
  using (user_id = auth.uid());

-- Defensa en profundidad: sin permisos para anon (solo via RLS queda en 0 filas).
revoke select on public.clientes, public.prestamos, public.cuotas, public.pagos from anon;
revoke insert, update, delete on public.clientes, public.prestamos, public.cuotas, public.pagos from anon;
grant select on public.clientes, public.prestamos, public.cuotas, public.pagos to authenticated;
grant insert on public.clientes to authenticated;

-- ------------------------------------------------------------
-- 3a) registrar_prestamo: propiedad + user_id + redondeo floor
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

-- ------------------------------------------------------------
-- 3b) pagar_cuota: validación de propiedad + user_id en pagos
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

  -- La cuota, su préstamo y su cliente deben pertenecer al usuario.
  select q.prestamo_id, q.saldo_pendiente
    into v_prestamo_id, v_saldo
    from public.cuotas q
    join public.prestamos p on p.id = q.prestamo_id
    join public.clientes c on c.id = p.cliente_id
   where q.id = p_cuota_id
     and c.user_id = auth.uid()
     and q.user_id = auth.uid()
   for update of q;

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

  insert into public.pagos (cuota_id, prestamo_id, monto, fecha_pago, user_id)
  values (p_cuota_id, v_prestamo_id, p_monto, p_fecha, auth.uid());

  return p_cuota_id;
end;
$$;

revoke execute on function public.pagar_cuota(uuid, numeric, date) from anon;
grant execute on function public.pagar_cuota(uuid, numeric, date) to authenticated;

-- ------------------------------------------------------------
-- 4) metricas/recaudo: security invoker -> RLS restringe por usuario
-- ------------------------------------------------------------
create or replace function public.recaudo_dia(p_dia date default null)
returns numeric(12, 2)
language sql
security invoker
set search_path = public
stable
as $$
  select coalesce(round(sum(monto), 2), 0)
    from public.pagos
   where fecha_pago >= coalesce(p_dia, current_date)
     and fecha_pago <= coalesce(p_dia, current_date);
$$;

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
security invoker
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

revoke execute on function public.recaudo_dia(date) from anon;
revoke execute on function public.metricas_dashboard(date) from anon;
grant execute on function public.recaudo_dia(date) to authenticated;
grant execute on function public.metricas_dashboard(date) to authenticated;

-- ------------------------------------------------------------
-- 5) Índice único por DNI (si no hay duplicados existentes)
-- ------------------------------------------------------------
do $$
declare v_dups integer;
begin
  select count(*) into v_dups
    from (select lower(dni) as d from public.clientes group by lower(dni) having count(*) > 1) s;
  if v_dups = 0 then
    create unique index if not exists clientes_dni_unq on public.clientes (lower(dni));
  else
    raise warning 'Existen % DNI duplicados; no se crea el índice único. Revisa los datos manualmente.', v_dups;
  end if;
end $$;