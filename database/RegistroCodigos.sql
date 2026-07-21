/* ============================================================================
   Base de datos: RegistroCodigos
   App: Solicitud de Creación de Código de Artículo
   Motor: Azure SQL Database (T-SQL)
   Generado a partir de los catálogos actuales del HTML (proyecto-base.html)
   ----------------------------------------------------------------------------
   Contenido:
     1. Esquemas
     2. Tablas de catálogo (listas desplegables gestionables con el botón +)
     3. Jerarquía Departamento -> Línea -> Familia
     4. Tabla principal de Solicitudes
     5. Vista aplanada para el grid principal
     6. Datos semilla (los mismos valores que hoy trae el HTML)
   ============================================================================ */

SET NOCOUNT ON;
GO

/* ---------- 1. Esquemas ---------- */
IF SCHEMA_ID('cat') IS NULL EXEC('CREATE SCHEMA cat');   -- catálogos
GO

/* ---------- 2. Limpieza (para poder re-ejecutar el script) ---------- */
IF OBJECT_ID('dbo.vSolicitud','V')      IS NOT NULL DROP VIEW  dbo.vSolicitud;
IF OBJECT_ID('dbo.Solicitud','U')       IS NOT NULL DROP TABLE dbo.Solicitud;
IF OBJECT_ID('cat.Familia','U')         IS NOT NULL DROP TABLE cat.Familia;
IF OBJECT_ID('cat.Linea','U')           IS NOT NULL DROP TABLE cat.Linea;
IF OBJECT_ID('cat.Departamento','U')    IS NOT NULL DROP TABLE cat.Departamento;
IF OBJECT_ID('cat.GrupoArticulo','U')   IS NOT NULL DROP TABLE cat.GrupoArticulo;
IF OBJECT_ID('cat.CentroCosto','U')     IS NOT NULL DROP TABLE cat.CentroCosto;
IF OBJECT_ID('cat.Unidad','U')          IS NOT NULL DROP TABLE cat.Unidad;
IF OBJECT_ID('cat.Empaque','U')         IS NOT NULL DROP TABLE cat.Empaque;
IF OBJECT_ID('cat.Proveedor','U')       IS NOT NULL DROP TABLE cat.Proveedor;
IF OBJECT_ID('cat.PaisOrigen','U')      IS NOT NULL DROP TABLE cat.PaisOrigen;
IF OBJECT_ID('cat.TipoImplante','U')    IS NOT NULL DROP TABLE cat.TipoImplante;
IF OBJECT_ID('cat.OpcionSiNo','U')      IS NOT NULL DROP TABLE cat.OpcionSiNo;
GO

/* ---------- 3. Tablas de catálogo simples ---------- */
CREATE TABLE cat.GrupoArticulo (Id INT IDENTITY(1,1) PRIMARY KEY, Nombre NVARCHAR(200) NOT NULL UNIQUE, Activo BIT NOT NULL DEFAULT 1);
CREATE TABLE cat.CentroCosto   (Id INT IDENTITY(1,1) PRIMARY KEY, Nombre NVARCHAR(100) NOT NULL UNIQUE, Activo BIT NOT NULL DEFAULT 1);
CREATE TABLE cat.Unidad        (Id INT IDENTITY(1,1) PRIMARY KEY, Nombre NVARCHAR(60)  NOT NULL UNIQUE, Activo BIT NOT NULL DEFAULT 1);
CREATE TABLE cat.Empaque       (Id INT IDENTITY(1,1) PRIMARY KEY, Nombre NVARCHAR(60)  NOT NULL UNIQUE, Activo BIT NOT NULL DEFAULT 1);
CREATE TABLE cat.Proveedor     (Id INT IDENTITY(1,1) PRIMARY KEY, Nombre NVARCHAR(200) NOT NULL UNIQUE, Activo BIT NOT NULL DEFAULT 1);
CREATE TABLE cat.PaisOrigen    (Id INT IDENTITY(1,1) PRIMARY KEY, Nombre NVARCHAR(120) NOT NULL UNIQUE, Activo BIT NOT NULL DEFAULT 1);
CREATE TABLE cat.TipoImplante  (Id INT IDENTITY(1,1) PRIMARY KEY, Nombre NVARCHAR(60)  NOT NULL UNIQUE, Activo BIT NOT NULL DEFAULT 1);
CREATE TABLE cat.OpcionSiNo    (Id INT IDENTITY(1,1) PRIMARY KEY, Nombre NVARCHAR(10)  NOT NULL UNIQUE, Activo BIT NOT NULL DEFAULT 1);
GO

