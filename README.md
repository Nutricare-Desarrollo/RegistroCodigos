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
   catálogos; las migraciones `V2`/`V3`/`V4` son idempotentes y no destructivas (se pueden
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

**Todas** las validaciones son una **referencia simple a un rango** (`Listas!$D$2:$D$40`). No hay
fórmulas, y esto es a propósito.

### Por qué Línea/Familia/Grupo Artículo no van en cascada

Se intentó: la lista del hijo se armaba con `IFERROR(OFFSET(…MATCH…COUNTA…))` sobre una matriz con
una columna por cada valor del padre. **Excel de escritorio rechaza esa fórmula** — la lista de una
validación tiene que resolver a una *referencia*, e `IFERROR` devuelve un valor, no una referencia.
Y el daño no se queda ahí: al encontrar una validación inválida, Excel **descarta esa y todas las
que vienen después en el archivo**. En la práctica se veía el desplegable solo en Departamento
(la única validación anterior a la cascada) y lo perdían Línea, Familia, Grupo Artículo, Centro de
Costo y todos los campos siguientes.

Por eso los campos dependientes traen la **lista completa** de sus valores: todas las líneas, todas
las familias, todos los grupos. La coherencia padre/hijo la valida la **API al procesar la carga**,
que además es la única defensa real (ver el punto de pegar filas, abajo).

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
- Al ser referencias simples, los desplegables funcionan igual en **Excel de escritorio**, **Excel en
  el navegador** y **WPS**.
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
Número de EMB** y **Fecha de Vencimiento de EMB**. Opcionales: Transporte, Sector,
Precio Especial y Observaciones.

**Unidades x Caja** es obligatoria pero **no se digita**: la trae Conversiones al elegir el
producto. Si ese producto no tiene conversión registrada, el campo queda vacío y al guardar el
aviso lo dice y remite a **Conversiones** — no se muestra un "falta completar" que el usuario no
podría resolver desde el formulario.

Los obligatorios se declaran con `req:true` en `MODULES.ordenes.sections` (`frontend/index.html`).
La API mantiene su propia validación mínima (`ORD_FIELDS` con `required`: producto, descripción y
proveedor), a propósito: la carga masiva de Órdenes por Excel entra por el mismo endpoint y
endurecerla ahí rechazaría filas que hoy sí se cargan.

## Centro de Costo

En Códigos, cambiar **Departamento**, **Línea**, **Familia** o **Grupo Artículo** **limpia** el
Centro de Costo, para que no quede un centro que ya no corresponde a la nueva clasificación
contable. El usuario lo vuelve a elegir a mano.

## Seguridad
- Las credenciales de PostgreSQL y el secret de Entra ID viven **solo** en las App
  Settings de Azure, nunca en el código ni en el repositorio.
- La conexión a PostgreSQL usa TLS (`PG_SSL=true`, obligatorio en Azure).
- Todas las rutas (`/` y `/api/*`) requieren usuario autenticado.
- Las consultas SQL usan parámetros (`$1, $2, …`) para prevenir inyección.
