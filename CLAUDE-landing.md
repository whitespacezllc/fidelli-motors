# Fidelli Motors — landing comercial

> **Archivo complementario de `CLAUDE.md`.** Cubre **solo la landing comercial**:
> identidad visual, reglas de comunicación y copy de esa pieza.

## Precedencia — resuelto, no interpretable

1. Lo que se diga en el chat de la sesión gana sobre cualquier archivo. Si contradice algo
   de acá, **avisá antes de aplicarlo**.
2. **`CLAUDE.md` gana en todo lo demás:** stack, infraestructura, rutas, base de datos,
   nombres de tokens, convenciones de código, flujo de git.
3. **Este archivo gana solo en:** identidad visual de la landing comercial, tipografía,
   uso del color de marca, copy y estructura de secciones.
4. Si encontrás una contradicción que no cae claramente en 2 o 3, **frená y preguntá.**
   No la resuelvas por tu cuenta.

---

# Vocabulario — las tres superficies

Esto existe porque "landing" significaba dos cosas distintas y se prestaba a confusión.
De acá en adelante, estos son los nombres:

| Nombre | Ruta | Marca | Rojo Motors |
|---|---|---|---|
| **Landing comercial** | `/` | Fidelli Motors | **Sí.** Es nuestra marca, acá manda |
| **Superficie del cliente** | `/[slug]` y `/[slug]/[patente]` | Del lubricentro | **No. Ni un píxel.** Shell neutro pintado con el color del lubricentro |
| **Panel** | `/panel`, `/fidelli` | Fidelli Motors | Según `CLAUDE.md` |

**La regla del rojo es por superficie, no global.** Las dos reglas conviven y no se contradicen:

- En la **landing comercial**, `#E01F26` es identidad y acción, y `#FDECEC` es superficie
  en la sección Fidelliza.
- En la **superficie del cliente**, el rojo Motors no aparece nunca. La jerarquía se sostiene
  en tipografía y espaciado, porque el color lo pone cada lubricentro.
- **En las dos:** el rojo nunca comunica estado. La urgencia vive en la escala ámbar.

Este archivo habla **solo de la landing comercial**. Todo lo que dice `CLAUDE.md` sobre la
superficie del cliente sigue vigente sin cambios.

---

# Qué es esto

Fidelli Motors digitaliza el cartón de service que hoy vive en el parasol del auto. El
lubricentro carga el trabajo desde el celular en menos de 90 segundos; el dueño del auto
escanea un QR del parasol, escribe la patente y ve su historial, sin cuenta ni app. Y el
lubricentro obtiene la lista de a quién contactar esta semana, con el mensaje de WhatsApp
ya armado.

**El cliente es el lubricentro**, no el dueño del auto.

## A quién le habla la landing comercial

Dueño-operador de un lubricentro independiente, 35-55 años, atiende el mostrador y
probablemente también carga los services él mismo. Sin administración. WhatsApp es su
sistema operativo. Vio otros sistemas y ninguno lo convenció. Su dolor textual es
**"tengo un montón de planillas de Excel y están desordenadas"**, no el cartón perdido.

Tono: directo, rioplatense, sin jerga de software. Hablamos en **kilómetros, no en fechas**.
Nunca "potenciá tu negocio", nunca "la mejor plataforma". Si un competidor puede firmar la
misma frase, no sirve.

---

# Tipografía

| Familia | Cuándo |
|---|---|
| **Nunito** 400/600/700 | Voz de la marca: títulos, prosa, cifras destacadas, botones |
| **Public Sans** 400/600 | Voz del instrumento: tablas, inputs, labels, badges |

Regla que decide: **contenido de marca o de cliente → Nunito. Dato operativo en tabla o
formulario → Public Sans.**

**Cuidado con las cifras.** "$46.750", "150+", "1:24" son cifras de marca: van en **Nunito**
y **además** en `tabular-nums`. El reflejo "número = Public Sans" las manda a la familia
equivocada; el reflejo inverso las deja sin tabular. Son las dos cosas a la vez.

