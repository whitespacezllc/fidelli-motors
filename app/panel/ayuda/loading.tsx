import { Cabecera, Esqueleto } from "@/components/ui/esqueleto";

// Ayuda no espera a la base (solo la sesión, que ya trajo el layout): su
// esqueleto es la cabecera real y nada gris. Con piezas grises, al entrar
// con la URL escrita el gris asomaba 30 ms y se iba: un parpadeo
// (scripts/regresion-esqueletos.mjs). Si la pantalla llega a esperar
// datos, el esqueleto gana sus piezas.
export default function CargandoAyuda() {
  return (
    <Esqueleto>
      <Cabecera titulo="Ayuda" />
    </Esqueleto>
  );
}
