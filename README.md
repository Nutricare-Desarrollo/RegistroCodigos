# RegistroCodigos — Solicitud de Creación de Código de Artículo

Aplicación web para registrar solicitudes de creación de códigos de artículo,
con autenticación **SSO de Microsoft (Entra ID)** y base de datos
**Azure Database for PostgreSQL**.

## Arquitectura

- **frontend/** — Sitio estático (HTML + JS). Grid de registros, formulario por
  secciones, listas desplegables gestionables y exportación a Excel.
- **api/** — API en **Azure Functions (Node.js v4)**. Expone `/api/*` y conecta a
  PostgreSQL con el paquete `pg`.
- **database/** — Scripts PostgreSQL: `RegistroCodigos.sql` (módulo Códigos) y
  `OrdenPedido.sql` (módulo Órdenes de Pedido), con esquema (`cat`/`dbo`) y datos semilla.
- Hospedaje en **Azure Static Web Apps** (plan gratuito), que además gestiona el
  login con Entra ID sin código propio.

```
Navegador  ─►  Static Web Apps (SSO Entra ID)  ─►  /api (Azure Functions)  ─►  Azure Database for PostgreSQL
```

## Endpoints de la API

| Método | Ruta                         | Descripción                          |
|--------|------------------------------|--------------------------------------|
| GET    | /api/me                      | Usuario autenticado                  |
| GET    | /api/catalogos               | Todas las listas desplegables        |
| POST   | /api/catalogos/{tipo}        | Agregar opción a un catálogo (`parent` en los jerárquicos) |
| PUT    | /api/catalogos/{tipo}/{valor}| Editar opción (`parent` en el cuerpo acota al nivel superior) |
| DELETE | /api/catalogos/{tipo}/{valor}| Eliminar opción (`?parent=` acota; bloquea si está en uso) |
| GET    | /api/solicitudes             | Listado de registros                 |
| GET    | /api/solicitudes/{id}        | Un registro completo                 |
| POST   | /api/solicitudes             | Crear registro                       |
| PUT    | /api/solicitudes/{id}        | Actualizar registro                  |
| DELETE | /api/solicitudes/{id}        | Eliminar registro (códigos)          |
| POST   | /api/grupo-centros/{grupo}   | Ligar un Centro de Costo a un Grupo Artículo (`{centro}`) |
| DELETE | /api/grupo-centros/{grupo}/{centro} | Desligarlo del grupo          |
| GET    | /api/catalogos-ordenes       | Listas del módulo de órdenes         |
| POST/PUT/DELETE | /api/catalogos-ordenes/{tipo}[/{valor}] | Mantenimiento de opciones (órdenes) |
| GET    | /api/ordenes                 | Listado de órdenes de pedido         |
| GET    | /api/ordenes/{id}            | Una orden completa                   |
| POST   | /api/ordenes                 | Crear orden                          |
| PUT    | /api/ordenes/{id}            | Actualizar orden                     |
| DELETE | /api/ordenes/{id}            | Eliminar orden                       |
| GET    | /api/adjuntos/{modulo}/{id}  | Lista de archivos adjuntos del registro (sin contenido) |
| GET    | /api/adjuntos/{modulo}/{id}/{adjuntoId}/contenido | Devuelve un archivo (`?download=1` fuerza descarga) |
| POST   | /api/adjuntos/{modulo}/{id}  | Agregar un archivo al registro (base64) |
| DELETE | /api/adjuntos/{modulo}/{id}/{adjuntoId} | Quitar un archivo (solo Compras/Administrador) |
| GET    | /api/cargas                  | Cargas de Excel (`?estado=Pendiente|Registrada`), más reciente primero |
| POST   | /api/cargas                  | Crear una carga con sus códigos pendientes |
| GET    | /api/cargas/{id}             | Cabecera + códigos de una carga      |
| DELETE | /api/cargas/{id}             | Eliminar la carga y sus pendientes   |
| PUT    | /api/cargas/{id}/codigos/{detId} | Corregir un código pendiente     |
| DELETE | /api/cargas/{id}/codigos/{detId} | Quitar un código de la carga     |
| POST   | /api/cargas/{id}/procesar    | Registrar los códigos marcados (`{ids:[…]}`) |

## Puesta en marcha

### 1. Base de datos (Azure Database for PostgreSQL)
1. Crear un **Azure Database for PostgreSQL Flexible Server** (para mínimo costo:
   tamaño *Burstable B1ms*; se puede detener cuando no se use). Crear la base
   `RegistroCodigos`.
2. Ejecutar, en orden, los scripts de `database/` con `psql` (o pgAdmin / Azure Data
   Studio). Los base (`RegistroCodigos.sql`, `OrdenPedido.sql`) crean esquemas, tablas y
   catálogos; las migraciones `V2` a `V9` son idempotentes y no destructivas (se pueden
   correr sobre una base con datos). `V4_Adjuntos.sql` crea la tabla `dbo.Adjunto` (archivo
   por registro en base64):
   ```bash
   psql "host=<servidor>.postgres.database.azure.com port=5432 dbname=RegistroCodigos user=<usuario> password=<clave> sslmode=require" -f database/RegistroCodigos.sql
   psql "host=<servidor>.postgres.database.azure.com port=5432 dbname=RegistroCodigos user=<usuario> password=<clave> sslmode=require" -f database/OrdenPedido.sql
   psql "host=<servidor>.postgres.database.azure.com port=5432 dbname=RegistroCodigos user=<usuario> password=<clave> sslmode=require" -f database/V2_Estado_Roles.sql
   psql "host=<servidor>.postgres.database.azure.com port=5432 dbname=RegistroCodigos user=<usuario> password=<clave> sslmode=require" -f database/V3_Ajustes_Codigos_Ordenes.sql
   psql "host=<servidor>.postgres.database.azure.com port=5432 dbname=RegistroCodigos user=<usuario> password=<clave> sslmode=require" -f database/V4_Adjuntos.sql
   psql "host=<servidor>.postgres.database.azure.com port=5432 dbname=RegistroCodigos user=<usuario> password=<clave> sslmode=require" -f database/V5_Conversiones.sql
   psql "host=<servidor>.postgres.database.azure.com port=5432 dbname=RegistroCodigos user=<usuario> password=<clave> sslmode=require" -f database/V6_Modelo_Marca_Adjuntos_Multiples.sql
   psql "host=<servidor>.postgres.database.azure.com port=5432 dbname=RegistroCodigos user=<usuario> password=<clave> sslmode=require" -f database/V7_Cargas.sql
   psql "host=<servidor>.postgres.database.azure.com port=5432 dbname=RegistroCodigos user=<usuario> password=<clave> sslmode=require" -f database/V8_Justificacion.sql
   psql "host=<servidor>.postgres.database.azure.com port=5432 dbname=RegistroCodigos user=<usuario> password=<clave> sslmode=require" -f database/V9_Grupo_CentroCosto.sql
   ```
3. En **Redes / Firewall** del servidor, permitir "Servicios de Azure" y tu IP.

### 2. Registrar la app para SSO (Entra ID)
1. Portal de Azure → **Microsoft Entra ID → App registrations → New registration**.
2. Redirect URI (Web): `https://<tu-sitio>.azurestaticapps.net/.auth/login/aad/callback`.
3. Anotar **Application (client) ID** y **Directory (tenant) ID**; crear un
   **client secret**.

### 3. Static Web App
1. Portal → **Create a resource → Static Web App**. Conectar este repositorio de
   GitHub; usar `frontend` como *App location* y `api` como *Api location* (el
   workflow lo crea Azure automáticamente al conectar el repositorio).
2. En **Configuration** (App settings) de la Static Web App, agregar:
   - `AAD_CLIENT_ID`, `AAD_CLIENT_SECRET`
   - `PG_HOST`, `PG_PORT`, `PG_DATABASE`, `PG_USER`, `PG_PASSWORD`, `PG_SSL`
3. En `frontend/staticwebapp.config.json`, reemplazar `<TENANT_ID>` por tu tenant.

### 4. Desarrollo local (opcional)
```bash
cd api
npm install
cp local.settings.json.example local.settings.json   # completar credenciales
npm start
# En otra terminal, servir el frontend con la SWA CLI:
npx @azure/static-web-apps-cli start frontend --api-location api
```

## Archivos adjuntos por registro

Un registro (Códigos u Órdenes) admite **varios** archivos, guardados en la base de datos
en **base64** (tabla `dbo.Adjunto`). Se pueden adjuntar tanto al **crear** el registro
—se eligen en el formulario y se suben en cuanto el registro obtiene su Id— como al
**editarlo**. Se muestran en una tabla con **Fecha y hora**, **Usuario**, **Archivo** y las
acciones Ver / Descargar / Eliminar.

Si el archivo es **PDF o imagen** se puede **Ver** en el navegador; si es **Word/Excel** (u otro
no visualizable) solo se **Descarga**. En un registro en solo lectura (Procesado visto por el
rol General) se puede Ver/Descargar pero no agregar.

- **Tipos permitidos:** PDF, imagen (png/jpg/gif/webp/bmp/tiff), Word (doc/docx) y Excel (xls/xlsx/csv).
- **Tamaño máximo:** constante `MAX_MB` (hoy **5 MB**) por archivo.
- **Cantidad máxima:** constante `ADJ_MAX_POR_REGISTRO` (hoy **20** archivos por registro; `0` = sin límite).
- Para cambiar cualquiera de los dos límites, edite la constante en **`api/src/index.js`** y en
  **`frontend/index.html`** y vuelva a desplegar. La columna `Contenido` es `TEXT`, así que no
  requiere cambios en la base de datos.
- **Permisos:** todos los roles autenticados pueden subir y ver; **eliminar** un adjunto queda
  restringido a **Compras** y **Administrador**.

## Modelo y Marca (Procesos Estadísticos)

`Modelo` es una **lista desplegable**; se gestiona desde **Catálogos → Modelos**, o con el
botón **＋** junto al campo (visible solo para **Compras** y **Administrador**).

`Marca` es una **caja de texto libre** (máximo 150 caracteres): el usuario escribe el valor,
no se elige de una lista y no depende del Modelo. Se guarda en la columna de texto
`dbo.Solicitud.Marca` y el guardado deja `MarcaId` en `NULL`.

- El catálogo `cat.Marca` y sus endpoints **siguen existiendo** en la base y en la API, pero
  el módulo de Códigos ya no los usa; no hace falta ninguna migración para este cambio.
- Los registros anteriores al cambio conservan su `MarcaId`: la lectura hace
  `COALESCE(ma.Nombre, s.Marca)`, así que muestran el nombre del catálogo hasta que se
  vuelvan a guardar, momento en que pasan a texto.
- La migración `V6` había convertido los valores de texto en registros de catálogo. Las
  columnas de texto `Solicitud.Modelo` y `Solicitud.Marca` **no se eliminaron**, que es lo
  que permite volver a texto sin tocar la base.

## Plantilla de Excel con listas desplegables

El botón **⬇ Descargar plantilla** (modal *Subir Excel*) genera un `.xlsx` en el que los campos
que en el formulario son lista **también son lista desplegable en Excel** (validación de datos),
en los dos módulos. Así el usuario no tiene que adivinar cómo se escribe cada valor del catálogo,
que era la causa más común de códigos con error en la bandeja de cargas.

El archivo tiene dos hojas:

- **Plantilla** — la primera, y la única que lee la importación. Solo la fila de encabezados, con
  el **texto exacto** de las etiquetas del formulario. No se les puede agregar un asterisco ni
  ninguna marca: `importHeaderMap()` los busca por ese texto.
- **Listas** — oculta (`veryHidden`), con los valores de los catálogos: **una columna por lista**.
  `Unidad de Inventario`, `Unidad de Compra` y `Unidad de Venta` comparten la columna de `unidades`.
  En **Códigos** lleva además los bloques y las columnas resolutoras de la cascada (abajo).

Las validaciones de lista simple son una **referencia a un rango** (`Listas!$D$2:$D$40`); las de los
cuatro campos en cascada son un **`INDIRECT`**, que también resuelve a una referencia.

### Cascada en la plantilla de Códigos

Los campos dependientes muestran **solo los valores del padre que tenga esa fila**:

| Campo | Se acota por | Fuente del mapa |
|---|---|---|
| Línea | Departamento | `dept_lines` |
| Familia | Línea | `familias` |
| Grupo Artículo | Departamento | `grupo_by_dept` |
| Centro de Costo | Grupo Artículo | `grupo_centros` (relación `V9`) |

**Órdenes de Pedido no tiene cascada** porque no tiene campos jerárquicos (`m.hier` va vacío):
el mismo código corre en los dos módulos y ahí simplemente no encuentra relaciones.

Un desplegable **vacío** significa que falta el padre en esa fila, que el valor del padre no está en
el catálogo, o que ese padre no tiene hijos registrados. Es a propósito: obliga a llenar la fila de
**izquierda a derecha** y no deja armar una combinación que la API va a rechazar después.

La única excepción es **Centro de Costo**: un Grupo Artículo **sin centros ligados** apunta al
catálogo **completo**, no a una lista vacía — la misma regla del formulario (ver *Centro de Costo*).
Si no, `Cuidado Crónico`, que hoy no tiene ninguno, dejaría la columna imposible de llenar.

#### Cómo está armado

La fuente de una validación de lista tiene que resolver a una **referencia**. Eso es lo que hizo
fracasar el intento anterior, que armaba la lista del hijo con `IFERROR(OFFSET(…MATCH…COUNTA…))`:
`IFERROR` devuelve un *valor*, no una referencia, y **Excel de escritorio rechaza esa fórmula**. El
daño no se quedaba ahí — al encontrar una validación inválida Excel **descarta esa y todas las que
vienen después en el archivo**, así que se perdía el desplegable en Línea, Familia, Grupo Artículo,
Centro de Costo y todos los campos siguientes.

La solución es sacar el trabajo sucio **fuera** de la validación, a celdas normales de la hoja
`Listas`, donde cualquier fórmula es legal. En `Listas`, por cada relación se escribe un **bloque**
con una columna por valor del padre:

```
fila 1   el valor del padre                  CO.EQ._ESPECIALIDADES_QUIRÚRGICAS
fila 2   el rango de sus hijos, como TEXTO   Listas!$O$3:$O$4
fila 3+  los valores hijos                   Ortopedia / Terapias Quirúrgicas
```

Los padres **sin hijos no entran** en el bloque, así que el `MATCH` les falla igual que a una celda
vacía. Y por cada campo dependiente va una columna **resolutora**, alineada fila a fila con la
Plantilla (resolutora fila *N* ↔ Plantilla fila *N*):

```excel
=IFERROR(INDEX(Listas!$N$2:$O$2, MATCH(Plantilla!$C2, Listas!$N$1:$O$1, 0)), "")
```

Devuelve el texto del rango que le toca a esa fila, o `""`. La validación queda entonces en:

```excel
INDIRECT(Listas!$P2)
```

La fila va **relativa** (`$P2`, no `$P$2`), así Excel la corre junto con la fila de la plantilla a lo
largo de todo el rango de la validación. Con `""`, `INDIRECT` da error y el desplegable sale vacío.

- Es **`INDEX`/`MATCH`, no `OFFSET`**: nada volátil. Son `TPL_ROWS` fórmulas por campo dependiente,
  y el rango de la fila 2 lo calcula el código al generar el archivo, no una fórmula.
- El libro se guarda con **`fullCalcOnLoad`** (ahora en los dos módulos, antes solo en Órdenes): sin
  eso Excel arma las listas antes de calcular las resolutoras y el primer despliegue sale vacío.
- Las relaciones jerárquicas se leen de **`m.hier`** (padre + mapa padre→hijos), así que agregar un
  nivel en `MODULES`/`loadCatalogsFor` no obliga a tocar el generador. `Grupo Artículo → Centro de
  Costo` va aparte porque no es jerarquía de catálogo, es la tabla de relación de `V9`.
- Verificado con el archivo generado: los cuatro `INDIRECT` sobreviven un round-trip completo y las
  resolutoras devuelven el rango correcto en los cinco casos (padre válido, padre sin hijos, padre
  fuera del catálogo, fila vacía y grupo sin centros ligados).

#### Lo que la cascada NO resuelve

- **Cambiar el padre no borra el hijo.** Si alguien llena Departamento, Línea y Familia y después
  cambia el Departamento, los valores viejos se quedan escritos: Excel no puede vaciar una celda
  solo. Se corrige a mano, o lo agarra la validación de la carga con el motivo a la vista.
- **Pegar filas copiadas se salta la validación.** Eso Excel no lo puede impedir.
- **`familias` está indexado por nombre de Línea**, y el mismo nombre puede existir bajo dos
  Departamentos: en ese caso la lista de Familia trae las de ambos. Es exactamente lo que ya hace el
  formulario, que lee el mismo mapa.

Por eso la **API sigue validando** la coherencia padre/hijo al procesar la carga: es la única defensa
real, la cascada solo evita el error antes de que llegue.

### Órdenes: Unidades x Caja y Total de Unidades calculados

En la plantilla de **Órdenes de Pedido** esas dos columnas no se digitan, igual que en el
formulario: van como **fórmula de Excel** y la hoja se entrega **protegida** para que no se pisen.

- **Unidades x Caja** — `IFERROR(VLOOKUP($A2, <tabla de conversiones>, 2, FALSE), "")`. La hoja
  `Listas` lleva un bloque *producto → unidades por caja* con **solo los productos que tienen
  conversión registrada**, así que para el resto el `VLOOKUP` falla y la celda queda **vacía** —
  el mismo resultado que en el formulario, que remite a **Conversiones**.
- **Total de Unidades** — `IF(N($C2)*N($D2)=0,"",N($C2)*N($D2))`. El `N()` vuelve `0` el `""` que
  dejan las fórmulas vacías, así que sin Cajas o sin conversión el total queda vacío en vez de
  mostrar `0`.
- La **protección va sin contraseña**: se desprotege desde *Revisar → Desproteger hoja* si hace
  falta un ajuste manual. Con la hoja protegida, **pegar un bloque que pise esas dos columnas
  queda rechazado** por Excel — que es justamente lo que evita perder las fórmulas.
- El libro se guarda con `fullCalcOnLoad`, así que Excel recalcula al abrir.

Como las fórmulas llegan hasta la fila `TPL_ROWS`, SheetJS devuelve ~999 filas al leer el archivo
subido (todas con el `""` de las fórmulas). `onImportFile()` **recorta las filas vacías del final**
antes de importar; si no, el contador decía *"Procesando 1 de 999"* y el resumen reportaba
cientos de filas vacías.

- La validación cubre las filas **2 a `TPL_ROWS`** (hoy **1000**), constante en `frontend/index.html`.
- Es **bloqueante** (`errorStyle: stop`): Excel no acepta un valor fuera de la lista. Aun así, **pegar
  filas copiadas salta la validación** — eso Excel no lo puede impedir, así que la API sigue validando
  los valores al procesar la carga.
- Las listas simples son referencias directas y las de la cascada un `INDIRECT` a una celda, las dos
  formas que Excel admite como fuente: los desplegables funcionan igual en **Excel de escritorio**,
  **Excel en el navegador** y **WPS**.
- La plantilla se genera con **ExcelJS** (`exceljs.min.js` por CDN) porque **SheetJS en su versión
  gratuita no puede escribir validaciones de datos**. SheetJS se sigue usando para **leer** el archivo
  subido y para **exportar** el grid; son dos librerías con dos trabajos distintos.

## Cargas de Excel (bandeja de códigos)

En **Creación de Códigos**, el Excel ya **no crea los registros de inmediato**: queda como una
**carga** en la pantalla **Cargas de Excel**, con sus códigos en estado *Pendiente*. Órdenes de
Pedido mantiene la carga directa de siempre.

Se entra desde el **botón "📥 Cargas de Excel" que está junto a la pestaña "Procesadas"**, sobre
el listado de Creación de Códigos (no está en el menú lateral, porque la bandeja pertenece a ese
módulo). El botón solo lo ven **Compras** y **Administrador**, y muestra en rojo la cantidad de
cargas que tienen códigos sin registrar. Desde la bandeja se vuelve con **← Volver al listado de
códigos**, que además refresca el listado por si se acaban de registrar códigos.

El grid de cargas muestra **Fecha, Hora, Usuario, Archivo, cantidad de códigos y Estado**,
ordenado del más reciente al más antiguo, con **fila de filtros** como los demás grids:
rango **Desde/Hasta** en Fecha y filtro de texto ("contiene") en Hora, Usuario y Archivo.
Códigos y Estado no llevan filtro (la cantidad no se busca por texto y el estado lo define la
pestaña). El pie indica **"N cargas de M"** con un enlace **Quitar filtros** cuando hay alguno
aplicado, y los filtros se limpian al salir y volver a entrar a la pantalla.

Tiene dos pestañas:

- **Pendientes de registrar** — cargas a las que les queda al menos un código sin registrar.
- **Histórico registrado** — cargas cuyos códigos ya se registraron todos. Una carga pasa
  sola de una pestaña a la otra: el estado se **deriva** de sus códigos (vista `dbo.vCarga`),
  no se guarda, así que no puede quedar desincronizado.

Al entrar a una carga se listan sus códigos con **Código de Producto, Nombre, Departamento,
Familia, Grupo Artículo y Centro de Costo**; el botón **✏️** abre un modal con el resto de la
información (los campos de lista sugieren los valores del catálogo pero aceptan texto libre,
porque lo que se está corrigiendo viene de un Excel). Sobre el grid hay **Marcar todo**,
**Desmarcar todo** y **Procesar códigos marcados**, este último habilitado solo si hay al
menos un código marcado.

Ese grid también tiene **fila de filtros**: texto ("contiene") en las seis columnas de datos y
una lista en Estado con **Todos / Pendiente / Con error / Procesado**. Los filtros y el marcado
trabajan juntos, que es lo que hace manejable un Excel largo: filtrar **Con error**, **Marcar
todo** y procesar solo esos.

- **Marcar todo** y la casilla del encabezado actúan sobre **lo que se está viendo** (los
  pendientes que pasan el filtro) y **conservan** las marcas anteriores; si quedan marcas fuera
  del filtro, el contador lo dice: *"5 códigos marcados (3 fuera del filtro)"*.
- **Desmarcar todo** sí quita todas las marcas, filtradas o no.
- El pie muestra **"N códigos de M"** con **Quitar filtros**, y cada carga se abre sin filtros.

### Línea y Familia dentro de la carga

`Línea` cuelga de `Departamento` y `Familia` cuelga de `Línea`, así que **el mismo nombre puede
existir bajo varios padres**. En el modal del código, las sugerencias de Línea, Familia y Grupo
Artículo se acotan al valor que tenga el **padre en ese momento**: antes se ofrecían todas las
líneas del catálogo y el usuario elegía de la lista una línea válida pero **de otro departamento**,
que la API rechazaba al procesar con un `Línea no encontrada` que mandaba a buscar en el catálogo
un valor que sí estaba ahí.

- Al cambiar el padre se rearma la lista del hijo. El valor **no se borra**: si dejó de
  corresponder, el campo se marca en rojo con el detalle debajo (*«X» no pertenece a «Y»*),
  porque acá se está corrigiendo un Excel y perder lo que venía es peor que verlo señalado.
- Se puede guardar así — el modal acepta texto libre a propósito —, pero el aviso dice que el
  código no se podrá registrar.
- Si el padre no está en el catálogo se ofrecen todos los valores y se avisa que no se puede
  comprobar la coherencia.
- Del lado de la API, `lineaId`/`familiaId` ahora dicen **a qué padre pertenece** el valor
  (*La Línea "X" no pertenece al Departamento "Y", sino a: Z*) y, si falta el padre, lo dicen en
  vez de culpar al hijo.

**Procesar** crea cada código en `dbo.Solicitud` con **Estado = Procesado**. Cada código se
procesa por separado: si un valor no existe en los catálogos o falta un obligatorio, ese
código **queda pendiente con el motivo visible** en el grid y los demás sí se registran.
Los obligatorios que se exigen al procesar son los mismos del formulario (constante
`CARGA_REQUIRED` en `api/src/index.js`).

Eliminar una carga borra sus códigos **pendientes**; los que ya se registraron en Códigos
**no se tocan**.

## Conexión a la base y fallos intermitentes

Azure cierra las conexiones que quedan inactivas y el host de Functions se duerme cuando no
hay tráfico, así que la **primera** llamada después de un rato podía fallar con
"Connection terminated unexpectedly" y funcionar bien al reintentar. Para que eso no le
llegue al usuario:

- `api/src/db.js` usa `keepAlive`, baja el *idle* del pool a 10 s, atiende el evento `error`
  del pool (una conexión muerta ya no puede tumbar el host) y **reintenta hasta 2 veces**
  la consulta cuando el fallo es de conexión. Un error de datos (UNIQUE, campo inválido)
  **no** se reintenta.
- En el navegador, `api()` reintenta hasta 2 veces **solo los GET** (leer es idempotente:
  repetirlo no crea ni cambia nada) ante error de red, 408, 429 o 5xx.
- Si aun así falla, la bandeja de cargas muestra **"No se pudo cargar el listado"** con un
  botón **Reintentar**, en vez del mensaje de "no hay cargas" — que hacía creer que la carga
  recién subida se había perdido.

## Órdenes de Pedido: campos obligatorios

En **Nuevo Registro** de Órdenes son obligatorios (asterisco rojo en la etiqueta y borde rojo si
se intenta guardar sin ellos): **Código del Producto, Descripción del Producto, Cajas,
Unidades x Caja, Total de Unidades, Bodega, Proveedor, Fecha de entrega al cliente,
Número de EMB, Fecha de Vencimiento de EMB** y **Justificación**. Opcionales: Transporte,
Sector, Precio Especial y Observaciones.

**Unidades x Caja** es obligatoria pero **no se digita**: la trae Conversiones al elegir el
producto. Si ese producto no tiene conversión registrada, el campo queda vacío y al guardar el
aviso lo dice y remite a **Conversiones** — no se muestra un "falta completar" que el usuario no
podría resolver desde el formulario.

Los obligatorios se declaran con `req:true` en `MODULES.ordenes.sections` (`frontend/index.html`).
La API mantiene su propia validación mínima (`ORD_FIELDS` con `required`: producto, descripción y
proveedor), a propósito: la carga masiva de Órdenes por Excel entra por el mismo endpoint y
endurecerla ahí rechazaría filas que hoy sí se cargan.

## Listas vacías en el formulario

Los catálogos se cargan una vez al entrar al módulo (`switchModule` → `loadCatalogsFor`). Si esa
llamada falla —y el **arranque en frío** de Azure Functions puede tumbar la primera, ver la
sección de conexión más abajo— el formulario se abría con **todas las listas vacías** y el único
síntoma era un `Sin coincidencias` al desplegarlas, que hacía pensar que el catálogo no tenía el
valor. Tres cambios:

- `openForm()` llama a **`ensureCatalogs()`**: si las listas están vacías reintenta cargarlas, y
  si vuelve a fallar avisa con el motivo (*"No se pudieron cargar las listas: …"*) en vez de abrir
  un formulario inservible.
- El combo distingue los dos casos. `Sin coincidencias` solo si **hay** opciones y ninguna
  coincide con lo escrito; con la lista vacía dice *"No hay opciones de &lt;campo&gt;. Recargue la
  página; si sigue vacía, agréguelas en Catálogos"*.
- `dependentSelect()` ya no explota sin jerarquía. `M().hier[f.key].parent` tiraba `TypeError`
  cuando `hier` venía vacío y **`buildForm` se cortaba ahí**: se dibujaba Departamento y se
  perdían Línea, Familia, Grupo Artículo, Centro de Costo y **todas las secciones siguientes**,
  sin ningún error a la vista.

## Órdenes: el producto en el grid y en el Excel

`cat.OP_Producto` guarda el producto como **`CODIGO — Descripción`** (un solo catálogo), y el
formulario lo necesita completo para poder elegirlo de la lista. En cambio el **grid** y el
**Excel del botón ⬇** muestran **solo el código** —`011-C2002`, no
`011-C2002 — Conector Clave con Extensión de 18cm`—, porque la descripción ya tiene su propia
columna al lado y repetirla hacía la columna Código ilegible.

- Lo resuelve `valorVisible(modId, key, val)` con la lista `SOLO_CODIGO`, usada en **tres**
  lugares: el render del grid, el **filtro** de esa columna (se filtra por lo que se ve) y el
  armado del Excel. Si mañana otra columna necesita lo mismo, se agrega ahí.
- El **filtro de la columna Código busca en el código**, no en la descripción. Buscar
  "Conector" en Código no devuelve nada: para eso está el filtro de Descripción.
- Como el Excel exportado se puede **volver a importar**, la API acepta las **dos** formas en esa
  columna: `ordProductoId()` busca primero el nombre completo y, si no lo encuentra, por código
  (`split_part(Nombre, ' — ', 1)`). Si un código estuviera repetido en dos productos, el error lo
  dice y pide el nombre completo, en vez de elegir uno al azar.

## Justificación (Órdenes de Pedido)

Lista desplegable **obligatoria**, después de *Fecha de Vencimiento de EMB* y antes de
*Observaciones*. Se gestiona desde **Catálogos → Justificación** o con el botón **＋** junto al
campo, que como en las demás listas solo ven **Compras** y **Administrador** (`canManageCat()`).
También sale como columna con filtro en el grid principal y como desplegable en la plantilla de
Excel: las tres cosas salen solas de declarar el campo con `type:"list"` en
`MODULES.ordenes.sections` y la columna en `gridCols`.

- Base: `cat.OP_Justificacion` + `dbo.OrdenPedido.JustificacionId` (**migración `V8`**). La
  columna es **NULL en la base** aunque el campo sea obligatorio en el formulario, para no
  invalidar las órdenes que ya existen.
- `V8` también agrega `Justificacion` a `dbo.vOrdenPedido`, **al final** de la lista de columnas:
  `CREATE OR REPLACE VIEW` en PostgreSQL solo admite agregar columnas al final.
- **El catálogo se crea vacío.** Como el campo es obligatorio, no se puede guardar una orden nueva
  hasta que alguien agregue al menos una opción. `V8` trae un `INSERT` de ejemplo comentado al
  final para dejar la lista cargada de una vez.

## Centro de Costo

La relación vive en **`cat.GrupoArticuloCentroCosto`** (migración **`V9`**): una tabla
`GrupoArticuloId` + `CentroCostoId` que admite **varios centros por grupo**. `cat.CentroCosto`
es un catálogo plano, sin padre.

**No cuelga del Departamento**, y no puede: `CO.EQ._ESPECIALIDADES_QUIRÚRGICAS` tiene dos grupos
con centros distintos —*Terapias Quirúrgicas* → `20-2002-200202` y *Ortopédia* → `20-2002-200203`—
así que desde el departamento solo no se sabe cuál va.

`V3` había dejado la relación como **una columna** (`cat.GrupoArticulo.CentroCostoId`): servía para
sugerir el centro, pero no permitía que un grupo tuviera dos válidos. `V9` mueve la relación a su
propia tabla y **no borra** la columna de `V3`: la deja como legado (la API ya no la lee) para poder
volver atrás sin perder datos. La semilla de `V9` copia esa columna y además vuelve a insertar las
**siete** relaciones confirmadas, así que la migración deja la tabla correcta incluso sobre una base
donde la columna nunca se llenó.

En el formulario de Códigos, el **Grupo Artículo determina qué muestra la lista** de Centro de
Costo — antes mostraba los ocho centros del catálogo y el usuario tenía que acertar a mano:

| Grupo Artículo | Campo Centro de Costo |
|---|---|
| sin seleccionar | **deshabilitado**; vacío, o con el valor del registro y un aviso que lo explica |
| con **un** centro ligado | **autocompletado y bloqueado** |
| con **varios** centros | lista **acotada a esos** centros |
| **sin** centros ligados | catálogo completo + aviso |

- El mapa llega en `grupo_centros` de `/api/catalogos` (**grupo → lista** de centros). Se mantiene
  además `grupo_centro` (un solo valor) para no romper una versión anterior del frontend, y
  `normalizarGrupoCentros()` acepta las dos formas por lo mismo, al revés.
- El centro **solo se pisa si el Grupo Artículo quedó distinto** del anterior (`CC_GRUPO_PREVIO`).
  Cambiar Departamento sí limpia el grupo —el grupo cuelga del departamento— y con él el centro;
  cambiar **Línea o Familia no**, porque el grupo no depende de ellas. Antes se pisaba ante
  cualquiera de los cuatro: corregir la Familia de un registro con un centro histórico distinto lo
  reemplazaba **en silencio** y volvía a bloquear el campo, así que el usuario ya no podía
  devolverlo y guardaba un valor que nunca eligió.
- El recálculo va **diferido** (`setTimeout`) porque `dependentSelect` limpia el Grupo Artículo en
  su propio listener: sin eso se leería el grupo anterior.
- Al **abrir un registro guardado** el valor **no se pisa**. Si no corresponde al grupo se conserva,
  se avisa debajo del campo (*"Al Grupo Artículo «Ortopédia» le corresponde «20-2002-200203»; este
  registro tiene «…»"*) y la lista **queda habilitada** para poder corregirlo. Pisarlo en silencio
  perdería una excepción legítima; bloquearlo dejaría el registro imposible de arreglar.
- Un grupo **sin centros ligados** no bloquea la captura: se ofrece el catálogo completo y el aviso
  remite a *Catálogos → Centro de Costo por Grupo Artículo*. Hoy es el caso de **`Cuidado Crónico`**,
  el único grupo del catálogo que nunca tuvo centro (tampoco en `V3`).
- El modal de un código de la **bandeja de cargas** acota igual las sugerencias y avisa nombrando
  **todas** las opciones válidas cuando hay más de una. Ese modal sigue aceptando **texto libre**,
  a propósito: lo que se está corrigiendo viene de un Excel.

### Gestión de las relaciones

**Catálogos → "Centro de Costo por Grupo Artículo"** lista todos los grupos con sus centros y marca
en rojo los que no tienen ninguno. Entrando a un grupo se **ligan** y **desligan** centros; el
desplegable ofrece solo los que faltan. El botón **＋** junto al campo del formulario abre directo
ese grupo, en vez del catálogo plano de Centro de Costo — que es lo que de verdad cambia la lista.
Solo lo ven **Compras** y **Administrador** (`canManageCat()`).

- Endpoints: `POST /api/grupo-centros/{grupo}` con `{centro}` y
  `DELETE /api/grupo-centros/{grupo}/{centro}`. **No** entran en `catalogos/{tipo}` porque no crean
  ni borran opciones: el grupo y el centro ya existen, acá solo se liga o desliga el par.
- Quitar el **último** centro de un grupo se puede, y la confirmación avisa que el formulario
  volverá a mostrar el catálogo completo para ese grupo.
- Desligar un centro **no toca los registros ya guardados**: `dbo.Solicitud.CentroCostoId` apunta al
  catálogo, no a esta relación. Al editarlos aplica la regla del valor histórico de arriba.
- Los centros de costo se **crean** en *Catálogos → Centro de Costo*; acá solo se ligan. Borrar uno
  del catálogo queda bloqueado por FK **mientras algún grupo lo tenga ligado** ("La opción está en
  uso"); al desligarlo de todos, se puede borrar.
  - Para que eso sea cierto, `V9` **suelta la FK `FK_Grupo_CentroCosto`** que `V3` había puesto sobre
    la columna legada. Como la API ya no escribe esa columna, la FK dejaba los siete centros
    sembrados **imposibles de borrar para siempre**: desligarlos en la pantalla nueva no alcanzaba y
    el mensaje no decía quién los usaba. Los **datos** de la columna no se tocan.

### Si se despliega la API antes de correr `V9`

La consulta de `cat.GrupoArticuloCentroCosto` en `/api/catalogos` va en su **propio `try`**. Sin eso,
la tabla faltante tumbaba **todo** el endpoint y el formulario se abría con las 16 listas vacías por
un solo campo. Con el `catch`, el único efecto es que ningún grupo tiene centros ligados: el campo
degrada al caso "grupo sin centros" (catálogo completo + aviso) y se deja un `warn` en los logs de la
Function.

La API sigue aceptando cualquier centro del catálogo al guardar un registro (`type:'cat'`), a
propósito: endurecerlo rechazaría los registros históricos al editarlos y las filas de Excel que hoy
sí entran.

En la **plantilla de Excel**, en cambio, la columna Centro de Costo **sí se acota** al Grupo Artículo
de la fila (ver *Cascada en la plantilla de Códigos*), con la misma excepción del formulario: un grupo
**sin centros ligados** ofrece el catálogo completo.



## Seguridad
- Las credenciales de PostgreSQL y el secret de Entra ID viven **solo** en las App
  Settings de Azure, nunca en el código ni en el repositorio.
- La conexión a PostgreSQL usa TLS (`PG_SSL=true`, obligatorio en Azure).
- Todas las rutas (`/` y `/api/*`) requieren usuario autenticado.
- Las consultas SQL usan parámetros (`$1, $2, …`) para prevenir inyección.
