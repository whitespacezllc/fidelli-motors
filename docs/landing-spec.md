# Landing de conversión — especificación

Once secciones. Copy cerrado. El diseño visual sale del design system en `CLAUDE.md`.

**Orden narrativo: dolor → deseo → duda.** Abre por el desorden porque es lo que lo hace frenar;
sigue por la facilidad porque es la condición de entrada; después los resultados. El QR va en el
medio, no arriba — es el "y encima", no el gancho. Las dudas se responden **antes** del precio.

---

## 01 · Navbar

**Trabajo:** no estorbar y tener el CTA siempre a mano.

**Desktop** — logo a la izquierda · links al centro-derecha · CTA primario a la derecha.
Sticky, fondo translúcido con blur, borde inferior de 1px al scrollear. Altura 64px.

**Mobile** — logo + hamburguesa. Altura 56px.
**El CTA no va en el menú:** va en una barra fija al pie, visible durante toda la página.

**Links:** Cómo funciona · Precio · Preguntas · Ingresar
Tres links y nada más. Cada link extra es una salida. "Ingresar" es enlace de texto, no botón.

**CTA:** `Quiero mi lugar`

---

## 02 · Hero

**Trabajo:** que se reconozca en la primera línea. Si no se ve retratado en tres segundos,
el resto de la página no existe.

**Desktop** — dos columnas. Izquierda: eyebrow, h1, lead, dos CTAs, línea de prueba social.
Derecha: foto. **La línea de prueba social va arriba del fold.**

**Mobile** — una columna, **texto primero, imagen después**. Nadie hace scroll para leer el titular.

### Copy — opción A, la elegida

> **Eyebrow:** Para lubricentros y talleres
>
> **H1:** Tus services están en un Excel, un cuaderno y un cartón que se pierde.
>
> **Lead:** Fidelli Motors los junta en un solo lugar. Cargás el service en 90 segundos
> y el sistema te dice a quién le toca volver.
>
> **CTA primario:** Quiero mi lugar → WhatsApp
> **CTA secundario:** Ver cómo se carga ↓ → ancla a la sección 03, sin color
>
> **Prueba social:** ● Funcionando en Brothers Oil, Córdoba · Quedan 4 de 5 lugares

### Alternativas guardadas

- **B, situación deseada:** "Todo tu lubricentro, en una sola pantalla." /
  "Dejá las planillas sueltas. Cargá el service como lo hacés a mano y sabé exactamente
  quién vuelve, quién no y a quién le toca."
- **C, pregunta:** "¿Sabés cuántos services hiciste el mes pasado? ¿Y a quiénes?" /
  "Fidelli Motors te lo contesta en dos segundos. Y te dice a quién llamar esta semana."

### Notas

- **Imagen:** foto real del panel abierto en un celular, en el box, con el auto detrás.
  **No un mockup flotante** — este público confía en lo que reconoce.
- El contador de lugares solo si es verdadero y se mueve. Un "quedan 4" congelado tres meses
  destruye credibilidad; si no hay demanda todavía, sacalo.

---

## 03 · La prueba de que es fácil

**Trabajo:** matar la duda número uno. Se responde mostrando, no explicando.
Es la sección que más convierte y la más barata de producir.

**Desktop** — título centrado, toggle segmentado, y abajo dos columnas: video 3:4 a la
izquierda, tres pasos en cards a la derecha.
**Mobile** — título, toggle, video a ancho completo sangrado a los bordes, pasos apilados.

### Copy

> **H2:** Así se carga un service. Sin cortes.
> **Lead:** Grabado en Brothers Oil, con el cronómetro corriendo.
>
> **Toggle:** Desde el celular | Desde la compu
>
> **Pasos:**
> 1. **Patente y kilómetros** — Si el auto ya vino, aparece todo solo.
> 2. **Aceite y filtros** — De tu propio catálogo, cargado en la instalación.
> 3. **Confirmar** — Listo. El próximo service se calcula solo.
>
> **Remate:** ⏱ 1:24 en el video, sin acelerar

"Sin cortes" es la palabra clave: todo el mundo sabe que un video de producto está editado.
**Si el video real da 1:24, poné 1:24.** No lo redondees a 90.

