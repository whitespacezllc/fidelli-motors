# Fidelli Motors

SaaS de retención para lubricentros: digitaliza el cartón de service. El lubricentro
carga el service, el cliente escanea un QR y ve su historial y cuándo le toca volver.

Stack: **Next.js 16** (App Router) · **Supabase** (PostgreSQL) · **Tailwind v4** · Vercel.

## Referencia visual — `docs/`

El diseño **no se adivina**: la carpeta [`docs/`](docs/) es la fuente de verdad visual.
Ante cualquier duda de UI, abrila antes de escribir componentes.

- `Design System.html` · `Estados Visual.html` · `Panel de Administración.html`
- `HI-FI x 6 Pantallas Críticas.html` — las pantallas críticas navegables
- `Paleta y Color System.pdf` · `Escala Tipográfica.pdf` — tokens de color y tipografía

Los tokens ya viven en [`app/globals.css`](app/globals.css). El criterio de producto
(reglas de diseño, copy, decisiones técnicas) está en [`CLAUDE.md`](CLAUDE.md).

## Desarrollo local

```bash
supabase start        # Postgres + Auth + Studio en Docker
supabase db reset     # aplica migraciones + seed (lubricentro demo, slug "demo")
npm run dev           # http://localhost:3000
```

- Studio: http://127.0.0.1:54323 · Mailpit (mails): http://127.0.0.1:54324
- Copiá `.env.example` a `.env.local` y completá las claves de Supabase.

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npm run types` | Regenera `lib/database.types.ts` desde el schema local |

Convenciones de ramas y commits: ver [`CONTRIBUTING.md`](CONTRIBUTING.md).
