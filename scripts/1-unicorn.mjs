// Startups apoiadas pela Unicorn Factory Lisboa (incubação, Scaling Up, programas temáticos).
// O portefólio do site é um tipo de conteúdo do WordPress com API aberta; dá nome, programa e sectores,
// mas não dá site nem LinkedIn: isso vem depois pelo passo do LinkedIn.
import { buscar, gravar, descodificar } from './comum.mjs';

const BASE = 'https://unicornfactorylisboa.com/wp-json/wp/v2';

async function todas(caminho) {
  const out = [];
  for (let pagina = 1; ; pagina++) {
    const res = await buscar(`${BASE}/${caminho}${caminho.includes('?') ? '&' : '?'}per_page=100&page=${pagina}`);
    if (res.status === 400) break; // o WordPress responde 400 depois da última página
    if (!res.ok) throw new Error(`[startups] Unicorn Factory respondeu ${res.status} em ${caminho}`);
    const lote = await res.json();
    out.push(...lote);
    if (pagina >= Number(res.headers.get('x-wp-totalpages') || 1)) break;
  }
  return out;
}

const [startups, tags, categorias] = await Promise.all([
  todas('startups?_fields=id,title,link,tags,categories,date'), todas('tags?_fields=id,name'), todas('categories?_fields=id,name'),
]);
const nomeTag = Object.fromEntries(tags.map((t) => [t.id, descodificar(t.name)]));
const nomeCat = Object.fromEntries(categorias.map((c) => [c.id, descodificar(c.name)]));

const lista = startups.map((s) => ({
  nome: descodificar(s.title.rendered).trim(),
  pagina: s.link,
  programas: s.categories.map((c) => nomeCat[c]).filter((n) => n && n !== 'Uncategorized'),
  sectores: s.tags.map((t) => nomeTag[t]).filter(Boolean),
  desde: s.date?.slice(0, 10),
}));
if (lista.length < 100) throw new Error(`[startups] a Unicorn Factory só deu ${lista.length} startups; a API mudou?`);
gravar('unicorn.json', lista);
console.log(`[startups] Unicorn Factory: ${lista.length} startups (${lista.filter((s) => s.programas.includes('Scaling Up Program')).length} no Scaling Up)`);
