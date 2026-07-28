"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { slugificar } from "@/lib/texto";
import { Boton, clasesBoton } from "@/components/ui/boton";
import { CamposPlan, type ValoresPlan } from "@/components/fidelli/campos-plan";
import {
  CLASE_AYUDA,
  CLASE_CAMPO,
  CLASE_ERROR,
  CLASE_LABEL,
} from "@/components/fidelli/estilos";
import {
  altaDeLubricentro,
  verificarSlug,
  type DatosAlta,
  type EstadoSlug,
  type ResultadoAlta,
} from "@/app/fidelli/actions";
import type { PlanCompleto } from "@/components/fidelli/tipos";

const PASOS = ["Marca y slug", "Sucursales y owner", "Plan y trial"] as const;

const INICIAL: ResultadoAlta = {};

type Sucursal = {
  nombre: string;
  direccion: string;
  telefono: string;
  horarios: string;
};

const SUCURSAL_VACIA: Sucursal = {
  nombre: "",
  direccion: "",
  telefono: "",
  horarios: "",
};

// Lo que dice el campo del slug según lo que contestó la base.
const VEREDICTO: Record<EstadoSlug, { texto: (s: string) => string; clase: string }> = {
  disponible: {
    texto: (s) => `Disponible — la landing será fidellimotors.app/${s}`,
    clase: "text-success",
  },
  ocupado: {
    texto: () => "Ocupado — ya hay un lubricentro con este slug.",
    clase: "text-overdue",
  },
  reservado: {
    texto: () => "Reservado — es una ruta del producto y no se puede usar.",
    clase: "text-overdue",
  },
  invalido: {
    texto: () =>
      "Minúsculas, números y guiones simples, entre 3 y 60 caracteres.",
    clase: "text-overdue",
  },
};

