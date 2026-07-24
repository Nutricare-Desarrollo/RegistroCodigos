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
       s.RegistroSanitarioEMB AS reg_sanitario, to_char(s.FechaVencimientoEMB, 'YYYY-MM-DD') AS fecha_venc,
       s.Modelo AS modelo, s.Marca AS marca, s.ClasificacionProveedor AS clasif_prov,
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
LEFT JOIN cat.OpcionSiNo    qp ON qp.Id=s.QuedaPacienteId`;

/* Resuelve el nombre de un catálogo a su Id (o null si viene vacío) */
async function catId(table, name) {
  if (!name) return null;
  const r = await query(`SELECT Id FROM ${table} WHERE Nombre=$1 LIMIT 1`, [name]);
  if (!r.rows.length) throw new Error(`Valor no encontrado en ${table}: "${name}"`);
  return r.rows[0].id;
}
async function depId(name) { return catId('cat.Departamento', name); }
async function lineaId(name, departamentoId) {
  if (!name) return null;
  const r = await query(
    `SELECT Id FROM cat.Linea WHERE Nombre=$1 AND DepartamentoId=$2 LIMIT 1`, [name, departamentoId]);
  if (!r.rows.length) throw new Error(`Línea no encontrada: "${name}"`);
  return r.rows[0].id;
}
async function familiaId(name, lineaIdVal) {
  if (!name) return null;
  const r = await query(
    `SELECT Id FROM cat.Familia WHERE Nombre=$1 AND LineaId=$2 LIMIT 1`, [name, lineaIdVal]);
  if (!r.rows.length) throw new Error(`Familia no encontrada: "${name}"`);
  return r.rows[0].id;
}

/* Convierte el cuerpo del formulario en {columna: valor} listo para INSERT/UPDATE */
async function resolveRecord(body) {
  const out = {};
  const dId = await depId(body.departamento);
  const lId = await lineaId(body.linea, dId);
  const fId = await familiaId(body.familia, lId);
  for (const f of FIELD_MAP) {
    const v = body[f.key];
    if (f.type === 'text')        out[f.col] = v ? String(v) : null;
    else if (f.type === 'int')    out[f.col] = v !== undefined && v !== '' && v !== null ? parseInt(v, 10) : null;
    else if (f.type === 'date')   out[f.col] = v ? v : null;
    else if (f.type === 'cat')    out[f.col] = await catId(CAT_TABLES[f.cat], v);
    else if (f.type === 'dep')    out[f.col] = dId;
    else if (f.type === 'linea')  out[f.col] = lId;
    else if (f.type === 'familia')out[f.col] = fId;
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
      const tipo = request.params.tipo;
      const body = await request.json();
      const valor = (body.valor || '').trim();
      if (!valor) return json(400, { error: 'Falta el valor' });

      if (tipo === 'lineas') {
        const dId = await depId(body.parent);
        await query(`INSERT INTO cat.Linea (DepartamentoId, Nombre) VALUES ($1, $2)`, [dId, valor]);
      } else if (tipo === 'familias') {
        const dId = await depId(body.parentDept);
        const lId = await lineaId(body.parent, dId);
        await query(`INSERT INTO cat.Familia (LineaId, Nombre) VALUES ($1, $2)`, [lId, valor]);
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

app.http('catalogo-edit', {
  methods: ['PUT'], authLevel: 'anonymous', route: 'catalogos/{tipo}/{valor}',
  handler: async (request, context) => {
    try {
      const tipo = request.params.tipo;
      const actual = decodeURIComponent(request.params.valor);
      const body = await request.json();
      const nuevo = (body.nuevo || '').trim();
      if (!nuevo) return json(400, { error: 'Falta el nuevo valor' });
      let table;
      if (tipo === 'lineas') table = 'cat.Linea';
      else if (tipo === 'familias') table = 'cat.Familia';
      else table = CAT_TABLES[tipo];
      if (!table) return json(400, { error: 'Catálogo desconocido' });
      const r = await query(`UPDATE ${table} SET Nombre=$1 WHERE Nombre=$2`, [nuevo, actual]);
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
      const tipo = request.params.tipo;
      const valor = decodeURIComponent(request.params.valor);
      let table;
      if (tipo === 'lineas') table = 'cat.Linea';
      else if (tipo === 'familias') table = 'cat.Familia';
      else table = CAT_TABLES[tipo];
      if (!table) return json(400, { error: 'Catálogo desconocido' });
      await query(`DELETE FROM ${table} WHERE Nombre=$1`, [valor]);
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
                Proveedor AS proveedor, PaisOrigen AS pais_origen, Estado AS estado
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
      await query(`DELETE FROM dbo.Solicitud WHERE Id=$1`, [parseInt(request.params.id, 10)]);
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
  sector:     'cat.OP_Sector'
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
  { key:'observaciones',   col:'Observaciones',       type:'text' }
];
const ORD_SELECT_FULL = `
SELECT o.Id AS id, p.Nombre AS codigo_producto, o.Descripcion AS descripcion,
       o.Cajas AS cajas, o.UnidadesPorCaja AS unidades_caja, o.TotalUnidades AS total_unidades,
       b.Nombre AS bodega, pr.Nombre AS proveedor, tr.Nombre AS transporte, se.Nombre AS sector,
       to_char(o.FechaEntrega, 'YYYY-MM-DD') AS fecha_entrega, o.PrecioEspecial AS precio_especial,
       o.NumeroEMB AS num_emb, to_char(o.FechaVencimientoEMB, 'YYYY-MM-DD') AS fecha_venc_emb,
       o.Observaciones AS observaciones, o.Estado AS estado
