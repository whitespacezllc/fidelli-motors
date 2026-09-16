# Sprint · Cobranza, vencimiento y Cresium

Tres fases. **La Fase 1 no toca Cresium y se puede empezar ya**: el reloj de
cobranza no depende de ninguna credencial. Las fases 2 y 3 esperan el
`CRESIUM_SECRET`.

La maqueta aprobada es la fuente de verdad visual de la Fase 2. Ante una duda
de qué se ve y cuándo, abrila — no la adivines.

---

## Lo primero: qué es Cresium y qué no

Leí el OpenAPI completo (`api.cresium.app/openapi.json`). **Cresium no es un
procesador de suscripciones: es un banco con API.**

- `POST /v3/payment-order/` — la sección se llama **"Emisión y gestión de Pagos
  Únicos"**. Creás una orden con el monto y tu `externalId`, y devuelve un
  **CVU dedicado**. Estados `NOT_PAID · PARTIAL · PAID · EXPIRED`, con `amountPaid`.
- **Un solo evento de webhook: `DEPOSIT`.** Trae adentro el objeto
  `paymentOrder` con tu `externalId`, tu `metadata`, el `amountPaid` y el
  `status`.
- `GET /v3/transaction/receipt/{id}` — el comprobante en PDF, base64.

**No existe**: suscripción, recurrencia, tarjeta, débito automático, token
guardado ni checkout hosteado. No busques un SDK de suscripciones: no hay.

Consecuencia de producto: **la pantalla de pago es nuestra de punta a punta**,
y el "success" no es un redirect — es la misma pantalla cambiando sola cuando
entra el webhook.

---

## Lo que YA existe. No lo construyas de nuevo.

| Pieza | Dónde |
|---|---|
| Panel en solo lectura | `lubricentros.activo = false` + `lib/auth/session.ts` (`lubricentroActivo`) + `components/panel/aviso-suspension.tsx`, con el copy ya escrito |
| Landing caída | `get_landing` filtra por `l.activo` (migración `20260725013000`) |
| Cartón por patente que **sobrevive** a la suspensión | `get_carton` — el comentario dice *"Sin filtro por activo, a propósito (2B)"*. **No se toca.** |
| Fecha, período y descuento | `suscripciones.vencimiento`, `.periodo`, `.descuento_pct` |
| Zona horaria | `20260813120000_timezone_argentina.sql` |

Lo que **no** existe: ninguna relación entre `vencimiento` y `activo`. Hoy eso
lo hace un humano a mano.

---

# Fase 1 · El reloj

## 1.1 · El estado se DERIVA, no se guarda

Mismo patrón que `vista_proximos_service`: una función que calcula el estado a
partir de la fecha, no una columna que alguien tiene que mantener al día.

```
al_dia      vencimiento >= hoy + 7
por_vencer  hoy <= vencimiento < hoy + 7
gracia      vencimiento < hoy <= vencimiento + 7
suspendido  hoy > vencimiento + 7   ·  o  activo = false
```

- `lubricentros.activo` queda como el **interruptor manual del superadmin** y
  gana siempre: apagarlo suspende sin esperar ninguna fecha.
- **La ventana de gracia es configurable**, no un 7 hardcodeado en diez lugares.
- **Hoy es hoy en Argentina**, no en UTC. `vencimiento` es un `date`; usá el
  helper de `20260813120000` o alguien se suspende tres horas antes.
- **El tenant demo queda exento**, siempre. Que la cuenta demo aparezca
  suspendida en medio de una venta es el peor bug posible de este sprint.

Nada de un cron dando vuelta booleanos: el día que no corre, todos quedan
gratis; el día que corre dos veces, suspendés a alguien que pagó.

## 1.2 · La escalera

**Sube la visibilidad, nunca la fricción.** El que ve el aviso es el mecánico
con las manos con aceite y un cliente esperando; el que decide pagar es el
dueño. **La carga de un service no se hace más lenta ni un segundo, en ningún
estado.** Si aparece un modal sobre el cartón, se paró mal.

| Estado | Qué se ve |
|---|---|
| `por_vencer` | Barra discreta **solo en Inicio**. Fecha, monto y botón Pagar. En ninguna otra pantalla. |
| `gracia` | Barra ámbar persistente en todo el panel, con los días que quedan. **Un modal por día**, al entrar, nunca sobre la carga. Todo sigue a la misma velocidad. |
| `suspendido` | Lo que ya existe: `AvisoSuspension` + solo lectura. |

Ámbar (`--color-overdue` / `--color-urgente`), **nunca rojo**: el rojo de marca
es acción y nunca estado. El rojo sí va en el botón Pagar, que es una acción.

