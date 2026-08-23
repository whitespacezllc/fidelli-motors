import { clasesBoton } from "@/components/ui/boton";

// La hoja de calcos QR — de LOS TRES planes, a propósito. Lo que
// diferencia a Pro y Ultra son los calcos físicos en vinilo, no el
// archivo: un PDF casero no reemplaza un calco pegado en el parasol, y
// bloquearlo sería mezquino sin ganar nada. Sin esta hoja, el plan Basic
// queda mutilado: la página del cliente existe y nadie puede llegarle.
export function SeccionCalcos() {
  return (
    <section className="surface-card p-5">
      <h2 className="mb-1 font-brand text-body font-bold text-ink">
        Tus calcos para imprimir
      </h2>
      <p className="mb-3 text-ui text-ink-60">
        Una hoja A4 con 9 calcos del tamaño real (5&nbsp;×&nbsp;8&nbsp;cm),
        con tu marca y el QR que abre tu página. Imprimila al 100% —sin
        &ldquo;ajustar a la página&rdquo;—, recortá por las marcas y pegalos
        donde los vea el dueño del auto: el mostrador, la caja, el parasol.
      </p>
      <a
        href="/panel/experiencia/calcos"
        target="_blank"
        rel="noopener noreferrer"
        className={clasesBoton("secundario", "md")}
      >
        Abrir la hoja de calcos
      </a>
    </section>
  );
}
