const db = require('./config/db');
db.query('SELECT id, username, role, is_active FROM users WHERE role = "mahasiswa" LIMIT 3')
  .then(([r]) => { console.log(r); process.exit() })
  .catch(e => { console.log(e.message); process.exit() })