/* ---------- 4. Jerarquía Departamento -> Línea -> Familia ---------- */
CREATE TABLE cat.Departamento (
    Id     INT IDENTITY(1,1) PRIMARY KEY,
    Nombre NVARCHAR(150) NOT NULL UNIQUE,
    Activo BIT NOT NULL DEFAULT 1
);
CREATE TABLE cat.Linea (
    Id             INT IDENTITY(1,1) PRIMARY KEY,
    DepartamentoId INT NOT NULL,
    Nombre         NVARCHAR(150) NOT NULL,
    Activo         BIT NOT NULL DEFAULT 1,
    CONSTRAINT FK_Linea_Departamento FOREIGN KEY (DepartamentoId) REFERENCES cat.Departamento(Id),
    CONSTRAINT UQ_Linea UNIQUE (DepartamentoId, Nombre)
);
CREATE TABLE cat.Familia (
    Id      INT IDENTITY(1,1) PRIMARY KEY,
    LineaId INT NOT NULL,
    Nombre  NVARCHAR(200) NOT NULL,
    Activo  BIT NOT NULL DEFAULT 1,
    CONSTRAINT FK_Familia_Linea FOREIGN KEY (LineaId) REFERENCES cat.Linea(Id),
    CONSTRAINT UQ_Familia UNIQUE (LineaId, Nombre)
);
GO

/* ---------- 5. Tabla principal de Solicitudes ---------- */
CREATE TABLE dbo.Solicitud (
    Id                    INT IDENTITY(1,1) PRIMARY KEY,
    Codigo                NVARCHAR(50)  NOT NULL,
    Nombre                NVARCHAR(300) NOT NULL,
    -- Información para procesos contables
    DepartamentoId        INT NOT NULL,
    LineaId               INT NOT NULL,
    FamiliaId             INT NOT NULL,
    GrupoArticuloId       INT NULL,
    CentroCostoId         INT NULL,
    -- Almacenamiento e inventarios
    LoteId                INT NULL,
    UnidadInventarioId    INT NULL,
    UnidadCompraId        INT NULL,
    UnidadVentaId         INT NULL,
    EmpaqueId             INT NULL,
    CantidadPorCaja       INT NULL,
    -- Compras e importaciones
    ProveedorId           INT NOT NULL,
    PaisOrigenId          INT NOT NULL,
    -- Registros sanitarios
    RegistroSanitarioEMB  NVARCHAR(100) NULL,
    FechaVencimientoEMB   DATE NULL,
    -- Estadísticos
    Modelo                NVARCHAR(150) NULL,
    Marca                 NVARCHAR(150) NULL,
    -- Calidad
    ClasificacionProveedor NVARCHAR(150) NULL,
    TipoImplanteId        INT NULL,
    EsImplantableId       INT NULL,
    -- Descripción del producto
    DescripcionDetallada  NVARCHAR(MAX) NULL,
    QueEs                 NVARCHAR(MAX) NULL,
    ParaQue               NVARCHAR(MAX) NULL,
    Caracteristicas       NVARCHAR(MAX) NULL,
    Usos                  NVARCHAR(MAX) NULL,
    QuedaPacienteId       INT NULL,
    Materiales            NVARCHAR(300) NULL,
    -- Auditoría
    CreadoPor             NVARCHAR(200) NULL,
    FechaCreacion         DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME(),
    ModificadoPor         NVARCHAR(200) NULL,
    FechaModificacion     DATETIME2(0)  NULL,
    CONSTRAINT FK_Sol_Departamento  FOREIGN KEY (DepartamentoId)     REFERENCES cat.Departamento(Id),
    CONSTRAINT FK_Sol_Linea         FOREIGN KEY (LineaId)            REFERENCES cat.Linea(Id),
    CONSTRAINT FK_Sol_Familia       FOREIGN KEY (FamiliaId)          REFERENCES cat.Familia(Id),
    CONSTRAINT FK_Sol_Grupo         FOREIGN KEY (GrupoArticuloId)    REFERENCES cat.GrupoArticulo(Id),
    CONSTRAINT FK_Sol_CentroCosto   FOREIGN KEY (CentroCostoId)      REFERENCES cat.CentroCosto(Id),
    CONSTRAINT FK_Sol_Lote          FOREIGN KEY (LoteId)             REFERENCES cat.OpcionSiNo(Id),
    CONSTRAINT FK_Sol_UnidadInv     FOREIGN KEY (UnidadInventarioId) REFERENCES cat.Unidad(Id),
    CONSTRAINT FK_Sol_UnidadCompra  FOREIGN KEY (UnidadCompraId)     REFERENCES cat.Unidad(Id),
    CONSTRAINT FK_Sol_UnidadVenta   FOREIGN KEY (UnidadVentaId)      REFERENCES cat.Unidad(Id),
    CONSTRAINT FK_Sol_Empaque       FOREIGN KEY (EmpaqueId)          REFERENCES cat.Empaque(Id),
    CONSTRAINT FK_Sol_Proveedor     FOREIGN KEY (ProveedorId)        REFERENCES cat.Proveedor(Id),
    CONSTRAINT FK_Sol_PaisOrigen    FOREIGN KEY (PaisOrigenId)       REFERENCES cat.PaisOrigen(Id),
    CONSTRAINT FK_Sol_TipoImplante  FOREIGN KEY (TipoImplanteId)     REFERENCES cat.TipoImplante(Id),
    CONSTRAINT FK_Sol_EsImplantable FOREIGN KEY (EsImplantableId)    REFERENCES cat.OpcionSiNo(Id),
    CONSTRAINT FK_Sol_QuedaPaciente FOREIGN KEY (QuedaPacienteId)    REFERENCES cat.OpcionSiNo(Id)
);
GO

