import type { NextConfig } from "next";
import { redireccionesDeSlugs } from "./lib/slugs-anteriores";

const nextConfig: NextConfig = {
  // La dirección vieja de un lubricentro —el slug que quedó impreso en sus
  // calcos— redirige a la nueva. La lista y sus reglas viven en
  // lib/slugs-anteriores.ts.
  async redirects() {
    return redireccionesDeSlugs();
  },
  experimental: {
    serverActions: {
      // El logo del lubricentro sube por Server Action para poder validar
      // los bytes reales (magic bytes) en el servidor. El default de 1 MB
      // quedaba abajo del límite de 2 MB del bucket; 3 MB deja margen
      // para el overhead del multipart.
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
