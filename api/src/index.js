const { app } = require('@azure/functions');
const { sql, getPool } = require('./db');

/* ============================================================
   Utilidades
   ============================================================ */
function json(status, body) {
  return { status, jsonBody: body };
}

// Lee el usuario autenticado que inyecta Static Web Apps (Entra ID / SSO).
function getUser(request) {
  const header = request.headers.get('x-ms-client-principal');
  if (!header) return null;
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf8');
    const p = JSON.parse(decoded);
    return {
      id: p.userId,
      name: p.userDetails,
      roles: p.userRoles || [],
      provider: p.identityProvider
    };
  } catch {
    return null;
  }
}

/* Catálogos simples: clave usada por el frontend -> tabla física */
const CAT_TABLES = {
  grupo_articulo: 'cat.GrupoArticulo',
  centro_costo:   'cat.CentroCosto',
  unidades:       'cat.Unidad',
  empaque:        'cat.Empaque',
  tipo_implante:  'cat.TipoImplante',
  origen:         'cat.PaisOrigen',
  proveedores:    'cat.Proveedor',
  lote:           'cat.OpcionSiNo',
  es_implantable: 'cat.OpcionSiNo'
};

/* Mapa de campos del formulario -> columna en dbo.Solicitud */
const FIELD_MAP = [
  { key: 'codigo',         col: 'Codigo',                 type: 'text',   required: true },
  { key: 'nombre',         col: 'Nombre',                 type: 'text',   required: true },
  { key: 'departamento',   col: 'DepartamentoId',         type: 'dep',    required: true },
  { key: 'linea',          col: 'LineaId',                type: 'linea',  required: true },
  { key: 'familia',        col: 'FamiliaId',              type: 'familia',required: true },
  { key: 'grupo_articulo', col: 'GrupoArticuloId',        type: 'cat', cat: 'grupo_articulo' },
  { key: 'centro_costo',   col: 'CentroCostoId',          type: 'cat', cat: 'centro_costo' },
  { key: 'lote',           col: 'LoteId',                 type: 'cat', cat: 'lote' },
  { key: 'unidad_inv',     col: 'UnidadInventarioId',     type: 'cat', cat: 'unidades' },
  { key: 'unidad_compra',  col: 'UnidadCompraId',         type: 'cat', cat: 'unidades' },
  { key: 'unidad_venta',   col: 'UnidadVentaId',          type: 'cat', cat: 'unidades' },
  { key: 'empaque',        col: 'EmpaqueId',              type: 'cat', cat: 'empaque' },
  { key: 'cant_caja',      col: 'CantidadPorCaja',        type: 'int' },
  { key: 'proveedor',      col: 'ProveedorId',            type: 'cat', cat: 'proveedores', required: true },
  { key: 'pais_origen',    col: 'PaisOrigenId',           type: 'cat', cat: 'origen', required: true },
  { key: 'reg_sanitario',  col: 'RegistroSanitarioEMB',   type: 'text' },
  { key: 'fecha_venc',     col: 'FechaVencimientoEMB',    type: 'date' },
  { key: 'modelo',         col: 'Modelo',                 type: 'text' },
  { key: 'marca',          col: 'Marca',                  type: 'text' },
  { key: 'clasif_prov',    col: 'ClasificacionProveedor', type: 'text' },
  { key: 'tipo_implante',  col: 'TipoImplanteId',         type: 'cat', cat: 'tipo_implante' },
  { key: 'es_implantable', col: 'EsImplantableId',        type: 'cat', cat: 'es_implantable' },
  { key: 'desc_detallada', col: 'DescripcionDetallada',   type: 'text' },
  { key: 'que_es',         col: 'QueEs',                  type: 'text' },
  { key: 'para_que',       col: 'ParaQue',                type: 'text' },
  { key: 'caracteristicas',col: 'Caracteristicas',        type: 'text' },
  { key: 'usos',           col: 'Usos',                   type: 'text' },
  { key: 'queda_paciente', col: 'QuedaPacienteId',        type: 'cat', cat: 'es_implantable' },
  { key: 'materiales',     col: 'Materiales',             type: 'text' }
];

