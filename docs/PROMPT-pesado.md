# Sprint · Carga de vehículo pesado

Pedido de **LUBRICANTES DE SA** (Gastón, el cliente más grande: ~50 camiones por
mes) y de **Taller PSM**. 7 de los 13 clientes actuales atienden vehículo pesado.

Aprobado y maquetado. Esto no es una exploración: es la implementación de una
decisión ya tomada. Lo que sigue dice qué hacer, qué NO hacer, y qué verificar.

---

## Lo que esto NO es

Leé esto antes que nada, porque cada línea de acá es un día perdido si se
interpreta al revés.

- **NO es un `tipo_trabajo` nuevo.** Gomería lo fue porque es otra pantalla
  (rueda por rueda, alineación, rotación, retornos). Esto es **el mismo cartón
  con más renglones**. Si aparece un cuarto valor en `tipo_trabajo`, se paró mal.
- **NO es un módulo pago.** Sin `plan_permite`, sin feature nueva en
  `catalogo_features_plan()`, sin policy nueva, sin gate. Los renglones nuevos
  los tiene todo el mundo desde el plan Basic.
- **NO se renombra ningún valor de enum existente.** Hay +900 trabajos cargados
  y cada uno quiere decir lo que decía el día que se cargó.
- **NO hay backfill ni migración de datos.** Los trabajos viejos simplemente no
  tienen filas de los tipos nuevos.
- **NO se toca `guardar_service` ni `actualizar_service`.** Las dos castean
  `(v_item->>'tipo')::item_tipo` de forma genérica y el `delete … not in (…)` de
  `actualizar_service` es una subconsulta sobre el jsonb entrante, no una lista
  fija. Verificado: **ninguna función SQL enumera valores de `item_tipo`.**
- **NO se crea un grupo «Revisión».** La batería va como renglón suelto, sin
  encabezado de grupo. El grupo sería la puerta por la que después entran luces,
  escobillas y presión de neumáticos.

---

## Fase 1 · Los diez renglones

### 1.1 · La migración del enum, sola en su archivo

Es la regla que ya está escrita en `20260911120000_tipo_trabajo_neumaticos.sql`:
un valor nuevo de enum no se puede usar en la misma transacción que lo crea, y
cada archivo de migración corre en su propia transacción.

**El orden del enum ES el orden del cartón físico** — está comentado en
`20260723171645_extensiones_y_enums.sql`. Agregar al final rompe el cartón de un
camión. Por eso todo va con `AFTER`.

**Cada `AFTER` se ancla a un valor que YA existía antes de esta migración**, y
por eso cada bloque va en orden inverso. Anclar a un valor agregado en la misma
transacción es exactamente el caso que Postgres puede rechazar.

```sql
-- Filtros de servicio pesado, después del último filtro del cartón original.
-- Orden inverso a propósito: cada uno se inserta justo después de
-- 'filtro_habitaculo' y empuja a los anteriores hacia abajo.
alter type item_tipo add value if not exists 'filtro_hidraulico'             after 'filtro_habitaculo';
alter type item_tipo add value if not exists 'filtro_urea'                   after 'filtro_habitaculo';
alter type item_tipo add value if not exists 'filtro_secador_aire'           after 'filtro_habitaculo';
alter type item_tipo add value if not exists 'filtro_aire_secundario'        after 'filtro_habitaculo';
alter type item_tipo add value if not exists 'filtro_separador_agua'         after 'filtro_habitaculo';
alter type item_tipo add value if not exists 'filtro_combustible_secundario' after 'filtro_habitaculo';

-- Aceites, después del último aceite del cartón original. Mismo criterio.
alter type item_tipo add value if not exists 'aceite_diferencial_delantero'  after 'aceite_hidraulico';
alter type item_tipo add value if not exists 'aceite_caja_reductora'         after 'aceite_hidraulico';

-- Engrase y batería cierran el cartón, en ese orden.
alter type item_tipo add value if not exists 'bateria' after 'aditivo_transmision';
alter type item_tipo add value if not exists 'engrase' after 'aditivo_transmision';
```

**El orden resultante, que es lo que hay que verificar:**