El "un modal por día" se recuerda en `localStorage` por dispositivo. Si no hay
storage, no se muestra: un modal que no se puede cerrar para siempre es peor
que no mostrarlo.

## 1.3 · La landing degradada

Hoy `/[slug]` devuelve 404 cuando `activo = false`, indistinguible de un slug
que no existe. **Eso cambia.** Un tenant suspendido muestra:

- Nombre, dirección y teléfono de la sucursal, y el botón de WhatsApp.
- **Sin** historial de services, **sin** próximo service, **sin** premio.

El razonamiento, que es lo que hay que preservar si mañana alguien lo discute:
el cliente final nunca firmó nada con Fidelli. Que su lubricentro se haya
atrasado un día no puede hacerle creer que el taller cerró. Llega igual a su
taller; lo que se cae es el producto, que es lo que el dueño paga. Va en la
misma dirección que la decisión 2B de `get_carton`.

Un slug inexistente **sigue siendo 404**. Son dos casos distintos y ahora se
ven distinto.

---

# Fase 2 · Cresium

## 2.1 · Credenciales y MCP

`CRESIUM_API_KEY`, `CRESIUM_SECRET`, `CRESIUM_COMPANY_ID` y opcionalmente
`CRESIUM_BASE_URL`. **Las tres son server-side. Ninguna lleva `NEXT_PUBLIC_`.**
La firma es HMAC: aunque quisieras, no funciona desde el browser.

Hay staging en `https://api.develop.cresium.app`. **Usalo.** Y usá el MCP de
Cresium (`github.com/Cresium/cresium-mcp-server`, 25 tools incluidas
`create_payment_order`, `search_payment_orders`, `get_transaction`) para crear
una orden real en develop y verla cambiar de estado, en vez de programar contra
un OpenAPI y esperar lo mejor. En una integración de pagos esa es la diferencia
entre "compila" y "lo vi cobrar".

**El MCP se configura SOLO con las credenciales de develop.** Un MCP con la key
de producción es un agente que puede mover plata de verdad.

## 2.2 · La firma HMAC — leé esto dos veces

Cuatro headers obligatorios: `x-api-key`, `x-company-id`, `x-timestamp`,
`x-signature`.

```
firma = base64( HMAC-SHA256( secret, "{timestamp}|{METHOD}|{PATH}|{BODY}" ) )
```

Las cuatro formas de romperla, todas silenciosas (dan 401 sin decir por qué):

1. **`x-company-id` va en los headers pero NO en la firma.** Meterlo rompe todo.
2. **`PATH` incluye el query string.** `/v3/transaction/search?fromDate=…`
   completo, no el path pelado.
3. **`BODY` es string vacío `""` en GET**, no `null` ni `"{}"`.
4. **El timestamp va en UTC con la `Z` final.** Con offset `-03:00` la firma
   falla. Y hay ventana de **60 segundos**: un reloj corrido rechaza todo.

Una sola función que firma, con un test que compara contra el ejemplo textual
de la doc. **Vela en rojo primero** cambiándole un carácter al string firmado.

## 2.3 · La orden de pago

- Una orden por renovación. `externalId` = el id de la suscripción + el período,
  para que sea único y reconstruible.
- **El monto no es el precio del plan.** Es
  `plan × (1 − descuento_pct/100) × meses + módulos`. Gomería son **$25.000**.
  Los founding tienen `descuento_pct = 50`. El anual lleva 25% off.
  Una sola función calcula esto, con tests de los casos: Pro, Pro+gomería,
  founding mensual, founding anual. Cobrarle mal a alguien en el primer mes del
  sistema de pagos es la peor primera impresión posible.
- **Ojo con el límite de 300 CVUs por Company.** Cada pago único crea un CVU
  dedicado; con 80 clientes son ~960 órdenes al año. Antes de escribir el
  scheduler de órdenes, **confirmá con el MCP en develop si el CVU se libera al
  pagarse o al expirar**, y dejalo anotado. Si no se libera, hay que borrar las
  órdenes `EXPIRED` con `DELETE /v3/payment-order/{externalId}` o el sistema se
  queda sin CVUs en el cuarto mes.

## 2.4 · El webhook — la parte peligrosa

Una ruta que recibe `DEPOSIT`. **No hay sesión de Supabase acá**: la llama
Cresium, no un usuario. Tres reglas que no se negocian:

