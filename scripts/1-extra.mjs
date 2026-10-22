// Empresas de tecnologia que não pediram o estatuto oficial (Sword Health, Talkdesk…), a partir da
// lista aberta github.com/marmelo/tech-companies-in-portugal. Inclui multinacionais e consultoras:
// ficam marcadas pela categoria para se poderem filtrar na página.
import { buscar, gravar } from './comum.mjs';

const URL_LISTA = 'https://raw.githubusercontent.com/marmelo/tech-companies-in-portugal/master/README.md';
const res = await buscar(URL_LISTA);
if (!res.ok) throw new Error(`[startups] a lista do GitHub respondeu ${res.status}`);
const md = await res.text();

const empresas = [];
let categoria = '';
for (const linha of md.split('\n')) {
  const h = linha.match(/^## (.+)/);
  if (h) { categoria = h[1].replace(/:[a-z_]+:/g, '').replace(/\s+/g, ' ').trim(); continue; }
  const m = linha.match(/^\| \[([^\]]+)\]\(([^)]+)\)(.*?)\| (.*?) \| (.*?) \|\s*$/);
  if (!m || !categoria) continue;
  const [, nome, site, links, descricao, locais] = m;
  empresas.push({
    nome: nome.trim(),
    site: site.trim(),
    carreiras: (links.match(/\[:rocket:\]\(([^)]+)\)/) || [])[1] || '',
    descricao: descricao.trim(),
    cidades: [...locais.matchAll(/`([^`]+)`/g)].map((x) => x[1]),
    categoria,
    consultora: /^Consultancy/.test(categoria),
  });
}
if (empresas.length < 100) throw new Error(`[startups] a lista do GitHub só deu ${empresas.length} empresas; o formato do README mudou?`);
gravar('extra.json', empresas);
console.log(`[startups] lista do GitHub: ${empresas.length} empresas (${empresas.filter((e) => e.consultora).length} consultoras)`);
