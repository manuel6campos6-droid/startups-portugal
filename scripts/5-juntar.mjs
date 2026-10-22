// Junta todas as fontes numa lista só (dados/startups.json), que é o que a página mostra.
// Uma empresa que aparece em duas fontes junta-se pelo domínio do site.
import { ler, gravar } from './comum.mjs';

const oficial = ler('oficial.json', []);
const registo = ler('registo.json', {});
const extra = ler('extra.json', []);
const landing = ler('landing.json', []);
const vagas = ler('vagas.json', {});
const unicorn = ler('unicorn.json', []);
const linkedin = ler('linkedin-empresas.json', {});
const ligadas = ler('linkedin-ligadas.json', []);

// Área legível a partir dos dois primeiros dígitos do CAE; o código sozinho não diz nada a quem procura emprego.
const AREAS = [
  [[58, 62, 63], 'Software e TI'], [[72], 'Investigação e ciência'], [[21, 86, 87, 88, 75], 'Saúde'],
  [[10, 11, 12], 'Alimentação'], [[13, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33], 'Indústria e hardware'],
  [[35, 36, 37, 38, 39], 'Energia e ambiente'], [[41, 42, 43, 68], 'Construção e imobiliário'],
  [[45, 46, 47], 'Comércio e e-commerce'], [[49, 50, 51, 52, 53], 'Transportes e logística'],
  [[55, 56, 79], 'Turismo e restauração'], [[59, 60, 61, 73, 74, 90, 91, 93], 'Media, marketing e design'],
  [[64, 65, 66], 'Finanças e seguros'], [[69, 70, 71, 78, 82], 'Consultoria e engenharia'],
  [[85], 'Educação'], [[1, 2, 3], 'Agricultura e mar'],
];
const areaDoCae = (cae) => {
  const n = Number(String(cae).slice(0, 2));
  return (AREAS.find(([l]) => l.includes(n)) || [, 'Outras'])[1];
};
const AREA_GITHUB = {
  'Automotive': 'Indústria e hardware', 'Developer Tools': 'Software e TI', 'E-commerce': 'Comércio e e-commerce',
  'Education': 'Educação', 'Enterprise Software': 'Software e TI', 'FinTech': 'Finanças e seguros', 'Gaming': 'Software e TI',
  'Healthcare': 'Saúde', 'Industry': 'Indústria e hardware', 'Mobility': 'Transportes e logística',
  'Multimedia': 'Media, marketing e design', 'Sea': 'Agricultura e mar', 'Security': 'Software e TI', 'Social': 'Software e TI',
  'Sport': 'Software e TI', 'Telcos': 'Software e TI', 'Travel': 'Turismo e restauração',
};

// Região pelo código postal: as localidades vêm escritas de mil maneiras, o prefixo não.
const REGIOES = [
  [1000, 1999, 'Lisboa'], [2000, 2099, 'Santarém'], [2100, 2199, 'Santarém'], [2200, 2399, 'Santarém'], [2400, 2499, 'Leiria'],
  [2500, 2599, 'Leiria'], [2600, 2799, 'Lisboa'], [2800, 2999, 'Setúbal'], [3000, 3099, 'Coimbra'], [3100, 3299, 'Coimbra'],
  [3300, 3499, 'Coimbra'], [3500, 3699, 'Viseu'], [3700, 3999, 'Aveiro'], [4000, 4499, 'Porto'], [4500, 4699, 'Porto'],
  [4700, 4899, 'Braga'], [4900, 4999, 'Viana do Castelo'], [5000, 5399, 'Vila Real e Bragança'], [6000, 6299, 'Castelo Branco e Guarda'],
  [6300, 6499, 'Castelo Branco e Guarda'], [7000, 7999, 'Alentejo'], [8000, 8999, 'Algarve'], [9000, 9499, 'Madeira'], [9500, 9999, 'Açores'],
];
const regiaoDoCp = (cp) => {
  const n = Number(String(cp).slice(0, 4));
  return n ? (REGIOES.find(([a, b]) => n >= a && n <= b) || [, , ''])[2] : '';
};
const REGIAO_GITHUB = { Lisboa: 'Lisboa', Porto: 'Porto', Braga: 'Braga', Aveiro: 'Aveiro', Coimbra: 'Coimbra', Guimarães: 'Braga',
  Leiria: 'Leiria', Viseu: 'Viseu', Évora: 'Alentejo', Faro: 'Algarve', Funchal: 'Madeira', Setúbal: 'Setúbal', Covilhã: 'Castelo Branco e Guarda',
  'Ponta Delgada': 'Açores', 'Viana do Castelo': 'Viana do Castelo', Remote: 'Remoto' };

