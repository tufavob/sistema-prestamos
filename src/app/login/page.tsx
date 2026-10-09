"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient, hasAuthConfig } from "@/lib/supabase";

const supabase = hasAuthConfig ? createClient() : null;

const inputCls =
  "w-full rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

const labelCls = "mb-1.5 block text-sm font-medium text-slate-400";

const FONDO_GRADIENTE =
  "flex min-h-screen w-full items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-950/40 via-slate-950 to-slate-950 p-4 text-slate-100";

function traducirErrorLogin(msg: string): string {
  if (/invalid login credentials/i.test(msg)) {
    return "Credenciales incorrectas. Verifica tu correo y contraseña.";
  }
  if (/email not confirmed/i.test(msg)) {
    return "Tu correo aún no está confirmado.";
  }
  return msg;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destinoSeguro = () => {
    const raw = new URLSearchParams(window.location.search).get("next");
    if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
    return "/dashboard";
  };

  if (!supabase) {
    return (
      <main className={FONDO_GRADIENTE}>
        <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-800/70 p-6 shadow-2xl backdrop-blur">
          <p className="text-sm text-slate-200">
            Configura las variables{" "}
            <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
            <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> en{" "}
            <code className="font-mono">.env.local</code> para conectar a
            Supabase.
          </p>
        </div>
      </main>
    );
  }

  const iniciarSesion = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setEnviando(false);
    if (error) {
      setError(traducirErrorLogin(error.message));
      return;
    }

    router.replace(destinoSeguro());
    router.refresh();
  };

  return (
    <main className={FONDO_GRADIENTE}>
      <div className="max-w-md w-full rounded-2xl border border-slate-800 border-t-4 border-t-emerald-500 bg-slate-900/90 p-8 text-slate-100 shadow-2xl backdrop-blur-md">
        <div className="relative mx-auto mb-4 h-28 w-28">
          <div className="absolute -inset-1 animate-pulse rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 opacity-75 blur-md"></div>
          <img
            src="https://www.shutterstock.com/image-vector/money-logo-design-vector-illustrative-260nw-2007522596.jpg"
            alt="Sistema de Préstamos"
            className="relative h-28 w-28 rounded-full border-2 border-emerald-400 bg-slate-900 p-1 object-cover shadow-2xl"
          />
        </div>

        <div className="mb-6 flex flex-col items-center gap-1 text-center">
          <h1 className="text-xl font-bold tracking-tight text-slate-100">
            Iniciar sesión
          </h1>
          <p className="text-sm font-medium text-slate-400">
            Sistema de préstamos y recaudos
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-800 bg-red-950/60 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={iniciarSesion} noValidate className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className={labelCls}>
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tucorreo@ejemplo.com"
            />
          </div>

          <div>
            <label htmlFor="password" className={labelCls}>
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className={inputCls}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-950/50 transition hover:from-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enviando ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs font-medium text-slate-500">
          El acceso lo administra el propietario del sistema.{" "}
          <Link href="/" className="underline text-emerald-400 hover:text-emerald-300">
            Ir a la portada
          </Link>
        </p>
      </div>
    </main>
  );
}