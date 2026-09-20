import 'dotenv/config';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { semearSeVazio } from './seed.js';

const db = openDb();
if (db.isPg) {
  await db.prepare('select 1').get();
  if (process.env.NODE_ENV !== 'production') {
    console.log('Conectado ao Supabase PostgreSQL com sucesso!');
  }
} else {
  await semearSeVazio(db);
}

export const app = createApp(db);

// Modo standalone (local/VPS): escuta na porta configurada
// Em produção na Vercel, este arquivo é importado como módulo e `app` é usado como handler
if (!process.env.VERCEL) {
  const porta = Number(process.env.PORT || 3000);
  app.listen(porta, () => {
    console.log(`SGC/Agilis em http://localhost:${porta}`);
    if (db.isPg) {
      console.log('Banco de dados ativo: Supabase (PostgreSQL na nuvem)');
    } else {
      console.log('Banco de dados ativo: SQLite local (data/sgc.db)');
    }
  });
}

export default app;
