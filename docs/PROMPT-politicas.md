# Sprint · Términos y Privacidad

Dos páginas públicas, un mecanismo de aceptación, y tres cambios chicos en la
base que las políticas exigen para ser ciertas. Los textos completos van al
final de este documento, en los anexos A y B: **se publican tal cual**, sin
reescribir ni "mejorar" el lenguaje. Son plain Spanish a propósito — es la voz
de la marca y es tan vinculante como el lenguaje de abogado.

Benchmark: Fudo tiene exactamente dos links en el pie —Condiciones y
Privacidad— y todo lo demás vive adentro. Acá igual. **Ninguna página más,
ningún link más, ningún banner.**

---

## 1 · Las dos páginas

**Rutas:** `/terminos` y `/privacidad`, en el route group `(landing)`.

- Diseño de la marca: Nunito para títulos, Public Sans para el cuerpo, medida de
  línea 65–75ch, ink sobre base. Sin hero, sin ilustración, sin cards. Es un
  documento: título, versión y fecha de vigencia arriba, secciones numeradas,
  y el bloque de contacto al final.
- El contenido sale de un archivo por documento (`content/legal/terminos.md`
  y `content/legal/privacidad.md`, o el patrón que ya use el blog) con un
  frontmatter `version` y `vigencia`. **El texto no va inline en un TSX.**
- `<title>` y meta description propios. Indexables.
- **Slugs reservados:** agregá `terminos`, `privacidad`, `legal` y
  `condiciones` a `slug_reservado()`, en su propia migración, con el mismo
  patrón de `20260812100000` y `20260907120000`. Hoy un lubricentro podría
  registrar el slug `terminos` y pisar la página.

## 2 · Dónde se enlazan

- **Pie de la landing** (`components/landing/pie.tsx`): dos links, "Términos" y
  "Privacidad". El comentario que dice "rutas de la entrega 2" se va.
- **Panel:** en el bloque de abajo del sidebar, junto a "Ayuda por WhatsApp" y
  "Cerrar sesión", una línea discreta con los dos links.
- **Página pública del lubricentro** (`/[slug]` y `/[slug]/[patente]`): en el
  pie de la página, **una línea**, ink-40, 12px:
  *"Esta página es de {nombre del lubricentro}. Fidelli Motors provee la
  tecnología · Privacidad"*, con "Privacidad" enlazando a
  `fidellimotors.app/privacidad`. Nada más. Es la única mención de Fidelli en
  la página del cliente y respeta la regla de que ahí el rojo de marca no
  aparece.

## 3 · La aceptación — es producto, no texto

Hoy nadie acepta nada. Dieciocho tenants usan el servicio sin contrato.

### 3.1 · La tabla

```sql
create table aceptaciones_terminos (
  id              uuid primary key default gen_random_uuid(),
  lubricentro_id  uuid not null references lubricentros(id) on delete restrict,
  usuario_id      uuid not null references usuarios(id) on delete restrict,
  version         text not null,          -- "1.0"
  aceptado_at     timestamptz not null default now()
);
```

Historial, no una columna: cuando cambie la versión, se agrega una fila y las
anteriores quedan. RLS: el owner ve las de su tenant; superadmin todas; nadie
las edita ni las borra — **es evidencia**, así que va con el mismo candado de
borrado que `cresium_eventos`.

### 3.2 · La versión, una sola fuente

`lib/legal.ts`:

```ts
export const VERSION_LEGAL = "1.0";
export const VIGENCIA_LEGAL = "2026-09-22";
```

Y el frontmatter de los dos archivos de contenido tiene que coincidir con esa
constante: una verificación que falle si no coinciden. Cuando se cambie un
texto de forma relevante se sube la versión, y el gate de abajo vuelve a
pedir la aceptación a todos.

### 3.3 · El gate

Misma mecánica que `onboarding_completado_at`: una función
`acepto_terminos_vigentes(lubricentro_id)` que devuelve true si existe una
aceptación con `version = VERSION_LEGAL`. El layout del panel la consulta en
el mismo select de sesión (cero round trips extra, como `plan_capacidades`).

- **Sin aceptación vigente → modal bloqueante** al entrar al panel: "Para
  seguir usando Fidelli, leé y aceptá los Términos y la Política de
  Privacidad", los dos links (abren en pestaña nueva), un checkbox y un botón
  "Aceptar y continuar". Sin cerrar, sin "después". Ink, nunca rojo: no es
  una acción de marca, es un trámite.
