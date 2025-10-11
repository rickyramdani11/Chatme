/**
 * Red Packet Database Initialization
 */

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

export async function initRedPacketTables() {
  try {
    console.log('[RedPacket] Initializing database tables...');

    // Red packets table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS red_packets (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(50) NOT NULL,
        sender_id INTEGER NOT NULL,
        sender_name VARCHAR(255) NOT NULL,
        total_amount INTEGER NOT NULL,
        total_slots INTEGER NOT NULL,
        remaining_slots INTEGER NOT NULL,
        remaining_amount INTEGER NOT NULL,
        message TEXT,
        distribution_type VARCHAR(20) DEFAULT 'random',
        expires_at TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Red packet claims table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS red_packet_claims (
        id SERIAL PRIMARY KEY,
        packet_id INTEGER REFERENCES red_packets(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        username VARCHAR(255) NOT NULL,
        amount INTEGER NOT NULL,
        claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(packet_id, user_id)
      )
    `);

    // Create index for faster lookups
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_red_packets_room_status 
      ON red_packets(room_id, status)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_red_packet_claims_packet 
      ON red_packet_claims(packet_id)
    `);

    console.log('[RedPacket] ✅ Database tables initialized successfully');
  } catch (error) {
    console.error('[RedPacket] Error initializing tables:', error);
  }
}

export { pool };
