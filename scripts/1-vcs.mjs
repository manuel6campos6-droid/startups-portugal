// Portefólios dos VCs portugueses mais activos, lidos dos sites deles (grátis, sem Apify).
// Cada site tem o seu formato; quando um muda e deixa de dar empresas, o script queixa-se pelo nome.
// Ficaram de fora porque não publicam a lista no site: Lince Capital, Olisipo Way, Busy Angels, Pathena.
import { buscar, gravar, descodificar, esperar } from './comum.mjs';

const titulo = (slug) => slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const texto = (h) => descodificar(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const SOCIAL = /linkedin|facebook|instagram|twitter|x\.com|youtube|google|crunchbase|angel\.co|webflow|website-files|cmvm|apple\.com|medium|spotify|bcsd|apcri|super\.so/i;

function ancoras(html) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: descodificar((m[1].match(/href="([^"]+)"/) || [])[1] || ''),
    texto: texto(m[2]),
    alt: descodificar((m[2].match(/alt="([^"]+)"/) || [])[1] || ''),
  })).filter((a) => a.href);
}

// Lê a linha de uma ficha com o ano do investimento: «Healthtech 2026 Descrição…».
const anoEm = (s) => Number((s.match(/\b(20[0-3]\d|19[89]\d)\b/) || [])[1]) || null;

const VCS = [
  { nome: 'Portugal Ventures', url: 'https://www.portugalventures.pt/en/portfolio/',
    ler: (html) => ancoras(html).filter((a) => /^https?:/.test(a.href) && !SOCIAL.test(a.href) && !/portugalventures/.test(a.href))
      .map((a) => { const d = new URL(a.href).hostname.replace(/^www\./, ''); return { nome: a.alt || a.texto || titulo(d.split('.')[0]), site: 'https://' + d }; }) },
  { nome: 'Bynd', url: 'https://bynd.vc/portfolio',
    ler: (html) => ancoras(html).filter((a) => /^https?:/.test(a.href) && !SOCIAL.test(a.href) && !/bynd\.vc/.test(a.href))
      .map((a) => { const d = new URL(a.href).hostname.replace(/^www\./, ''); return { nome: a.alt || titulo(d.split('.')[0]), site: 'https://' + d, descricao: a.texto === 'Resources' ? '' : a.texto }; }) },
  { nome: 'Shilling', url: 'https://www.shilling.vc/portfolio',
    ler: (html) => ancoras(html).filter((a) => /^\/portfolio\/[^/]+$/.test(a.href)).map((a) => {
      const sector = a.texto.split(/\s(?=20\d\d)/)[0];
      return { nome: a.alt || titulo(a.href.split('/').pop()), ano: anoEm(a.texto), sector,
        descricao: a.texto.replace(/^.*?\b20\d\d\s/, '').replace(/\s*"?Shilling[^"]*"?$/, '').trim(), pagina: 'https://www.shilling.vc' + a.href };
    }) },
  { nome: 'Armilar', url: 'https://www.armilar.com/portfolio',
    ler: (html) => ancoras(html).filter((a) => /^\/companies\/[^/]+$/.test(a.href))
      .map((a) => ({ nome: titulo(a.href.split('/').pop()), pagina: 'https://www.armilar.com' + a.href })) },
  { nome: 'Indico Capital', url: 'https://www.indicocapital.com/our-companies',
    ler: (html) => ancoras(html).filter((a) => /^\/our-companies\/[^/]+$/.test(a.href)).map((a) => {
      // O texto traz primeiro as etiquetas dos filtros da página («Past Pre-Indico RIP»), depois «Nome Ano Descrição».
      const resto = a.texto.replace(/^(Past\s+)?(Pre-Indico\s+)?(RIP\s+)?/, '');
      const m = resto.match(/^(.*?)\s(20\d\d)\s(.*?)(\sall\b.*)?$/);
      return { nome: m ? m[1] : titulo(a.href.split('/').pop()), ano: m ? Number(m[2]) : null, descricao: m ? m[3] : '', pagina: 'https://www.indicocapital.com' + a.href };
    }) },
  { nome: 'Faber', url: 'https://www.faber.vc/portfolio/',
    ler: (html) => {
      // A lista vem embutida num <script> como JSON e é desenhada no browser.
      const m = html.match(/\[\{"theme"[\s\S]*?\}\](?=<\/script>)/);
      return m ? JSON.parse(m[0]).map((c) => ({ nome: c.name, site: /faber\.vc/.test(c.url) ? '' : c.url, ano: c.year, descricao: c.blurb, saiu: !!(c.exited || c.rip) })) : [];
    } },
  { nome: 'MAZE', url: 'https://maze-impact.com/portfolio-database',
    ler: (html) => ancoras(html).filter((a) => /^\/ventures\/[^/]+$/.test(a.href))
      .map((a) => ({ nome: a.alt || a.texto.split(' ').slice(0, 4).join(' ') || titulo(a.href.split('/').pop()), pagina: 'https://maze-impact.com' + a.href })) },
];

const todas = [];
for (const vc of VCS) {
  try {
    const res = await buscar(vc.url, { tempo: 30000 });
    if (!res.ok) throw new Error('respondeu ' + res.status);
    const lidas = vc.ler(await res.text());
    const unicas = [...new Map(lidas.filter((x) => x.nome).map((x) => [x.nome.toLowerCase(), x])).values()];
    if (unicas.length < 5) console.error(`[startups] ${vc.nome}: só ${unicas.length} empresas; o site mudou de formato? Ver ${vc.url}`);
    else console.log(`[startups] ${vc.nome}: ${unicas.length} empresas`);
    for (const x of unicas) todas.push({ ...x, vc: vc.nome });
  } catch (e) {
    console.error(`[startups] ${vc.nome} falhou (${e.message}); ver ${vc.url}`);
  }
  await esperar(1000);
}
gravar('vcs.json', todas);
console.log(`[startups] VCs: ${todas.length} investimentos de ${new Set(todas.map((x) => x.vc)).size} fundos`);
