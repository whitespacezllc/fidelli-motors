"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { FormularioProducto } from "@/components/productos/dialog-producto";
import type { Categoria } from "@/lib/categorias";

// Paso 1 · el mismo formulario de alta de producto del panel. Al guardar,
// la base evalúa el onboarding sola (trigger onboarding_productos) y la
// acción de productos revalida: la pantalla se refresca con el paso 2. El
// refresh de acá es solo el cinturón por si esa revalidación no llegara.
export function PasoProducto({ categorias }: { categorias: Categoria[] }) {
  const router = useRouter();
  const alGuardar = useCallback(() => router.refresh(), [router]);

  return (
    <div className="surface-card p-5 sm:p-6">
      <FormularioProducto
        categorias={categorias}
        alGuardar={alGuardar}
        etiquetaGuardar="Guardar producto"
      />
    </div>
  );
}
