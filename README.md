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

`Modelo` y `Marca` son **listas desplegables** con jerarquía **Modelo → Marca**: al elegir el
modelo, la lista de marcas se filtra a las de ese modelo (mismo patrón que
Departamento → Línea → Familia). Una misma marca puede existir bajo varios modelos.

- **Modelo** se gestiona desde **Catálogos → Modelos**, o con el botón **＋** junto al campo.
- **Marca** se gestiona con el botón **＋** junto al campo, que abre las marcas **del modelo
  seleccionado** (igual que Línea y Familia).
- Los botones **＋** solo aparecen para los roles **Compras** y **Administrador**.
- La migración `V6` convierte los valores de texto que ya existían en registros de catálogo.
  Si algún registro tenía Marca sin Modelo, esa marca queda bajo el modelo **"Sin modelo"** y
  el script lo informa con un `NOTICE` para que se reasigne. Las columnas de texto
  `Solicitud.Modelo` y `Solicitud.Marca` **no se eliminan**: quedan como respaldo histórico.

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