/* Consulta que devuelve un registro completo con los NOMBRES (no los IDs) */
const SELECT_FULL = `
SELECT s.Id AS id, s.Codigo AS codigo, s.Nombre AS nombre,
       dep.Nombre AS departamento, lin.Nombre AS linea, fam.Nombre AS familia,
       ga.Nombre AS grupo_articulo, cc.Nombre AS centro_costo,
       lo.Nombre AS lote, ui.Nombre AS unidad_inv, uc.Nombre AS unidad_compra, uv.Nombre AS unidad_venta,
       em.Nombre AS empaque, s.CantidadPorCaja AS cant_caja,
       pr.Nombre AS proveedor, po.Nombre AS pais_origen,
       s.RegistroSanitarioEMB AS reg_sanitario, CONVERT(varchar(10), s.FechaVencimientoEMB, 23) AS fecha_venc,
       s.Modelo AS modelo, s.Marca AS marca, s.ClasificacionProveedor AS clasif_prov,
       ti.Nombre AS tipo_implante, ei.Nombre AS es_implantable,
       s.DescripcionDetallada AS desc_detallada, s.QueEs AS que_es, s.ParaQue AS para_que,
       s.Caracteristicas AS caracteristicas, s.Usos AS usos, qp.Nombre AS queda_paciente, s.Materiales AS materiales
FROM dbo.Solicitud s
LEFT JOIN cat.Departamento dep ON dep.Id=s.DepartamentoId
LEFT JOIN cat.Linea        lin ON lin.Id=s.LineaId
LEFT JOIN cat.Familia      fam ON fam.Id=s.FamiliaId
LEFT JOIN cat.GrupoArticulo ga ON ga.Id=s.GrupoArticuloId
LEFT JOIN cat.CentroCosto   cc ON cc.Id=s.CentroCostoId
LEFT JOIN cat.OpcionSiNo    lo ON lo.Id=s.LoteId
LEFT JOIN cat.Unidad        ui ON ui.Id=s.UnidadInventarioId
LEFT JOIN cat.Unidad        uc ON uc.Id=s.UnidadCompraId
LEFT JOIN cat.Unidad        uv ON uv.Id=s.UnidadVentaId
LEFT JOIN cat.Empaque       em ON em.Id=s.EmpaqueId
LEFT JOIN cat.Proveedor     pr ON pr.Id=s.ProveedorId
LEFT JOIN cat.PaisOrigen    po ON po.Id=s.PaisOrigenId
LEFT JOIN cat.TipoImplante  ti ON ti.Id=s.TipoImplanteId
LEFT JOIN cat.OpcionSiNo    ei ON ei.Id=s.EsImplantableId
LEFT JOIN cat.OpcionSiNo    qp ON qp.Id=s.QuedaPacienteId`;

/* Resuelve el nombre de un catálogo a su Id (o null si viene vacío) */
async function catId(pool, table, name) {
  if (!name) return null;
  const r = await pool.request()
    .input('n', sql.NVarChar, name)
    .query(`SELECT TOP 1 Id FROM ${table} WHERE Nombre=@n`);
  if (!r.recordset.length) throw new Error(`Valor no encontrado en ${table}: "${name}"`);
  return r.recordset[0].Id;
}
async function depId(pool, name) { return catId(pool, 'cat.Departamento', name); }
async function lineaId(pool, name, depId) {
  if (!name) return null;
  const r = await pool.request()
    .input('n', sql.NVarChar, name).input('d', sql.Int, depId)
    .query(`SELECT TOP 1 Id FROM cat.Linea WHERE Nombre=@n AND DepartamentoId=@d`);
  if (!r.recordset.length) throw new Error(`Línea no encontrada: "${name}"`);
  return r.recordset[0].Id;
}
async function familiaId(pool, name, lineaId) {
  if (!name) return null;
  const r = await pool.request()
    .input('n', sql.NVarChar, name).input('l', sql.Int, lineaId)
    .query(`SELECT TOP 1 Id FROM cat.Familia WHERE Nombre=@n AND LineaId=@l`);
  if (!r.recordset.length) throw new Error(`Familia no encontrada: "${name}"`);
  return r.recordset[0].Id;
}

