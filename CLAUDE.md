# Fidelli Motors

SaaS de retención para lubricentros. Digitaliza el cartón de service que hoy vive
en el parasol del auto: el lubricentro carga el service, el cliente escanea un QR
y ve su historial y cuándo le toca volver.

**Posicionamiento:** retención, no gestión. **El cliente ve, el mecánico ejecuta.**

Stack: Next.js 16 (App Router) · Supabase (PostgreSQL) · Tailwind v4 · Vercel
Dominio: fidellimotors.app

---

## Quién usa esto

**El mecánico** carga el service desde el celular, con las manos sucias y un auto
esperando. Tiene 90 segundos. Si la pantalla no le responde, vuelve al papel.

**El dueño del lubricentro** (Bruno) mira el panel una vez por día para saber a
quién llamar. No es usuario de software: si el abuelo no lo resuelve solo, está
mal diseñado.

**El cliente final** (Pedro) escanea el QR una vez cada tres meses, desde un
celular viejo, sin cuenta ni contraseña. Puede tener 60 años.

**Nosotros** (Fidelli) administramos los tenants desde `/fidelli`.

---

## Las tres superficies

| Ruta | Quién | Sesión |
|---|---|---|
| `/[slug]` | cliente final | ninguna — acceso anónimo |
| `/panel` | lubricentro (rol `owner`) | requerida |
| `/fidelli` | equipo Fidelli (rol `superadmin`) | requerida |

`panel` y `fidelli` son slugs reservados: ningún lubricentro puede quedárselos.

---

## Reglas de diseño — no negociables

**El rojo `#E01F26` es SOLO acción.** Botones primarios, foco, marca. **Nunca
comunica estado.** Un service vencido no es rojo: es ámbar (`overdue #B45309`).
Un error tampoco es rojo de marca. Esta es la regla de oro de la paleta.

**La landing pública es un shell neutro pintado con el color del lubricentro.**
En `/[slug]` el rojo Motors no aparece nunca — ni un píxel. El color viene de
`config_experiencia.color_primario`. También su tarjeta de WhatsApp:
`opengraph-image.tsx` por tenant, en el modo de su página y sin marca Fidelli.

**Dos tipografías con roles fijos.** Nunito para marca y para todo lo que lee el
cliente final. Public Sans para el dato operativo del panel. Nunca se mezclan
al azar.

**Números siempre tabulares** (`font-variant-numeric: tabular-nums`). Kilómetros,
patentes, fechas, precios. Sin excepción.

**Cero itálicas. Nada por debajo de 12px.** El cuerpo del cliente final es 16px
mínimo.

**El aire lo da la ausencia de ruido**, no el padding. Bordes de 1px, sombras
solo en elementos flotantes, radios 4/8/12.

**Áreas táctiles de 44px mínimo.** El mecánico tiene los dedos con aceite.

**La barra del celular mide 64 px y marca la pestaña abierta con una
píldora (30/10/2026).** Íconos de 24 px, la pestaña activa con una píldora
de 56 × 32 en `line` detrás del ícono y el nombre en negrita; «Nuevo
trabajo» es un círculo rojo de 52 px levantado sobre la barra con un anillo
del color de la barra; en oscuro la barra es `surface`, un escalón más clara
que la página y que las tarjetas, para que se lea como barra; en tablet las
cinco pestañas se agrupan en 448 px al centro. La hoja «Más» entra y sale
con una transición de 200 ms (el velo se funde, la hoja sube 16 px) y el
componente espera `animationend` antes de desmontarla. Antes medía 56 px
con íconos de 20 y sin indicador: un tenant la describió como «fina, no se
diferencia del fondo».

**El pie del sidebar es UNA fila, y la hoja «Más» del celular es una grilla
con íconos (30/10/2026).** El pie lleva «Cerrar sesión» como texto y, a su
derecha, los dos accesos que no pueden irse lejos como íconos de 40 px con
nombre accesible: la ayuda por WhatsApp y el modo oscuro. Antes eran cuatro
renglones (unos 150 px) que en una pantalla de 768 de alto tapaban «Ayuda»
y se veían apretados en varios tenants. Los enlaces legales viven al pie de
Mi cuenta. **Nada deja de estar a un clic: un acceso nuevo del pie entra
como ícono, no como renglón.** La hoja «Más» tiene las MISMAS secciones y
los MISMOS íconos que el sidebar (incluida Neumáticos, con el módulo), en
dos columnas de 48 px, la abierta marcada; abajo, el modo oscuro y las dos
salidas con ícono. Un ítem nuevo de navegación entra en los dos lugares
con su ícono de `components/iconos.tsx`. Lo vigila `scripts/regresion-tema.mjs`
(sección B: la altura del pie, el último ítem a la vista, los íconos de la
hoja).

**El modo oscuro del panel es una elección de la PERSONA, con interruptor;
los papeles no se apagan (30/10/2026).** Claro por defecto. La preferencia
vive en `usuarios.tema`, viaja con la sesión y se pinta como
`data-theme="oscuro"` en el wrapper de `/panel` y de `/fidelli`
(`data-tema-panel` es la marca que el interruptor busca para cambiarlo en
el acto); `globals.css` redefine ahí los tokens de color y las utilidades
se adaptan solas. **Nada de `prefers-color-scheme`**, por la misma razón
que la regla 7: el interruptor es una decisión, la media query no. La
escala es la de la superficie del cliente (`lib/cliente/tema.ts`): tinta
blanca al 100/72/55 %, línea al 14 %, base `#141414`, surface `#1D1D1D`,
página `#0A0A0A`; los estados suben un escalón de luz para pasar AA sobre
grafito; la marca no cambia. Lo que un color fijo no puede hacer lo hacen
cuatro tokens nuevos: `fondo` (la página; en oscuro es lo MÁS oscuro y las
tarjetas se despegan hacia arriba), `velo` (detrás de un dialog; `bg-ink/40`
sería un velo blanco), `brillo` (el reflejo del esqueleto) y `brand-texto`
(el rojo cuando es texto: `#E01F26` sobre grafito da 3,9:1). **Sobre
`bg-ink` y sobre un estado el texto va en `text-base`, nunca `text-white`**:
en oscuro la tinta es blanca y un chip blanco sobre blanco no se ve. La
variante `oscuro:` existe para lo poco que no sale de los tokens (el
logotipo gris, `<Logo tono="auto">`). **Los papeles llevan
`data-theme="claro"` en su raíz** —el cartón, los papeles de la mecánica y
de las ruedas, el presupuesto, la hoja de calcos, la burbuja de WhatsApp de
Mensajes— y el bloque claro de `globals.css` va DESPUÉS del oscuro, porque a
igual especificidad gana el último; impreso, todo es claro. Lo vigilan R50,
`scripts/regresion-tema.sh` y `scripts/regresion-tema.mjs`, que mide el
contraste de CADA texto visible contra su fondo efectivo en todas las
pantallas de las dos superficies.

**La pantalla de pago propone el mensual y vende el anual en pesos; con la
cuenta de cobro no hay botón (30/10/2026).** `/panel/suscripcion` (y la
cuarta pantalla del onboarding, que es la misma `PantallaPago`): dos
tarjetas de período —Mensual, elegido por defecto, «se renueva cada 30
días»; Anual con «Ahorrás $X» y «12 meses al precio de N», calculados
desde los montos de la BASE (`monto_de_renovacion_en`), nunca con un
porcentaje escrito a mano—, el desglose del período elegido y, para el
tenant con cuenta de cobro, la caja «Transferí exactamente $X» con su
alias y su CVU de siempre, sin «Quiero pagar»: elegir un período registra
la orden interna sin viajar a Cresium, y el éxito es el pago que acaba de
entrar (`pagoReciente`, media hora) o la orden PAID. El tenant sin cuenta
sigue con el pago único: «Quiero pagar» emite el CVU de una sola vez y el
selector se esconde con la orden abierta. El `concepto` (calcos) no cambia.
Seleccionado en INK, nunca en rojo. **Mi cuenta son cuatro solapas por
URL** (`components/cuenta/solapas.tsx`: Cuenta, Plan y pagos, Tu negocio,
Calcos —esta última es su ruta—): la persona, el contrato, el taller, el
calco; cada solapa pide a la base solo lo que muestra; el modo oscuro y
los legales siguen en la primera; la cuenta de cobro, en Plan y pagos. Lo
vigilan `scripts/regresion-pago-cuenta.mjs` y la sección B de
`scripts/regresion-cvu-dedicado.mjs`.

**El cartón digital va en versión papel** (la "versión B" del hi-fi): troquel,
grilla completa con bordes, etiquetas verticales de grupo en el color del tenant,
los renglones en el orden del cartón físico (los 11 de un auto; los de camión y
la batería se imprimen solo cuando el service los tiene), PROX. SERV. KMTS. al
pie. Es la única pieza del producto donde la grilla con bordes se justifica: *es*
el papel.

El hi-fi navegable está en `/docs`. **Ante una duda visual, abrilo — no lo
adivines.**

---

## Reglas de negocio — viven en la base, no en el front

Estas ya están implementadas en PostgreSQL. **El front las consume, no las
reimplementa.** Si una pantalla necesita una regla, primero fijate si la base ya
la resuelve.

- **El plazo de edición.** Un trabajo es editable solo dentro de su plazo —24
  horas para un service, un trabajo de gomería o un service de caja, **7 días
  para una mecánica** (desde `20260925110000`)— o si un superadmin abrió una
  ventana de desbloqueo
  (24 horas fijas, para cualquier tipo). El plazo lo dice `plazo_edicion(tipo)`
  y lo imponen las *policies de RLS* (`services_edicion`, `items_escritura`,
  `ruedas_escritura`) y el sello `fijado` de `get_carton`, no un `if` en React.
  En las policies de renglones y ruedas la ventana va en el `USING` **y en el
  `WITH CHECK`** (desde `20260925120000`): un INSERT no evalúa el `USING`, y
  con la ventana solo ahí un renglón entraba en un trabajo fijado por la API
  directa. El front lo repite en `lib/servicios.ts` (`PLAZO_EDICION_HORAS`)
  solo para pintar el estado; la base lo hace cumplir. Lo vigila R35.
- **Aislamiento multi-tenant.** RLS filtra por `lubricentro_id` automáticamente.
  **No agregues `where lubricentro_id = ...` en las consultas del panel:** ya está.
  **En `/fidelli` es al revés:** `soy_superadmin()` abre todos los tenants, el RLS
  deja de recortar y cada consulta tiene que filtrar por el lubricentro de la
  ficha. Las vistas tampoco ayudan —tienen `security_invoker`, así que a un
  superadmin le devuelven la plataforma entera. Un filtro olvidado no da error:
  mezcla dos lubricentros en la misma pantalla.
- **`premio_disponible(vehiculo_id)`** calcula el ciclo con reset: cuenta las
  **fechas distintas** con trabajo no anulado desde el último canje contra la
  meta vigente (desde `20260929100000`: una visita es un punto, y service +
  mecánica el mismo día —o dos services el mismo día— valen 1). Qué tipos
  cuentan lo dice `premios.alcance`. El corte del ciclo sigue siendo
  `created_at > canje`, no la fecha. `ciclos_fidelizacion()` es la misma
  cuenta para toda la flota y tiene que decir lo mismo. No hay contadores
  guardados. Lo vigila R38.
- **La mecánica adjunta.** Al final del cartón de un service —y, desde el
  29/10/2026 (`20261029200000`), también del de un service de CAJA—, con la
  feature `mecanica`, «¿Se le hizo algo de mecánica?» guarda una SEGUNDA
  fila (tipo mecánica, misma fecha, km y sucursal) dentro de la misma
  llamada a `guardar_service` (`p_mecanica`), en la misma transacción y con
  el mismo `now()`; queda atada a su anfitrión por `services.cargado_con_id`
  (el trigger del vínculo acepta un service o una caja como destino; una
  mecánica o un trabajo de gomería, no). Después son dos trabajos con su
  plazo cada uno y se anulan por separado (con aviso), pero la fecha, los km
  y la sucursal son de LA VISITA: corregirlos en el anfitrión los copia a la
  mecánica (`actualizar_service`, en la rama del service Y en la de la caja;
  un plan sin la feature no bloquea la edición). Qué tipos la ofrecen lo
  dice `ANFITRIONES_MECANICA` / `admiteMecanicaAdjunta()` en
  `lib/trabajos.ts`, y de ahí leen el cartón, la acción y las pantallas que
  buscan la pareja. Nunca como segunda llamada desde la acción: ver la
  regla 22. Lo vigilan R38 (desde un service) y R49 (desde una caja).
- **La orden de trabajo (01/10/2026).** Los 49 renglones de
  `lib/renglones-mecanica.ts` (42 al nacer; el 30/10/2026 la junta de tapa
  pasó a ser dos —de cilindros y de válvulas—, alineación y balanceo se
  separaron en dos, y entraron el tensor y los rodillos de la correa
  poli V, los retenes de levas y de cigüeñal y la cadena de distribución,
  a pedido de varios talleres) son un teclado: escriben líneas en
  `trabajo_descripcion` y nada más. No crean filas en `service_items` ni
  tocan `item_tipo`. Un renglón está prendido mientras su línea esté tal
  cual (`tieneFrase`, comparación con `normalizar()`). Los lectores que
  resumen en una línea usan `descripcionEnUnaLinea`; el papel y la
  previsualización respetan los saltos. Alineación y rotación solo sin
  gomería; batería, líquido de frenos, refrigerante y aceite de caja no se
  repiten en la mecánica adjunta a un service (`companeroDeService`), y en
  la adjunta a una caja solo se esconde el aceite de caja
  (`companeroDeCaja`): los otros tres no están en el cartón de la caja.
- **El service de caja automática (04/10/2026).** Es el CUARTO
  `tipo_trabajo` (`caja`), no un service con otros renglones: se parece en
  la forma —fecha, km, un aceite, renglones, un próximo— y todo lo suyo es
  propio. El aceite es un ATF (`aceite_tipo`, guardado como se escribió:
  «Dexron VI» no pasa por `normalizarViscosidad`). Los renglones son los
  cinco `caja_*` de `item_tipo` —filtro, aditivo, limpieza de cárter e
  imanes, lavado del circuito y, desde `20261026150000`, el **servicio por
  sistema de diálisis** (lo pidieron Risso y otro lubricentro; lleva una
  nota, como el lavado)—, **al final del enum y en el orden de SU
  papel**; **prendido = hecho** (`cambiado` se guarda `true` siempre: en una
  caja no existe el «revisado y OK»). El próximo vive en **su columna,
  `services.prox_caja_km`**, y `prox_service_km` queda en null: **el cambio
  de aceite de motor no se entera y `vista_proximos_service` no se toca** —ni
  por el último service, ni por el ritmo, ni por el contacto, que se registra
  con el motivo `'caja'` y no con uno de los tres estados—. Su retención es
  **`vista_proximos_caja`** (el contrato de columnas de la de services, más
  `prox_caja_km`), y tiene dos diferencias que no son de estilo: **el km/día
  y el último odómetro salen de TODOS los trabajos del auto con kilómetros**
  (un auto con una caja cada 80.000 km tiene un solo punto), y **el horizonte
  de 18 meses va sobre la fecha ESTIMADA, no sobre la fecha de la última
  caja** (a 40 km/día el ciclo dura cinco años y medio: con el corte de
  services la lista estaría siempre vacía). La feature `caja` está en el
  catálogo y **en el `features` de ningún plan**: se prende por tenant con el
  override de `/fidelli`, **sin costo** —no tiene fila en `modulos`, así que
  no entra en el monto, ni en el MRR, ni emite eventos de módulo—. Plazo de
  edición de 24 horas; el premio la cuenta con alcance `'todos'` y no con
  `'services'`; el aceite de caja baja del stock como el de motor y vive en
  su categoría (`transmision`). El salto del próximo (20.000 a 200.000 km)
  lo hace cumplir la base (`salto_caja_invalido`) y `lib/renglones.ts` lo
  repite para pintar. `get_carton` devuelve `prox_caja_km` en cada entrada, y
  el cliente ve una tarjeta por pregunta (`lib/cliente/proximos.ts`): las dos
  si el auto tiene service y caja, la de caja sola si solo tiene caja. El
  papel es **la misma hoja** que el cartón de aceite (`HojaCarton` en
  `carton-papel.tsx`), con otra bajada, otros renglones y otro pie. **Sin la
  feature la caja no existe en ninguna pantalla de trabajo** —ni el
  segmento del cartón, ni la fuente de «A quién llamar», ni la tarjeta del
  Inicio—, y en el Excel de trabajos la columna «Próx. caja» va solo si el
  tenant tiene la feature o el archivo trae alguna caja (al resto no se le
  suma una columna vacía). Lo vigilan R42 y `scripts/regresion-caja.mjs`.
  **Y desde el 29/10/2026 la caja lleva la mecánica adjunta**
  (`20261029200000`): la misma pregunta del final del cartón de aceite, la
  misma rama de `guardar_service` y el mismo vínculo; lo único propio es que
  el teclado de esa adjunta no esconde batería, frenos ni refrigerante
  (solo el aceite de caja). Lo vigilan R49, `scripts/regresion-caja-mecanica.sh`
  y `scripts/regresion-caja-mecanica.mjs`.
- **Adjuntos en cualquier trabajo (04/10/2026).** Un PDF o una foto del
  diagnóstico, colgados de un trabajo de cualquier tipo, en todos los planes:
  `adjuntos_trabajo` y el bucket **privado** `adjuntos` (carpeta = tenant,
  adentro el trabajo: `<lubricentro>/<service>/<uuid>.<ext>`, y un CHECK lo
  exige). **Hasta 3 por trabajo** —un trigger con candado por trabajo
  (`tope_adjuntos`): un CHECK no cuenta filas— y **2 MB por archivo**, PDF /
  JPEG / PNG, en el bucket y en la tabla. **Adjuntar no edita el cartón:**
  ninguna policy de esta tabla mira `plazo_edicion()`; se adjunta, se prende,
  se apaga y se quita en cualquier momento, también en un trabajo fijado.
  **«Mostrar al cliente» (`visible_cliente`) nace apagado y lo garantizan
  los privilegios, no una policy:** el grant de INSERT no incluye esa columna
  (ni `subido_por`, ni `created_at`) y el de UPDATE es de esa sola columna.
  El tenant lo pisa el trigger con el del trabajo, venga lo que venga. **El
  cliente llega al archivo por UNA puerta:** `get_carton` le lista, por
  trabajo, los visibles —`id`, `nombre`, `mime`, `creado`; nunca la ruta— y
  el enlace es `GET /[slug]/[patente]/adjunto/[id]`, que le pregunta a
  `adjunto_publico()` si el adjunto existe, está visible, su trabajo no está
  anulado y es de ESE vehículo de ESE tenant, y recién entonces firma una URL
  de **60 segundos** y redirige; si no, 404. **`anon` no lee ni la tabla ni
  el bucket**, y `adjunto_publico()` es solo de `service_role` (la ruta ya
  usa esa clave para firmar): la ruta de un archivo no sale del servidor y en
  el HTML del cliente no hay nunca una URL firmada. **La subida no pasa por
  una Server Action**, igual que el diseño del calco: el servidor entrega una
  URL firmada de subida, el navegador manda el archivo directo al bucket y
  el servidor valida los BYTES de lo que llegó (cabecera y peso) antes de
  crear la fila; si no pasa, borra el archivo. **Las fotos se achican en el
  navegador** antes de pedir la URL (1.600 px de lado mayor, JPEG al 80 %;
  `lib/adjuntos-navegador.ts`): una foto de 4 MB no se rechaza, sale en unos
  cien KB. **Quitar un adjunto borra la fila y después el archivo**; el
  archivo que queda sin fila —esa subida que no validó, un borrado que
  falló, la purga de un tenant— lo barre el cierre diario
  (`adjuntos_huerfanos()`, que no lista lo subido en el último día: la subida
  en vuelo). Las reglas que el front repite para avisar viven en
  `lib/adjuntos.ts`. Lo vigilan R43 y `scripts/regresion-adjuntos.mjs`.
- **El slug entra en el QR del calco (04/10/2026).** Lo impreso en el QR es
  el dominio más el slug. Tope de **32 caracteres** (CHECK `slug_largo_qr`;
  `slug_estado()` contesta `invalido` antes de escribir) y aviso desde los 19
  en el alta y en Editar de `/fidelli` (`avisoSlugQr` en `lib/texto.ts`; el
  slug que el alta propone ya viene recortado, `slugSugerido`). Un tenant
  entró con 34 y el QR no se pudo hacer. Lo vigila R44. **Un slug con
  calcos entregados no se cambia** (`slug_bloqueado`), y la única excepción
  es el que quedó por encima del tope: se acorta por SQL y **su dirección
  vieja redirige a la nueva para siempre** —301, con la patente y lo que
  venga atrás—. La lista es `SLUGS_ANTERIORES` en `lib/slugs-anteriores.ts`
  y la lee `next.config.ts`. **Una entrada no se borra nunca**: es apagar,
  sin ningún error, los calcos que ese taller ya pegó. En producción va
  primero el UPDATE del slug y después el deploy (al revés, el viejo
  redirige a una página que todavía no existe); y un slug viejo de 32 o
  menos tendría que quedar además en `slug_reservado()`, porque el redirect
  se resuelve antes que cualquier página y taparía a quien lo tomara. Lo
  vigila la sección L de `scripts/regresion-adjuntos.mjs`.
- **Los datos de la empresa (04/10/2026).** `datos_empresa` es la
  identificación del emisor del presupuesto —razón social, CUIT, condición
  frente al IVA, domicilio, teléfono, email—: **opcional, y nunca un
  comprobante** (ni «Factura», ni CAE, ni punto de venta, ni ingresos brutos:
  la regla 6 sigue en pie). Una fila por tenant, sin snapshot, y sale SOLO
  en el encabezado del presupuesto —el documento y su PDF—, debajo del
  nombre: una línea por dato cargado (`lineasDeEmpresa` en
  `lib/datos-empresa.ts`); **sin ningún dato el encabezado es, byte a byte,
  el de siempre**. El CUIT sigue el criterio de `clientes.cuit`: once
  números pelados, y el dígito verificador avisa pero no bloquea. Se escribe
  por `guardar_datos_empresa()` —invoker, upsert de los seis campos: lo que
  no viene se vacía, y una clave mal escrita revienta— desde Mi cuenta y
  desde la ficha de `/fidelli` (Datos → Empresa), con el mismo formulario.
  No se borra, se vacía; la purga de un tenant se la lleva. Lo vigilan R45,
  `scripts/regresion-datos-empresa.sh` y `scripts/regresion-datos-empresa.mjs`.
- **`vista_proximos_service`** devuelve el estado (`vencido` / `urgente` /
  `proximo`), el km/día real del vehículo, la fecha estimada y si ya se contactó
  en ese estado. Toda la pantalla de retención sale de ahí.
- **Lo importado lleva `importado_de`** (desde `20261002120000`; null =
  cargado en el panel) en `services`, `clientes`, `vehiculos` y `productos`.
  **Las métricas de plataforma y el premio lo excluyen** —todo lo que se lee
  desde `/fidelli` o escribe el cierre diario, y `premio_disponible` /
  `ciclos_fidelizacion`—; lo que el tenant ve de sí mismo (`resumen_inicio`,
  la ficha, `get_carton`) lo incluye: es su historia. **El horizonte de
  retención es 18 meses**: un auto cuyo último service es más viejo no entra
  en `vista_proximos_service`, para ningún tenant. Una función nueva que
  lea `services` para medir a la plataforma lleva `and importado_de is
  null`. La planilla entra por `scripts/importar-planilla.mjs`, que genera
  SQL y no se conecta a nada; `/importaciones` está en `.gitignore` (datos
  personales). El cliente sin datos es `'Sin nombre'` / `'-'`
  (`CLIENTE_SIN_DATOS` en `lib/clientes.ts`), distinto del suprimido. Lo
  vigila `scripts/regresion-importacion.sh`, que necesita la planilla.
- **`get_carton(slug, patente)`** es la única puerta pública. Devuelve el cartón
  completo en un JSON, respeta `campos_visibles` del tenant y registra la búsqueda.
  `anon` no tiene permiso sobre ninguna tabla: solo puede ejecutar esa función.