FROM dbo.OrdenPedido o
JOIN cat.OP_Producto  p  ON p.Id=o.ProductoId
LEFT JOIN cat.OP_Bodega    b  ON b.Id=o.BodegaId
JOIN cat.OP_Proveedor pr ON pr.Id=o.ProveedorId
LEFT JOIN cat.OP_Transporte tr ON tr.Id=o.TransporteId
LEFT JOIN cat.OP_Sector    se ON se.Id=o.SectorId`;

async function ordResolve(body) {
  const out = {};
  for (const f of ORD_FIELDS) {
    const v = body[f.key];
    if (f.type === 'text')         out[f.col] = v ? String(v) : null;
    else if (f.type === 'int')     out[f.col] = (v !== undefined && v !== '' && v !== null) ? parseInt(v, 10) : null;
    else if (f.type === 'decimal') out[f.col] = (v !== undefined && v !== '' && v !== null) ? parseFloat(v) : null;
    else if (f.type === 'date')    out[f.col] = v ? v : null;
    else if (f.type === 'cat')     out[f.col] = await catId(ORD_CAT[f.cat], v);
  }
  return out;
}
function ordValidate(body) {
  return ORD_FIELDS.filter(f => f.required && !String(body[f.key] || '').trim()).map(f => f.key);
}

/* Catálogos del módulo de órdenes */
app.http('catalogos-ordenes', {
  methods: ['GET'], authLevel: 'anonymous', route: 'catalogos-ordenes',
  handler: async (request, context) => {
    try {
      const one = async (t) => (await query(
        `SELECT Nombre FROM ${t} WHERE Activo=true ORDER BY Nombre`)).rows.map(r => r.nombre);
      const [productos, bodegas, proveedores, transporte, sector] = await Promise.all([
        one('cat.OP_Producto'), one('cat.OP_Bodega'), one('cat.OP_Proveedor'),
        one('cat.OP_Transporte'), one('cat.OP_Sector')
      ]);
      return json(200, { productos, bodegas, proveedores, transporte, sector });
    } catch (e) { context.error(e); return json(500, { error: 'Error al cargar catálogos', detail: e.message }); }
  }
});
app.http('catalogos-ordenes-add', {
  methods: ['POST'], authLevel: 'anonymous', route: 'catalogos-ordenes/{tipo}',
  handler: async (request, context) => {
    try {
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
      await query(`DELETE FROM dbo.OrdenPedido WHERE Id=$1`, [parseInt(request.params.id, 10)]);
      return json(200, { ok: true });
    } catch (e) { context.error(e); return json(500, { error: 'No se pudo eliminar', detail: e.message }); }
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
