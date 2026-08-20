const { app } = require('@azure/functions');
const { query } = require('./db');

/* ============================================================
   Utilidades
   ============================================================ */
function json(status, body) {
  return { status, jsonBody: body };
}

// Errores de PostgreSQL: 23505 = violación de UNIQUE, 23503 = violación de FK.
const isUnique = (e) => e && e.code === '23505';
const isFK     = (e) => e && e.code === '23503';

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
      email: (p.userDetails || '').trim().toLowerCase(),
      roles: p.userRoles || [],
      provider: p.identityProvider
    };
  } catch {
    return null;
  }
}

/* Roles de la aplicación (independientes del SSO). Un usuario nuevo entra como
   'General'. La identidad la administra Microsoft; aquí solo mapeamos correo -> rol. */
const ROLES = ['General', 'Compras', 'Administrador'];

// Registra/actualiza al usuario que inició sesión y devuelve su rol de aplicación.
async function ensureUserRole(user) {
  if (!user || !user.email) return 'General';
  await query(
    `INSERT INTO dbo.UsuarioRol (Email, Nombre, RolId, UltimoAcceso)
     VALUES ($1, $2, (SELECT Id FROM cat.Rol WHERE Nombre='General'), (now() at time zone 'utc'))
     ON CONFLICT (Email) DO UPDATE
        SET Nombre = EXCLUDED.Nombre,
            UltimoAcceso = (now() at time zone 'utc')`,
    [user.email, user.name || user.email]
  );
  return getRole(user);
}

