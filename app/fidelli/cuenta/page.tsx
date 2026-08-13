import type { Metadata } from "next";
import { exigirRol } from "@/lib/auth/session";
import { PanelFicha, Dato } from "@/components/fidelli/ficha/panel-dato";
import { FormClave } from "@/components/fidelli/form-clave";

export const metadata: Metadata = { title: "Mi cuenta" };

// Mínima a propósito: quién sos y cómo cambiar tu contraseña. El equipo
// Fidelli son dos personas y sus cuentas se crean por la API de
// administración, así que no hay nada más que administrar acá — y el
// email no se edita porque cambiarlo dispara un flujo de confirmación por
// mail que todavía no está construido.
export default async function PaginaCuenta() {
  const sesion = await exigirRol("superadmin");

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 font-brand text-h2 font-bold text-ink">Mi cuenta</h1>

      <div className="flex flex-col gap-5">
        <PanelFicha titulo="Tus datos">
          <dl>
            <Dato etiqueta="Nombre">{sesion.nombre}</Dato>
            <Dato etiqueta="Email">{sesion.email}</Dato>
            <Dato etiqueta="Rol">
              <span className="inline-flex items-center rounded-sm border border-line bg-surface px-2 py-0.5 text-label font-semibold tracking-[0.04em] text-ink-60 uppercase">
                superadmin
              </span>
            </Dato>
          </dl>
        </PanelFicha>

        <PanelFicha titulo="Contraseña">
          <div className="py-3">
            <FormClave />
          </div>
        </PanelFicha>
      </div>
    </div>
  );
}
