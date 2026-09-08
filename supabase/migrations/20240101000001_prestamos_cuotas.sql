-- ============================================================
-- Módulo de Préstamos: tablas prestamos y cuotas
-- Ejecutar en el SQL Editor de Supabase (o consola de migraciones).
-- ============================================================

-- ------------------------------------------------------------
-- clientes: asegurar RLS y permisos para el rol anon
-- (anónimos pueden listar y registrar clientes)
-- ------------------------------------------------------------
alter table public.clientes enable row level security;

create policy if not exists "Clientes anon SELECT"
  on public.clientes for select
  to anon, authenticated
  using (true);

create policy if not exists "Clientes anon INSERT"
  on public.clientes for insert
  to anon, authenticated
  with check (true);

-- ------------------------------------------------------------
-- tabla: prestamos
-- ------------------------------------------------------------
create table if not exists public.prestamos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  monto numeric(12,2) not null check (monto > 0),
  interes_porcentaje numeric(5,2) not null check (interes_porcentaje >= 0),
  frecuencia text not null check (frecuencia in ('diario', 'semanal', 'quincenal', 'mensual')),
  numero_cuotas integer not null check (numero_cuotas > 0),
  fecha_inicio date not null,
  monto_total numeric(12,2) not null check (monto_total >= monto),
  saldo_pendiente numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists prestamos_cliente_id_idx on public.prestamos (cliente_id);

-- ------------------------------------------------------------
-- tabla: cuotas
-- ------------------------------------------------------------
create table if not exists public.cuotas (
  id uuid primary key default gen_random_uuid(),
  prestamo_id uuid not null references public.prestamos(id) on delete cascade,
  numero integer not null check (numero > 0),
  monto numeric(12,2) not null check (monto > 0),
  fecha_programada date not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'pagada', 'atrasada')),
  created_at timestamptz not null default now(),
  unique (prestamo_id, numero)
);

create index if not exists cuotas_prestamo_id_idx on public.cuotas (prestamo_id);

-- ------------------------------------------------------------
-- RLS: prestamos y cuotas
-- El acceso se hace a traves de la funcion seguridad definer
-- registrar_prestamo(); SIGUE ACCESO LECTURA para anon.
-- ------------------------------------------------------------
alter table public.prestamos enable row level security;
alter table public.cuotas enable row level security;

create policy if not exists "Prestamos anon SELECT"
  on public.prestamos for select
  to anon, authenticated
  using (true);

create policy if not exists "Cuotas anon SELECT"
  on public.cuotas for select
  to anon, authenticated
  using (true);

-- ------------------------------------------------------------
-- Funcion: registrar_prestamo
-- Inserta el prestamo y genera sus cuotas de forma atomica.
-- security definer: ejecuta como dueno (postgres) y sortea RLS
-- para la escritura. Fechas: la cuota i vence al periodo i.
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

    insert into public.cuotas (prestamo_id, numero, monto, fecha_programada)
    values (
      v_prestamo_id,
      v_i,
      case when v_i = p_numero_cuotas then v_ultima_cuota else v_cuota_base end,
      v_fecha_cuota
    );
  end loop;

  return v_prestamo_id;
end;
$$;

grant execute on function public.registrar_prestamo(uuid, numeric, numeric, text, integer, date)
  to anon, authenticated;