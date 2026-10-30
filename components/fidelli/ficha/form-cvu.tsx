"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Boton } from "@/components/ui/boton";
import { CLASE_AYUDA, CLASE_CAMPO, CLASE_ERROR, CLASE_LABEL } from "@/components/fidelli/estilos";
import { emitirCvuDeTenant, type EstadoCuenta } from "@/app/fidelli/[id]/actions";
import { verificarAlias } from "@/app/fidelli/actions";
import { ALIAS_FORMATO, ALIAS_LARGO_MAXIMO, esAliasValido, type EstadoAlias } from "@/lib/cresium/alias";

const INICIAL: EstadoCuenta = {};

// Lo que dice el campo. «Disponible» sale SOLO de nuestra base: Cresium no
// expone una consulta, así que la frase no promete que lo vaya a dar; si lo
// rechaza (EXISTING_ALIAS), la acción lo dice y se prueba con otro.
const VEREDICTO: Record<EstadoAlias, { texto: string; clase: string }> = {
  disponible: { texto: "Libre entre nuestros lubricentros. Cresium lo confirma al emitir.", clase: "text-success" },
  ocupado: { texto: "Ocupado: ya es de otro lubricentro nuestro.", clase: "text-overdue" },
  invalido: { texto: ALIAS_FORMATO, clase: "text-overdue" },
  corto: { texto: ALIAS_FORMATO, clase: "text-overdue" },
  largo: { texto: ALIAS_FORMATO, clase: "text-overdue" },
};

// ============================================================
// Emitir la cuenta de cobro de un tenant, desde la ficha.
//
// Llega con un alias propuesto (el slug sin las palabras genéricas, libre
// en nuestra base); es editable porque quien emite está eligiendo lo que el
// dueño va a tipear en su home banking. Se emite UNA vez: después, la
// tarjeta muestra la cuenta y nada más.
// ============================================================
export function FormCvu({ lubricentroId, sugerido }: { lubricentroId: string; sugerido: string }) {
  const [estado, emitir, emitiendo] = useActionState(emitirCvuDeTenant, INICIAL);
  const [alias, setAlias] = useState(sugerido);
  const [respuesta, setRespuesta] = useState<{ alias: string; estado: EstadoAlias } | null>(null);
  const [consultando, empezar] = useTransition();

  const formatoValido = alias.length > 0 && esAliasValido(alias);
  const veredicto: EstadoAlias | null =
    alias.length === 0 ? null : !formatoValido ? "invalido" : respuesta?.alias === alias ? respuesta.estado : null;
  const verificando = formatoValido && veredicto === null;

  // La disponibilidad, con freno: 300 ms después de la última tecla.
  useEffect(() => {
    if (!formatoValido) return;
    const t = setTimeout(() => {
      empezar(async () => {
        setRespuesta({ alias, estado: await verificarAlias(alias) });
      });
    }, 300);
    return () => clearTimeout(t);
  }, [alias, formatoValido]);

  if (estado.ok) {
    return (
      <div className="flex flex-col gap-2">
        <p className="rounded-md bg-success-soft px-3.5 py-3 text-ui text-success">{estado.ok}</p>
        <p className={CLASE_AYUDA}>Recargá la ficha para ver la cuenta en su lugar.</p>
      </div>
    );
  }

  return (
    <form action={emitir} className="flex flex-col gap-4">
      {estado.error && (
        <p role="alert" className={CLASE_ERROR}>
          {estado.error}
        </p>
      )}
      <input type="hidden" name="lubricentro_id" value={lubricentroId} />
      <div>
        <label htmlFor="alias-cvu" className={CLASE_LABEL}>
          Alias de la cuenta
        </label>
        <input
          id="alias-cvu"
          name="alias"
          value={alias}
          maxLength={ALIAS_LARGO_MAXIMO}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setAlias(e.target.value.toLowerCase().trim())}
          className={`${CLASE_CAMPO} tabular-nums`}
        />
        <p
          aria-live="polite"
          className={`mt-1.5 text-label ${
            verificando ? "text-ink-60" : veredicto ? VEREDICTO[veredicto].clase : "text-ink-60"
          }`}
        >
          {verificando
            ? "Verificando…"
            : veredicto
              ? `${veredicto === "disponible" ? "✓" : "×"} ${VEREDICTO[veredicto].texto}`
              : "Es lo que el dueño va a tipear en su home banking. Se elige una vez y no se cambia."}
        </p>
      </div>
      <Boton
        type="submit"
        tam="lg"
        disabled={emitiendo || veredicto !== "disponible" || consultando}
        className="w-full"
      >
        {emitiendo ? "Emitiendo en Cresium…" : "Emitir la cuenta de cobro"}
      </Boton>
      <p className={CLASE_AYUDA}>
        Crea un CVU dedicado en Cresium a nombre de Fidelli. Desde ese momento el
        lubricentro paga transfiriendo el monto exacto a ese alias, y el pago se
        acredita solo.
      </p>
    </form>
  );
}
