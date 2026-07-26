import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // ============================================================
  // La guarda de suspensión, garantizada en tiempo de compilación
  //
  // Un lubricentro suspendido conserva el acceso y ve todos sus datos: eso
  // es a propósito. Lo que no puede es escribir. Esa comprobación vive en
  // sesionParaEscribir() y NO en obtenerSesion(), porque a esta última la
  // llaman también las pantallas, que sí tienen que seguir funcionando.
  //
  // El problema de una separación así es que se olvida: la acción que
  // alguien escriba dentro de tres meses copia la de al lado y listo. Por
  // eso no queda librada a la memoria — importar obtenerSesion desde una
  // Server Action del panel es un error de lint, y `npm run lint` no pasa.
  //
  // Una acción que de verdad solo lee puede desactivar la regla en su
  // línea, y ahí queda escrito por qué. Eso es lo que se busca: que
  // saltearse la guarda sea una decisión visible en el diff, no un
  // descuido.
  // ============================================================
  {
    files: ["app/panel/**/actions.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/auth/session",
              importNames: ["obtenerSesion"],
              message:
                "En una Server Action del panel va sesionParaEscribir(): además de la sesión y el tenant, comprueba que el lubricentro no esté suspendido. Si esta acción SOLO lee, dejá obtenerSesion con un eslint-disable-next-line y un comentario que lo diga.",
            },
          ],
        },
      ],
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
