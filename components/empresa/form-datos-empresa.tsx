"use client";

import { useActionState, useState } from "react";
import { Boton } from "@/components/ui/boton";
import { normalizarCuit, verificadorCuitCierra } from "@/lib/cuit";
import {
  CONDICIONES_IVA,
  TOPE_EMPRESA,
  mascaraCuit,
  type DatosEmpresa,
  type EstadoEmpresa,
} from "@/lib/datos-empresa";

const INICIAL: EstadoEmpresa = {};

const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink disabled:bg-surface disabled:text-ink-40";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

// Los datos de la empresa: el MISMO formulario en Mi cuenta (el dueño) y en
// la ficha de /fidelli (cuando los carga Fidelli por él). Cambia la acción,
// que viene por props; las dos terminan en guardar_datos_empresa().
//
// Los seis campos son controlados a propósito: React vacía los campos no
// controlados de un <form action> al terminar la acción, también cuando
// vuelve con un error, y perder lo escrito por un CUIT a medias es lo
// contrario de lo que el mensaje pide corregir.
export function FormDatosEmpresa({
  accion,
  inicial,
  ayuda,
  deshabilitado = false,
}: {
  accion: (prev: EstadoEmpresa, formData: FormData) => Promise<EstadoEmpresa>;
  inicial: DatosEmpresa;
  ayuda: string;
  deshabilitado?: boolean;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, INICIAL);
  const [razonSocial, setRazonSocial] = useState(inicial.razonSocial ?? "");
  const [cuit, setCuit] = useState(mascaraCuit(inicial.cuit ?? ""));
  const [condicionIva, setCondicionIva] = useState(inicial.condicionIva ?? "");
  const [domicilio, setDomicilio] = useState(inicial.domicilio ?? "");
  const [telefono, setTelefono] = useState(inicial.telefono ?? "");
  const [email, setEmail] = useState(inicial.email ?? "");

  // Advierte, nunca bloquea — igual que el CUIT de un cliente: once números
  // con el verificador que no cierra es casi seguro un número mal copiado.
  // Con menos ni se evalúa: puede estar a mitad de tipeo.
  const cuitDigitos = normalizarCuit(cuit);
  const cuitDudoso = cuitDigitos.length === 11 && !verificadorCuitCierra(cuitDigitos);

  return (
    <form action={enviar} className="flex flex-col gap-4">
      <p className="text-ui text-ink-60">{ayuda}</p>

      {estado.error && (
        <p role="alert" className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue">
          {estado.error}
        </p>
      )}
      {estado.ok && (
        <p className="rounded-md bg-success-soft px-3.5 py-3 text-ui text-success">{estado.ok}</p>
      )}

      <div>
        <label htmlFor="empresa-razon-social" className={CLASE_LABEL}>
          Razón social
        </label>
        <input
          id="empresa-razon-social"
          name="razon_social"
          autoComplete="off"
          maxLength={TOPE_EMPRESA.razonSocial}
          value={razonSocial}
          onChange={(e) => setRazonSocial(e.target.value)}
          disabled={deshabilitado}
          className={CLASE_CAMPO}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="empresa-cuit" className={CLASE_LABEL}>
            CUIT
          </label>
          <input
            id="empresa-cuit"
            name="cuit"
            inputMode="numeric"
            autoComplete="off"
            maxLength={13}
            value={cuit}
            onChange={(e) => setCuit(mascaraCuit(e.target.value))}
            disabled={deshabilitado}
            className={`${CLASE_CAMPO} tabular-nums`}
          />
        </div>
        <div>
          <label htmlFor="empresa-condicion-iva" className={CLASE_LABEL}>
            Condición frente al IVA
          </label>
          <select
            id="empresa-condicion-iva"
            name="condicion_iva"
            value={condicionIva}
            onChange={(e) => setCondicionIva(e.target.value)}
            disabled={deshabilitado}
            className={CLASE_CAMPO}
          >
            <option value="">Sin especificar</option>
            {CONDICIONES_IVA.map((c) => (
              <option key={c.clave} value={c.clave}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>
      {cuitDudoso && (
        <p className="rounded-md bg-urgente-soft px-3.5 py-3 text-ui text-urgente">
          Ese número no parece un CUIT: el dígito verificador no cierra. Revisalo — si es el
          de la constancia, guardá igual.
        </p>
      )}

      <div>
        <label htmlFor="empresa-domicilio" className={CLASE_LABEL}>
          Domicilio
        </label>
        <input
          id="empresa-domicilio"
          name="domicilio"
          autoComplete="off"
          maxLength={TOPE_EMPRESA.domicilio}
          value={domicilio}
          onChange={(e) => setDomicilio(e.target.value)}
          disabled={deshabilitado}
          className={CLASE_CAMPO}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="empresa-telefono" className={CLASE_LABEL}>
            Teléfono
          </label>
          <input
            id="empresa-telefono"
            name="telefono"
            inputMode="tel"
            autoComplete="off"
            maxLength={TOPE_EMPRESA.telefono}
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            disabled={deshabilitado}
            className={`${CLASE_CAMPO} tabular-nums`}
          />
        </div>
        <div>
          <label htmlFor="empresa-email" className={CLASE_LABEL}>
            Email
          </label>
          <input
            id="empresa-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            maxLength={TOPE_EMPRESA.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={deshabilitado}
            className={CLASE_CAMPO}
          />
        </div>
      </div>

      {/* Ancho fijo: el texto cambia al enviarse y el botón no salta. */}
      <Boton
        type="submit"
        variante="secundario"
        tam="lg"
        disabled={pendiente || deshabilitado}
        className="w-full sm:w-[130px]"
      >
        {pendiente ? "Guardando…" : "Guardar"}
      </Boton>
    </form>
  );
}
