# Guía de despliegue en Azure — RegistroCodigos

Objetivo: publicar la aplicación con una URL pública, login de Microsoft (SSO) y
base de datos, para verla funcionando en línea.

> Los dos módulos (Creación de Códigos y Solicitud de Orden de Pedido) guardan en
> la base de datos. Único recurso con costo: la base de datos; el sitio y la API van
> en planes gratuitos.

Requisitos previos: una cuenta de Azure con suscripción activa y el repositorio ya
en GitHub (`Nutricare-Desarrollo/RegistroCodigos`).

---

## Paso 1 — Crear la base de datos (Azure Database for PostgreSQL)

1. Portal de Azure → **Crear un recurso → Azure Database for PostgreSQL Flexible Server**.
2. Grupo de recursos: crea uno nuevo, p. ej. `rg-registrocodigos`.
3. Nombre del servidor: nombre único (ej. `pg-nutricare-registros`); el dominio queda
   `pg-nutricare-registros.postgres.database.azure.com`.
4. Ubicación *East US* o *Central US*. Versión de PostgreSQL: **16** (o la más reciente).
5. Tipo de carga de trabajo / proceso: elige **Burstable B1ms** (lo más económico).
6. Autenticación: **PostgreSQL** (usuario y contraseña administradores; anótalos, los
   usarás en el Paso 3).
7. Crea el recurso y espera a que termine.
8. Abre el servidor → **Redes** → activa **"Permitir el acceso público"**, marca
   **"Permitir que los servicios y recursos de Azure accedan a este servidor"** y agrega
   tu IP actual como regla de firewall para poder cargar el script.
9. Crea la base de datos: en el servidor → **Bases de datos → Agregar**, nombre
   `RegistroCodigos`. (También puedes crearla con `CREATE DATABASE "RegistroCodigos";`.)

### Cargar el esquema
- Los scripts están en **PostgreSQL**. Ejecútalos con `psql` (o pgAdmin / Azure Data Studio
  con la extensión de PostgreSQL), **en este orden**:
  1. `database/RegistroCodigos.sql` (módulo Creación de Códigos)
  2. `database/OrdenPedido.sql` (módulo Solicitud de Orden de Pedido)
- Ejemplo con `psql` (requiere TLS, ya incluido con `sslmode=require`):

  ```bash
  psql "host=pg-nutricare-registros.postgres.database.azure.com port=5432 dbname=RegistroCodigos user=tuusuario password=TU_CONTRASEÑA sslmode=require" -f database/RegistroCodigos.sql
  psql "host=pg-nutricare-registros.postgres.database.azure.com port=5432 dbname=RegistroCodigos user=tuusuario password=TU_CONTRASEÑA sslmode=require" -f database/OrdenPedido.sql
  ```
- Los scripts crean los esquemas `cat` y `dbo`, y se pueden re-ejecutar (hacen `DROP ... IF EXISTS`).

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

| Nombre       | Valor                                                   |
|--------------|---------------------------------------------------------|
| PG_HOST      | `pg-nutricare-registros.postgres.database.azure.com`    |
| PG_PORT      | `5432`                                                  |
| PG_DATABASE  | `RegistroCodigos`                                       |
| PG_USER      | (el usuario administrador del Paso 1)                   |
| PG_PASSWORD  | (la contraseña del Paso 1)                              |
| PG_SSL       | `true`                                                  |

Guarda. La API ya podrá leer/escribir en la base de datos. (`PG_SSL=true` es
obligatorio en Azure; solo usa `false` para pruebas contra un PostgreSQL local sin TLS.)

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

- **Costo:** solo la base de datos. Con el tamaño **Burstable B1ms** es el nivel más
  económico; además puedes **detener el servidor** (Start/Stop) cuando no se use para
  reducir el gasto de cómputo.
- **Seguridad:** las credenciales viven solo en la Configuración de la Static Web App,
  nunca en el código ni en el repositorio.
