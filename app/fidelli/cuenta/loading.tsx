import { Esqueleto } from "@/components/ui/esqueleto";

// Mi cuenta de /fidelli no espera a la base (solo la sesión): su esqueleto
// es el título real y nada gris. Con piezas grises, al entrar con la URL
// escrita el gris asomaba 12 ms y se iba: un parpadeo
// (scripts/regresion-esqueletos.mjs).
export default function CargandoCuentaFidelli() {
  return (
    <Esqueleto className="max-w-2xl">
      <h1 className="mb-6 font-brand text-h2 font-bold text-ink">Mi cuenta</h1>
    </Esqueleto>
  );
}
