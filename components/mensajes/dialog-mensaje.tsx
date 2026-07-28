"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Dialog, DialogTrigger, DialogContenido } from "@/components/ui/dialog";
import { Boton, clasesBoton } from "@/components/ui/boton";
import {
  VARIABLES_MENSAJE,
  resolverTemplate,
  variablesDesconocidas,
  type VariablesMensaje,
} from "@/lib/contacto";
import {
  crearMensaje,
  editarMensaje,
  type EstadoMensaje,
} from "@/app/panel/mensajes/actions";

type Mensaje = {
  id: string;
  tono: string;
  contenido: string;
};

const ESTADO_INICIAL: EstadoMensaje = {};

const CLASE_CAMPO =
  "h-12 w-full rounded-md border border-line bg-base px-3.5 text-body text-ink";
const CLASE_LABEL =
  "mb-1.5 block text-label font-semibold tracking-[0.06em] text-ink-60 uppercase";

function FormularioMensaje({
  mensaje,
  ejemplo,
  ejemploEsReal,
  alGuardar,
}: {
  mensaje?: Mensaje;
  ejemplo: VariablesMensaje;
  ejemploEsReal: boolean;
  alGuardar: () => void;
}) {
  const [estado, accion, pendiente] = useActionState(
    mensaje ? editarMensaje : crearMensaje,
    ESTADO_INICIAL,
  );
  const [contenido, setContenido] = useState(mensaje?.contenido ?? "");
  const [sinConexion, setSinConexion] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (estado.ok) alGuardar();
  }, [estado.ok, alGuardar]);

  // Inserta la variable donde está el cursor, no al final: el lubri está
  // escribiendo una frase y la variable es parte de ella.
  function insertar(clave: string) {
    const area = areaRef.current;
    const token = `{${clave}}`;
    if (!area) return;

    const desde = area.selectionStart ?? contenido.length;
    const hasta = area.selectionEnd ?? contenido.length;
    const nuevo = contenido.slice(0, desde) + token + contenido.slice(hasta);
    setContenido(nuevo);

    // Devuelve el foco y deja el cursor después de lo insertado.
    requestAnimationFrame(() => {
      area.focus();
      const pos = desde + token.length;
      area.setSelectionRange(pos, pos);
    });
  }

  const desconocidas = variablesDesconocidas(contenido);
  const vistaPrevia = contenido.trim()
    ? resolverTemplate(contenido, ejemplo)
    : null;

  const error = sinConexion
    ? "Estás sin conexión a internet. No cierres esta ventana: lo que escribiste sigue acá. Cuando vuelva la señal, tocá Guardar de nuevo."
    : estado.error;

  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!navigator.onLine) {
          e.preventDefault();
          setSinConexion(true);
        } else {
          setSinConexion(false);
        }
      }}
      className="flex flex-col gap-4"
    >
      {error && (
        <p
          role="alert"
          className="rounded-md bg-overdue-soft px-3.5 py-3 text-ui text-overdue"
        >
          {error}
        </p>
      )}

      {mensaje && <input type="hidden" name="id" value={mensaje.id} />}

      <div>
        <label htmlFor="tono" className={CLASE_LABEL}>
          Nombre del tono
        </label>
        <input
          id="tono"
          name="tono"
          required
          minLength={2}
          defaultValue={mensaje?.tono}
          className={CLASE_CAMPO}
        />
        <p className="mt-1.5 text-label text-ink-60">
          Cómo lo vas a reconocer en la lista: Cercano, Formal, Promo enero…
        </p>
      </div>

      <div>
        <label htmlFor="contenido" className={CLASE_LABEL}>
          Mensaje
        </label>
        <textarea
          ref={areaRef}
          id="contenido"
          name="contenido"
          required
          rows={5}
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          className="w-full rounded-md border border-line bg-base px-3.5 py-3 text-body text-ink"
        />

        {/* Las cuatro variables, para insertar donde está el cursor. El
            title explica qué reemplaza cada una. */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {VARIABLES_MENSAJE.map((v) => (
            <button
              key={v.clave}
              type="button"
              onClick={() => insertar(v.clave)}
              title={`Se reemplaza por ${v.descripcion}`}
              className="rounded-md border border-line bg-surface px-2.5 py-1.5 font-ui text-label font-semibold text-ink tabular-nums hover:bg-line/60"
            >
              {`{${v.clave}}`}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-label text-ink-60">
          Tocá una variable para agregarla: al mandar el mensaje se reemplaza
          por el dato real de cada cliente.
        </p>
      </div>

      {desconocidas.length > 0 && (
        <p className="rounded-md border border-urgente bg-urgente-soft px-3.5 py-3 text-ui text-urgente">
          {desconocidas.length === 1 ? (
            <>
              <span className="font-semibold tabular-nums">{`{${desconocidas[0]}}`}</span>{" "}
              no es una variable: le va a llegar así, literal, al cliente.
            </>
          ) : (
            <>
              <span className="font-semibold tabular-nums">
                {desconocidas.map((d) => `{${d}}`).join(", ")}
              </span>{" "}
              no son variables: le van a llegar así, literales, al cliente.
            </>
          )}{" "}
          Las que existen son las cuatro de arriba.
        </p>
      )}

      {/* La vista previa con un vehículo real del tenant: ver el mensaje
          terminado ANTES de guardarlo es lo que hace útil esta pantalla. */}
      {vistaPrevia && (
        <div className="rounded-md border border-line bg-surface px-3.5 py-3">
          <p className="mb-1.5 text-label font-semibold tracking-[0.06em] text-ink-60 uppercase">
            Así lo recibe {ejemploEsReal ? ejemplo.nombre : "tu cliente"}
          </p>
          <p className="rounded-md bg-[#E7F8E9] px-3 py-2.5 text-ui leading-relaxed text-ink">
            {vistaPrevia}
          </p>
          <p className="mt-1.5 text-label text-ink-40">
            {ejemploEsReal
              ? "Armado con un vehículo real de tu taller."
              : "Ejemplo genérico: todavía no tenés vehículos cargados."}
          </p>
        </div>
      )}

      <Boton type="submit" tam="lg" disabled={pendiente} className="mt-1 w-full">
        {pendiente ? "Guardando…" : "Guardar"}
      </Boton>
    </form>
  );
}

// Un solo dialog para crear y editar: cambia el título y la action.
export function DialogMensaje({
  mensaje,
  ejemplo,
  ejemploEsReal,
  etiquetaTrigger,
  variante = "secundario",
}: {
  mensaje?: Mensaje;
  ejemplo: VariablesMensaje;
  ejemploEsReal: boolean;
  etiquetaTrigger?: string;
  variante?: "primario" | "secundario";
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger className={clasesBoton(variante, "md")}>
        {etiquetaTrigger ?? (mensaje ? "Editar" : "+ Nuevo mensaje")}
      </DialogTrigger>
      <DialogContenido titulo={mensaje ? "Editar mensaje" : "Nuevo mensaje"}>
        {/* key: al reabrir para editar, el estado del textarea arranca del
            contenido guardado y no del borrador de la vez anterior. */}
        <FormularioMensaje
          key={abierto ? "abierto" : "cerrado"}
          mensaje={mensaje}
          ejemplo={ejemplo}
          ejemploEsReal={ejemploEsReal}
          alGuardar={() => setAbierto(false)}
        />
      </DialogContenido>
    </Dialog>
  );
}
