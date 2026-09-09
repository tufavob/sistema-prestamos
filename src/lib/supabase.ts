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