// O LinkedIn dá o distrito em inglês ou português conforme a empresa; junta-se às regiões da página.
const regiaoDoDistrito = (d) => {
  const n = d.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/lisb/.test(n)) return 'Lisboa';
  if (/setubal/.test(n)) return 'Setúbal';
  if (/^porto|oporto/.test(n)) return 'Porto';
  if (/braga/.test(n)) return 'Braga';
  if (/aveiro/.test(n)) return 'Aveiro';
  if (/coimbra/.test(n)) return 'Coimbra';
  if (/leiria/.test(n)) return 'Leiria';
  if (/viseu/.test(n)) return 'Viseu';
  if (/santarem/.test(n)) return 'Santarém';
  if (/faro|algarve/.test(n)) return 'Algarve';
  if (/evora|beja|portalegre|alentejo/.test(n)) return 'Alentejo';
  if (/madeira|funchal/.test(n)) return 'Madeira';
  if (/acores|azores/.test(n)) return 'Açores';
  if (/viana/.test(n)) return 'Viana do Castelo';
  if (/vila real|braganca/.test(n)) return 'Vila Real e Bragança';
  if (/castelo branco|guarda/.test(n)) return 'Castelo Branco e Guarda';
  return '';
};
const dom = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const titulo = (s) => s.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
  .replace(/\b(Lda|S\.?a|Unipessoal|Sociedade)\b\.?/gi, (m) => m.toUpperCase() === 'LDA' ? 'Lda' : m);
const comVagas = (site) => {
  const v = vagas[site] || {};
  return { carreiras: v.carreiras || '', plataforma: v.plataforma || '', vagas: v.vagas || null, siteMorto: !!v.erro };
};

const lista = [];
const porDominio = new Map();

for (const e of oficial) {
  const r = registo[e.nipc] || {};
  const item = {
    id: 'n' + e.nipc,
    nome: titulo(e.nome.replace(/,?\s*(LDA|L\.DA|S\.A\.?|UNIPESSOAL|SOCIEDADE UNIPESSOAL)\.?\s*$/gi, '').replace(/\s*-\s*$/, '')),
    nomeLegal: e.nome,
    site: r.site || '',
    area: r.cae ? areaDoCae(r.cae) : '',
    actividade: r.actividade || '',
    descricao: '',
    localidade: r.localidade ? titulo(r.localidade) : '',
    regioes: [regiaoDoCp(r.codigoPostal)].filter(Boolean),
    anos: r.anos || null,
    fontes: [e.estatuto === 'ScaleUp' ? 'ScaleUp oficial' : 'Startup oficial'],
    tipo: 'startup',
    ...comVagas(r.site),
  };
  lista.push(item);
  if (item.site) porDominio.set(dom(item.site), item);
}

for (const e of extra) {
  const d = dom(e.site);
  const v = comVagas(e.site);
  const existente = porDominio.get(d);
  if (existente) {
    existente.fontes.push('GitHub');
    existente.descricao ||= e.descricao;
    existente.carreiras ||= v.carreiras || e.carreiras;
    continue;
  }
  const item = {
    id: 'g' + d,
    nome: e.nome, nomeLegal: '', site: e.site,
    area: AREA_GITHUB[e.categoria] || (e.consultora ? 'Consultoria e engenharia' : 'Software e TI'),
    actividade: e.categoria, descricao: e.descricao,
    localidade: e.cidades.join(', '),
    regioes: [...new Set(e.cidades.map((c) => REGIAO_GITHUB[c]).filter(Boolean))],
    anos: null, fontes: ['GitHub'],
    tipo: e.consultora ? 'consultora' : 'tecnologia',
    ...v, carreiras: v.carreiras || e.carreiras,
  };
  lista.push(item);
  porDominio.set(d, item);
}

