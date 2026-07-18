# Contributing — Fidelli Motors

Guía de convenciones del equipo. Leela antes de abrir tu primer PR.

## Flujo de ramas

Usamos un modelo con dos ramas de larga vida y feature branches cortas.

| Rama        | Rol                                                                 |
| ----------- | ------------------------------------------------------------------- |
| `main`      | **Producción.** Siempre desplegable. Solo recibe merges desde `develop` (o hotfixes). |
| `develop`   | **Integración.** Rama base del día a día. Acá se juntan las features antes de ir a producción. |
| `feat/*`    | **Feature branches cortas.** Salen de `develop` y vuelven a `develop` por Pull Request. |

### Feature branches

- Salen **siempre desde `develop`** y se mergean **de vuelta a `develop`** vía Pull Request (nunca push directo).
- Mantenelas **cortas y enfocadas**: una feature = una branch = un PR.
- Nombralas con uno de estos prefijos según el área que tocan:

  | Prefijo         | Área                                                        | Ejemplo                     |
  | --------------- | ----------------------------------------------------------- | --------------------------- |
  | `feat/public-*` | Sitio público / frontend de cara al cliente                 | `feat/public-catalogo`      |
  | `feat/admin-*`  | Panel de administración / backoffice                        | `feat/admin-login`          |
  | `feat/db-*`     | Cambios de base de datos (schema, migraciones, RLS, seeds)  | `feat/db-tabla-vehiculos`   |

### Ciclo de trabajo típico

```bash
git checkout develop
git pull
git checkout -b feat/public-catalogo   # branch corta desde develop
# ...trabajás, commiteás...
git push -u origin feat/public-catalogo
# Abrís un PR: feat/public-catalogo -> develop
```

Cuando `develop` está estable y listo para publicar, se abre un PR `develop -> main`.

## Conventional Commits

Los mensajes de commit siguen [Conventional Commits](https://www.conventionalcommits.org/).
Formato: `tipo: descripción en imperativo y minúscula`.

| Tipo        | Cuándo usarlo                                                        |
| ----------- | ------------------------------------------------------------------- |
| `feat:`     | Nueva funcionalidad para el usuario                                 |
| `fix:`      | Corrección de un bug                                                |
| `chore:`    | Tareas de mantenimiento, config, tooling (sin cambio funcional)     |
| `refactor:` | Cambio de código que no agrega feature ni corrige bug               |
| `docs:`     | Solo documentación                                                  |

Ejemplos:

```
feat: agregar listado de vehículos en la home
fix: corregir cálculo de cuotas en el simulador
chore: actualizar dependencias de eslint
refactor: extraer cliente de supabase a lib/
docs: documentar variables de entorno en el readme
```

## Base de datos: migraciones versionadas

**Todo cambio de base de datos va como migración de Supabase versionada en el repo.**
No se tocan tablas, columnas, políticas RLS ni funciones "a mano" en el dashboard sin
dejar la migración correspondiente en el repositorio.

- Las migraciones viven en `supabase/migrations/` y se versionan junto con el código.
- Para crear una nueva migración:

  ```bash
  npx supabase migration new <nombre_descriptivo>
  ```

  Editá el archivo SQL generado con el cambio de schema.

- Los cambios de DB deberían ir en una branch `feat/db-*` y revisarse por PR como cualquier otro cambio.
- El link a los proyectos Supabase (dev/prod) y la aplicación de migraciones (`supabase db push`)
  los maneja el mantenedor con los refs de cada entorno; no hardcodees credenciales en el repo.

## Variables de entorno

- Copiá `.env.example` a `.env.local` y completá con los valores reales.
- `.env.local` está gitignoreado. **Nunca** commitees secretos reales.
- Si agregás una variable nueva, sumala también a `.env.example` (sin el valor) para el resto del equipo.
