import {
  HouseIcon,
  ClockIcon,
  UsersIcon,
  PlusIcon,
  DotsThreeIcon,
  EyeIcon,
  EyeSlashIcon,
  XIcon,
  MagnifyingGlassIcon,
  PackageIcon,
  QrCodeIcon,
  ClockCounterClockwiseIcon,
  WhatsappLogoIcon,
  MapPinIcon,
  PhoneIcon,
  TrophyIcon,
  CaretDownIcon,
  LockSimpleIcon,
  BuildingsIcon,
  EnvelopeSimpleIcon,
  WarningIcon,
  CheckIcon,
} from "@phosphor-icons/react/dist/ssr";
// Solo tipos: se borran al compilar, así que traerlos del entry principal
// (que sí lleva "use client") no arrastra nada al bundle.
import type { Icon, IconProps } from "@phosphor-icons/react";

// Los íconos del sistema son Phosphor, siempre en peso light (stroke ~1px):
// nunca regular ni más grueso. Se importan de /dist/ssr, que no lleva
// "use client" y por eso sirve igual en Server y Client Components.
//
// Este módulo es la única puerta: los componentes importan de acá y no del
// paquete, así el peso queda garantizado en un solo lugar.
function delSistema(Base: Icon) {
  return function IconoDelSistema({ weight = "light", ...props }: IconProps) {
    return <Base weight={weight} {...props} />;
  };
}

export const IconoInicio = delSistema(HouseIcon);
export const IconoReloj = delSistema(ClockIcon);
export const IconoClientes = delSistema(UsersIcon);
export const IconoPlus = delSistema(PlusIcon);
export const IconoMas = delSistema(DotsThreeIcon);
export const IconoOjo = delSistema(EyeIcon);
export const IconoOjoCerrado = delSistema(EyeSlashIcon);
export const IconoCerrar = delSistema(XIcon);
export const IconoBuscar = delSistema(MagnifyingGlassIcon);
export const IconoCaja = delSistema(PackageIcon);
export const IconoCheck = delSistema(CheckIcon);

// ============================================================
// EXCEPCIÓN A LA REGLA DE ÍCONOS — pedida en sesión
//
// `CLAUDE.md` dice, con todas las letras: "Íconos: Phosphor, peso thin o
// light — stroke de 0.5 a 1px, nunca más grueso. NO usamos Lucide (lo usa
// todo sitio hecho con IA)". Estos dos son Lucide y van con stroke 2.
//
// Se aíslan acá, en la misma puerta que el resto, por una razón práctica:
// volver a Phosphor es cambiar estas tres líneas y nada más. Si se
// revierte, los equivalentes son ListIcon y XIcon.
//
// Solo el menú, la guía de pasos y la sección de precio de la landing. Que
// no se propaguen al panel.
// ============================================================
export {
  Menu as IconoMenu,
  X as IconoCerrarMenu,
  // Los tres pasos de la sección 03 y el check de "paso completado".
  // Van en gris y sin relleno: no son acciones, son señalización.
  Car as IconoAuto,
  Droplets as IconoFluidos,
  CircleCheck as IconoConfirmar,
  Check as IconoPasoHecho,
  // Sección 09 · precio. El mismo Check que arriba con otro nombre: en una
  // lista de "qué incluye" no está marcando un paso cumplido, y el nombre
  // del ícono es lo que se lee en el JSX.
  Check as IconoIncluido,
  Zap as IconoMismoDia,
  ShieldCheck as IconoGarantia,
  // Sección 10 · el acordeón de preguntas.
  ChevronDown as IconoDesplegar,
} from "lucide-react";

// Superficie del cliente final
export const IconoQR = delSistema(QrCodeIcon);
export const IconoHistorial = delSistema(ClockCounterClockwiseIcon);
export const IconoWhatsapp = delSistema(WhatsappLogoIcon);
export const IconoUbicacion = delSistema(MapPinIcon);
export const IconoTelefono = delSistema(PhoneIcon);
export const IconoPremio = delSistema(TrophyIcon);
export const IconoChevron = delSistema(CaretDownIcon);
export const IconoCandado = delSistema(LockSimpleIcon);

// Panel de administración de Fidelli
export const IconoLubricentro = delSistema(BuildingsIcon);
export const IconoMail = delSistema(EnvelopeSimpleIcon);
export const IconoAviso = delSistema(WarningIcon);