const porNome = new Map();
// O LinkedIn completa quem só tinha nome: site, tamanho, sector, sede.
const normL = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\b(lda|s\.?a|unipessoal|sociedade|limitada|bv|inc|ltd)\b\.?/g, '').replace(/[^a-z0-9]/g, '');
// Pesquisa por nome: o LinkedIn devolve sempre algo com o mesmo nome; só se aceita se estiver em Portugal,
// senão uma homónima de outro país levava site, tamanho e sede errados.
const doLinkedin = (chave) => { const l = linkedin[chave]; return l && !l.naoEncontrada && (!chave.startsWith('nome:') || l.emPortugal) ? l : null; };
function completar(item, l) {
  if (!l) return;
  item.linkedin = l.linkedin;
  if (!item.site && l.site) { item.site = l.site; Object.assign(item, { ...comVagas(l.site), carreiras: item.carreiras || comVagas(l.site).carreiras }); }
  item.tamanho = l.tamanho || item.tamanho || '';
  if (l.funcionarios != null) item.funcionarios = l.funcionarios;
  if (l.sector) item.sectorLinkedin = l.sector;
  if (l.vagasLinkedin) item.vagasLinkedin = l.vagasLinkedin;
  if (l.seguidores != null) item.seguidores = l.seguidores;
  if (l.especialidades) item.especialidades = l.especialidades;
  if (l.sobre) item.sobre = l.sobre;
  if (l.fundada && item.anos == null) item.anos = new Date().getFullYear() - l.fundada;
  if (!item.regioes.length && l.distritoSede) item.regioes = [regiaoDoDistrito(l.distritoSede)].filter(Boolean);
  // Sede conhecida e fora de Portugal: a Shilling e a Armilar também investem lá fora.
  if (!item.regioes.length && l.sede && !l.emPortugal) item.regioes = ['Fora de Portugal'];
  item.descricao ||= l.descricao;
  item.localidade ||= l.sede;
  if (l.financiamento) item.financiamento = l.financiamento;
  if (!item.fontes.includes('LinkedIn')) item.fontes.push('LinkedIn');
}
for (const item of lista) porNome.set(normL(item.nome), item);
for (const item of lista) if (item.nomeLegal) completar(item, doLinkedin('nome:' + normL(item.nomeLegal)));

// Unicorn Factory Lisboa: só nome, programa e sectores; o resto vem do LinkedIn se já foi lido.
const SECTOR_UF = { HealthTech: 'Saúde', FinTech: 'Finanças e seguros', EdTech: 'Educação', CleanTech: 'Energia e ambiente',
  'Travel Tech': 'Turismo e restauração', AdTech: 'Media, marketing e design', Gaming: 'Software e TI', 'Retail Tech': 'Comércio e e-commerce',
  AgriTech: 'Agricultura e mar', FoodTech: 'Alimentação', PropTech: 'Construção e imobiliário', 'Supply Chain / Logistics': 'Transportes e logística',
  Mobility: 'Transportes e logística', Entertainment: 'Media, marketing e design', 'Fashion Tech': 'Comércio e e-commerce' };
for (const u of unicorn) {
  const l = doLinkedin('nome:' + normL(u.nome));
  const existente = (l?.site && porDominio.get(dom(l.site))) || porNome.get(normL(u.nome));
  const programa = 'Unicorn Factory' + (u.programas[0] ? ' · ' + u.programas[0].replace(' Program', '') : '');
  if (existente) {
    if (!existente.fontes.some((f) => f.startsWith('Unicorn Factory'))) existente.fontes.push(programa);
    existente.ligadas = [...new Set([...(existente.ligadas || []), 'Unicorn Factory'])];
    existente.sectores = [...new Set([...(existente.sectores || []), ...u.sectores])];
    existente.programas = [...new Set([...(existente.programas || []), ...u.programas])];
    completar(existente, l);
    continue;
  }
  const item = {
    id: 'u' + normL(u.nome).slice(0, 60), nome: u.nome, nomeLegal: '', site: '',
    area: SECTOR_UF[u.sectores.find((s) => SECTOR_UF[s])] || 'Software e TI',
    actividade: u.sectores.join(', '), descricao: '', localidade: 'Lisboa', regioes: ['Lisboa'],
    anos: null, fontes: [programa], tipo: 'startup', ligadas: ['Unicorn Factory'], sectores: u.sectores, programas: u.programas,
    carreiras: '', plataforma: '', vagas: null, siteMorto: false, paginaUnicorn: u.pagina,
  };
  completar(item, l);
  lista.push(item);
  porNome.set(normL(u.nome), item);
  if (item.site) porDominio.set(dom(item.site), item);
}

