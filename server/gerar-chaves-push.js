// Gera um par de chaves VAPID para os avisos no celular: `npm run push:chaves`.
// A chave PRIVADA é segredo: vai só para o ambiente do servidor (nunca para o repositório nem para o navegador).
import { gerarChaves } from './push.js';

const { publicKey, privateKey } = gerarChaves();
console.log('Copie para o ambiente do servidor (Vercel: Settings > Environment Variables):\n');
console.log(`SGC_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`SGC_VAPID_PRIVATE_KEY=${privateKey}`);
console.log('SGC_VAPID_SUBJECT=mailto:contato@seu-orgao.gov.br   # ou https://endereco-do-sistema\n');
console.log('A chave privada é secreta: não a coloque no repositório. Trocar as chaves invalida todos os aparelhos já ativados.');