CREATE INDEX IX_Solicitud_Codigo      ON dbo.Solicitud(Codigo);
CREATE INDEX IX_Solicitud_Departamento ON dbo.Solicitud(DepartamentoId);
GO

/* ---------- 6. Vista aplanada para el grid principal ---------- */
CREATE VIEW dbo.vSolicitud AS
SELECT  s.Id,
        s.Codigo,
        s.Nombre,
        dep.Nombre  AS Departamento,
        lin.Nombre  AS Linea,
        fam.Nombre  AS Familia,
        prov.Nombre AS Proveedor,
        pais.Nombre AS PaisOrigen,
        s.FechaCreacion,
        s.CreadoPor
FROM dbo.Solicitud s
JOIN cat.Departamento dep ON dep.Id = s.DepartamentoId
JOIN cat.Linea        lin ON lin.Id = s.LineaId
JOIN cat.Familia      fam ON fam.Id = s.FamiliaId
JOIN cat.Proveedor    prov ON prov.Id = s.ProveedorId
JOIN cat.PaisOrigen   pais ON pais.Id = s.PaisOrigenId;
GO

/* ============================================================================
   DATOS SEMILLA
   ============================================================================ */


/* cat.OpcionSiNo */
INSERT INTO cat.OpcionSiNo (Nombre) VALUES (N'Si');
INSERT INTO cat.OpcionSiNo (Nombre) VALUES (N'No');
GO

/* cat.GrupoArticulo */
INSERT INTO cat.GrupoArticulo (Nombre) VALUES (N'Cuidado Critico');
INSERT INTO cat.GrupoArticulo (Nombre) VALUES (N'Cuidado Crónico');
INSERT INTO cat.GrupoArticulo (Nombre) VALUES (N'Terapias Quirúrgicas');
INSERT INTO cat.GrupoArticulo (Nombre) VALUES (N'Ortopédia');
INSERT INTO cat.GrupoArticulo (Nombre) VALUES (N'Salud Cardiovascular');
INSERT INTO cat.GrupoArticulo (Nombre) VALUES (N'Cuidado y Bienestar');
INSERT INTO cat.GrupoArticulo (Nombre) VALUES (N'Diagnóstico y Tecnologías de Soporte');
INSERT INTO cat.GrupoArticulo (Nombre) VALUES (N'Servicio Técnico');
GO

/* cat.CentroCosto */
INSERT INTO cat.CentroCosto (Nombre) VALUES (N'20-2001-200102');
INSERT INTO cat.CentroCosto (Nombre) VALUES (N'20-2001-200103');
INSERT INTO cat.CentroCosto (Nombre) VALUES (N'20-2002-200202');
INSERT INTO cat.CentroCosto (Nombre) VALUES (N'20-2002-200203');
INSERT INTO cat.CentroCosto (Nombre) VALUES (N'20-2003-200301');
INSERT INTO cat.CentroCosto (Nombre) VALUES (N'20-2004-200404');
INSERT INTO cat.CentroCosto (Nombre) VALUES (N'20-2005-200502');
INSERT INTO cat.CentroCosto (Nombre) VALUES (N'20-2005-200503');
GO

/* cat.Unidad */
INSERT INTO cat.Unidad (Nombre) VALUES (N'Unidad');
INSERT INTO cat.Unidad (Nombre) VALUES (N'Caja');
INSERT INTO cat.Unidad (Nombre) VALUES (N'Bolsa');
INSERT INTO cat.Unidad (Nombre) VALUES (N'Paquete');
INSERT INTO cat.Unidad (Nombre) VALUES (N'Kit');
INSERT INTO cat.Unidad (Nombre) VALUES (N'Frasco');
INSERT INTO cat.Unidad (Nombre) VALUES (N'Ampolla');
INSERT INTO cat.Unidad (Nombre) VALUES (N'Rollo');
GO

/* cat.Empaque */
INSERT INTO cat.Empaque (Nombre) VALUES (N'Unidad');
INSERT INTO cat.Empaque (Nombre) VALUES (N'Caja');
INSERT INTO cat.Empaque (Nombre) VALUES (N'Bolsa');
GO

/* cat.TipoImplante */
INSERT INTO cat.TipoImplante (Nombre) VALUES (N'Permanente');
INSERT INTO cat.TipoImplante (Nombre) VALUES (N'Temporal');
INSERT INTO cat.TipoImplante (Nombre) VALUES (N'No');
INSERT INTO cat.TipoImplante (Nombre) VALUES (N'Por definir');
GO

