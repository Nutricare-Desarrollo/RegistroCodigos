/* ============================================================================
   Migración V3:  Ajustes solicitados en reunión (Códigos + Órdenes)
   App: Portal de Registros (RegistroCodigos + OrdenPedido)
   Motor: PostgreSQL (Azure Database for PostgreSQL - Flexible Server)
   ----------------------------------------------------------------------------
   IDEMPOTENTE y NO destructivo: se puede ejecutar sobre una base con datos.
   Ejecutar DESPUÉS de RegistroCodigos.sql, OrdenPedido.sql y V2_Estado_Roles.sql:
     psql "<cadena-de-conexion>" -f V3_Ajustes_Codigos_Ordenes.sql

   Contenido:
     1. cat.Unidad: columna Orden (Caja y Unidad primero en los desplegables).
     2. cat.GrupoArticulo: relación con Departamento y Centro de Costo
        (según "Relaciones Departamento grupo centro de costos.xlsx").
     3. Verificación de FechaCreacion (ya existe; se asegura por si acaso).
   ============================================================================ */

CREATE SCHEMA IF NOT EXISTS cat;
CREATE SCHEMA IF NOT EXISTS dbo;

/* ---------- 1. Orden en cat.Unidad ---------- */
ALTER TABLE cat.Unidad ADD COLUMN IF NOT EXISTS Orden INT;

-- Caja y Unidad se muestran de primero; el resto después, alfabético.
UPDATE cat.Unidad SET Orden = 1   WHERE Nombre = 'Caja';
UPDATE cat.Unidad SET Orden = 2   WHERE Nombre = 'Unidad';
UPDATE cat.Unidad SET Orden = 100 WHERE Orden IS NULL;

/* ---------- 2. GrupoArticulo -> Departamento + Centro de Costo ---------- */
ALTER TABLE cat.GrupoArticulo ADD COLUMN IF NOT EXISTS DepartamentoId INT;
ALTER TABLE cat.GrupoArticulo ADD COLUMN IF NOT EXISTS CentroCostoId  INT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE lower(conname) = 'fk_grupo_departamento') THEN
        ALTER TABLE cat.GrupoArticulo
            ADD CONSTRAINT FK_Grupo_Departamento FOREIGN KEY (DepartamentoId) REFERENCES cat.Departamento(Id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE lower(conname) = 'fk_grupo_centrocosto') THEN
        ALTER TABLE cat.GrupoArticulo
            ADD CONSTRAINT FK_Grupo_CentroCosto FOREIGN KEY (CentroCostoId) REFERENCES cat.CentroCosto(Id);
    END IF;
END$$;

-- Centro de costo que faltaba en la semilla (Servicio Técnico).
INSERT INTO cat.CentroCosto (Nombre) VALUES ('20-2006-200601')
    ON CONFLICT (Nombre) DO NOTHING;

-- Relaciones (Grupo -> Departamento -> Centro de costo) según el Excel entregado.
DO $$
DECLARE
    rel RECORD;
    v_dep INT;
    v_cc  INT;
BEGIN
    FOR rel IN
        SELECT * FROM (VALUES
            ('Cuidado y Bienestar',                  'CO.CB._CUIDADO_Y_BIENESTAR',                  '20-2004-200404'),
            ('Diagnóstico y Tecnologías de Soporte', 'CO.DT._DIAGNOSTICO_Y_TECNOLOGIAS_DE_SOPORTE', '20-2005-200502'),
            ('Terapias Quirúrgicas',                 'CO.EQ._ESPECIALIDADES_QUIRÚRGICAS',           '20-2002-200202'),
            ('Ortopédia',                            'CO.EQ._ESPECIALIDADES_QUIRÚRGICAS',           '20-2002-200203'),
            ('Salud Cardiovascular',                 'CO.SC._SALUD_CARDIOVASCULAR',                 '20-2003-200301'),
            ('Servicio Técnico',                     'CO.ST._SERVICIO_TÉCNICO',                     '20-2006-200601'),
            ('Cuidado Critico',                      'CO.TE._TERAPIAS_ESPECIALIZADAS',             '20-2001-200102')
        ) AS t(grupo, departamento, centro)
    LOOP
        SELECT Id INTO v_dep FROM cat.Departamento WHERE Nombre = rel.departamento;
        SELECT Id INTO v_cc  FROM cat.CentroCosto  WHERE Nombre = rel.centro;
        UPDATE cat.GrupoArticulo
           SET DepartamentoId = v_dep,
               CentroCostoId  = v_cc
         WHERE Nombre = rel.grupo;
    END LOOP;
END$$;

/* ---------- 3. FechaCreacion (ya existe; aseguramos por compatibilidad) ---------- */
ALTER TABLE dbo.Solicitud   ADD COLUMN IF NOT EXISTS FechaCreacion TIMESTAMP(0) NOT NULL DEFAULT (now() at time zone 'utc');
ALTER TABLE dbo.OrdenPedido ADD COLUMN IF NOT EXISTS FechaCreacion TIMESTAMP(0) NOT NULL DEFAULT (now() at time zone 'utc');

/* ============================================================================
   FIN. Verificación rápida (opcional):
     SELECT g.Nombre AS grupo, d.Nombre AS departamento, c.Nombre AS centro_costo
     FROM cat.GrupoArticulo g
     LEFT JOIN cat.Departamento d ON d.Id=g.DepartamentoId
     LEFT JOIN cat.CentroCosto  c ON c.Id=g.CentroCostoId
     ORDER BY d.Nombre, g.Nombre;
   ============================================================================ */