/* Convierte el cuerpo del formulario en {columna: valor} listo para INSERT/UPDATE */
async function resolveRecord(pool, body) {
  const out = {};
  const dId = await depId(pool, body.departamento);
  const lId = await lineaId(pool, body.linea, dId);
  const fId = await familiaId(pool, body.familia, lId);
  for (const f of FIELD_MAP) {
    const v = body[f.key];
    if (f.type === 'text')        out[f.col] = v ? String(v) : null;
    else if (f.type === 'int')    out[f.col] = v !== undefined && v !== '' && v !== null ? parseInt(v, 10) : null;
    else if (f.type === 'date')   out[f.col] = v ? v : null;
    else if (f.type === 'cat')    out[f.col] = await catId(pool, CAT_TABLES[f.cat], v);
    else if (f.type === 'dep')    out[f.col] = dId;
    else if (f.type === 'linea')  out[f.col] = lId;
    else if (f.type === 'familia')out[f.col] = fId;
  }
  return out;
}
function sqlType(f) {
  if (f.type === 'int' || f.col.endsWith('Id')) return sql.Int;
  if (f.type === 'date') return sql.Date;
  return sql.NVarChar;
}
function validateRequired(body) {
  const missing = FIELD_MAP.filter(f => f.required && !String(body[f.key] || '').trim()).map(f => f.key);
  return missing;
}

/* ============================================================
   /api/me  -> usuario autenticado
   ============================================================ */
app.http('me', {
  methods: ['GET'], authLevel: 'anonymous', route: 'me',
  handler: async (request) => {
    const user = getUser(request);
    if (!user) return json(401, { error: 'No autenticado' });
    return json(200, user);
  }
});

/* ============================================================
   /api/catalogos  -> todas las listas (misma forma que el DATA original)
   ============================================================ */
app.http('catalogos', {
  methods: ['GET'], authLevel: 'anonymous', route: 'catalogos',
  handler: async (request, context) => {
    try {
      const pool = await getPool();
      const one = async (table) => (await pool.request()
        .query(`SELECT Nombre FROM ${table} WHERE Activo=1 ORDER BY Nombre`))
        .recordset.map(r => r.Nombre);

      const [grupo_articulo, centro_costo, unidades, empaque, tipo_implante,
             origen, proveedores, sino] = await Promise.all([
        one('cat.GrupoArticulo'), one('cat.CentroCosto'), one('cat.Unidad'),
        one('cat.Empaque'), one('cat.TipoImplante'), one('cat.PaisOrigen'),
        one('cat.Proveedor'), one('cat.OpcionSiNo')
      ]);

      const deps = (await pool.request()
        .query(`SELECT Id, Nombre FROM cat.Departamento WHERE Activo=1 ORDER BY Nombre`)).recordset;
      const lineas = (await pool.request()
        .query(`SELECT l.Id, l.Nombre, d.Nombre AS Dep FROM cat.Linea l
                JOIN cat.Departamento d ON d.Id=l.DepartamentoId WHERE l.Activo=1 ORDER BY l.Nombre`)).recordset;
      const familias = (await pool.request()
        .query(`SELECT f.Nombre, l.Nombre AS Lin FROM cat.Familia f
                JOIN cat.Linea l ON l.Id=f.LineaId WHERE f.Activo=1 ORDER BY f.Nombre`)).recordset;

      const dept_lines = {};
      deps.forEach(d => dept_lines[d.Nombre] = []);
      lineas.forEach(l => { (dept_lines[l.Dep] = dept_lines[l.Dep] || []).push(l.Nombre); });
      const familiasMap = {};
      lineas.forEach(l => familiasMap[l.Nombre] = []);
      familias.forEach(f => { (familiasMap[f.Lin] = familiasMap[f.Lin] || []).push(f.Nombre); });

      return json(200, {
        departamentos: deps.map(d => d.Nombre),
        dept_lines, familias: familiasMap,
        grupo_articulo, centro_costo, unidades, empaque, tipo_implante,
        origen, proveedores, lote: sino, es_implantable: sino
      });
    } catch (e) {
      context.error(e);
      return json(500, { error: 'Error al cargar catálogos', detail: e.message });
    }
  }
});

