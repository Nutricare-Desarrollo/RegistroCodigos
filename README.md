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
| POST   | /api/catalogos/{tipo}        | Agregar opción a un catálogo         |
| PUT    | /api/catalogos/{tipo}/{valor}| Editar opción                        |
| DELETE | /api/catalogos/{tipo}/{valor}| Eliminar opción (bloquea si está en uso) |
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

## Puesta en marcha

### 1. Base de datos (Azure Database for PostgreSQL)
1. Crear un **Azure Database for PostgreSQL Flexible Server** (para mínimo costo:
   tamaño *Burstable B1ms*; se puede detener cuando no se use). Crear la base
   `RegistroCodigos`.
2. Ejecutar, en orden, `database/RegistroCodigos.sql` y luego `database/OrdenPedido.sql`
   con `psql` (o pgAdmin / Azure Data Studio). Crean los esquemas `cat`/`dbo`, las tablas
   y los catálogos:
   ```bash
   psql "host=<servidor>.postgres.database.azure.com port=5432 dbname=RegistroCodigos user=<usuario> password=<clave> sslmode=require" -f database/RegistroCodigos.sql
   psql "host=<servidor>.postgres.database.azure.com port=5432 dbname=RegistroCodigos user=<usuario> password=<clave> sslmode=require" -f database/OrdenPedido.sql
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

## Seguridad
- Las credenciales de PostgreSQL y el secret de Entra ID viven **solo** en las App
  Settings de Azure, nunca en el código ni en el repositorio.
- La conexión a PostgreSQL usa TLS (`PG_SSL=true`, obligatorio en Azure).
- Todas las rutas (`/` y `/api/*`) requieren usuario autenticado.
- Las consultas SQL usan parámetros (`$1, $2, …`) para prevenir inyección.
