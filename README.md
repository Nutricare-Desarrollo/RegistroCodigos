# RegistroCodigos — Solicitud de Creación de Código de Artículo

Aplicación web para registrar solicitudes de creación de códigos de artículo,
con autenticación **SSO de Microsoft (Entra ID)** y base de datos **Azure SQL**.

## Arquitectura

- **frontend/** — Sitio estático (HTML + JS). Grid de registros, formulario por
  secciones, listas desplegables gestionables y exportación a Excel.
- **api/** — API en **Azure Functions (Node.js v4)**. Expone `/api/*` y conecta a
  Azure SQL con el paquete `mssql`.
- **database/** — Script T-SQL (`RegistroCodigos.sql`) con el esquema y los datos
  semilla de todos los catálogos.
- Hospedaje en **Azure Static Web Apps** (plan gratuito), que además gestiona el
  login con Entra ID sin código propio.

```
Navegador  ─►  Static Web Apps (SSO Entra ID)  ─►  /api (Azure Functions)  ─►  Azure SQL
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
| DELETE | /api/solicitudes/{id}        | Eliminar registro                    |

## Puesta en marcha

### 1. Base de datos (Azure SQL)
1. Crear un **Azure SQL Database** (para mínimo costo: *Serverless* con auto-pausa,
   o el nivel *Basic* de tarifa fija).
2. Ejecutar `database/RegistroCodigos.sql` (con Azure Data Studio, SSMS o el editor
   de consultas del portal). Crea las tablas y carga los catálogos.
3. En **Firewall del servidor SQL**, permitir "Servicios de Azure".

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
   - `SQL_SERVER`, `SQL_DATABASE`, `SQL_USER`, `SQL_PASSWORD`
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
- Las credenciales de SQL y el secret de Entra ID viven **solo** en las App
  Settings de Azure, nunca en el código ni en el repositorio.
- Todas las rutas (`/` y `/api/*`) requieren usuario autenticado.
- Las consultas SQL usan parámetros (previene inyección).
