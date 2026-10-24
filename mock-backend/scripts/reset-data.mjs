// Deletes the local JSON database so demo data is re-seeded on next start.
import fs from 'node:fs';
import path from 'node:path';

const file = process.env.DATA_FILE || path.join(process.cwd(), '.data', 'db.json');
fs.rmSync(file, { force: true });
console.log(`Removed ${file}. Demo data will be re-seeded on next start.`);