/* cat.PaisOrigen */
INSERT INTO cat.PaisOrigen (Nombre) VALUES (N'CAN - Canadá');
INSERT INTO cat.PaisOrigen (Nombre) VALUES (N'CHN - China');
INSERT INTO cat.PaisOrigen (Nombre) VALUES (N'COL - Colombia');
INSERT INTO cat.PaisOrigen (Nombre) VALUES (N'CRI - Costa Rica');
INSERT INTO cat.PaisOrigen (Nombre) VALUES (N'SLV - El Salvador');
INSERT INTO cat.PaisOrigen (Nombre) VALUES (N'FRA - Francia');
INSERT INTO cat.PaisOrigen (Nombre) VALUES (N'DEU - Alemania');
INSERT INTO cat.PaisOrigen (Nombre) VALUES (N'GTM - Guatemala');
INSERT INTO cat.PaisOrigen (Nombre) VALUES (N'HND - Honduras');
INSERT INTO cat.PaisOrigen (Nombre) VALUES (N'ITA - Italia');
INSERT INTO cat.PaisOrigen (Nombre) VALUES (N'JPN - Japón');
INSERT INTO cat.PaisOrigen (Nombre) VALUES (N'MEX - México');
INSERT INTO cat.PaisOrigen (Nombre) VALUES (N'NLD - Países Bajos');
INSERT INTO cat.PaisOrigen (Nombre) VALUES (N'NIC - Nicaragua');
INSERT INTO cat.PaisOrigen (Nombre) VALUES (N'PAN - Panamá');
INSERT INTO cat.PaisOrigen (Nombre) VALUES (N'PER - Perú');
INSERT INTO cat.PaisOrigen (Nombre) VALUES (N'ESP - España');
INSERT INTO cat.PaisOrigen (Nombre) VALUES (N'TWN - Taiwán');
INSERT INTO cat.PaisOrigen (Nombre) VALUES (N'GBR - Reino Unido');
INSERT INTO cat.PaisOrigen (Nombre) VALUES (N'USA - Estados Unidos');
GO

/* cat.Proveedor */
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00001 - ABBOTT VASCULAR');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00006 - FRESENIUS MEDICAL CARE');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00007 - INTRA SPECIAL CATHETERS');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00009 - VICTUS');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00010 - TORAY MARKETING AND SALES AMERICA INC');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00012 - SMITHS MEDICAL INTERNATIONAL LTD');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00013 - SUPPORT ADVANCED MEDICAL NUTRITION');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00014 - DRAGERWERK AG & CO KGAA');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00015 - ABBOT VASCULAR DEVICES HOLAND');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00023 - CORPORACIÓN BIOMUR S A');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00065 - MCMILLAN COMPANY INC');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00075 - HANNA INSTRUMENTS COSTA RICA SOCIEDAD ANONIMA');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00098 - D.A. MEDICA DE COSTA RICA S.A.');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00152 - CYTOSORBENTS EUROPE GMBH');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00153 - B BRAUN SURGICAL S A ( BARCELONA )');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00169 - FRESENIUS MEDICAL CARE PANAMA');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00210 - AESCULAP AG');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00236 - APEX MEDICAL');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00353 - B.BRAUN MEDICAL DE MEXICO S.A.P.I  DE C.V.');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00357 - AQUAPURA S A');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00369 - ELVATRON S A');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00372 - FRESENIUS ANDINA S A S');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00398 - MERIT MEDICAL');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00413 - B BRAUN MEDICAL INC');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00415 - GERARD O ELSNER LTDA');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00426 - ORION INTERMED S J D M S A');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00441 - B BRAUN MELSUNGEN AG');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00446 - B BRAUN MEDICAL CENTRAL AMERICA & CARIBE S A');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00449 - CAPRIS');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00465 - SCHMITZ U SOHNE GMBH & CO KG');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00503 - BOSTON SCIENTIFIC INTERNATIONAL BV');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00505 - MEDTRONIC LOGISTICS LLC');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00516 - B BRAUN MEDICAL PERU S A');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00521 - PRAXAIR COSTA RICA S.A.');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00541 - NEOMEDIC INTERNATIONAL');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00549 - PROVEEDORES ONLINE');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00554 - SUPLI SERVICIOS S A');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00557 - MEDITEK SERVICES SOCIEDAD ANONIMA');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00565 - OPTIMA MOLLITER SRL');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00646 - ST JUDE (ABBOTT LABORATORIES)');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00715 - BSN MEDICAL DC S.A. DE C.V');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00748 - YIRE MEDICA H P SOCIEDAD ANONIMA');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00757 - Advance Laboratorios S.A');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00779 - Medtronic-Kanghui');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00872 - DORNIER MEDTECH AMERICA INC');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00881 - DRAEGER COLOMBIA S.A');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00889 - ROMANAS OCONY S.A.');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00890 - KAMS INDUSTRIAL, S.A.');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00933 - AVANOS');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00961 - CHARDER ELECTRONIC CO., LTD');
INSERT INTO cat.Proveedor (Nombre) VALUES (N'00986 - CLINARIS GMBH');
GO

/* cat.Departamento */
INSERT INTO cat.Departamento (Nombre) VALUES (N'CO.CB._CUIDADO_Y_BIENESTAR');
INSERT INTO cat.Departamento (Nombre) VALUES (N'CO.DT._DIAGNOSTICO_Y_TECNOLOGIAS_DE_SOPORTE');
INSERT INTO cat.Departamento (Nombre) VALUES (N'CO.EQ._ESPECIALIDADES_QUIRÚRGICAS');
INSERT INTO cat.Departamento (Nombre) VALUES (N'CO.SC._SALUD_CARDIOVASCULAR');
INSERT INTO cat.Departamento (Nombre) VALUES (N'CO.ST._SERVICIO_TÉCNICO');
INSERT INTO cat.Departamento (Nombre) VALUES (N'CO.TE._TERAPIAS_ESPECIALIZADAS');
GO

