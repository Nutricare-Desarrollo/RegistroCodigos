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
  idleTimeoutMillis: 30000
});

// Un único pool reutilizado entre invocaciones (buena práctica en Functions).
// query(text, params) -> { rows, rowCount }  (compatible con node-postgres)
function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
