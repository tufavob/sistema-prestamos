import { createBrowserClient } from "@supabase/ssr";

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