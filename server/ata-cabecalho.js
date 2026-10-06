import { falha, h, permit } from './helpers.js';

export function rotasCabecalhoAta(app, { db, cfg }) {
  app.put('/api/config/ata', permit('diretor', 'apoio', 'administrador'), h(async req => {
    const { ata_cabecalho, ata_brasao } = req.body || {};
    if (typeof ata_cabecalho !== 'string' || ata_cabecalho.length > 1500 || ata_cabecalho.split('\n').length > 12) throw falha(400, 'O cabeçalho deve ter até 1.500 caracteres e 12 linhas.');
    if (typeof ata_brasao !== 'string') throw falha(400, 'Envie o brasão em PNG.');
    if (ata_brasao) {
      if (!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(ata_brasao) || ata_brasao.length > 164000) throw falha(400, 'O brasão deve ser PNG com até 120 KB.');
      const png = Buffer.from(ata_brasao.split(',')[1], 'base64');
      if (png.length > 120 * 1024 || png.length < 33 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || png.subarray(12, 16).toString() !== 'IHDR'
        || !png.readUInt32BE(16) || !png.readUInt32BE(20) || png.readUInt32BE(16) > 1024 || png.readUInt32BE(20) > 1024) throw falha(400, 'Brasão PNG inválido ou com dimensões acima de 1.024 pixels.');
    }
    return db.transaction(async () => {
      for (const [chave, valor] of [['ata_cabecalho', ata_cabecalho.trim()], ['ata_brasao', ata_brasao]]) {
        await db.prepare('insert into config (chave, valor) values (?, ?) on conflict(chave) do update set valor = excluded.valor').run(chave, valor);
      }
      return cfg();
    });
  }));
}
