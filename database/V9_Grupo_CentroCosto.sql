/* ============================================================================
   Migración V9:  Centro de Costo acotado al Grupo Artículo (varios por grupo)
   App: Portal de Registros (RegistroCodigos)
   Motor: PostgreSQL (Azure Database for PostgreSQL - Flexible Server)
   ----------------------------------------------------------------------------
   IDEMPOTENTE y NO destructivo: se puede ejecutar sobre una base con datos y
   volver a ejecutar sin efecto.
   Ejecutar DESPUÉS de V3_Ajustes_Codigos_Ordenes.sql:
     psql "<cadena-de-conexion>" -f V9_Grupo_CentroCosto.sql

   Por qué
   -------
   V3 dejó la relación como UNA columna: cat.GrupoArticulo.CentroCostoId. Con eso
   el formulario podía sugerir el centro, pero no podía existir un grupo con dos
   centros válidos. Esta migración pasa la relación a su propia tabla
   (cat.GrupoArticuloCentroCosto), que admite varios centros por grupo, y es la
   que lee /api/catalogos para acotar la lista del campo Centro de Costo.

   La columna cat.GrupoArticulo.CentroCostoId NO se elimina: queda como legado
   (la API ya no la lee) para poder volver atrás sin perder datos.
   ============================================================================ */

CREATE SCHEMA IF NOT EXISTS cat;

/* ---------- 1. Tabla de relación grupo -> centros ---------- */
CREATE TABLE IF NOT EXISTS cat.GrupoArticuloCentroCosto (
    GrupoArticuloId INT NOT NULL REFERENCES cat.GrupoArticulo(Id) ON DELETE CASCADE,
    CentroCostoId   INT NOT NULL REFERENCES cat.CentroCosto(Id),
    PRIMARY KEY (GrupoArticuloId, CentroCostoId)
);

CREATE INDEX IF NOT EXISTS IX_GrupoArticuloCentroCosto_Grupo
    ON cat.GrupoArticuloCentroCosto (GrupoArticuloId);

/* ---------- 2. Semilla desde la columna de V3 ----------
   Todo lo que hoy está en cat.GrupoArticulo.CentroCostoId pasa a la tabla.
   Así la migración no depende de que los nombres del bloque 3 coincidan.
   Va dentro de un IF: en una base donde V3 nunca corrió la columna no existe, y
   sin el IF el script entero se cortaría acá (con -v ON_ERROR_STOP=1). */
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema='cat' AND table_name='grupoarticulo'
                  AND column_name='centrocostoid') THEN
        INSERT INTO cat.GrupoArticuloCentroCosto (GrupoArticuloId, CentroCostoId)
        SELECT g.Id, g.CentroCostoId
          FROM cat.GrupoArticulo g
         WHERE g.CentroCostoId IS NOT NULL
            ON CONFLICT DO NOTHING;
    ELSE
        RAISE NOTICE 'V9: cat.GrupoArticulo.CentroCostoId no existe (¿falta V3?), se usa solo la lista del bloque 3';
    END IF;
END$$;

/* ---------- 2b. Se suelta la FK de la columna legada ----------
   FK_Grupo_CentroCosto (de V3) impedía borrar del catálogo un centro de costo
   mientras esa columna lo apuntara — y como la API ya no la escribe, quedaba
   apuntando para siempre: desligar el centro de todos los grupos en la pantalla
   nueva no alcanzaba, "Catálogos -> Centro de Costo" seguía respondiendo "la
   opción está en uso" sin que se viera quién la usaba. La FK de la tabla nueva
   sigue protegiendo lo que de verdad está en uso.
   Los datos de la columna NO se tocan: quedan para poder volver atrás. */
ALTER TABLE cat.GrupoArticulo DROP CONSTRAINT IF EXISTS FK_Grupo_CentroCosto;

/* ---------- 3. Las 7 relaciones confirmadas ----------
   Mismos pares que V3 (verificados contra "Relaciones Codigos.xlsx"). Van
   explícitos para que la tabla quede correcta incluso en una base donde la
   columna de V3 nunca se llenó. Si el grupo o el centro no existen, el par se
   omite y el DO deja un aviso en el log. */
DO $$
DECLARE
    rel   RECORD;
    v_gru INT;
    v_cc  INT;
BEGIN
    FOR rel IN
        SELECT * FROM (VALUES
            ('Cuidado y Bienestar',                  '20-2004-200404'),
            ('Diagnóstico y Tecnologías de Soporte', '20-2005-200502'),
            ('Terapias Quirúrgicas',                 '20-2002-200202'),
            ('Ortopédia',                            '20-2002-200203'),
            ('Salud Cardiovascular',                 '20-2003-200301'),
            ('Servicio Técnico',                     '20-2006-200601'),
            ('Cuidado Critico',                      '20-2001-200102')
        ) AS t(grupo, centro)
    LOOP
        SELECT Id INTO v_gru FROM cat.GrupoArticulo WHERE Nombre = rel.grupo;
        SELECT Id INTO v_cc  FROM cat.CentroCosto   WHERE Nombre = rel.centro;
        IF v_gru IS NULL THEN
            RAISE NOTICE 'V9: no existe el Grupo Artículo "%", se omite', rel.grupo;
        ELSIF v_cc IS NULL THEN
            RAISE NOTICE 'V9: no existe el Centro de Costo "%", se omite', rel.centro;
        ELSE
            INSERT INTO cat.GrupoArticuloCentroCosto (GrupoArticuloId, CentroCostoId)
            VALUES (v_gru, v_cc)
            ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;
END$$;

/* ============================================================================
   FIN. Verificación rápida (opcional): un grupo por fila con sus centros.

   SELECT g.Nombre AS grupo,
          string_agg(c.Nombre, ', ' ORDER BY c.Nombre) AS centros
     FROM cat.GrupoArticulo g
     LEFT JOIN cat.GrupoArticuloCentroCosto gc ON gc.GrupoArticuloId = g.Id
     LEFT JOIN cat.CentroCosto c              ON c.Id = gc.CentroCostoId
    WHERE g.Activo = true
    GROUP BY g.Nombre
    ORDER BY g.Nombre;

   Para ligar un centro más a un grupo (también se puede desde la app, en
   Catálogos -> "Centro de Costo por Grupo Artículo"):

   INSERT INTO cat.GrupoArticuloCentroCosto (GrupoArticuloId, CentroCostoId)
   SELECT g.Id, c.Id FROM cat.GrupoArticulo g, cat.CentroCosto c
    WHERE g.Nombre = 'Ortopédia' AND c.Nombre = '20-2002-200202'
       ON CONFLICT DO NOTHING;
   ============================================================================ */
