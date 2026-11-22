const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '25mb' }));
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : null;

let localFallbackDb = {};

async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vgp_restaurant_cloud_db (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query(`
    INSERT INTO vgp_restaurant_cloud_db (id, payload)
    VALUES ('main_store', '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  `);
}
initDb().catch(err => console.error('DB Init Warning:', err.message));

app.get('/api/vgp-state', async (req, res) => {
  try {
    if (pool) {
      const { rows } = await pool.query(
        "SELECT payload FROM vgp_restaurant_cloud_db WHERE id = 'main_store'"
      );
      return res.json(rows[0] ? rows[0].payload : {});
    }
    res.json(localFallbackDb);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/vgp-state', async (req, res) => {
  try {
    const body = req.body || {};
    localFallbackDb = body;
    if (pool) {
      await pool.query(
        `INSERT INTO vgp_restaurant_cloud_db (id, payload, updated_at)
         VALUES ('main_store', $1::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE
         SET payload = EXCLUDED.payload, updated_at = NOW()`,
        [JSON.stringify(body)]
      );
    }
    res.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`VGP World Restaurant Server running on http://localhost:${PORT}`);
});