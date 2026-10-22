// LinkedIn pelo Apify, com a conta Apify deste projecto (nunca a da NOITE).
//   posts:    últimos posts da Startup Portugal e da Unicorn Factory; as empresas que eles mencionam
//             são startups «ligadas» que não estão em mais lista nenhuma.
//   empresas: ficha do LinkedIn (site, tamanho, sede, sector, financiamento) das startups que só temos
//             pelo nome (Unicorn Factory, lista oficial sem site) e das mencionadas nos posts.
// Cada corrida tem tecto de gasto (APIFY_TETO_USD) imposto pelo próprio Apify, e o que já foi lido
// fica em cache: voltar a correr só paga o que falta.
//
// Uso: npm run linkedin -- posts        (≈ 0,002 USD por post)
//      npm run linkedin -- empresas 100 (≈ 0,004 USD por empresa; 100 = quantas nesta corrida)
import fs from 'node:fs';
import path from 'node:path';
import { ler, gravar, esperar } from './comum.mjs';

const ENV = path.join(import.meta.dirname, '..', '.env');
if (fs.existsSync(ENV)) process.loadEnvFile(ENV);
const TOKEN = process.env.APIFY_TOKEN;
if (!TOKEN || !TOKEN.startsWith('apify_api_')) {
  throw new Error('[startups] falta APIFY_TOKEN no .env deste projecto (copia o .env.example). Usa uma conta Apify própria, não a da NOITE.');
}
const TETO = Number(process.env.APIFY_TETO_USD || 2);

const FONTES = {
  'Startup Portugal': 'https://www.linkedin.com/company/startup-portugal/',
  'Unicorn Factory Lisboa': 'https://www.linkedin.com/company/unicornfactorylisboa/',
};