- Al aceptar, se inserta la fila y el modal no vuelve a aparecer hasta que
  cambie `VERSION_LEGAL`.
- **En el alta de un tenant nuevo** (el formulario de `/fidelli/nuevo` lo
  completa Santiago; la aceptación la hace el owner en su primer login): el
  gate cubre ese caso solo, sin agregar nada al alta.
- **Exentos:** superadmin, y el tenant demo (`slug = 'demo'`). Un prospecto
  viendo la demo no tiene que aceptar nada — el gate lo mira por slug, no por
  descuento.
- **Orden de los gates:** términos primero, onboarding después. Nadie carga
  un producto antes de haber aceptado el contrato.

## 4 · Tres cambios en la base que las políticas exigen

### 4.1 · Dejar de guardar las patentes que no son de nadie

`landing_busquedas` guarda la patente de cada consulta sin resultado, con un
índice `landing_busquedas_leads_idx` sobre esa columna. Santiago confirmó que
la patente solo se usa **en el momento**, para armar el mensaje de WhatsApp;
no se lee después. Entonces:

- `patente` pasa a **anulable**. Cuando `encontrada = false`, se guarda
  `null`. La métrica (cuántas consultas, cuántas sin resultado) no pierde
  nada.
- Se elimina `landing_busquedas_leads_idx`.
- **Backfill en producción:** `update landing_busquedas set patente = null
  where not encontrada`. Es un borrado de datos personales de gente que no es
  cliente de nadie: dejalo en su propia migración, con el comentario de por
  qué, y que R-lo-que-toque verifique que después de la migración no queda
  ninguna fila con `not encontrada and patente is not null`.
- Verificá que el mensaje dinámico de WhatsApp de la página pública sigue
  armándose igual: la patente viaja en el request, no en la tabla.

### 4.2 · Retención de 12 meses al cancelar

La política dice: al cancelar, todo queda intacto 12 meses; después se borra.
Hoy no existe ni la fecha de cancelación ni el borrado.

- `suscripciones` gana `cancelada_at timestamptz`. Se escribe cuando el estado
  pasa a `cancelada` (trigger, para que no dependa de que alguien se acuerde).
- Una función `purgar_tenants_vencidos()` que, para cada lubricentro cuya
  suscripción esté `cancelada` hace más de 12 meses, borra clientes,
  vehículos, services, service_items, service_ruedas, contactos, productos,
  premios, config, templates, landing_busquedas, y deja la fila de
  `lubricentros` con `activo = false` y un `purgado_at`. **No borra `pagos` ni
  `cresium_*`**: eso es contabilidad y se guarda el plazo fiscal.
- **Antes de borrar, escribe** en una tabla `purgas` qué tenant, cuántas filas
  de cada tabla, y cuándo. Evidencia primero, como siempre.
- Modo `p_simular boolean default true`: por defecto solo cuenta y escribe
  qué haría. Solo con `false` borra.
- Se programa con `pg_cron`, mensual, **en modo simulación**. Santiago lo
  pasa a real cuando haya visto una simulación correcta. Hoy no hay ningún
  tenant cancelado, así que no tiene nada que borrar durante meses: está bien
  que exista y no haga nada.
- Superadmin puede borrar antes, a pedido del tenant: la misma función con un
  `p_lubricentro_id` y un `p_motivo` obligatorio, auditado.

### 4.3 · Supresión de un cliente final: anonimizar, no borrar

Si un cliente de un lubricentro pide que borren sus datos (por email a
Fidelli), la política promete hacerlo. Pero el trabajo hecho sobre ese auto es
también el registro comercial del lubricentro, y `services → vehiculos →
clientes` está en `on delete restrict`.

- Una función `anonimizar_cliente(p_cliente_id, p_motivo)`, superadmin, que
  pisa `nombre` con "Cliente eliminado", y deja `telefono`, `email` y `cuit`
  en un valor sentinela no identificable (o null donde la constraint lo
  permita — `telefono` es `not null`: usá un sentinela fijo y documentado).
  Los trabajos quedan; la persona desaparece.
- Auditada, con motivo. Es el mismo patrón de `corregir_patente`.
- Y que el owner del tenant pueda hacerlo desde la ficha del cliente, porque
  el reclamo le va a llegar a él la mayoría de las veces. Mismo resultado.