1. **Verificá la firma ANTES de leer nada del body.** Es la única puerta. Un
   `externalId` en un payload sin firmar es un string que cualquiera puede
   mandar para activarse la suscripción gratis. Si la firma no valida:
   401 y no se toca la base.
2. **Idempotente.** Cresium reintenta **hasta 5 veces** si no respondés 2xx.
   Un unique sobre el id de transacción de Cresium, y el segundo intento
   responde 200 sin acreditar dos veces. Sin esto, un reintento le regala
   doce meses a alguien.
3. **La service role key se usa acá y en ningún otro lado del request path**,
   y jamás sale al bundle del cliente.

Guardá el **payload crudo** en su propia tabla, inmutable: es la evidencia. El
día que un cliente diga "yo transferí", el evento crudo es la respuesta.
`pagos` se deriva de ahí. Ojo que `pagos.registrado_por` es `not null
references usuarios(id)` y un cobro por webhook no tiene usuario: hay que
resolverlo (anulable, con comentario) — no lo tapes con un usuario falso.

**`PARTIAL`:** si `amountPaid < monto`, **no se activa nada**. La pantalla dice
cuánto falta, con el mismo CVU vivo para completar. Solo `PAID` extiende el
`vencimiento`.

## 2.5 · La pantalla y el success

Seguí la maqueta. Lo que importa:

- **Anual por defecto**, con el ahorro **en pesos**, no en porcentaje.
- **Se elige período, nunca plan.** El cambio de plan es una conversación de
  venta por WhatsApp, a propósito.
- El desglose completo, línea por línea, para que el número sea verificable.
- Alias y CVU con botón de copiar. Área táctil 44px.
- **El success es esta misma pantalla cambiando sola** cuando llega el webhook
  (polling suave o realtime de Supabase, lo que sea más simple y no castigue la
  batería). El disco entra, la marca se dibuja, el anillo se abre una vez y el
  texto sube. Nada rebota ni gira: es una confirmación, no una celebración.
  `prefers-reduced-motion` la apaga entera.
- El comprobante sale de `GET /v3/transaction/receipt/{id}`. No lo armes vos.

Minimal, estético, cuidado. Es la pantalla donde el cliente nos da plata: es la
que más tiene que parecerse a lo que vendemos.

---

# Fase 3 · Cobranzas en /fidelli

Una pantalla interna: quién vence en los próximos 15 días y quién está en
gracia, con el monto **ya calculado** y un `wa.me` armado por tenant, listo para
tocar y mandar. No hay envío automático en este sprint, y está bien: el mensaje
de Santiago convierte mejor que cualquier plantilla, y no sumamos un proveedor
de mensajería para trece clientes.

---

## Antes de que esto toque producción

**Auditá las trece filas de `suscripciones`.** Los `vencimiento` se cargaron
cuando nadie los estaba mirando. Si prendemos el estado derivado con esa data,
algún cliente que pagó se suspende solo el día uno. Esto no es una verificación
de código: es una consulta a producción y una decisión de Santiago, fila por
fila. **Dejá la Fase 1 detrás de un flag hasta que esa auditoría esté hecha.**

## Verificación

*Una prueba que nunca viste en rojo no existe.* Cada punto se rompe a propósito
primero.

1. Los cuatro estados, con fechas límite: `vencimiento` = hoy, hoy−1, hoy−7,
   hoy−8. El borde de la gracia es exactamente donde tiene que estar.
2. `activo = false` gana sobre cualquier fecha.
3. El tenant demo nunca sale de `al_dia`.
4. La firma HMAC contra el ejemplo textual de la doc; y las cuatro roturas
   (company-id adentro, path sin query, body `"{}"` en GET, timestamp local).
5. El webhook con firma inválida: 401 y cero escrituras.
6. El mismo webhook cinco veces: un solo pago acreditado, cinco respuestas 200.
7. `PARTIAL` no extiende el `vencimiento`.
8. Los montos: Pro, Pro+gomería, founding mensual, founding anual.
9. **Ningún modal aparece sobre la pantalla de carga**, en ningún estado.
10. La landing de un tenant suspendido muestra nombre y WhatsApp; la de un slug
    inexistente sigue en 404.
11. El cartón por patente sigue vivo con el tenant suspendido.

## Entrega

Un PR por fase, a `develop`, en orden. La Fase 1 sale sola y no espera
credenciales.

- `feat/cobranza-reloj`
- `feat/cobranza-cresium`
- `feat/cobranza-panel-fidelli`

Anotá en `CLAUDE.md`, junto a las minas que ya están: las cuatro formas de
romper la firma HMAC, y que el webhook tiene que ser idempotente porque Cresium
reintenta cinco veces.
