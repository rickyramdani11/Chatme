const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  ssl: {
    require: true,
    rejectUnauthorized: false
  },
  max: 20,
  min: 2
});

module.exports = pool;