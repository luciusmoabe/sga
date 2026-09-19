import { createApp } from './app.js';
import { openDb } from './db.js';
import { semearSeVazio } from './seed.js';

const db = openDb();
semearSeVazio(db); // primeira execução: cria dados fictícios de demonstração
const porta = Number(process.env.PORT || 3000);
createApp(db).listen(porta, () => {
  console.log(`SGC (protótipo) em http://localhost:${porta}`);
  console.log('Dados de demonstração fictícios. Para recomeçar: npm run seed');
});