```
filtro_aceite · filtro_aire · filtro_combustible · filtro_habitaculo
filtro_combustible_secundario · filtro_separador_agua · filtro_aire_secundario
filtro_secador_aire · filtro_urea · filtro_hidraulico
aceite_caja · aceite_diferencial · aceite_hidraulico
aceite_caja_reductora · aceite_diferencial_delantero
liq_refrigerante · liq_frenos
aditivo_motor · aditivo_transmision
engrase · bateria
```

`filtro_hidraulico` es **el filtro**. `aceite_hidraulico` es **el aceite** y ya
existía desde el día uno. Son dos renglones distintos y es el error más fácil de
cometer en toda esta migración.

Ningún CHECK cambia: `service_completo`, `mecanica_coherente` y
`neumaticos_coherente` no mencionan `item_tipo`. Ninguna policy cambia.

### 1.2 · `lib/renglones.ts`

`RENGLONES` pasa de 11 a 21 entradas y cada una gana un alcance:

```ts
export type AlcanceRenglon = "siempre" | "pesado" | "extra";
```

- `siempre` — los 11 de hoy. Visibles para todos, siempre.
- `pesado` — los 9 de camión. Desplegados cuando el vehículo es pesado.
- `extra` — solo `bateria`. Nunca desplegada por clase; siempre detrás del `+`.

Dos entradas ganan una relectura para vehículo pesado. **Mismo `item_tipo`,
mismo valor en la base, solo cambia cómo se lee la etiqueta:**

| `item_tipo` | Liviano | Pesado |
|---|---|---|
| `filtro_combustible` | Combustible | Combustible primario |
| `aceite_diferencial` | Diferencial | Diferencial trasero |

`grupo` pasa a admitir `null`: la batería es un renglón suelto sin encabezado.
`GRUPOS` suma `"LUBRICACIÓN"` (contiene solo `engrase`) al final.
`GRUPOS_CON_ETIQUETA_EN_PAPEL` no cambia.

Los nombres cortos, tal como los dijo Gastón y como están en la maqueta:
Combustible secundario · Separador de agua · Aire secundario · Secador de aire ·
Urea (AdBlue) · Hidráulico · Caja reductora · Diferencial delantero · Engrase ·
Batería.

### 1.3 · El `+` en la carga — `components/services/carton.tsx`

Al pie del cartón, después del último grupo:

- Cerrado: `+ Otros renglones (N)`, con N = los que no están a la vista.
- Abierto: los renglones aparecen **en su grupo**, en su posición del cartón —
  no en una lista aparte al final. Un filtro de urea pertenece a FILTROS.
- El botón se comporta como un `aria-expanded` de verdad y respeta el mínimo de
  44px de área táctil.
- Un renglón marcado **nunca se oculta**. Si alguien marcó batería y después
  cierra el `+`, la batería sigue a la vista. Perder una marca por cerrar un
  acordeón es la peor falla posible de esta pantalla.

### 1.4 · Los cuatro lugares que consumen `RENGLONES` y se rompen solos

Esto es lo que va a explotar si se toca `lib/renglones.ts` y nada más:

| Archivo | Qué pasa | Qué hacer |
|---|---|---|
| `components/landing/simulador-carga.tsx:65` | `RENGLONES.filter(r => r.grupo === "FILTROS")` pasa de 4 a 10 filtros **en la landing pública** | Filtrar además por `alcance === "siempre"`. La landing muestra un auto. |
| `components/services/carton-papel.tsx:248` | La versión papel imprime los 21 renglones en un troquel diseñado para 11 | Imprimir solo los renglones **que existen en ese service**, más los de la clase del vehículo. Para un camión el «cartón físico» de referencia no existe: no hay papel con urea. |
| `components/services/carton.tsx:1256` | La pantalla de carga muestra 21 renglones a todos | Es el trabajo de 1.3. |
| `app/panel/…/services/exportar/route.ts:49` | `ETIQUETA_RENGLON: Record<ItemTipo, string>` es un Record total: **`tsc` no compila** hasta que estén las 10 etiquetas nuevas | Completarlas. En el export va **una sola etiqueta por valor**, siempre la neutra («Filtro de combustible»), nunca la relectura de pesado: dos nombres para el mismo valor rompen cualquier filtro o tabla dinámica del cliente. |

---

## Fase 2 · La clase en el vehículo

### 2.1 · La columna

