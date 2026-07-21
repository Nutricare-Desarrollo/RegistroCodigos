# Guía de despliegue en Azure — RegistroCodigos

Objetivo: publicar la aplicación con una URL pública, login de Microsoft (SSO) y
base de datos, para verla funcionando en línea.

> Los dos módulos (Creación de Códigos y Solicitud de Orden de Pedido) guardan en
> la base de datos. Único recurso con costo: la base de datos; el sitio y la API van
> en planes gratuitos.

Requisitos previos: una cuenta de Azure con suscripción activa y el repositorio ya
en GitHub (`Nutricare-Desarrollo/RegistroCodigos`).

---

## Paso 1 — Crear la base de datos (Azure SQL)

1. Portal de Azure → **Crear un recurso → SQL Database**.
2. Grupo de recursos: crea uno nuevo, p. ej. `rg-registrocodigos`.
3. Nombre de la base de datos: `RegistroCodigos`.
4. Servidor: **Crear nuevo** → nombre único (ej. `sql-nutricare-registros`),
   ubicación *East US* o *Central US*, autenticación **SQL** (usuario y contraseña;
   anótalos, los usarás en el Paso 3).
5. **Proceso y almacenamiento → Configurar**: elige **Serverless** (General Purpose)
   con pausa automática, o el nivel **Basic** si prefieres cuota fija. Es lo más económico.
6. Crea el recurso y espera a que termine.
7. Abre el servidor SQL → **Redes** → activa **"Permitir que los servicios y recursos
   de Azure accedan a este servidor"** y agrega tu IP actual para poder cargar el script.

### Cargar el esquema
- En el portal, abre la base de datos → **Editor de consultas (versión preliminar)**,
  inicia sesión con el usuario SQL.
- Ejecuta **dos** scripts, en este orden:
  1. `database/RegistroCodigos.sql` (módulo Creación de Códigos)
  2. `database/OrdenPedido.sql` (módulo Solicitud de Orden de Pedido)
- Copia el contenido de cada uno en el Editor de consultas y ejecútalo.
- (Alternativa: usar Azure Data Studio o SSMS conectándote al servidor.)

---

## Paso 2 — Crear la Static Web App (sitio + API)

1. Portal → **Crear un recurso → Static Web App**.
2. Grupo de recursos: el mismo `rg-registrocodigos`. Plan: **Free**.
3. Origen: **GitHub** → autoriza y selecciona:
   - Organización: `Nutricare-Desarrollo`
   - Repositorio: `RegistroCodigos`
   - Rama: `main`
4. Detalles de compilación:
   - **App location:** `frontend`
   - **Api location:** `api`
   - **Output location:** (déjalo vacío)
5. Crear. Azure agrega automáticamente un workflow de GitHub Actions al repositorio y
   hace el primer despliegue (tarda unos minutos; puedes ver el progreso en la pestaña
   **Actions** de GitHub).

---

## Paso 3 — Configurar la conexión a la base de datos

En la Static Web App → **Configuración → Configuración de la aplicación**, agrega:

| Nombre         | Valor                                        |
|----------------|----------------------------------------------|
| SQL_SERVER     | `sql-nutricare-registros.database.windows.net` |
| SQL_DATABASE   | `RegistroCodigos`                            |
| SQL_USER       | (el usuario SQL del Paso 1)                   |
| SQL_PASSWORD   | (la contraseña del Paso 1)                    |

Guarda. La API ya podrá leer/escribir en la base de datos.

---

## Paso 4 — Login de Microsoft (SSO con Entra ID)

1. Portal → **Microsoft Entra ID → Registros de aplicaciones → Nuevo registro**.
   - Nombre: `RegistroCodigos`.
   - Tipos de cuenta: "Solo este directorio organizativo" (tu tenant de Nutricare).
   - URI de redirección (Web):
     `https://<tu-sitio>.azurestaticapps.net/.auth/login/aad/callback`
     (el dominio exacto aparece en la página de tu Static Web App).
2. Anota **Id. de aplicación (cliente)** y **Id. de directorio (inquilino/tenant)**.
3. **Certificados y secretos → Nuevo secreto de cliente** → copia el valor.
4. En la Static Web App → Configuración de la aplicación, agrega:
   - `AAD_CLIENT_ID` = Id. de aplicación (cliente)
   - `AAD_CLIENT_SECRET` = el secreto que copiaste
5. En el repositorio, edita `frontend/staticwebapp.config.json` y reemplaza
   `<TENANT_ID>` por tu Id. de inquilino. Haz commit y push: Azure redesplegará solo.

---

## Paso 5 — Probar

1. Abre `https://<tu-sitio>.azurestaticapps.net`.
2. Te pedirá iniciar sesión con Microsoft (SSO).
3. Ya dentro, ambos módulos (Creación de Códigos y Solicitud de Orden de Pedido)
   crean, editan y eliminan registros directamente en tu base de datos de Azure.

---

## Notas

- **Costo:** solo la base de datos. En Serverless con pausa automática, cuando nadie
  la usa casi solo pagas el almacenamiento.
- **Seguridad:** las credenciales viven solo en la Configuración de la Static Web App,
  nunca en el código ni en el repositorio.