// Mencionadas nos posts da Startup Portugal / Unicorn Factory no LinkedIn.
for (const m0 of ligadas) {
  const m = { ...m0, mencionadaPor: m0.mencionadaPor.map((n) => n.replace(/ Lisboa$/, "")) };
  const l = doLinkedin('url:' + m.slug);
  if (!l || !l.emPortugal || l.naoStartup) continue; // sem ficha lida ou fora de Portugal: não é para esta lista
  const existente = (l.site && porDominio.get(dom(l.site))) || porNome.get(normL(l.nome));
  if (existente) {
    existente.ligadas = [...new Set([...(existente.ligadas || []), ...m.mencionadaPor])];
    existente.mencoes = (existente.mencoes || 0) + m.vezes;
    if (m.ultimaMencao > (existente.ultimaMencao || '')) existente.ultimaMencao = m.ultimaMencao;
    existente.marcadaPor = m.mencionadaPor;
    if (m.porVc) existente.marcadaPorVc = true;
    completar(existente, l);
    continue;
  }
  const item = {
    id: 'k' + m.slug.replace(/[^\w.~:@+-]/g, ''), nome: l.nome, nomeLegal: '', site: '', area: 'Software e TI',
    actividade: l.sector, descricao: '', localidade: '', regioes: [], anos: null, fontes: [], tipo: 'tecnologia',
    ligadas: m.mencionadaPor, mencoes: m.vezes, ultimaMencao: m.ultimaMencao || '', marcadaPorVc: !!m.porVc, marcadaPor: m.mencionadaPor, carreiras: '', plataforma: '', vagas: null, siteMorto: false,
  };
  completar(item, l);
  lista.push(item);
  porNome.set(normL(l.nome), item);
}
// As oficiais estão todas ligadas à Startup Portugal: é ela que dá o estatuto.
for (const item of lista) if (item.nomeLegal) item.ligadas = [...new Set(['Startup Portugal', ...(item.ligadas || [])])];

// Landing.jobs: só sabemos o «slug» da empresa; junta-se a uma existente pelo nome, senão entra à parte.
const norm = normL;
const grupos = Object.groupBy(landing, (v) => v.empresa);
for (const [slug, vs] of Object.entries(grupos)) {
  const vagasLanding = vs.map((v) => ({ titulo: v.titulo, url: v.url, local: v.cidades.join(', ') + (v.remoto ? ' (remoto)' : '') }));
  const existente = porNome.get(norm(slug));
  if (existente) {
    existente.fontes.push('Landing.jobs');
    existente.vagas = [...(existente.vagas || []), ...vagasLanding];
    continue;
  }
  lista.push({
    id: 'l' + slug, nome: titulo(slug.replace(/-/g, ' ')), nomeLegal: '', site: '', area: 'Software e TI',
    actividade: '', descricao: '', localidade: [...new Set(vs.flatMap((v) => v.cidades))].join(', '),
    regioes: [...new Set(vs.flatMap((v) => v.cidades).map((c) => REGIAO_GITHUB[c] || (c === 'Lisbon' ? 'Lisboa' : c)))],
    anos: null, fontes: ['Landing.jobs'], tipo: 'tecnologia',
    carreiras: `https://landing.jobs/at/${slug}`, plataforma: 'Landing.jobs', vagas: vagasLanding, siteMorto: false,
  });
}

// Portefólios dos VCs: a empresa ganha os investidores; as que ainda não estavam entram à parte.
// O país destas novas não é conhecido (a Shilling e a Armilar também investem lá fora): ficam sem região.
for (const v of ler('vcs.json', [])) {
  const existente = (v.site && porDominio.get(dom(v.site))) || porNome.get(normL(v.nome));
  const inv = { vc: v.vc, ano: v.ano || null, saiu: !!v.saiu };
  if (existente) {
    existente.investidores = [...(existente.investidores || []).filter((i) => i.vc !== v.vc), inv];
    existente.descricao ||= v.descricao || '';
    if (!existente.fontes.includes('VC')) existente.fontes.push('VC');
    continue;
  }
  const item = {
    id: 'v' + normL(v.nome).slice(0, 60), nome: v.nome, nomeLegal: '', site: v.site || '',
    area: '', actividade: v.sector || '', descricao: v.descricao || '', localidade: '', regioes: [], anos: null,
    fontes: ['VC'], tipo: 'startup', investidores: [inv], paginaVc: v.pagina || '',
    ...comVagas(v.site || ''),
  };
  lista.push(item);
  porNome.set(normL(v.nome), item);
  if (item.site) porDominio.set(dom(item.site), item);
}

