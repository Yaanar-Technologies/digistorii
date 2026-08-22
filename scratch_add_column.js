const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:admin123@localhost:5432/e_commerce' });
pool.query("ALTER TABLE public.companies ADD COLUMN year_type VARCHAR(20) DEFAULT 'fiscal'")
  .then(() => { console.log('Column added'); process.exit(0); })
  .catch(e => { 
    if (e.code === '42701') console.log('Column already exists');
    else console.log('Error adding column:', e.message); 
    process.exit(0); 
  });
