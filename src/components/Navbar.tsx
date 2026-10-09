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
  { href: "/reportes", label: "Reportes" },
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
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur print:hidden">
      <nav className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-2 font-semibold text-slate-100"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-400 text-sm font-bold text-white shadow-lg shadow-emerald-950/40">
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
                  ? "bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-950/40"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
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
            className="shrink-0 whitespace-nowrap rounded-lg border border-emerald-600/40 px-3 py-2 text-sm font-medium text-emerald-400 transition hover:bg-emerald-950/40 hover:text-emerald-300"
          >
            Cerrar sesión
          </button>
        )}
      </nav>
    </header>
  );
}