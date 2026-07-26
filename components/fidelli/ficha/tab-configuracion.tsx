import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PanelFicha, Dato, SinDato } from "./panel-dato";
import type { Tenant } from "./tipos";

// Los mismos cuatro interruptores que ve el lubri en Diseño de experiencia,
// con el mismo nombre: cuando llama por teléfono, los dos miramos la misma
// palabra. Ese es todo el propósito de esta pestaña — poder contestar
// "¿tenés apagado mostrar productos?" sin pedirle una captura.
const CAMPOS = [
  { clave: "mostrar_productos", titulo: "Marcas de productos", porDefecto: true },
  { clave: "mostrar_sucursal", titulo: "Sucursal de cada service", porDefecto: true },
  { clave: "mostrar_fidelizacion", titulo: "Progreso del premio", porDefecto: true },
  {
    clave: "mostrar_observaciones",
    titulo: "Observaciones del service",
    porDefecto: false,
  },
] as const;

const CONTACTOS = [
  { clave: "telefono", etiqueta: "Teléfono" },
  { clave: "whatsapp", etiqueta: "WhatsApp" },
  { clave: "direccion", etiqueta: "Dirección" },
  { clave: "horarios", etiqueta: "Horarios" },
  { clave: "instagram", etiqueta: "Instagram" },
] as const;

export async function TabConfiguracion({ tenant }: { tenant: Tenant }) {
  const supabase = await createClient();

  // config_experiencia es uno a uno con el tenant, pero el .eq() va igual:
  // sin él, un superadmin se traería la primera fila de cualquier lubri.
  const { data } = await supabase
    .from("config_experiencia")
    .select("logo_url, color_primario, campos_visibles, datos_contacto, updated_at")
    .eq("lubricentro_id", tenant.id)
    .maybeSingle();

  const campos = (data?.campos_visibles ?? {}) as Record<string, boolean>;
  const contacto = (data?.datos_contacto ?? {}) as Record<string, string>;
  const color = data?.color_primario ?? "#0A0A0A";

  return (
    <div className="flex flex-col gap-5">
      <p className="text-ui text-ink-60">
        Lo que configuró el lubricentro, tal cual lo ve su cliente. Es solo
        lectura: si hay algo mal, lo cambia él desde su panel.
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        <PanelFicha titulo="Marca">
          <dl>
            <Dato etiqueta="Color primario">
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block size-4 shrink-0 rounded-sm border border-line"
                  style={{ background: color }}
                />
                <span className="font-semibold">{color.toUpperCase()}</span>
              </span>
            </Dato>

            <Dato etiqueta="Logo">
              {data?.logo_url ? (
                <a
                  href={data.logo_url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-ink underline underline-offset-2"
                >
                  cargado — verlo
                </a>
              ) : (
                <SinDato>sin logo: la landing muestra el nombre</SinDato>
              )}
            </Dato>

            <Dato etiqueta="Landing">
              <Link
                href={`/${tenant.slug}`}
                target="_blank"
                className="font-semibold text-ink underline underline-offset-2"
              >
                fidellimotors.app/{tenant.slug}
              </Link>
              {!tenant.activo && (
                <span className="block text-label text-overdue">
                  suspendida: no responde
                </span>
              )}
            </Dato>
          </dl>
        </PanelFicha>

        <PanelFicha titulo="Campos visibles">
          <dl>
            {CAMPOS.map((c) => {
              const encendido = campos[c.clave] ?? c.porDefecto;
              return (
                <Dato key={c.clave} etiqueta={c.titulo}>
                  <span
                    className={
                      encendido ? "font-semibold text-success" : "text-ink-40"
                    }
                  >
                    {encendido ? "encendido" : "apagado"}
                  </span>
                </Dato>
              );
            })}
          </dl>
        </PanelFicha>
      </div>

      <PanelFicha titulo="Datos de contacto de la marca">
        <dl>
          {CONTACTOS.map((c) => (
            <Dato key={c.clave} etiqueta={c.etiqueta}>
              {contacto[c.clave]?.trim() || <SinDato>sin cargar</SinDato>}
            </Dato>
          ))}
        </dl>
      </PanelFicha>
    </div>
  );
}
