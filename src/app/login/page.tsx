"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient, hasAuthConfig } from "@/lib/supabase";

const supabase = hasAuthConfig ? createClient() : null;

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-200";

const labelCls =
  "mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300";

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
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-4 py-16 sm:px-6">
        <div className="w-full max-w-md rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Configura las variables{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> en{" "}
          <code className="font-mono">.env.local</code> para conectar a Supabase.
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900 text-lg font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
            S
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Iniciar sesión
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Sistema de préstamos
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
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
            className="mt-1 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-6 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {enviando ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
          El acceso lo administra el propietario del sistema.{" "}
          <Link href="/" className="underline hover:text-zinc-900 dark:hover:text-zinc-50">
            Ir a la portada
          </Link>
        </p>
      </div>
    </main>
  );
}