/* cat.Linea (referencia el Departamento por nombre) */
INSERT INTO cat.Linea (DepartamentoId, Nombre) SELECT Id, N'CO.CB.1._HERIDAS' FROM cat.Departamento WHERE Nombre=N'CO.CB._CUIDADO_Y_BIENESTAR';
INSERT INTO cat.Linea (DepartamentoId, Nombre) SELECT Id, N'CO.CB.2._NUTRICIÓN' FROM cat.Departamento WHERE Nombre=N'CO.CB._CUIDADO_Y_BIENESTAR';
INSERT INTO cat.Linea (DepartamentoId, Nombre) SELECT Id, N'CO.CB.3._MUESTRAS' FROM cat.Departamento WHERE Nombre=N'CO.CB._CUIDADO_Y_BIENESTAR';
INSERT INTO cat.Linea (DepartamentoId, Nombre) SELECT Id, N'CO.DT.1._TERAPIAS_QUIRURGICAS' FROM cat.Departamento WHERE Nombre=N'CO.DT._DIAGNOSTICO_Y_TECNOLOGIAS_DE_SOPORTE';
INSERT INTO cat.Linea (DepartamentoId, Nombre) SELECT Id, N'CO.DT.2._MUESTRAS' FROM cat.Departamento WHERE Nombre=N'CO.DT._DIAGNOSTICO_Y_TECNOLOGIAS_DE_SOPORTE';
INSERT INTO cat.Linea (DepartamentoId, Nombre) SELECT Id, N'CO.EQ.1._CUIDADO_HOSPITALARIO' FROM cat.Departamento WHERE Nombre=N'CO.EQ._ESPECIALIDADES_QUIRÚRGICAS';
INSERT INTO cat.Linea (DepartamentoId, Nombre) SELECT Id, N'CO.EQ.2._TERAPIAS_QUIRURGICAS' FROM cat.Departamento WHERE Nombre=N'CO.EQ._ESPECIALIDADES_QUIRÚRGICAS';
INSERT INTO cat.Linea (DepartamentoId, Nombre) SELECT Id, N'CO.EQ.3._ORTOPEDÍA' FROM cat.Departamento WHERE Nombre=N'CO.EQ._ESPECIALIDADES_QUIRÚRGICAS';
INSERT INTO cat.Linea (DepartamentoId, Nombre) SELECT Id, N'CO.EQ.4._MUESTRA' FROM cat.Departamento WHERE Nombre=N'CO.EQ._ESPECIALIDADES_QUIRÚRGICAS';
INSERT INTO cat.Linea (DepartamentoId, Nombre) SELECT Id, N'CO.SC.1._CARDIOLOGÍA_INTERVENCIONISTA' FROM cat.Departamento WHERE Nombre=N'CO.SC._SALUD_CARDIOVASCULAR';
INSERT INTO cat.Linea (DepartamentoId, Nombre) SELECT Id, N'CO.SC.2._ESTRUCTURAL' FROM cat.Departamento WHERE Nombre=N'CO.SC._SALUD_CARDIOVASCULAR';
INSERT INTO cat.Linea (DepartamentoId, Nombre) SELECT Id, N'CO.SC.3._NEUROVASCULAR' FROM cat.Departamento WHERE Nombre=N'CO.SC._SALUD_CARDIOVASCULAR';
INSERT INTO cat.Linea (DepartamentoId, Nombre) SELECT Id, N'CO.SC.4._VASCULAR_PERIFERICO' FROM cat.Departamento WHERE Nombre=N'CO.SC._SALUD_CARDIOVASCULAR';
INSERT INTO cat.Linea (DepartamentoId, Nombre) SELECT Id, N'CO.SC.5._MUESTRAS' FROM cat.Departamento WHERE Nombre=N'CO.SC._SALUD_CARDIOVASCULAR';
INSERT INTO cat.Linea (DepartamentoId, Nombre) SELECT Id, N'CO.ST.1._HERRAMIENTA' FROM cat.Departamento WHERE Nombre=N'CO.ST._SERVICIO_TÉCNICO';
INSERT INTO cat.Linea (DepartamentoId, Nombre) SELECT Id, N'CO.ST.2._REPUESTOS' FROM cat.Departamento WHERE Nombre=N'CO.ST._SERVICIO_TÉCNICO';
INSERT INTO cat.Linea (DepartamentoId, Nombre) SELECT Id, N'CO.ST.3._SERVICIOS' FROM cat.Departamento WHERE Nombre=N'CO.ST._SERVICIO_TÉCNICO';
INSERT INTO cat.Linea (DepartamentoId, Nombre) SELECT Id, N'CO.TE.1._CUIDADO_CRÍTICO' FROM cat.Departamento WHERE Nombre=N'CO.TE._TERAPIAS_ESPECIALIZADAS';
INSERT INTO cat.Linea (DepartamentoId, Nombre) SELECT Id, N'CO.TE.2._CUIDADO_CRÓNICO' FROM cat.Departamento WHERE Nombre=N'CO.TE._TERAPIAS_ESPECIALIZADAS';
INSERT INTO cat.Linea (DepartamentoId, Nombre) SELECT Id, N'CO.TE.3._MUESTRA' FROM cat.Departamento WHERE Nombre=N'CO.TE._TERAPIAS_ESPECIALIZADAS';
GO

