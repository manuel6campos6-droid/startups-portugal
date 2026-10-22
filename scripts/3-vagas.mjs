// Para cada startup com site: encontra a página de carreiras e, se usa uma plataforma de recrutamento
// conhecida, lê as vagas abertas pela API pública dessa plataforma.
// Guarda por site à medida que avança; volta a verificar ao fim de 3 dias (as vagas mudam).
import { buscar, ler, gravar, descodificar } from './comum.mjs';

const VALIDADE = 3 * 24 * 3600 * 1000;
const PARALELO = 6;

// Cada plataforma: como reconhecer o endereço e como ler a lista de vagas.
const PLATAFORMAS = [
  { nome: 'Greenhouse', re: /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([\w-]+)/i,
    api: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`,
    ler: (j) => j.jobs.map((v) => ({ titulo: v.title, url: v.absolute_url, local: v.location?.name })) },
  { nome: 'Lever', re: /jobs\.(?:eu\.)?lever\.co\/([\w-]+)/i,
    api: (s) => `https://api.lever.co/v0/postings/${s}?mode=json`,
    ler: (j) => j.map((v) => ({ titulo: v.text, url: v.hostedUrl, local: v.categories?.location })) },
  { nome: 'Ashby', re: /jobs\.ashbyhq\.com\/([\w.-]+)/i,
    api: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}`,
    ler: (j) => j.jobs.map((v) => ({ titulo: v.title, url: v.jobUrl, local: v.location })) },
  { nome: 'Workable', re: /apply\.workable\.com\/([\w-]+)/i,
    api: (s) => `https://apply.workable.com/api/v1/widget/accounts/${s}`,
    ler: (j) => j.jobs.map((v) => ({ titulo: v.title, url: v.url, local: [v.city, v.country].filter(Boolean).join(', ') })) },
  { nome: 'Recruitee', re: /([\w-]+)\.recruitee\.com/i,
    api: (s) => `https://${s}.recruitee.com/api/offers/`,
    ler: (j) => j.offers.map((v) => ({ titulo: v.title, url: v.careers_url, local: v.location })) },
  { nome: 'Teamtailor', re: /([\w-]+)\.teamtailor\.com/i,
    api: (s) => `https://${s}.teamtailor.com/jobs.rss`, rss: true },
  { nome: 'Personio', re: /([\w-]+)\.jobs\.personio\.(?:de|com)/i,
    api: (s) => `https://${s}.jobs.personio.de/xml`, xml: true },
  { nome: 'JOIN', re: /join\.com\/companies\/([\w-]+)/i,
    api: (s) => `https://join.com/companies/${s}`, html: true },
  { nome: 'BambooHR', re: /([\w-]+)\.bamboohr\.com/i,
    api: (s) => `https://${s}.bamboohr.com/careers/list`,
    ler: (j, s) => j.result.map((v) => ({ titulo: v.jobOpeningName, url: `https://${s}.bamboohr.com/careers/${v.id}`, local: v.location?.city })) },
];

const TEAMTAILOR = PLATAFORMAS.find((p) => p.nome === 'Teamtailor');
const dominio = (u) => new URL(u).hostname.split('.').slice(-2).join('.');
const mesmoDominio = (a, b) => dominio(a) === dominio(b);

const CARREIRAS = /careers?|jobs?|carreiras?|vagas|recrutamento|trabalha|join[-_ ]?us|work[-_ ]?with[-_ ]?us|junta[-_ ]?te|emprego|hiring/i;

function ligacoes(html, base) {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      out.push({ url: new URL(descodificar(m[1]), base).href, texto: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() });
    } catch {}
  }
  return out;
}

function plataformaEm(texto) {
  for (const p of PLATAFORMAS) {
    const m = texto.match(p.re);
    if (m && !['www', 'api', 'app', 'careers', 'jobs'].includes(m[1].toLowerCase())) return { p, slug: m[1] };
  }
  return null;
}