export function WizardAlta({ planes }: { planes: PlanCompleto[] }) {
  const [paso, setPaso] = useState(1);
  const [nombre, setNombre] = useState("");
  const [sucursales, setSucursales] = useState<Sucursal[]>([{ ...SUCURSAL_VACIA }]);
  const [ownerNombre, setOwnerNombre] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [plan, setPlan] = useState<ValoresPlan>({
    planId: planes[0]?.id ?? "",
    periodo: "mensual",
    descuentoPct: 0,
  });
  const [diasTrial, setDiasTrial] = useState(30);

  // El slug se propone solo desde el nombre hasta que alguien lo toca. No se
  // guarda el propuesto: se deriva. Mientras `slugEscrito` sea null manda el
  // nombre, y en cuanto se escribe algo manda la persona — sin un efecto que
  // le pise lo que tipeó medio segundo después.
  const [slugEscrito, setSlugEscrito] = useState<string | null>(null);
  const slug = slugEscrito ?? slugificar(nombre);

  const formatoValido =
    slug.length >= 3 && slug.length <= 60 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);

  // La respuesta del servidor se guarda junto al slug que se preguntó. Si el
  // texto ya cambió, el veredicto viejo no aplica y la pantalla vuelve a
  // "verificando" en vez de mostrar un "disponible" que era de otra palabra.
  const [respuesta, setRespuesta] = useState<{
    slug: string;
    estado: EstadoSlug;
  } | null>(null);

  const [consultando, empezarVerificacion] = useTransition();
  const [, empezarAlta] = useTransition();

  const veredicto: EstadoSlug | null =
    slug.length === 0
      ? null
      : !formatoValido
        ? "invalido"
        : respuesta?.slug === slug
          ? respuesta.estado
          : null;

  const verificando = formatoValido && veredicto === null;

  // Validación en vivo, con freno: se pregunta cuando dejó de tipear, no en
  // cada tecla. Lo único que hace el efecto es hablar con el servidor.
  useEffect(() => {
    if (!formatoValido) return;

    const id = setTimeout(() => {
      empezarVerificacion(async () => {
        setRespuesta({ slug, estado: await verificarSlug(slug) });
      });
    }, 400);

    return () => clearTimeout(id);
  }, [slug, formatoValido]);

  // El alta pasa por esta envoltura de cliente para poder mover el wizard al
  // paso del campo que falló. Va acá y no en un efecto: es la consecuencia
  // directa de la acción, no una sincronización con nada externo.
  const [resultado, enviar, enviando] = useActionState(
    async (previo: ResultadoAlta, datos: DatosAlta) => {
      const r = await altaDeLubricentro(previo, datos);
      if (r.paso) setPaso(r.paso);
      return r;
    },
    INICIAL,
  );

  if (resultado.creado) {
    return <Listo creado={resultado.creado} />;
  }

  const puedeSeguirDelUno =
    nombre.trim().length > 1 && veredicto === "disponible" && !consultando;

  const puedeSeguirDelDos =
    sucursales.some((s) => s.nombre.trim() !== "") &&
    ownerNombre.trim() !== "" &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail.trim());

  // Dentro de una transición a propósito: es lo que hace que `enviando` se
  // actualice y el botón se deshabilite apenas se toca. Sin eso, el segundo
  // toque manda un segundo alta y nacen dos lubricentros con el mismo dueño.
  function enviarTodo() {
    empezarAlta(() => enviar({
      nombre,
      slug,
      sucursales,
      ownerNombre,
      ownerEmail,
      planId: plan.planId,
      periodo: plan.periodo,
      descuentoPct: plan.descuentoPct,
      diasTrial,
    }));
  }

  return (
    <div className="surface-card overflow-hidden">
      <Stepper paso={paso} />

      <div className="flex flex-col gap-5 p-5 sm:p-6">
        {resultado.error && (
          <p role="alert" className={CLASE_ERROR}>
            {resultado.error}
          </p>
        )}

        {paso === 1 && (
          <>
            <div>
              <label htmlFor="marca" className={CLASE_LABEL}>
                Nombre de la marca
              </label>
              <input
                id="marca"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                autoFocus
                className={CLASE_CAMPO}
              />
            </div>

            <div>
              <label htmlFor="slug" className={CLASE_LABEL}>
                Slug público
              </label>
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 text-body text-ink-40">
                  fidellimotors.app/
                </span>
                <input
                  id="slug"
                  value={slug}
                  onChange={(e) => setSlugEscrito(e.target.value.toLowerCase())}
                  className={CLASE_CAMPO}
                />
              </div>

              <p
                aria-live="polite"
                className={`mt-1.5 text-label ${
                  verificando
                    ? "text-ink-60"
                    : veredicto
                      ? VEREDICTO[veredicto].clase
                      : "text-ink-60"
                }`}
              >
                {verificando
                  ? "Verificando…"
                  : veredicto
                    ? `${veredicto === "disponible" ? "✓" : "×"} ${VEREDICTO[veredicto].texto(slug)}`
                    : "Es la dirección que va impresa en el QR de las calcos."}
              </p>
            </div>

            <div className="rounded-md border border-reward bg-reward-soft px-4 py-3">
              <p className="font-brand text-ui font-bold text-ink">
                El slug queda inmutable al imprimir las calcos
              </p>
              <p className="mt-1 text-ui text-ink-60">
                Una vez impresas las calcos, cambiar el slug rompe los QR
                pegados en los parasoles. Elegilo pensando que es para siempre.
              </p>
            </div>
          </>
        )}

        {paso === 2 && (
          <PasoSucursales
            sucursales={sucursales}
            setSucursales={setSucursales}
            ownerNombre={ownerNombre}
            setOwnerNombre={setOwnerNombre}
            ownerEmail={ownerEmail}
            setOwnerEmail={setOwnerEmail}
          />
        )}

        {paso === 3 && (
          <>
            <CamposPlan
              planes={planes}
              valores={plan}
              alCambiar={(p) => setPlan((v) => ({ ...v, ...p }))}
              prefijo="alta"
            />

            <div>
              <label htmlFor="trial" className={CLASE_LABEL}>
                Días de trial
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="trial"
                  type="number"
                  min={0}
                  max={365}
                  step={1}
                  inputMode="numeric"
                  value={diasTrial}
                  onChange={(e) => setDiasTrial(Number(e.target.value))}
                  className={`${CLASE_CAMPO} max-w-[110px]`}
                />
                <span className="text-body text-ink-60">días</span>
              </div>
              <p className={CLASE_AYUDA}>
                La suscripción arranca en trial y vence a los {diasTrial || 0}{" "}
                días. Se puede cambiar después desde la ficha.
              </p>
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface/60 px-5 py-4 sm:px-6">
        {paso === 1 ? (
          <Link
            href="/fidelli"
            className="inline-flex min-h-11 items-center px-1 text-ui font-semibold text-ink-60 hover:text-ink"
          >
            Cancelar
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => setPaso(paso - 1)}
            disabled={enviando}
            className="inline-flex min-h-11 items-center px-1 text-ui font-semibold text-ink-60 hover:text-ink"
          >
            ← Volver
          </button>
        )}

        {paso < 3 ? (
          <Boton
            type="button"
            onClick={() => setPaso(paso + 1)}
            disabled={paso === 1 ? !puedeSeguirDelUno : !puedeSeguirDelDos}
          >
            Continuar
          </Boton>
        ) : (
          // Ancho fijo: el texto cambia al enviarse y el botón no puede saltar.
          <Boton
            type="button"
            onClick={enviarTodo}
            disabled={enviando}
            className="min-w-[190px]"
          >
            {enviando ? "Creando…" : "Crear lubricentro"}
          </Boton>
        )}
      </div>
    </div>
  );
}

