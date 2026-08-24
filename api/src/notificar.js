/* ============================================================================
   NOTIFICACIONES — aviso de creación por Teams y correo
   ----------------------------------------------------------------------------
   Cuando se crea un código o una orden de pedido —desde el formulario o por
   carga de Excel, y con CUALQUIER rol— se manda UN POST a un flujo de Power
   Automate. El flujo arma el mensaje y lo reparte: publica en el canal de Teams
   y manda el correo a las cuentas de dbo.NotificacionCuenta (Configuración →
   Notificaciones, migración V10).

   El reparto y el DISEÑO del mensaje son del flujo. Desde acá solo va el dato
   crudo: qué pasó, quién lo pidió, cuántos registros y a quién avisarle.

   Por qué un flujo y no enviar desde acá
   --------------------------------------
   Los webhooks entrantes de Office 365 en Teams se retiraron el 22 de mayo de
   2026; el reemplazo que recomienda Microsoft es un flujo de Power Automate. Y
   una vez que el flujo existe para Teams, el correo sale del mismo flujo con el
   conector de Outlook: no hace falta un recurso de Azure para correo, ni
   permisos de aplicación Mail.Send con consentimiento del administrador, ni una
   dependencia npm. Un solo secreto: la URL.

   App Settings
   ------------
   NOTIF_FLOW_URL  URL del flujo. **Es una credencial**: la firma viaja en el
                   parámetro `sig` de la propia URL, así que cualquiera que la
                   tenga puede disparar el flujo. Va SOLO en App Settings,
                   nunca en el repositorio.
                   SI NO ESTÁ, no se manda nada y se deja un warn en los logs.
                   La app sigue funcionando igual: el registro se crea, solo no
                   avisa. Es lo que permite desplegar esto antes que el flujo.

   Contrato con el flujo
   ---------------------
   Se manda:
     { "Descripcion": "Solicitud de creacion de codigos",
       "SolicitadoPor": "anquesada@nutricare.co.cr",
       "Cantidad": 0,                 // 0 desde el formulario; N en carga masiva
       "NombreArchivo": "",           // "" desde el formulario
       "Cuentas": [ { "Email": "lgomez@nutricare.co.cr" } ] }

   Y responde  { "Resultado": "Enviado" }  o  { "Resultado": "Error" }.

   OJO: el flujo devuelve **200 en los dos casos**. Un `Resultado: "Error"` es un
   fallo aunque el HTTP diga que todo bien, así que acá se revisa el CUERPO y no
   solo el código de estado.

   Regla de oro: NADA de acá puede tumbar la creación del registro. El registro
   ya está guardado cuando se llama a este módulo; si el aviso falla, falla el
   aviso y nada más. Por eso todo va envuelto y no se re-lanza ningún error.
   ============================================================================ */
const { query } = require('./db');

const TIMEOUT_MS = 6000;   // el flujo responde en ~300 ms; esto es el techo para no colgar el guardado

const flowUrl = () => (process.env.NOTIF_FLOW_URL || '').trim();

/* La descripción es el texto EXACTO que el flujo espera para decidir qué
   mensaje arma. No se construye con plantillas ni se traduce: si cambia de un
   lado tiene que cambiar del otro, y por eso están las cuatro juntas acá. */
const DESCRIPCION = {
  codigos: { formulario: 'Solicitud de creacion de codigos',
             carga:      'Carga Masiva de codigos' },
  ordenes: { formulario: 'Solicitud de Orden de Pedido',
             carga:      'Carga Masiva Solicitud de orden de pedido' }
};

async function destinatarios() {
  const r = await query(`SELECT Correo AS correo FROM dbo.NotificacionCuenta ORDER BY Correo`);
  return r.rows.map(x => ({ Email: x.correo }));
}

/* Único punto de salida. Devuelve true/false SOLO para los logs y las pruebas;
   nadie decide nada con eso. */
async function enviar(context, payload) {
  const url = flowUrl();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    const txt = await res.text().catch(() => '');
    if (!res.ok) {
      context.error(`[notificar] el flujo respondió ${res.status}: ${txt.slice(0, 300)}`);
      return false;
    }
    // El flujo contesta 200 aunque haya fallado: la verdad está en el cuerpo.
    let resultado = null;
    try { resultado = (JSON.parse(txt) || {}).Resultado; } catch { /* cuerpo no-JSON */ }
    if (resultado !== 'Enviado') {
      context.error(`[notificar] el flujo no envió el aviso (Resultado: ${resultado ?? 'sin cuerpo JSON'}): ${txt.slice(0, 300)}`);
      return false;
    }
    context.log(`[notificar] «${payload.Descripcion}» enviado a ${payload.Cuentas.length} cuenta(s)`);
    return true;
  } catch (e) {
    // AbortError incluido: el aviso se pierde, el registro NO.
    context.error(`[notificar] no se pudo avisar («${payload.Descripcion}»): ${e.name} ${e.message}`);
    return false;
  } finally { clearTimeout(t); }
}

/* Arma el payload y lo manda. Las dos variantes —formulario y carga— cambian
   solo la descripción, la cantidad y el nombre del archivo. */
async function avisar(context, { modulo, usuario, origen, cantidad, archivo }) {
  // Avisa CUALQUIER rol. Antes se limitaba al rol General, pero en la práctica
  // todos los usuarios del portal son Administrador, así que ese filtro dejaba
  // el aviso sin dispararse nunca. Como ya no hace falta saber el rol, tampoco
  // se consulta: se ahorra una consulta a la base en cada registro creado.
  const desc = (DESCRIPCION[modulo] || {})[origen];
  if (!desc) { context.error(`[notificar] módulo/origen desconocido: ${modulo}/${origen}`); return false; }
  if (!flowUrl()) { context.warn('[notificar] NOTIF_FLOW_URL no configurada: no se manda el aviso'); return false; }
  const cuentas = await destinatarios();
  if (!cuentas.length) { context.warn('[notificar] no hay cuentas en Configuración → Notificaciones'); return false; }

  return await enviar(context, {
    Descripcion: desc,
    SolicitadoPor: (usuario && (usuario.email || usuario.name)) || '',
    Cantidad: Number(cantidad) || 0,
    NombreArchivo: archivo || '',
    Cuentas: cuentas
  });
}

/* Un registro creado desde el FORMULARIO. Cantidad 0 y sin archivo, que es como
   el flujo distingue este caso del de la carga. */
async function avisarCreacion(context, { modulo, usuario }) {
  try {
    return await avisar(context, { modulo, usuario, origen: 'formulario', cantidad: 0, archivo: '' });
  } catch (e) {
    context.error(`[notificar] error armando el aviso de creación: ${e.message}`);
    return false;
  }
}

/* Una CARGA DE EXCEL, entera: un solo aviso con el total, no uno por fila. */
async function avisarCarga(context, { modulo, usuario, cantidad, archivo }) {
  try {
    return await avisar(context, { modulo, usuario, origen: 'carga', cantidad, archivo });
  } catch (e) {
    context.error(`[notificar] error armando el aviso de carga: ${e.message}`);
    return false;
  }
}

module.exports = { avisarCreacion, avisarCarga, DESCRIPCION };
