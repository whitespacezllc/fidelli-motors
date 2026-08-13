import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { SITIO_URL, SLUGS_SIN_INDEXAR } from "@/lib/seo";

// Se rearma como mucho una vez por hora: los lubricentros no se dan de
// alta a un ritmo que justifique más.
export const revalidate = 3600;

// El sitemap: la portada más una entrada por vidriera de lubricentro
// activo. Las páginas de patente NO van nunca — son noindex por diseño
// (historial de un vehículo identificable).
//
// El cliente es el de @supabase/supabase-js directo y no el de
// lib/supabase/server: este archivo corre también en el build, donde no
// hay request ni cookies que leer. Va con la clave anónima; la lista sale
// de slugs_publicos(), la función mínima creada para esto — anon no puede
// leer ninguna tabla.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const portada: MetadataRoute.Sitemap = [
    {
      url: SITIO_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];

  // Si Supabase no contesta, el sitemap NO tira la build ni la ruta: se
  // sirve al menos la portada y listo.
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !clave) return portada;

    const supabase = createClient<Database>(url, clave);
    const { data, error } = await supabase.rpc("slugs_publicos");
    if (error || !data) return portada;

    return [
      ...portada,
      // `demo` existe y su vidriera anda, pero no se indexa: no es un
      // negocio real y no tiene por qué competir con las vidrieras de los
      // clientes. Misma lista que usa el noindex de /[slug].
      ...data
        .filter((l) => !SLUGS_SIN_INDEXAR.includes(l.slug))
        .map((lubricentro) => ({
          url: `${SITIO_URL}/${lubricentro.slug}`,
          // La tabla no tiene updated_at: la fecha real más honesta que
          // hay es la de alta.
          lastModified: new Date(lubricentro.created_at),
          changeFrequency: "monthly" as const,
          priority: 0.7,
        })),
    ];
  } catch {
    return portada;
  }
}