// Lee el rol de aplicación del usuario (sin escribir). 'General' si no existe.
async function getRole(user) {
  if (!user || !user.email) return 'General';
  const r = await query(
    `SELECT rol.Nombre AS rol FROM dbo.UsuarioRol u
     JOIN cat.Rol rol ON rol.Id = u.RolId WHERE u.Email = $1`, [user.email]);
  return r.rows.length ? r.rows[0].rol : 'General';
}
const puedeEditarEstado = (rol) => rol === 'Compras' || rol === 'Administrador';
// Solo Compras y Administrador pueden mantener (agregar/editar/eliminar) las listas desplegables.
const puedeEditarCatalogos = (rol) => rol === 'Compras' || rol === 'Administrador';
async function requireCatalogo(request) {
  return puedeEditarCatalogos(await getRole(getUser(request)));
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
  modelos:        'cat.Modelo',
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
  { key: 'modelo',         col: 'ModeloId',               type: 'cat', cat: 'modelos' },
  { key: 'marca',          col: 'Marca',                  type: 'text' },
  // Marca es texto libre: se limpia MarcaId para que no quede el valor viejo
  // del catalogo (cat.Marca sigue existiendo, solo dejo de usarse en Codigos).
  { key: '__marca_id',     col: 'MarcaId',                type: 'null' },
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
       s.RegistroSanitarioEMB AS reg_sanitario, to_char(s.FechaVencimientoEMB, 'YYYY-MM-DD') AS fecha_venc,
       mo.Nombre AS modelo, COALESCE(ma.Nombre, s.Marca) AS marca, s.ClasificacionProveedor AS clasif_prov,
       ti.Nombre AS tipo_implante, ei.Nombre AS es_implantable,
       s.DescripcionDetallada AS desc_detallada, s.QueEs AS que_es, s.ParaQue AS para_que,
       s.Caracteristicas AS caracteristicas, s.Usos AS usos, qp.Nombre AS queda_paciente, s.Materiales AS materiales,
       s.Estado AS estado
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
LEFT JOIN cat.OpcionSiNo    qp ON qp.Id=s.QuedaPacienteId
LEFT JOIN cat.Modelo        mo ON mo.Id=s.ModeloId
LEFT JOIN cat.Marca         ma ON ma.Id=s.MarcaId`;

/* Resuelve el nombre de un catálogo a su Id (o null si viene vacío) */
async function catId(table, name) {
  if (!name) return null;
  const r = await query(`SELECT Id FROM ${table} WHERE Nombre=$1 LIMIT 1`, [name]);
  if (!r.rows.length) throw new Error(`Valor no encontrado en ${table}: "${name}"`);
  return r.rows[0].id;
}
async function depId(name) {
  if (!name) return null;
  const r = await query(`SELECT Id FROM cat.Departamento WHERE Nombre=$1 LIMIT 1`, [name]);
  if (!r.rows.length) throw new Error(`Departamento no encontrado: "${name}"`);
  return r.rows[0].id;
}

/* Línea y Familia cuelgan de su nivel superior, así que el MISMO nombre puede
   existir bajo varios padres. Cuando el valor existe pero no bajo el padre que
   trae el registro, el mensaje dice a qué padre pertenece: antes decía "no
   encontrada" y mandaba a buscar en el catálogo un valor que sí estaba ahí. */
async function lineaId(name, departamentoId, depNombre) {
  if (!name) return null;
  if (!departamentoId) {
    throw new Error(`Para validar la Línea "${name}" primero hace falta un Departamento válido`);
  }
  const r = await query(
    `SELECT Id FROM cat.Linea WHERE Nombre=$1 AND DepartamentoId=$2 LIMIT 1`, [name, departamentoId]);
  if (r.rows.length) return r.rows[0].id;
  const otros = await query(
    `SELECT d.Nombre AS dep FROM cat.Linea l
       JOIN cat.Departamento d ON d.Id = l.DepartamentoId
      WHERE l.Nombre=$1 ORDER BY d.Nombre`, [name]);
  if (otros.rows.length) {
    throw new Error(`La Línea "${name}" no pertenece al Departamento "${depNombre}", `
      + `sino a: ${otros.rows.map(x => x.dep).join(', ')}`);
  }
  throw new Error(`Línea no encontrada: "${name}"`);
}
async function familiaId(name, lineaIdVal, lineaNombre) {
  if (!name) return null;
  if (!lineaIdVal) {
    throw new Error(`Para validar la Familia "${name}" primero hace falta una Línea válida`);
  }
  const r = await query(
    `SELECT Id FROM cat.Familia WHERE Nombre=$1 AND LineaId=$2 LIMIT 1`, [name, lineaIdVal]);
  if (r.rows.length) return r.rows[0].id;
  const otros = await query(
    `SELECT l.Nombre AS lin FROM cat.Familia f
       JOIN cat.Linea l ON l.Id = f.LineaId
      WHERE f.Nombre=$1 ORDER BY l.Nombre`, [name]);
  if (otros.rows.length) {
    throw new Error(`La Familia "${name}" no pertenece a la Línea "${lineaNombre}", `
      + `sino a: ${otros.rows.map(x => x.lin).join(', ')}`);
  }
  throw new Error(`Familia no encontrada: "${name}"`);
}
async function modeloId(name) { return catId('cat.Modelo', name); }

/* Convierte el cuerpo del formulario en {columna: valor} listo para INSERT/UPDATE */
async function resolveRecord(body) {
  const out = {};
  const dId = await depId(body.departamento);
  const lId = await lineaId(body.linea, dId, body.departamento);
  const fId = await familiaId(body.familia, lId, body.linea);
  for (const f of FIELD_MAP) {
    const v = body[f.key];
    if (f.type === 'text')        out[f.col] = v ? String(v) : null;
    else if (f.type === 'int')    out[f.col] = v !== undefined && v !== '' && v !== null ? parseInt(v, 10) : null;
    else if (f.type === 'date')   out[f.col] = v ? v : null;
    else if (f.type === 'cat')    out[f.col] = await catId(CAT_TABLES[f.cat], v);
    else if (f.type === 'dep')    out[f.col] = dId;
    else if (f.type === 'linea')  out[f.col] = lId;
    else if (f.type === 'familia')out[f.col] = fId;
    else if (f.type === 'null')   out[f.col] = null;
  }
  return out;
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
  handler: async (request, context) => {
    const user = getUser(request);
    if (!user) return json(401, { error: 'No autenticado' });
    try {
      const rol = await ensureUserRole(user);
      return json(200, { ...user, rol });
    } catch (e) {
      context.error(e);
      // Si falla el registro del rol, el usuario entra igual con rol mínimo.
      return json(200, { ...user, rol: 'General' });
    }
  }
});

/* ============================================================
   /api/catalogos  -> todas las listas (misma forma que el DATA original)
   ============================================================ */
app.http('catalogos', {
  methods: ['GET'], authLevel: 'anonymous', route: 'catalogos',
  handler: async (request, context) => {
    try {
      const one = async (table) => (await query(
        `SELECT Nombre FROM ${table} WHERE Activo=true ORDER BY Nombre`)).rows.map(r => r.nombre);

      // Unidades ordenadas por Orden (Caja y Unidad de primero), luego alfabético.
      const unidades = (await query(
        `SELECT Nombre FROM cat.Unidad WHERE Activo=true ORDER BY Orden NULLS LAST, Nombre`)).rows.map(r => r.nombre);

      // Grupo de artículo con su departamento y centro de costo relacionados.
      const grupos = (await query(
        `SELECT g.Nombre AS nombre, d.Nombre AS dep, c.Nombre AS centro
         FROM cat.GrupoArticulo g
         LEFT JOIN cat.Departamento d ON d.Id = g.DepartamentoId
         LEFT JOIN cat.CentroCosto  c ON c.Id = g.CentroCostoId
         WHERE g.Activo=true ORDER BY g.Nombre`)).rows;
      const grupo_articulo = grupos.map(g => g.nombre);

      const [centro_costo, empaque, tipo_implante,
             origen, proveedores, sino] = await Promise.all([
        one('cat.CentroCosto'),
        one('cat.Empaque'), one('cat.TipoImplante'), one('cat.PaisOrigen'),
        one('cat.Proveedor'), one('cat.OpcionSiNo')
      ]);

      const deps = (await query(
        `SELECT Id, Nombre FROM cat.Departamento WHERE Activo=true ORDER BY Nombre`)).rows;
      const lineas = (await query(
        `SELECT l.Id, l.Nombre, d.Nombre AS dep FROM cat.Linea l
         JOIN cat.Departamento d ON d.Id=l.DepartamentoId WHERE l.Activo=true ORDER BY l.Nombre`)).rows;
      const familias = (await query(
        `SELECT f.Nombre, l.Nombre AS lin FROM cat.Familia f
         JOIN cat.Linea l ON l.Id=f.LineaId WHERE f.Activo=true ORDER BY f.Nombre`)).rows;

      // Modelos y sus marcas (jerarquía Modelo -> Marca, igual que Departamento -> Línea).
      const modelosRows = (await query(
        `SELECT Nombre FROM cat.Modelo WHERE Activo=true ORDER BY Nombre`)).rows;
      const marcasRows = (await query(
        `SELECT ma.Nombre, mo.Nombre AS modelo FROM cat.Marca ma
         JOIN cat.Modelo mo ON mo.Id=ma.ModeloId WHERE ma.Activo=true ORDER BY ma.Nombre`)).rows;
      const modelos = modelosRows.map(m => m.nombre);
      const marcas = {};
      modelos.forEach(m => marcas[m] = []);
      marcasRows.forEach(m => { (marcas[m.modelo] = marcas[m.modelo] || []).push(m.nombre); });

      const dept_lines = {};
      deps.forEach(d => dept_lines[d.nombre] = []);
      lineas.forEach(l => { (dept_lines[l.dep] = dept_lines[l.dep] || []).push(l.nombre); });
      const familiasMap = {};
      lineas.forEach(l => familiasMap[l.nombre] = []);
      familias.forEach(f => { (familiasMap[f.lin] = familiasMap[f.lin] || []).push(f.nombre); });

      // Grupo de artículo por departamento + mapa grupo -> centro de costo.
      const grupo_by_dept = {};
      deps.forEach(d => grupo_by_dept[d.nombre] = []);
      grupos.forEach(g => { if (g.dep) (grupo_by_dept[g.dep] = grupo_by_dept[g.dep] || []).push(g.nombre); });
      const grupo_centro = {};
      grupos.forEach(g => { if (g.centro) grupo_centro[g.nombre] = g.centro; });

      return json(200, {
        departamentos: deps.map(d => d.nombre),
        dept_lines, familias: familiasMap,
        grupo_articulo, grupo_by_dept, grupo_centro,
        modelos, marcas,
        centro_costo, unidades, empaque, tipo_implante,
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
      if (!(await requireCatalogo(request))) return json(403, { error: 'No tiene permiso para modificar catálogos' });
      const tipo = request.params.tipo;
      const body = await request.json();
      const valor = (body.valor || '').trim();
      if (!valor) return json(400, { error: 'Falta el valor' });

      if (tipo === 'lineas') {
        const dId = await depId(body.parent);
        await query(`INSERT INTO cat.Linea (DepartamentoId, Nombre) VALUES ($1, $2)`, [dId, valor]);
      } else if (tipo === 'familias') {
        const dId = await depId(body.parentDept);
        const lId = await lineaId(body.parent, dId, body.parentDept);
        await query(`INSERT INTO cat.Familia (LineaId, Nombre) VALUES ($1, $2)`, [lId, valor]);
      } else if (tipo === 'marcas') {
        const moId = await modeloId(body.parent);
        if (!moId) return json(400, { error: 'Indique el Modelo al que pertenece la marca' });
        await query(`INSERT INTO cat.Marca (ModeloId, Nombre) VALUES ($1, $2)`, [moId, valor]);
      } else if (tipo === 'grupo_articulo') {
        // Grupo de artículo ligado al Departamento (para el desplegable dependiente).
        const dId = body.parent ? await depId(body.parent) : null;
        await query(`INSERT INTO cat.GrupoArticulo (Nombre, DepartamentoId) VALUES ($1, $2)`, [valor, dId]);
      } else if (CAT_TABLES[tipo]) {
        await query(`INSERT INTO ${CAT_TABLES[tipo]} (Nombre) VALUES ($1)`, [valor]);
      } else {
        return json(400, { error: 'Catálogo desconocido: ' + tipo });
      }
      return json(201, { ok: true });
    } catch (e) {
      context.error(e);
      if (isUnique(e)) return json(409, { error: 'Esa opción ya existe' });
      return json(500, { error: 'No se pudo agregar', detail: e.message });
    }
  }
});

/* Tabla y filtro por nivel superior de un catálogo. En los catálogos jerárquicos
   (línea, familia, marca) el mismo Nombre puede repetirse bajo distintos padres
   —p. ej. la marca "ACME" en dos modelos—, así que editar o borrar SOLO por
   nombre afectaría a todos. Cuando llega el padre, la operación se acota a él. */
async function catScope(tipo, parent, parentDept) {
  if (tipo === 'lineas') {
    const t = { table: 'cat.Linea' };
    if (parent) { t.col = 'DepartamentoId'; t.val = await depId(parent); }
    return t;
  }
  if (tipo === 'familias') {
    const t = { table: 'cat.Familia' };
    if (parent) { t.col = 'LineaId'; t.val = await lineaId(parent, parentDept ? await depId(parentDept) : null, parentDept); }
    return t;
  }
  if (tipo === 'marcas') {
    const t = { table: 'cat.Marca' };
    if (parent) { t.col = 'ModeloId'; t.val = await modeloId(parent); }
    return t;
  }
  return { table: CAT_TABLES[tipo] };
}

app.http('catalogo-edit', {
  methods: ['PUT'], authLevel: 'anonymous', route: 'catalogos/{tipo}/{valor}',
  handler: async (request, context) => {
    try {
      if (!(await requireCatalogo(request))) return json(403, { error: 'No tiene permiso para modificar catálogos' });
      const tipo = request.params.tipo;
      const actual = decodeURIComponent(request.params.valor);
      const body = await request.json();
      const nuevo = (body.nuevo || '').trim();
      if (!nuevo) return json(400, { error: 'Falta el nuevo valor' });
      const sc = await catScope(tipo, body.parent, body.parentDept);
      if (!sc.table) return json(400, { error: 'Catálogo desconocido' });
      const params = [nuevo, actual];
      let where = 'Nombre=$2';
      if (sc.col) { params.push(sc.val); where += ` AND ${sc.col}=$${params.length}`; }
      const r = await query(`UPDATE ${sc.table} SET Nombre=$1 WHERE ${where}`, params);
      return json(200, { ok: true, updated: r.rowCount });
    } catch (e) {
      context.error(e);
      if (isUnique(e)) return json(409, { error: 'Esa opción ya existe' });
      return json(500, { error: 'No se pudo actualizar', detail: e.message });
    }
  }
});

app.http('catalogo-delete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'catalogos/{tipo}/{valor}',
  handler: async (request, context) => {
    try {
      if (!(await requireCatalogo(request))) return json(403, { error: 'No tiene permiso para modificar catálogos' });
      const tipo = request.params.tipo;
      const valor = decodeURIComponent(request.params.valor);
      const sc = await catScope(tipo, request.query.get('parent'), request.query.get('parentDept'));
      if (!sc.table) return json(400, { error: 'Catálogo desconocido' });
      const params = [valor];
      let where = 'Nombre=$1';
      if (sc.col) { params.push(sc.val); where += ` AND ${sc.col}=$${params.length}`; }
      await query(`DELETE FROM ${sc.table} WHERE ${where}`, params);
      return json(200, { ok: true });
    } catch (e) {
      context.error(e);
      if (isFK(e)) return json(409, { error: 'La opción está en uso y no se puede eliminar' });
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
      const r = await query(
        `SELECT Id AS id, Codigo AS codigo, Nombre AS nombre,
                Departamento AS departamento, Linea AS linea, Familia AS familia,
                Proveedor AS proveedor, PaisOrigen AS pais_origen,
                to_char((FechaCreacion AT TIME ZONE 'UTC') AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD HH24:MI') AS fecha_creacion, Estado AS estado
         FROM dbo.vSolicitud ORDER BY Id DESC`);
      return json(200, r.rows);
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
      const r = await query(`${SELECT_FULL} WHERE s.Id=$1`, [parseInt(request.params.id, 10)]);
      if (!r.rows.length) return json(404, { error: 'No encontrado' });
      return json(200, r.rows[0]);
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
      const vals = await resolveRecord(body);
      const cols = Object.keys(vals);
      const params = cols.map(c => vals[c]);
      params.push(user ? user.name : null);
      const colList = cols.concat(['CreadoPor']).join(', ');
      const placeholders = params.map((_, i) => '$' + (i + 1)).join(', ');
      const r = await query(
        `INSERT INTO dbo.Solicitud (${colList}) VALUES (${placeholders}) RETURNING Id`, params);
      return json(201, { ok: true, id: r.rows[0].id });
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
      const rol = await getRole(user);
      // Un registro Procesado solo lo puede editar Compras/Administrador; el rol General queda en solo lectura.
      if (!puedeEditarEstado(rol)) {
        const actual = await query(`SELECT Estado AS estado FROM dbo.Solicitud WHERE Id=$1`, [id]);
        if (actual.rows.length && actual.rows[0].estado === 'Procesado')
          return json(403, { error: 'El registro está Procesado y no puede ser modificado por su rol' });
      }
      const vals = await resolveRecord(body);
      // El Estado solo lo pueden modificar los roles Compras/Administrador.
      if (body.estado !== undefined && puedeEditarEstado(rol)) {
        if (!['Pendiente', 'Procesado'].includes(body.estado)) return json(400, { error: 'Estado inválido' });
        vals['Estado'] = body.estado;
      }
      const cols = Object.keys(vals);
      const params = [];
      const sets = [];
      cols.forEach(c => { params.push(vals[c]); sets.push(`${c}=$${params.length}`); });
      params.push(user ? user.name : null); sets.push(`ModificadoPor=$${params.length}`);
      sets.push(`FechaModificacion=(now() at time zone 'utc')`);
      params.push(id);
      await query(`UPDATE dbo.Solicitud SET ${sets.join(', ')} WHERE Id=$${params.length}`, params);
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
      if (!puedeEditarEstado(await getRole(getUser(request))))
        return json(403, { error: 'No tiene permiso para eliminar registros' });
      const id = parseInt(request.params.id, 10);
      await query(`DELETE FROM dbo.Adjunto WHERE Modulo='codigos' AND RegistroId=$1`, [id]);
      await query(`DELETE FROM dbo.Solicitud WHERE Id=$1`, [id]);
      return json(200, { ok: true });
    } catch (e) {
      context.error(e);
      return json(500, { error: 'No se pudo eliminar', detail: e.message });
    }
  }
});

/* ============================================================
   MÓDULO: SOLICITUD DE ORDEN DE PEDIDO
   ============================================================ */
const ORD_CAT = {
  productos:  'cat.OP_Producto',
  bodegas:    'cat.OP_Bodega',
  proveedores:'cat.OP_Proveedor',
  transporte: 'cat.OP_Transporte',
  sector:     'cat.OP_Sector',
  justificaciones: 'cat.OP_Justificacion'
};
const ORD_FIELDS = [
  { key:'codigo_producto', col:'ProductoId',          type:'cat', cat:'productos', required:true },
  { key:'descripcion',     col:'Descripcion',         type:'text', required:true },
  { key:'cajas',           col:'Cajas',               type:'int' },
  { key:'unidades_caja',   col:'UnidadesPorCaja',     type:'int' },
  { key:'total_unidades',  col:'TotalUnidades',       type:'int' },
  { key:'bodega',          col:'BodegaId',            type:'cat', cat:'bodegas' },
  { key:'proveedor',       col:'ProveedorId',         type:'cat', cat:'proveedores', required:true },
  { key:'transporte',      col:'TransporteId',        type:'cat', cat:'transporte' },
  { key:'sector',          col:'SectorId',            type:'cat', cat:'sector' },
  { key:'fecha_entrega',   col:'FechaEntrega',        type:'date' },
  { key:'precio_especial', col:'PrecioEspecial',      type:'decimal' },
  { key:'num_emb',         col:'NumeroEMB',           type:'text' },
  { key:'fecha_venc_emb',  col:'FechaVencimientoEMB', type:'date' },
  // Obligatoria en el formulario, no acá: la carga masiva por Excel entra por
  // este mismo endpoint y exigirla rechazaría filas que hoy sí se cargan
  // (mismo criterio que Cajas, Bodega y las demás). Ver el README.
  { key:'justificacion',   col:'JustificacionId',     type:'cat', cat:'justificaciones' },
  { key:'observaciones',   col:'Observaciones',       type:'text' }
];
const ORD_SELECT_FULL = `
SELECT o.Id AS id, p.Nombre AS codigo_producto, o.Descripcion AS descripcion,
       o.Cajas AS cajas, o.UnidadesPorCaja AS unidades_caja, o.TotalUnidades AS total_unidades,
       b.Nombre AS bodega, pr.Nombre AS proveedor, tr.Nombre AS transporte, se.Nombre AS sector,
       to_char(o.FechaEntrega, 'YYYY-MM-DD') AS fecha_entrega, o.PrecioEspecial AS precio_especial,
       o.NumeroEMB AS num_emb, to_char(o.FechaVencimientoEMB, 'YYYY-MM-DD') AS fecha_venc_emb,
       ju.Nombre AS justificacion,
       o.Observaciones AS observaciones, o.Estado AS estado
FROM dbo.OrdenPedido o
JOIN cat.OP_Producto  p  ON p.Id=o.ProductoId
LEFT JOIN cat.OP_Bodega    b  ON b.Id=o.BodegaId
JOIN cat.OP_Proveedor pr ON pr.Id=o.ProveedorId
LEFT JOIN cat.OP_Transporte tr ON tr.Id=o.TransporteId
LEFT JOIN cat.OP_Sector    se ON se.Id=o.SectorId
LEFT JOIN cat.OP_Justificacion ju ON ju.Id=o.JustificacionId`;

/* El producto se guarda como "CODIGO — Descripción" (así está en cat.OP_Producto).
   El Excel que exporta el grid trae SOLO el código en esa columna —la descripción
   va en la suya—, así que al importar se acepta cualquiera de las dos formas y el
   archivo exportado se puede volver a subir sin editarlo. */
async function ordProductoId(name) {
  if (!name) return null;
  const v = String(name).trim();
  const exacto = await query(`SELECT Id FROM cat.OP_Producto WHERE Nombre=$1 LIMIT 1`, [v]);
  if (exacto.rows.length) return exacto.rows[0].id;
  const porCodigo = await query(
    `SELECT Id, Nombre FROM cat.OP_Producto
      WHERE split_part(Nombre, ' — ', 1) = $1 ORDER BY Id`, [v]);
  if (porCodigo.rows.length === 1) return porCodigo.rows[0].id;
  if (porCodigo.rows.length > 1) {
    throw new Error(`El código "${v}" corresponde a más de un producto: `
      + `${porCodigo.rows.map(r => r.nombre).join(' / ')}. Use el nombre completo.`);
  }
  throw new Error(`Producto no encontrado: "${v}"`);
}

async function ordResolve(body) {
  const out = {};
  for (const f of ORD_FIELDS) {
    const v = body[f.key];
    if (f.type === 'text')         out[f.col] = v ? String(v) : null;
    else if (f.type === 'int')     out[f.col] = (v !== undefined && v !== '' && v !== null) ? parseInt(v, 10) : null;
    else if (f.type === 'decimal') out[f.col] = (v !== undefined && v !== '' && v !== null) ? parseFloat(v) : null;
    else if (f.type === 'date')    out[f.col] = v ? v : null;
    else if (f.type === 'cat')     out[f.col] = f.cat === 'productos'
                                     ? await ordProductoId(v)
                                     : await catId(ORD_CAT[f.cat], v);
  }
  return out;
}
function ordValidate(body) {
  return ORD_FIELDS.filter(f => f.required && !String(body[f.key] || '').trim()).map(f => f.key);
}
// Coherencia entre Cajas, Unidades x Caja y Total de Unidades. Se valida también aquí (y no solo en
// el formulario) porque la API recibe además la carga masiva por Excel y llamadas directas.
// Devuelve el mensaje de error, o null si los valores son coherentes.
function ordCoherencia(body) {
  const num = (v) => (v === undefined || v === null || String(v).trim() === '') ? null : Number(v);
  const campos = { cajas: num(body.cajas), unidades_caja: num(body.unidades_caja), total_unidades: num(body.total_unidades) };
  for (const [k, v] of Object.entries(campos)) {
    if (v !== null && !(Number.isInteger(v) && v >= 0))
      return `El campo ${k} debe ser un número entero no negativo`;
  }
  const { cajas, unidades_caja: upc, total_unidades: total } = campos;
  if (upc > 0 && total > 0 && total % upc !== 0)
    return `El total de ${total} unidades no es válido: 1 Caja = ${upc} ` +
           `${upc === 1 ? 'Unidad' : 'Unidades'}, así que no corresponde a un número entero de cajas. ` +
           `Use un múltiplo de ${upc}`;
  if (cajas > 0 && upc > 0 && total > 0 && total !== cajas * upc)
    return `El total de unidades (${total}) no coincide con Cajas × Unidades x Caja (${cajas} × ${upc} = ${cajas * upc})`;
  return null;
}

/* Catálogos del módulo de órdenes */
app.http('catalogos-ordenes', {
  methods: ['GET'], authLevel: 'anonymous', route: 'catalogos-ordenes',
  handler: async (request, context) => {
    try {
      const one = async (t) => (await query(
        `SELECT Nombre FROM ${t} WHERE Activo=true ORDER BY Nombre`)).rows.map(r => r.nombre);
      const [productos, bodegas, proveedores, transporte, sector, justificaciones] = await Promise.all([
        one('cat.OP_Producto'), one('cat.OP_Bodega'), one('cat.OP_Proveedor'),
        one('cat.OP_Transporte'), one('cat.OP_Sector'), one('cat.OP_Justificacion')
      ]);
      // Mapa de conversiones (código de producto -> unidades por caja) para autocompletar en Órdenes.
      const convRows = (await query(
        `SELECT split_part(p.Nombre, ' — ', 1) AS codigo, c.UnidadesPorCaja AS upc
         FROM dbo.Conversion c JOIN cat.OP_Producto p ON p.Id = c.ProductoId`)).rows;
      const conversiones = {};
      for (const r of convRows) conversiones[r.codigo] = r.upc;
      return json(200, { productos, bodegas, proveedores, transporte, sector, justificaciones, conversiones });
    } catch (e) { context.error(e); return json(500, { error: 'Error al cargar catálogos', detail: e.message }); }
  }
});
app.http('catalogos-ordenes-add', {
  methods: ['POST'], authLevel: 'anonymous', route: 'catalogos-ordenes/{tipo}',
  handler: async (request, context) => {
    try {
      if (!(await requireCatalogo(request))) return json(403, { error: 'No tiene permiso para modificar catálogos' });
      const t = ORD_CAT[request.params.tipo];
      if (!t) return json(400, { error: 'Catálogo desconocido' });
      const body = await request.json();
      const valor = (body.valor || '').trim();
      if (!valor) return json(400, { error: 'Falta el valor' });
      await query(`INSERT INTO ${t} (Nombre) VALUES ($1)`, [valor]);
      return json(201, { ok: true });
    } catch (e) {
      context.error(e);
      if (isUnique(e)) return json(409, { error: 'Esa opción ya existe' });
      return json(500, { error: 'No se pudo agregar', detail: e.message });
    }
  }
});
app.http('catalogos-ordenes-edit', {
  methods: ['PUT'], authLevel: 'anonymous', route: 'catalogos-ordenes/{tipo}/{valor}',
  handler: async (request, context) => {
    try {
      if (!(await requireCatalogo(request))) return json(403, { error: 'No tiene permiso para modificar catálogos' });
      const t = ORD_CAT[request.params.tipo];
      if (!t) return json(400, { error: 'Catálogo desconocido' });
      const actual = decodeURIComponent(request.params.valor);
      const body = await request.json();
      const nuevo = (body.nuevo || '').trim();
      if (!nuevo) return json(400, { error: 'Falta el nuevo valor' });
      const r = await query(`UPDATE ${t} SET Nombre=$1 WHERE Nombre=$2`, [nuevo, actual]);
      return json(200, { ok: true, updated: r.rowCount });
    } catch (e) {
      context.error(e);
      if (isUnique(e)) return json(409, { error: 'Esa opción ya existe' });
      return json(500, { error: 'No se pudo actualizar', detail: e.message });
    }
  }
});
app.http('catalogos-ordenes-delete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'catalogos-ordenes/{tipo}/{valor}',
  handler: async (request, context) => {
    try {
      if (!(await requireCatalogo(request))) return json(403, { error: 'No tiene permiso para modificar catálogos' });
      const t = ORD_CAT[request.params.tipo];
      if (!t) return json(400, { error: 'Catálogo desconocido' });
      const valor = decodeURIComponent(request.params.valor);
      await query(`DELETE FROM ${t} WHERE Nombre=$1`, [valor]);
      return json(200, { ok: true });
    } catch (e) {
      context.error(e);
      if (isFK(e)) return json(409, { error: 'La opción está en uso y no se puede eliminar' });
      return json(500, { error: 'No se pudo eliminar', detail: e.message });
    }
  }
});

/* CRUD de órdenes */
app.http('ordenes-list', {
  methods: ['GET'], authLevel: 'anonymous', route: 'ordenes',
  handler: async (request, context) => {
    try {
      const r = await query(
        `SELECT Id AS id, Producto AS codigo_producto, Descripcion AS descripcion,
                Cajas AS cajas, TotalUnidades AS total_unidades, Bodega AS bodega,
                Proveedor AS proveedor, to_char(FechaEntrega, 'YYYY-MM-DD') AS fecha_entrega,
                Justificacion AS justificacion,
                to_char((FechaCreacion AT TIME ZONE 'UTC') AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD HH24:MI') AS fecha_creacion,
                Estado AS estado
         FROM dbo.vOrdenPedido ORDER BY Id DESC`);
      return json(200, r.rows);
    } catch (e) { context.error(e); return json(500, { error: 'Error al listar', detail: e.message }); }
  }
});
app.http('orden-get', {
  methods: ['GET'], authLevel: 'anonymous', route: 'ordenes/{id}',
  handler: async (request, context) => {
    try {
      const r = await query(`${ORD_SELECT_FULL} WHERE o.Id=$1`, [parseInt(request.params.id, 10)]);
      if (!r.rows.length) return json(404, { error: 'No encontrado' });
      return json(200, r.rows[0]);
    } catch (e) { context.error(e); return json(500, { error: 'Error al obtener', detail: e.message }); }
  }
});
app.http('orden-create', {
  methods: ['POST'], authLevel: 'anonymous', route: 'ordenes',
  handler: async (request, context) => {
    try {
      const user = getUser(request);
      const body = await request.json();
      const missing = ordValidate(body);
      if (missing.length) return json(400, { error: 'Faltan campos obligatorios', campos: missing });
      const incoherente = ordCoherencia(body);
      if (incoherente) return json(400, { error: incoherente });
      const vals = await ordResolve(body);
      const cols = Object.keys(vals);
      const params = cols.map(c => vals[c]);
      params.push(user ? user.name : null);
      const colList = cols.concat(['CreadoPor']).join(', ');
      const placeholders = params.map((_, i) => '$' + (i + 1)).join(', ');
      const r = await query(
        `INSERT INTO dbo.OrdenPedido (${colList}) VALUES (${placeholders}) RETURNING Id`, params);
      return json(201, { ok: true, id: r.rows[0].id });
    } catch (e) { context.error(e); return json(500, { error: 'No se pudo crear', detail: e.message }); }
  }
});
app.http('orden-update', {
  methods: ['PUT'], authLevel: 'anonymous', route: 'ordenes/{id}',
  handler: async (request, context) => {
    try {
      const user = getUser(request);
      const id = parseInt(request.params.id, 10);
      const body = await request.json();
      const missing = ordValidate(body);
      if (missing.length) return json(400, { error: 'Faltan campos obligatorios', campos: missing });
      const incoherente = ordCoherencia(body);
      if (incoherente) return json(400, { error: incoherente });
      const rol = await getRole(user);
      // Una orden Procesada solo la puede editar Compras/Administrador; el rol General queda en solo lectura.
      if (!puedeEditarEstado(rol)) {
        const actual = await query(`SELECT Estado AS estado FROM dbo.OrdenPedido WHERE Id=$1`, [id]);
        if (actual.rows.length && actual.rows[0].estado === 'Procesado')
          return json(403, { error: 'La orden está Procesada y no puede ser modificada por su rol' });
      }
      const vals = await ordResolve(body);
      // El Estado solo lo pueden modificar los roles Compras/Administrador.
      if (body.estado !== undefined && puedeEditarEstado(rol)) {
        if (!['Pendiente', 'Procesado'].includes(body.estado)) return json(400, { error: 'Estado inválido' });
        vals['Estado'] = body.estado;
      }
      const cols = Object.keys(vals);
      const params = [];
      const sets = [];
      cols.forEach(c => { params.push(vals[c]); sets.push(`${c}=$${params.length}`); });
      params.push(user ? user.name : null); sets.push(`ModificadoPor=$${params.length}`);
      sets.push(`FechaModificacion=(now() at time zone 'utc')`);
      params.push(id);
      await query(`UPDATE dbo.OrdenPedido SET ${sets.join(', ')} WHERE Id=$${params.length}`, params);
      return json(200, { ok: true });
    } catch (e) { context.error(e); return json(500, { error: 'No se pudo actualizar', detail: e.message }); }
  }
});
app.http('orden-delete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'ordenes/{id}',
  handler: async (request, context) => {
    try {
      if (!puedeEditarEstado(await getRole(getUser(request))))
        return json(403, { error: 'No tiene permiso para eliminar registros' });
      const id = parseInt(request.params.id, 10);
      await query(`DELETE FROM dbo.Adjunto WHERE Modulo='ordenes' AND RegistroId=$1`, [id]);
      await query(`DELETE FROM dbo.OrdenPedido WHERE Id=$1`, [id]);
      return json(200, { ok: true });
    } catch (e) { context.error(e); return json(500, { error: 'No se pudo eliminar', detail: e.message }); }
  }
});

/* ============================================================
   MÓDULO: ARCHIVO ADJUNTO  (un archivo por registro, guardado en base64)
   Disponible para TODOS los roles autenticados (no depende de Compras/Admin).
   Rutas:
     GET    /api/adjuntos/{modulo}/{id}            -> metadatos (sin contenido)
     GET    /api/adjuntos/{modulo}/{id}/contenido  -> el archivo (inline o ?download=1)
     POST   /api/adjuntos/{modulo}/{id}            -> subir/reemplazar {nombre, tipo?, contenido}
     DELETE /api/adjuntos/{modulo}/{id}            -> quitar el archivo
   modulo: 'codigos' (dbo.Solicitud) | 'ordenes' (dbo.OrdenPedido)
   ============================================================ */

/* Límite de tamaño por archivo. Para subirlo a 10 MB en el futuro, cambiar este
   número aquí Y en frontend/index.html (const MAX_MB) y volver a desplegar.
   La columna Contenido es TEXT, así que no requiere cambios en la base de datos. */
const MAX_MB = 5;
const MAX_BYTES = MAX_MB * 1024 * 1024;
const ADJ_MODULOS = ['codigos', 'ordenes'];
// Máximo de archivos por registro (0 = sin límite). Debe coincidir con el
// ADJ_MAX_POR_REGISTRO de frontend/index.html.
const ADJ_MAX_POR_REGISTRO = 20;
// Extensiones permitidas: PDF, imágenes, Word y Excel.
const ADJ_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff',
                 'doc', 'docx', 'xls', 'xlsx', 'csv'];
const MIME_BY_EXT = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv'
};
function extOf(nombre) { const m = String(nombre || '').toLowerCase().match(/\.([a-z0-9]+)$/); return m ? m[1] : ''; }
const adjModuloOk = (m) => ADJ_MODULOS.includes(m);

/* Lista de adjuntos del registro (sin el contenido, para pintar la tabla).
   Devuelve el arreglo ordenado del más antiguo al más reciente. */
app.http('adjuntos-lista', {
  methods: ['GET'], authLevel: 'anonymous', route: 'adjuntos/{modulo}/{id}',
  handler: async (request, context) => {
    try {
      const modulo = request.params.modulo;
      if (!adjModuloOk(modulo)) return json(400, { error: 'Módulo inválido' });
      const id = parseInt(request.params.id, 10);
      const r = await query(
        `SELECT Id AS id, NombreArchivo AS nombre, TipoMime AS tipo, Tamano AS tamano, SubidoPor AS subido_por,
                to_char((FechaSubida AT TIME ZONE 'UTC') AT TIME ZONE 'America/Costa_Rica', 'DD/MM/YYYY HH24:MI') AS fecha
         FROM dbo.Adjunto WHERE Modulo=$1 AND RegistroId=$2 ORDER BY FechaSubida, Id`, [modulo, id]);
      return json(200, { adjuntos: r.rows });
    } catch (e) { context.error(e); return json(500, { error: 'Error al obtener los adjuntos', detail: e.message }); }
  }
});

/* Contenido del adjunto: devuelve los bytes reales con su Content-Type.
   Sin ?download -> inline (el navegador muestra PDF/imagen).
   Con ?download=1 -> attachment (fuerza la descarga; Word/Excel y demás). */
app.http('adjunto-contenido', {
  methods: ['GET'], authLevel: 'anonymous', route: 'adjuntos/{modulo}/{id}/{adjuntoId}/contenido',
  handler: async (request, context) => {
    try {
      const modulo = request.params.modulo;
      if (!adjModuloOk(modulo)) return json(400, { error: 'Módulo inválido' });
      const id = parseInt(request.params.id, 10);
      const adjuntoId = parseInt(request.params.adjuntoId, 10);
      if (!Number.isInteger(adjuntoId)) return json(400, { error: 'Adjunto inválido' });
      // Se exige también Modulo y RegistroId: así un Id de adjunto suelto no permite
      // leer el archivo de otro registro.
      const r = await query(
        `SELECT NombreArchivo AS nombre, TipoMime AS tipo, Contenido AS contenido
         FROM dbo.Adjunto WHERE Id=$1 AND Modulo=$2 AND RegistroId=$3`, [adjuntoId, modulo, id]);
      if (!r.rows.length) return json(404, { error: 'Archivo no encontrado' });
      const row = r.rows[0];
      const buf = Buffer.from(row.contenido, 'base64');
      const mime = row.tipo || MIME_BY_EXT[extOf(row.nombre)] || 'application/octet-stream';
      const download = request.query.get('download') === '1';
      // Cabecera segura: nombre ASCII + variante UTF-8 (RFC 5987) para tildes/ñ.
      const asciiName = String(row.nombre).replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
      const disp = `${download ? 'attachment' : 'inline'}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(row.nombre)}`;
      return {
        status: 200, body: buf,
        headers: {
          'Content-Type': mime,
          'Content-Disposition': disp,
          'Content-Length': String(buf.length),
          'Cache-Control': 'private, no-store'
        }
      };
    } catch (e) { context.error(e); return json(500, { error: 'Error al leer el archivo', detail: e.message }); }
  }
});

/* Agregar un archivo al registro. Cualquier rol autenticado; se acumulan (no se reemplazan). */
app.http('adjunto-subir', {
  methods: ['POST'], authLevel: 'anonymous', route: 'adjuntos/{modulo}/{id}',
  handler: async (request, context) => {
    try {
      const user = getUser(request);
      if (!user) return json(401, { error: 'No autenticado' });
      const modulo = request.params.modulo;
      if (!adjModuloOk(modulo)) return json(400, { error: 'Módulo inválido' });
      const id = parseInt(request.params.id, 10);
      const body = await request.json();
      const nombre = (body.nombre || '').trim();
      let b64 = body.contenido || '';
      if (!nombre || !b64) return json(400, { error: 'Falta el archivo' });
      // Acepta data URL ("data:...;base64,XXXX") o base64 puro.
      if (b64.slice(0, 5) === 'data:') { const c = b64.indexOf(','); if (c !== -1) b64 = b64.slice(c + 1); }
      b64 = b64.replace(/\s/g, '');
      const ext = extOf(nombre);
      if (!ADJ_EXT.includes(ext)) return json(400, { error: 'Tipo de archivo no permitido (.' + ext + '). Solo PDF, imagen, Word o Excel.' });
      const buf = Buffer.from(b64, 'base64');
      if (!buf.length) return json(400, { error: 'El archivo está vacío o es inválido' });
      if (buf.length > MAX_BYTES) return json(413, { error: `El archivo supera el máximo de ${MAX_MB} MB` });
      const mime = (body.tipo && String(body.tipo)) || MIME_BY_EXT[ext] || 'application/octet-stream';
      if (ADJ_MAX_POR_REGISTRO > 0) {
        const c = await query(`SELECT count(*)::int AS n FROM dbo.Adjunto WHERE Modulo=$1 AND RegistroId=$2`, [modulo, id]);
        if (c.rows[0].n >= ADJ_MAX_POR_REGISTRO)
          return json(409, { error: `El registro ya tiene ${ADJ_MAX_POR_REGISTRO} archivos adjuntos, que es el máximo. Elimine alguno para subir otro.` });
      }
      const ins = await query(
        `INSERT INTO dbo.Adjunto (Modulo, RegistroId, NombreArchivo, TipoMime, Tamano, Contenido, SubidoPor, FechaSubida)
         VALUES ($1, $2, $3, $4, $5, $6, $7, (now() at time zone 'utc'))
         RETURNING Id`,
        [modulo, id, nombre, mime, buf.length, b64, user.name || user.email]);
      return json(201, { ok: true, id: ins.rows[0].id, nombre, tipo: mime, tamano: buf.length });
    } catch (e) { context.error(e); return json(500, { error: 'No se pudo subir el archivo', detail: e.message }); }
  }
});

/* Eliminar UN archivo de la lista. Solo Compras y Administrador. */
app.http('adjunto-eliminar', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'adjuntos/{modulo}/{id}/{adjuntoId}',
  handler: async (request, context) => {
    try {
      const user = getUser(request);
      if (!user) return json(401, { error: 'No autenticado' });
      if (!puedeEditarEstado(await getRole(user)))
        return json(403, { error: 'No tiene permiso para eliminar archivos adjuntos' });
      const modulo = request.params.modulo;
      if (!adjModuloOk(modulo)) return json(400, { error: 'Módulo inválido' });
      const id = parseInt(request.params.id, 10);
      const adjuntoId = parseInt(request.params.adjuntoId, 10);
      if (!Number.isInteger(adjuntoId)) return json(400, { error: 'Adjunto inválido' });
      const r = await query(`DELETE FROM dbo.Adjunto WHERE Id=$1 AND Modulo=$2 AND RegistroId=$3`, [adjuntoId, modulo, id]);
      if (!r.rowCount) return json(404, { error: 'Archivo no encontrado' });
      return json(200, { ok: true });
    } catch (e) { context.error(e); return json(500, { error: 'No se pudo eliminar el archivo', detail: e.message }); }
  }
});

/* ============================================================
   MÓDULO: ROLES Y ASIGNACIÓN DE USUARIOS  (solo Administrador)
   No administra identidades (eso es Microsoft/SSO): solo asigna el rol de la
   aplicación a los correos que ya han iniciado sesión.
   ============================================================ */

/* Catálogo de roles disponibles */
app.http('roles-list', {
  methods: ['GET'], authLevel: 'anonymous', route: 'roles',
  handler: async (request, context) => {
    try {
      const user = getUser(request);
      if (!user) return json(401, { error: 'No autenticado' });
      const r = await query(`SELECT Nombre AS nombre FROM cat.Rol ORDER BY Id`);
      return json(200, r.rows.map(x => x.nombre));
    } catch (e) { context.error(e); return json(500, { error: 'Error al listar roles', detail: e.message }); }
  }
});

/* Listado de usuarios que han iniciado sesión, con su rol */
app.http('usuarios-list', {
  methods: ['GET'], authLevel: 'anonymous', route: 'usuarios',
  handler: async (request, context) => {
    try {
      const user = getUser(request);
      if (!user) return json(401, { error: 'No autenticado' });
      if ((await getRole(user)) !== 'Administrador')
        return json(403, { error: 'Solo los administradores pueden ver esta información' });
      const r = await query(
        `SELECT u.Email AS email, u.Nombre AS nombre, rol.Nombre AS rol,
                to_char(u.UltimoAcceso, 'YYYY-MM-DD HH24:MI') AS ultimo_acceso
         FROM dbo.UsuarioRol u JOIN cat.Rol rol ON rol.Id = u.RolId
         ORDER BY u.UltimoAcceso DESC NULLS LAST, u.Email`);
      return json(200, r.rows);
    } catch (e) { context.error(e); return json(500, { error: 'Error al listar usuarios', detail: e.message }); }
  }
});

/* Cambiar el rol de un usuario */
app.http('usuario-set-rol', {
  methods: ['PUT'], authLevel: 'anonymous', route: 'usuarios/{email}',
  handler: async (request, context) => {
    try {
      const user = getUser(request);
      if (!user) return json(401, { error: 'No autenticado' });
      if ((await getRole(user)) !== 'Administrador')
        return json(403, { error: 'Solo los administradores pueden asignar roles' });
      const email = decodeURIComponent(request.params.email).trim().toLowerCase();
      const body = await request.json();
      const rol = (body.rol || '').trim();
      if (!ROLES.includes(rol)) return json(400, { error: 'Rol inválido' });
      const r = await query(
        `UPDATE dbo.UsuarioRol SET RolId = (SELECT Id FROM cat.Rol WHERE Nombre=$1) WHERE Email=$2`,
        [rol, email]);
      if (!r.rowCount) return json(404, { error: 'Usuario no encontrado' });
      return json(200, { ok: true });
    } catch (e) { context.error(e); return json(500, { error: 'No se pudo asignar el rol', detail: e.message }); }
  }
});

/* ============================================================
   MÓDULO: CONVERSIONES (Caja -> Unid)  — solo Compras / Administrador
   ============================================================ */
const puedeConversiones = (rol) => rol === 'Compras' || rol === 'Administrador';

// Código = texto antes del separador " — " en OP_Producto.Nombre; Descripción = el resto.
const CONV_SELECT = `
SELECT c.Id AS id, p.Id AS producto_id,
       split_part(p.Nombre, ' — ', 1) AS codigo_producto,
       CASE WHEN position(' — ' in p.Nombre) > 0
            THEN substring(p.Nombre from position(' — ' in p.Nombre) + 3)
            ELSE '' END AS descripcion,
       c.Cajas AS cajas, c.UnidadesPorCaja AS unidades_por_caja,
       (c.Cajas * c.UnidadesPorCaja) AS total_unidades,
       to_char((c.FechaCreacion AT TIME ZONE 'UTC') AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD HH24:MI') AS fecha_creacion
FROM dbo.Conversion c JOIN cat.OP_Producto p ON p.Id = c.ProductoId`;

function convValidate(body) {
  const cajas = parseInt(body.cajas, 10);
  const un = parseInt(body.unidades_por_caja, 10);
  if (!body.codigo_producto || !String(body.codigo_producto).trim()) return 'Seleccione el código de producto';
  if (!(cajas > 0)) return 'La Caja debe ser un entero mayor a cero';
  if (!(un > 0)) return 'Las Unidades por caja deben ser un entero mayor a cero';
  return null;
}

app.http('conversiones-list', {
  methods: ['GET'], authLevel: 'anonymous', route: 'conversiones',
  handler: async (request, context) => {
    try {
      if (!puedeConversiones(await getRole(getUser(request)))) return json(403, { error: 'Solo Compras/Administrador' });
      const r = await query(`${CONV_SELECT} ORDER BY codigo_producto`);
      return json(200, r.rows);
    } catch (e) { context.error(e); return json(500, { error: 'Error al listar conversiones', detail: e.message }); }
  }
});
app.http('conversion-get', {
  methods: ['GET'], authLevel: 'anonymous', route: 'conversiones/{id}',
  handler: async (request, context) => {
    try {
      if (!puedeConversiones(await getRole(getUser(request)))) return json(403, { error: 'Solo Compras/Administrador' });
      const r = await query(`${CONV_SELECT} WHERE c.Id=$1`, [parseInt(request.params.id, 10)]);
      if (!r.rows.length) return json(404, { error: 'No encontrado' });
      return json(200, r.rows[0]);
    } catch (e) { context.error(e); return json(500, { error: 'Error al obtener', detail: e.message }); }
  }
});
app.http('conversion-create', {
  methods: ['POST'], authLevel: 'anonymous', route: 'conversiones',
  handler: async (request, context) => {
    try {
      if (!puedeConversiones(await getRole(getUser(request)))) return json(403, { error: 'No tiene permiso para crear conversiones' });
      const body = await request.json();
      const err = convValidate(body);
      if (err) return json(400, { error: err });
      const productoId = await catId('cat.OP_Producto', String(body.codigo_producto).trim());
      const r = await query(
        `INSERT INTO dbo.Conversion (ProductoId, Cajas, UnidadesPorCaja) VALUES ($1,$2,$3) RETURNING Id`,
        [productoId, parseInt(body.cajas, 10), parseInt(body.unidades_por_caja, 10)]);
      return json(201, { ok: true, id: r.rows[0].id });
    } catch (e) {
      context.error(e);
      if (isUnique(e)) return json(409, { error: 'Ya existe una conversión para ese producto' });
      return json(500, { error: 'No se pudo crear', detail: e.message });
    }
  }
});
app.http('conversion-update', {
  methods: ['PUT'], authLevel: 'anonymous', route: 'conversiones/{id}',
  handler: async (request, context) => {
    try {
      if (!puedeConversiones(await getRole(getUser(request)))) return json(403, { error: 'No tiene permiso para editar conversiones' });
      const id = parseInt(request.params.id, 10);
      const body = await request.json();
      const err = convValidate(body);
      if (err) return json(400, { error: err });
      const productoId = await catId('cat.OP_Producto', String(body.codigo_producto).trim());
      const r = await query(
        `UPDATE dbo.Conversion SET ProductoId=$1, Cajas=$2, UnidadesPorCaja=$3 WHERE Id=$4`,
        [productoId, parseInt(body.cajas, 10), parseInt(body.unidades_por_caja, 10), id]);
      if (!r.rowCount) return json(404, { error: 'No encontrado' });
      return json(200, { ok: true });
    } catch (e) {
      context.error(e);
      if (isUnique(e)) return json(409, { error: 'Ya existe una conversión para ese producto' });
      return json(500, { error: 'No se pudo actualizar', detail: e.message });
    }
  }
});
app.http('conversion-delete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'conversiones/{id}',
  handler: async (request, context) => {
    try {
      if (!puedeConversiones(await getRole(getUser(request)))) return json(403, { error: 'No tiene permiso para eliminar conversiones' });
      await query(`DELETE FROM dbo.Conversion WHERE Id=$1`, [parseInt(request.params.id, 10)]);
      return json(200, { ok: true });
    } catch (e) { context.error(e); return json(500, { error: 'No se pudo eliminar', detail: e.message }); }
  }
});

/* ============================================================
   MÓDULO: BANDEJA DE CARGAS MASIVAS DE CÓDIGOS
   ------------------------------------------------------------
   El Excel ya no crea los registros de una: cae aquí como una CARGA con sus
   códigos en estado Pendiente. Desde la pantalla de cargas el usuario revisa,
   corrige y procesa los que quiera; cada código procesado crea su fila en
   dbo.Solicitud con Estado='Procesado'.

   Acceso: Compras y Administrador (mismo criterio que Catálogos).
   ============================================================ */
const puedeCargas = (rol) => rol === 'Compras' || rol === 'Administrador';
async function requireCargas(request) { return puedeCargas(await getRole(getUser(request))); }

/* Etiquetas de los campos, para que los errores digan "Falta Centro de Costo"
   y no "falta centro_costo". Solo se usan en mensajes. */
const FIELD_LABELS = {
  codigo: 'Código de Producto', nombre: 'Nombre del Producto',
  departamento: 'Departamento', linea: 'Línea', familia: 'Familia',
  grupo_articulo: 'Grupo Artículo', centro_costo: 'Centro de Costo',
  lote: '¿Lleva Lote?', unidad_inv: 'Unidad de Inventario',
  unidad_compra: 'Unidad de Compra', unidad_venta: 'Unidad de Venta',
  empaque: 'Empaque', cant_caja: 'Cantidad de Unidades por caja',
  proveedor: 'Proveedor', pais_origen: 'País de Origen',
  reg_sanitario: 'Número de Registro Sanitario EMB',
  fecha_venc: 'Fecha de Vencimiento del EMB',
  modelo: 'Modelo', marca: 'Marca', clasif_prov: 'Clasificación Proveedor',
  tipo_implante: 'Tipo Implante', es_implantable: '¿Es Implantable?',
  desc_detallada: 'Descripción Detallada del Producto', que_es: '¿Qué es?',
  para_que: '¿Para qué es?', caracteristicas: 'Características', usos: 'Usos',
  queda_paciente: 'Se queda en el paciente', materiales: 'Materiales'
};
const etiqueta = (k) => FIELD_LABELS[k] || k;

/* Un código de una carga debe traer lo mismo que el formulario exige cuando se
   crea a mano. Se lista aparte (y no se endurece FIELD_MAP.required) para no
   cambiar el comportamiento de los endpoints del formulario, que ya validan en
   el navegador. Si se agrega un obligatorio al formulario, agregarlo aquí. */
const CARGA_REQUIRED = [
  'codigo', 'nombre', 'departamento', 'linea', 'familia', 'grupo_articulo',
  'centro_costo', 'lote', 'unidad_inv', 'unidad_compra', 'unidad_venta',
  'empaque', 'cant_caja', 'proveedor', 'pais_origen', 'reg_sanitario',
  'fecha_venc', 'modelo', 'marca', 'desc_detallada', 'que_es', 'para_que',
  'caracteristicas', 'usos', 'queda_paciente', 'materiales'
];
const faltantesCarga = (datos) => CARGA_REQUIRED.filter(k => !String((datos && datos[k]) || '').trim());

/* Claves válidas de un código dentro de una carga (las del formulario). */
const CARGA_KEYS = FIELD_MAP.filter(f => !f.key.startsWith('__')).map(f => f.key);
function limpiaDatos(obj) {
  const out = {};
  CARGA_KEYS.forEach(k => {
    const v = obj ? obj[k] : '';
    out[k] = (v === undefined || v === null) ? '' : String(v).trim();
  });
  return out;
}

/* La vista devuelve los conteos como bigint -> string. Se normalizan a número. */
function cargaRow(r) {
  return {
    id: r.id, archivo: r.archivo, fecha: r.fecha, hora: r.hora, usuario: r.usuario,
    total: Number(r.total || 0), pendientes: Number(r.pendientes || 0),
    procesados: Number(r.procesados || 0), con_error: Number(r.con_error || 0),
    estado: r.estado
  };
}
const CARGA_SELECT = `
SELECT Id AS id, Archivo AS archivo,
       to_char((FechaCarga AT TIME ZONE 'UTC') AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD') AS fecha,
       to_char((FechaCarga AT TIME ZONE 'UTC') AT TIME ZONE 'America/Costa_Rica', 'HH24:MI') AS hora,
       CargadoPor AS usuario, TotalCodigos AS total, Pendientes AS pendientes,
       Procesados AS procesados, ConError AS con_error, Estado AS estado
  FROM dbo.vCarga`;

/* GET /api/cargas?estado=Pendiente|Registrada  -> listado, más reciente primero */
app.http('cargas-list', {
  methods: ['GET'], authLevel: 'anonymous', route: 'cargas',
  handler: async (request, context) => {
    try {
      if (!await requireCargas(request)) return json(403, { error: 'Su rol no tiene acceso a las cargas' });
      const estado = (request.query.get('estado') || '').trim();
      const params = [];
      let where = '';
      if (estado) { params.push(estado); where = ` WHERE Estado=$1`; }
      const r = await query(`${CARGA_SELECT}${where} ORDER BY FechaCarga DESC, Id DESC`, params);
      return json(200, r.rows.map(cargaRow));
    } catch (e) {
      context.error(e);
      return json(500, { error: 'Error al listar las cargas', detail: e.message });
    }
  }
});

/* POST /api/cargas  { archivo, filas:[{fila, datos:{...}}] } -> crea la carga */
app.http('carga-create', {
  methods: ['POST'], authLevel: 'anonymous', route: 'cargas',
  handler: async (request, context) => {
    try {
      const user = getUser(request);
      if (!await requireCargas(request)) return json(403, { error: 'Su rol no tiene permiso para subir cargas' });
      const body = await request.json();
      const archivo = String(body.archivo || 'Excel').slice(0, 260);
      const filas = Array.isArray(body.filas) ? body.filas : [];
      if (!filas.length) return json(400, { error: 'La carga no trae ningún código' });

      const c = await query(
        `INSERT INTO dbo.Carga (Archivo, CargadoPor) VALUES ($1, $2) RETURNING Id`,
        [archivo, user ? user.name : null]);
      const cargaId = c.rows[0].id;

      // Un solo INSERT para todo el archivo: se manda el arreglo como JSONB y
      // Postgres lo expande. Así no importa si el Excel trae 10 o 2000 filas.
      const payload = filas.map((f, i) => ({ fila: f.fila || (i + 2), datos: limpiaDatos(f.datos || f) }));
      await query(
        `INSERT INTO dbo.CargaDetalle (CargaId, Fila, Datos)
         SELECT $1, (e->>'fila')::int, e->'datos'
           FROM jsonb_array_elements($2::jsonb) e`,
        [cargaId, JSON.stringify(payload)]);

      return json(201, { ok: true, id: cargaId, codigos: payload.length });
    } catch (e) {
      context.error(e);
      return json(500, { error: 'No se pudo registrar la carga', detail: e.message });
    }
  }
});

/* GET /api/cargas/{id} -> cabecera + códigos de la carga */
app.http('carga-get', {
  methods: ['GET'], authLevel: 'anonymous', route: 'cargas/{id}',
  handler: async (request, context) => {
    try {
      if (!await requireCargas(request)) return json(403, { error: 'Su rol no tiene acceso a las cargas' });
      const id = parseInt(request.params.id, 10);
      const h = await query(`${CARGA_SELECT} WHERE Id=$1`, [id]);
      if (!h.rows.length) return json(404, { error: 'Carga no encontrada' });
      const d = await query(
        `SELECT Id AS id, Fila AS fila, Datos AS datos, Estado AS estado, Error AS error,
                SolicitudId AS solicitud_id,
                to_char((FechaProceso AT TIME ZONE 'UTC') AT TIME ZONE 'America/Costa_Rica', 'YYYY-MM-DD HH24:MI') AS fecha_proceso
           FROM dbo.CargaDetalle WHERE CargaId=$1 ORDER BY Fila NULLS LAST, Id`, [id]);
      return json(200, { carga: cargaRow(h.rows[0]), codigos: d.rows });
    } catch (e) {
      context.error(e);
      return json(500, { error: 'Error al obtener la carga', detail: e.message });
    }
  }
});

/* DELETE /api/cargas/{id} -> borra la carga y su detalle.
   Los códigos ya registrados en dbo.Solicitud NO se tocan. */
app.http('carga-delete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'cargas/{id}',
  handler: async (request, context) => {
    try {
      if (!await requireCargas(request)) return json(403, { error: 'Su rol no tiene permiso para eliminar cargas' });
      const r = await query(`DELETE FROM dbo.Carga WHERE Id=$1`, [parseInt(request.params.id, 10)]);
      if (!r.rowCount) return json(404, { error: 'Carga no encontrada' });
      return json(200, { ok: true });
    } catch (e) {
      context.error(e);
      return json(500, { error: 'No se pudo eliminar la carga', detail: e.message });
    }
  }
});

/* PUT /api/cargas/{id}/codigos/{detId} -> corrige los datos de un código pendiente */
app.http('carga-detalle-update', {
  methods: ['PUT'], authLevel: 'anonymous', route: 'cargas/{id}/codigos/{detId}',
  handler: async (request, context) => {
    try {
      if (!await requireCargas(request)) return json(403, { error: 'Su rol no tiene permiso para editar cargas' });
      const id = parseInt(request.params.id, 10);
      const detId = parseInt(request.params.detId, 10);
      const body = await request.json();
      const datos = limpiaDatos(body.datos || body);
      const r = await query(
        `UPDATE dbo.CargaDetalle SET Datos=$1, Error=NULL
          WHERE Id=$2 AND CargaId=$3 AND Estado='Pendiente'`,
        [JSON.stringify(datos), detId, id]);
      if (!r.rowCount) return json(404, { error: 'El código no existe o ya fue registrado' });
      return json(200, { ok: true });
    } catch (e) {
      context.error(e);
      return json(500, { error: 'No se pudo guardar el código', detail: e.message });
    }
  }
});

/* DELETE /api/cargas/{id}/codigos/{detId} -> quita un código pendiente de la carga */
app.http('carga-detalle-delete', {
  methods: ['DELETE'], authLevel: 'anonymous', route: 'cargas/{id}/codigos/{detId}',
  handler: async (request, context) => {
    try {
      if (!await requireCargas(request)) return json(403, { error: 'Su rol no tiene permiso para editar cargas' });
      const r = await query(
        `DELETE FROM dbo.CargaDetalle WHERE Id=$1 AND CargaId=$2 AND Estado='Pendiente'`,
        [parseInt(request.params.detId, 10), parseInt(request.params.id, 10)]);
      if (!r.rowCount) return json(404, { error: 'El código no existe o ya fue registrado' });
      return json(200, { ok: true });
    } catch (e) {
      context.error(e);
      return json(500, { error: 'No se pudo quitar el código', detail: e.message });
    }
  }
});

/* POST /api/cargas/{id}/procesar  { ids:[detId,...] }
   Registra en dbo.Solicitud (Estado='Procesado') los códigos marcados.
   Cada código se procesa por separado: el que falla queda Pendiente con el
   motivo guardado y NO detiene a los demás. */
app.http('carga-procesar', {
  methods: ['POST'], authLevel: 'anonymous', route: 'cargas/{id}/procesar',
  handler: async (request, context) => {
    try {
      const user = getUser(request);
      if (!await requireCargas(request)) return json(403, { error: 'Su rol no tiene permiso para procesar cargas' });
      const id = parseInt(request.params.id, 10);
      const body = await request.json().catch(() => ({}));
      const ids = Array.isArray(body.ids) ? body.ids.map(n => parseInt(n, 10)).filter(n => !isNaN(n)) : [];

      const params = [id];
      let filtro = '';
      if (ids.length) { params.push(ids); filtro = ` AND Id = ANY($2::int[])`; }
      const d = await query(
        `SELECT Id AS id, Fila AS fila, Datos AS datos FROM dbo.CargaDetalle
          WHERE CargaId=$1 AND Estado='Pendiente'${filtro} ORDER BY Fila NULLS LAST, Id`, params);

      if (!d.rows.length) return json(400, { error: 'No hay códigos pendientes entre los seleccionados' });

      let procesados = 0;
      const errores = [];

      for (const row of d.rows) {
        const datos = row.datos || {};
        try {
          const missing = faltantesCarga(datos);
          if (missing.length) throw new Error('Faltan datos obligatorios: ' + missing.map(etiqueta).join(', '));

          const vals = await resolveRecord(datos);
          vals['Estado'] = 'Procesado';
          const cols = Object.keys(vals);
          const p = cols.map(c => vals[c]);
          p.push(user ? user.name : null);
          const ph = p.map((_, i) => '$' + (i + 1)).join(', ');
          const ins = await query(
            `INSERT INTO dbo.Solicitud (${cols.concat(['CreadoPor']).join(', ')}) VALUES (${ph}) RETURNING Id`, p);

          await query(
            `UPDATE dbo.CargaDetalle
                SET Estado='Procesado', SolicitudId=$1, Error=NULL,
                    FechaProceso=(now() at time zone 'utc'), ProcesadoPor=$2
              WHERE Id=$3`,
            [ins.rows[0].id, user ? user.name : null, row.id]);
          procesados++;
        } catch (err) {
          const motivo = isUnique(err)
            ? `El código "${datos.codigo || ''}" ya existe en los registros`
            : err.message;
          await query(`UPDATE dbo.CargaDetalle SET Error=$1 WHERE Id=$2`, [motivo, row.id]);
          errores.push({ id: row.id, fila: row.fila, codigo: datos.codigo || '', error: motivo });
        }
      }

      const h = await query(`${CARGA_SELECT} WHERE Id=$1`, [id]);
      return json(200, {
        ok: true, procesados, errores,
        carga: h.rows.length ? cargaRow(h.rows[0]) : null
      });
    } catch (e) {
      context.error(e);
      return json(500, { error: 'No se pudieron procesar los códigos', detail: e.message });
    }
  }
});
