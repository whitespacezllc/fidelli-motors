import { normalizar, normalizarPatente, sanitizarBusqueda } from "@/lib/texto";

// El único buscador del listado de clientes pega contra los tres campos.
// El filtro vive acá porque lo usan DOS lugares —la pantalla y el export a
// Excel— y tienen que coincidir siempre: lo que Bruno ve filtrado es
// exactamente lo que se lleva en el archivo.
export function filtroClientes(q: string | undefined) {
  const termino = sanitizarBusqueda(q ?? "");
  if (!termino) return { termino: "", filtros: null };

  // El más usado es la patente: el mecánico tiene el auto adelante.
  const texto = normalizar(termino);
  const soloDigitos = termino.replace(/\D/g, "");
  const patente = normalizarPatente(termino);

  const filtros = [`nombre_busqueda.like.*${texto}*`];
  if (soloDigitos) filtros.push(`telefono.like.*${soloDigitos}*`);
  if (patente) filtros.push(`patentes.like.*${patente}*`);

  return { termino, filtros: filtros.join(",") };
}
