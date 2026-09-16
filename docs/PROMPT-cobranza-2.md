# Sprint Cobranza · Addendum tras la auditoría

Esto **se suma** a `PROMPT-cobranza.md`, no lo reemplaza. Lo que no se nombra
acá queda como estaba. La auditoría de producción encontró cinco cosas que el
prompt no sabía y Santiago tomó las decisiones. Van acá para que lleguen al
código antes de que se escriba.

**Corrección de base: son 17 tenants, no 13.** El prompt decía 13 y estaba mal.

---

## 1 · El flag cambia de rol

La auditoría probó que los datos están limpios: `vencimiento = max(periodo_hasta)`
en las 15 filas con pagos, ninguno se suspende solo, cero apagados a mano.

Así que el flag **ya no es una red contra datos sucios: es un control de
rollout**, y eso le cambia la forma. Hacen falta **dos interruptores, no uno**:

- **`cobranza_activa`** — el reloj corre y avisa. Se prende **por tenant**, no
  global: arranca con dos o tres que pagan en fecha.
- **`suspension_automatica`** — el reloj puede pasar `activo` a false. **Arranca
  apagado, para todos.**

El primer ciclo es **solo avisos**. La primera vez que esto corre es la primera
vez que el cálculo de plata se encuentra con tenants reales, y un monto mal
calculado que además suspende a alguien no se arregla con una disculpa. La
suspensión automática se prende en el segundo ciclo. Con un solo interruptor
esto no se puede expresar, por eso son dos.

---

## 2 · La exención sale del dato, no del slug

Un tenant con **`suscripciones.descuento_pct = 100`** paga cero: no hay nada que
cobrarle. Queda **fuera del circuito de cobranza entero — reloj incluido**, no
solo de la pantalla de pago. Sin cuenta regresiva, sin barra, sin modal, sin
orden de pago.

Hoy son dos (Brothers Oil en trial y el tenant demo). **No los hardcodees por
slug.** Si mañana Santiago le da 100% a alguien más, tiene que funcionar solo.

---

## 3 · Semestral se esconde

`periodo_suscripcion` sigue siendo `mensual · semestral · anual`. **El valor del
enum no se toca nunca.** Lo que cambia es la pantalla de pago: no ofrece
semestral.

Y la regla la decide el dato, no una constante: **si
`planes.descuento_semestral_pct > 0`, la opción aparece sola.** Hoy es 0 en los
cuatro planes, o sea que semestral es pagar seis meses por adelantado a precio
de lista — estrictamente peor que mensual para el cliente. El día que Santiago
le ponga un descuento desde `/fidelli/precios`, se muestra sin tocar código.

Mismo criterio que el 25%: bien visto que `descuento_anual_pct` vive en la base.
**No lo hardcodees en TypeScript**, ni el anual ni el semestral.

---

## 4 · El plan "Fidelli Motors" se desactiva. No se borra ni se renombra.

Santiago quiere que quede solo Basic, Pro y Ultra. Pero ese plan **no es un plan
viejo de un cliente: es el plan de la cuenta demo**, y lo crean
`20260723225403_seed_demo.sql` y `20260724040841_auth_trigger_usuarios.sql`, los
dos buscándolo **por nombre** (`where nombre = 'Fidelli Motors'`) y, si no lo
encuentran, **insertándolo de nuevo a $45.000**.

Por eso las tres formas de "quitarlo" fallan distinto:

| Camino | Qué pasa |
|---|---|
| `delete` | `on delete restrict` lo bloquea (la demo tiene suscripción). Y si alguien fuerza el camino, la próxima corrida del seed lo recrea a $45.000, pisando el precio real. |
| Renombrarlo | Los dos seeds dejan de encontrarlo y **crean un duplicado**. |
| **`activo = false`** | Sale del catálogo, de los desplegables y de `/fidelli/precios`. La demo sigue andando porque el lookup por nombre no filtra por `activo`. **Es el único que hace lo que se quiere.** |

Es la misma regla del sprint anterior con el enum: **la historia sigue queriendo
decir lo que decía.** Un plan desactivado deja intactos los `pagos` viejos; uno
borrado los convierte en filas que apuntan a nada.

**Y anotá esta drift**, que muerde justo mientras testeás el cálculo de plata:
los seeds dicen **$45.000** y producción dice **$46.750**. Un `supabase db reset`
te deja un catálogo distinto al real.

---

## 5 · El precio de los módulos

El motivo del override **no guarda el monto** — guarda `pago` o `bonificado` y
una fecha. El precio no vive en texto libre: no vive en ningún lado. Y
`lib/modulos.ts` lo dice en su encabezado: *"Hasta que haya facturación de
verdad…"*. **Este sprint es eso.**

### La tabla, al lado de `planes`

