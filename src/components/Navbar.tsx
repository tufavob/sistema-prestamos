"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { createClient, hasAuthConfig } from "@/lib/supabase";

const supabase = hasAuthConfig ? createClient() : null;

const ENLACES = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/", label: "Clientes" },
  { href: "/prestamos", label: "Préstamos" },
  { href: "/cobros", label: "Cobros del Día" },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const [sesion, setSesion] = useState<Session | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let activo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (activo) setSesion(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (activo) setSesion(s);
    });
    return () => {
      activo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const cerrarSesion = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const estaActivo = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <nav className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
            S
          </span>
          <span className="hidden whitespace-nowrap sm:block">
            Sistema de prestamos
          </span>
        </Link>

        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {ENLACES.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={estaActivo(l.href) ? "page" : undefined}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                estaActivo(l.href)
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        {sesion && (
          <button
            type="button"
            onClick={cerrarSesion}
            className="shrink-0 whitespace-nowrap rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
          >
            Cerrar sesión
          </button>
        )}
      </nav>
    </header>
  );
}