// Fundadores lidos no LinkedIn (só nome, cargo e perfil).
const fundadores = ler('fundadores.json', {});
const slugLi = (u) => (String(u).match(/linkedin\.com\/company\/([^/?#]+)/i) || [])[1]?.toLowerCase();
for (const item of lista) {
  const f = item.linkedin && fundadores[slugLi(item.linkedin)];
  if (f?.length) item.fundadores = f;
}

// Vagas do LinkedIn em Portugal: juntam-se às lidas nas páginas de carreiras (sem repetir o mesmo título).
const vagasLi = Object.groupBy(ler('linkedin-vagas.json', []), (v) => v.empresaSlug || '');
for (const item of lista) {
  const vs = item.linkedin && vagasLi[slugLi(item.linkedin)];
  if (!vs?.length) continue;
  const ja = new Set((item.vagas || []).map((v) => v.titulo.toLowerCase()));
  const novas = vs.filter((v) => !ja.has(v.titulo.toLowerCase())).map((v) => ({ titulo: v.titulo, url: v.url, local: v.local, fonte: 'LinkedIn', publicada: v.publicada, nivelLinkedin: v.nivel }));
  item.vagas = [...(item.vagas || []), ...novas];
  if (!item.plataforma) item.plataforma = 'LinkedIn';
}

// Trabalha com IA: pelo que a empresa diz de si (descrição, especialidades, sectores) e pelas vagas.
// «IA» só em maiúsculas: «ia» minúsculo é o verbo ir («ele ia»).
const IA_EN = /\b(AI|A\.I\.|artificial intelligence|machine learning|deep learning|LLMs?|GPT|gen ?AI|generative|agentic|AI agents?|computer vision|NLP|neural networks?)\b/i;
const IA_PT = /\bIA\b|intelig[eê]ncia artificial|aprendizagem autom[aá]tica/;
for (const item of lista) {
  const texto = [item.nome, item.descricao, item.sobre, item.especialidades, item.sectorLinkedin, item.actividade, ...(item.sectores || [])].join(' ');
  item.iaProduto = IA_EN.test(texto) || IA_PT.test(texto);
  item.iaVagas = (item.vagas || []).some((v) => /\b(AI|ML|machine learning|LLM)\b/i.test(v.titulo));
}

lista.sort((a, b) => (b.vagas?.length || 0) - (a.vagas?.length || 0) || a.nome.localeCompare(b.nome, 'pt'));
// Search funds: ficha do LinkedIn (sem exigir Portugal: alguns estão sediados lá fora) e os searchers.
const searchersLidos = ler('searchers.json', {});
// Guarda contra homónimos: «MMP Capital» deu uma empresa de Nova Iorque com CEO e CFO americanos.
// A ficha é rejeitada quando tem sede fora da Península (IronBridge de recrutamento no Reino Unido, Planalto
// de São Paulo); páginas pequenas sem sede ficam. Um searcher só conta se estiver na Península
// ou se o nome dele vier na notícia do fundo.
const IBERIA = /portugal|lisbo|porto|braga|coimbra|spain|espa[nñ]a|madrid|barcelona|valencia|sevilla|bilbao/i;
const searchFunds = ler('searchfunds.json', []).map((f) => {
  const l = linkedin['nome:' + normL(f.nome)];
  const ok = l && !l.naoEncontrada && (l.emPortugal || !l.sede || IBERIA.test(l.sede));
  const texto = [f.resumo, ...(f.noticias || []).map((n) => n.resumo)].join(' ');
  const searchers = (searchersLidos[normL(f.nome)] || []).filter((p) => IBERIA.test(p.local) || texto.includes(p.nome.split(',')[0].split(' ').slice(-1)[0]));
  return { ...f, linkedin: ok ? l.linkedin : '', seguidores: ok ? l.seguidores : null, site: f.site || (ok ? l.site : ''), searchers: ok ? searchers : [] };
});
gravar('startups.json', { geradoEm: new Date().toISOString(), empresas: lista, searchFunds });

const semRegisto = oficial.filter((e) => !registo[e.nipc] || registo[e.nipc].erro).length;
if (semRegisto) console.warn(`[startups] ${semRegisto} empresas oficiais ainda sem ficha do registo (sem site nem cidade): corre npm run registo`);
const semVerificar = lista.filter((x) => x.site && !vagas[x.site]).length;
if (semVerificar) console.warn(`[startups] ${semVerificar} sites ainda por verificar vagas: corre npm run vagas`);
console.log(`[startups] ${lista.length} empresas; ${lista.filter((x) => x.carreiras).length} com página de carreiras; ${lista.filter((x) => x.vagas?.length).length} com vagas lidas (${lista.reduce((n, x) => n + (x.vagas?.length || 0), 0)} vagas)`);
