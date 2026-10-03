import 'dotenv/config';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { semearSeVazio } from './seed.js';
import { aplicarMigracoes, verificarMigracoes } from './migrations.js';
import { configurarAuth } from './auth.js';

const auth = configurarAuth();
const db = openDb();
if (db.isPg) {
  // `verificarMigracoes` já faz uma consulta real (schema_migrations): um "select 1" à parte antes dela
  // só soma mais uma tentativa de conexão, sem checar nada que esta já não cheque.
  await verificarMigracoes(db);
  if (process.env.NODE_ENV !== 'production') {
    console.log('Conectado ao Supabase PostgreSQL com sucesso!');
  }
} else {
  await aplicarMigracoes(db);
  if (auth.mode === 'demo') await semearSeVazio(db);
}

export const app = createApp(db, { auth });

// Modo standalone (local/VPS): escuta na porta configurada
// Em produção na Vercel, este arquivo é importado como módulo e `app` é usado como handler
if (!process.env.VERCEL) {
  const porta = Number(process.env.PORT || 3000);
  app.listen(porta, auth.mode === 'demo' ? '127.0.0.1' : undefined, () => {
    console.log(`SGC/Agilis em http://localhost:${porta}`);
    if (db.isPg) {
      console.log('Banco de dados ativo: Supabase (PostgreSQL na nuvem)');
    } else {
      console.log('Banco de dados ativo: SQLite local (data/sgc.db)');
    }
  });
}

export default app;