- **`recuperados_del_mes(lubricentro_id)`** cuenta los contactados que volvieron
  dentro de los 30 días.
- **Las patentes se normalizan solas** por trigger. El front manda lo que escribió
  el mecánico; la base guarda `AB123CD` para buscar. Se aceptan los cuatro formatos
  argentinos —auto `ABC123` / `AB123CD` y moto `123ABC` / `A123BCD`— y, **desde
  `20261026120000`, los de los países vecinos** (lo pidió Lubricheck Sassi): Brasil
  `ABC1D23` y `ABC1234`, Uruguay `ABC1234`, Paraguay `ABCD123` y `123ABCD`, Bolivia
  `1234ABC` y `AB12345`, Chile `ABCD12`, `AB1234` y `ABC12`. La fuente única es
  `patente_formato_valido()`; el front la repite en `lib/texto.ts` —una lista de
  formas escritas como la chapa (`"LL NNN LL"`), de la que salen validar, mostrar
  con espacios y detectar la patente a medio tipear— solo para avisar, y
  `scripts/regresion-patentes.mjs` compara las dos listas forma por forma. **No se
  guarda el país**: la forma clasifica, como auto y moto, y `ABC1234` es Brasil o
  Uruguay sin manera de distinguirlo. Quedan afuera a propósito las motos chilenas
  anteriores a 2014 (`AB123`: el principio de toda Mercosur argentina) y los
  formatos chilenos del decreto de 2026, que no se emiten hasta 2027 y 2029. Lo
  vigilan R13 y R48.
- **El buscador de clientes: la forma del término dice qué es (21/10/2026).**
  `filtroClientes` (`lib/clientes.ts`) es el ÚNICO filtro de clientes y lo
  usan los cuatro lugares que buscan clientes: el listado, su export a
  Excel, la ficha del tenant en `/fidelli` y el «¿De quién es?» del alta.
  Letras y números juntos (hasta 7) son una patente, entera o a medio
  tipear, y se busca **solo** en `patentes`; solo números, un teléfono —por
  sus **dígitos**: `telefono_digitos` en `vista_clientes` (desde
  `20261021120000`), así «351 317-2545» se encuentra escribiendo
  3513172545— o una patente que arranca con números; solo letras, un nombre
  o las letras de una patente; lo que no entra en una patente («lopez
  3515591616»), los tres. Antes los dígitos de la patente se buscaban
  también adentro de todos los teléfonos y «KXM616» devolvía cuatro
  clientes en Brothers Oil: el dueño y tres con «616» en el celular. Lo
  vigilan R46 y `scripts/regresion-busquedas.mjs`.

- **`landing_busquedas` no guarda la patente de una consulta sin resultado**
  (desde `20260922120000`): `patente` es anulable, un trigger la deja en null
  cuando `encontrada = false` y un CHECK lo hace cumplir. La patente que el
  visitante escribió viaja en el request (`?nohay=`) y el mensaje de WhatsApp
  de "no la encontramos" se arma con esa, nunca con la tabla. La métrica de
  escaneo (cuántas consultas, cuántas sin resultado) no cambió. Lo vigila R28.
- **`anonimizar_cliente(cliente_id, motivo)`** es la supresión de un cliente
  final a su pedido: pisa nombre, teléfono, email y CUIT con sentinelas
  (`'Cliente eliminado'`, `'-'`, null, null; `lib/clientes.ts` los repite para
  la pantalla) y deja intactos los vehículos y los trabajos. La pueden llamar
  el superadmin y el owner del tenant del cliente; exige motivo y lo registra
  en `supresiones_cliente` antes de tocar el dato. Lo vigila R30.
- **`purgar_tenants_vencidos(p_simular, p_lubricentro_id, p_motivo)`** es el
  borrado definitivo a los 12 meses de cancelar: `suscripciones.cancelada_at`
  se escribe por trigger al pasar a `cancelada` (y se limpia al volver), y la
  purga borra lo operativo del tenant —clientes, vehículos, trabajos, contactos,
  productos, premios, config, plantillas, búsquedas, los datos de la empresa y
  lo que cuelga por FK—,
  nunca `pagos`, `suscripciones`, `cresium_*`, `contactos_fidelli`,
  `aceptaciones_terminos`, `sucursales` ni `usuarios`, y deja `lubricentros`
  con `activo = false` y `purgado_at`. **Simula por defecto** (`p_simular =
  true` solo cuenta y escribe en `purgas`); borra solo con `false`. pg_cron la
  corre el 1 de cada mes **en simulación** (`cron.job` →
  `purgar-tenants-vencidos`): se pasa a real a mano, con `cron.schedule` y el
  mismo nombre, después de revisar una simulación. A pedido del tenant va con
  `p_lubricentro_id` y motivo, auditado; exige la suscripción cancelada; el
  demo nunca. Lo vigila R29.

- **Pedidos de calcos (03/10/2026).** Hay DOS entidades y no se
  mezclan. `pedidos_calcos` es **el libro de entregas**: append-only, con sus
  tres candados, y `calcos_entregadas` es su suma (R33, R34j); no se tocó.
  `encargos_calcos` es **el pedido**, con ciclo de vida: `pendiente_pago ·
  pagado · en_produccion · enviado / listo_retiro · entregado · vencido ·
  cancelado`. **«Entregado» es el único estado que escribe en el libro**, una
  vez, por `registrar_pedido_calcos()`, y guarda el id de esa fila. Quién
  mueve qué: el pedido lo crea el owner por `crear_encargo_calcos()` (toma el
  tenant de la sesión, nunca de un argumento; un pedido sin pagar por tenant,
  índice único parcial) o Fidelli por `crear_encargo_calcos_incluido()` (los
  200/400 del alta: sin pago, nacen `pagado`); todos los cambios de estado son
  del superadmin por `avanzar_encargo_calcos()`, que valida contra **una tabla
  de transiciones escrita adentro de la función** —lo que no está en la lista
  no pasa; `vencido` no tiene entrada ni salida desde ahí: lo vence el cierre
  diario y lo revive el webhook, nunca una persona—. **Las cuatro tablas no se escriben por
  API**: `authenticated` no tiene INSERT/UPDATE/DELETE ni policy que lo
  permita, y las puertas son `security definer` con guarda. **El costo no
  sale de `/fidelli`**: `catalogo_calcos.costo_ars` y `costo_estimado` /
  `comision_estimada` del encargo quedan fuera del GRANT de columnas (sobre
  esas tablas `select *` da 42501; columnas explícitas), y `/fidelli` los lee
  por `encargos_calcos_admin()`. Por lo mismo, **«m²» y la ganancia aparecen
  solo en `/fidelli`**: nunca en una pantalla, mail o papel del tenant (es el
  dato con el que iría a cotizar a una gráfica). **La plata se congela al
  crear** (pack, rediseño, envío, costo y comisión del catálogo de ese
  momento) **y no es MRR**: nunca entra en `pagos` ni en los snapshots. El
  precio y el costo del catálogo se mueven solo por `fijar_precio_calcos()`,
  con motivo y auditoría en `cambios_precio_calcos` (regla 16); la comisión
  de Cresium (0,968 %) es `comision_cresium()` en la base y
  `COMISION_CRESIUM` en `lib/calcos.ts`: cambian en el mismo commit. El
  diseño vive en `disenos_calco` (versiones 1, 2, …; una sola `actual`) y en
  el bucket **privado** `calcos`, carpeta = tenant: se ve por URL firmada de
  una hora. **El archivo no sube por Server Action** (hasta 10 MB no entra en
  un request a Vercel, que corta en 4,5 MB): el servidor entrega una URL
  firmada de subida, el navegador manda el archivo directo al bucket y el
  servidor valida los bytes de lo que llegó antes de registrar la versión
  (`app/fidelli/calcos/actions.ts`). Las pantallas de `/fidelli`: la solapa
  Calcos de la ficha, la cola `/fidelli/calcos`, la primera alerta del hub
  (`resumen_admin().calcos`) y el bloque Calcos de «Plan y precios», que es
  donde se edita el catálogo. Lo vigila R39.
- **El pago de un pedido de calcos (03/10/2026).** El tenant pide desde **Mi
  cuenta → Calcos** (`/panel/cuenta/calcos`): elige un pack, el rediseño y la
  entrega, y «Confirmar y pagar» hace DOS cosas en orden —el pedido
  (`crear_encargo_calcos()`, una transacción) y después la orden de Cresium
  (`lib/pedidos-calcos/orden.ts`, una llamada HTTP)—; si la segunda falla, el
  pedido queda sin pagar y sin cuenta y la pantalla ofrece **Reintentar**. La
  orden vive en `cresium_ordenes` con **`encargo_calcos_id`** (un CHECK exige
  exactamente uno de los dos lados: renovación o pedido) y su **`external_id`
  es `calcos:<uuid del encargo>`**, con `:2`, `:3`… en los reintentos (regla
  20); el alias es siempre el derivado (`aliasDeOrden`), nunca el fijo del
  tenant. La acredita la misma puerta que las renovaciones,
  `acreditar_deposito_cresium()`, con **una rama que va ANTES del cast a uuid
  de la suscripción** (regla 23): `PAID` deja el pedido `pagado` desde
  `pendiente_pago` o `vencido`, idempotente por
  `encargos_calcos.cresium_transaccion_id`; `PARTIAL` no paga; **ni una fila
  en `pagos`**. El pedido sin pagar **vence a los 7 días**
  (`vencer_encargos_calcos()`, desde el cierre diario; la pantalla ya lo
  trata como vencido desde el día 7 con `estadoDelPedido()`), y `vencido →
  pagado` existe SOLO por el webhook. Dos mails con el marco de siempre
  (`lib/email/calcos.ts`): «recibimos tu pago», que sale de la ruta del
  webhook con `after()` —después de contestar 200—, y «salió / está listo»,
  desde la acción de `/fidelli`; cada uno una vez por pedido
  (`reclamar_mail_encargo_calcos()`: el que se lleva el `true` manda, y si el
  envío falla lo suelta). **La pantalla de pago es `PantallaPago` con el prop
  `concepto`**, no una copia: el polling de 8 segundos, el alias y el CVU
  copiables, el aviso del pago parcial y el tick son los mismos; sin
  `concepto` es la de la suscripción, byte a byte la de antes. **`lib/calcos.ts`
  es lo que comparten las dos superficies y no tiene nada de costo;
  `lib/fidelli/calcos.ts` tiene el m², el costo y la ganancia, y ninguna
  pantalla del tenant lo importa** (lo vigila `scripts/regresion-calcos-tenant.mjs`,
  recorriendo los imports). Lo vigila R40.
- **La cuenta de cobro del tenant: un CVU dedicado, y el depósito se
  acredita por MONTO EXACTO (31/10/2026).** Cresium recicla los CVUs del
  pago único (un pool de cuatro cuentas cuyo alias cambia con cada orden):
  el 28/10/2026 varios tenants vieron «alias inválido» y al menos uno pagó a
  la cuenta de otro. Desde `20261031100000` cada tenant tiene SU cuenta
  fija: `lubricentros.cresium_alias` + `cresium_cvu` +
  `cresium_deposit_address_id`, **los tres juntos o ninguno** (CHECK
  `alias_con_cvu`), escritos por `fijar_cvu_de_tenant()` DESPUÉS de que
  Cresium emitió la cuenta (`POST /v3/deposit-address/cvu`;
  `lib/cresium/emision.ts` hace las dos fases, desde la ficha de `/fidelli`
  → Suscripción → Cuenta de cobro, y como tercera fase del alta). El alias
  lo propone `aliasSugerido()` (el slug sin las palabras genéricas:
  `fm.elgarage`, nunca `fm.lubricentroelgar`) y se elige una vez; los tres
  datos son inmutables. **La renovación ya no viaja a Cresium**: «Quiero
  pagar» deja una orden INTERNA (`cresium_ordenes.deposit_address_id`,
  referencia `cvu:<sub>:<hasta>`) con el período y el monto que el dueño
  vio, y la pantalla le muestra su CVU de siempre con «transferí
  exactamente $X». **El webhook de un depósito a esa cuenta no trae
  `paymentOrder`: trae el CVU** (`to` / `depositAddress`), y la rama nueva
  de `acreditar_deposito_cresium()` acredita SOLO si el monto es el de
  exactamente UN período que el tenant puede elegir hoy
  (`montos_ofrecidos()`: mensual, anual, y semestral solo si el plan lo
  ofrece). Cualquier otro monto —o uno que coincide con dos— queda en
  **`depositos_cresium`** como «a confirmar», con el motivo y los montos de
  hoy escritos, y lo decide una persona desde `/fidelli/cobranzas`
  (`resolver_deposito_cresium()`: acreditar a un período, con la
  transacción Y quién decidió en la fila de `pagos`, o descartar con nota).
  **Nada se infiere.** Dos transferencias del mensual son dos meses. El
  libro no se borra ni se edita (candados en ALWAYS) y el owner lee solo el
  suyo (la pantalla le dice «recibimos $X, lo estamos revisando»). Una
  orden interna no vence a los 7 días: vence cuando el precio de su período
  cambió (`estadoEfectivoDedicado`). **Los pedidos de calcos siguen por
  pago único** (una orden por pedido, alias derivado), y el tenant que
  todavía no tiene cuenta también. El interruptor
  `alias_confirmado_por_cresium()` está prendido desde esta migración.
  Lo vigilan R25 (reescrito) y R51, con `scripts/regresion-cobranza-alias.sh`,
  `scripts/regresion-cvu-dedicado.sh` y la sección 7 de
  `scripts/regresion-cresium-webhook.mjs`.
- **El stock de calcos y el aviso (03/10/2026).** Cuántas calcos le quedan a
  un lubricentro **no se guarda: se calcula** (`stock_calcos(lubricentro)`,
  mismo criterio que `estado_cobranza`). **El calco se gasta por auto nuevo,
  no por trabajo**: consumo = vehículos cuyo **primer trabajo no importado y
  no anulado** (por `created_at`) es posterior a la primera entrega del
  libro. Con un recuento del dueño (`recuentos_calcos`, append-only, por
  `declarar_recuento_calcos()` desde «Contá y corregí»), la cuenta parte de
  ahí: lo declarado, más lo entregado después, menos los autos nuevos de
  después. El ritmo son autos nuevos por semana sobre las últimas 8 semanas
  (o sobre la historia que haya; con menos de 2 semanas es null y la
  pantalla muestra solo el stock). Null en todo sin entregas o con
  `calcos_propias`. **Una entrega tiene dos fechas y manda `fecha`** (el día
  de la entrega), no `created_at` (cuándo se cargó la fila): el backfill y
  una corrección del libro se cargan hoy con fecha vieja; solo cuando la
  fila se cargó el mismo día se usa la hora exacta
  (`momento_de_entrega_calcos`). De esa cuenta cuelgan cuatro cosas: el
  bloque «Cuántas te quedan» de Mi cuenta → Calcos; **el aviso del Inicio**
  (`aviso_calcos()`: menos de 4 semanas —o 20 calcos o menos— y sin un
  pedido abierto; se cierra con la X y vuelve a los 7 días, por
  `localStorage`), que **nunca se apila con uno de cobranza**
  (`puedeAvisarDeCalcos()` en `lib/stock-calcos.ts`: con la barra de por
  vencer, la de gracia o el tenant suspendido, ni se consulta); **dos
  mails** por el mismo cron de las 9:00 que los avisos de cobranza
  (`avisos_calcos_pendientes()`, solo `service_role`; `emails_calcos` con
  unique `(lubricentro_id, tipo, entrega_ref)` y tres candados: uno por
  escalón por ciclo de entrega, el más avanzado, sin caer al anterior); y
  **la lista de arriba de `/fidelli/calcos`** (`calcos_por_agotarse()`:
  menos de 3 semanas y sin pedido abierto) con su alerta en el hub
  (`resumen_admin().calcos.sin_stock`). Los umbrales del aviso viven en UNA
  función (`nivel_de_aviso_calcos`) y la frase en otra (`fraseDelAviso`):
  el mail dice lo que el Inicio dice ese día. No reciben nada el que tiene
  un pedido abierto (`tiene_encargo_calcos_abierto`), y —en los mails y la
  lista— tampoco el suspendido ni el demo. **`lubricentros.calcos_propias`**
  (el que imprime por su cuenta) lo mueve solo el superadmin, por
  `marcar_calcos_propias()`, con nota y un evento `edicion`; un UPDATE
  suelto lo rechaza el candado. Con el switch prendido no hay estimación,
  ni aviso, ni mail, ni lista, y Mi cuenta → Calcos gana «Descargar el
  archivo de impresión». La miniatura del diseño sale por la transformación
  de Storage (ancho 400), con respaldo al archivo si no contesta
  (`[storage.image_transformation]` está prendida en `config.toml`). **La
  transformación va con `resize: "contain"`, y no es opcional:** con el modo
  por defecto (`cover`) y solo el ancho, Storage no achica la imagen, la
  RECORTA —devuelve una franja de 400 px del centro con el alto original—.
  Estuvo así un día en producción (04/10/2026): todos los calcos se veían
  con zoom y cortados, y la prueba no lo vio porque miraba solo el ancho de
  una imagen lisa. Y el diseño se dibuja ENTERO adentro de la caja de
  5 × 8 cm (`object-contain`, en Mi cuenta → Calcos y en la ficha): el
  archivo de un lubricentro no siempre viene en 5:8. Lo vigila R41.

**Los datos históricos no se borran.** Todo es `on delete restrict`. Para dar de
baja se usa `activo` o `anulado`, nunca `DELETE`. Las dos excepciones escritas
son la purga a los 12 meses de cancelar y la anonimización a pedido del titular
(ver arriba): las dos dejan evidencia antes de tocar nada. Y una tercera, de
otra clase: **un adjunto se quita** (`delete` en `adjuntos_trabajo`, y su
archivo del bucket). Lo que se borra es un archivo que el taller sumó, no el
registro del trabajo: el cartón no cambia.

**Un renglón marcado es la existencia de la fila** en `service_items`. No hay
booleano `realizado`.

---

## Copy — cómo se escribe

**Qué pasó y qué hacer, en ese orden.** Sin códigos de error, sin "ha ocurrido un
problema inesperado", sin disculpas.

**Los errores no culpan al usuario.** Ni "lo sentimos" ni "ingresaste mal el dato":
se nombra el hecho y se da el ejemplo correcto.

> "Son menos que el último service (88.200 km). Verificá el odómetro — si está
> bien, seguí igual."

**El error de guardado avisa que no cierre la pantalla.** No hay borradores
locales (decisión de alcance): si se pierde la conexión, lo único que salva los
90 segundos del mecánico es que el formulario siga abierto.

> "Se cortó la conexión a internet. No cierres ni recargues esta pantalla: los
> datos que cargaste siguen acá. Cuando vuelva la señal, tocá Reintentar."

**Los vacíos no son todos iguales.** Sin datos todavía → explicar qué va a
aparecer + acción. Filtro sin resultados → limpiar filtros. **Sin trabajo
pendiente → se celebra**: "Estás al día", en verde.

**Español rioplatense con voseo.** "Cargá", "escribinos", "mirá". Nunca "carga",
"escríbanos", "mira".

---

## Estados de carga

- Menos de 300ms: **no mostrar nada.** El parpadeo molesta más que la espera.
- 300ms a 2s: esqueleto (respetando la estructura real) o spinner inline.
- Más de 2s: mensaje con contexto.
- **El botón de guardar se deshabilita apenas se toca**, con ancho fijo para que
  no salte el layout. Es lo que evita el service duplicado por doble toque.
- **Cada ruta del panel tiene su `loading.tsx` con la estructura real; una ruta
  nueva sin él no pasa la prueba** (`scripts/regresion-esqueletos.mjs`, que
  recorre `app/panel` y `app/fidelli`). Se arma con las piezas de
  `components/ui/esqueleto.tsx`: la cabecera es la real, con su título; los
  filtros, las tarjetas y las filas van en gris, con su alto real y las mismas
  clases de grilla que la pantalla. Sin retrasos ni transiciones propias: el
  «menos de 300 ms, nada» lo cumple React, que no reemplaza un fallback de
  Suspense antes de 300 ms desde que lo mostró —un retraso en CSS hacía
  asomar el gris justo cuando llegaba el contenido—. Una pantalla que no
  espera a la base (Ayuda) lleva solo la cabecera: con gris, al entrar con
  la URL escrita, el gris asomaba 30 ms. **El layout del panel no espera más
  que la sesión**: el número de «A quién llamar» llega por su `<Suspense>`
  (`components/panel/por-llamar.tsx`), y una consulta nueva en el layout va
  igual, o frena todas las pantallas.

---

## Decisiones técnicas

**Server Components por defecto.** Las consultas van en el servidor; las
mutaciones en Server Actions. Cliente solo donde hay interactividad real. Menos
JavaScript en el celular del mecánico.

**La excepción: las dos búsquedas del alta van del navegador a PostgREST**
(`lib/busqueda-alta.ts`, desde el 21/10/2026): la patente de «Nuevo trabajo»
y el «¿De quién es?». La razón es el mecánico con el auto en el pozo: como
Server Actions, cada búsqueda pagaba en serie el POST a Vercel, el
`getClaims()` del proxy, la sesión otra vez (otro `getClaims()` más
`usuarios` con sus campos calculados) y recién después una consulta que en
la base tarda menos de 10 ms; «unos segundos» en el taller. Desde el
navegador es UN viaje, con el mismo JWT y el mismo RLS
(`buscar_vehiculo_por_patente` es invoker y `vista_clientes` es
`security_invoker`): la base recorta igual, y la sesión solo servía para
redirigir a `/login`. Una lectura nueva que quiera seguir este camino tiene
que poder decir lo mismo: que no hay nada que el servidor sepa y el
navegador no. Las escrituras siguen siendo Server Actions. Además, la
patente **argentina** válida sale sin esperar los 300 ms del debounce
—ninguna patente argentina es el principio de otra argentina
(`esPatenteArgentina`)—, la de un país vecino espera los 300 ms como
cualquier cosa que no cierra en un formato argentino (`ABC12`, la moto
chilena, es el principio de `ABC123`: si una vecina saliera al toque, toda
patente argentina vieja se buscaría dos veces, con «¿De quién es?» asomando
en la quinta letra), y `AB123C` o `ABC1D2` no buscan
nada hasta la última letra (`patenteIncompleta`, `lib/texto.ts`): buscarlas
sería buscar otra patente y abrir «¿De quién es?» a mitad de tipeo. Lo mide
`scripts/medir-alta.mjs`, local o contra un preview.

**Una consulta por pantalla.** Columnas explícitas, nunca `select *`. Sin N+1.
El costo de Supabase se controla acá.

**Sin Realtime.** Un cartón de service no cambia mientras lo mirás. Revalidación
de Next alcanza.

**Componentes propios**, construidos sobre los tokens de `globals.css`. Radix
suelto solo donde el comportamiento accesible es difícil (dialog, combobox).
No usamos librerías de componentes con su propio design system.

**Íconos: Phosphor** (`@phosphor-icons/react`), peso `thin` o `light` — stroke
de 0.5 a 1px, nunca más grueso. **En el panel y en la superficie del cliente,
Phosphor y nada más.**

**La excepción de Lucide, acotada y con su razón.** La landing comercial usa
doce íconos de `lucide-react` (menú, los pasos del simulador, la sección de
precio, el acordeón y los pasos del calco). La razón es de escala: son
señalización a tamaño grande y necesitan stroke 2, que Phosphor light no da.
Los límites, que sí son la regla:

- **Viven todos en `components/iconos.tsx`**, en un bloque marcado, y en
  ningún otro lado. Volver a Phosphor es cambiar ese bloque y nada más.
- **No se propagan al panel ni a la superficie del cliente.** Ahí el
  instrumento es Phosphor light, y mezclar dos familias en la misma pantalla
  se nota aunque nadie sepa nombrar por qué.
- Un ícono nuevo se busca **primero** en Phosphor. Lucide solo si el
  equivalente no existe y es para la landing.

El reflejo original ("lo usa todo sitio hecho con IA") sigue siendo válido y
es exactamente lo que estos límites protegen.

**Todo lo clickeable lleva `cursor: pointer`.** Resuelto una vez en globals.css
para botones, roles de botón, tabs y triggers de Radix — no pantalla por pantalla.

