import type { Metadata } from "next";
import { Seccion } from "@/components/landing/seccion";
import { Cierre } from "@/components/landing/cierre";

// La landing comercial. Es la única superficie del producto que se indexa a
// propósito: `/[slug]` también se indexa —es la vidriera del lubricentro—,
// pero `/[slug]/[patente]` y el panel van noindex.
export const metadata: Metadata = {
  title: "Fidelli Motors — el cartón de service, digital",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

// ANDAMIO — las once secciones en el orden narrativo, todavía sin contenido.
//
// El orden es dolor → deseo → duda, y no es negociable:
//   · abre por el desorden (02), que es lo que lo hace frenar;
//   · sigue por la facilidad (03), que es la condición de entrada;
//   · después los resultados (04);
//   · el QR va en el MEDIO (05), no en el hero: es el "y encima", no el gancho;
//   · las dudas (10) se responden ANTES del precio... salvo que el precio (09)
//     va justo después del caso Brothers (08), porque la prueba social rinde
//     el doble inmediatamente antes de hablar de plata.
//
// El copy de cada una está cerrado en docs/landing-spec.md y se implementa
// sección por sección. Acá no se escribe copy de memoria.
export default function LandingComercial() {
  return (
    <>
      <Seccion
        id="hero"
        numero="02"
        titulo="Hero"
        trabajo="Que se reconozca en la primera línea. Si no se ve retratado en tres segundos, el resto de la página no existe. En mobile: texto primero, imagen después."
      />

      <Seccion
        id="como-funciona"
        numero="03"
        titulo="La prueba de que es fácil"
        trabajo="Matar la duda número uno. Se responde mostrando, no explicando: el video de una carga real, sin cortes. La sección que más convierte."
        fondo="surface"
      />

      <Seccion
        id="que-cambia"
        numero="04"
        titulo="Qué cambia en tu lubricentro"
        trabajo="Llevarlo a la situación deseada. Cuatro filas, una por deseo. En mobile la alternancia desaparece: siempre foto arriba, texto abajo."
      />

      {/* 05 y 06 comparten el fondo grafito SIN corte entre ellas: es el
          único quiebre visual de la página. */}
      <Seccion
        id="qr"
        numero="05"
        titulo="Y encima, el QR"
        trabajo="El “y encima esto”. No resuelve un dolor que él ya sentía: es diferenciación frente al de la vuelta, y lo que hace que el precio parezca barato."
        fondo="grafito"
        primeraDeGrafito
      />

      <Seccion
        id="pasos-cliente"
        numero="06"
        titulo="Los tres pasos del cliente"
        trabajo="Responder “¿y si mis clientes no lo usan?” mostrando que no hay nada que aprender. Nada de carrusel en mobile: esconde los pasos 2 y 3, que son los que prueban que es fácil."
        fondo="grafito"
      />

      <Seccion
        id="fidelliza"
        numero="07"
        titulo="Fidelliza"
        trabajo="El toque de marca y el último empujón antes del precio. Se presenta como un plus, no como la razón principal. Único lugar de la página donde el rojo es superficie."
        fondo="brand-soft"
      />

      <Seccion
        id="caso"
        numero="08"
        titulo="El caso Brothers Oil"
        trabajo="Probar que funciona con alguien igual a él, justo antes de hablar de plata. La prueba social rinde el doble inmediatamente antes del precio."
      />

      <Seccion
        id="precio"
        numero="09"
        titulo="Precio, garantía y cupos"
        trabajo="Que el precio se lea después del valor y con la garantía al lado. Los cupos se comunican como promesa de servicio, nunca como exclusividad."
        fondo="surface"
      />

      <Seccion
        id="preguntas"
        numero="10"
        titulo="Preguntas"
        trabajo="Desarmar las dudas. Una objeción que no respondés se la contesta él solo, y siempre se contesta que no. Las tres primeras van abiertas, también en mobile."
      />

      <Cierre />
    </>
  );
}
