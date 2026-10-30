import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cuerpoDe,
  emitirCvuDedicado,
  esAliasInvalido,
  esAliasTomado,
  ErrorCresium,
} from "@/lib/cresium/cliente";
import { aliasConNumero, aliasSugerido, esAliasValido, esEstadoAlias } from "@/lib/cresium/alias";

// ============================================================
// EMITIR LA CUENTA DE COBRO DE UN TENANT (20261031100000)
//
// Dos fases que no se pueden hacer atómicas, como el alta y la invitación:
//   1 · Cresium emite el CVU dedicado con el alias (una llamada HTTP que
//       crea una cuenta REAL).
//   2 · La base guarda los tres datos juntos (fijar_cvu_de_tenant).
// Si falla la 1, no hay nada que deshacer. Si falla la 2 —el alias se lo
// llevó otro tenant en el medio, o la base no contesta— queda un CVU en
// Cresium sin dueño de nuestro lado: se loguea con el número para
// conciliarlo a mano (GET /v3/deposit-address/ lo lista), y el tenant
// sigue cobrando por pago único hasta que se vuelva a intentar.
//
// Lo llaman la ficha de /fidelli (el botón «Emitir») y el alta (la tercera
// fase, después de la invitación). Con cualquiera de los dos, el alias se
// verifica en NUESTRA base antes de pedirlo: Cresium no expone una consulta
// de disponibilidad, y «disponible» acá nunca significa que Cresium lo vaya
// a dar — por eso el EXISTING_ALIAS de Cresium también se contempla.
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, any, any>;

export type ResultadoEmision =
  | { ok: true; alias: string; cvu: string }
  | { ok: false; error: string; aliasTomado?: boolean };

const MENSAJES: Record<string, string> = {
  alias_ya_asignado:
    "Este lubricentro ya tiene su cuenta de cobro, y no se cambia: es la que su dueño deja agendada en el home banking.",
  alias_largo: "El alias va de 6 a 20 caracteres.",
  alias_formato: "El alias va en minúsculas, con números y puntos simples, entre 6 y 20 caracteres.",
  alias_vacio: "Escribí el alias de la cuenta.",
  sin_permiso_lubricentro: "Ese lubricentro ya no existe.",
  lubricentros_cresium_alias_key: "Ese alias ya lo tiene otro lubricentro nuestro.",
};

function traducir(mensaje: string): string {
  for (const [clave, texto] of Object.entries(MENSAJES)) {
    if (mensaje.includes(clave)) return texto;
  }
  return "No se pudo guardar la cuenta. Probá de nuevo en un momento.";
}

/**
 * Emite la cuenta en Cresium y la guarda en el tenant. Devuelve el alias
 * normalizado y el número de CVU, o el error en una oración.
 */
export async function emitirCuentaDeCobro(
  supabase: Cliente,
  lubricentroId: string,
  aliasPedido: string,
): Promise<ResultadoEmision> {
  const alias = aliasPedido.trim().toLowerCase();
  if (!esAliasValido(alias)) return { ok: false, error: MENSAJES.alias_formato };

  // 1 · Nuestra base, primero: es gratis y evita emitir un CVU que después
  //     no se puede guardar.
  const { data: estado, error: errEstado } = await supabase.rpc("alias_estado", { p_alias: alias });
  if (errEstado) return { ok: false, error: "No pudimos consultar el alias. Probá de nuevo en un momento." };
  if (!esEstadoAlias(estado) || estado !== "disponible") {
    return {
      ok: false,
      error: estado === "ocupado" ? MENSAJES.lubricentros_cresium_alias_key : MENSAJES.alias_formato,
      aliasTomado: estado === "ocupado",
    };
  }

  // 2 · Cresium emite la cuenta.
  let cuenta;
  try {
    cuenta = await emitirCvuDedicado(alias);
  } catch (e) {
    if (esAliasTomado(e)) {
      return { ok: false, error: `Cresium ya tiene el alias «${alias}» en otra cuenta. Probá con otro.`, aliasTomado: true };
    }
    if (esAliasInvalido(e)) {
      return { ok: false, error: `Cresium rechazó el formato del alias «${alias}». Probá con otro.` };
    }
    console.error(`[cresium] no se pudo emitir el CVU dedicado de ${lubricentroId} (${alias}): ${cuerpoDe(e)}`);
    if (e instanceof ErrorCresium && e.status === 403) {
      return { ok: false, error: "Cresium no tiene habilitados los CVUs dedicados en nuestra cuenta (403). Hay que pedirlo a su equipo." };
    }
    return { ok: false, error: "Cresium no respondió. Probá de nuevo en un momento; si sigue igual, revisá las credenciales en Vercel." };
  }
  if (!cuenta?.value || !/^[0-9]{22}$/.test(cuenta.value) || !cuenta.id) {
    console.error(`[cresium] la emisión del CVU de ${lubricentroId} volvió con una forma rara: ${JSON.stringify(cuenta).slice(0, 300)}`);
    return { ok: false, error: "Cresium emitió la cuenta pero no devolvió el número de CVU como esperábamos. Revisá en cresium.app antes de volver a intentar." };
  }

  // 3 · La base guarda los tres juntos.
  const { data: guardado, error } = await supabase.rpc("fijar_cvu_de_tenant", {
    p_lubricentro: lubricentroId,
    p_alias: alias,
    p_cvu: cuenta.value,
    p_deposit_address_id: cuenta.id,
  });
  if (error) {
    // ⚠ EL CVU YA EXISTE EN CRESIUM. Queda escrito para conciliar.
    console.error(
      `[cresium] CVU ${cuenta.value} (id ${cuenta.id}, alias ${alias}) emitido para ${lubricentroId} ` +
        `pero la base no lo guardó: ${error.message}. Conciliar con GET /v3/deposit-address/.`,
    );
    return { ok: false, error: traducir(error.message) + " La cuenta quedó emitida en Cresium: no vuelvas a emitir sin revisar." };
  }
  return { ok: true, alias: String(guardado ?? alias), cvu: cuenta.value };
}

/**
 * Un alias libre para el tenant, a partir de su slug: la sugerencia de
 * siempre y, si ya es de otro, con un número al final (`fm.shaddai2`).
 * Lo que devuelve está libre en NUESTRA base; Cresium puede decir otra cosa.
 */
export async function sugerirAliasLibre(supabase: Cliente, slug: string): Promise<string> {
  const base = aliasSugerido(slug);
  if (!base) return "";
  for (let n = 1; n <= 9; n++) {
    const candidato = n === 1 ? base : aliasConNumero(base, n);
    const { data } = await supabase.rpc("alias_estado", { p_alias: candidato });
    if (data === "disponible") return candidato;
    if (data !== "ocupado") return "";
  }
  return "";
}
