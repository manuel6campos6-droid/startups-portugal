// Lista oficial de empresas com estatuto de Startup/ScaleUp (Startup Portugal, via dados.gov.pt).
// Vai sempre buscar o ficheiro mais recente: o conjunto é republicado com nome novo todos os meses.
import { buscar, gravar } from './comum.mjs';

const API = 'https://dados.gov.pt/api/1/datasets/lista-de-empresas-reconhecidas-com-o-estatuto-de-startup/';

const ds = await (await buscar(API)).json();
const recursos = [...ds.resources].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
const json = recursos.find((r) => r.format === 'json');
if (!json) throw new Error('[startups] o conjunto em dados.gov.pt deixou de ter um ficheiro JSON; ver ' + ds.page);

const lista = await (await buscar(json.url, { tempo: 60000 })).json();
const empresas = lista.map((x) => ({
  nipc: String(x.titularNipc),
  nome: (x.titularFirma || x.titularNome || '').trim(),
  estatuto: x.estatuto,
  certificada: x.fileDate,
}));
gravar('oficial.json', empresas);
console.log(`[startups] lista oficial: ${empresas.length} empresas (${json.title || json.url})`);
