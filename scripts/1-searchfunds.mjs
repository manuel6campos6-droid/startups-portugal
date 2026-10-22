// Search funds em Portugal: um ou dois «searchers» que juntam investidores para comprar e gerir UMA empresa.
// Fonte: directório e notícias da Search Funds News (API WordPress aberta), mais os que só aparecem na
// imprensa portuguesa. O estado («à procura» / «comprou») sai das notícias; quando não há notícia de compra,
// fica «à procura», que pode estar desactualizado.
import { buscar, gravar, descodificar, esperar } from './comum.mjs';

const API = 'https://searchfundsnews.com/wp-json/wp/v2';
const PORTUGAL = 35; // termo «portugal» da taxonomia location
const ANOS = { 16: 2021, 7: 2022, 8: 2023, 18: 2024, 79: 2025, 97: 2026 };
// Fora do directório com país Portugal, mas activos cá (notícias da Search Funds News, Jornal de Negócios, ECO).
const EXTRA = [
  { nome: 'Audaz Capital', ano: 2024, dataFonte: '2025-06-14', nota: 'Filipe Bergaña; sediado em Espanha, procura na Península Ibérica (até 30 M€)', fonte: 'https://www.jornaldenegocios.pt/mercados/detalhe/lisboeta-regressa-de-londres-e-cria-search-fund-audaz-para-fazer-a-compra-da-sua-vida' },
  { nome: 'Matter Capital', nota: 'Pedro Carvalhas Coutinho; comprou a JCE em 2025', site: 'https://mattercapital.pt/', estado: 'Comprou' },
  { nome: 'Gallium Growth', nota: 'Tiago Neves Paixão e Leonardo Elvas de Carvalho; são co-CEO da Teclenajuncor, que compraram', estado: 'Comprou' },
  { nome: 'AC Capital Partners', nota: 'Procura uma PME de saúde na Suíça ou em Portugal' },
  { nome: 'Planalto Capital', nota: 'O primeiro search fund em Portugal (2016), cerca de duas dezenas de investidores', estado: 'Sem notícias recentes' },
];

const limpar = (h) => descodificar(String(h).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// Só compra feita: «plans to acquire», «pursuing the acquisition of» e «aims to» são intenção.
const COMPROU = /\b(acquired|acquires|completes|completed|closes the|closed the|adquiriu|comprou)\b/i;
const INTENCAO = /\b(plans?|pursu|aims?|looks?|targets?|seeks?|will)\b/i;

async function json(url) {
  const res = await buscar(url, { tempo: 30000 });
  if (!res.ok) throw new Error(`${res.status} em ${url}`);
  return res.json();
}

const directorio = await json(`${API}/search-funds?location=${PORTUGAL}&per_page=100&_fields=title,link,registered-year`);
if (!directorio.length) console.error('[startups] o directório da Search Funds News não deu nenhum search fund em Portugal; a taxonomia mudou?');
// Notas para quem está no directório mas sem notícia na Search Funds News.
const NOTAS = { 'SLY Capital': 'Bruno Silvestre; procura PME sem sucessão com EBITDA de 1 a 5 M€ (ECO, 2024); 17 investidores' };
const fundos = [
  ...directorio.map((f) => ({ nome: limpar(f.title.rendered), ano: ANOS[f['registered-year']?.[0]] || null, ficha: f.link })),
  ...EXTRA.filter((e) => !directorio.some((f) => limpar(f.title.rendered) === e.nome)),
];

for (const f of fundos) {
  const posts = await json(`${API}/posts?search=${encodeURIComponent(f.nome)}&per_page=5&_fields=title,link,date,excerpt,content`);
  // A pesquisa do WordPress também apanha posts que só citam o nome de passagem; ficam os que o têm no título ou no início.
  const meus = posts.filter((p) => limpar(p.title.rendered).includes(f.nome.split(' ')[0]) || limpar(p.content.rendered).slice(0, 400).includes(f.nome));
  // Nomes parecidos noutros países («Orenda Continuum Capital», Canadá): primeiro as que começam pelo
  // nome exacto, depois as que falam de Portugal ou da Península Ibérica; as restantes saem.
  const peso = (p) => (limpar(p.title.rendered).startsWith(f.nome) ? 0 : 2) + (/portug|iberi/i.test(limpar(p.title.rendered) + limpar(p.content.rendered).slice(0, 600)) ? 0 : 1);
  meus.sort((a, b) => peso(a) - peso(b));
  f.noticias = meus.filter((p) => peso(p) < 3).slice(0, 3).map((p) => ({ titulo: limpar(p.title.rendered), link: p.link, data: p.date.slice(0, 10), resumo: limpar(p.content.rendered).slice(0, 420) }));
  f.estado ||= f.noticias.some((n) => COMPROU.test(n.titulo) && !INTENCAO.test(n.titulo)) ? 'Comprou' : 'À procura';
  f.resumo = f.nota || NOTAS[f.nome] || f.noticias[0]?.resumo || '';
  f.ultimaNoticia = [...f.noticias.map((n) => n.data), f.dataFonte || ''].sort().pop() || '';
  // Activo = ainda à procura e com sinal de vida recente (lançado em 2025+ ou notícia nos últimos 18 meses).
  // Quem já comprou fechou a procura; um fundo de 2023 sem notícias pode já ter desistido.
  const limite = new Date(Date.now() - 548 * 86400000).toISOString().slice(0, 10);
  f.activo = f.estado === 'À procura' && ((f.ano || 0) >= new Date().getFullYear() - 1 || f.ultimaNoticia >= limite);
  await esperar(500);
}
gravar('searchfunds.json', fundos);
console.log(`[startups] search funds em Portugal: ${fundos.length}; activos ${fundos.filter((f) => f.activo).length}; já compraram ${fundos.filter((f) => f.estado === 'Comprou').length}`);
