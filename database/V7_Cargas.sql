/* ============================================================================
   Migración V7:  Bandeja de cargas masivas de Códigos
   ----------------------------------------------------------------------------
   Ejecución (idempotente, se puede correr sobre una base con datos):

     psql "<cadena-de-conexion>" -f V7_Cargas.sql

   Qué crea:
     1. dbo.Carga         — una fila por archivo de Excel subido (quién, cuándo,
                            nombre del archivo).
     2. dbo.CargaDetalle  — una fila por código del archivo. Los valores se
                            guardan como JSONB con las MISMAS claves que usa el
                            formulario (codigo, nombre, departamento, …), así
                            que no hay que replicar las 30 columnas de
                            dbo.Solicitud ni migrar esta tabla cada vez que se
                            agregue un campo al formulario.
     3. dbo.vCarga        — vista con los totales y el estado DERIVADO de la
                            carga: 'Pendiente' mientras le queden códigos sin
                            registrar, 'Registrada' cuando ya no queda ninguno.
                            Se deriva (no se guarda) para que no exista la
                            posibilidad de un estado desincronizado.

   Nota: al registrar un código se crea la fila en dbo.Solicitud con
   Estado='Procesado' y se guarda su Id en CargaDetalle.SolicitudId. Borrar una
   carga NO borra los códigos que ya se registraron.
   ============================================================================ */

/* ---------- Verificación previa: que sea la base de la aplicación ---------- */
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema='dbo' AND lower(table_name)='solicitud') THEN
        RAISE EXCEPTION 'Esta no es la base de RegistroCodigos (no existe dbo.Solicitud). Script abortado.';
    END IF;
END $$;

/* ---------- 1. Cabecera de la carga ---------- */
CREATE TABLE IF NOT EXISTS dbo.Carga (
    Id          SERIAL PRIMARY KEY,
    Archivo     VARCHAR(260) NOT NULL,
    FechaCarga  TIMESTAMP    NOT NULL DEFAULT (now() at time zone 'utc'),
    CargadoPor  VARCHAR(200) NULL,
    Origen      VARCHAR(20)  NOT NULL DEFAULT 'Excel'
);

/* ---------- 2. Detalle: un código por fila ---------- */
CREATE TABLE IF NOT EXISTS dbo.CargaDetalle (
    Id            SERIAL PRIMARY KEY,
    CargaId       INT          NOT NULL,
    Fila          INT          NULL,          -- fila del Excel, para ubicar el dato original
    Datos         JSONB        NOT NULL,      -- {codigo, nombre, departamento, ...}
    Estado        VARCHAR(20)  NOT NULL DEFAULT 'Pendiente'
                  CONSTRAINT CK_CargaDetalle_Estado CHECK (Estado IN ('Pendiente','Procesado')),
    Error         TEXT         NULL,          -- motivo del último intento fallido
    SolicitudId   INT          NULL,          -- registro creado al procesar
    FechaProceso  TIMESTAMP    NULL,
    ProcesadoPor  VARCHAR(200) NULL,
    CONSTRAINT FK_CargaDetalle_Carga FOREIGN KEY (CargaId)
        REFERENCES dbo.Carga(Id) ON DELETE CASCADE
);

/* La FK a Solicitud se agrega aparte y con ON DELETE SET NULL: si alguien borra
   un código ya registrado, el detalle se queda como histórico sin apuntar a nada. */
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE lower(conname) = 'fk_cargadetalle_solicitud') THEN
        ALTER TABLE dbo.CargaDetalle
            ADD CONSTRAINT FK_CargaDetalle_Solicitud FOREIGN KEY (SolicitudId)
            REFERENCES dbo.Solicitud(Id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS IX_CargaDetalle_CargaId ON dbo.CargaDetalle (CargaId);
CREATE INDEX IF NOT EXISTS IX_CargaDetalle_Estado  ON dbo.CargaDetalle (Estado);
CREATE INDEX IF NOT EXISTS IX_Carga_Fecha          ON dbo.Carga (FechaCarga DESC);

/* ---------- 3. Vista con totales y estado derivado ---------- */
CREATE OR REPLACE VIEW dbo.vCarga AS
SELECT c.Id,
       c.Archivo,
       c.FechaCarga,
       c.CargadoPor,
       c.Origen,
       count(d.Id)                                                  AS TotalCodigos,
       count(d.Id) FILTER (WHERE d.Estado = 'Pendiente')            AS Pendientes,
       count(d.Id) FILTER (WHERE d.Estado = 'Procesado')            AS Procesados,
       count(d.Id) FILTER (WHERE d.Estado = 'Pendiente'
                             AND d.Error IS NOT NULL)               AS ConError,
       CASE WHEN count(d.Id) > 0
             AND count(d.Id) FILTER (WHERE d.Estado = 'Pendiente') = 0
            THEN 'Registrada' ELSE 'Pendiente' END                  AS Estado
  FROM dbo.Carga c
  LEFT JOIN dbo.CargaDetalle d ON d.CargaId = c.Id
 GROUP BY c.Id, c.Archivo, c.FechaCarga, c.CargadoPor, c.Origen;

DO $$
BEGIN
    RAISE NOTICE 'V7 listo -> dbo.Carga, dbo.CargaDetalle y dbo.vCarga creados/verificados.';
END $$;