## Escala — razón 1.25

| Escalón | px | Peso | LH | LS | Familia |
|---|---|---|---|---|---|
| h1 | 39 | 700 | 1.1 | −1.5% | Nunito |
| h2 | 31 | 700 | 1.1 | −1% | Nunito |
| h3 | 25 | 600 | 1.2 | — | Nunito |
| lead | 20 | 400 | 1.4 | — | Nunito |
| body | 16 | 400 | 1.5 | — | según contexto |
| ui | 14 | 400/600 | 1.45 | — | Public Sans |
| label | 12 | 600 | 1.35 | +6% | Public Sans · mínimo absoluto |

El escalón `display` (52px) y la escala `c-*` (18/22/28/32) son de otras superficies.
**En la landing comercial no se usan.**

## Las tres reglas innegociables

1. **Cifras alineadas siempre en tabular.**
2. **Cero itálicas.** El énfasis se resuelve con peso, nunca con inclinación.
3. **Nada por debajo de 12px.**

Medida de línea: **máximo 65–75 caracteres en prosa.** Los leads son largos y en desktop se
estiran solos si el contenedor no los topa — poné el tope explícito, no confíes en el layout.

---

# Color

**Los tokens los define `globals.css`. No inventes nombres de token: si el que necesitás no
existe, decilo y frená.** Un nombre inventado en Tailwind v4 no genera nada y **falla en
silencio**, que es el peor modo de falla posible.

Mapeo conocido entre este documento y los tokens reales:

- Lo que acá se llama conceptualmente **"imminent"** es **`--color-urgente`** en el código.
- `overdue`, `upcoming`, `success` y `reward` coinciden.
- Ante cualquier duda, la fuente de verdad es `globals.css`, no este archivo.

## Regla de oro

**El rojo nunca comunica estado, y ningún estado usa rojo.** El rojo es identidad y acción;
la urgencia vive en la escala ámbar.

> **El caso que más se rompe solo:** "Quedan 4 de 5 lugares" es escasez, y el reflejo de
> landing es pintarla de rojo. **No.** Va en texto normal o con el punto de estado que
> corresponda. Lo mismo con cualquier contador de cupos.

## Texto sobre fondo grafito — hueco del sistema, resuelto acá

Las secciones 05, 06 y 11 van sobre `#0A0A0A`, donde `ink-60` e `ink-40` son ilegibles.
El design system no define escala invertida, así que para la landing comercial vale esto:

- Texto principal sobre grafito: **`#FFFFFF`**
- Texto secundario sobre grafito: **`rgba(255,255,255,.72)`**
- Texto terciario sobre grafito: **`rgba(255,255,255,.55)`** — solo para líneas cortas,
  nunca para prosa
- Bordes y divisores sobre grafito: **`rgba(255,255,255,.14)`**

Verificar AA en los tres. Si algo no llega, subir la opacidad, no bajar el tamaño.

## Otras reglas

- **Contraste mínimo AA:** 4.5:1 en cuerpo, 3:1 en títulos.
  `#D97706` no llega a 4.5:1 sobre blanco: **sirve como punto de color, no como texto.**
- Los estados se dicen con **badge sobrio**: punto de color + texto en grafito.
  Nunca fondo de fila, nunca color solo.
- **Light mode únicamente.** No agregar `prefers-color-scheme` ni toggles.

---

# Reglas de la landing comercial

## CTA — la formulación precisa

**Hay una sola acción primaria en toda la página: escribir por WhatsApp.** Esa acción se
repite en varios lugares —navbar, hero, precio, cierre y la barra fija de mobile— y está
bien que se repita.

Lo prohibido es **dos acciones primarias distintas compitiendo**. "Ingresar" no puede ser
un botón rojo al lado de "Quiero mi lugar": es enlace de texto.

Todos los CTA apuntan al mismo href:

```
https://wa.me/5493513736028?text=Hola%20Santiago%2C%20tengo%20un%20lubricentro%20y%20quiero%20saber%20m%C3%A1s%20de%20Fidelli%20Motors
```