### Notas

- `autoplay muted loop playsinline` + poster. Sin sonido: se ve en el trabajo.
- El toggle cambia el `src` sin recargar. Precargar el segundo video.
- Cronómetro **quemado en el video**, no en HTML, para que sobreviva si alguien lo comparte.
- Mismo encuadre 3:4 en las dos tomas para que el toggle no salte.

---

## 04 · Qué cambia en tu lubricentro

**Trabajo:** llevarlo a la situación deseada. Cuatro filas, una por deseo.

**Desktop** — filas alternadas: foto/texto, texto/foto, foto/texto, texto/foto.
**Mobile** — la alternancia desaparece. **Siempre foto arriba, texto abajo.**

### Copy

> **H2:** De cinco planillas a una sola pantalla.
>
> **01 · Todo en un solo lugar**
> Tus clientes, sus autos y cada service que les hiciste. Buscás por patente y aparece todo:
> qué aceite lleva, qué filtros, cuándo fue la última vez.
>
> **02 · Cargalo como lo hacés a mano**
> Patente, kilómetros, aceite, filtros. Listo. El mismo gesto que hacías en el cartón,
> en el celular, en 90 segundos.
>
> **03 · Sabé a quién le toca, por kilómetros**
> El sistema calcula cuándo cada auto llega a los km del próximo service.
> No tenés que acordarte de nadie.
>
> **04 · El mensaje ya escrito**
> Abrís la lista de la semana, tocás un nombre y se abre WhatsApp con el mensaje armado. Un toque.

### Notas

- **Kilómetros, no fechas.** Es el idioma del rubro.
- Capturas del panel con datos reales, con permiso o con patentes cambiadas.
- Un solo nivel de título por fila. Sin íconos decorativos.

---

## 05 · Y encima, el QR

**Trabajo:** el "y encima esto". No resuelve un dolor que él ya sentía — es diferenciación
frente al de la vuelta, y es lo que hace que el precio parezca barato.

**Fondo grafito `#0A0A0A`.** Es el único quiebre visual de la página.

**Desktop** — dos columnas: texto a la izquierda, dos fotos a la derecha.
**Mobile** — texto y después las dos fotos apiladas.

### Copy

> **Eyebrow:** Y encima
> **H2:** Tu cliente ve todo lo que le hiciste al auto.
> **Lead:** Le pegás una calco en el parasol. Escanea, escribe la patente y ve su historial
> completo. Con tu marca arriba, no la nuestra.
> **Remate:** El de la vuelta no lo tiene.

### Notas

- Las dos fotos tienen que ser **reales**: la calco pegada en un parasol de verdad y la
  pantalla del cliente. Es lo más difícil de falsear y lo que más prueba.
- No expliques cómo funciona un QR. Nadie preguntó.

---

## 06 · Los tres pasos del cliente

**Trabajo:** responder "¿y si mis clientes no lo usan?" mostrando que no hay nada que aprender.
**Continúa el fondo grafito de la 05, sin corte entre secciones.**

**Desktop** — tres columnas iguales, y abajo el remate centrado sobre una línea divisoria.
**Mobile** — **nada de carrusel.** Tres pasos apilados con foto chica a la izquierda.
Un carrusel esconde los pasos 2 y 3, que son justamente los que prueban que es fácil.

### Copy

> **H2:** Todo lo que tiene que hacer tu cliente.
>
> **01 · Escanea el QR** — Con la cámara del celular. Nada que instalar.
> **02 · Escribe la patente** — Nada más. Ni mail, ni teléfono.
> **03 · Ve su historial** — Todo lo que le hiciste, con fecha y kilómetros.
>
> **Remate (escalón h2):** Sin apps. Sin cuenta. Sin contraseña.
> **Bajada:** Sus datos viajan cifrados y solo los ve él.

### ⚠ Sobre la frase de seguridad

**No poner "100%" de nada.** No es sostenible y en seguridad es riesgo legal real.
Y afirmar cifrado solo si efectivamente está cifrado en tránsito **y en reposo**.
Confirmar con Grego antes de publicar.

---

## 07 · Fidelliza

