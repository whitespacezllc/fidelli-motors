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
