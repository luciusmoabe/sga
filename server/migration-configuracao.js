// Implementação da versão 28: acesso do Apoio à Configuração (usuarios.acesso_configuracao), assinalado pelo Diretor
// ou pelo Administrador. Coluna aditiva, sem mudar dados existentes. Alterações futuras exigem uma nova migração.
export async function aplicarConfiguracao(db) {
  if (db.isPg) {
    await db.exec('alter table usuarios add column if not exists acesso_configuracao integer not null default 0');
    return;
  }
  const colunas = (await db.prepare('pragma table_info(usuarios)').all()).map((c) => c.name);
  if (!colunas.includes('acesso_configuracao')) await db.exec('alter table usuarios add column acesso_configuracao integer not null default 0');
}
