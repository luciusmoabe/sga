// Demonstração local isolada: `npm run demo` (ou `npm run demo -- --zerar` para recomeçar com os dados fictícios).
//
// Existe para não depender de variáveis de ambiente que mudam de um terminal para outro (no PowerShell, `$env:X=""`
// apaga a variável em vez de deixá-la vazia, e o `.env` com o banco real voltava a valer). Aqui o `.env` NÃO é lido,
// `DATABASE_URL` é descartada e o banco é um arquivo SQLite numa pasta temporária: nada toca o Supabase.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
  console.error('A demonstração local é proibida em produção.');
  process.exit(1);
}

const pasta = path.join(os.tmpdir(), 'agilis-demo');
fs.mkdirSync(pasta, { recursive: true });
const envVazio = path.join(pasta, 'vazio.env');
fs.writeFileSync(envVazio, '');
const banco = path.join(pasta, 'demo.db');

if (process.argv.includes('--zerar')) {
  for (const sufixo of ['', '-wal', '-shm']) fs.rmSync(banco + sufixo, { force: true });
  console.log('Banco de demonstração recriado.');
}

process.env.DOTENV_CONFIG_PATH = envVazio; // o `import 'dotenv/config'` do servidor passa a ler um arquivo vazio
process.env.SGC_AUTH_MODE = 'demo';
process.env.SGC_DB = banco;
process.env.PORT ||= '3222';
delete process.env.DATABASE_URL;
delete process.env.SGC_MIGRATION_DATABASE_URL;

console.log(`Demonstração isolada (dados fictícios) em http://127.0.0.1:${process.env.PORT}`);
console.log(`Banco: ${banco}`);
await import('./index.js');