```sql
create table modulos (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique,   -- el mismo valor de ModuloPago: 'neumaticos'
  nombre         text not null,          -- "Módulo Gomería"
  precio_mensual numeric(12,2) not null check (precio_mensual >= 0),
  activo         boolean not null default true,
  created_at     timestamptz not null default now()
);
```

Seed: `('neumaticos', 'Módulo Gomería', 25000)`. Editable desde
`/fidelli/precios`, igual que los planes. **El precio es dato, no constante.**

### El derecho al módulo NO se toca

Sigue siendo el override de plan + el motivo, que ya tiene auditoría propia
(`cambios_override_plan`, con autor, fecha y motivo obligatorio) y funciona.
Lo único que se suma es de dónde sale el número.

### El cálculo

- Tiene el módulo y el motivo dice `pago` → suma `precio_mensual × meses`.
- Dice `bonificado` → **suma cero**.

**Capuzzi tiene gomería bonificada de por vida**, así que la rama `bonificado`
hace falta desde el día uno, no es un caso hipotético. Y que el motivo de
Capuzzi diga *de por vida* con todas las letras: `leerMotivoModulo()` solo
devuelve la forma y la fecha de inicio, y el motivo es el único registro que
existe. Si no lo dice, en seis meses alguien lo "corrige" pensando que venció.

### Dónde vive el parser del motivo

Hoy el regex vive en `lib/modulos.ts`. Si el cálculo de plata va a SQL —y
debería, porque las reglas de negocio viven en la base—, **seguí el precedente
de `patente_formato_valido()`**: la fuente única es una función SQL, y el front
conserva su copia **solo** para avisar antes del rechazo del server. No dos
fuentes de verdad peleando.

### Sin prorrateo

Un módulo que se prende a mitad de período **se cobra desde la renovación
siguiente**. No inventes prorrateo en este sprint.

---

## 6 · Auditoría de cambios de precio de lista

**No existe.** Hay auditoría para overrides (`cambios_override_plan`) y para
patentes (`correcciones_patente`), pero `planes.precio_mensual` se edita desde
`/fidelli/precios` y no queda rastro de quién, cuándo ni por qué.

Con plan anual congelando precio doce meses, *"¿por qué este cliente paga esto y
desde cuándo?"* va a ser una pregunta hecha por un cliente, y hoy no tiene
respuesta. Es barata ahora y no se puede reconstruir después.

Una tabla con el mismo patrón que `cambios_override_plan`: qué cambió, de cuánto
a cuánto, quién, cuándo y **motivo obligatorio**. Cubre `planes.precio_mensual`,
los dos `descuento_*_pct` y `modulos.precio_mensual`.

La regla de la que sale todo esto, y que conviene dejar escrita en `CLAUDE.md`:
**toda la plata es dato y no constante, y todo cambio de plata deja rastro con
autor, fecha y motivo.**

---

## 7 · Cómo se ordena `/fidelli`

Para que el panel interno no se convierta en un cajón de sastre, tres familias.
Ninguna pantalla nueva que no entre en una:

- **Catálogo** — lo que vendemos: planes, módulos, precios. Cambia poco, lo
  cambia Santiago, afecta a todos los futuros.
- **Contrato del tenant** — lo que *un* cliente tiene: plan, período, descuento,
  overrides, vencimiento. Cambia por excepción y **siempre con motivo y autor**.
- **Operación** — lo que se mira todos los días y no se edita: quién vence,
  quién pagó, quién está en gracia.

En este sprint: **`modulos` es catálogo**, **cobranza es operación**. Las dos
entran sin ensuciar nada.

---

## Verificación que se suma a la del prompt original

Cada punto se rompe a propósito primero.

1. Un tenant con `descuento_pct = 100` **no aparece en ningún estado de
   cobranza**, no recibe barra, ni modal, ni orden de pago. Probalo con los dos
   que existen y con uno nuevo puesto a 100 a mano.
2. Con `suspension_automatica` apagada, un tenant a +8 días **avisa pero no se
   suspende**. `activo` sigue en true.
3. `cobranza_activa` apagada en un tenant: no ve nada, ni siquiera la barra de
   `por_vencer`.
4. El 25% del anual sale de la base: cambiá `descuento_anual_pct` a 30 en una y
   verificá que el monto se mueve **sin tocar código**.
5. Semestral no aparece en la pantalla. Poné `descuento_semestral_pct = 10` en
   un plan y verificá que aparece solo.
6. El plan desactivado no figura en ningún desplegable, y la demo **sigue
   funcionando** después de desactivarlo. Corré el seed y verificá que **no
   crea un duplicado**.
7. Los montos, con tests: Basic mensual · Pro mensual · Pro anual ·
   Pro + gomería paga mensual · Pro + gomería paga anual · **Capuzzi
   (gomería bonificada)** · un founding al 50% anual.
8. Un cambio de `precio_mensual` sin motivo se rechaza; con motivo queda
   registrado con autor y fecha.
