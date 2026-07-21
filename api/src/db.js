const sql = require('mssql');

// Configuración de conexión a Azure SQL.
// Las credenciales se leen de las App Settings (nunca van en el código).
const config = {
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  options: {
    encrypt: true,               // obligatorio en Azure SQL
    trustServerCertificate: false
  },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 }
};

let poolPromise = null;

// Reutiliza un único pool de conexiones entre invocaciones (buena práctica en Functions).
function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(config).catch(err => {
      poolPromise = null; // permite reintentar si falló la primera conexión
      throw err;
    });
  }
  return poolPromise;
}

module.exports = { sql, getPool };
