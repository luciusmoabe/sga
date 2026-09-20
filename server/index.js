import 'dotenv/config';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { semearSeVazio } from './seed.js';

const db = openDb();
if (db.isPg) {
  await db.refreshSecoes();
  console.log('Conectado ao Supabase PostgreSQL com sucesso!');
} else {
  semearSeVazio(db);
}

const porta = Number(process.env.PORT || 3000);
createApp(db).listen(porta, () => {
  console.log(`SGC/Agilis em http://localhost:${porta}`);
  if (db.isPg) {
    console.log('Banco de dados ativo: Supabase (PostgreSQL na nuvem)');
  } else {
    console.log('Banco de dados ativo: SQLite local (data/sgc.db)');
  }
});