## Resto

- **No hay formularios.** El público prefiere escribir directo por WhatsApp.
- En mobile el CTA va en **barra fija al pie**, no en el menú hamburguesa.
- Orden narrativo: **dolor → deseo → duda.** El QR va en el medio, no en el hero.
- El copy está cerrado en `docs/landing-spec.md`. **No lo reescribas.** Si algo no cierra,
  decilo y esperá confirmación. Salió de entrevistas con un cliente real.
- **Nada de "100%" en promesas de seguridad.** No es sostenible y es riesgo legal.

## Imágenes

- **Ninguna persona generada por IA.** La credibilidad descansa en "esto funciona en
  Brothers Oil": un mecánico generado es el detalle que un prospecto huele.
- **Ninguna captura de producto generada.** El panel está en producción.
- Las imágenes IA de ambiente son temporales. Cada una vive con **el nombre de archivo final**
  que va a tener la real, para que el reemplazo del viernes no toque código.

---

# Rutas — acordar con CLAUDE.md antes de tocar

La landing comercial va en `/`. Hoy esa ruta tiene un redirect por sesión: **hay que moverlo,
no romperlo.** Criterio propuesto, a confirmar:

- `/` sirve **siempre** la landing comercial, con o sin sesión.
- **"Ingresar" apunta siempre a `/login`**, con o sin sesión. `/login` ya redirige al panel
  que corresponda si hay sesión activa. El navbar **no lee la sesión**: la landing es la
  página que más tráfico anónimo va a recibir y tiene que quedar estática. Un texto dinámico
  tipo "Ir a mi panel" no vale una consulta a Supabase por visita fría.
- Rutas nuevas de la landing: **solo** `/terminos` y `/privacidad`.
- Los links del navbar son anclas de la misma página, no subpáginas.

## Indexación — corregido

- **`/` (landing comercial):** `index`.
- **`/[slug]` (superficie del cliente):** `index`. Es la vidriera del lubricentro y le suma.
- **`/[slug]/[patente]`:** `noindex`. Contiene historial de un vehículo identificable.
- **Panel:** `noindex`.

## Palabras reservadas

**La lista canónica es la función `slug_reservado()` en la migración de SQL.** Ahí y en ningún
otro lado: la constraint tiene que evaluarla en el INSERT, y el front ya la consulta vía
`slug_estado()`. No la copies a TypeScript ni la repitas en documentación.

**Regla de proceso, más importante que la lista:** toda ruta nueva de nivel superior se agrega
a `slug_reservado()` **en el mismo PR que la crea.** El costo de reservar una palabra crece con
la cantidad de tenants — hoy con uno es gratis, con doscientos es una migración con víctimas.
Por eso conviene reservar de más ahora y no después.

**Antes de cualquier migración que agregue palabras:** `create or replace function` **no
re-valida** el CHECK sobre las filas existentes. Correr primero en producción
`select slug from lubricentros where slug_reservado(slug);` y confirmar que da vacío.

---

# Checklist antes de mergear a main

- [ ] Ninguna itálica, ningún tamaño por debajo de 12px
- [ ] Ningún estado ni contador de cupos en rojo
- [ ] Ningún `prefers-color-scheme`
- [ ] Una sola acción primaria, todos los CTA al mismo href de WhatsApp
- [ ] "Ingresar" como enlace de texto, no botón
- [ ] Contraste AA verificado, sobre todo en los bloques grafito
- [ ] Cifras de marca en Nunito **y** en tabular-nums
- [ ] Prosa topada en 65–75 caracteres
- [ ] Mobile probado de verdad, no solo en el inspector
- [ ] Ningún token inventado: todos existen en `globals.css`
- [ ] Imágenes IA con el nombre de archivo definitivo
- [ ] La landing sigue siendo estática: ningún componente del navbar lee la sesión
- [ ] Si el PR crea una ruta nueva de nivel superior, está agregada a `slug_reservado()`

---

