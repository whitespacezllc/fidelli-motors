// El CUIL/CUIT se guarda normalizado (11 dígitos pelados) y se muestra
// con sus guiones. La validación dura —largo— la hace la action y el
// CHECK de la base; el dígito verificador solo ADVIERTE en el form: un
// verificador que no cierra es casi seguro un número mal copiado, pero
// bloquear un campo opcional por eso trabaría el alta.

export function normalizarCuit(texto: string): string {
  return texto.replace(/\D/g, "");
}

export function formatearCuit(cuit: string | null): string {
  const limpio = cuit ? normalizarCuit(cuit) : "";
  if (limpio.length !== 11) return cuit ?? "";
  return `${limpio.slice(0, 2)}-${limpio.slice(2, 10)}-${limpio.slice(10)}`;
}

// Módulo 11 de AFIP: pesos 5432765432 sobre los primeros diez dígitos.
export function verificadorCuitCierra(cuit: string): boolean {
  const limpio = normalizarCuit(cuit);
  if (limpio.length !== 11) return false;

  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce(
    (total, peso, i) => total + peso * Number(limpio[i]),
    0,
  );
  const resto = suma % 11;
  const esperado = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return esperado === Number(limpio[10]);
}

export const CUIT_FORMATO =
  "El CUIL/CUIT lleva 11 números, como 20-12345678-3. Con o sin guiones, da igual.";