## 5 · Lo que las políticas prometen y el producto todavía no hace

Que quede anotado, no que se construya en este sprint:

- **Aviso de ajuste de precio por email.** No hay proveedor de mail. Hasta que
  lo haya, ese aviso lo manda Santiago a mano desde `fidelli.motors@gmail.com`
  y por el canal de WhatsApp. El texto de los Términos lo dice así ("por
  email a la dirección registrada y por el canal de WhatsApp de Fidelli"):
  no promete automatización.
- **Aviso de incidente de seguridad.** Mismo canal manual.
- **Exportación con la cuenta en solo lectura.** La política promete que
  siempre se puede exportar. Verificá que la ruta de exportación funciona con
  `activo = false` y en gracia. Si no, arreglalo en este sprint: es una
  promesa escrita.

## 6 · Verificación

Cada punto se rompe a propósito primero.

1. Un lubricentro no puede registrar el slug `terminos` ni `privacidad`.
2. Un owner sin aceptación vigente entra al panel y ve el modal; no puede
   cerrarlo ni navegar; acepta; se inserta la fila con `version = "1.0"`; el
   modal no vuelve.
3. Se sube `VERSION_LEGAL` a "1.1": el mismo owner vuelve a ver el modal; la
   fila de "1.0" sigue existiendo.
4. Superadmin y el tenant demo nunca ven el modal.
5. Un `delete` sobre `aceptaciones_terminos` se rechaza.
6. Después de la migración 4.1, cero filas con `not encontrada and patente is
   not null`; una consulta nueva sin resultado guarda `patente = null`; el
   mensaje de WhatsApp de la página pública sigue armándose con la patente.
7. `purgar_tenants_vencidos()` en simulación sobre un tenant cancelado hace 13
   meses **escribe en `purgas` y no borra nada**; con `p_simular = false`
   borra las tablas listadas y **no toca `pagos`**.
8. `anonimizar_cliente()` deja los services del vehículo intactos y el nombre
   en "Cliente eliminado"; la ficha del cliente sigue abriendo.
9. La exportación funciona con `activo = false`.
10. Las dos páginas renderizan el texto de los anexos **sin cambios**: un diff
    entre el archivo de contenido y el anexo de este prompt da vacío.
11. La línea del pie en `/[slug]` no tiene ni un píxel del rojo de marca.

## 7 · Entrega

Dos PRs a `develop`:

- `feat/legal-paginas` — puntos 1, 2 y 3.
- `feat/legal-datos` — punto 4, con la migración de backfill de 4.1 separada y
  comentada.

**Antes de mergear el segundo:** Santiago revisa la simulación de la purga y
el backfill de patentes en dev. Los dos borran datos.

Y una nota para `CLAUDE.md`, junto a las reglas: *"Los textos legales viven en
`content/legal/` con versión. Cambiar un texto de forma relevante = subir
`VERSION_LEGAL` = todos vuelven a aceptar. Nunca se editan in place sin subir
la versión."*

---
---

# ANEXO A · TÉRMINOS Y CONDICIONES

**Términos y Condiciones del Servicio — Fidelli Motors**
Versión 1.0 · Vigente desde el 22 de septiembre de 2026

## 1. Qué es esto

Fidelli Motors es un servicio de software para lubricentros y talleres,
prestado por Santiago Afur, CUIT 23-43998170-9, Córdoba, Argentina ("Fidelli",
"nosotros"). Estos términos son el contrato entre Fidelli y el lubricentro o
taller que contrata el servicio ("vos", "el Cliente"). Al crear una cuenta o
usar el servicio, los aceptás. Si no estás de acuerdo con algo de lo que dicen,
no uses el servicio.

Es un servicio para comercios. Quien lo acepta declara ser mayor de 18 años y
tener facultades para obligar al comercio en cuyo nombre lo contrata.

## 2. El servicio

Fidelli te da un panel para cargar tus clientes, sus vehículos y cada trabajo
que hacés; calcula cuándo le toca volver a cada auto y te arma la lista de a
quién escribirle; te da una página pública con tu nombre y tu marca donde tus
clientes consultan su historial escaneando una calco con QR; te da plantillas
de WhatsApp para avisarles; un programa de fidelización opcional; y la
exportación de todos tus datos cuando quieras. Según el plan, incluye calcos
con QR y módulos opcionales.

Lo que Fidelli no hace: no manda mensajes por vos — los mandás vos, desde tu
WhatsApp, con un toque; no garantiza que un cliente vuelva; y no es un servicio
de mecánica ni de asesoramiento técnico.

La cuenta de demostración que mostramos antes de contratar tiene datos
ficticios.

## 3. Planes, precios y módulos

Los planes son Basic, Pro y Ultra, con los precios de lista vigentes que ves en
fidellimotors.app y en tu panel. Se pueden contratar por mes o por año; el
anual tiene el descuento que figura al momento de contratar. Los módulos
opcionales, como Gomería, se suman al precio de lista vigente del módulo.

Los precios son finales, en pesos. Facturamos con Factura C.

El cambio de plan se coordina con nosotros por WhatsApp; no se hace desde el
panel.

**Ajuste de precios.** Revisamos los precios cada tres meses. Si cambian, te
avisamos con 30 días de anticipación por email a la dirección registrada en tu
cuenta y por el canal de WhatsApp de Fidelli Motors. El precio nuevo aplica al
primer período que empiece después de ese aviso. Un plan anual ya pagado no se
ajusta hasta su renovación.

## 4. Pago

Pagás por transferencia bancaria al CVU o alias que te asignamos, propio de tu
cuenta. Los cobros se procesan a través de Cresium.

**Primer pago.** Al darte de alta tenés hasta el día siguiente para hacer el
primer pago. Si no llega, la cuenta se bloquea hasta que llegue. Una
transferencia parcial no activa el servicio; el saldo se completa al mismo
alias.

**Renovaciones.** El plan mensual se renueva cada 30 días y el anual cada 12
meses, en la fecha de vencimiento que ves en tu panel. Te avisamos antes.

**Si no pagás a tiempo.** Tenés siete días de gracia con el servicio
funcionando completo, con avisos en el panel. Pasados esos siete días la cuenta
pasa a solo lectura: ves todos tus datos, pero no podés cargar trabajos ni dar
de alta clientes, vehículos o productos. Tu página pública sigue respondiendo,
sin el programa de fidelización. En cuanto se acredita el pago, todo vuelve a
funcionar solo. No se borra nada.

## 5. Garantía de 30 días. Reembolsos.

Si en los primeros 30 días desde el alta el servicio no te sirve, te devolvemos
lo que pagaste. Te pedimos una sola cosa: que lo hayas usado de verdad — al
menos cinco trabajos cargados por semana durante ese período. Lo pedís por
email a fidelli.motors@gmail.com, lo verificamos y te devolvemos el importe por
transferencia.

Fuera de esa garantía **no hay reembolsos**, ni del plan mensual ni del anual,
ni totales ni parciales. Podés cancelar cuando quieras; el período que ya
pagaste no se devuelve y el servicio sigue disponible hasta que termine.

## 6. Calcos

El plan Pro incluye 200 calcos con tu QR y el Ultra 400, que te enviamos una
sola vez, durante el primer mes, por correo a la dirección que nos des. Las
embalamos con cuidado; no nos hacemos responsables por daños o pérdidas
producidos por el correo. Podés pedirnos más calcos cuando quieras, con costo
aparte que te cotizamos.

Si cancelás el servicio, las calcos y sus QR dejan de funcionar. Retirarlas o
avisar a tus clientes es responsabilidad tuya.

## 7. Tus datos y los de tus clientes

Todo lo que cargás en Fidelli — tus clientes, sus vehículos, los trabajos, tus
productos, tu logo — es tuyo. Nosotros lo tratamos por tu cuenta y solo para
prestarte el servicio, como se detalla en la sección 12.

Vos sos responsable de tener derecho a cargar los datos de tus clientes y de
informarles que los cargás.

Podés exportar todos tus datos desde el panel cuando quieras, también con la
cuenta en solo lectura.

**Al cancelar**, tu cuenta y tus datos quedan guardados intactos durante 12
meses: si volvés en ese plazo, retomás donde dejaste. Pasados los 12 meses los
borramos definitivamente. Si querés que los borremos antes, pedínoslo por email
y lo hacemos.

## 8. Tu página pública

Tu página en fidellimotors.app/tu-nombre permite que cualquiera que tenga la
patente de un vehículo consulte el historial de trabajos de ese vehículo en tu
lubricentro. Es lo que hace que tu cliente pueda escanear la calco y ver su
service. La página no muestra el nombre ni el teléfono de tus clientes, y desde
tu configuración elegís qué otros campos se muestran.

La página lleva tu nombre y tu marca. Fidelli figura al pie como proveedor de
la tecnología.

## 9. Programa de fidelización

Si activás el programa de fidelización, el premio lo definís y lo cumplís vos
con tus clientes. Fidelli solo lleva la cuenta de los trabajos.

## 10. Uso del servicio

Una cuenta por lubricentro, con los usuarios que permita tu plan. No cargues
datos de personas que no tengas derecho a cargar. No uses las plantillas de
WhatsApp para enviar publicidad masiva no solicitada. No intentes acceder a
datos de otros lubricentros. Ante un uso abusivo podemos suspender la cuenta,
avisándote.

## 11. Disponibilidad y cambios en el servicio

Hacemos todo lo posible para que Fidelli esté disponible siempre. El servicio
depende de proveedores de infraestructura y puede tener interrupciones; si se
cae, te avisamos. Mejoramos el producto continuamente y eso puede cambiar
funciones; nunca vas a perder la posibilidad de exportar tus datos.

## 12. Tratamiento de datos por cuenta del Cliente

Esta sección es el contrato que exige el artículo 25 de la Ley 25.326.

**Roles.** Vos sos el responsable de los datos de tus clientes. Fidelli es el
encargado del tratamiento: los procesa por tu cuenta.

**Finalidad.** Prestarte el servicio descripto en estos términos, y nada más.

**Datos.** Nombre, teléfono, email y CUIT de tus clientes; patente, marca,
modelo y año de sus vehículos; los trabajos realizados, con kilómetros,
productos y observaciones.

**Instrucciones.** Fidelli trata los datos únicamente según estos términos y
según lo que vos hacés en el panel. No los usa para ningún otro fin, no los
cede a terceros y no los vende.

**Proveedores.** Para prestar el servicio, Fidelli usa Supabase (base de datos
y archivos, alojados en San Pablo, Brasil) y Vercel (la aplicación, alojada en
Estados Unidos). Al aceptar estos términos autorizás la transferencia
internacional de los datos a esos proveedores, que están sujetos a sus propios
compromisos contractuales de protección de datos.

**Seguridad.** Cifrado en tránsito, aislamiento de los datos de cada
lubricentro, acceso con credenciales y copias de respaldo.

**Incidentes.** Si detectamos un acceso no autorizado a tus datos, te avisamos
sin demora.

**Derechos de tus clientes.** Si un cliente tuyo nos pide acceder, corregir o
borrar sus datos, lo hacemos: te avisamos y ejecutamos el pedido. Si el pedido
te lo hacen a vos, podés resolverlo desde el panel o pedírnoslo.

**Al terminar.** Vale lo de la sección 7: 12 meses de conservación con
exportación disponible, y después borrado definitivo.

## 13. Responsabilidad

Fidelli se presta tal como está. No respondemos por lucro cesante, pérdida de
clientes ni daños indirectos. Nuestra responsabilidad total frente a vos, por
cualquier causa, se limita al importe que nos pagaste en los seis meses
anteriores al hecho que la origine. No respondemos por los datos que cargás ni
por lo que hagas con tus clientes.

## 14. Propiedad intelectual

El software, la marca Fidelli Motors y el diseño del servicio son de Fidelli.
Tu nombre, tu logo y tus datos son tuyos; nos autorizás a mostrarlos en tu
página pública y en tus calcos mientras uses el servicio.

## 15. Cambios en estos términos

Podemos modificar estos términos. Te avisamos por el panel y por email con 30
días de anticipación, y si el cambio es relevante te pedimos que los aceptes de
nuevo. Si seguís usando el servicio, los aceptás.

## 16. Ley y jurisdicción

Estos términos se rigen por las leyes de la República Argentina. Cualquier
conflicto se resuelve en los tribunales ordinarios de la ciudad de Córdoba.

## 17. Contacto

Santiago Afur · CUIT 23-43998170-9 · Córdoba, Argentina
fidelli.motors@gmail.com · WhatsApp +54 9 351 373-6028

---
---

# ANEXO B · POLÍTICA DE PRIVACIDAD

**Política de Privacidad — Fidelli Motors**
Versión 1.0 · Vigente desde el 22 de septiembre de 2026

## 1. Quién es responsable

Fidelli Motors es prestado por Santiago Afur, CUIT 23-43998170-9, Córdoba,
Argentina. Para cualquier tema de privacidad escribinos a
fidelli.motors@gmail.com.

## 2. De quién guardamos datos, y cuáles

**Si visitás fidellimotors.app.** Medimos el uso del sitio con Google
Analytics y el Píxel de Meta: qué páginas se ven, desde dónde llega la visita,
qué dispositivo se usa y si se toca el botón de WhatsApp. Esa medición no nos
permite identificarte. Si nos escribís por WhatsApp, tu número y tu mensaje
quedan en nuestro WhatsApp.

**Si sos un lubricentro o taller cliente.** El nombre del comercio y del
titular, email, teléfono, CUIT, la dirección de envío de las calcos y los datos
de tus pagos (la confirmación de cada transferencia; no vemos tus datos
bancarios más allá de lo que muestra la transferencia).

**Si sos cliente de un lubricentro que usa Fidelli.** Tu nombre, teléfono,
email y CUIT (si lo cargaron), la patente, marca, modelo y año de tu vehículo,
y los trabajos que te hicieron. **Estos datos los carga tu lubricentro, que es
el responsable de ellos; Fidelli los trata por su cuenta.** Si querés
consultarlos, corregirlos o borrarlos, pedíselo a tu lubricentro o escribinos
y lo gestionamos.

**Si consultás una patente en la página de un lubricentro.** Registramos que
hubo una consulta y si tuvo resultado. Si la patente no está cargada en ese
lubricentro, no la guardamos.

## 3. Para qué

Para prestar el servicio, cobrarlo, dar soporte, medir cómo funciona el sitio
y cumplir obligaciones legales. Nada más.

## 4. Dónde viven los datos

La base de datos y los archivos están alojados en Supabase, en servidores
ubicados en San Pablo, Brasil. La aplicación corre en Vercel, en Estados
Unidos. Eso implica una transferencia internacional de datos; ambos
proveedores están sujetos a compromisos contractuales de protección de datos.
Los cobros se procesan con Cresium, en Argentina, y los envíos de calcos con
Andreani, en Argentina.

## 5. Con quién se comparten

Con nadie más que los proveedores anteriores, y solo para prestar el servicio.
No vendemos, alquilamos ni cedemos datos.

## 6. Cuánto tiempo

Mientras la cuenta del lubricentro esté activa, y durante 12 meses después de
que la cancele, para que pueda retomar el servicio con sus datos intactos.
Pasados esos 12 meses, se borran definitivamente. Los datos de facturación se
conservan el plazo que exige la normativa fiscal.

## 7. Seguridad

Cifrado en tránsito, aislamiento de los datos de cada lubricentro, acceso con
credenciales y copias de respaldo. Ningún sistema es infalible: si detectamos
un incidente que afecte tus datos, te avisamos.

## 8. Tus derechos

Podés pedir acceso a tus datos, rectificarlos, actualizarlos o suprimirlos,
como establecen los artículos 14 a 16 de la Ley 25.326. Escribinos a
fidelli.motors@gmail.com. Respondemos los pedidos de acceso dentro de los 10
días corridos, y los de rectificación o supresión dentro de los 5 días hábiles.
Es gratis. Si sos cliente de un lubricentro, también podés hacer el pedido
directamente al lubricentro.

El titular de los datos personales tiene la facultad de ejercer el derecho de
acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses,
salvo que se acredite un interés legítimo al efecto, conforme lo establecido en
el artículo 14, inciso 3 de la Ley N° 25.326.

La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, Órgano de Control de la Ley
N° 25.326, tiene la atribución de atender las denuncias y reclamos que se
interpongan con relación al incumplimiento de las normas sobre protección de
datos personales.

## 9. Menores

Fidelli es un servicio para comercios y no está dirigido a menores de edad.

## 10. Cambios en esta política

Si la cambiamos, avisamos en el panel y por email. La versión y la fecha de
vigencia figuran arriba.

## 11. Contacto

Santiago Afur · CUIT 23-43998170-9 · Córdoba, Argentina
fidelli.motors@gmail.com · WhatsApp +54 9 351 373-6028