function Stepper({ paso }: { paso: number }) {
  return (
    <ol className="flex border-b border-line">
      {PASOS.map((titulo, i) => {
        const n = i + 1;
        const actual = n === paso;
        const hecho = n < paso;

        return (
          <li
            key={titulo}
            aria-current={actual ? "step" : undefined}
            className={`flex flex-1 items-center gap-2 px-3 py-3 text-label sm:px-4 ${
              actual ? "bg-base font-semibold text-ink" : "text-ink-40"
            } ${i > 0 ? "border-l border-line" : ""}`}
          >
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-label font-semibold ${
                actual
                  ? "bg-ink text-base"
                  : hecho
                    ? "bg-success text-base"
                    : "bg-surface text-ink-40"
              }`}
            >
              {hecho ? "✓" : n}
            </span>
            <span className="truncate">{titulo}</span>
          </li>
        );
      })}
    </ol>
  );
}

function PasoSucursales({
  sucursales,
  setSucursales,
  ownerNombre,
  setOwnerNombre,
  ownerEmail,
  setOwnerEmail,
}: {
  sucursales: Sucursal[];
  setSucursales: React.Dispatch<React.SetStateAction<Sucursal[]>>;
  ownerNombre: string;
  setOwnerNombre: (v: string) => void;
  ownerEmail: string;
  setOwnerEmail: (v: string) => void;
}) {
  function editar(i: number, campo: keyof Sucursal, valor: string) {
    setSucursales((prev) =>
      prev.map((s, j) => (j === i ? { ...s, [campo]: valor } : s)),
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {sucursales.map((s, i) => (
          <fieldset key={i} className="rounded-md border border-line p-4">
            <legend className="px-1 text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
              Sucursal {i + 1}
            </legend>

            <div className="flex flex-col gap-3">
              <div>
                <label htmlFor={`suc-nombre-${i}`} className={CLASE_LABEL}>
                  Nombre
                </label>
                <input
                  id={`suc-nombre-${i}`}
                  value={s.nombre}
                  onChange={(e) => editar(i, "nombre", e.target.value)}
                  className={CLASE_CAMPO}
                />
              </div>

              {/* Los tres opcionales van juntos y a dos columnas en desktop:
                  son datos de contacto, no del alta. */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={`suc-dir-${i}`} className={CLASE_LABEL}>
                    Dirección{" "}
                    <span className="text-ink-40 normal-case">(opcional)</span>
                  </label>
                  <input
                    id={`suc-dir-${i}`}
                    value={s.direccion}
                    onChange={(e) => editar(i, "direccion", e.target.value)}
                    className={CLASE_CAMPO}
                  />
                </div>

                <div>
                  <label htmlFor={`suc-tel-${i}`} className={CLASE_LABEL}>
                    Teléfono{" "}
                    <span className="text-ink-40 normal-case">(opcional)</span>
                  </label>
                  <input
                    id={`suc-tel-${i}`}
                    type="tel"
                    value={s.telefono}
                    onChange={(e) => editar(i, "telefono", e.target.value)}
                    className={CLASE_CAMPO}
                  />
                </div>
              </div>

              <div>
                <label htmlFor={`suc-hor-${i}`} className={CLASE_LABEL}>
                  Horarios{" "}
                  <span className="text-ink-40 normal-case">(opcional)</span>
                </label>
                <input
                  id={`suc-hor-${i}`}
                  value={s.horarios}
                  onChange={(e) => editar(i, "horarios", e.target.value)}
                  className={CLASE_CAMPO}
                />
              </div>

              {sucursales.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setSucursales((prev) => prev.filter((_, j) => j !== i))
                  }
                  className="self-start text-label font-semibold text-ink-60 underline underline-offset-2 hover:text-ink"
                >
                  Quitar esta sucursal
                </button>
              )}
            </div>
          </fieldset>
        ))}

        <button
          type="button"
          onClick={() => setSucursales((prev) => [...prev, { ...SUCURSAL_VACIA }])}
          className="self-start rounded-md border border-line bg-base px-4 py-2.5 text-ui font-semibold text-ink hover:bg-surface"
        >
          + Agregar otra sucursal
        </button>
      </div>

      <div className="border-t border-line pt-5">
        <p className="mb-4 font-brand text-lead font-bold text-ink">Owner</p>

        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="owner-nombre" className={CLASE_LABEL}>
              Nombre
            </label>
            <input
              id="owner-nombre"
              value={ownerNombre}
              onChange={(e) => setOwnerNombre(e.target.value)}
              className={CLASE_CAMPO}
            />
          </div>

          <div>
            <label htmlFor="owner-email" className={CLASE_LABEL}>
              Email
            </label>
            <input
              id="owner-email"
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              className={CLASE_CAMPO}
            />
            <p className={CLASE_AYUDA}>
              Al crear el lubricentro le llega un mail para elegir su contraseña
              y entrar por primera vez. El enlace vence en 24 horas.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// La pantalla final. Dice las dos cosas por separado —el tenant y la
// invitación— porque son dos operaciones distintas y pueden terminar
// distinto: el lubricentro puede estar creado y el mail no haber salido.
function Listo({
  creado,
}: {
  creado: NonNullable<ResultadoAlta["creado"]>;
}) {
  const fallo = creado.invitacion === "fallo";

  return (
    <div className="surface-card p-6 sm:p-8">
      <p className="font-brand text-h3 font-bold text-ink">
        {creado.nombre} quedó creado
      </p>
      <p className="mt-1.5 text-body text-ink-60">
        Su landing ya responde en{" "}
        <span className="font-semibold text-ink">
          fidellimotors.app/{creado.slug}
        </span>
        .
      </p>

      {fallo ? (
        <div className="mt-5 rounded-md border border-overdue bg-overdue-soft px-4 py-3.5">
          <p className="font-semibold text-overdue">
            La invitación al owner no salió
          </p>
          <p className="mt-1 text-ui text-ink-60">{creado.motivo}</p>
          <p className="mt-2 text-ui text-ink-60">
            El lubricentro está completo: sus sucursales, su suscripción y su
            configuración quedaron guardadas. Lo único que falta es que alguien
            pueda entrar. En el listado aparece como{" "}
            <span className="font-semibold text-ink">Sin owner</span>, con el
            botón para reintentar la invitación cuando quieras.
          </p>
        </div>
      ) : (
        <div className="mt-5 rounded-md border border-success bg-success-soft px-4 py-3.5">
          <p className="font-semibold text-success">Invitación enviada</p>
          <p className="mt-1 text-ui text-ink-60">
            Le llegó el mail a{" "}
            <span className="font-semibold text-ink">{creado.ownerEmail}</span>{" "}
            para elegir su contraseña. Hasta que entre por primera vez va a
            figurar como <span className="font-semibold text-ink">Invitación
            pendiente</span> en el listado.
          </p>
        </div>
      )}

      <div className="mt-6">
        <Link href="/fidelli" className={clasesBoton("primario", "lg")}>
          Ir al listado
        </Link>
      </div>
    </div>
  );
}