```sql
create type clase_vehiculo as enum ('liviano', 'pesado');

alter table vehiculos add column clase clase_vehiculo;

comment on column vehiculos.clase is
  'null = nadie la declaró todavía; el front lo lee como liviano. Se guarda solo cuando alguien la contesta en el alta. La MOTO no vive acá: se deriva de la chapa (patente_formato_valido), como se decidió en 20260904120000.';
```

**Anulable y no `not null default ''liviano''`, a propósito.** Marcar los ~900
vehículos existentes como «liviano» sería afirmar algo que no sabemos: SA ya
tiene camiones cargados. `null` distingue «nunca se preguntó» de «se contestó
liviano», y eso permite después salir a buscar los vehículos sin clasificar.
El front lee `clase ?? "liviano"`.

### 2.2 · El campo en el alta

Va en el alta del vehículo, al lado de marca / modelo / año. **Nunca en la
carga del service.** Un camión es camión para siempre: preguntarlo en cada
carga son 600 respuestas por año a una pregunta que no cambia. El segundo
service del mismo camión no pregunta nada.

Dos botones, `Liviano` (auto · camioneta · moto) y `Pesado` (camión · colectivo),
con área táctil de 44px.

**Pre-selección por marca**, como constante en el front — es una ayuda de UI, no
una regla de negocio, así que no va a la base ni a `marcas_vehiculo`:

```ts
// Marcas que en Argentina son camión o colectivo sin ambigüedad. Las que hacen
// las dos cosas (Mercedes-Benz, Iveco, Ford, Volvo, Renault) NO van acá:
// arrancan en Liviano y el mecánico corrige.
export const MARCAS_PESADAS = [
  "Scania", "DAF", "MAN", "Hino", "Agrale",
  "Kenworth", "Freightliner", "International", "Western Star",
];
```

### 2.3 · Qué hace la clase

Solo una cosa: **decide qué viene desplegado**. Nunca decide qué existe.

- `clase` liviano o null → 11 a la vista, 10 detrás del `+`.
- `clase` pesado → 20 a la vista, 1 (batería) detrás del `+`.

Es un default, no una puerta. **En ninguna combinación de clase puede quedar un
renglón inalcanzable.** Si aparece un tercer valor de clase algún día, el
comportamiento por defecto tiene que ser mostrar el set liviano, nunca ninguno.

---

## Verificación

Regla de la casa: *una prueba que nunca viste en rojo no existe.* Cada punto de
acá se rompe a propósito primero.

1. **El orden del enum.** `select enumlabel from pg_enum where enumtypid =
   'item_tipo'::regtype order by enumsortorder;` contra la lista de 21 de arriba,
   en ese orden exacto.
2. **`tsc --noEmit` en rojo** antes de completar `ETIQUETA_RENGLON`, en verde
   después. Es la única red que impide mandarle al cliente un Excel con una
   celda en blanco.
3. **Un service viejo** de los +900: se abre, se edita dentro de las 24 hs y se
   guarda sin ninguna diferencia respecto de hoy.
4. **Un service de camión completo**: se guardan los 10 renglones nuevos, se
   leen en el detalle, se ven en la página pública del cliente y salen en el
   Excel con la etiqueta correcta.
5. **La landing**: el simulador de carga sigue mostrando 4 filtros. Mirala, no
   la deduzcas.
6. **La versión papel** de un service de camión: no se desborda el troquel.
7. **El `+`**: con la clase en liviano y el `+` abierto, aparecen los 10. Marcá
   la batería, cerrá el `+`, y la batería **sigue a la vista**.
8. **Clase null**: la pantalla de carga es idéntica a la de producción hoy.
   Contá los renglones.

---

## Entrega

Dos PRs a `develop`, en este orden y sin mergear el segundo antes que el primero:

- `feat/pesado-renglones` — Fase 1 completa (la migración del enum va sola en su
  archivo, con el comentario de cabecera explicando por qué, al estilo de
  `20260911120000`).
- `feat/pesado-clase-vehiculo` — Fase 2.

Documentá en `CLAUDE.md`, junto a las minas que ya están anotadas, las dos de
este sprint:

- El orden del enum `item_tipo` es el orden del cartón: todo valor nuevo entra
  con `AFTER`, anclado a un valor preexistente.
- `filtro_hidraulico` y `aceite_hidraulico` son dos renglones distintos.

**La maqueta aprobada es la fuente de verdad visual.** Ante una duda de qué se
ve y cuándo, abrila — no la adivines.