**Gráficos con Visx**, para que hereden nuestros tokens en vez de traer su look.

**Una tabla hecha de grillas sueltas no mide ninguna columna por su
contenido.** En el panel, el encabezado y cada fila de una tabla son grillas
APARTE (cada `<li>` es la suya): solo quedan alineadas si todas resuelven
las mismas columnas. Una columna `auto` —o `1fr` a secas, que es
`minmax(auto, 1fr)`— mide distinto en cada fila según lo que tenga adentro,
y cero en el encabezado: en «A quién llamar» los títulos quedaban corridos
44 px, y 62 en la fila de «Cargar teléfono» (03/10/2026). Toda columna es un
largo fijo o `minmax(<largo>, <n>fr)`, la plantilla vive en UN archivo que
importan el encabezado y la fila (`components/proximos/grilla.ts`), y lo que
puede ser más ancho que su columna —un error al guardar, el motivo de un
botón apagado— va a un renglón propio debajo de la fila. **Y el ancho se
calcula con la barra de desplazamiento de Windows**: la media query no la
descuenta (a 1280 de ventana rige `xl` con 1263 de contenido), el menú se
lleva 256 px y el margen 64, así que a la tarjeta le quedan 645 px a 1024 y
901 a 1280. Lo que no entra en un renglón baja a un segundo renglón en el
mismo orden de lectura: no se achica la letra ni se esconde una columna. Lo
vigila `scripts/regresion-proximos-grilla.mjs`, a ocho anchos, con y sin la
barra, y con sus roturas adentro.

**Tipos generados desde el schema**, no escritos a mano:
`supabase gen types typescript --local > lib/database.types.ts`

**Analítica y atribución de WhatsApp (09/09/2026).** Los IDs de GA4, Google
Ads y el Píxel de Meta viven en `lib/analitica.ts`; los scripts, en
`components/tracking/etiquetas.tsx`, cargados con `next/script`
(`afterInteractive`) desde el layout raíz y solo con `analiticaActiva`.
**Google Tag Manager ya no se carga:** GA4 va por gtag.js directo, y pegar el
contenedor o el snippet del asistente de GA4 duplica cada visita. El origen
del visitante (UTM, `gclid`, `fbclid`, artículo del blog) lo resuelve
`lib/tracking/origen.ts` en cada carga y queda en `localStorage`
(`fm_origin`, 30 días); el mensaje de WhatsApp se elige en el clic
(`lib/tracking/mensaje.ts`) y todo enlace a WhatsApp de ventas pasa por
`components/tracking/enlace-whatsapp.tsx`, que además manda `whatsapp_click`
(GA4), la conversión de Ads y `Contact` (Meta) sin bloquear la navegación.
**En `/fidelli` no se montan** (`components/tracking/etiquetas-fuera-del-admin.tsx`
las omite por `pathname`): el admin lo miramos nosotros y no es tráfico.
`?fm_debug=1` cuenta todo en la consola. La verificación local es
`scripts/verificar-tracking.mjs` contra `next start`. El número de ventas está en
`WHATSAPP_VENTAS` (`lib/landing.ts`) y repetido en `TELEFONO_VENTAS`
(`lib/seo.ts`) y en `public/llms.txt`: cambia en los tres a la vez.

**Ayuda y onboarding (09/09/2026).** Los videos viven en UN archivo,
`lib/ayuda/videos.ts` (`youtubeId: null` = "Video en preparación"; ahí se
pegan los IDs). El reproductor (`components/ayuda/reproductor.tsx`) no carga
nada de YouTube hasta el clic: miniatura de i.ytimg.com y recién después el
iframe de youtube-nocookie. "¿Cómo se usa?" lo pone `CabeceraSeccion` por la
ruta (`solapa` en la lista): una solapa nueva con videos no declara nada. El
onboarding es `/panel/onboarding` con `app/panel/(tras-onboarding)/layout.tsx`
como gate: todo lo que cuelga del grupo exige `onboarding_completado_at`
(viaja en la sesión); afuera del grupo quedan el onboarding, Ayuda y el
manifest. **El progreso son los datos** (`onboarding_estado()`: productos,
`diseno_confirmado_at`, premio o `premio_omitido_at`, según el plan) y las
escrituras del owner van por funciones definer (`confirmar_diseno`,
`omitir_premio`, `marcar_bienvenida_vista`); guardar un producto o un premio
lo evalúa la base sola (triggers `onboarding_productos` / `onboarding_premios`),
así que el último paso completa el onboarding sin que el cliente avise. Las cuentas
que existían recibieron el onboarding completo por backfill; las del seed las
marca `seed.sql`. La bienvenida es CSS (`globals.css` · "La bienvenida") y se
muestra una vez por taller (`bienvenida_vista_at`). Lo vigila R14.

---

## Entorno

- Desarrollo local: `supabase start` (Docker) + `supabase db reset`
- El seed crea el lubricentro demo: slug `demo`, login `demo@fidellimotors.app`
- Y un superadmin para poder abrir `/fidelli`: `santi@fidellimotors.app`. No hay
  registro público y el alta de un superadmin es interna, así que sin esta fila
  la superficie de administración no se puede ni mirar en local. Vive en
  `supabase/seed.sql`, que solo corre en el `db reset` local.
- Mailpit para ver los mails: `http://127.0.0.1:54324`
- Studio local: `http://127.0.0.1:54323`
- Volumen para medir: `scripts/volumen-sintetico.sql` infla el demo a volumen
  tipo Sassi (3.000 clientes, 3.500 vehículos, 10.000 trabajos) y crea un
  segundo tenant igual, `zz-volumen`, para que el RLS tenga filas ajenas que
  descartar. Solo local; se deshace con `supabase db reset`.
- Proyecto en la nube linkeado: **solo dev.** Producción NO está linkeada a
  propósito — `db push` no puede tocarla por accidente.

**Las migraciones ya mergeadas a `develop` no se editan.** Un cambio de schema es
siempre una migración nueva.

### El ritual antes de cada `db push`

```
supabase db reset     # aplica todo desde cero Y corre las verificaciones
supabase db push      # solo si el reset terminó en verde
```

**Si el reset falla, no se pushea.** `supabase/verificaciones.sql` corre al final
de cada reset (declarado en `config.toml` → `db.seed.sql_paths`) y hace fallar el
comando con exit 1 si encuentra un problema de aislamiento.

Para consultarlo a mano en cualquier momento:

```sql
select * from verificar_seguridad_vistas();
```

Sin filas = está bien. Con filas = hay un agujero, y cada fila trae el SQL exacto
para taparlo.

**`create or replace view` RESETEA las `reloptions` de la vista** — incluido el
`security_invoker`. Una vista sin esa opción corre con los permisos de su dueño y
**no evalúa las policies**: un owner ve los datos de todos los lubricentros. Ya
pasó dos veces (`vista_proximos_service` nació sin ella; `vista_clientes` la
perdió al agregarle columnas, con un diff que se veía inofensivo). Toda migración
que reemplace una vista tiene que terminar con:

```sql
alter view <la_vista> set (security_invoker = on);
```

**Las policies preguntan por la sesión UNA vez por consulta, no una vez por
fila** (desde `20261021230000`). `mi_lubricentro_id()`, `soy_superadmin()` y
`auth.uid()` van siempre envueltas en un sub-select —`(select
mi_lubricentro_id())`—: a pelo, Postgres las ejecuta por cada fila que el
scan mira, incluidas las de los demás tenants, que son justo las que el RLS
descarta. Con el volumen de un taller `resumen_inicio()` tardaba 1,8 s en
local, y en producción el Inicio llegaba a veces al `statement_timeout` de
8 s de `authenticated` y mostraba «No pudimos traer el resumen». Envueltas,
el planificador las resuelve una vez (un InitPlan) y la misma consulta baja
a 59 ms; el booleano por fila es el mismo. Es el lint `auth_rls_initplan`
de Supabase. Una policy nueva se escribe
`using ((lubricentro_id = (select mi_lubricentro_id())) or (select soy_superadmin()))`;
lo que se llama adentro de otra función (`plan_permite()`,
`sucursales_dentro_del_limite()`) no hace falta envolverlo. Lo vigila R47,
en `public` y en `storage`, y `scripts/regresion-rls-initplan.sh` lo rompe
a mano. Y si el resumen no llega, el Inicio deja el motivo en los logs
(`console.error` en `app/panel/(tras-onboarding)/page.tsx`); antes se
descartaba y en Vercel no quedaba rastro.

**Si insertás a mano en `auth.users`**, fijá en `''` (no `NULL`) las columnas
`confirmation_token`, `recovery_token`, `email_change_token_new` y `email_change`.
GoTrue las escanea como `string` no-nullable y un `NULL` rompe todo login de ese
usuario con un 500 genérico.

**Los enlaces de los mails NO usan `{{ .ConfirmationURL }}` ni `{{ .RedirectTo }}`.**
`ConfirmationURL` apunta a `/auth/v1/verify`, que devuelve la sesión en el
**fragmento** de la URL (`#access_token=…`); el fragmento no viaja al servidor y
`/auth/callback` es un Route Handler, así que el invitado nunca podía activar su
cuenta. `RedirectTo` lo valida GoTrue contra la lista de Redirect URLs del
proyecto y, si no está, lo descarta **en silencio** y arma el enlace contra el
Site URL pelado (fue el bug de producción). Los templates arman el enlace así:

```
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite
```

Condición: el Site URL de cada proyecto tiene que ser la URL de su app (local
`http://localhost:3000`, prod `https://fidellimotors.app`). **Los templates son
configuración del dashboard, no viajan con el repo:** cada cambio en
`supabase/templates/` hay que pegarlo a mano en dev y en prod (Authentication →
Emails), y comprobarlo mirando el `href` del botón en un mail real.

**Cuánto dura un enlace de mail lo decide "Email OTP Expiration"**, en el
dashboard de cada proyecto (Authentication → Sign In / Providers → Email). Ese
único valor gobierna invitación, recuperación, confirmación y cambio de mail. El
default de la nube es **una hora**; el `otp_expiry = 86400` de `config.toml` sólo
manda en local. Los mails y las pantallas prometen 24 horas, así que **dev y prod
tienen que estar en 86400** (el máximo del dashboard). Con el default, todo owner
que abre la invitación a la tarde llega a "La invitación ya venció" (pasó en
producción el 2026-09-08). Aun así, un enlace vencido no es un callejón: en
`/auth/enlace?tipo=invite` el owner se pide otra invitación con su mail
(`lib/auth/invitacion.ts`, sólo para cuentas nunca activadas, una por minuto), y
`/auth/callback` deja en los logs el código con el que GoTrue rechazó el enlace.

### La clave `service_role`

Va **solo en el servidor**, nunca con prefijo `NEXT_PUBLIC_`. Se usa por una sola
puerta, `lib/supabase/admin.ts`, que lleva `import "server-only"`: si alguien la
importa desde un componente de cliente, el build falla. Sus usos son pocos y
están contados: la API de administración de Auth (invitar al owner de un
lubricentro), que no acepta la clave anónima; los crons (el cierre diario y
los avisos), que no tienen usuario detrás; y **la ruta pública del adjunto**
(`/[slug]/[patente]/adjunto/[id]`), que firma por 60 segundos un archivo que
`anon` no puede leer, después de que `adjunto_publico()` lo autoriza — es su
único uso en la superficie del cliente y no lee ni escribe nada más. Todo lo
demás va por `lib/supabase/server.ts` con la sesión del usuario y su RLS — si
una consulta "necesita" `service_role`, casi siempre lo que falta es una
policy.

**El alta de un tenant son dos fases y el orden no es negociable:** primero el
lubricentro (una transacción en Postgres, `crear_lubricentro()`), después la
invitación (una llamada HTTP). No se pueden hacer atómicas. Si falla la segunda
queda un lubricentro "Sin owner", que se arregla con un botón; al revés quedaría
un usuario en `auth.users` sin tenant, que no se arregla desde el panel.

### Un lubricentro suspendido lee, pero no escribe

`activo = false` no le corta el acceso: entra con sus credenciales de siempre y
ve todos sus datos. Lo que no puede es escribir. Por eso hay **dos helpers de
sesión y no uno**:

| Helper | Quién lo usa | Qué hace |
|---|---|---|
| `obtenerSesion()` | pantallas | la sesión, sin más |
| `sesionParaEscribir()` | Server Actions del panel | sesión + tenant + **no suspendido**; si no, redirige |

La guarda no puede vivir dentro de `obtenerSesion()` porque las pantallas
también la llaman y tienen que seguir funcionando. Para meterla ahí habría que
saber en tiempo de ejecución si se está renderizando o ejecutando una acción, y
Next no expone eso de forma estable: lo único que hay es la cabecera interna
`next-action`. Una guarda apoyada en un detalle interno deja de funcionar **en
silencio** el día que ese detalle cambie.

Como la separación es explícita, lo que garantiza que nadie se la saltee es el
lint: `eslint.config.mjs` prohíbe importar `obtenerSesion` desde
`app/panel/**/actions.ts`. Una acción nueva no pasa `npm run lint` hasta que use
`sesionParaEscribir()` o declare por escrito —con un `eslint-disable-next-line` y
un comentario— que solo lee.

**La suspensión sigue sin tocar RLS**: a nivel base el owner puede operar, y así
tiene que quedar. Bloquearlo ahí complicaría el desbloqueo y el histórico.

**Hay dos Resend** (bloque 2 del sprint de cobranza, 26/09/2026): el SMTP de
Supabase Auth (plantillas en `supabase/templates/`, las manda Supabase, se
pegan en el dashboard) y la API del app (`RESEND_API_KEY`, server-side,
cobranza). **El email de cobranza es la voz del panel, entregada: sale del
mismo `copy.ts`** —los tres momentos y las tres voces de `lib/cobranza/copy.ts`,
con los textos del anexo en `lib/email/cobranza.ts` y el marco de la
invitación en `lib/email/marco.ts`; ninguna plantilla inventa un estado ni
una voz, y no promete el solo lectura si `suspension_automatica` está
apagada—. La decisión es de la base (`avisos_pendientes()`, solo
`service_role`: el email más avanzado que corresponde hoy y no se mandó
para este vencimiento; umbrales, no igualdades; el exento, el de afuera del
reloj y el suspendido a mano nunca; el alta sin email intermedio). El envío
es del cron `/api/fidelli/avisos-cobranza` (9:00 de Argentina, misma guarda
que el cierre diario en `lib/cron/guarda.ts`). **`emails_cobranza` es
evidencia: uno por tipo por ciclo, se inserta después de que Resend
confirma, y no se borra** (tres candados). En local, el doble
`scripts/doble-resend.mjs` con `RESEND_BASE_URL`: ningún email de prueba
sale de verdad. Lo vigila R37.

**Y son DOS suspensiones con dos salidas** (bloque 1 del sprint de cobranza,
26/09/2026). `sesion.suspendido` sigue siendo el único predicado de los
gates; `sesion.suspensionManual` dice POR QUÉ, y el corte es `activo`, nunca
el estado del reloj (con `activo = false` el reloj también dice
`suspendido`). Manual (`activo = false`): la levanta Fidelli, la tarjeta es
`AvisoSuspension` con WhatsApp, `/panel/suscripcion` no ofrece pagar y la
base cierra sus órdenes vivas al apagarlo (trigger
`cerrar_ordenes_al_suspender`, estado `CERRADA`). Por reloj: la levanta el
pago, la tarjeta es `AvisoSuspensionReloj` con **Pagar** en la voz que
corresponda (`lib/cobranza/copy.ts`), y el modal de Inicio se muestra igual
que en gracia. Un pago tardío compra un período entero desde hoy
(`periodoHastaDeLaOrden`: `greatest(vencimiento, hoy) + período`); el que
paga dentro del ciclo no gana días.

---

## Las diez reglas del sprint de agosto — se rompen y no avisan

Cada una existe porque romperla **no da error**: el build pasa, los tests no
dicen nada y el daño aparece semanas después en los datos de un cliente.
Están ordenadas por lo que cuesta el descuido.

**1 · El control por plan vive en dos capas o no vive.** RLS rechaza en
silencio y la aplicación sola se evade con una llamada directa a la API. Las
dos, siempre, contra `plan_permite()`. Una feature nueva que solo se chequea
en React no está gateada.

**2 · Un cambio de plan nunca borra datos.** Se apaga la ESCRITURA, nunca la
lectura. Por eso el gating va en `WITH CHECK` y jamás en `USING`: con `USING`
un downgrade haría desaparecer de la pantalla lo que el tenant ya tenía.

**3 · `plan_permite()` revienta con un nombre desconocido** en vez de
devolver `false`. Un feature mal tipeado que devuelve `false` es una función
apagada para todo el mundo, en silencio y para siempre.

**4 · Ninguna vista se reemplaza sin volver a fijar `security_invoker`.**
`create or replace view` resetea las `reloptions`, y una vista sin esa opción
corre con los permisos de su dueño: un owner ve los datos de TODOS los
lubricentros. Ya pasó dos veces. Toda migración que toque una vista termina
con `alter view <la_vista> set (security_invoker = on);`.

**5 · `vista_proximos_service` filtra por tipo.** Si pierde ese filtro, una
mecánica pasa a contar como "último service" y los autos con mecánica
desaparecen de la retención **sin ningún error**. Es el peor bug posible del
producto: la pantalla que trae la plata se vacía sola. Lo vigila R2.

**6 · No hay importes en el modelo operativo.** Ni en `services`, ni en
`service_items`, ni en los pendientes. Los precios viven SOLO en
`presupuestos` y en `productos.precio_venta`. El día que un service tenga un
total, esto pasa a ser un sistema de facturación y hay que sostener IVA,
notas de crédito y numeración fiscal.

**7 · El modo oscuro es elección del LUBRICENTRO, no del visitante.** Es un
campo de `config_experiencia`, no `prefers-color-scheme`. Con la preferencia
del sistema, la página de un taller oscuro se vería clara para la mitad de
sus clientes y el pedido queda sin resolver. **Los documentos nunca van en
oscuro**: presupuesto, cartón impreso y hoja de calcos salen siempre claros,
también el PNG que va por WhatsApp.

**8 · La superficie del cliente sobrevive a la suspensión; el panel no.** Un
tenant suspendido conserva su página pública —apagarla mataría todos los
calcos pegados en los parasoles de sus clientes— pero no puede escribir. El
premio y el mensaje al escanear sí se apagan: no se promete un beneficio que
el local no puede entregar. Está comentado en `get_carton`/`get_landing` y lo
vigila R4. **No "arreglar" esto devolviéndole el `and l.activo` al where.**
Y desde `20260926200000` "suspendido" es el **estado derivado**, no solo el
interruptor manual: las dos puertas preguntan `es_activo(l)` (`activo` Y el
reloj fuera de `suspendido`), porque la suspensión por reloj nunca escribe
`activo` y con `l.activo` a secas un tenant a 20 días de vencido seguía
prometiendo el premio. En gracia el premio SIGUE (los Términos prometen siete
días completos). Lo vigila R36, también como `anon`.

**9 · Cero logos de automotrices.** Ninguna de las fuentes evaluadas otorga
licencia: todas licencian la colección y desligan la marca registrada. La
marca se muestra como insignia tipográfica. Si algún día hay una licencia por
escrito, el logo entra en el contenedor de `InsigniaMarca` sin tocar layout.

**10 · El copy nunca revela el tamaño del equipo.** Ni "somos dos", ni "el
equipo", ni "nuestro CTO". El lubricentro está comprando continuidad.

Y las tres que dejó el módulo de gomería (septiembre de 2026). Ninguna estaba
escrita en ningún lado, y las tres se pisaron en el mismo sprint:

**11 · Los CHECK y las policies por tipo admiten valores nuevos en silencio.**
Todo lo que esté escrito como `tipo <> 'algo' or (...)` se evalúa como
verdadero para cualquier valor del enum que no sea `algo`. Agregar un valor a
`tipo_trabajo` sin sumar su propio CHECK y su propia condición en las dos
policies de `services` deja ese tipo sin restricciones y sin gating de plan,
también por la API directa. No da error, no rompe el build y no lo atrapa
ninguna prueba que no se haya escrito para eso. El caso real: con
`'neumaticos'` en el enum y sin `20260911120100`, una fila de gomería entraba
con viscosidad de aceite y descripción de mecánica a la vez, y el módulo pago
quedaba gratis para los trece tenants. Cuando agregues un valor a un enum que
aparezca en un CHECK o en una policy, buscá todas las apariciones del enum en
`supabase/migrations` y cerrá cada una. Lo vigila R15.

**12 · No llames funciones `security definer` sin guarda desde una vista
`security_invoker`.** `feature_de_tenant()` es definer y no está grantada a
`authenticated` a propósito: grantarla dejaría a cualquier owner leyendo las
features de todos los tenants. Llamarla desde una vista o función invoker hace
que la consulta explote con `permission denied`, y el front muestra una lista
vacía sin un solo error a la vista — el listado de `/fidelli` dijo "Todavía
no hay ningún lubricentro" con trece tenants en la base. Usá
`plan_permite()`, que es la puerta pública y está atada a
`mi_lubricentro_id()`, o resolvé los tres escalones en línea con
`plan_overrides` y `planes.features`. Nunca grantes la definer para salir del
paso. Lo vigila R15i.

**13 · Una prueba que nunca viste en rojo no existe.** El caso real: R15a
verificaba el gating de `services` cargando un trabajo con ruedas, y con la
policy que decía probar rota seguía en verde — lo que rechazaba era la policy
de `service_ruedas`. Por cada prueba nueva, rompé a mano exactamente lo que
dice cubrir y confirmá que falla. `scripts/regresion-retencion.sh` y
`scripts/regresion-neumaticos.sh` son el molde: reconstruyen la vista o la
función rota con un `sed` sobre la migración, corren el bloque de
`verificaciones.sql` que la cubre y esperan la excepción. Es la práctica del
proyecto, no un script de un módulo: un bloque nuevo de la red trae su rotura.

Y las dos del sprint de vehículo pesado (septiembre de 2026), que no rompen el
build y se pisan en el primer `alter type` o en el primer mapa de etiquetas:

**14 · El orden del enum `item_tipo` es el orden del cartón.** `order by
item_tipo` es lo que dibuja el papel en `get_carton`, en la exportación y en
pantalla. Un valor nuevo agregado al final —o anclado en el lugar equivocado—
pone el filtro de urea después de los aditivos en el cartón de un camión, sin
error y con el build en verde. Todo valor nuevo entra con `add value … after`,
**anclado a un valor que ya existía antes de esa migración** (anclar a uno
agregado en la misma transacción es justo lo que Postgres puede rechazar), en
orden inverso al del cartón —cada uno empuja al anterior hacia abajo— y en una
migración sola, sin nada más adentro: un valor nuevo de enum no se puede usar
en la transacción que lo crea. El molde es `20260915120000_item_tipo_pesado`.
Ninguna función SQL enumera valores de `item_tipo` y así tiene que seguir:
`guardar_service` y `actualizar_service` castean el jsonb entrante de forma
genérica. Lo vigila R17. **La única excepción a «nunca al final» son los
cinco renglones del service de caja** (`caja_filtro`, `caja_aditivo`,
`caja_limpieza_carter`, `caja_lavado`, desde `20261004120000`, y
`caja_dialisis`, desde `20261026150000`): van al final a propósito, porque
no son del cartón de aceite sino de OTRO papel, que se dibuja solo y en ese
orden. Un renglón nuevo de la caja entra también al final, después del
último de la caja, y son tres líneas: el enum, `RENGLONES_CAJA` y la
etiqueta de la exportación (el tipo generado obliga a la tercera). La base no los separa de los 21 —sigue casteando
genérico—; quien no los mezcla es el front, con dos listas (`RENGLONES` y
`RENGLONES_CAJA` en `lib/renglones.ts`).

