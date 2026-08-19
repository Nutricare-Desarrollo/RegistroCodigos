const { Pool } = require('pg');

// Conexión a Azure Database for PostgreSQL (Flexible Server).
// Las credenciales se leen de las App Settings (nunca van en el código).
// PG_SSL: "true" (por defecto, obligatorio en Azure) | "false" (solo para pruebas locales).
const useSsl = (process.env.PG_SSL || 'true').toLowerCase() !== 'false';

const pool = new Pool({
  host: process.env.PG_HOST,
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  // Azure exige TLS; rejectUnauthorized:false evita tener que empaquetar el CA.
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: 5,
  // Azure corta las conexiones inactivas (y el host de Functions se duerme). Con
  // 30 s de idle el pool devolvía conexiones ya muertas y la primera consulta
  // después de un rato fallaba: se baja el idle y se activa keepAlive para que
  // la conexión no quede a merced del corte silencioso del balanceador.
  idleTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
  // Si el servidor está arrancando (o la red se cayó), fallar con un mensaje
  // claro en vez de quedarse colgado hasta el timeout de la Function.
  connectionTimeoutMillis: 15000
});

// Un cliente inactivo que se muere emite 'error' en el pool. Sin este manejador
// Node lo trata como excepción no capturada y se cae el host de Functions.
pool.on('error', (err) => {
  console.error('PostgreSQL: conexión inactiva perdida (se descarta del pool):', err.message);
});

/* Errores transitorios de conexión: la conexión que estaba en el pool ya no
   servía, o el servidor la cerró. La consulta no llegó a ejecutarse, así que
   repetirla es seguro (no duplica nada) y evita el clásico "falló, salí, volví
   a entrar y ya funcionó". */
const TRANSIENT_CODES = [
  'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'ECONNREFUSED',
  '57P01',  // admin_shutdown: el servidor cerró la conexión
  '57P02',  // crash_shutdown
  '57P03',  // cannot_connect_now: el servidor está arrancando
  '08006', '08003', '08000'  // fallos de conexión
];
function isTransient(e) {
  if (!e) return false;
  if (TRANSIENT_CODES.includes(e.code)) return true;
  const m = String(e.message || '').toLowerCase();
  return m.includes('connection terminated')
      || m.includes('connection ended')
      || m.includes('server closed the connection')
      || m.includes('timeout exceeded when trying to connect')
      || m.includes('socket hang up');
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Un único pool reutilizado entre invocaciones (buena práctica en Functions).
// query(text, params) -> { rows, rowCount }  (compatible con node-postgres)
// Reintenta hasta 2 veces si el fallo fue de conexión; cualquier otro error
// (dato inválido, UNIQUE, permiso) se lanza tal cual, sin reintentar.
async function query(text, params) {
  let last;
  for (let intento = 0; intento < 3; intento++) {
    try {
      return await pool.query(text, params);
    } catch (e) {
      if (!isTransient(e)) throw e;
      last = e;
      console.warn(`PostgreSQL: fallo de conexión (intento ${intento + 1}/3): ${e.message}`);
      if (intento < 2) await sleep(300 * (intento + 1));
    }
  }
  throw last;
}

module.exports = { pool, query };
