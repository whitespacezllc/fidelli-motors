import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