**Trabajo:** el toque de marca y el último empujón antes del precio.
Bruno lo llamó "un plus" con esas palabras: se presenta como plus, no como razón principal.

**Fondo `#FDECEC`** — el único lugar de la página donde el rojo se usa como superficie.

**Desktop** — texto a la izquierda, Wachín Fidelli en rojo + tarjeta de premio a la derecha.
**Mobile** — el personaje arriba. Es lo único de la página que se mira antes de leer.

### Copy

> **Eyebrow:** Y arriba de todo
> **H2:** Fidelliza: lo que ya hacés, sin llevar la cuenta a mano.
> **Lead:** Definí el premio y cada cuántos services se gana. El sistema lleva la cuenta solo
> y tu cliente ve cuánto le falta en su propio historial.
>
> - El premio lo definís vos: descuento, un service, lo que quieras
> - La cuenta se lleva sola, service por service
> - Tu cliente ve cuánto le falta cuando escanea

**Evitar "programa de fidelización":** suena corporativo y a algo que hay que aprender.
"Lo que ya hacés" lo pone del lado de lo conocido.
Usar el ejemplo real de Brothers Oil — cuatro services y el quinto con 40% off.

---

## 08 · El caso Brothers Oil

**Trabajo:** probar que funciona con alguien igual a él, **justo antes de hablar de plata**.
La prueba social rinde el doble inmediatamente antes del precio.

**Desktop** — foto a la izquierda, cita y tres números a la derecha.
**Mobile** — foto arriba, después la cita, después los tres números en fila.

### Copy

> **Eyebrow:** Brothers Oil · Córdoba
> **Cita:** "Tenía un montón de planillas de Excel y estaban todas desordenadas."
> **Bajada:** Bruno y su hermano llevaban los services en Excel, cuaderno y tarjetas de cartón.
> Hoy tienen todo en un solo lugar, saben quién vuelve, y sus clientes escanean el parasol.
>
> **150+** services cargados · **10 días** desde la instalación · **0** planillas sueltas

### Notas

- **Usar la cita textual, no una pulida.** Suena a un tipo hablando, y eso convierte.
- Foto real de los dos hermanos en el local. Nada de stock.
- **Verificar si los 150 services son nuevos o migrados del Excel** antes de publicar el número.
- Si se consigue el video de 20 segundos, reemplaza la foto y esta sección se vuelve la
  segunda más fuerte de la página.
- Con un solo caso, no llamarlo "casos de éxito" en plural.
- Requiere **autorización escrita de Bruno** para nombre, foto, cita y números.

---

## 09 · Precio, garantía y cupos

**Trabajo:** que el precio se lea después del valor y con la garantía al lado.

**Desktop** — título centrado, dos cards lado a lado, y abajo una barra con los cupos.
**Mobile** — cards apiladas, el plan mensual primero.

### Copy

> **H2:** Un precio. Sin permanencia.
> **Lead:** Instalamos nosotros, en tu local. Y si a los 30 días no te sirve,
> te devolvemos la plata.
>
> **Card 1 — Plan mensual** (destacada, borde rojo)
> **$46.750** por mes · sin permanencia · ajuste trimestral
> - Services y clientes ilimitados
> - Avisos por kilómetros y mensajes armados
> - Tu página pública con QR y tu marca
> - Fidelliza incluido
> - Soporte por WhatsApp
>
> *Plan anual: 3 meses gratis — pagás 9, usás 12.*
>
> **Card 2 — Instalación · pago único**
> ~~$93.500~~ **Sin cargo** para los primeros 5 lubricentros
> - 500 calcos con tu QR, impresas
> - Carga de tu catálogo de productos
> - Capacitación en tu local, presencial
> - Te dejamos andando el mismo día
>
> *A cambio te pedimos tu testimonio y que nos presentes a tres colegas.*
>
> **Barra de cupos:** Tomamos 10 lubricentros por mes. Vamos a tu local a instalarlo y
> capacitar a tu gente, así que no podemos tomar más sin atenderte mal.

### Notas

- **La instalación es sin cargo a cambio de algo, no regalada.** Va escrito en el acuerdo:
  testimonio + tres referidos. Sin eso se pierde el único filtro de compromiso.