async function correr(actor, input) {
  const api = 'https://api.apify.com/v2';
  const res = await fetch(`${api}/acts/${actor}/runs?token=${TOKEN}&maxTotalChargeUsd=${TETO}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`[startups] o Apify recusou ${actor}: ${res.status} ${await res.text()}`);
  let run = (await res.json()).data;
  console.log(`[startups] ${actor} a correr (tecto ${TETO} USD): https://console.apify.com/view/runs/${run.id}`);
  while (['READY', 'RUNNING'].includes(run.status)) {
    await esperar(10000);
    run = (await (await fetch(`${api}/actor-runs/${run.id}?token=${TOKEN}`)).json()).data;
  }
  const itens = await (await fetch(`${api}/datasets/${run.defaultDatasetId}/items?token=${TOKEN}&clean=true`)).json();
  const gasto = run.usageTotalUsd ?? run.chargedEventCounts ?? '?';
  console.log(`[startups] ${actor}: ${run.status}, ${itens.length} resultados, gasto ${typeof gasto === 'number' ? gasto.toFixed(3) + ' USD' : JSON.stringify(gasto)}`);
  if (run.status !== 'SUCCEEDED') console.warn(`[startups] a corrida acabou em ${run.status}; se foi o tecto, sobe APIFY_TETO_USD ou pede menos de cada vez`);
  return itens;
}

const slugDe = (u) => (String(u).match(/linkedin\.com\/company\/([^/?#"\s]+)/i) || [])[1]?.toLowerCase();

function extrairMencoes(itens) {
  // As marcações de empresas vêm em contentAttributes (type COMPANY_NAME), também dentro de partilhas.
  const fontes = new Set([...Object.values(FONTES), ...Object.values(ler('vcs-linkedin.json', {}))].map(slugDe));
  const ligadas = {};
  for (const p of itens) {
    const autor = Object.keys(FONTES).find((n) => p.author?.name === n) || p.author?.name || 'LinkedIn';
    const deVc = Object.keys(FONTES).every((n) => p.author?.name !== n.replace(/ Lisboa$/, '') && p.author?.name !== n);
    const marcas = [...(p.contentAttributes || []), ...(p.repost?.contentAttributes || [])].filter((a) => a.type === 'COMPANY_NAME' && a.company);
    for (const { company } of marcas) {
      const s = slugDe(company.linkedinUrl);
      if (!s || fontes.has(s)) continue;
      (ligadas[s] ||= { slug: s, nome: company.name, url: company.linkedinUrl, mencionadaPor: [], vezes: 0, posts: [] });
      ligadas[s].vezes++;
      if (!ligadas[s].mencionadaPor.includes(autor)) ligadas[s].mencionadaPor.push(autor);
      if (deVc) ligadas[s].porVc = true;
      if (ligadas[s].posts.length < 3) ligadas[s].posts.push(p.linkedinUrl);
      const quando = p.postedAt?.date || '';
      if (quando > (ligadas[s].ultimaMencao || '')) ligadas[s].ultimaMencao = quando;
    }
  }
  return ligadas;
}

async function posts() {
  // «posts vcs N»: posts dos VCs (as empresas que marcam são investimentos recentes); senão os das duas fontes.
  const dosVcs = process.argv[3] === 'vcs';
  const alvos = dosVcs ? Object.values(ler('vcs-linkedin.json', {})) : Object.values(FONTES);
  if (!alvos.length) throw new Error('[startups] falta dados/vcs-linkedin.json: corre primeiro npm run linkedin -- vcs-paginas');
  const itens = await correr('harvestapi~linkedin-company-posts', {
    targetUrls: alvos, maxPosts: Number(process.argv[dosVcs ? 4 : 3]) || 150, includeQuotePosts: true, includeReposts: true,
  });
  // Os posts juntam-se aos já lidos (por link), para as menções das duas fontes e dos VCs viverem juntas.
  const antigos = ler('linkedin-posts.json', []);
  const vistos = new Set(antigos.map((p) => p.linkedinUrl));
  const todos = [...antigos, ...itens.filter((p) => !vistos.has(p.linkedinUrl))];
  gravar('linkedin-posts.json', todos);
  const ligadas = extrairMencoes(todos);
  gravar('linkedin-ligadas.json', Object.values(ligadas));
  console.log(`[startups] ${itens.length} posts; ${Object.keys(ligadas).length} empresas mencionadas`);
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(lda|s\.?a|unipessoal|sociedade|limitada|bv|inc|ltd)\b\.?/g, '').replace(/[^a-z0-9]/g, '');

// O que se guarda de cada ficha do LinkedIn. Separado para se poder reaplicar à resposta já paga
// (npm run linkedin -- reprocessar) quando se passa a querer um campo novo.
function ficha(achado) {
  const f = achado.fundingData || {};
  const ultima = f.lastFundingRound || {};
  const industrias = (achado.industries || []).map((x) => x.name || x).join(', ');
  return {
    lido: new Date().toISOString(), nome: achado.name, linkedin: achado.linkedinUrl, site: achado.website || '',
    tamanho: achado.employeeCountRange ? `${achado.employeeCountRange.start}–${achado.employeeCountRange.end ?? '+'}` : '',
    funcionarios: achado.employeeCount ?? null,
    sector: industrias,
    descricao: achado.tagline || '',
    sede: (achado.locations || []).find((l) => l.headquarter)?.parsed?.text || (achado.locations || [])[0]?.city || '',
    fundada: achado.foundedOn?.year ?? null,
    cidadeSede: (achado.locations || []).find((l) => l.headquarter)?.parsed?.city || (achado.locations || [])[0]?.parsed?.city || '',
    distritoSede: ((achado.locations || []).find((l) => l.headquarter) || (achado.locations || [])[0])?.parsed?.countryCode === 'PT'
      ? (((achado.locations || []).find((l) => l.headquarter) || (achado.locations || [])[0]).parsed.state || '') : '',
    // Parceiros que aparecem nas marcações mas não contratam como startup: fundos, Estado, universidades.
    naoStartup: /venture capital|capital de risco|investment|government|administração pública|higher education|ensino superior|research services|non-profit|banking/i
      .test(industrias) || (achado.employeeCount ?? 0) > 2000,
    emPortugal: /portugal|\bPT\b|lisbo|porto|braga|coimbra|aveiro/i.test(JSON.stringify(achado.locations || [])),
    financiamento: ultima.fundingType || '',
    financiamentoData: ultima.announcedOn ? [ultima.announcedOn.year, ultima.announcedOn.month].filter(Boolean).join('-') : '',
    financiamentoValor: ultima.moneyRaised?.amount ? `${ultima.moneyRaised.amount} ${ultima.moneyRaised.currencyCode || ''}`.trim() : '',
    rondas: f.numFundingRounds ?? null,
    vagasLinkedin: achado.jobSearchUrl || '',
    seguidores: achado.followerCount ?? null,
    // As especialidades e a descrição dizem se a empresa trabalha com IA melhor do que o sector.
    especialidades: (achado.specialities || []).join(', '),
    sobre: (achado.description || '').slice(0, 600),
    temInvestimento: !!(f.numFundingRounds || ultima.fundingType),
  };
}

function reprocessar() {
  const cache = ler('linkedin-empresas.json', {});
  const itens = ler('linkedin-ultima-corrida.json', []);
  const porUrl = new Map(itens.map((i) => [slugDe(i.linkedinUrl), i]));
  let n = 0;
  for (const [chave, v] of Object.entries(cache)) {
    if (v.naoEncontrada) continue;
    const i = porUrl.get(slugDe(v.linkedin));
    if (i) { cache[chave] = { ...ficha(i), lido: v.lido }; n++; }
  }
  gravar('linkedin-empresas.json', cache);
  console.log(`[startups] ${n} fichas reprocessadas sem novo pedido ao Apify`);
}

async function empresas() {
  const quantas = Number(process.argv[3]) || 100;
  const cache = ler('linkedin-empresas.json', {});
  const registo = ler('registo.json', {});
  const pedidos = [];
  // 1) mencionadas pela Startup Portugal / Unicorn Factory: já temos o link, é certo
  for (const l of ler('linkedin-ligadas.json', [])) if (!cache['url:' + l.slug]) pedidos.push({ chave: 'url:' + l.slug, url: l.url });
  // 1b) Search funds: o nome, para chegar à página da empresa e daí aos searchers
  for (const f of ler('searchfunds.json', [])) if (!cache['nome:' + norm(f.nome)]) pedidos.push({ chave: 'nome:' + norm(f.nome), nome: f.nome });
  // 2) Unicorn Factory: só o nome (salta as que já vêm marcadas nos posts, para não pagar duas vezes)
  const jaMarcadas = new Set(ler('linkedin-ligadas.json', []).map((l) => norm(l.nome)));
  for (const u of ler('unicorn.json', [])) if (!cache['nome:' + norm(u.nome)] && !jaMarcadas.has(norm(u.nome))) pedidos.push({ chave: 'nome:' + norm(u.nome), nome: u.nome });
  // 3) lista oficial sem site no registo
  for (const e of ler('oficial.json', [])) {
    const r = registo[e.nipc];
    if (r && !r.erro && !r.site && !cache['nome:' + norm(e.nome)]) pedidos.push({ chave: 'nome:' + norm(e.nome), nome: e.nome.replace(/,?\s*(LDA|L\.DA|S\.A\.?|UNIPESSOAL)\.?\s*$/i, '') });
  }
  const lote = pedidos.slice(0, quantas);
  if (!lote.length) return console.log('[startups] nada por pedir ao LinkedIn');
  console.log(`[startups] ${pedidos.length} empresas por ler no LinkedIn; esta corrida pede ${lote.length} (≈ ${(lote.length * 0.004).toFixed(2)} USD)`);

  const itens = await correr('harvestapi~linkedin-company', {
    companies: lote.filter((p) => p.url).map((p) => p.url),
    searches: lote.filter((p) => p.nome).map((p) => p.nome),
  });
  gravar('linkedin-ultima-corrida.json', itens);

  for (const p of lote) {
    const achado = p.url
      ? itens.find((i) => slugDe(i.linkedinUrl) === p.chave.slice(4) || i.universalName?.toLowerCase() === p.chave.slice(4))
      // Pesquisa por nome: o LinkedIn devolve sempre alguma coisa; só aceita se o nome bater certo.
      : itens.find((i) => norm(i.name) === p.chave.slice(5) || norm(i.universalName) === p.chave.slice(5));
    cache[p.chave] = achado
      ? ficha(achado)
      : { lido: new Date().toISOString(), naoEncontrada: true };
  }
  gravar('linkedin-empresas.json', cache);
  const v = Object.values(cache);
  console.log(`[startups] LinkedIn: ${v.filter((x) => !x.naoEncontrada).length} encontradas, ${v.filter((x) => x.naoEncontrada).length} sem correspondência, ${pedidos.length - lote.length} ainda por pedir`);
}

// Liga cada pessoa à empresa pedida. O nome a comparar é o do LinkedIn («Bloq.it»), não o da nossa lista
// («Bloqstrx», nome legal): com o da lista nada batia e cada corrida voltava a pedir as mesmas 8 empresas.
// Sem correspondência exacta, aceita quando um nome contém o outro (≥ 4 letras); «Cheez 2 Pleez» não passa por «Pleez».
function ligarPessoas(itens, lote, vistas) {
  const cache = ler('linkedin-empresas.json', {});
  const nomeLi = new Map(Object.values(cache).filter((c) => c.linkedin).map((c) => [slugDe(c.linkedin), c.nome]));
  const alvos = lote.map((x) => ({ slug: slugDe(x.linkedin), nomes: [nomeLi.get(slugDe(x.linkedin)), x.nome].filter(Boolean).map(norm) }));
  for (const i of itens) {
    const pos = (i.currentPositions || [])[0] || {};
    const n = norm(pos.companyName);
    const alvo = alvos.find((a) => a.nomes.includes(n)) || alvos.find((a) => a.nomes.some((m) => m.length >= 4 && n.length >= 4 && (n.startsWith(m) || m.startsWith(n))));
    if (!alvo || !vistas[alvo.slug]) { console.warn(`[startups] pessoa sem empresa correspondente: ${i.firstName} ${i.lastName} (${pos.companyName})`); continue; }
    if (vistas[alvo.slug].some((p) => p.linkedin === i.linkedinUrl)) continue;
    vistas[alvo.slug].push({
      nome: [i.firstName, i.lastName].filter(Boolean).join(' '), cargo: pos.title || '', fundador: FUNDADOR.test(pos.title || ''),
      linkedin: i.linkedinUrl || '', local: i.location?.linkedinText || '',
    });
  }
}

// Refaz a ligação a partir da última corrida guardada, sem pagar.
function religarFundadores() {
  const feitos = ler('fundadores.json', {});
  const corridas = ler('fundadores-corridas.json', []);
  const ultima = ler('fundadores-ultima-corrida.json', []);
  const lista = ler('startups.json', { empresas: [] }).empresas.filter((x) => x.linkedin);
  const lote = lista.filter((x) => !feitos[slugDe(x.linkedin)]);
  const vistas = Object.fromEntries(lote.map((x) => [slugDe(x.linkedin), []]));
  for (const itens of [ultima, ...corridas.map((c) => c.itens)]) ligarPessoas(itens, lote, vistas);
  let n = 0;
  for (const [k, v] of Object.entries(vistas)) if (v.length) { feitos[k] = v.sort((a, b) => b.fundador - a.fundador); n++; }
  gravar('fundadores.json', feitos);
  console.log(`[startups] fundadores religados: ${n} empresas novas`);
}

// Fundadores (e CEO) das empresas com LinkedIn: nome, cargo e link do perfil, para escrever pelo LinkedIn.
// Modo «Short» (0,004 USD por pessoa no plano grátis), no máximo 3 por empresa. Primeiro as empresas com
// vagas em Portugal, depois as do Scaling Up, depois as restantes. Os emails NÃO se pedem: candidatura
// pessoa a pessoa pelo LinkedIn, nunca envio em massa (RGPD).
// O filtro por cargo (jobTitles) devolvia 0 pessoas; o de senioridade do LinkedIn funciona:
// 310 = CXO (CEO, CTO, COO…), 320 = Owner / Partner (onde os fundadores se marcam).
const SENIORIDADE_FUNDADOR = ['310', '320'];
const FUNDADOR = /found|fundad|owner|propriet/i;
async function fundadores() {
  // No plano grátis o actor pára aos 25 perfis por corrida: 8 empresas × 3 cabem numa corrida.
  const quantas = Math.min(Number(process.argv[3]) || 8, process.env.APIFY_PLANO_PAGO ? 1000 : 8);
  const feitos = ler('fundadores.json', {});
  const lista = ler('startups.json', { empresas: [] }).empresas.filter((x) => x.linkedin && !feitos[slugDe(x.linkedin)]);
  const prioridade = (x) => ((x.vagas || []).length ? 0 : 1) * 2 + (x.fontes.some((f) => /Scaling Up/.test(f)) ? 0 : 1);
  lista.sort((a, b) => prioridade(a) - prioridade(b));
  const lote = lista.slice(0, quantas);
  if (!lote.length) return console.log('[startups] não há empresas com LinkedIn por ver os fundadores (corre primeiro npm run juntar)');
  console.log(`[startups] fundadores e direcção de ${lote.length} empresas (até ${lote.length * 3} perfis ≈ ${(0.02 + lote.length * 3 * 0.004).toFixed(2)} USD no máximo)`);
  const itens = await correr('harvestapi~linkedin-company-employees', {
    companies: lote.map((x) => x.linkedin), seniorityLevelIds: SENIORIDADE_FUNDADOR,
    profileScraperMode: 'Short ($4 per 1k)', companyBatchMode: 'one_by_one', maxItemsPerCompany: 3, maxItems: lote.length * 3,
  });
  gravar('fundadores-ultima-corrida.json', itens);
  // Todas as corridas ficam guardadas: se a ligação às empresas falhar, refaz-se sem voltar a pagar.
  gravar('fundadores-corridas.json', [...ler('fundadores-corridas.json', []), { quando: new Date().toISOString(), empresas: lote.map((x) => x.linkedin), itens }]);
  const vistas = {};
  for (const x of lote) vistas[slugDe(x.linkedin)] = [];
  ligarPessoas(itens, lote, vistas);
  // Só ficam marcadas como vistas as empresas que deram pessoas: se a corrida parou a meio (limite do
  // plano), as outras voltam na próxima em vez de ficarem dadas como «sem fundadores».
  for (const [k, v] of Object.entries(vistas)) if (v.length) feitos[k] = v.sort((a, b) => b.fundador - a.fundador);
  if (itens.length >= 25 && !process.env.APIFY_PLANO_PAGO) console.warn('[startups] chegou aos 25 perfis do plano grátis; as empresas sem pessoas ficam para a próxima corrida');
  gravar('fundadores.json', feitos);
  const com = Object.values(feitos).filter((v) => v.length).length;
  console.log(`[startups] fundadores: ${itens.length} perfis; ${com} empresas com pelo menos um nome; ${lista.length - lote.length} empresas ainda por ver`);
}

// Searchers dos search funds activos: as pessoas por trás do fundo (Owner / Partner / CXO), até 2 por fundo.
async function searchers() {
  const cache = ler('linkedin-empresas.json', {});
  const feitos = ler('searchers.json', {});
  const fundos = ler('searchfunds.json', []).filter((f) => f.activo)
    .map((f) => ({ ...f, li: cache['nome:' + norm(f.nome)] }))
    .filter((f) => f.li?.linkedin && !feitos[norm(f.nome)]);
  const lote = fundos.slice(0, 12);
  if (!lote.length) return console.log('[startups] não há search funds activos com LinkedIn por ver (corre primeiro: empresas)');
  console.log(`[startups] searchers de ${lote.length} search funds (até ${lote.length * 2} perfis)`);
  const itens = await correr('harvestapi~linkedin-company-employees', {
    companies: lote.map((f) => f.li.linkedin), seniorityLevelIds: SENIORIDADE_FUNDADOR,
    profileScraperMode: 'Short ($4 per 1k)', companyBatchMode: 'one_by_one', maxItemsPerCompany: 2, maxItems: lote.length * 2,
  });
  gravar('searchers-ultima-corrida.json', itens);
  for (const i of itens) {
    const pos = (i.currentPositions || [])[0] || {};
    const f = lote.find((x) => norm(pos.companyName) === norm(x.li.nome) || norm(pos.companyName).includes(norm(x.nome).replace(/capital|partners/g, '')));
    if (!f) { console.warn(`[startups] searcher sem fundo correspondente: ${i.firstName} ${i.lastName} (${pos.companyName})`); continue; }
    (feitos[norm(f.nome)] ||= []).push({ nome: [i.firstName, i.lastName].filter(Boolean).join(' '), cargo: pos.title || '', linkedin: i.linkedinUrl || '', local: i.location?.linkedinText || '' });
  }
  gravar('searchers.json', feitos);
  console.log(`[startups] searchers: ${itens.length} perfis em ${Object.keys(feitos).length} fundos`);
}

// Página do LinkedIn de cada VC (pesquisa por nome, uma corrida).
async function vcsPaginas() {
  const nomes = [...new Set(ler('vcs.json', []).map((v) => v.vc))];
  const PESQUISA = { 'Shilling': 'Shilling VC', 'Faber': 'Faber Ventures', 'Bynd': 'Bynd Venture Capital', 'MAZE': 'MAZE impact', 'Armilar': 'Armilar Venture Partners' };
  const itens = await correr('harvestapi~linkedin-company', { searches: nomes.map((n) => PESQUISA[n] || n) });
  const out = {};
  for (const n of nomes) {
    const q = norm(PESQUISA[n] || n);
    const i = itens.find((x) => norm(x.name) === q || norm(x.name).startsWith(norm(n)) || q.startsWith(norm(x.name)));
    if (i && /venture|capital|invest/i.test((i.industries || []).map((x) => x.name || x).join(' ') + ' ' + i.name)) out[n] = i.linkedinUrl;
    else console.warn(`[startups] VC sem página do LinkedIn confirmada: ${n} (veio: ${i?.name || 'nada'})`);
  }
  gravar('vcs-linkedin.json', out);
  console.log(`[startups] páginas de VC: ${Object.keys(out).length}/${nomes.length}`, out);
}

// Vagas do LinkedIn em Portugal das empresas da lista (curious_coder, 0,002 USD por vaga).
// O id numérico de cada empresa vem do link «Vagas no LinkedIn» da ficha (f_C=). Pesquisa-se em blocos de 40
// empresas por URL; cada bloco fica limitado a 100 vagas para o custo não fugir (o tecto da corrida manda).
const PORTUGAL_GEO = '100364837';
async function vagasLinkedin() {
  const lista = ler('startups.json', { empresas: [] }).empresas;
  const ids = [...new Set(lista.map((x) => (String(x.vagasLinkedin || '').match(/f_C=(\d+)/) || [])[1]).filter(Boolean))];
  const blocos = [];
  for (let i = 0; i < ids.length; i += 40) blocos.push(`https://www.linkedin.com/jobs/search/?f_C=${ids.slice(i, i + 40).join(',')}&geoId=${PORTUGAL_GEO}`);
  console.log(`[startups] vagas do LinkedIn: ${ids.length} empresas em ${blocos.length} pesquisas (até ${blocos.length * 100} vagas)`);
  const itens = await correr('curious_coder~linkedin-jobs-scraper', { urls: blocos, limitPerSource: Number(process.argv[3]) || 100 });
  const vagas = itens.map((v) => ({
    empresaSlug: slugDe(v.companyLinkedinUrl), empresa: v.companyName, titulo: v.title, url: v.applyUrl && !/linkedin\.com/.test(v.applyUrl) ? v.applyUrl : v.link,
    linkedin: v.link, local: v.location, publicada: v.postedAt, nivel: v.seniorityLevel, tipo: v.employmentType, candidatos: v.applicantsCount,
  }));
  gravar('linkedin-vagas.json', vagas);
  console.log(`[startups] vagas do LinkedIn: ${vagas.length} em ${new Set(vagas.map((v) => v.empresaSlug)).size} empresas`);
}

const passo = process.argv[2];
if (passo === 'posts') await posts();
else if (passo === 'empresas') await empresas();
else if (passo === 'reprocessar') {
  reprocessar();
  // As menções também se refazem dos posts já pagos.
  const ligadas = extrairMencoes(ler('linkedin-posts.json', []));
  gravar('linkedin-ligadas.json', Object.values(ligadas));
  console.log(`[startups] ${Object.keys(ligadas).length} empresas mencionadas refeitas dos posts guardados`);
}
else if (passo === 'fundadores') await fundadores();
else if (passo === 'religar') religarFundadores();
else if (passo === 'searchers') await searchers();
else if (passo === 'vcs-paginas') await vcsPaginas();
else if (passo === 'vagas-linkedin') await vagasLinkedin();
else console.error('[startups] diz o passo: npm run linkedin -- posts   ou   npm run linkedin -- empresas 100');