/* ============================================================
   Gestión de opciones de un catálogo
   POST   /api/catalogos/{tipo}          body {valor, parent?}
   PUT    /api/catalogos/{tipo}/{valor}  body {nuevo, parent?}
   DELETE /api/catalogos/{tipo}/{valor}  ?parent=
   tipo puede ser un catálogo simple, "lineas" (parent=departamento) o "familias" (parent=linea)
   ============================================================ */
app.http('catalogo-add', {
  methods: ['POST'], authLevel: 'anonymous', route: 'catalogos/{tipo}',
  handler: async (request, context) => {
    try {
      const tipo = request.params.tipo;
      const body = await request.json();
      const valor = (body.valor || '').trim();
      if (!valor) return json(400, { error: 'Falta el valor' });
      const pool = await getPool();

      if (tipo === 'lineas') {
        const dId = await depId(pool, body.parent);
        await pool.request().input('d', sql.Int, dId).input('n', sql.NVarChar, valor)
          .query(`INSERT INTO cat.Linea (DepartamentoId, Nombre) VALUES (@d, @n)`);
      } else if (tipo === 'familias') {
        const dId = await depId(pool, body.parentDept);
        const lId = await lineaId(pool, body.parent, dId);
        await pool.request().input('l', sql.Int, lId).input('n', sql.NVarChar, valor)
          .query(`INSERT INTO cat.Familia (LineaId, Nombre) VALUES (@l, @n)`);
      } else if (CAT_TABLES[tipo]) {
        await pool.request().input('n', sql.NVarChar, valor)
          .query(`INSERT INTO ${CAT_TABLES[tipo]} (Nombre) VALUES (@n)`);
      } else {
        return json(400, { error: 'Catálogo desconocido: ' + tipo });
      }
      return json(201, { ok: true });
    } catch (e) {
      context.error(e);
      if (e.number === 2627 || e.number === 2601) return json(409, { error: 'Esa opción ya existe' });
      return json(500, { error: 'No se pudo agregar', detail: e.message });
    }
  }
});

app.http('catalogo-edit', {
  methods: ['PUT'], authLevel: 'anonymous', route: 'catalogos/{tipo}/{valor}',
  handler: async (request, context) => {
    try {
      const tipo = request.params.tipo;
      const actual = decodeURIComponent(request.params.valor);
      const body = await request.json();
      const nuevo = (body.nuevo || '').trim();
      if (!nuevo) return json(400, { error: 'Falta el nuevo valor' });
      const pool = await getPool();
      let table;
      if (tipo === 'lineas') table = 'cat.Linea';
      else if (tipo === 'familias') table = 'cat.Familia';
      else table = CAT_TABLES[tipo];
      if (!table) return json(400, { error: 'Catálogo desconocido' });
      const r = await pool.request().input('a', sql.NVarChar, actual).input('n', sql.NVarChar, nuevo)
        .query(`UPDATE ${table} SET Nombre=@n WHERE Nombre=@a`);
      return json(200, { ok: true, updated: r.rowsAffected[0] });
    } catch (e) {
      context.error(e);
      if (e.number === 2627 || e.number === 2601) return json(409, { error: 'Esa opción ya existe' });
      return json(500, { error: 'No se pudo actualizar', detail: e.message });
    }
  }
});

app.http('catalogo-delete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'catalogos/{tipo}/{valor}',
  handler: async (request, context) => {
    try {
      const tipo = request.params.tipo;
      const valor = decodeURIComponent(request.params.valor);
      const pool = await getPool();
      let table;
      if (tipo === 'lineas') table = 'cat.Linea';
      else if (tipo === 'familias') table = 'cat.Familia';
      else table = CAT_TABLES[tipo];
      if (!table) return json(400, { error: 'Catálogo desconocido' });
      await pool.request().input('v', sql.NVarChar, valor)
        .query(`DELETE FROM ${table} WHERE Nombre=@v`);
      return json(200, { ok: true });
    } catch (e) {
      context.error(e);
      if (e.number === 547) return json(409, { error: 'La opción está en uso y no se puede eliminar' });
      return json(500, { error: 'No se pudo eliminar', detail: e.message });
    }
  }
});

/* ============================================================
   Solicitudes (registros)
   ============================================================ */
