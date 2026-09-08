"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase, hasAuthConfig } from "@/lib/supabase-server";

export type ResultadoCobro =
  | { ok: true; error: null }
  | { ok: false; error: string };

export async function registrarCobro(input: {
  cuotaId: string;
  monto: number;
  fecha: string;
}): Promise<ResultadoCobro> {
  if (!hasAuthConfig) {
    return { ok: false, error: "Supabase no configurado" };
  }

  const supabase = await createServerSupabase();

  const { error } = await supabase.rpc("pagar_cuota", {
    p_cuota_id: input.cuotaId,
    p_monto: input.monto,
    p_fecha: input.fecha,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/");
  revalidatePath("/prestamos");
  revalidatePath("/cobros");
  revalidatePath("/dashboard");

  return { ok: true, error: null };
}