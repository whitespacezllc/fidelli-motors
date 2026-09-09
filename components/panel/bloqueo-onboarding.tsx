// El motivo que acompaña a cada solapa con candado mientras el onboarding
// no terminó. Uno solo, en un lugar, y con el número de pasos de la cuenta:
// a un Basic no se le dice "tres" cuando son dos.
export function motivoBloqueo(pasos: number): string {
  return `Se desbloquea cuando termines los ${pasos === 2 ? "dos" : "tres"} pasos.`;
}
