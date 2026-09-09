import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Cliente = {
  id: string;
  created_at: string;
  dni: string;
  nombres: string;
  apellidos: string;
  telefono: string | null;
  direccion: string | null;
  referencia: string | null;
};

export type ClienteInsert = {
  dni: string;
  nombres: string;
  apellidos: string;
  telefono?: string | null;
  direccion?: string | null;
  referencia?: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const createClient = () => createBrowserClient(supabaseUrl!, supabaseAnonKey!);

export const hasAuthConfig = Boolean(supabaseUrl && supabaseAnonKey);

export async function tieneDeudaActiva(
  supabase: SupabaseClient,
  clienteId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("cuotas")
    .select("id, prestamos!inner(cliente_id)", { count: "exact", head: true })
    .eq("prestamos.cliente_id", clienteId)
    .neq("estado", "pagado");

  if (error) {
    console.error("Error verificando deuda activa:", error);
    return false;
  }

  return (count ?? 0) > 0;
}

export async function obtenerSaldoPendienteCliente(
  supabase: SupabaseClient,
  clienteId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("cuotas")
    .select("saldo_pendiente, prestamos!inner(cliente_id)")
    .eq("prestamos.cliente_id", clienteId)
    .neq("estado", "pagado");

  if (error) {
    console.error("Error consultando saldo pendiente:", error);
    return 0;
  }

  const total = (data ?? []).reduce(
    (suma, c) => suma + Number((c as { saldo_pendiente: number }).saldo_pendiente ?? 0),
    0,
  );
  return Math.round(total * 100) / 100;
}