async function lerPlataforma({ p, slug }) {
  const res = await buscar(p.api(slug));
  if (!res.ok) return null;
  if (p.html) {
    const h = await res.text();
    return [...new Set([...h.matchAll(/href="(\/companies\/[\w-]+\/\d+[^"]*)"/g)].map((m) => m[1]))]
      .map((u) => ({ titulo: decodeURIComponent(u.split('/').pop().replace(/^\d+-/, '')).replace(/-/g, ' '), url: 'https://join.com' + u, local: '' }));
  }
  if (p.rss || p.xml) {
    const xml = await res.text();
    const itens = [...xml.matchAll(p.rss ? /<item>([\s\S]*?)<\/item>/g : /<position>([\s\S]*?)<\/position>/g)];
    const tag = (t, n) => descodificar(((t.match(new RegExp(`<${n}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${n}>`)) || [])[1] || '').trim());
    return itens.map(([, t]) => p.rss
      ? { titulo: tag(t, 'title'), url: tag(t, 'link'), local: tag(t, 'tt:location') || tag(t, 'location') }
      : { titulo: tag(t, 'name'), url: `https://${slug}.jobs.personio.de/job/${tag(t, 'id')}`, local: tag(t, 'office') });
  }
  return p.ler(await res.json(), slug);
}

async function verificar(site, dica) {
  const r = { verificado: new Date().toISOString(), carreiras: null, plataforma: null, vagas: null };
  let res;
  try { res = await buscar(site); } catch (e) { return { ...r, erro: 'site não abre: ' + (e.cause?.code || e.message) }; }
  if (!res.ok) return { ...r, erro: `site respondeu ${res.status}` };
  const html = await res.text();
  const base = res.url;
  r.siteFinal = base;

  // 1) a plataforma pode estar logo na página inicial (botão «Jobs» que aponta para fora)
  let achada = plataformaEm(html);
  // 2) senão, abre a página de carreiras do próprio site e procura lá
  const cand = ligacoes(html, base).filter((l) => CARREIRAS.test(l.url) || CARREIRAS.test(l.texto));
  const fora = (l) => !/\/blog|resources|job-descriptions|linkedin|facebook|instagram|twitter|x\.com|youtube|glassdoor|indeed|itjobs|net-empregos/i.test(l.url);
  // O endereço é melhor sinal do que o texto do link: «Jobs» no texto aparece em menus de blogue e afins.
  const carreira = (dica && { url: dica })
    || cand.find((l) => fora(l) && CARREIRAS.test(new URL(l.url).pathname + new URL(l.url).hostname))
    || cand.find(fora);
  if (carreira) r.carreiras = carreira.url;
  if (!achada && carreira && (dica || mesmoDominio(carreira.url, base))) {
    try {
      const pag = await buscar(carreira.url);
      if (pag.ok) {
        const h = await pag.text();
        achada = plataformaEm(h);
        // Teamtailor com domínio próprio (careers.empresa.com): a lista está em /jobs.rss desse domínio.
        if (!achada && /teamtailor/i.test(h)) achada = { p: { ...TEAMTAILOR, api: () => new URL('/jobs.rss', pag.url).href }, slug: '' };
      }
    } catch {}
  }
  if (!achada && carreira) achada = plataformaEm(carreira.url);
  if (achada) {
    r.plataforma = achada.p.nome;
    try { r.vagas = await lerPlataforma(achada); } catch (e) { r.erroVagas = e.message; }
  }
  return r;
}

const oficial = ler('oficial.json', []);
const registo = ler('registo.json', {});
const extra = ler('extra.json', []);
const dicas = Object.fromEntries(extra.filter((e) => e.carreiras).map((e) => [e.site, e.carreiras]));
const sites = [...new Set([
  ...oficial.map((e) => registo[e.nipc]?.site),
  ...extra.map((e) => e.site),
  // Sites que só se conhecem depois de juntar (LinkedIn, VCs): a lista juntada traz todos.
  ...ler('startups.json', { empresas: [] }).empresas.map((e) => e.site),
].filter(Boolean))];

const cache = ler('vagas.json', {});
const porFazer = sites.filter((s) => !cache[s] || Date.now() - new Date(cache[s].verificado) > VALIDADE);
// Um número a seguir ao comando limita a corrida (para testar): npm run vagas -- 20
porFazer.splice(Number(process.argv[2]) || Infinity);
console.log(`[startups] ${sites.length} sites, ${porFazer.length} por verificar`);

let feitos = 0;
async function trabalhador() {
  while (porFazer.length) {
    const site = porFazer.shift();
    try { cache[site] = await verificar(site, dicas[site]); } catch (e) { cache[site] = { verificado: new Date().toISOString(), erro: e.message }; }
    if (++feitos % 25 === 0) { gravar('vagas.json', cache); console.log(`[startups] ${feitos} sites verificados`); }
  }
}
await Promise.all(Array.from({ length: PARALELO }, trabalhador));
gravar('vagas.json', cache);

const v = Object.values(cache);
console.log(`[startups] carreiras encontradas: ${v.filter((x) => x.carreiras).length}; com plataforma: ${v.filter((x) => x.plataforma).length}; com vagas abertas: ${v.filter((x) => x.vagas?.length).length}; sites que não abrem: ${v.filter((x) => x.erro).length}`);
