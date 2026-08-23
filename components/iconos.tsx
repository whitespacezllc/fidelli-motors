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
  WrenchIcon,
  ReceiptIcon,
  PaletteIcon,
  ChatCircleTextIcon,
  UserCircleIcon,
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
// LA EXCEPCIÓN DE LUCIDE — ahora documentada en CLAUDE.md
//
// Doce íconos de la LANDING COMERCIAL, y solo de ahí. La razón es de
// escala: son señalización a tamaño grande y necesitan stroke 2, que
// Phosphor light no da. La regla completa con sus límites está escrita en
// CLAUDE.md → "Decisiones técnicas"; el resumen es que este bloque es el
// único lugar donde Lucide puede aparecer, y que al panel y a la
// superficie del cliente no se propagan nunca.
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
  // Sección del calco · los pasos del cliente final.
  ScanLine as IconoEscanear,
  History as IconoVerHistorial,
} from "lucide-react";

// El paso 2 del cliente es "escribe la patente", y no existe un ícono de
// patente en lucide — ni parecido. La patente es EL objeto central del
// producto (es la llave de todo el historial), así que merece una marca
// dibujada y no un genérico de tarjeta. Está dibujada en el lenguaje de
// lucide para convivir con ScanLine e History: grilla 24×24, stroke 1.5,
// extremos y uniones redondeados, sin relleno. La banda superior es la
// franja azul de la chapa Mercosur; los tres trazos de abajo, los grupos
// de caracteres.
export function IconoPatente({
  className,
  strokeWidth = 1.5,
  "aria-hidden": ariaHidden,
}: {
  className?: string;
  strokeWidth?: number;
  "aria-hidden"?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      className={className}
    >
      <rect x="2.75" y="6" width="18.5" height="12" rx="2" />
      <path d="M2.75 10h18.5" />
      <path d="M6.25 14.25h3" />
      <path d="M11.5 14.25h2.5" />
      <path d="M16.25 14.25h1.5" />
    </svg>
  );
}

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

// Los que completan los 11 ítems del sidebar. Faltaban siete y la lista
// quedaba a medio camino entre una barra con íconos y una de solo texto,
// que es peor que cualquiera de las dos: el ojo busca la marca visual
// donde no está.
export const IconoTrabajos = delSistema(WrenchIcon);
export const IconoPresupuesto = delSistema(ReceiptIcon);
export const IconoDiseno = delSistema(PaletteIcon);
export const IconoMensajes = delSistema(ChatCircleTextIcon);
export const IconoCuenta = delSistema(UserCircleIcon);