# Stack y flujo de trabajo

Los define `CLAUDE.md`. **Acá no se duplica nada** — dos fuentes de verdad sobre lo mismo es
peor que ninguna.

Lo único propio de la landing comercial:

- **Las fuentes se sirven desde nuestro dominio.** El navegador del visitante no hace
  ninguna request a un CDN externo en runtime. **Esto es una intención, no un mecanismo:**
  cualquier implementación que lo cumpla está bien. `next/font/google` lo cumple —descarga
  en build y sirve desde el propio dominio— y ya está en uso en todo el proyecto, así que
  **no se toca**.

---

# SEO y GEO — decisiones fijas

Implementado en la sesión del 13/08/2026. Lo que sigue no se revisa en cada PR: se cambia
solo con una decisión explícita.

## Identidad — un solo lugar

`lib/seo.ts` es la fuente del nombre, la URL, el título, la description y la imagen OG.
**"Fidelli Motors" se escribe idéntico en title, Open Graph, JSON-LD, footer y llms.txt** —
sin "Fidelli" suelto ni "FidelliMotors". El title y la description arrancan con una oración
completa que se entiende sola ("Fidelli Motors es..."): los motores generativos citan
pasajes fuera de contexto.

Las palabras clave de búsqueda ("sistema de gestión para lubricentros", etc.) viven SOLO en
metadata, alt text y llms.txt. El copy de las secciones no se toca por SEO.

## Superficies indexables

| Ruta | Indexación |
|---|---|
| `/` | index |
| `/[slug]` | index — la vidriera del lubricentro |
| `/[slug]/[patente]` | **noindex** — historial de un vehículo identificable, sin excepción |
| `/panel`, `/fidelli`, `/login`, `/auth/*`, `/recuperar` | noindex + Disallow en robots |

`/[slug]/[patente]` NO se bloquea en robots.txt a propósito: el noindex es una meta en el
HTML y el crawler tiene que poder entrar a leerla. Tampoco va nunca en el sitemap.

Los títulos de las páginas declaran solo su nombre; el template del layout raíz agrega
"| Fidelli Motors". **La superficie del cliente usa `title: { absolute }`**: esa página es
del lubricentro y no lleva nuestra marca en el título.

## Crawlers de IA — permitidos, decisión de negocio

`app/robots.ts` permite explícitamente: GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot,
Claude-User, Claude-SearchBot, PerplexityBot, Perplexity-User, Google-Extended,
Applebot-Extended, CCBot y meta-externalagent. El objetivo es aparecer cuando alguien le
pregunte a un modelo qué sistema usar para su lubricentro. **No se bloquean sin discutirlo.**

## llms.txt

`public/llms.txt`. **Todo su contenido sale del copy que ya está publicado en la landing** —
si algo no está dicho en la página, no va en llms.txt. Cuando cambia el copy de una sección
citada ahí, llms.txt se actualiza en el mismo PR.

## Datos estructurados

- `/`: Organization + SoftwareApplication (`components/landing/datos-estructurados.tsx`) y
  FAQPage (vive en `preguntas.tsx`, al lado de las preguntas). Los precios del JSON-LD
  tienen que coincidir EXACTO con la sección 09.
- `/[slug]`: AutoRepair con SOLO los campos reales del registro. `horarios` es texto libre
  y no se emite como openingHours; geo no existe en la base.
- **PROHIBIDO: AggregateRating, Review o cualquier schema de reseñas.** No hay reseñas
  verificables y el schema falso es penalización directa. Con testimonios reales
  autorizados, entran como Review con autor identificado — no antes.

## La tarjeta de WhatsApp

`public/assets/og-image.jpg` — 1200×630, JPEG (la misma imagen en PNG pesaba 947KB y
WhatsApp recorta arriba de ~300KB). Declarada SIEMPRE con width, height y alt: sin
dimensiones, WhatsApp muestra miniatura en vez de tarjeta. Servida directo desde
`/assets/`, sin redirects. El PNG original queda en el repo como fuente de diseño.