**15 · `filtro_hidraulico` y `aceite_hidraulico` son dos renglones distintos.**
El filtro es del sprint de vehículo pesado y vive en FILTROS; el aceite existe
desde el día uno y vive en ACEITES. En el papel los dos dicen "Hidráulic." y
los distingue la etiqueta vertical del grupo. Es el error más fácil de cometer
al tocar `lib/renglones.ts` o `ETIQUETA_RENGLON` en la exportación: un renglón
mapeado al otro no da error, guarda el aceite como filtro y el Excel del
cliente miente. Lo mismo con las dos relecturas de pesado ("Combustible
primario", "Diferencial trasero"): son el MISMO `item_tipo` que "Combustible" y
"Diferencial", cambia solo cómo se lee la etiqueta en la carga y en el papel, y
en el Excel va siempre la neutra —dos nombres para el mismo valor rompen
cualquier tabla dinámica del cliente.

Y la que deja el sprint de cobranza (septiembre de 2026):

**16 · Toda la plata es DATO, no constante, y todo cambio de plata deja
rastro con autor, fecha y motivo.** Los precios de lista, los dos
`descuento_*_pct` y `modulos.precio_mensual` viven en la base y se mueven
por `fijar_precio_plan()` / `fijar_precio_modulo()`, que exigen motivo y
registran en `cambios_precio_catalogo`. Un `UPDATE` suelto sobre esas
columnas lo rechaza el candado (`bloquear_precio_directo`), venga de donde
venga. **Nunca hardcodees un porcentaje en TypeScript**: el 25% del anual
vale 25 en producción y 15 en el default de la migración que creó la
columna, así que el número escrito a mano se rompe en silencio el día que
Santiago lo ajuste desde `/fidelli/precios`.

Y el corolario que costó encontrarlo: **el catálogo local tiene que ser el
de producción.** Hasta la migración `20260916100000` no lo era —el
semestral valía 10 en local y 0 en prod, y el plan del demo estaba a
$45.000 contra $46.750— y eso no es cosmético: la pantalla de pago decide
si OFRECE el período semestral mirando `descuento_semestral_pct > 0`, así
que la opción aparecía en local y no en producción. Quien probara ahí
concluiría que la regla anda. Lo vigila R20b, que corre **después** del
seed porque el plan del demo nace en `seed.sql` y no en las migraciones.

**17 · El reloj de cobranza tiene TRES interruptores, y dos arrancan
apagados.** `lubricentros.cobranza_desde` (NULL = este tenant está afuera
del reloj) decide si el reloj **avisa**; `lubricentros.suspension_automatica`
decide si puede **cerrar el panel**; y desde `20260917140000`
`bloqueo_de_alta_activo()` decide si puede cerrarle el panel **al que nunca
pagó**, que es una escalera distinta —de dos escalones, sin gracia— y por eso
tiene su propio interruptor.

El tercero es una FUNCIÓN y no una columna, y eso no contradice lo de abajo:
lo que sigue dice que *prendido en prod y apagado en local* tiene que ser un
dato. Los dos primeros son exactamente ese caso (rollout tenant por tenant,
solo en producción). El tercero no: está apagado en todas partes y el día que
se prenda, se prende en todas a la vez, porque lo que lo destraba es un hecho
del mundo —un pago real con el monto correcto— y no un rollout. Mismo caso que
`alias_confirmado_por_cresium()`. El primer ciclo es solo avisos: la
primera vez que esto corre es la primera vez que el cálculo de plata se
encuentra con tenants reales, y un monto mal calculado que ADEMÁS suspende
a alguien no se arregla con una disculpa.

Son COLUMNAS y no funciones, y eso no es un detalle de estilo: una función
vive en una migración, y una migración vale lo mismo en local y en
producción **por construcción**. Prendido en prod y apagado en local tiene
que ser una diferencia de DATOS. Escrito como función, la migración que
prende el reloj dejaría el `db reset` en rojo para siempre.

El estado se DERIVA (`estado_cobranza`), nunca se guarda: nada de un cron
dando vuelta booleanos — el día que no corre todos quedan gratis, y el día
que corre dos veces suspendés a alguien que pagó. `activo = false` gana
siempre; `descuento_pct = 100` queda fuera del circuito entero (quien no
paga nada no puede deber nada); el demo no entra nunca, y lo cuida un
trigger porque un `where` olvidado en el UPDATE de encendido lo metería en
silencio. Lo vigila R21.

**18 · Un campo calculado de PostgREST es TAMBIÉN un endpoint `/rpc/`, y el
composite lo elige quien llama.** `reloj_cobranza(lubricentros)` es
`security invoker` a propósito: como definer, filtrando por un
`lubricentro_id` que viene adentro del argumento, cualquier owner
autenticado lee el vencimiento, el período, el descuento negociado y el
precio del tenant de al lado. **Se verificó explotable en vivo** durante el
diseño de este sprint, sobre `plan_capacidades`, que tiene esa forma. El
uuid de la víctima no es secreto: viaja en el `logo_url` público de su
propia vidriera. Como invoker el RLS recorta la subconsulta y el composite
forjado devuelve null.

⚠ Y la prueba de esto se escribe con `jsonb_populate_record`, **no** con un
join contra la tabla: leer la fila del vecino ya lo bloquea el RLS, así que
la versión con join pasa en verde aunque la función sea definer. Las dos
veces que se escribió mal, la rotura de R21e se escapó. Lo vigila R21e.

**19 · Cresium FIRMA LA URL COMPLETA en sus webhooks, y su documentación
dice lo contrario.** La página "Webhooks - Autenticación y generación"
define el segmento como *"PATH: el path completo del endpoint de webhook
del Partner"* y da de ejemplo `/webhooks/partner?token=xyz`. Su
implementación manda `https://fidellimotors.app/api/cresium/webhook`.
Medido con una entrega real el 16/09/2026: catorce intentos rechazados con
401 antes de encontrarlo. La ruta acepta **las dos formas** — las dos son
HMAC con nuestro secret, así que aceptar ambas no abre nada, y el día que
lo corrijan el webhook sigue entrando.

Y el corolario, que es la regla de verdad: **un doble de pruebas que
reproduce la DOCUMENTACIÓN en vez de la REALIDAD da verde mientras
producción rechaza todo.** Pasó dos veces en el mismo sprint — con la
firma del webhook y con el envoltorio `data` de las respuestas. Cuando el
doble y el original no se pueden contrastar contra una llamada real, el
verde del doble no prueba nada: prueba que dos piezas escritas por la
misma cabeza están de acuerdo.

**20 · El `externalId` de una orden de PAGO ÚNICO es único en Cresium PARA SIEMPRE**,
también después de `PAID` o `EXPIRED`, y borrar nuestra fila no lo
libera. Medido el 16/09/2026: la orden de los $390 quedó pagada, se limpió
`cresium_ordenes` para volver a probar, y el intento siguiente —mismo
vencimiento, misma referencia— volvió con `400 EXISTING_EXTERNAL_ID`. Y
no era de las pruebas: un tenant que genera la cuenta, deja pasar los
siete días y vuelve, caía en el mismo callejón. Por eso la referencia
lleva número de intento (`sub:hasta`, `sub:hasta:2`, …; todo en
`lib/cresium/orden.ts`), el parser del webhook lee SOLO las dos primeras
partes, y una orden sin pagar de más de siete días se trata como vencida
aunque la fila diga `NOT_PAID`: el único webhook es el de `DEPOSIT`, nadie
avisa cuando una orden vence. Lo vigilan R22e,
`scripts/regresion-cobranza-cresium.sh` y
`node --no-warnings scripts/regresion-cresium-orden.mjs`, que además
sostiene que el doble conteste los bytes reales del rechazo (400 y el
código, no el 409 que uno escribiría). Desde el 31/10/2026 las renovaciones
de un tenant con cuenta de cobro no emiten pago único: su orden es interna
(`cvu:…`) y no se quema nada; la regla sigue rigiendo para los pedidos de
calcos y para los tenants sin cuenta.

Y la que deja el sprint de políticas (septiembre de 2026):

**21 · Los textos legales viven en `content/legal/` con versión. Cambiar un
texto de forma relevante = subir `VERSION_LEGAL` = todos vuelven a aceptar.
Nunca se editan in place sin subir la versión.** La fuente única es
`lib/legal.ts` (`VERSION_LEGAL`, `VIGENCIA_LEGAL`); el frontmatter de
`content/legal/terminos.md` y `content/legal/privacidad.md` tiene que
coincidir, y si no coincide el render de `/terminos` y `/privacidad` —y el
build— fallan con el mensaje que dice cuál. Los textos se publican tal cual:
son copy aprobado y vinculante, no se "mejoran". La aceptación es producto:
`aceptaciones_terminos` guarda una fila por (tenant, versión) —historial,
nunca una columna— con los tres candados de evidencia; el panel la exige
en cada request por el campo calculado `aceptaciones_legales` del select de
la sesión, y el modal bloqueante va ANTES que el gate del onboarding. La
versión vigente NO vive en la base a propósito: guardarla ahí sería una
segunda fuente que se desincroniza en silencio. Exentos: el superadmin y el
tenant demo, por slug. Lo vigila R27.

Y la del sprint de service + mecánica (septiembre de 2026):

**22 · Una visita es una FECHA, la pareja nace en UNA transacción, y el
contador del premio vive en DOS funciones que tienen que decir lo mismo.**
El premio cuenta `count(distinct s.fecha)`, no filas: si alguien lo
«arregla» de vuelta a `count(*)`, service + mecánica del mismo día vuelven
a valer 2 con alcance `'todos'` y dos services del mismo día también, sin
ningún error. Y la cuenta está escrita dos veces —`premio_disponible` para
un auto, `ciclos_fidelizacion` para la flota—: cambiar una sola deja la
tarjeta del cliente diciendo un número y la pantalla Fidelización otro.
La mecánica adjunta se guarda ADENTRO de `guardar_service` (la función se
llama a sí misma con `p_tipo => 'mecanica'`), nunca con una segunda
llamada al RPC desde la acción, por tres razones que no dan error: (1) con
dos llamadas, un corte de red o un plan sin la feature deja el service
guardado y la mecánica no, y el reintento duplica el service; (2) las dos
filas y el canje comparten `now()`, y `premio_disponible` corta con
`created_at > canje` estricto — una segunda llamada le da a la mecánica un
`created_at` posterior y, con alcance `'todos'`, arranca el ciclo nuevo en
1 el mismo día del canje; (3) la llamada recursiva pasa por la MISMA
policy `services_insercion`, porque la función es **security invoker** —
volverla definer «para simplificar» deja a un Basic colando mecánicas por
`/rpc/`, y R3b no lo ve porque prueba la mecánica sola. Tampoco pongas
`clock_timestamp()` en la mecánica adjunta para «ordenarla»: es el mismo
bug que la segunda llamada. Lo vigila R38.

Y la del sprint de pedidos de calcos (octubre de 2026):

**23 · `cresium_ordenes` guarda DOS cosas, y la referencia de una orden ya
no es siempre un uuid.** Desde `20261003200000` la tabla tiene las órdenes
de las renovaciones (`suscripcion_id`) y las de los pedidos de calcos
(`encargo_calcos_id`), y eso rompe dos supuestos viejos sin dar un error.
**El primero: «la última orden del tenant».** Tres lectores la miraban dando
por hecho que era la de su renovación —`cobranzas_pendientes()`,
`resumen_admin().ordenes_cresium` y la pantalla de pago de la suscripción
(`lib/suscripcion/datos-pago.ts`)—: con un pedido de calcos más nuevo, la fila
de Cobranzas decía «ya generó la cuenta» mirando los calcos, la alerta del
hub contaba un pedido a medio pagar como deuda (y un pedido nuevo TAPABA la
renovación a medias), y al dueño se le mostraba el alias de sus calcos bajo
el título «Tu suscripción». Los tres filtran ahora `suscripcion_id is not
null`; **un lector nuevo de esa tabla tiene que decir de cuál de los dos
lados es**. **El segundo: el `externalId`.** `acreditar_deposito_cresium()`
castea la primera parte de la referencia a uuid; con `calcos:<uuid>` ese cast
explota, la ruta contesta 500 y Cresium reintenta cinco veces un depósito
que ya entró. La rama de calcos va ANTES del cast, y tampoco castea lo que no
tiene forma de uuid. Un tercer concepto de cobro entra igual: su prefijo, su
rama antes del cast, y su caso en `scripts/regresion-cresium-webhook.mjs`.
Lo vigila R40 (e y j).

Y la del service de caja (octubre de 2026):

**24 · La caja no es un service: tiene SU columna, SU vista, SU motivo de
contacto y SU papel, y ninguno de los cuatro se «unifica» con los del cambio
de aceite.** Las cuatro formas de romperlo, y ninguna da error. **(1) El
próximo en la columna del service.** Con el próximo de una caja escrito en
`prox_service_km`, `vista_proximos_service` la tomaría como el último
service y el auto dejaría de avisar por su cambio de aceite hasta dentro de
80.000 km. Por eso `prox_caja_km` es otra columna, `caja_coherente` exige
`prox_service_km is null` y el espejo `prox_caja_solo_caja` está en positivo.
**(2) El horizonte copiado.** «18 meses desde el último trabajo» funciona
para un service, que se repite cada 10.000 km; puesto sobre la fecha de la
última caja, saca al auto de la lista años antes de que le toque volver y
la fuente queda vacía para siempre —sin un solo error—. En
`vista_proximos_caja` el corte va sobre la fecha estimada. **(3) El contacto
con un estado del service.** `vista_proximos_service` tilda su fila con
`co.estado = c.estado`: si el aviso de una caja se registrara como
`urgente`, tildaría también el service del mismo auto. La caja se contacta
con el motivo `'caja'`, como pendientes y gomería con el suyo. **(4) El
ternario por tipo.** `tipo === "neumaticos" ? … : tipo === "mecanica" ? … :
<el cartón de aceite>` le mostraba al cliente —y al mecánico— el cartón de
ACEITE de un service de caja, y el compilador no ve un ternario. Todo lugar
que elegía el papel o el texto así es ahora un `Record<TipoTrabajo, …>` —el
papel del detalle del panel, el de la página del cliente y el de su
historial (`PAPEL_POR_TIPO`); el renglón del listado, el del Inicio, el de
la ficha del cliente y el del historial público (`RESUMEN_POR_TIPO`); el
detalle de la exportación (`DETALLE_POR_TIPO`); el cartel de guardado y los
«qué falta» de la carga—: un quinto tipo no compila hasta tener el suyo. Un
ternario nuevo por tipo es un bug esperando el próximo valor del enum. Lo
vigilan R42 y `scripts/regresion-caja.mjs`.

Y la de los adjuntos (octubre de 2026):

**25 · Un adjunto no es parte del cartón, y al archivo se llega por una sola
puerta.** Las cinco formas de romperlo, y ninguna da error. **(1) La policy
copiada.** El molde de una tabla hija de `services` es `ruedas_escritura`,
con la ventana de edición adentro: copiado tal cual, adjuntar deja de
funcionar a las 24 horas —justo cuando llega el PDF del escaneo— y nadie lo
ve, porque el día de la prueba el trabajo es de hoy. Ninguna policy de
`adjuntos_trabajo` mira `plazo_edicion()`, y R43 adjunta a un trabajo de hace
un mes. **(2) «Total, están marcados visibles».** Una policy de lectura del
bucket para `anon` limitada a los visibles parece equivalente y no lo es: da
una URL estable que se reenvía y sigue abriendo, deja listar la carpeta, y
saca del medio la verificación de patente y slug. `anon` no lee ni el bucket
ni la tabla; la ruta firma por 60 segundos, con la clave de servicio.
**(3) El interruptor que se puede mandar prendido.** «Apagado por defecto»
escrito solo como `default false` lo saltea un insert por la API con
`visible_cliente: true`. Lo garantiza el GRANT por columnas, que es la mitad
que una policy mal escrita no puede esquivar. **(4) La URL firmada en el
HTML.** Firmar en la página (como hace el panel, que es del owner y con su
sesión) deja en el HTML del cliente un enlace de una hora que se copia. En la
superficie del cliente el enlace es la ruta, y la firma nace en el clic.
**(5) `get_carton` redefinida desde la versión equivocada.** La tocan casi
todos los sprints: se parte SIEMPRE de la última definición —que puede estar
en un PR todavía sin mergear, como pasó acá con la del service de caja— o la
migración nueva le borra en silencio lo que agregó la anterior
(`prox_caja_km`). R43f comprueba que la clave ajena sigue ahí. Lo vigilan
R43, `scripts/regresion-adjuntos.sh` y `scripts/regresion-adjuntos.mjs`.

Y la del CVU dedicado (octubre de 2026):

**26 · La cuenta de cobro son TRES datos que nacen juntos, y el depósito a
esa cuenta se acredita por monto EXACTO o lo mira una persona.** Las
cuatro formas de romperlo, y ninguna da error. **(1) El alias solo.** La
puerta vieja (`fijar_alias_de_tenant`) escribía el alias sin CVU; con el
alias puesto, la renovación pedía un pago único con ESE alias y el día que
se emitiera la cuenta Cresium contestaba `EXISTING_ALIAS`. El CHECK
`alias_con_cvu` y la puerta cerrada lo impiden; una migración que «ayude»
a escribir el alias por separado vuelve a abrirlo. **(2) La tolerancia.**
`where m.total = round(p_monto, 2)` es la regla entera: un `<=`, un `abs()
<= 1000` o un «si no coincide, el mensual» acreditan plata que nadie
decidió acreditar, y un monto que coincide con dos períodos se acredita al
que la consulta devuelva primero. Cero o más de uno es «a confirmar», y a
confirmar es una fila en `depositos_cresium` que una persona cierra.
**(3) El semestral ofrecido siempre.** `montos_ofrecidos()` lista el
semestral solo si `descuento_semestral_pct > 0`, igual que la pantalla:
sin esa condición el dueño «paga» un semestre que nunca pudo elegir.
**(4) `paymentOrder` sin prioridad.** Un DEPOSIT con `paymentOrder` es un
pago único (una renovación vieja o un pedido de calcos) y manda la
referencia aunque el CVU coincida; la rama dedicada entra solo sin
`paymentOrder`. Lo vigilan R25, R51, `scripts/regresion-cobranza-alias.sh`
y `scripts/regresion-cvu-dedicado.sh`.

---

## La red de regresión — qué protege cada cosa

`supabase/verificaciones.sql` corre al final de **cada `supabase db reset`**
(declarado en `config.toml` → `db.seed.sql_paths`) y hace fallar el comando
con exit 1 si algo se rompió. **Si el reset falla, no se pushea.**

**Si ves una de estas en rojo, NO la borres para que pase el build.** Cada
una tapa un agujero que ya existió o que costaría muy caro descubrir en
producción. El mensaje de la excepción dice qué invariante se rompió.

| # | Qué protege | Qué significa que falle |
|---|---|---|
| **R1** | Un plan sin `premios` no puede escribir un premio ni por SQL directo | El gating de RLS se cayó: la capa de aplicación quedó sola y se evade por API |
| **R2** | Una mecánica **no** altera la fila de retención del vehículo (campo por campo) | La regla 5. Los autos con mecánica están por desaparecer de "A quién llamar" |
| **R3** | Un plan Basic carga un service común y **no** una mecánica | El gating condicional al tipo se rompió — o Basic quedó sin poder trabajar |
| **R4** | La página pública de un tenant suspendido responde, con el premio oculto | La regla 8. O se apagó la vidriera de un suspendido, o se le está ofreciendo un premio que no puede entregar |
| **R5** | Los estados del pendiente por fecha y por kilómetros (vencido/urgente/próximo) | El cálculo de urgencia cambió: la lista de a quién llamar está mintiendo |
| **R6** | Tildar un pendiente y guardar el trabajo ocurren en la MISMA transacción | Se puede guardar un service y perder la resolución del pendiente, o al revés |
| **R7** | Un plan sin `pendientes` no puede crear uno | Ídem R1, para pendientes |
| **R8** | La numeración de presupuestos es correlativa por tenant bajo concurrencia | Dos presupuestos con el mismo número, que es un documento que el cliente ya tiene en la mano |
| **R9** | Un producto sin stock sigue funcionando; el descuento baja lo correcto (renglón × cantidad, aceite a granel × litros, aceite envasado 1 por service); el aviso suena y calla | El stock opcional dejó de serlo, el descuento se aplica dos veces, o un bidón pierde tantas unidades como litros se anotaron |
| **R10** | El piso de anonimato de los modelos: ≥3 vehículos en ≥2 lubricentros | Un modelo cargado por UN solo tenant se le está filtrando a otro. Es una fuga entre clientes |
| **R11** | Un tenant sin configurar rinde igual que siempre; el mensaje al escanear respeta feature, vigencia y suspensión en las dos capas | Un tenant cambió de aspecto sin pedirlo, o se está mostrando un mensaje que no corresponde |
| **R13** | Las patentes de moto (`123ABC`, `A123BCD`) entran por el CHECK, por `corregir_patente` y por `get_carton`; lo que no es patente sigue afuera | Alguien volvió a cerrar el formato a autos, o lo abrió a cualquier cosa |
| **R14** | Ninguna cuenta queda con `onboarding_completado_at` null tras el seed; las funciones del onboarding son definer; un Basic tiene dos pasos y nunca se le pide el premio; el estado de otro tenant no se lee | Una cuenta vieja vería el panel bloqueado, o un taller no podría salir nunca del onboarding, o se le pide una función que su plan no tiene |
| **R15** | El módulo de gomería (bloque 1): sin el módulo no entra un trabajo de neumáticos ni por SQL directo —en dos variantes, porque la de "solo alineación" es la única que aísla la policy de `services`—; no altera la retención; los CHECK del tercer tipo y de cada rueda; el stock baja una por rueda colocada; el premio sigue `alcance`; apagar el módulo no le saca a nadie lo que ya cargó; el listado de `/fidelli` sigue respondiendo | La regla 11 o la 12. El módulo pago quedó abierto, o la superficie de administración quedó vacía sin error |
| **R16** | Los retornos de gomería (bloque 2): `vista_proximos_service` devuelve exactamente las mismas filas antes y después de cargar trabajos de gomería; la vista nueva es invoker y solo para tenants con el módulo; cada motivo (rotación, alineación, reajuste, antigüedad, desgaste) con su regla; el anti-spam por ciclo; el beneficio de la compra y su apagado; los CHECK y el RLS de `config_neumaticos`; `resumen_inicio` emite el tipo; el ritmo sale de todos los trabajos con km | La regla 5 otra vez, o un motivo que dejó de avisar: la pantalla que trae la plata miente en silencio |
| **R17** | Los renglones del vehículo pesado: el enum `item_tipo` tiene los 21 valores del cartón de aceite en el orden exacto del papel (y, al final, los cinco del service de caja, que son otro papel); `guardar_service` y `actualizar_service` aceptan los 21 tal cual y `get_carton` los devuelve en el orden del papel | La regla 14: el cartón de un camión se dibuja fuera de orden, o alguien enumeró los valores de `item_tipo` en SQL y los diez de camión quedaron afuera |
| **R18** | La clase del vehículo: `vehiculos.clase` es anulable y sin default; el enum es exactamente `(liviano, pesado)`; `crear_cliente_con_vehiculo` guarda la clase contestada y deja null la omitida; `vista_vehiculos` y `get_carton` la exponen (null como null) | Alguien marcó los ~1.800 vehículos como autos "para simplificar", el alta perdió la clase, o el papel del cliente volvió a ser el de un auto para un camión |
| **R19** | Editar un vehículo sin contestar la clase la deja como estaba: el update de `editarVehiculo` sin la clave no la toca, null o contestada, y nada de la base la inventa | Una sugerencia pasó a ser una respuesta: un trigger o un default clasifica autos que nadie clasificó, o una edición pisa una clase guardada |
| **R21** | El reloj de cobranza: los cuatro estados con sus bordes exactos y el contador que vale 1 el último día útil; `activo = false` gana sobre todo, `descuento_pct = 100` exime y sin `cobranza_desde` no hay reloj; el SEGUNDO interruptor (con `suspension_automatica` apagada avisa pero no cierra el panel); las nueve claves del payload; la lectura cruzada de tenants con un composite forjado; y los montos (Pro anual, módulo pago vs bonificado, el founding que no toca el módulo) | Un cliente que pagó se suspende solo, un bonificado recibe una factura de $25.000, el primer ciclo dejó de ser solo avisos, o un owner está leyendo la negociación comercial del de al lado |
| **R22** | El cobro por Cresium: `pagos.registrado_por` es anulable pero el CHECK impide un pago manual sin autor y uno de Cresium sin id de transacción; cinco entregas del mismo depósito dejan UN pago; `PARTIAL` no mueve el vencimiento; la evidencia se guarda siempre, acredite o no; la referencia con sufijo de intento (`sub:hasta:2`) acredita a la misma suscripción; y **la evidencia no se borra, no se edita y no se vacía** —los tres candados, más el contra-chequeo de que no se coman las seis escrituras del webhook | Un reintento le regaló otro período a alguien, un cobro automático quedó indistinguible de uno tipeado a mano, una transferencia parcial activó una suscripción que no se pagó, o la tabla de evidencia volvió a ser un log que se puede vaciar |
| **R23** | La pantalla de cobranzas de `/fidelli`: un owner lee CERO filas (la función es definer y cruza `usuarios` y `contactos_fidelli` de toda la plataforma); el monto sale de `monto_de_renovacion_en()`, la misma función que la pantalla de pago del cliente; y quien tiene el plan bonificado no aparece | Un dueño de lubricentro está leyendo el vencimiento, el monto y el teléfono de todos los demás, o el WhatsApp le cotiza un número distinto del que el cliente ve en su pantalla |
| **R20** | El catálogo de cobranza: `modulos` existe con su precio y su `codigo` coincide con la clave del override; el catálogo local es el de producción (el plan del demo afuera, el semestral en 0); el candado rechaza un `UPDATE` suelto de precio pero NO bloquea `activo`/`features`; el motivo es obligatorio y un guardado que no mueve ningún número no ensucia la auditoría | Un precio se movió sin dejar rastro, el módulo se cobra mal o no se cobra, o el `db reset` volvió a dejar un catálogo que no es el real y el cálculo de plata se prueba contra números que no existen |
| **R24** | La atención de `/fidelli` exime al 100%: un tenant bonificado no aparece con ninguno de los cuatro estados, en ninguna fecha —tampoco como `trial_vencido`, porque el precio ya es cero— y el listado y la ficha lo dicen igual porque comparten `estado_atencion()`. Con el contracaso en las dos posiciones del caso real: sin descuento, a 4 días y vencido hace 4, los dos estados vuelven | Se está llamando para cobrarle a alguien que no debe nada (el caso Brothers Oil del 20/09/2026), o —peor— la exención se comió la lista entera y la pantalla que trae la plata se vació sola |
| **R25** | La cuenta de cobro del tenant (`20260917120000` + `20261031100000`): el interruptor `alias_confirmado_por_cresium()` está PRENDIDO y la puerta vieja (el alias solo) rechaza siempre; los tres datos —alias, CVU, id de Cresium— van juntos (CHECK `alias_con_cvu`) y los escribe `fijar_cvu_de_tenant()`, solo Fidelli, normalizados y con fecha; los tres son inmutables (dos candados) y la puerta no reasigna; la unicidad de los tres por la puerta y por el índice, con los nulls conviviendo; el formato y los dos largos del alias y los 22 dígitos del CVU con su contracaso; y el alta con `p_alias` falla entera, y sin alias nace con los tres en null | Un tenant quedó con alias y sin cuenta (y Cresium va a rechazar la emisión como EXISTING_ALIAS), un owner emitió una cuenta, dos tenants comparten alias o CVU (la plata de uno entra al otro), un CVU se «corrigió» por UPDATE y el webhook dejó de reconocer sus depósitos, o un alta a medias |
| **R26** | El alta prende el reloj y el primer pago define el ciclo: el tenant nuevo nace PAGANDO con `cobranza_desde` escrito y el vencimiento al día siguiente, **y ningún otro tenant entra al reloj por eso**; el primer pago que llega TARDE corre `inicio` y `vencimiento` a la fecha del pago con el largo contratado, y el que llega en plazo —o una renovación— no; las dos puertas del cobro hacen lo mismo; y la marca de la cuarta pantalla del onboarding es definer y se escribe una sola vez | El rollout volvió a ser el UPDATE peligroso contra 17 filas, un tenant que tardó cinco días en terminar el onboarding perdió cinco días de su primer mes, o el cobro manual —el que se va a usar en las primeras altas— quedó fuera del cambio |
| **R27** | Las páginas legales y la aceptación de los Términos: los cuatro slugs (`terminos`, `privacidad`, `legal`, `condiciones`) reservados por `slug_reservado()` Y por el CHECK; `aceptaciones_terminos` con sus tres candados en `ALWAYS` (delete, update y truncate rechazados); `aceptar_terminos()` escribe el tenant y el usuario DE LA SESIÓN, es idempotente por versión, guarda el historial (la fila de 1.0 sigue tras aceptar 1.1) y un superadmin no acepta; el predicado distingue versiones y exime al demo por slug; y el aislamiento —un owner lee cero filas ajenas y el campo calculado con un composite forjado (regla 18) devuelve vacío— | Un lubricentro puede pisar una página legal, un tenant "aceptó" un texto que nunca vio (o subir `VERSION_LEGAL` dejó de pedir nada), el contrato se puede borrar o editar, o un owner está leyendo las aceptaciones del de al lado |
| **R28** | Las consultas sin resultado no guardan la patente: cero filas con `not encontrada and patente is not null` tras el seed; el índice de leads no existe; el CHECK y el trigger existen; `get_carton` registra la consulta sin resultado con patente null y la de un auto encontrado con su patente; un insert directo la anula; `resumen_inicio` sigue contando los leads | La vidriera volvió a guardar patentes de gente que no es cliente de nadie —la política promete lo contrario—, o la métrica de escaneo del Inicio se apagó |
| **R29** | La retención y la purga: `cancelada_at` se escribe al cancelar y se limpia al volver; la simulación escribe en `purgas` (conteos y logo pendiente) sin borrar ni tocar `lubricentros`; la purga real borra las tablas listadas, no toca `pagos`, `suscripciones`, `sucursales` ni `usuarios`, deja `activo = false` y `purgado_at`, y respeta el plazo (el de 11 meses y el demo cancelado hace 13 no se tocan); dos veces no; a pedido exige motivo, rechaza al demo y al ya purgado, y queda auditada con quién; un owner no la ejecuta; el reloj está en `cron.job` EN SIMULACIÓN; `purgas` tiene los tres candados en `ALWAYS` | "Solo cuenta" y borró, se llevó la contabilidad, purgó a alguien antes de los 12 meses (o al demo), el reloj se prendió en real antes de ver una simulación, o la purga no dejó evidencia |
| **R30** | La supresión de un cliente final: el owner de otro tenant no puede; sin motivo no; los cuatro sentinelas quedan escritos y el vehículo y el service siguen; la auditoría dice quién y por qué; `vista_clientes` sigue devolviendo al cliente (la ficha abre); el teléfono sentinela no tiene dígitos; dos veces no; el libro no se escribe por fuera de la función; el superadmin también puede | Cualquier owner anonimiza a cualquiera, anonimizar se llevó los trabajos, o la supresión no quedó auditada |
| **R31** | Los cimientos de las métricas (docs/METRICAS.md): `tenant_eventos` es inmutable (UPDATE, DELETE y TRUNCATE fallan); un pago deja exactamente UN evento y el pago sobrevive a un trigger roto; `cerrar_dia()` es idempotente y no cierra hoy; `mrr_plataforma()` = Σ `mrr_de_tenant()`, con el módulo pago adentro y el anual dividido 12; `es_activo()` es false con `activo = false` y con el reloj en `suspendido`; suspender exige motivo y deja `suspension` con motivo y actor; el alta, el origen, el override y el cambio de plan dejan su evento; y tras el seed hay un `alta` por tenant y un evento por pago | La memoria de las bajas y del churn se puede editar o vaciar, un cobro se pierde por un trigger, el cron duplica fotos, o el MRR volvió a calcularse sin el módulo o sin mensualizar |
| **R32** | Lo que leen el Resumen y el listado de `/fidelli` (bloque MÉTRICAS 2): un owner no ejecuta `salud_tenants()`, `indicadores_tenants()`, `trabajos_semanales()`, `resumen_admin()` ni `metricas_plataforma()` (42501); la salud NO repite la exención del 100% —un bonificado vencido no sale en «cobro vencido» porque lo decide `estado_atencion()`—; los cortes de actividad (3 y 7 días) con su oración; `trabajos_semanales()` devuelve 12 filas por tenant con las semanas en cero y suma los tres tipos; `indicadores_tenants()` cuenta 30 días de cualquier tipo y trae el MRR de `mrr_de_tenant()`; `metricas_plataforma()` y `resumen_admin()` cuentan una mecánica como trabajo, y el total del mes es la suma de los tres tipos; un activo sin trabajos hace 20 días aparece en la alerta con sus días | Cualquier owner lee la salud y el MRR de todos, el listado volvió a pintar «Cobro vencido» a quien no debe nada (Brothers Oil otra vez), el sparkline o el Pulso dejaron afuera las mecánicas y la gomería, o la tabla muestra un MRR que no es el del snapshot |
| **R33** | Pauta, activación, uso y calcos (bloque MÉTRICAS 3): un owner no registra contactos ni lee el embudo, la activación, el uso ni los calcos (42501) y el RLS le devuelve cero contactos; cierre y pérdida son excluyentes (CHECK) y perder un cerrado se rechaza; `marcar_cierre()` fija el origen del tenant SOLO si estaba vacío, con el canal, y deja el evento `origen`; `embudo_pauta()` cuenta por cohorte de primer contacto (el que escribió en la semana 1 y cerró en la 3 es un cierre de la semana 1) y el CAC por período de cierre; `gasto_pauta` rechaza un martes por la función y por el CHECK; `pedidos_calcos` rechaza UPDATE, DELETE y TRUNCATE; `registrar_pedido_calcos()` deja `calcos_entregadas` igual a la suma y emite `calcos`; tras el seed la suma es el contador para todos y el backfill es idempotente; `activacion_tenant()` activa exactamente en el trabajo 20 del día 7 y no en el día 8; la serie del Pulso suma el total por punto; un auto con recordatorio antes del trabajo cuenta como auto que volvió; el alta deja `estado` | Un owner lee la pauta, el embudo miente sobre la cohorte o el CAC, un cierre pisa un origen cargado a mano, las calcos se pueden editar o el contador dejó de ser la suma, la activación cuenta el día 8, o el Pulso apilado no suma el total |
| **R34** | Crecimiento, performance y el candado de calcos (bloque MÉTRICAS 4): la identidad de `movimientos_mrr()` cierra por construcción en ARS y USD sobre toda la historia (`mrr_inicio + nuevo + reactivación + expansión − contracción − churn + ajuste = mrr_fin`); un cambio de lista con el mismo plan, período y módulo es ajuste de precio y no expansión, un descuento renegociado (evento `cambio_plan`) es expansión y no ajuste, anual → mensual es expansión y nuevo no se confunde con reactivación; `cohortes_logos()` y `cohortes_ingresos()` devuelven null en los meses no cumplidos y NRR ≥ GRR; `suspension_reloj` y `falta_de_pago` son involuntarias; un owner recibe 42501 en las seis funciones y la vista `snapshots_mensuales` no le devuelve filas; `listado_lubricentros()` reescrita dice EXACTAMENTE lo mismo que la versión vieja fila por fila sobre diez tenants variados, y `metricas_plataforma()` con un solo `group by` devuelve el mismo jsonb (también sin ningún trabajo); `estado_owner()` coincide con `estados_owner()` y `suscriptos_por_plan()` con el listado; y un `UPDATE` directo a `calcos_entregadas` (postgres, superadmin o `actualizar_lubricentro()`) queda en la suma de pedidos, también después de un pedido en la misma transacción | La tabla de movimientos miente (no cierra, o clasifica la lista como venta), las cohortes muestran retención de meses que no terminaron, el churn del reloj cuenta como voluntario, el listado o el Pulso cambiaron de resultado al ganar velocidad, o el contador de calcos volvió a poder pisarse |
| **R37** | Los tres emails de cobranza: `avisos_pendientes()` no le toca nada al exento (con pago), al de afuera del reloj, al suspendido a mano ni al que está al día; a 7 días → `por_vencer` (el borde entra), el día 0 → `vencido`, vencido ayer → SOLO el 2, suspendido por reloj → el 3 y con el interruptor apagado el mismo tenant sigue en el 2; el alta recibe el 1 el día del alta y NADA pasado el plazo con el bloqueo apagado; el trial en su voz; con el 2 mandado no se manda el 2 ni se cae al 1, con solo el 1 mandado se manda el 2; el que paga entre el 2 y el 3 no recibe el 3 y un vencimiento nuevo habilita los tres; el destinatario es el owner, el monto el de `monto_de_renovacion()` y `corta` el segundo interruptor; `emails_cobranza` rechaza el duplicado (unique), el delete, el update y el truncate, con los tres candados en ALWAYS; y un owner recibe 42501 al ejecutar la decisión | Un email a quien no debe nada o a quien no vio ninguna barra, «vence el DD/MM» el día que vence o después de «hoy vence», el mismo email dos veces (o el 3 a quien ya pagó), «solo lectura» prometido con el interruptor apagado, un monto distinto del de la pantalla de pago, la evidencia que se borra y el cron que vuelve a mandar, o un owner leyendo el vencimiento y el email de todos los demás |
| **R36** | La suspensión por reloj, de verdad: la vidriera y el cartón de un tenant suspendido POR RELOJ (activo, interruptor prendido, con pago, vencido hace 20 días) responden como `anon` sin el premio, sin el progreso y sin el mensaje al escanear, y con el historial; en GRACIA los tres siguen (contracaso); apagar el tenant a mano cierra sus órdenes vivas (NOT_PAID y PARTIAL → `CERRADA`), no toca la PAID, reactivarlo no las reabre y un depósito a una CERRADA igual se acredita; con el `hasta` de la acción (`greatest(vencimiento, hoy) + período`) el pago tardío deja el vencimiento en hoy + período, el pago registra el período que cubre de verdad y el tenant vuelve a al_dia, y dentro del ciclo el vencimiento nuevo es exactamente vencimiento + período; y el cierre del día siguiente al pago emite `reactivacion_reloj` | Un suspendido por reloj sigue prometiendo el premio en su página (los Términos dicen lo contrario), el premio desapareció en gracia, un suspendido a mano tiene una cuenta abierta a la que transferir para nada, un pago tardío compra un período ya vencido y el tenant paga y sigue suspendido, el que paga en plazo gana días, o la vuelta de un suspendido no deja rastro en Crecimiento |
| **R35** | El plazo de edición por tipo: `plazo_edicion()` existe y contesta por CADA valor del enum (7 días para mecánica, 24 horas para service y neumáticos); como owner del demo, una mecánica de hace 3 días se edita y un service, un trabajo de neumáticos de hace 3 días y una mecánica de hace 8 no (cero filas, sin error); los renglones heredan el plazo de la cabecera; `get_carton` le muestra al dueño del auto el sello `fijado` con el mismo cálculo; y la ventana de desbloqueo sigue siendo de 24 horas fijas sobre cualquier tipo, y con ella abierta la mecánica fijada vuelve a editarse; y la ventana rige también en el `WITH CHECK`: como owner, un INSERT directo de un renglón en un service de hace 3 días falla con 42501 y en una mecánica de hace 3 días entra, e ídem una rueda con el módulo de gomería prendido por la puerta real | La mecánica volvió a fijarse a las 24 horas (la ficha queda a medias y el taller llama a Fidelli), un service quedó editable una semana (el cartón del cliente deja de ser confiable), el panel dice «editable» y la base dice que no, un tipo nuevo nació sin plazo, o un renglón vuelve a entrar en un trabajo fijado por la API directa |
| **R38** | Service + mecánica en UNA carga, y el premio por visitas (`20260929100000`): `guardar_service` tiene UNA sola firma y sigue siendo security invoker; con `p_mecanica` nacen las dos filas juntas (misma fecha, km, sucursal y `created_at`; la mecánica vinculada por `cargado_con_id`, con sus renglones libres, las observaciones solo en el service) y la función devuelve el service; los pendientes nuevos y tildados cuelgan del service y la mecánica no los duplica; con la descripción corta o colgando de una mecánica no queda NADA; como owner de un Basic la carga doble falla con 42501 sin dejar ni el service, y el service común sigue entrando; la pareja vale UNA visita con los dos alcances, dos services del mismo día valen 1, una mecánica sola cuenta solo con `'todos'`, y `ciclos_fidelizacion()` dice lo mismo que `premio_disponible` en los dos alcances; corregir fecha, km y sucursal del service los copia a la mecánica adjunta, y con el plan en Basic el service se corrige igual y la mecánica queda como estaba; con «Aplicar premio» en la carga doble, con alcance `'todos'`, queda UN canje atado al service y el ciclo vuelve a 0 (ninguna de las dos filas cuenta), y un trabajo cargado DESPUÉS del canje con fecha anterior vale 1 (el corte sigue siendo `created_at`); el CHECK rechaza el vínculo en un service y el trigger lo rechaza hacia otro vehículo o hacia una mecánica, y acepta el bien formado | La carga doble dejó media visita guardada, un Basic metió una mecánica por la puerta nueva, el premio volvió a contar filas (la visita doble suma 2), la tarjeta del cliente y la pantalla Fidelización cuentan distinto, un typo corregido en el service partió la visita en dos fechas, el canje se ató a la mecánica y el guardado no lo encuentra, la mecánica del día del canje abrió el ciclo nuevo, o una mecánica de otro auto quedó «cargada con» un service |
| **R39** | Los pedidos de calcos (`20261003120000`): la tabla de transiciones de `avanzar_encargo_calcos()` (`pagado → entregado` no existe, `entregado` es terminal, cancelar un pagado es solo para incluidos y con nota, pagar a mano exige nota, enviado exige envío + transportista + seguimiento y listo para retirar exige retiro, y la versión del diseño se fija al entrar a producción); «Entregado» escribe UNA fila en el libro con la cantidad, incluidas o cobradas y el monto, guarda su id y el contador sube esa cantidad; un pedido sin pagar por tenant (la puerta contesta `ya_hay_pendiente` y el índice parcial frena el insert directo; con el primero pagado, el segundo entra); el owner no escribe por tabla (encargos, diseños, catálogo, bucket), no ejecuta ninguna puerta de Fidelli, no lee pedidos ni diseños ajenos **ni el costo de los propios**; el precio y el costo del catálogo no se mueven por UPDATE directo (ni como postgres), el candado no se pasa de rosca, la puerta exige motivo, audita antes/después con autor, no registra lo que no cambió y no deja la bandera prendida; los montos del pedido quedan congelados aunque el catálogo cambie; `resumen_admin().calcos` cuenta pagados sin producir, en producción hace más de 5 días HÁBILES y sin pagar que vencen en 24 h, y la cola sale en el orden de trabajo; los días hábiles (lunes a viernes, sin el día de partida); los diseños (versiones correlativas, una sola actual, la ruta en la carpeta del tenant) y el bucket `calcos` privado, donde el owner ve solo su carpeta; el catálogo local es el de la decisión del sprint y la comisión 0,968 %; los cuatro CHECK del encargo por su nombre; y un tenant suspendido no pide | Un pedido llega a entregado sin producirse o un entregado se mueve y el libro queda sin su pedido, la entrega no suma al contador (o suma otra cosa), un tenant tiene dos alias vivos y no sabe cuál pagar, un owner se marca pagado solo o lee lo que nos cuesta imprimir sus calcos, un precio se movió sin dejar rastro o un pedido ya emitido cambió de monto, la alerta del hub cuenta mal lo que Grego tiene que hacer hoy, o el diseño de un tenant se baja adivinando la ruta |
| **R40** | El pago de un pedido de calcos (`20261003200000`): los tres CHECK de `cresium_ordenes` por su nombre (una orden es de una renovación con su período, o de un pedido sin período; nunca de las dos ni de ninguna); un `DEPOSIT` en `PAID` con referencia `calcos:<uuid>` deja el pedido `pagado` con `pagado_at` y el id de la transacción, la orden en `PAID`, la evidencia en «acreditado» y **ni una fila nueva en `pagos`**; los cuatro reintentos contestan `ya_acreditado` sin mover nada (idempotencia por `encargos_calcos.cresium_transaccion_id`); `PARTIAL` no paga y deja a la vista cuánto entró y cuánto falta; una referencia de calcos que no es de nadie —un uuid que no existe, algo que ni es un uuid, vacía— **no explota** y queda sin acreditar con su motivo; `calcos:<uuid>:2` acredita al mismo pedido; un depósito no revive un cancelado ni le cambia la transacción a uno ya pagado; `vencer_encargos_calcos()` vence los sin pagar de más de 7 días (ni los de 6 días y 23 horas, ni los que no están sin pagar, ni los de otro tenant si se le pasa uno) y es idempotente; con uno vencido el tenant vuelve a pedir; **`vencido → pagado` pasa por el webhook y por ningún estado de `avanzar_encargo_calcos()`**; el mail se reclama una vez por tipo y se puede soltar; `cobranzas_pendientes()` y `resumen_admin().ordenes_cresium` miran la orden de la RENOVACIÓN —ni cuentan una de calcos, ni se dejan tapar por una más nueva—; y un owner no vence, no reclama mails, no lee el catálogo con costos ni escribe una orden, pero sí lee la de su pedido | El webhook contesta 500 a cada depósito de calcos y Cresium lo reintenta cinco veces (la plata entró y el pedido sigue sin pagar), un pedido se paga dos veces o con la mitad, la plata de calcos entra al MRR y mueve el vencimiento de la suscripción, un pedido sin pagar le bloquea al tenant volver a pedir para siempre, el tenant recibe cinco «recibimos tu pago», o Cobranzas y la alerta del hub leen un pedido de calcos como si fuera el abono |
| **R41** | El stock de calcos y el aviso (`20261003210000`): **la cuenta** (400 entregadas y 285 autos nuevos → 115; no cuentan el auto que ya venía de antes, el que solo tiene historia importada ni el que solo tiene un trabajo anulado; sí, una vez, el importado que vuelve y el que tiene dos trabajos; nunca negativo); **el recuento** (90 declaradas y 7 autos nuevos → 83; una entrega posterior suma y una corrección del libro con fecha vieja no; gana el más nuevo; el dueño declara con el tenant de SU sesión); **null en todo** sin entregas y con `calcos_propias`; **el ritmo** (8 semanas, o la historia que haya; null con menos de 2 semanas; cobertura null con ritmo cero); **los umbrales del aviso** en las dos direcciones (4 semanas, 1 semana, 20 calcos) y nunca con un pedido abierto, estado por estado del enum; **los mails** (el más avanzado, una vez por escalón por ciclo de entrega, sin caer al anterior, y una entrega nueva habilita los dos; nada para el que imprime por su cuenta, el suspendido, el demo ni el que tiene un pedido abierto); **la lista del hub** (menos de 3 semanas, con teléfono y owner, y `sin_stock` cuenta lo mismo); **`calcos_propias`** (el owner no lo prende, un UPDATE suelto se rechaza, la puerta exige nota y deja el evento); los seis candados de `recuentos_calcos` y `emails_calcos` en ALWAYS y el unique; y quién ejecuta qué (un owner no lee el stock del vecino, tampoco un usuario sin lubricentro) | A un lubricentro se le dice que le quedan calcos que no tiene (o se lo apura cuando le sobran), el que volvió con su auto de siempre le «gasta» un calco, la entrega que llegó ayer no cuenta y sigue el aviso, el dueño recibe el mismo mail todos los días o «te quedan cuatro semanas» después de «te queda una», se le manda «pedí ahora» al que ya pidió o al suspendido, Grego llama al que imprime por su cuenta, o un owner lee el ritmo de trabajo del lubricentro de al lado |
| **R42** | El service de caja automática, el cuarto tipo (`20261004120000` + `20261004120100`): **el catálogo** (la feature `caja` existe y no figura en el `features` de ningún plan; la categoría `transmision` entre los aceites y los filtros; una sola firma de `guardar_service` y de `actualizar_service`; los dos CHECK por su nombre; la vista con `security_invoker` y el contrato de columnas de la de services); **el gating** (sin la feature no entra una caja por la RPC ni por INSERT directo, y un service no se convierte en caja por UPDATE; con el override de `/fidelli`, sí; apagarla apaga la escritura y no la lectura, tampoco en el cartón del cliente); **los CHECK** (`caja_coherente`, condición por condición, y el espejo `prox_caja_solo_caja` para cada uno de los otros tres tipos; una caja no es adjunta de nadie —y desde `20261029200000` SÍ lleva una mecánica adjunta: R49—); **la rama** (la caja con sus cinco renglones guardados como hechos aunque el jsonb diga otra cosa, el stock del aceite por litros o por bidón y el de los renglones por cantidad, los pendientes colgados de la caja, y las tres validaciones con su error nombrado y sus bordes: 20.000 y 200.000 entran); **la edición** (cambia el ATF, los litros, el producto, el próximo y las observaciones; sincroniza los renglones por tipo, siempre como hechos; no toca el stock ni el tipo; a las 23 horas se edita y a las 25 no); **la vista** (el km/día y el último odómetro salen de todos los trabajos; los bordes 15 / 7 / 30; 40 km/día con un solo punto; una caja anulada no cuenta; vencida hace 500 días sigue y hace 600 no; una caja de hace cinco años y medio SÍ aparece; sin la feature y para un superadmin, cero filas; el contacto de un service no la tilda y una caja nueva reabre el aviso); **`vista_proximos_service` y `vista_vehiculos` dicen EXACTAMENTE lo mismo** antes y después de cargar cajas y de contactar por caja en los mismos autos, y un auto que solo tiene cajas no aparece en la retención de aceite; **el premio** (suma con `'todos'` y no con `'services'`, en las dos funciones); **`get_carton`** con `prox_caja_km` en cada entrada; **`resumen_inicio().cajas_mes`** y **`metricas_plataforma()`** (`cajas_mes`, `cajas_acumulado`, la caja como trabajo y no como service, y cada punto de las series sumando los cuatro tipos); el badge con la cuarta fuente; y las plantillas con su texto de caja, sin pisar lo personalizado | Una caja entra sin kilómetros o con descripción de mecánica, un tenant sin la feature la carga por `/rpc/`, un service queda con próximo de caja, los renglones de la caja se guardan como «revisados», el aceite de caja no baja del stock, un salto de 800.000 km deja al auto fuera de la lista por décadas, la lista de un taller de cajas está siempre vacía (o llena de autos perdidos), la caja se cuela como «último service» y el auto deja de avisar por su aceite, contactar por la caja tilda el service, el cliente no ve su próximo de caja, el Inicio cuenta cualquier trabajo como caja, o el Pulso apilado no suma su total |
| **R43** | Los adjuntos de un trabajo (`20261004200000`): **la forma** (la tabla con RLS; `anon` sin ningún privilegio; el alta de seis columnas —sin `visible_cliente`, `subido_por` ni `created_at`— y la edición de una sola; los dos triggers; la FK en cascada; el bucket privado, de 2 MB y tres formatos, con tres policies y ninguna para `anon`; `adjunto_publico()` definer y solo de `service_role`, igual que `adjuntos_huerfanos()`); **el alta** (entra en un trabajo FIJADO hace un mes, nace oculto, a nombre de quien lo subió y en el tenant de su trabajo aunque el insert mande otro; se rechazan la carpeta de otro trabajo o de otro tenant, la ruta que sube de carpeta, la extensión que no es la del formato, el formato desconocido, el archivo vacío, los 2 MB y un byte, el nombre en blanco o de 121 caracteres —y exactamente 2 MB entra—; y a un trabajo ajeno, nada); **el tope** (el cuarto falla con `tope_adjuntos`, también fuera de la sesión del owner; es por trabajo; al quitar uno entra otro, y quitar funciona en un trabajo fijado); **lo único que se edita** es «Mostrar al cliente», columna por columna; **el aislamiento** (el owner no lee ni toca lo del tenant de al lado, en la tabla ni en el bucket; sube solo a su carpeta y borra solo lo que no está registrado; `anon` no lee la tabla, no ve el bucket, no sube y no ejecuta la función, y un owner tampoco ejecuta las dos de servicio); **la puerta del cliente** (`adjunto_publico()` entrega la ruta solo del visible, con la patente como la escribe la gente; null para el oculto, para otro vehículo, para el slug de OTRO tenant que tiene la misma patente, para el adjunto del vecino, para lo que no existe, para un trabajo anulado y al apagarlo); **`get_carton`** (lista los visibles con `id`, `nombre`, `mime` y `creado` y nada más, en el orden en que se subieron; `[]` donde solo hay ocultos; no deja ver la ruta ni el id del trabajo; **no perdió `prox_caja_km`**; y el tenant de al lado ve solo el suyo); y **los huérfanos** (lista el archivo sin fila de hace dos días; no el recién subido, ni el que tiene su fila, ni los de otro bucket) | Un adjunto nace a la vista del cliente o el taller ya no puede adjuntar al día siguiente, el cuarto archivo entra, un owner le cuelga un archivo al trabajo de otro lubricentro o lee su carpeta, el diagnóstico de un auto se baja sabiendo la patente de otro (o el slug de otro taller), el cliente ve un adjunto oculto o la ruta de un archivo, `get_carton` perdió el próximo de caja al ganar los adjuntos, o el cierre diario le borra el archivo a quien está adjuntando (o no barre nunca) |
| **R44** | El slug entra en el QR del calco (`20261004200000`): el CHECK `slug_largo_qr` existe y ningún tenant lo viola; 32 caracteres entran y 33 no —por INSERT lo frena ESE check, no el viejo de 3 a 60, y por UPDATE tampoco—; y `slug_estado()` contesta `invalido` para 33, `disponible` para 32 libres y `ocupado` para 32 tomados | Un lubricentro queda con un slug cuyo QR no se puede hacer (pasó con uno de 34), o el alta dice «Disponible» y falla al crear |
| **R45** | Los datos de la empresa en el presupuesto (`20261004210000`): **la forma** (la tabla con RLS; `anon` sin nada; el owner lee, da de alta y edita SOLO los seis campos —ni el sello ni el tenant— y no borra; tres policies y ninguna de borrado; los seis CHECK por su nombre; el trigger del sello; la FK en cascada; la puerta, una sola firma, invoker, y que `anon` no ejecuta); **la puerta** (recorta, guarda el CUIT en once números —escrito con guiones, con puntos o pelado—, deja null lo vacío, y es un upsert de los SEIS campos: una fila por tenant, a nombre de quien guardó); **los rechazos** (un CUIT de diez o de doce números contesta `cuit_invalido`, una condición de IVA que no es de la lista, una clave mal escrita, un dato más largo que su tope —y los cuatro en el tope exacto entran—; y por la tabla tampoco entran el CUIT con guiones, la condición inventada, la razón social vacía, el domicilio con espacios, el teléfono con un salto de línea ni el email de 121 caracteres); **el sello** (el owner no escribe `actualizado_por`, `updated_at` ni el tenant, y un UPDATE con privilegios tampoco los deja: los pisa el trigger); **el aislamiento** (el owner del demo ve una fila; no lee, no pisa por la puerta ni por la tabla, y no da de alta la del tenant de al lado; nadie borra; `anon` no lee ni ejecuta); **Fidelli** (sin decir el lubricentro, `falta_lubricentro`; con él, guarda a su nombre y no toca a los demás); y **la purga** (la simulación cuenta la fila sin borrarla; la real se la lleva, y solo la de ese tenant) | Un owner lee la razón social y el CUIT de otro lubricentro (o se los cambia), un CUIT a medias sale impreso en un presupuesto, un dato no se puede vaciar, alguien firma la carga con el usuario de otro, Fidelli pisa los datos de un taller cargando los del de al lado, o la razón social de quien canceló hace más de un año sigue en la base |
| **R46** | El buscador de clientes encuentra el teléfono por sus dígitos (`20261021120000`): `vista_clientes` tiene `telefono_digitos`, «+54 9 351 317-2545» da `5493513172545`, el `like` por dígitos lo encuentra y `telefono` sigue siendo el crudo que se muestra | Un cliente cargado con espacios o guiones en el teléfono no aparece al buscarlo por teléfono |
| **R48** | Las patentes de los países vecinos (`20261026120000`): los nueve formatos nuevos —Brasil `ABC1D23` / `ABC1234`, Paraguay `ABCD123` / `123ABCD`, Bolivia `1234ABC` / `AB12345`, Chile `ABCD12` / `AB1234` / `ABC12`— entran por el CHECK escritos de cualquier manera (minúsculas, guiones, el punto de la chapa chilena) y se normalizan; `get_carton` encuentra una brasileña; `corregir_patente` acepta una uruguaya y rechaza `ABCDE1`; y lo que quedó afuera a propósito sigue afuera (`AB123`, los formatos chilenos de 2026, una letra y seis dígitos, ocho caracteres, una brasileña a medio tipear) | Alguien volvió a cerrar el formato a los argentinos —y Sassi no puede cargar al cliente brasileño—, o lo abrió a cualquier cosa |
| **R47** | Las policies preguntan por la sesión una vez por consulta (`20261021230000`): ninguna policy de `public` ni de `storage` llama a `mi_lubricentro_id()`, `soy_superadmin()` o `auth.uid()` a pelo en su `USING` o su `WITH CHECK` —cada llamada va envuelta en un sub-select—, y el chequeo tiene qué mirar (70 policies de `public` o más las llaman) | Una policy nueva o redefinida volvió a la forma vieja: Postgres la evalúa fila por fila, el Inicio vuelve a tardar segundos y a veces no llega, sin ningún error |
| **R49** | Service de caja + mecánica en UNA carga (`20261029200000`): la pareja nace junta desde la caja —`guardar_service` devuelve la caja; la mecánica queda vinculada a ella con la misma fecha, km, sucursal y `created_at`, su descripción recortada y sus renglones libres; la caja conserva su próximo en `prox_caja_km`, sus renglones como hechos y sus observaciones; la mecánica nace sin próximo de caja ni observaciones; los pendientes nuevos y tildados cuelgan de la caja y la mecánica no los duplica—; como owner de un Basic con la feature caja la carga doble falla con 42501 sin dejar NI LA CAJA, y la caja sola del Basic sigue entrando; sin la feature caja la pareja no entra y no queda nada; la pareja vale 0 con alcance `'services'` y UNA visita con `'todos'` en las dos funciones, y con «Aplicar premio» queda UN canje atado a la caja y el ciclo vuelve a 0; corregir fecha, km y sucursal de la CAJA los copia a la mecánica adjunta, con el plan en Basic la caja se corrige igual y la mecánica queda como estaba, y editar la mecánica no toca la caja; el trigger del vínculo acepta una caja como destino y sigue rechazando un trabajo de gomería; anular la caja no anula la mecánica; y `vista_proximos_caja` proyecta lo mismo para un auto con caja sola y uno con caja + mecánica (y su «último» es la caja) | La carga doble desde la caja dejó media visita guardada, un Basic metió una mecánica por la puerta de la caja, la pareja suma dos al premio, un typo corregido en la caja partió la visita en dos fechas (la rama de la caja tiene su propio `return` y la propagación no la alcanzaba), el canje se ató a la mecánica, una mecánica quedó «cargada con» un trabajo de gomería, o la mecánica adjunta movió la proyección de la caja |
| **R51** | El CVU dedicado (`20261031100000`): el libro `depositos_cresium` con RLS (el owner lee solo lo suyo y no escribe) y sus tres candados en ALWAYS, y la orden interna solo de una renovación; el monto EXACTO del mensual acredita (pago de Cresium sin autor, vencimiento + 1 mes, la orden interna del período PAID y la del otro período CERRADA, el depósito «acreditado» con su pago, la evidencia con el motivo); cinco reintentos, un pago; el anual acredita 12 meses; otro monto queda a confirmar con los montos de hoy en el motivo, sin pago, y su reintento no duplica; el monto solo en `amounts` se suma; el semestral acredita SOLO si el plan lo ofrece; un CVU de nadie sigue con el motivo viejo y un DEPOSIT con `paymentOrder` manda la referencia aunque el CVU coincida; resolver (el owner no; sin período o sin nota no; acreditar deja un pago con la transacción Y quién decidió; dos veces no; descartar no toca pagos); `depositos_cresium_pendientes()` solo para Fidelli, con los montos de hoy y sin los resueltos; y un suspendido a mano con el monto exacto igual acredita | Un depósito con el monto justo no se acreditó (el dueño pagó y sigue viendo la barra), uno con otro monto se acreditó solo (o a un período que nadie eligió), un reintento regaló un mes, el semestral que nunca se ofreció se cobró, un pago único entró por la rama equivocada, un owner se resolvió un depósito, o el libro se vació |
| **R52** | Comprobantes por foto/IA (`20261101120000`): la tabla `comprobantes_recibidos` con RLS y el gate del módulo `finanzas` en el WITH CHECK (no en el USING); los CHECK (dirección, estado, ruta del tenant, movimiento coherente); el bucket privado `comprobantes`; las puertas de mutación invoker (registrar/guardar_extraccion/confirmar/descartar) y `comprobantes_huerfanos` definer+service_role, y que `anon` no ejecuta ninguna; como owner con el módulo, confirmar crea el egreso con los valores REVISADOS (no los que leyó la IA) y marca confirmado en una transacción, el segundo confirmar se rechaza, descartar marca descartado, una venta no se confirma (R1), y los CHECK de ruta ajena y de coherencia frenan un insert directo; sin el módulo registrar/confirmar fallan con 42501 pero la lectura sigue; y un owner no lee el comprobante de otro tenant | El egreso se crea con lo que leyó la IA y no con lo que el dueño revisó (auto-guardado), un comprobante sin el módulo entra por la API directa, una venta se confirma sin su rama (R1), el módulo pago queda abierto o un downgrade apaga la lectura, un owner lee los comprobantes del vecino, o el cierre diario no barre los archivos sin fila |
| **R50** | El modo oscuro del panel, preferencia de la persona (`20261030100000`): `usuarios.tema` existe, nace en claro y tiene su CHECK por nombre; `fijar_mi_tema()` tiene una firma, es definer, `anon` no la ejecuta y `authenticated` sí; como owner, «oscuro» queda en SU fila y en ninguna otra, «azul» y null se rechazan con `tema_invalido`, un UPDATE directo sobre la fila de otro no toca nada, y vuelve a claro; sin sesión contesta `sin_sesion` sin tocar filas; como anon, 42501 | El interruptor no guarda (la función quedó invoker y usuarios no tiene policy de update), un owner le cambia el tema a todos, el panel se pinta con un modo que no existe, o anon escribe en `usuarios` |

Además, fuera del reset, **las roturas a mano** (regla 13):

```bash
./scripts/regresion-retencion.sh
./scripts/regresion-neumaticos.sh
./scripts/regresion-pesado.sh
./scripts/regresion-cobranza.sh
./scripts/regresion-cobranza-reloj.sh
./scripts/regresion-cobranza-cresium.sh
./scripts/regresion-cobranza-deudas.sh
./scripts/regresion-cobranza-alias.sh
./scripts/regresion-cobranza-alta.sh
./scripts/regresion-legal.sh
./scripts/regresion-legal-datos.sh
./scripts/regresion-metricas.sh
./scripts/regresion-edicion.sh
./scripts/regresion-cobranza-suspension.sh
./scripts/regresion-cobranza-emails.sh
./scripts/regresion-visita.sh
./scripts/regresion-importacion.sh   # necesita importaciones/falco/falco-limpio.json (no está en el repo)
./scripts/regresion-calcos.sh
./scripts/regresion-caja.sh
./scripts/regresion-caja-mecanica.sh
./scripts/regresion-tema.sh
./scripts/regresion-adjuntos.sh
./scripts/regresion-datos-empresa.sh
./scripts/regresion-rls-initplan.sh
./scripts/regresion-cvu-dedicado.sh
./scripts/regresion-comprobantes.sh
node --no-warnings scripts/regresion-cresium-orden.mjs
node --no-warnings scripts/regresion-cobranza-emails.mjs
node --no-warnings scripts/regresion-avisos-cobranza.mjs   # contra next dev + el doble de Resend
node --no-warnings scripts/regresion-orden-de-trabajo.mjs  # contra next dev + el seed (Playwright)
node --no-warnings scripts/regresion-proximos-grilla.mjs   # ídem; toca el demo local por psql y lo restaura
node --no-warnings scripts/regresion-aceite.mjs            # ídem; toca el demo local por psql y lo restaura
node --no-warnings scripts/regresion-calcos.mjs            # contra next dev + la base RECIÉN reseteada (Playwright)
node --no-warnings scripts/regresion-calcos-tenant.mjs     # ídem; levanta los dobles de Cresium y de Resend
node --no-warnings scripts/regresion-calcos-stock.mjs      # ídem; levanta el doble de Resend (el stock, el aviso y el cron)
node --no-warnings scripts/regresion-cresium-webhook.mjs   # contra next dev: la puerta del webhook, renovación, calcos y el CVU dedicado (su tenant queda)
node --no-warnings scripts/regresion-cvu-dedicado.mjs      # contra next dev + el seed (Playwright): la cuenta de cobro de punta a punta; levanta el doble de Cresium; deja al demo con cuenta, pagos y libro
node --no-warnings scripts/regresion-comprobantes.mjs      # contra next dev (EXTRACTOR_COMPROBANTE=doble) + el seed (Playwright): subir un comprobante, el doble lo lee, el dueño corrige y confirma, y el egreso nace con lo REVISADO; anon por la API directa; prende el módulo en el demo y lo restaura
node --no-warnings scripts/regresion-pago-cuenta.mjs       # ídem (sin dobles): la pantalla de pago (mensual por defecto, el anual en pesos) y Mi cuenta en cuatro solapas, a 390 y 1280
node --no-warnings scripts/regresion-caja.mjs              # contra next dev + el seed (Playwright); prende la feature en el demo local y lo restaura
node --no-warnings scripts/regresion-caja-mecanica.mjs     # ídem; carga una caja con su mecánica en el ABC 123 del demo y la borra al final
node --no-warnings scripts/regresion-tema.mjs              # ídem; el modo oscuro: el interruptor y el contraste de cada texto en todas las pantallas (deja a los dos usuarios en claro)
node --no-warnings scripts/regresion-adjuntos.mjs          # ídem; cuelga adjuntos en dos trabajos del demo y los quita (deja un tenant `zza-…`)
node --no-warnings scripts/regresion-datos-empresa.mjs     # ídem; le carga y le vacía los datos de la empresa al demo y los restaura
node --no-warnings scripts/regresion-busquedas.mjs         # ídem; seis clientes «Zzbusq» en el demo por psql, restaurados al final (SOLO_A=1: solo la parte sin navegador)
node --no-warnings scripts/regresion-patentes.mjs          # ídem; da de alta «Zzpat Brasil» con una chapa brasileña y lo borra (SOLO_A=1: el espejo con la base y las roturas, sin navegador)
node --no-warnings scripts/regresion-og-tenant.mjs         # contra next dev + el seed (Playwright): la tarjeta de WhatsApp del tenant en el HTML, sin marca Fidelli
node --no-warnings scripts/og-tenants.mjs                  # ídem; crea cinco tenants zz-og-* (claro y oscuro, con logo PNG/WebP/JPG y sin logo), baja las seis tarjetas a docs/capturas/og/ y los borra
```

El primero rompe la vista de retención de dos formas —le saca el filtro de
tipo y le saca `security_invoker`— y verifica que la red **atrape las dos**.
El segundo rompe cada regla del módulo de gomería (22 roturas: cada motivo
apagado, el gate del módulo, el anti-spam, el beneficio, los CHECK, el RLS,
el tipo en Inicio…) con un `sed` sobre las líneas marcadas `-- @algo` de la
migración, y espera ver cada bloque de R16 en rojo. El tercero rompe R17,
R18 y R19 (seis roturas): un valor de `item_tipo` agregado al final del enum
sin `after`, un CHECK en `service_items` con la lista de los once renglones
de siempre, `vehiculos.clase` con default `'liviano'`, el alta que ignora
`p_clase`, `get_carton` que calla la clase y un trigger que la rellena al
editar. El cuarto rompe R20 (ocho roturas): el código del módulo con un
typo, el módulo a precio cero, el plan del demo de vuelta en el catálogo,
el semestral en su default de 10, el plan del demo al precio del seed, el
candado que deja pasar todo, y las dos del motivo. **La del motivo saca
las DOS defensas —el chequeo de la función y el `CHECK` de la tabla—
porque sacando una sola el invariante queda en pie y el bloque pasaría en
verde con razón**: una rotura que no rompe nada es una prueba que miente.
Son la prueba de que las pruebas sirven de verdad. El quinto rompe R21
(diez roturas): el borde de la gracia corrido un día, la ventana en cero,
el contador sin el `+1`, la exención bajada al 50, el interruptor manual
que deja de ganar, el reloj corriendo para los que están afuera, **el
segundo interruptor ignorado**, el candado del demo desarmado, el payload
como `security definer` y el módulo cobrado sin mirar el motivo. El
sexto rompe R22e: el parser del webhook apretado a exactamente dos partes,
con lo que la referencia del segundo intento (`sub:hasta:2`) deja de
encontrar la suscripción. El séptimo rompe R24 y el candado de R22 (catorce
roturas): la exención del 100% corrida al 101 y achicada a los dos estados
de cobranza —con lo que un trial bonificado vuelve a contar como venta por
cerrar—, los dos llamadores pasando un 0 en vez del descuento (que es la
forma más probable del bug: **el cuerpo de una función SQL no se valida al
aplicarla**, así que arreglar la función y olvidarse del llamador no hace
fallar ninguna migración), y los tres candados de `cresium_eventos`
bajados a `notice` de a uno. Tres de sus roturas no rompen nada visible y
por eso son las que importan: **la lista de columnas del candado de edición
acortada** (una lista se acorta sola en un refactor y deja `external_id`
editable sin que nada chille), **la ficha que deja de marcar a nadie** en
vez de marcar de más, y **los tres triggers bajados de `ALWAYS` a
`ORIGIN`**, que no cambia ningún comportamiento hasta que alguien escribe
`set session_replication_role = replica` — por eso R22g lo chequea contra
`pg_trigger.tgenabled` y no contra lo que la base hace. Y **dos van contra
el candado de edición en direcciones opuestas** —una que deja pasar todo y
una pasada de rosca que bloquea las seis escrituras del webhook— porque un
candado de evidencia se rompe por defecto Y por exceso, y el exceso rompe
el cobro sin dar un error visible. El octavo rompe R25 (diez roturas) y es de una clase distinta a
todas las anteriores: **la mitad de lo que R25 vigila es que NADA PASE**
mientras Cresium no conteste el largo máximo, el formato exacto y el tope
de cambios de alias. Una conducta que consiste en no hacer nada es
exactamente la que se rompe sin que nadie se entere, así que la primera
rotura es prender el interruptor, y la segunda es la verosímil: dejar el
chequeo pero correrlo DESPUÉS de validar la forma, con lo que un alias mal
formado se sigue rechazando —y la mitad de las pruebas sigue en verde—
mientras uno bien formado entra. **Dos de sus roturas no tienen
contrapartida y está escrito por qué**: sacarle el `where` al índice
parcial no rompe nada (dos NULL nunca colisionan en un unique) y sacarle
el `lower()` tampoco, porque el CHECK de formato rechaza las mayúsculas
antes de que el índice opine. Una rotura que no rompe nada es una prueba
que miente sobre lo que cubre, así que no se escribe: se escribe el
comentario que dice por qué no está. El noveno rompe R21g y R26 (doce roturas), y su rotura
central es de una clase que ninguna otra red podía atrapar: **la rama del que
nunca pagó movida de lugar**. Está guardada por `p_nunca_pago` y las catorce
llamadas literales de R21a/b/c pasan cinco argumentos, así que se la puede
poner arriba de `@activo`, arriba de `@exento` o abajo de `@borde` y las diez
roturas del reloj siguen en verde — puesta abajo del borde, el tenant nuevo
atraviesa la ventana de gracia entera, que es exactamente lo que el bloque
prohíbe. También rompe el `>` del plazo por un `>=` (con lo que un alta a las
23:50 tiene diez minutos), el alta que le prende el reloj a TODOS, y la
condición «y tarde» del primer pago, sin la cual un cliente viejo del que
nunca registramos un pago pierde días en su próxima renovación.

El décimo rompe R27 (diez roturas): `legal` sacado de `slug_reservado()`;
`aceptar_terminos()` como invoker (la puerta se cierra para todos) y
`aceptar_terminos()` que registra la fila en OTRO tenant que el de la
sesión —la forma en que una aceptación deja de ser una aceptación—; el
predicado que ignora la versión (subir `VERSION_LEGAL` no vuelve a pedirle
nada a nadie) y el predicado sin la exención del demo; los tres candados
de la evidencia bajados a `notice` de a uno y los tres bajados de `ALWAYS`
a `ORIGIN`; y el campo calculado de la sesión como definer, que con un
composite forjado devuelve las versiones del vecino (regla 18, probado con
`jsonb_populate_record`). Las escrituras de R27 corren en una
subtransacción que se deshace a propósito: las aceptaciones de prueba no se
pueden borrar —son evidencia— y no tienen por qué quedar.

El undécimo rompe R28, R29 y R30 (dieciséis roturas). Tres son de una
clase que vale nombrar: **el trigger de `landing_busquedas` que deja de
anular la patente lo frena la segunda defensa, el CHECK** —el bloque se
pone en rojo por esa vía y el script espera ese patrón, no "R28"—; **el
CHECK borrado no rompe nada visible** mientras el trigger esté, por eso
R28b lo mira en el catálogo; y **la purga que no exime al demo no cambia
nada** con la suscripción del demo activa, así que R29 cancela el demo
hace 13 meses adentro de su subtransacción, y recién ahí sacarle el `slug
<> 'demo'` a la purga se ve. Las demás: `cancelada_at` que no se escribe y
que no se limpia al reactivar; la purga que borra en simulación (la forma
más cara del bug); la que no deja evidencia; la que se lleva `pagos`; el
plazo corrido; el guard que deja pasar a un owner; el reloj programado en
real; y en la supresión, el guard abierto, la auditoría que no se escribe,
el sentinela del teléfono con dígitos y la función como invoker.

El duodécimo rompe R31, R32, R33 y R34 (cincuenta y cuatro roturas). Las catorce de R31: los tres candados de `tenant_eventos` bajados a `notice` de a uno; el trigger de pagos sin el envoltorio defensivo, con lo que el sabotaje del evento bloquea el cobro; `cerrar_dia()` que dice «cerrado» la segunda vez, la que pierde el chequeo de «ya cerrado» (el segundo cierre revienta por la PK) y la que cierra hoy; el MRR sin mensualizar y la exención corrida al 101; `es_activo()` mirando solo la columna sin el reloj; suspender sin motivo; el alta como trigger inmediato (nace sin plan) y el evento de módulo sin el motivo del override. Una de ellas encontró un `not like` con motivo null que pasaba en verde: por eso R31g compara con `is null or`. Y las nueve de R32: `salud_tenants()` sin la guarda; **la salud que decide «cobro vencido» por la fecha en vez de preguntarle a `estado_atencion()`** —la forma exacta en que la copia de la regla del 100% vuelve a entrar—; los dos cortes de actividad corridos (3 → 30 y 7 → 70); `trabajos_semanales()`, `metricas_plataforma()` y `resumen_admin()` de vuelta con el filtro `tipo = 'service'` (cada una por separado, porque las tres cuentan trabajos y cualquiera puede perder el tipo sola); y `indicadores_tenants()` con el MRR en cero y con la ventana de 30 días achicada a 7. Y las diez de R33: el CHECK de cierre y pérdida excluyentes borrado; `marcar_cierre()` que fija el origen SIEMPRE (pisa el que ya estaba); el embudo contando los cierres por período de cierre en vez de por cohorte, y el CAC dividido por los cierres de la cohorte; el CHECK del lunes borrado; los tres candados de `pedidos_calcos` bajados a `notice` de a uno; el contador de calcos en el máximo en vez de la suma; y la ventana de activación corrida a 8 días y el umbral bajado a 19. **`indicadores_tenants()` y `metricas_plataforma()` se redefinieron en `20260924102000`, así que las roturas de R32 las muerden de ese archivo** (es el caso del aviso de abajo). Y las veintiuna de R34 (bloque MÉTRICAS 4): `mrr_fin` leído del total de la plataforma en vez de Σ por tenant (la identidad deja de cerrar por construcción; en toda base local donde una prueba borró tenants el total conserva al fantasma); la comparación de plan/período/módulo siempre falsa (la lista cae en expansión); el evento `cambio_plan` sin mirar (el descuento renegociado cae en ajuste); la ventana del evento corrida del mes calendario a «entre fotos»; todo `a = 0, b > 0` como nuevo (la reactivación desaparece); las cohortes de logos y de ingresos devolviendo valores en meses no cumplidos, y el MRR inicial de una cohorte cuyo mes de alta no cerró; `suspension_reloj` como voluntaria; el listado con el estado del owner invertido, con el owner más nuevo en vez del más viejo y sin el escalón del plan para el módulo; el pulso contando solo `service` y sin la rama «cero trabajos»; `suscriptos_por_plan()` con la suscripción más vieja; `estado_owner()` con la regla invertida y con el owner más nuevo; y el candado de calcos con el `if` en false, bajado a `notice`, desactivado, y la puerta que deja la bandera prendida. **`metricas_plataforma()` se redefinió otra vez en `20260925101000` y `registrar_pedido_calcos()` en `20260925102000`: la rotura de R32f muerde el archivo de performance y la de R33g el del candado.**

El decimotercero rompe R35 (once roturas): la mecánica de vuelta a 24 horas —la más probable: alguien «unifica» el plazo—; el service y los neumáticos a 7 días (la pasada de rosca, que no da ningún error: solo afloja el cartón del dueño del auto); un tipo que se cae del `case` (sin `else`, `plazo_edicion()` devuelve null y sus trabajos nacen fijados; por eso R35a recorre el enum entero); las dos policies con el literal de 24 horas en vez de la función, que es la forma en que la base y el panel se contradicen sin ruido; el sello de `get_carton` midiendo 24 horas; `desbloquear_service()` abriendo 7 días; y las tres del `WITH CHECK` (`20260925120000`, muerde ese archivo con `M2`): **la ventana sacada del `WITH CHECK` de los renglones y de las ruedas —el hueco original, que ninguna pantalla acusa porque un INSERT evalúa solo esa mitad de la policy—** y el `WITH CHECK` de los renglones con el literal de 24 horas. No hay «ruedas con el literal»: los neumáticos se fijan a las 24 horas y la rotura no rompería nada, así que está el comentario y no la rotura. **`get_carton` se redefinió en `20260925110000` y otra vez en `20260926200000` (la suspensión por reloj): las roturas de R16i (neumáticos), R18 (pesado) y R35d (edición) que la muerden la sacan ahora de ese último archivo (`M_CARTON`).**

El decimocuarto rompe R36 (once roturas), y es el molde de una clase nueva: **la regla que vive en dos lados a la vez**. Del lado de la base: `get_landing` con el premio decidido por `l.activo` —la forma exacta en que estaba, y que con la suspensión por reloj derivada dejaba el premio prendido—; `get_carton` con el progreso y con el mensaje al escanear, cada uno por separado, porque cualquiera de las dos condiciones puede volver sola; **la vidriera apagada para el suspendido por reloj** (un `and es_activo(l)` en el where), que es el arreglo equivocado que la regla 8 prohíbe; la pasada de rosca del premio apagado también en gracia; el trigger de las órdenes que no cierra nada, el que cierra TAMBIÉN la PAID (se lleva la contabilidad) y el trigger borrado; `ciclo_tras_el_pago()` ignorando el `hasta` de la orden y, al revés, arrancando siempre desde hoy; y `cerrar_dia()` sin la rama de `reactivacion_reloj`. Del lado de TypeScript, la mitad que ningún `sed` sobre SQL puede ver: la regla del `hasta` (`periodoHastaDeLaOrden`) la rompe la sección 6 de `scripts/regresion-cresium-orden.mjs`, que se vio en rojo con la cuenta vieja (`vencimiento + período`: el vencido el 01/10 que paga el 20/11 compraba hasta el 01/11). R36 corre entero en una subtransacción que se deshace: el tenant, los pagos, las órdenes, las fotos y los eventos de prueba no quedan.

El decimoquinto rompe R37 (quince roturas), y dos de ellas se vieron en verde por la razón equivocada antes de existir de verdad: **el exento sin pago** cae en la voz `alta`, que pasado el plazo no manda nada, así que sacar la exención no cambiaba nada (el exento de la prueba tiene pago); y **el filtro de «afuera del reloj» está doblemente cubierto** (`is not null` y `<= current_date`), así que la rotura saca las dos condiciones o no es una rotura. Las demás: el suspendido a mano recibiendo emails; el 2 con `< 0` (el día 0 recibe el 1); el 1 con `< 7` (el borde no entra); el 3 decidido por nada; el alta con email intermedio y el alta con el 1 pasado el plazo; «nunca dos veces» sacado; los tres candados de `emails_cobranza` bajados a `notice` de a uno y los tres bajados a ORIGIN; el unique borrado; y la decisión grantada a `authenticated`. Y del lado de Node, dos regresiones más: `scripts/regresion-cobranza-emails.mjs` compila `lib/email/{marco,cobranza}.ts` con `tsc` a un temporal y rompe ocho cosas de las plantillas sobre una copia (el solo lectura prometido sin mirar `corta`, «hasta hoy» y «hasta mañana» al revés, el trial mandado a pagar, el monto sin punto de miles, el alias ignorado, fecha8 como fecha7, el pasado sin conjugar y el HTML sin escapar); y `scripts/regresion-avisos-cobranza.mjs` corre la ruta de punta a punta contra `next dev` y el doble de Resend (guarda, simular, primera corrida y segunda en cero, key inválida sin insertar y reintento, el que paga entre el 2 y el 3, el ciclo nuevo, el delete rechazado y el 500 sin `RESEND_API_KEY`), y se vio en rojo con la ruta simulando siempre. **`emails_cobranza` no se puede vaciar ni por la prueba**: esa regresión deja sus tenants (`email-run-*`), y `supabase db reset` es la única limpieza.

El decimosexto rompe R38 (dieciséis roturas), y dos de ellas enseñaron algo al escribirse. **La policy de inserción sin el gate por tipo NO rompía nada**, porque el vínculo de la mecánica adjunta se escribe con un UPDATE sobre la fila recién creada y el `WITH CHECK` de `services_edicion`, solo, ya frenaba al Basic — la rotura tuvo que sacar las dos policies a la vez, o el verde mentía. Y **la mecánica del día del canje solo puede contar con alcance `'todos'`**: con `'services'`, la sub-prueba del canje estaba en verde por el alcance y no por el `created_at`, así que R38f corre con `'todos'` y la rotura que la acusa es la del `clock_timestamp()` que nombra la regla 22. Las demás: `premio_disponible` de vuelta a `count(*)` (la más probable: alguien «arregla» el distinct) y `ciclos_fidelizacion` ídem (la copia que se olvida); el corte del ciclo pasado a la fecha; la mecánica adjunta con la fecha de hoy en vez de la del service, sin el vínculo, con sus renglones ignorados y con los pendientes reenviados a la recursiva (cada uno entra dos veces); la descripción mínima bajada a cero (el CHECK de la tabla frena igual, pero con otro error que el front no traduce); la adjunta colgando de una mecánica; `guardar_service` como `security definer`, que R38j ve en el catálogo antes de que R38d lo descubra por las malas; `actualizar_service` sin propagar a la adjunta (la visita se parte en dos al corregir un typo); y el vínculo por tres lados: el CHECK borrado, el trigger sin comparar el vehículo y el trigger sin exigir un service como destino.

El decimoséptimo rompe R39 (sesenta y ocho roturas) y tiene un compañero con navegador. Tres cosas enseñó al escribirse. **Una FK hacia `pedidos_calcos` rompía una prueba ajena**: con la referencia, `truncate pedidos_calcos` falla por la FK antes de que dispare su candado de purga, y R33f —que prueba ESE candado— dejó de ver su error; por eso `encargos_calcos.pedido_calcos_id` no tiene FK y la integridad la sostiene la puerta (R39b). **Varias reglas tienen dos defensas y la rotura saca las dos o no rompe nada**: el motivo del precio (el chequeo de la puerta y el CHECK de la auditoría), «una sola actual» y la versión correlativa del diseño (la puerta y su índice); borrar SOLO el índice no cambia nada, así que esa rotura no está y está el comentario. **Y otras las frena una segunda defensa con OTRO error**: enviado sin seguimiento (el CHECK), un extra aceptado como pack (el not null de la cantidad), el envío sin dirección (el CHECK): el bloque las acusa porque el error que llega es uno que el front no traduce. Las demás: la tabla de transiciones abierta por cuatro lados; el libro sin escribir, con otra cantidad y con monto cero; el índice de «un pendiente» borrado y sin el `where`; INSERT/UPDATE abiertos al owner, el costo grantado (encargo y catálogo), las cuatro lecturas sin el tenant, la subida al bucket abierta y la guarda de cada una de las cinco puertas; el candado de precios apagado, cojo (mira el precio y no el costo), deshabilitado y pasado de rosca, la auditoría que no se escribe y la que se escribe siempre, la bandera que queda prendida y un trigger que «sincroniza» los pedidos abiertos con el catálogo; los tres conteos de la alerta (los atrasados, en días corridos y con el corte corrido: un fixture a 7 días corridos, que son siempre 5 hábiles, es el que acusa los días corridos); la cola desordenada, sin filtro y con la ganancia sin comisión; los días hábiles contando el sábado, todo y el día de partida; y los cuatro CHECK. **`resumen_admin()` se redefinió en `20261003120000` para ganar la clave `calcos`: la rotura de R32g la muerde ahora de ese archivo (`M_CA` en `regresion-metricas.sh`).** El compañero, `scripts/regresion-calcos.mjs`, corre las pantallas con Playwright contra `next dev` y la base recién reseteada: sube un PNG y un PDF de verdad y un falso PNG (que se rechaza y no deja archivo), comprueba que la miniatura sale por URL firmada y que sin la firma no se baja, carga un incluido con retiro y otro con envío, los lleva hasta entregado desde la cola y desde la ficha, mira el contador y el libro, cancela uno cargado por error, y compara la comisión de `lib/calcos.ts` con la de la base. Se vio en rojo antes de que existiera una sola pantalla (21 fallas). **El libro no se borra ni por la prueba**: deja dos entregas en el demo local, y `supabase db reset` es la única limpieza.

Y el mismo script rompe R40 (veintitrés roturas más: noventa y una en total), con otro compañero con navegador. Lo que enseñó: **la trampa se prueba con el error crudo**. La rotura central es sacar la rama de calcos de `acreditar_deposito_cresium()`: la referencia `calcos:<uuid>` llega al cast de la renovación y el bloque se pone en rojo con «invalid input syntax for type uuid», que es textualmente el 500 del webhook; el script espera ESE patrón y no «R40». **Postgres evalúa los CHECK por orden alfabético de nombre**: una orden con las dos cosas y un período la frenaba `calcos_sin_periodo` antes que `orden_de_una_sola_cosa`, así que el caso de R40a va sin período. **Y dos roturas no están porque no rompen nada**: grantarle `acreditar_deposito_cresium()` o `vencer_encargos_calcos()` a `authenticated` deja el 42501 igual, porque las dos son invoker y una sesión no puede escribir ni `cresium_eventos` ni `encargos_calcos` (la segunda se escribió, se escapó, y se cambió por el comentario). Las demás: los tres CHECK de la orden; el uuid del encargo casteado sin mirarle la forma; el pago que no guarda la transacción y la rama «unificada» que escribe en `pagos`; la idempotencia sacada; el `PARTIAL` que paga; el webhook reviviendo cualquier estado y el que no acredita un vencido; el vencimiento que no vence nunca, que vence un día antes, que se lleva lo que no está sin pagar y que con un tenant vence el de todos; **`vencido → pagado` agregado a la tabla de `avanzar_encargo_calcos()`**; el mail que se reclama siempre y el soltar que no suelta; los dos lectores sin el filtro; y las guardas del mail y del catálogo. **`acreditar_deposito_cresium()` y `resumen_admin()` viven desde este sprint en `20261003200000`**: `regresion-cobranza-cresium.sh` (R22e) y `regresion-metricas.sh` (R32g, `M_CA`) las muerden de ahí —el primero, además, sacaba la función de `20260917000000`, que ya no era la vigente desde `20260917130000`—. El compañero es `scripts/regresion-calcos-tenant.mjs`: recorre los imports de Mi cuenta → Calcos y de sus mails buscando el m², compila los dos mails con `tsc`, y con los dobles de Cresium y de Resend levantados adentro del propio script hace el camino entero en 390 táctil —armar el pedido, la pantalla de pago con su alias, copiar, un depósito parcial, el completo que cambia la pantalla sola al éxito en menos de 10 s, el mail que sale una vez aunque Cresium reintente, el despacho desde `/fidelli` con su mail, «En camino» en el historial, entregado y el contador—; edita un precio en «Plan y precios»; vence un pedido y lo paga igual; fuerza el Reintentar, que sale con la referencia `:2`; y llama a la ruta del cierre diario de verdad, que vence el pedido que nadie volvió a mirar (sin el secreto del cron no toca nada). Se vio en rojo sin la pantalla (26 fallas), y la parte del cierre con la ruta sin la llamada que vence. Y `scripts/regresion-cresium-webhook.mjs` ganó el caso de calcos: sobre `develop`, sus cinco depósitos contestaban 500.

Y rompe R41 (sesenta y nueve roturas más: ciento sesenta en total), con un tercer compañero con navegador. Lo que enseñó: **dos roturas se escaparon la primera vez, y las dos por el fixture, no por la regla.** La de «una corrección del libro con fecha vieja suma al stock» la atrapaba otra afirmación antes de tiempo, porque en la prueba TODAS las filas del libro se cargaban hoy: la primera entrega tiene que estar cargada el día que pasó (que es lo que hace «Entregado»), y las demás hoy con fecha vieja (el backfill, una corrección). Y la del escalón de 1 semana (`p_semanas < 1`) no rompía nada con 8 calcos, porque a 8 calcos llega sola la cláusula de las 20: hizo falta un lubricentro con MÁS de 20 calcos y menos de una semana (30 autos nuevos por semana). **Y dos no están porque no rompen nada**: sacarle solo la guarda a `calcos_por_agotarse()` (adentro llama a `stock_calcos()`, que rechaza al owner en el primer tenant que no es suyo) y abrirle solo el UPDATE de `lubricentros` al owner (el candado de `calcos_propias` lo frena igual). Las demás: la cuenta contando trabajos, importados, anulados y los autos de antes de la entrega; la entrega contada por cuándo se cargó; el stock negativo; el recuento que no pisa la base, los autos de antes que siguen descontando, la entrega posterior que no suma, el recuento más viejo ganando y la puerta por tres lados; null en todo por dos lados; el ritmo sobre toda la historia, con menos de 2 semanas, siempre dividido por 8, y la cobertura con ritmo cero; los cinco umbrales del aviso, el aviso con un pedido abierto y la lista de estados abiertos por los dos lados; la lista del hub con el umbral corrido en las dos direcciones, con pedido abierto, con el suspendido y con el demo, y `sin_stock` que no cuenta la lista; los mails con pedido abierto, al suspendido, al demo, cayendo al escalón anterior, sin mirar el ciclo, con «la última entrega» que es la primera, repetido al día siguiente y con la entrega del día contada desde la medianoche; `calcos_propias` con el candado apagado, deshabilitado y bajado a ORIGIN, la bandera que queda prendida, y la puerta sin nota, sin guarda, sin evento y registrando lo que no cambió; los seis candados de los dos libros de a uno y a ORIGIN de a tres, y el unique borrado; y la guarda del stock sacada, **la misma guarda sin el `coalesce`** (un usuario sin lubricentro compara contra null, y `not (… or null)` es null, que un `if` deja pasar), la decisión de los mails grantada a `authenticated` —que acá sí rompe, porque es definer—, las dos funciones de adentro grantadas, y los dos libros con INSERT o con la lectura abiertos. **`resumen_admin()` vive desde este PR en `20261003210000`** (ganó `calcos.sin_stock`): la muerden de ahí `regresion-metricas.sh` (R32g, `M_CA`) y `regresion-calcos.sh` (R39f, R40j y R41g, `M_STOCK`). El compañero es `scripts/regresion-calcos-stock.mjs`: compila la frase del aviso, la regla de «no apilar» y los dos mails con `tsc`; arma en el demo el ejemplo del sprint (115 calcos, 22 autos nuevos por semana, 5 semanas) y lo lee en Mi cuenta → Calcos; corrige con «Contá y corregí»; mira que la miniatura mida 400 de ancho y no lo que mide el archivo, que conserve su proporción y que se vea ENTERA —el diseño de prueba es 4:5 y tiene un marco: se le saca una foto al `<img>` y se cuentan los marcos que cruza la fila y la columna del medio, dos y dos— (y que caiga al archivo si la transformación no contesta); ve aparecer el aviso del Inicio, lo cierra, comprueba que no vuelve y que vuelve a los 7 días, y que no está con un pedido abierto; entra con un lubricentro por vencer y comprueba que ve la barra de cobranza y NO el aviso de calcos; abre la alerta del hub y la lista con su WhatsApp, prende «Imprime por su cuenta» desde la ficha y ve desaparecer la estimación y aparecer la descarga; y llama a la ruta del cron de verdad con el doble de Resend. Se vio en rojo sin las pantallas (38 fallas). **`emails_calcos` no se puede vaciar ni por la prueba**: deja tres lubricentros `calcos-run-*`, y `supabase db reset` es la única limpieza.

El decimoctavo rompe R42 (sesenta y nueve roturas) y tiene un compañero con navegador. Lo que enseñó al escribirse: **una rotura se escapó por el fixture, no por la regla.** «`cajas_mes` del Inicio contando todos los tipos» pasaba en verde porque la prueba cargaba cajas de hoy y ningún trabajo de OTRO tipo de hoy: contar cajas y contar todo daba el mismo número. Hizo falta un service común, del mismo día, en el mismo escenario. **Tres roturas no están porque no rompen nada**, y está escrito en el encabezado del script: el badge con `true` en vez de `plan_permite('caja')` (la vista ya se gatea sola), un gate por feature en `items_escritura` (no existe, tampoco para la mecánica: la caja se gatea en la cabecera) y un renglón del cartón de aceite adentro de una caja (la base castea genérico a propósito, regla 14). **Cuatro se prueban con el error crudo**, porque las frena una segunda defensa con otro mensaje que el front no traduce: la caja sin kilómetros y el aceite de una letra sin su error nombrado (los frenan `caja_coherente` y `aceite_tipo_no_vacio`), la caja editada por la rama del service (`caja_coherente`) y `guardar_service` sin la rama (la caja nace como un service sin próximo y la frena `service_completo`). **Y una rotura documenta una decisión**: «el horizonte sobre la fecha de la última caja» es la lectura literal del pedido («igual que la de services») y deja afuera al auto con una sola caja de hace cinco años y medio, que es exactamente el cliente de un taller de cajas. Las demás: la feature mal escrita o metida en un plan, la categoría apagada o al final, los dos CHECK borrados, la vista sin `security_invoker`, la firma vieja de `actualizar_service` conviviendo con la nueva; las dos policies sin la condición y la función como definer; `caja_coherente` con cada una de sus seis condiciones sacada de a una y el espejo abierto a cada uno de los otros tres tipos; `cambiado` leído del jsonb (al guardar, al editar un renglón que ya estaba y al editar uno nuevo), el aceite que no baja, el salto con cada borde corrido para los dos lados, la edición que no escribe el próximo o no sincroniza, el plazo a 7 días y sin plazo; la vista sin el filtro de tipo, con las anuladas, con el ritmo o el odómetro medidos solo con cajas, con los tres umbrales corridos, sin horizonte y con el horizonte achicado, con el anti-spam por estado y sin ciclo, y sin la feature como puerta; `vista_proximos_service` y `vista_vehiculos` sin su filtro de tipo; el premio contando la caja con alcance `'services'` en cada una de las dos funciones; `get_carton` sin la clave; `cajas_mes` contando todos los tipos, las anuladas y los otros meses; la plataforma sin contar cajas, contando todo como caja, contándolas como service y sin el corte del mes; y el badge, la siembra y el backfill. **Ocho funciones se redefinieron en `20261004120100`** —`guardar_service`, `actualizar_service` (las dos cambiaron de FIRMA: reinstalar la vieja deja dos sobrecargas), `plazo_edicion`, `get_carton`, `contactos_por_hacer`, `sembrar_templates`, `resumen_inicio` y `metricas_plataforma`—, copiadas textuales con líneas agregadas: las muerden de ese archivo `regresion-visita.sh` (`M_CAJA`), `regresion-edicion.sh` (`M_PLAZO`, `M_CARTON`), `regresion-pesado.sh` y `regresion-neumaticos.sh` (`M_CARTON`; y `M_CAJA` para el badge, la siembra y el Inicio), `regresion-cobranza-suspension.sh` (`M_CARTON`) y `regresion-metricas.sh` (`M_CJ`). El compañero es `scripts/regresion-caja.mjs`: compila los helpers de la caja y las tarjetas del cliente con `tsc` y rompe doce reglas sobre una copia; comprueba que sin la feature no hay segmento, ni fuente, ni tarjeta, y que la RPC contesta 42501 por la API directa; prende la feature desde la ficha de `/fidelli` por su nombre; carga una caja en 390 táctil con filtro y lavado y 80.000 por default, la previsualiza, la confirma y mira lo que quedó en la base y en el stock; abre el detalle con su papel y cambia el ATF dentro de las 24 horas; carga otra a 1280 con «Otro» en el aceite y en el salto en un auto sin historia; mira en `/[slug]/[patente]` las dos tarjetas de uno y la tarjeta sola con su papel del otro; acerca un próximo por psql y lo ve aparecer en «A quién llamar» con su mensaje, lo tilda —y comprueba que el aviso del cambio de aceite del mismo auto no se movió— y lo destilda; mira la tarjeta del Inicio y el listado, y ABRE el Excel exportado (un zip de XML, leído con lo que trae Node) para comprobar el tipo, el ATF en la columna del aceite, el próximo en «Próx. caja» con la del próximo service vacía, los renglones por su nombre y sin «(cambiado)», y el ATF como «Aceite de caja» en la hoja de productos —y que esa columna no exista para el lubricentro sin la feature, esté siempre para el que la tiene y se conserve en un archivo con cajas aunque la feature se haya apagado—; y recorre 360, 390, 820 y 1280 midiendo el selector de cuatro en 2 × 2, los chips y los cuatro saltos en una fila. Se vio en rojo contra el front de `develop` (25 fallas), y lo del Excel contra la ruta de exportación de `develop` (6 fallas: sin la columna, y los renglones de la caja como «undefined: Filtro … (cambiado)»). **Toca el demo local y lo restaura**; con `DEJAR=1` lo deja prendido para mirarlo a mano.

El decimonoveno rompe R43 y R44 (cincuenta y ocho roturas) y tiene un compañero con navegador. Lo que enseñó al escribirse: **cinco roturas no están porque no rompen nada**, y las cinco por la misma razón —hay una segunda defensa—: la policy de alta abierta (al owner lo frena igual el tenant heredado, que con su sesión no encuentra el trabajo ajeno y queda en null), la edición y el borrado de la tabla sin tenant y el borrado del bucket sin carpeta (para tocar una fila hay que poder LEERLA, y la policy de lectura —que sí se rompe— no deja ver la ajena), y el alta por columnas probada fila por fila (la misma lista de privilegios la comprueba antes R43j, por catálogo). **Una rotura se ve por otro mensaje que el que uno escribiría**: el tope contado por tenant y no por trabajo salta en el intento de adjuntar a un trabajo AJENO, que deja de fallar por RLS y empieza a fallar por `tope_adjuntos`. **Y los helpers del bloque llevan su `grant execute` a `anon`**: en este proyecto `anon` no hereda el execute de las funciones nuevas, y la prueba de que anon no lee nada se llama con el rol de anon. Las demás: la tabla sin RLS, `anon` con lectura, el alta que deja mandar «Mostrar al cliente» o todas las columnas, la edición de todas o del nombre, el trigger del tope borrado, la FK sin cascada, el bucket público, con otro tope o con otro formato, **una policy del bucket para `anon` limitada a los visibles** (el atajo de la regla 25), el bucket sin su policy de subida, `adjunto_publico()` ejecutable por `anon` o sin definer y `adjuntos_huerfanos()` por un owner; el adjunto que nace visible, el que no queda a nombre de quien lo subió, el tenant del insert creído, **el alta, el borrado y el interruptor atados al plazo de edición** (la copia de `ruedas_escritura`), la ruta sin su CHECK o mirando solo la carpeta del tenant, el peso sin CHECK, a 10 MB y con el borde corrido, el formato y el nombre sin CHECK; el tope en 4, en 2, con otro error y salteado fuera de la sesión; la lectura sin tenant, el bucket sin carpeta en la lectura y en la subida, el borrado que no mira si el archivo está registrado y el que no deja borrar lo que no se registró; la puerta del cliente sin cada una de sus cuatro condiciones y con la patente sin normalizar; `get_carton` listando los ocultos, con la ruta, sin la clave, **sin `prox_caja_km`** y en el orden inverso; los huérfanos sin el margen, sin mirar la fila, sin filtrar el bucket y con el margen de un mes; y el slug sin el CHECK, con el tope en 33 y en 31, y `slug_estado()` con el tope viejo y con uno de menos. **`get_carton` vive desde este sprint en `20261004200000`**: la muerden de ahí `regresion-edicion.sh`, `regresion-pesado.sh`, `regresion-neumaticos.sh`, `regresion-cobranza-suspension.sh` y `regresion-caja.sh` (`M_CARTON` en los cinco). El compañero es `scripts/regresion-adjuntos.mjs`: compila `lib/adjuntos.ts` y los helpers del slug con `tsc` y rompe quince reglas sobre una copia; comprueba por la API directa que `anon` no lee la tabla, la función ni el bucket; en el detalle de un trabajo FIJADO, en 390 táctil, adjunta un PDF de 300 KB y una foto de 4 MB generada en el navegador —que sale a menos de 500 KB y el archivo del bucket mide 1600 × 1200—, ve rechazar un PDF de 2,5 MB y un .txt antes de subir y un HTML con nombre de PDF después (por sus bytes, y sin dejar el archivo), adjunta el tercero, y fuerza el cuarto por la pantalla y por la API; prende «Mostrar al cliente» en uno; mira en `/[slug]/[patente]` que el cliente ve solo ese —y uno del historial, a la vista con el papel cerrado—, debajo del papel y nunca adentro, que el HTML no tiene ninguna URL firmada, que la ruta contesta 302 a una URL que vence a los 60 segundos (lee el `exp` del token) y que llega el PDF entero, y 404 para el oculto, para otro auto, para otro lubricentro y para cualquier cosa; quita uno y comprueba que se fue la fila y el archivo; mira el clip del listado y abre el Excel por la columna «Adjuntos»; llega al detalle desde «Adjuntar el diagnóstico» del guardado; sube un archivo sin fila, lo envejece y llama a la ruta del cierre diario de verdad; escribe slugs en el alta y en Editar (y se saltea el tope del campo para ver el rechazo de la base); y recorre 360, 390, 820 y 1280. Se vio en rojo contra el front del service de caja (30 fallas). **Tres cosas que la hicieron fallar sin que el producto tuviera nada**, y quedaron escritas en el script: una corrida que cruza la medianoche compara contra el día en que se subió el adjunto, no contra «hoy»; la página del cliente contesta 404 si `get_carton` no responde —no distingue «no existe» de «no contestó»—, así que con el stack recién reseteado se reintenta SOLO ante un status que no es 200; y con la máquina cargada `next dev` tarda veinte segundos en una página, así que los tiempos de espera son generosos. **Toca el demo local y lo limpia**; lo único que deja es un lubricentro `zza-…` (para el Editar del slug), y `supabase db reset` es la única limpieza. **Y la dirección vieja de un lubricentro** (sección L, más cuatro roturas sobre `lib/slugs-anteriores.ts`: la entrada borrada, el redirect que toma solo la vidriera, el que pierde la patente y el temporal): pide el slug viejo con la vidriera, una patente, un adjunto y un parámetro, y espera el 301 con el `Location` entero. Corre apenas terminan los helpers, antes de tocar la base, porque solo necesita el servidor de Next. Se vio en rojo sin el redirect (404 en las cuatro).

El vigésimo rompe R45 (cuarenta y siete roturas) y tiene un compañero con navegador. Lo que enseñó al escribirse: **una rotura se escapó por la prueba, no por la regla** —con la lectura abierta a todos los tenants saltaba otro renglón (un `select` sin `where` que traía la fila del vecino), así que las lecturas del bloque nombran el tenant—. **Dos roturas no están porque no rompen nada**: la edición sin tenant (para editar una fila hay que poder leerla, y la policy de lectura —que sí se rompe— no deja ver la ajena) y la puerta que le cree el lubricentro al owner sumada a la RLS abierta (es la suma de dos que ya están). **Cuatro se prueban con el error crudo**, porque las frena una segunda defensa: el CUIT sin normalizar (lo rechaza la validación de la propia puerta), los textos sin recortar (el CHECK de la tabla) y las dos policies que se olvidan del superadmin (la RLS, adentro de la puerta). Las demás: la tabla sin RLS, `anon` con lectura, el owner que borra, el sello escribible por tres lados, la fila que se muda de tenant, el alta y la edición que no pueden escribir un campo, una policy de borrado, dos CHECK borrados, el trigger del sello borrado y deshabilitado, la FK sin cascada, y la puerta como definer, ejecutable por `anon` o sin execute; el upsert que conserva lo que no viene y el sello que no se pone; la clave mal escrita ignorada, el CUIT a medias y «al menos once», la condición de IVA y los largos sin validar, el tope corrido y el jsonb que no es un objeto; los seis CHECK aflojados de a uno; el sello que respeta el autor que le mandan y el que no pone la fecha; la lectura y el alta sin tenant y la puerta que le cree al owner; la puerta sin el «falta el lubricentro»; y la purga que no cuenta la tabla y la que no se la lleva. **`purgar_tenants_vencidos()` vive desde este PR en `20261004210000`** (dos líneas más: el conteo y el delete): `regresion-legal-datos.sh` la muerde de ahí (`M_PURGA_FN`). El compañero es `scripts/regresion-datos-empresa.mjs`: compila `lib/datos-empresa.ts` con `tsc` y rompe doce reglas sobre una copia (la razón social que se repite, la condición abreviada, las etiquetas, las líneas vacías, el orden, la máscara); **compara el presupuesto sin datos contra el de antes del cambio** —el stream de la página del PDF, byte a byte, y el HTML de la cabecera, guardados en `scripts/fixtures-presupuesto-sin-datos-empresa.json` con el front de `develop`: regenerar esa base (`GUARDAR_BASE=1`) sobre un cambio del encabezado es firmar ese cambio—; comprueba por la API directa que `anon` no lee ni ejecuta; en Mi cuenta, en 390 táctil, ve la tarjeta y su ayuda, la máscara del CUIT mientras se escribe, el CUIT a medias rechazado con el mismo mensaje que en clientes, el aviso del verificador, y guarda los datos de prueba; abre un presupuesto y lee las cinco líneas en el documento y **en el texto extraído del PDF** (con su posición: en orden, antes de la sucursal, empujando la grilla, sin llegar al bloque «PRESUPUESTO N°»), la razón social igual al nombre que no se repite, el dato suelto y el domicilio larguísimo que envuelve; vacía los datos y vuelve a comparar contra la base; los carga desde la ficha de `/fidelli` y los ve en el panel del tenant; apaga Presupuestos y la tarjeta desaparece; y recorre 360, 390, 820 y 1280. Se vio en rojo contra el front de `develop` (18 fallas). **Toca el demo local y lo restaura.**

El vigesimoprimero rompe R47 (seis roturas) y no tiene compañero con
navegador: lo que cambia es cuántas veces se pregunta, no qué contesta. Lo
que enseñó al escribirse: **la rotura es el catálogo, no una consulta
lenta** —medir el tiempo en una prueba es mentirse: a 50 filas la forma
vieja también tarda nada—, así que el bloque mira `pg_policies` y las seis
roturas reescriben una policy a la forma vieja (el `USING` de una tabla del
tenant, un `WITH CHECK`, `auth.uid()`, una policy nueva escrita como antes,
una del bucket) o vacían la red (el piso). **Y el bloque se vio en rojo
antes de la migración de verdad**: 118 expresiones en 85 policies, con la
base de `develop`. El `alter policy` de cada una es la expresión del
catálogo con la llamada envuelta y nada más, y se comprobó que el catálogo
de después, sin el envoltorio, es byte a byte el de antes.

El vigesimosegundo (`scripts/regresion-patentes.mjs`) no rompe un bloque
de SQL: rompe el ESPEJO. Lo que las patentes vecinas tienen de nuevo es que
la regla vive en dos lugares que no se ven —`patente_formato_valido()` en la
base y la lista de formas de `lib/texto.ts`— y nada en el build acusa que
se desvíen: la base aceptaría una chapa que el front rechaza, o al revés, y
el mecánico vería «no parece una patente» sobre una que la base guardaría
sin problema. Por eso la sección A2 genera las 224 formas posibles de 5, 6 y
7 caracteres (letra o número en cada lugar), se las pregunta a la base y al
front, y exige la misma respuesta forma por forma —y que las aceptadas sean
exactamente 13—. Las cuatro roturas van sobre una copia de `lib/texto.ts`:
un vecino sacado de la lista, un vecino metido entre los argentinos (con lo
que `ABC 1234` saldría sin esperar y `ABC 123` se buscaría a medio tipear),
el mínimo clavado en 6 (la moto chilena no se busca nunca) y el «principio
de» sacado (`AB123C` abre «¿De quién es?» antes de la D). Lo que enseñó al
escribirse: **dos ejemplos de «patente inválida» de R13 (`ABCD123`,
`1234ABC`) pasaron a ser Paraguay y Bolivia**, y el bloque viejo hubiera
quedado en rojo con razón; se movieron a R48, que los prueba del otro lado.
Y una de medición: **`page.type` con `delay` espera ese delay DESPUÉS de la
última tecla antes de resolver**, así que el instante de la última tecla
quedaba 70 ms tarde y los 300 ms del debounce se medían como 236; la última
letra se tipea sin `delay`. El compañero con navegador carga «ABC1D23» en
«Nuevo trabajo» (ninguna consulta antes de la última tecla, la consulta
después de los 300 ms, sin aviso), da de alta «Zzpat Brasil» con esa chapa,
la lee en la base y en `/demo/ABC1D23`, abre el alta con «BBB12» (cinco
caracteres), comprueba que «ABC123» sigue saliendo antes de los 250 ms —y
que «ABC12», válida en el medio, no se buscó porque el 3 llegó antes de los
300 ms— y ve el aviso con «ABCDE1». Se vio en rojo contra el `lib/texto.ts`
de `develop` (las nueve vecinas inválidas, el mínimo en 6) y contra sus
cuatro roturas. **Toca el demo local y lo restaura.**


El vigesimotercero rompe R49 (doce roturas) y tiene un compañero con navegador. Es el sprint en que la pareja service + mecánica aprendió a nacer también de un service de caja (`20261029200000`; lo pidió un taller con la caja prendida), y lo que enseñó al escribirse: **la rama de la caja en `actualizar_service` termina en su propio `return`**, así que la propagación de fecha, km y sucursal a la mecánica adjunta (`@propaga-visita`, escrita en la rama del service) no la alcanzaba —corregir la caja partía la visita en dos, sin ningún error—; el bloque va copiado en esa rama (`@propaga-visita-caja`) y la rotura que lo acusa es sacarlo. **Dos pruebas de R42 decían lo contrario de la regla nueva** («una caja no lleva adjunta»: R42b por la tabla y R42c por la función): la de la tabla pasó a ser el contracaso, deshecho enseguida para no mover los contadores de más abajo, y la de la función se fue (la pareja entera la prueba R49a). Las demás: la puerta de `p_mecanica` de vuelta a «solo en un service»; la mecánica adjunta con la fecha de hoy, sin el vínculo, con sus renglones ignorados, «ordenada» con `clock_timestamp()` y con los pendientes reenviados (la misma rama que R38, vista desde la caja); las dos policies sin el gate por tipo (un Basic con la feature caja cuela la mecánica adjunta); las dos funciones del premio de vuelta a contar filas (la pareja vale 2 con `'todos'`); y el trigger del vínculo de vuelta a exigir un service como destino (la pareja no nace: `vinculo_invalido`) y sin exigir nada (una mecánica se cuelga de un trabajo de gomería). **Lo que R38 ya rompe sobre la rama compartida no se repite** —es la misma línea de código—, y el CHECK del vínculo abierto a la caja sigue siendo de R42b. **`guardar_service`, `actualizar_service` y `services_validar_vinculo` viven desde este sprint en `20261029200000`** (copiadas textuales, con tres líneas cambiadas y el bloque nuevo): las muerden de ahí `regresion-visita.sh` y `regresion-caja.sh` (`M_PAR`), y las roturas de R38c y R38h cambiaron su `sed` por la línea nueva. Y una del script viejo: **`regresion-caja.sh` esperaba «de los 4 renglones» y con la diálisis son 5**, así que el patrón ya no cuenta. El compañero es `scripts/regresion-caja-mecanica.mjs`: prende la feature por SQL; en 390 táctil comprueba que el cartón de la caja ofrece «¿Se le hizo algo de mecánica?» (y el de una mecánica suelta no), que el teclado de la adjunta no repite el aceite de caja pero sí ofrece batería, líquido de frenos y refrigerante —que en el cartón de aceite se esconden—, que la previsualización muestra los DOS papeles con el plazo de cada uno y «Confirmar service de caja y mecánica», que el guardado dice «Service de caja y mecánica guardados» con «Ver la mecánica», y que en la base la pareja nació junta; a 1280 abre el detalle de las dos mitades («Misma visita» en las dos direcciones, nombrando el service de caja), el diálogo de anular de cada una, Editar la mecánica (el aviso que manda a editar el service de caja) y Editar la caja (corregir los kilómetros los copia a la mecánica); mira el historial del cliente; y a 360, 390, 820 y 1280 abre la pregunta en una caja sin scroll horizontal. Se vio en rojo contra el front de `develop` (el cartón de la caja no ofrecía la pregunta). **Toca el demo local y lo restaura.**

El vigesimocuarto rompe R50 (cuatro roturas) y tiene un compañero con navegador que es, más que una prueba, un instrumento. Las cuatro: `fijar_mi_tema` como invoker (sin policy de update, el interruptor dejaría de guardar), grantada a `anon`, con la validación sacada —«azul» lo frena igual el CHECK de la tabla pero con OTRO error, que el front no traduce, y el bloque lo acusa por eso; el CHECK borrado, solo, lo ve R50a en el catálogo— y sin la guarda de `auth.uid()` (le cambia el tema a TODOS). El compañero es `scripts/regresion-tema.mjs`: primero rompe ocho reglas estáticas sobre una copia del texto (el bloque claro de `globals.css` borrado o movido ANTES del oscuro, la impresión sin volver a claro, el lienzo que no sigue al panel, un `prefers-color-scheme` colado, un `text-white` sobre `bg-ink` de vuelta, el velo de vuelta a `ink/40`, un papel sin su `data-theme="claro"`); después, con el demo, toca el interruptor del sidebar a 1280 (pinta en el acto, la base guarda, al recargar sale oscuro desde la sesión, el logotipo pasa al gris, el lienzo es grafito y los controles nativos siguen), el de la hoja «Más» a 390 y el de la barra de `/fidelli`; y **mide la legibilidad**: en oscuro, a 1280 y a 390, en las 25 pantallas de `/panel` y las 14 de `/fidelli` (más el diálogo de anular y la hoja «Más»), compara cada texto visible con el fondo efectivo que tiene detrás —apilando los fondos con alfa desde el `html`— y exige AA (4,5:1; 3:1 para los grandes; los controles deshabilitados exentos, como en WCAG). Y mira que el cartón del detalle y el presupuesto sigan claros dentro del panel oscuro, y que en impresión el panel entero vuelva a claro. **Es la red de la próxima pantalla**: una tarjeta nueva con un color fijo se ve acá antes que en el celular de un taller. Se vio en rojo contra el front de `develop` (sin interruptor). **Toca el tema de los dos usuarios del demo y los deja en claro.**
El vigesimoquinto reescribe la rotura de R25 (`regresion-cobranza-alias.sh`, dieciocho roturas) y estrena la de R51 (`regresion-cvu-dedicado.sh`, catorce). Lo que enseñaron al escribirse: **dos mensajes de R25 contenían el token que su propio handler filtra** (`alias_sin_cvu`), así que la puerta vieja escribiendo el alias se veía en VERDE —el `raise` del bloque caía en el `when sqlstate 'P0001'` y se tragaba a sí mismo—; el texto de una afirmación no puede repetir el nombre del error que espera. **Tres roturas las frena una segunda defensa con OTRO error**, y el script espera ese error y no la letra: la puerta que no mira el CVU (el CHECK `cvu_formato`), la idempotencia del libro sacada (el unique de `transaccion_id`) y el resolver que resuelve dos veces (el unique de `pagos.cresium_transaccion_id`). **Y la rotura del `=` no es un `<=`**: con `<=` el anual coincide con dos períodos y R51d se pone en rojo antes de llegar al caso que la rotura quería ver; la que aísla R51e es una tolerancia (`abs(…) <= 1000`). También: una FK de `depositos_cresium.evento_id` hacia `cresium_eventos` rompía R22g (el `truncate` falla por la FK antes de que dispare el candado, el mismo caso que `encargos_calcos.pedido_calcos_id`), así que la columna no tiene FK. **`acreditar_deposito_cresium()` vive desde este sprint en `20261031100000`**: la muerden de ahí `regresion-cobranza-cresium.sh` (R22e) y `regresion-calcos.sh` (`M_CVU`). La sección 7 de `scripts/regresion-cresium-webhook.mjs` manda el DEPOSIT con los bytes reales sin `paymentOrder` y el CVU en `to`; su tenant de prueba QUEDA entre corridas (el libro no se borra) y los ids de transacción salen del reloj. Y el compañero con navegador, `scripts/regresion-cvu-dedicado.mjs`, levanta el doble adentro y hace el camino entero: la ficha emite la cuenta del demo con el alias propuesto (`fm.demo`), a 390 táctil y a 1280 el dueño elige mensual, «Quiero pagar» deja la orden interna (`cvu:…`, sin viajar a Cresium), la tarjeta dice «Transferí exactamente $X» con el alias fijo, el depósito exacto por el doble pasa la pantalla sola a «Al día» y mueve el vencimiento un mes, otro monto deja el aviso «lo estamos revisando»; y en `/fidelli` la alerta del hub, la lista de Cobranzas, acreditar uno a un período y descartar otro con nota. **Deja al demo con cuenta, pagos y filas en el libro**: `supabase db reset` es la única limpieza.

⚠ Y DOS DE ESTOS SCRIPTS APUNTAN A MÁS DE UNA MIGRACIÓN, porque
`estado_cobranza`, `reloj_cobranza` y `crear_lubricentro` se redefinieron en
migraciones posteriores a las que las crearon. Un script que las extrae del
archivo VIEJO reinstala la firma vieja, queda una sobrecarga y todas las
llamadas contestan «is not unique»: el script dice «SE ESCAPÓ» por una razón
que no tiene nada que ver con la regla, y el guard del sed no lo ve porque el
sed sí muerde. Se vio en rojo. **Cuando redefinas una función que algún script
de regresión muerde, buscá su nombre en `scripts/` y actualizá el `M`.**

Se corren antes de un release, no en cada cambio, y **un bloque nuevo de la red
trae su rotura en uno de estos scripts**.

Y en cualquier momento, a mano:

```sql
select * from verificar_seguridad_vistas();
```

Sin filas = está bien. Con filas = hay un agujero, y cada fila trae el SQL
exacto para taparlo.

---

## Git

Ramas `feat/*`, `fix/*`, `chore/*` → PR a `develop`. Conventional Commits, en
español (los comentarios del código están en español). Ver `CONTRIBUTING.md`.

`main` es producción y se toca solo en la fase de deploy.

@CLAUDE-landing.md
