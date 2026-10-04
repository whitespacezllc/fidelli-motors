// ============================================================
// La grilla de «A quién llamar» — UNA plantilla, en UN lugar.
//
// El encabezado y cada fila son grillas APARTE (cada <li> es la suya), así
// que solo quedan alineados si todas resuelven las mismas columnas. Dos
// cosas lo rompían sin dar ningún error, y por eso la plantilla vive acá y
// no copiada en dos archivos:
//
//   · Ninguna columna se mide por su contenido. Ni `auto`, ni `1fr` a
//     secas (que es `minmax(auto, 1fr)`): con la acción en `auto`, la
//     columna medía 44 px en la fila del WhatsApp, 88 en la de «Cargar
//     teléfono» y cero en el encabezado, y los títulos quedaban corridos.
//     Toda columna es un largo fijo o `minmax(<largo>, <n>fr)`.
//   · La tabla tiene que entrar en lo que le queda a la tarjeta, que es la
//     ventana menos 256 del menú, 64 del margen, 42 de su borde y su
//     padding, y los 17 de la barra de desplazamiento de Windows —la media
//     query no la descuenta: a 1280 de ventana rige `xl` con 1263 de
//     contenido—. Son 645 px a 1024, 901 a 1280 y 1046 de tope.
//
// De 1024 a 1279 (`lg`) las ocho no entran en un renglón: van cinco
// columnas de dato arriba —cliente · vehículo · último service · próximo ·
// retorno— y abajo el estado, el contactado y la acción, en el mismo
// orden de lectura. Mínimo 576 + 4 × 12 = 624. Desde 1280 (`xl`), las ocho
// en un renglón: 812 + 7 × 12 = 896.
//
// Los mínimos salen del contenido: «07/05/2026 · 104.200» mide 161 px,
// «1.235.500» 77, «faltan 1.200 km» 108, el chip NEUMÁTICOS 103, la
// patente 85, y «Cargar teléfono» en dos renglones 85. Lo que sobra se lo
// reparten el cliente, el vehículo, el último service y el retorno.
//
// Las cinco primeras columnas están escritas dos veces, y tienen que decir
// lo mismo: Tailwind lee las clases del texto del archivo, así que una
// clase armada con una variable no genera nada.
//
// Lo vigila scripts/regresion-proximos-grilla.mjs.
// ============================================================
export const GRILLA_PROXIMOS = [
  "lg:grid lg:gap-x-3 lg:gap-y-1",
  "lg:grid-cols-[minmax(7.5rem,1.4fr)_minmax(6rem,1fr)_minmax(10.5rem,1.3fr)_5rem_minmax(7rem,0.95fr)]",
  "xl:gap-y-0",
  "xl:grid-cols-[minmax(7.5rem,1.4fr)_minmax(6rem,1fr)_minmax(10.5rem,1.3fr)_5rem_minmax(7rem,0.95fr)_6.5rem_2.5rem_5.75rem]",
].join(" ");

// El contactado: en `lg` ocupa dos columnas del renglón de abajo (el check
// va con su etiqueta); en `xl`, la del check y la de la acción —el título
// mide 89 px y el check 20—. Lo llevan el título y la celda.
export const LUGAR_CONTACTADO = "lg:col-span-2";

// En `xl` las celdas del check y de la acción son `display: contents`: lo
// que tienen adentro pasa a ser ítem de la grilla, para que un mensaje (el
// motivo del WhatsApp apagado, un error al guardar) tenga su renglón
// entero debajo de la fila en vez de estirar una columna de 40 px. Por eso
// el check y la acción dicen su columna: un mensaje en el medio correría
// al que viene después.
export const LUGAR_CHECK = "xl:col-start-7 xl:row-start-1";
export const LUGAR_ACCION = "xl:col-start-8 xl:row-start-1 xl:justify-self-end";
export const LUGAR_MENSAJE = "xl:col-span-full xl:justify-self-end xl:text-right";