- **Los cupos se comunican como promesa de servicio, no como exclusividad.** A este público
  "competí por entrar" le suena a que no lo querés atender.
- **La garantía de la landing tiene que decir exactamente lo mismo que la política de
  cancelación.** Si acá dice "te devolvemos la plata" y allá dice "menos el costo de las
  calcos", es un reclamo esperando.

---

## 10 · Preguntas

**Trabajo:** desarmar las dudas. Una objeción que no respondés se la contesta él solo,
y siempre se contesta que no.

**Las tres primeras van abiertas en cards.** El resto en acordeón cerrado.
En mobile las tres primeras **siguen abiertas** — no las escondas para ahorrar scroll.

### Abiertas

> **¿Me lleva más tiempo que el cartón?**
> No. 90 segundos, y el próximo service se calcula solo. Mirá el video de arriba.
>
> **¿Tengo que cargar mis clientes viejos?**
> No. Arrancás con el próximo service de cada uno. Si tenés Excel, lo migramos nosotros.
>
> **¿Y si mis clientes no escanean?**
> El orden y los avisos te sirven igual. El QR es el extra, no el motivo.

### En acordeón

- ¿Quién me lo instala?
- ¿Mi cliente tiene que bajar una app?
- ¿Qué pasa con mis datos si me doy de baja?
- ¿Y si se cae internet en el taller?
- ¿Sirve si también hago mecánica?
- ¿Esto es como los otros sistemas que ya vi?

### Respuestas por definir con producto

- **"¿Tengo que cargar mis clientes viejos?"** — Si la respuesta es "empezá de cero",
  se cae la venta ahí. **Migrar el Excel del cliente en la instalación es la función que más
  conversión desbloquea**, y es lo mismo que ya se hace al cargar el catálogo.
- **"¿Y si se cae internet?"** — Necesita una respuesta real de producto.
- **"¿Qué pasa con mis datos si me doy de baja?"** — Tiene que coincidir palabra por palabra
  con la política de cancelación. Respuesta prevista: el panel pasa a solo lectura, podés
  exportar todo, y **tu página pública sigue funcionando 12 meses** para que tus clientes
  no pierdan su historial.
- **"¿Esto es como los otros que ya vi?"** — Reconocer al competidor desarma más que ignorarlo:
  "Sí, ya hay otros. La diferencia es que este lo diseñamos con un lubricentro adentro y
  se carga en 90 segundos."

### Notas

- Acordeón nativo con `<details>` / `<summary>`: accesible, funciona sin JS, es buscable.
- Marcado `FAQPage` de schema.org.
- Respuestas de dos líneas como máximo. Una respuesta larga parece una excusa.

---

## 11 · Cierre y footer

**Trabajo:** una sola acción, sin fricción.

**Cierre sobre fondo grafito**, centrado. Footer sobre blanco.

### Copy

> **H2:** El cartón del parasol tiene los días contados.
> **Lead:** Escribinos por WhatsApp y en cinco minutos sabés si te sirve. Sin formularios,
> sin vueltas.
> **CTA:** Hablar por WhatsApp
> **Bajada:** Quedan 4 de 5 lugares con instalación sin cargo

**Sobre "sumate a la mejor red de lubricentreros":** con un cliente, hablar de una red que
no existe se nota y cuesta credibilidad justo en el último bloque. Guardar esa línea para
cuando haya veinte.

### Footer

Logo · Córdoba, Argentina
Columnas: Cómo funciona · Precio · Preguntas | WhatsApp · Instagram · Mail | Ingresar al panel · Términos · Privacidad

Sin newsletter. Este público no se suscribe a nada.

### Notas

- Botón flotante de WhatsApp en mobile durante **toda** la página, no solo al pie.
- Un WhatsApp sin respuesta en diez minutos mata más ventas que una landing fea.

---

# Roadmap de entregas

## Entrega 1 — hoy, mediodía · base en producción

- Las 11 secciones completas con el copy de este documento
- **Capturas reales del panel** — se toman hoy, gratis, nunca se reemplazan por IA
- **Screen recording** de una carga de service con cronómetro, en lugar del video filmado
- Imágenes IA solo de ambiente, con el nombre de archivo final que va a tener la real
- Caso Brothers Oil **sin retrato**: cita, números y logo
- WhatsApp andando · dominio · favicon · deploy