app.http('solicitudes-list', {
  methods: ['GET'], authLevel: 'anonymous', route: 'solicitudes',
  handler: async (request, context) => {
    try {
      const pool = await getPool();
      const r = await pool.request().query(
        `SELECT Id AS id, Codigo AS codigo, Nombre AS nombre,
                Departamento AS departamento, Linea AS linea, Familia AS familia,
                Proveedor AS proveedor, PaisOrigen AS pais_origen
         FROM dbo.vSolicitud ORDER BY Id DESC`);
      return json(200, r.recordset);
    } catch (e) {
      context.error(e);
      return json(500, { error: 'Error al listar', detail: e.message });
    }
  }
});

app.http('solicitud-get', {
  methods: ['GET'], authLevel: 'anonymous', route: 'solicitudes/{id}',
  handler: async (request, context) => {
    try {
      const pool = await getPool();
      const r = await pool.request().input('id', sql.Int, parseInt(request.params.id, 10))
        .query(`${SELECT_FULL} WHERE s.Id=@id`);
      if (!r.recordset.length) return json(404, { error: 'No encontrado' });
      return json(200, r.recordset[0]);
    } catch (e) {
      context.error(e);
      return json(500, { error: 'Error al obtener', detail: e.message });
    }
  }
});

app.http('solicitud-create', {
  methods: ['POST'], authLevel: 'anonymous', route: 'solicitudes',
  handler: async (request, context) => {
    try {
      const user = getUser(request);
      const body = await request.json();
      const missing = validateRequired(body);
      if (missing.length) return json(400, { error: 'Faltan campos obligatorios', campos: missing });
      const pool = await getPool();
      const vals = await resolveRecord(pool, body);
      const cols = Object.keys(vals);
      const req = pool.request();
      cols.forEach((c, i) => {
        const f = FIELD_MAP.find(x => x.col === c);
        req.input('p' + i, sqlType(f), vals[c]);
      });
      req.input('creadoPor', sql.NVarChar, user ? user.name : null);
      const colList = cols.concat(['CreadoPor']).join(', ');
      const parList = cols.map((_, i) => '@p' + i).concat(['@creadoPor']).join(', ');
      const r = await req.query(
        `INSERT INTO dbo.Solicitud (${colList}) OUTPUT INSERTED.Id VALUES (${parList})`);
      return json(201, { ok: true, id: r.recordset[0].Id });
    } catch (e) {
      context.error(e);
      return json(500, { error: 'No se pudo crear el registro', detail: e.message });
    }
  }
});

app.http('solicitud-update', {
  methods: ['PUT'], authLevel: 'anonymous', route: 'solicitudes/{id}',
  handler: async (request, context) => {
    try {
      const user = getUser(request);
      const id = parseInt(request.params.id, 10);
      const body = await request.json();
      const missing = validateRequired(body);
      if (missing.length) return json(400, { error: 'Faltan campos obligatorios', campos: missing });
      const pool = await getPool();
      const vals = await resolveRecord(pool, body);
      const cols = Object.keys(vals);
      const req = pool.request().input('id', sql.Int, id);
      cols.forEach((c, i) => {
        const f = FIELD_MAP.find(x => x.col === c);
        req.input('p' + i, sqlType(f), vals[c]);
      });
      req.input('modPor', sql.NVarChar, user ? user.name : null);
      const setList = cols.map((c, i) => `${c}=@p${i}`)
        .concat(['ModificadoPor=@modPor', 'FechaModificacion=SYSUTCDATETIME()']).join(', ');
      await req.query(`UPDATE dbo.Solicitud SET ${setList} WHERE Id=@id`);
      return json(200, { ok: true });
    } catch (e) {
      context.error(e);
      return json(500, { error: 'No se pudo actualizar', detail: e.message });
    }
  }
});

app.http('solicitud-delete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'solicitudes/{id}',
  handler: async (request, context) => {
    try {
      const pool = await getPool();
      await pool.request().input('id', sql.Int, parseInt(request.params.id, 10))
        .query(`DELETE FROM dbo.Solicitud WHERE Id=@id`);
      return json(200, { ok: true });
    } catch (e) {
      context.error(e);
      return json(500, { error: 'No se pudo eliminar', detail: e.message });
    }
  }
});