/* cat.Familia (referencia la Línea por nombre) */
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.CB.1.1. PIE DIABETICO' FROM cat.Linea WHERE Nombre=N'CO.CB.1._HERIDAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.CB.1.2. CUIDADO DE LA PIEL' FROM cat.Linea WHERE Nombre=N'CO.CB.1._HERIDAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.CB.2.1. DIABETES' FROM cat.Linea WHERE Nombre=N'CO.CB.2._NUTRICIÓN';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.CB.2.2. ESPECIALIZADA' FROM cat.Linea WHERE Nombre=N'CO.CB.2._NUTRICIÓN';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.CB.2.3. GENERAL' FROM cat.Linea WHERE Nombre=N'CO.CB.2._NUTRICIÓN';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.CB.2.4. PEDIATRICA' FROM cat.Linea WHERE Nombre=N'CO.CB.2._NUTRICIÓN';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.CB.3.1. HERIDAS' FROM cat.Linea WHERE Nombre=N'CO.CB.3._MUESTRAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.CB.3.2. DISPOSITIVOS Y EQUIPOS NUTRICIONALES' FROM cat.Linea WHERE Nombre=N'CO.CB.3._MUESTRAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.CB.3.3. NUTRICIÓN' FROM cat.Linea WHERE Nombre=N'CO.CB.3._MUESTRAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.DT.1.1. SOPORTE QUIRURGICO' FROM cat.Linea WHERE Nombre=N'CO.DT.1._TERAPIAS_QUIRURGICAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.DT.1.2. GINECOLOGIA (EQUIPOS)' FROM cat.Linea WHERE Nombre=N'CO.DT.1._TERAPIAS_QUIRURGICAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.DT.2.1. TERAPIAS QUIRURGICA' FROM cat.Linea WHERE Nombre=N'CO.DT.2._MUESTRAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.DT.2.2. MUESTRA' FROM cat.Linea WHERE Nombre=N'CO.DT.2._MUESTRAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.1.1. ANESTESIA' FROM cat.Linea WHERE Nombre=N'CO.EQ.1._CUIDADO_HOSPITALARIO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.1.2. BOMBA INFUSION' FROM cat.Linea WHERE Nombre=N'CO.EQ.1._CUIDADO_HOSPITALARIO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.2.1. GINECOLOGIA' FROM cat.Linea WHERE Nombre=N'CO.EQ.2._TERAPIAS_QUIRURGICAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.2.2. UROLOGIA' FROM cat.Linea WHERE Nombre=N'CO.EQ.2._TERAPIAS_QUIRURGICAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.2.3. ENDOSCOPÍA' FROM cat.Linea WHERE Nombre=N'CO.EQ.2._TERAPIAS_QUIRURGICAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.2.4. INSTRUMENTAL DE CIRUGIA ABIERTA' FROM cat.Linea WHERE Nombre=N'CO.EQ.2._TERAPIAS_QUIRURGICAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.2.5. LAPAROSCOPIA' FROM cat.Linea WHERE Nombre=N'CO.EQ.2._TERAPIAS_QUIRURGICAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.2.6. TECNOLOGÍA DE CIERRE' FROM cat.Linea WHERE Nombre=N'CO.EQ.2._TERAPIAS_QUIRURGICAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.2.7. MOTORES DE CIRUGIA' FROM cat.Linea WHERE Nombre=N'CO.EQ.2._TERAPIAS_QUIRURGICAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.2.8. GASTROSTOMIA' FROM cat.Linea WHERE Nombre=N'CO.EQ.2._TERAPIAS_QUIRURGICAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.2.9. SOPORTE QUIRURGICO' FROM cat.Linea WHERE Nombre=N'CO.EQ.2._TERAPIAS_QUIRURGICAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.3.1. MOTORES' FROM cat.Linea WHERE Nombre=N'CO.EQ.3._ORTOPEDÍA';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.3.10. TORNILLOS' FROM cat.Linea WHERE Nombre=N'CO.EQ.3._ORTOPEDÍA';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.3.2. TRAUMA' FROM cat.Linea WHERE Nombre=N'CO.EQ.3._ORTOPEDÍA';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.3.3. ORTOPEDÍA' FROM cat.Linea WHERE Nombre=N'CO.EQ.3._ORTOPEDÍA';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.3.4. FIJACIÓN TEMPORAL' FROM cat.Linea WHERE Nombre=N'CO.EQ.3._ORTOPEDÍA';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.3.5. INSTRUMENTAL TRAUMA' FROM cat.Linea WHERE Nombre=N'CO.EQ.3._ORTOPEDÍA';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.3.6. MINI FRAGMENTOS' FROM cat.Linea WHERE Nombre=N'CO.EQ.3._ORTOPEDÍA';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.3.7. PEQUEÑOS FRAGMENTOS' FROM cat.Linea WHERE Nombre=N'CO.EQ.3._ORTOPEDÍA';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.3.8. SIERRAS' FROM cat.Linea WHERE Nombre=N'CO.EQ.3._ORTOPEDÍA';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.3.9. GRANDES FRAGMENTOS' FROM cat.Linea WHERE Nombre=N'CO.EQ.3._ORTOPEDÍA';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.4.1. TERAPIAS QUIRURGICA' FROM cat.Linea WHERE Nombre=N'CO.EQ.4._MUESTRA';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.EQ.4.4. ANESTESIA' FROM cat.Linea WHERE Nombre=N'CO.EQ.4._MUESTRA';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.1.1. ACCESORIOS PARA PROCEDIMIENTOS CARDIOVASCULARES' FROM cat.Linea WHERE Nombre=N'CO.SC.1._CARDIOLOGÍA_INTERVENCIONISTA';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.1.2. GUIAS CORONARIAS' FROM cat.Linea WHERE Nombre=N'CO.SC.1._CARDIOLOGÍA_INTERVENCIONISTA';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.1.3. STENTS CORONARIOS' FROM cat.Linea WHERE Nombre=N'CO.SC.1._CARDIOLOGÍA_INTERVENCIONISTA';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.1.4. BALONES CORONARIOS' FROM cat.Linea WHERE Nombre=N'CO.SC.1._CARDIOLOGÍA_INTERVENCIONISTA';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.2.1. TAVI' FROM cat.Linea WHERE Nombre=N'CO.SC.2._ESTRUCTURAL';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.2.2. VALVULAS BIOLOGICAS' FROM cat.Linea WHERE Nombre=N'CO.SC.2._ESTRUCTURAL';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.2.3. ANILLOS' FROM cat.Linea WHERE Nombre=N'CO.SC.2._ESTRUCTURAL';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.2.4. MITRACLIP' FROM cat.Linea WHERE Nombre=N'CO.SC.2._ESTRUCTURAL';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.2.5. AMPLATZER' FROM cat.Linea WHERE Nombre=N'CO.SC.2._ESTRUCTURAL';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.2.6. VALVULAS MECANICAS' FROM cat.Linea WHERE Nombre=N'CO.SC.2._ESTRUCTURAL';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.2.7. PARCHES DE PERICARDIO' FROM cat.Linea WHERE Nombre=N'CO.SC.2._ESTRUCTURAL';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.3.1. DISPOSITIVOS PARA EMBOLIZACION' FROM cat.Linea WHERE Nombre=N'CO.SC.3._NEUROVASCULAR';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.3.2. STENTS NEUROVASCULAR' FROM cat.Linea WHERE Nombre=N'CO.SC.3._NEUROVASCULAR';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.3.3. MICROCATETER' FROM cat.Linea WHERE Nombre=N'CO.SC.3._NEUROVASCULAR';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.3.4. DISPOSITIVOS PARA REMODELAMIENTO' FROM cat.Linea WHERE Nombre=N'CO.SC.3._NEUROVASCULAR';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.3.5. MICROGUÍAS' FROM cat.Linea WHERE Nombre=N'CO.SC.3._NEUROVASCULAR';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.4.1. STENTS PERIFERICOS' FROM cat.Linea WHERE Nombre=N'CO.SC.4._VASCULAR_PERIFERICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.4.2. ACCESORIOS VASCULAR PERIFERICO' FROM cat.Linea WHERE Nombre=N'CO.SC.4._VASCULAR_PERIFERICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.4.3. BALONES PERIFERICOS' FROM cat.Linea WHERE Nombre=N'CO.SC.4._VASCULAR_PERIFERICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.4.4. DISPOSITIVOS PARA PROTECCION DISTAL Y PROXIMAL' FROM cat.Linea WHERE Nombre=N'CO.SC.4._VASCULAR_PERIFERICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.4.5. GUIAS PERIFERICAS' FROM cat.Linea WHERE Nombre=N'CO.SC.4._VASCULAR_PERIFERICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.5.1. ESTRUCTURAL' FROM cat.Linea WHERE Nombre=N'CO.SC.5._MUESTRAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.5.2. CARDIOLOGÍA INTERVENCIONISTA' FROM cat.Linea WHERE Nombre=N'CO.SC.5._MUESTRAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.5.3. NEUROVASCULAR' FROM cat.Linea WHERE Nombre=N'CO.SC.5._MUESTRAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.5.5. MUESTRA' FROM cat.Linea WHERE Nombre=N'CO.SC.5._MUESTRAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.SC.5.6. TAVI' FROM cat.Linea WHERE Nombre=N'CO.SC.5._MUESTRAS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.1.1. HERRAMIENTA USO GENERAL' FROM cat.Linea WHERE Nombre=N'CO.ST.1._HERRAMIENTA';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.1. BOMBA INFUSION' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.10. LAMPARAS' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.11. BILIRRUBINÓMETRO' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.12. VENTILACION MECANICA' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.13. HEMOFILTRADOR' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.14. PERITONEAL' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.15. ESTRUCTURAL' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.16. LLENADORA PINNACLE' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.17. ACCESORIOS PARA VENTILACION MECANICA' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.18. UROLOGIA' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.19. FOTOTERAPIA' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.2. HEMODIALISIS' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.20. DERMATOMO' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.22. SISTEMAS TRATAMIENTO DE AGUA' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.3. MONITORES' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.4. OSMOSIS INVERSA' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.5. MESAS QUIRURGICAS' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.6. SILLA GINECOLOGICAS' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.7. ANESTESIA' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.8. INCUBADORAS' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.9. INFRAESTRUCTURA' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.2.21. INCUBADORAS' FROM cat.Linea WHERE Nombre=N'CO.ST.2._REPUESTOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.ST.3.1. MANO DE OBRA' FROM cat.Linea WHERE Nombre=N'CO.ST.3._SERVICIOS';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.TE.1.1. HIGIENE BRONQUIAL' FROM cat.Linea WHERE Nombre=N'CO.TE.1._CUIDADO_CRÍTICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.TE.1.10. EXPANSION PULMONAR' FROM cat.Linea WHERE Nombre=N'CO.TE.1._CUIDADO_CRÍTICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.TE.1.11. TERAPIAS INTRAVENOSAS' FROM cat.Linea WHERE Nombre=N'CO.TE.1._CUIDADO_CRÍTICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.TE.1.12. NUTRICIÓN PARENTERAL Y CONTROL DE LA VOLEMIA' FROM cat.Linea WHERE Nombre=N'CO.TE.1._CUIDADO_CRÍTICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.TE.1.13. CATETER DE DREANJE PLEURAL' FROM cat.Linea WHERE Nombre=N'CO.TE.1._CUIDADO_CRÍTICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.TE.1.14. ACCESORIOS PARA NUTRICION ENTERAL' FROM cat.Linea WHERE Nombre=N'CO.TE.1._CUIDADO_CRÍTICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.TE.1.15. ANESTESIA' FROM cat.Linea WHERE Nombre=N'CO.TE.1._CUIDADO_CRÍTICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.TE.1.16. CUIDADO RESPIRATORIO' FROM cat.Linea WHERE Nombre=N'CO.TE.1._CUIDADO_CRÍTICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.TE.1.2. MONITOREO' FROM cat.Linea WHERE Nombre=N'CO.TE.1._CUIDADO_CRÍTICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.TE.1.3. VENTILACION MECANICA' FROM cat.Linea WHERE Nombre=N'CO.TE.1._CUIDADO_CRÍTICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.TE.1.4. LABORATORIO CLÍNICO' FROM cat.Linea WHERE Nombre=N'CO.TE.1._CUIDADO_CRÍTICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.TE.1.5. CUIDADO NEONATAL' FROM cat.Linea WHERE Nombre=N'CO.TE.1._CUIDADO_CRÍTICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.TE.1.6. TRRC' FROM cat.Linea WHERE Nombre=N'CO.TE.1._CUIDADO_CRÍTICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.TE.1.7. BIOSEGURIDAD' FROM cat.Linea WHERE Nombre=N'CO.TE.1._CUIDADO_CRÍTICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.TE.1.8. BOMBA INFUSION' FROM cat.Linea WHERE Nombre=N'CO.TE.1._CUIDADO_CRÍTICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.TE.1.9. SUPLEMENTOS DE VÍA AEREA' FROM cat.Linea WHERE Nombre=N'CO.TE.1._CUIDADO_CRÍTICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.TE.2.1. HEMODIALISIS' FROM cat.Linea WHERE Nombre=N'CO.TE.2._CUIDADO_CRÓNICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.TE.2.2. HEMATO-ONCOLOGÍA Y CUIDADO PALIATIVO' FROM cat.Linea WHERE Nombre=N'CO.TE.2._CUIDADO_CRÓNICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.TE.2.3. PERITONEAL' FROM cat.Linea WHERE Nombre=N'CO.TE.2._CUIDADO_CRÓNICO';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.TE.3.1. CUIDADO CRÍTICO' FROM cat.Linea WHERE Nombre=N'CO.TE.3._MUESTRA';
INSERT INTO cat.Familia (LineaId, Nombre) SELECT Id, N'CO.TE.3.2. CUIDADO CRÓNICO' FROM cat.Linea WHERE Nombre=N'CO.TE.3._MUESTRA';
GO

/* ============================================================================
   FIN. Verificación rápida (opcional):
     SELECT (SELECT COUNT(*) FROM cat.Departamento) AS Departamentos,
            (SELECT COUNT(*) FROM cat.Linea)        AS Lineas,
            (SELECT COUNT(*) FROM cat.Familia)      AS Familias,
            (SELECT COUNT(*) FROM cat.Proveedor)    AS Proveedores;
   ============================================================================ */