## Entrega 2 — viernes · material real

- Video de carga: celular y compu, con cronómetro, sin cortes
- Video de Bruno de 20 segundos, o su foto si no sale
- Foto de la calco pegada en un parasol real
- Las tres fotos del recorrido del cliente
- Retrato de Bruno y su hermano en el local
- **Se borra toda imagen IA.** Ninguna sobrevive a esta entrega
- **Los cuatro documentos legales publicados** y enlazados desde el pie

## Entrega 3 — semana que viene · medición y ajuste

- Analítica: profundidad de scroll y clics a WhatsApp **por sección**
- Metadatos y imagen para compartir por WhatsApp — es el canal de difusión real
- Ajuste del FAQ con las preguntas que lleguen de verdad
- Contador de cupos, solo si hay demanda que lo mueva
- **Modo solo lectura en la baja** — backlog de producto, pero la política escrita depende de que exista

---

# Material por sección

| Sección | Hoy | Viernes |
|---|---|---|
| 02 Hero | IA · ambiente de lubricentro argentino, plano general, sin caras | Panel en el celular, en el box |
| 03 Prueba | **Real** · screen recording con cronómetro | Los dos videos 3:4 |
| 04 Qué cambia | **Real** · capturas del panel con patentes cambiadas | Idem + foto de contexto por fila |
| 05 QR | IA · calco genérica + **real** captura de la página pública | Calco de Brothers Oil en un parasol real |
| 06 Tres pasos | IA · manos con celular + capturas reales de las pantallas 2 y 3 | Las tres fotos del recorrido |
| 07 Fidelliza | **Real** · Wachín en rojo Motors | Sin cambios |
| 08 Caso | **Sin foto** · cita, números y logo | Retrato o video de 20 segundos |
| 09 Precio | **Real** · solo tipografía | Sin cambios |

## Reglas de las imágenes IA

1. **Ninguna persona, ni una.** Un mecánico generado en una página que nombra un lubricentro
   real es exactamente el detalle que un prospecto huele.
2. **Ninguna captura de producto.** El panel está en producción y las capturas tardan diez minutos.
3. **Contexto argentino, no americano.** Pedir luz natural, desorden real, herramienta gastada,
   cartel pintado a mano. **Si la foto se ve demasiado linda, no sirve.**

---

# Documentos legales — entrega 2

Cuatro documentos. Esto es el brief para un abogado, no el texto final.

1. **Términos y condiciones** con el lubricentro — alcance, precio y ajuste por IPC, fee de
   implementación, suspensión por falta de pago, propiedad y exportación de datos, quién es
   responsable y quién encargado del tratamiento, cláusula de estadísticas agregadas y anónimas
   con piso de 25-30 cuentas por corte y opción de salirse, jurisdicción Córdoba.
2. **Política de privacidad** — distingue al lubricentro del dueño del auto. Con quién se
   comparte **de verdad**, con nombre: hosting, base de datos, envío de mensajes. Un
   "no compartimos con terceros" absoluto es falso el día uno. Derechos de la Ley 25.326.
3. **Aviso en la página pública** para el dueño del auto — corto, al pie. Quién guarda sus datos
   (su lubricentro), quién opera el sistema (Fidelli), qué se guarda, cómo pedir que se borre.
   Es el más urgente y el más corto.
4. **Cancelación y reembolsos** — la garantía de 30 días palabra por palabra, cancelación del
   mensual, meses no consumidos del anual, y qué pasa con el panel y la página pública.

## Qué pasa al darse de baja — decidido

- El panel pasa a **solo lectura**: puede ver y exportar, no puede cargar services nuevos.
- **La página pública sigue viva en solo lectura por 12 meses**, mostrando el historial existente.

Es casi gratis de hostear y compra cuatro cosas: los QRs de la calle siguen funcionando, el
dueño del auto no pierde su historial, el lubricentro que se fue sigue viendo a sus clientes
escanear — que es el mejor argumento para que vuelva —, y habilita decir en la landing
**"si te vas, tus clientes no pierden su historial"**.
