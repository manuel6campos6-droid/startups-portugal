// Manda para o Telegram as vagas novas das multinacionais que servem ao Manuel:
// em Portugal e de entrada (estágio, júnior, graduate). Corre depois do 7-multinacionais.
// Nunca se candidata a nada: só avisa com o link; quem envia é ele.
// `npm run avisar -- tudo` manda todas as que servem, não só as novas (para testar).
import fs from 'node:fs';
import path from 'node:path';
import { ler } from './comum.mjs';

// No GitHub as chaves vêm dos secrets; no Mac vêm do .env.
const ENV = path.join(import.meta.dirname, '..', '.env');
if (fs.existsSync(ENV)) process.loadEnvFile(ENV);

const TOKEN = process.env.TELEGRAM_VAGAS_TOKEN;
const CHAT = process.env.TELEGRAM_VAGAS_CHAT_ID;
if (!TOKEN) throw new Error('[startups] falta TELEGRAM_VAGAS_TOKEN no .env (o token que o @BotFather deu ao bot das vagas)');

// O título decide quando a empresa não diz o nível (a Bolt não diz).
const ENTRADA = /\b(intern|internship|trainee|graduate|junior|jr\.?|entry[- ]level|est[aá]gi)/i;
const SENIOR = /\b(senior|sr\.?|lead|head|principal|staff|director|manager,? senior)\b/i;
const NIVEIS_ENTRADA = new Set(['Entry Level', 'Associate', 'Internship']);
const serve = (v) => v.pais === 'Portugal' && !SENIOR.test(v.titulo) && (ENTRADA.test(v.titulo) || NIVEIS_ENTRADA.has(v.nivel));

async function telegram(metodo, corpo) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${metodo}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo),
  });
  const j = await res.json();
  if (!j.ok) throw new Error(`[startups] o Telegram recusou ${metodo}: ${j.description}`);
  return j.result;
}

// Sem chat id, descobre-o pela última mensagem enviada ao bot (o /start do Manuel).
async function chatId() {
  if (CHAT) return CHAT;
  const msgs = await telegram('getUpdates', {});
  const id = msgs.map((u) => u.message?.chat?.id).filter(Boolean).pop();
  if (!id) throw new Error('[startups] o bot ainda não recebeu mensagens: abre-o no Telegram e manda /start');
  console.log(`[startups] chat do Telegram: ${id} (põe TELEGRAM_VAGAS_CHAT_ID=${id} no .env e nos secrets do GitHub)`);
  return id;
}

const html = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const d = ler('multinacionais.json', null);
if (!d) throw new Error('[startups] não há dados/multinacionais.json: corre primeiro npm run multinacionais');
const tudo = process.argv[2] === 'tudo';
// Na primeira leitura de uma empresa todas as vagas têm a data de hoje: não são novas, a empresa é que é.
const jaLida = (e) => e.vagas.some((v) => v.vistaEm < d.geradoEm);
const vagas = d.empresas.flatMap((e) => e.vagas.filter(serve).filter(() => tudo || jaLida(e)).map((v) => ({ ...v, empresa: e.nome })))
  .filter((v) => tudo || v.vistaEm === d.geradoEm);

if (!vagas.length) {
  console.log('[startups] nenhuma vaga nova que sirva: não se manda nada');
  process.exit(0);
}

const linhas = vagas.map((v) => `• <b>${html(v.empresa)}</b>: <a href="${html(v.url)}">${html(v.titulo.trim())}</a>\n   ${html(v.local)}${v.nivel ? ' · ' + html(v.nivel) : ''}`);
const cabecalho = `<b>${vagas.length} ${tudo ? 'vagas que servem' : vagas.length === 1 ? 'vaga nova' : 'vagas novas'}</b>\n\n`;
// O Telegram corta mensagens acima de 4096 caracteres: parte-se em blocos.
const blocos = [];
let atual = cabecalho;
for (const l of linhas) {
  if ((atual + l).length > 3900) { blocos.push(atual); atual = ''; }
  atual += l + '\n\n';
}
blocos.push(atual);

const chat = await chatId();
for (const texto of blocos) await telegram('sendMessage', { chat_id: chat, text: texto, parse_mode: 'HTML', disable_web_page_preview: true });
console.log(`[startups] ${vagas.length} vagas enviadas para o Telegram`);
