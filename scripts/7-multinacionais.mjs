// Vagas de multinacionais e scaleups com nome que um investidor reconhece (Bolt, Glovo, Booking...).
// Cada empresa tem página de carreiras própria, por isso cada uma tem o seu leitor.
// Só entram sites que publicam as vagas de forma aberta (HTML ou API pública): Uber e Revolut
// têm verificação anti-bot e ficam de fora de propósito, não por esquecimento.
import { buscar, ler, gravar, esperar, descodificar } from './comum.mjs';

const PAIS = new Intl.DisplayNames(['en'], { type: 'region' });
const paisDoCodigo = (c) => { try { return c ? PAIS.of(c.toUpperCase()) : ''; } catch { return ''; } };
const ultimaParte = (local) => (local.split(',').pop() || '').trim();

// Em inglês: com o pt-PT do comum.mjs a SmartRecruiters traduz os campos e a Booking devolve zero vagas.
async function json(url) {
  const res = await buscar(url, { headers: { accept: 'application/json', 'accept-language': 'en' } });
  if (!res.ok) throw new Error(`${url} respondeu ${res.status}`);
  return res.json();
}

// Bolt: a lista vem no HTML, 20 por página; acaba quando uma página vem vazia.
async function bolt() {
  const re = /<span[^>]*rt-Text[^>]*rt-r-weight-medium[^>]*>([^<]+)<\/span><\/div><div[^>]*><span[^>]*rt-r-size-1[^>]*>([^<]+)<\/span><\/div>.*?rt-truncate">([^<]+)<\/span>.*?href="(\/en\/careers\/positions\/([a-f0-9-]+))\/\?tab=apply"/gs;
  const vagas = [];
  for (let p = 1; p <= 40; p++) {
    const res = await buscar(`https://bolt.eu/en/careers/positions/?page=${p}`);
    if (!res.ok) throw new Error(`página ${p} respondeu ${res.status}`);
    const achadas = [...(await res.text()).matchAll(re)];
    if (!achadas.length) {
      // Página 1 vazia quer dizer que a Bolt mudou o HTML, não que deixou de contratar.
      if (p === 1) throw new Error('nenhuma vaga reconhecida na página 1: o HTML da Bolt mudou, rever a expressão');
      break;
    }
    for (const [, titulo, equipa, local, caminho, id] of achadas) {
      const l = descodificar(local);
      vagas.push({ id, titulo: descodificar(titulo), equipa: descodificar(equipa), local: l, pais: ultimaParte(l), url: 'https://bolt.eu' + caminho + '/' });
    }
    await esperar(800);
  }
  return vagas;
}

// Glovo: as vagas vivem na conta SmartRecruiters da Delivery Hero, misturadas com as das outras marcas do grupo.
// A marca identifica-se pelo id do campo «Brands», que não muda com a língua (o nome muda).
const CAMPO_MARCA = '655ce69d695b8c5663cf1f55';
async function glovo() {
  const vagas = [];
  for (let offset = 0; ; offset += 100) {
    const d = await json(`https://api.smartrecruiters.com/v1/companies/DeliveryHero/postings?limit=100&offset=${offset}`);
    for (const v of d.content) {
      const marca = v.customField?.find((f) => f.fieldId === CAMPO_MARCA)?.valueLabel;
      if (marca !== 'Glovo') continue;
      const pais = paisDoCodigo(v.location?.country);
      vagas.push({
        id: v.id, titulo: v.name, equipa: v.function?.label || '', local: [v.location?.city, pais].filter(Boolean).join(', '), pais,
        remoto: !!v.location?.remote, nivel: v.experienceLevel?.label || '', publicada: v.releasedDate,
        url: `https://jobs.smartrecruiters.com/DeliveryHero/${v.id}`,
      });
    }
    if (offset + 100 >= d.totalFound) break;
    await esperar(500);
  }
  return vagas;
}

// Booking.com: API pública do site de vagas, 100 por página.
async function booking() {
  const vagas = [];
  for (let p = 1; p <= 30; p++) {
    const d = await json(`https://jobs.booking.com/api/jobs?page=${p}&limit=100&lang=en-us`);
    for (const { data: v } of d.jobs) {
      vagas.push({
        id: v.slug, titulo: v.title, equipa: (v.category?.[0] || '').trim(), local: [v.city, v.country].filter(Boolean).join(', '), pais: v.country || '',
        publicada: v.posted_date, url: `https://jobs.booking.com/booking/jobs/${v.slug}?lang=en-us`,
      });
    }
    if (!d.jobs.length || vagas.length >= d.totalCount) break;
    await esperar(500);
  }
  return vagas;
}

// Plataformas de recrutamento com API pública: a mesma função serve para todas as empresas que as usam.
const PT = /portugal|lisbo|porto\b|braga|coimbra|aveiro|faro/i;
function onde(locais, remoto) {
  const l = locais.filter(Boolean).join(' / ');
  return { local: l, pais: PT.test(l) ? 'Portugal' : ultimaParte(locais[0] || ''), remoto: remoto || /remote/i.test(l) };
}

async function greenhouse(slug) {
  const d = await json(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
  return d.jobs.map((v) => ({ id: String(v.id), titulo: v.title, url: v.absolute_url, ...onde([v.location?.name]),
    publicada: v.first_published || v.updated_at }));
}

async function lever(slug) {
  const d = await json(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  return d.map((v) => ({ id: v.id, titulo: v.text, url: v.hostedUrl, equipa: v.categories?.team || '',
    ...onde([v.categories?.location, ...(v.categories?.allLocations || [])], v.workplaceType === 'remote'), publicada: new Date(v.createdAt).toISOString() }));
}

async function ashby(slug) {
  const d = await json(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  return d.jobs.map((v) => ({ id: v.id, titulo: v.title, url: v.jobUrl, equipa: v.department || v.team || '',
    ...onde([v.location, ...(v.secondaryLocations || []).map((s) => s.location)], v.isRemote), publicada: v.publishedAt }));
}

const EMPRESAS = [
  { nome: 'Bolt', sector: 'Mobilidade', carreiras: 'https://bolt.eu/en/careers/positions/', ler: bolt },
  { nome: 'Glovo', sector: 'Entregas', carreiras: 'https://careers.glovoapp.com/jobs-at-glovo/', ler: glovo },
  { nome: 'Booking.com', sector: 'Viagens', carreiras: 'https://careers.booking.com/', ler: booking },
  { nome: 'Wolt', sector: 'Entregas', ler: () => greenhouse('wolt') },
  { nome: 'Deliveroo', sector: 'Entregas', ler: () => greenhouse('deliveroo') },
  { nome: 'FREENOW', sector: 'Mobilidade', ler: () => greenhouse('freenow') },
  { nome: 'Cabify', sector: 'Mobilidade', ler: () => greenhouse('cabify') },
  { nome: 'N26', sector: 'Fintech', ler: () => greenhouse('n26') },
  { nome: 'Adyen', sector: 'Fintech', ler: () => greenhouse('adyen') },
  { nome: 'Monzo', sector: 'Fintech', ler: () => greenhouse('monzo') },
  { nome: 'Pleo', sector: 'Fintech', ler: () => ashby('pleo') },
  { nome: 'Qonto', sector: 'Fintech', ler: () => ashby('qonto') },
  { nome: 'Stripe', sector: 'Fintech', ler: () => greenhouse('stripe') },
  { nome: 'Spotify', sector: 'Tecnologia', ler: () => lever('spotify') },
  { nome: 'Airbnb', sector: 'Viagens', ler: () => greenhouse('airbnb') },
  { nome: 'GetYourGuide', sector: 'Viagens', ler: () => greenhouse('getyourguide') },
  { nome: 'GitLab', sector: 'Tecnologia', ler: () => greenhouse('gitlab') },
  { nome: 'Datadog', sector: 'Tecnologia', ler: () => greenhouse('datadog') },
  { nome: 'Cloudflare', sector: 'Tecnologia', ler: () => greenhouse('cloudflare') },
  { nome: 'Miro', sector: 'Tecnologia', ler: () => ashby('miro') },
  { nome: 'Typeform', sector: 'Tecnologia', ler: () => greenhouse('typeform') },
  { nome: 'Contentful', sector: 'Tecnologia', ler: () => greenhouse('contentful') },
  { nome: 'Doctolib', sector: 'Saúde', ler: () => greenhouse('doctolib') },
  { nome: 'Alan', sector: 'Saúde', ler: () => ashby('alan') },
  { nome: 'Sword Health', sector: 'Saúde', ler: () => greenhouse('swordhealth') },
  { nome: 'Feedzai', sector: 'Fintech', ler: () => greenhouse('feedzai') },
  { nome: 'Farfetch', sector: 'Comércio', ler: () => ashby('farfetch') },
  { nome: 'Mollie', sector: 'Fintech', ler: () => ashby('mollie') },
  { nome: 'SumUp', sector: 'Fintech', ler: () => greenhouse('sumup') },
  { nome: 'Pipedrive', sector: 'Tecnologia', ler: () => lever('pipedrive') },
  { nome: 'Indie Campers', sector: 'Turismo', ler: () => greenhouse('indiecampers') },
  { nome: 'Bounce', sector: 'Mobilidade', ler: () => ashby('bounce') },
];

// A data em que cada vaga apareceu pela primeira vez sobrevive entre corridas: é ela que diz o que é novo.
const antes = ler('multinacionais.json', { empresas: [] });
const vistas = new Map(antes.empresas.flatMap((e) => (e.vagas || []).map((v) => [`${e.nome}:${v.id}`, v.vistaEm])));
const agora = new Date().toISOString();

const empresas = [];
for (const e of EMPRESAS) {
  const { ler: leitor, ...info } = e;
  try {
    const vagas = (await leitor()).map((v) => ({ ...v, vistaEm: vistas.get(`${e.nome}:${v.id}`) || agora }));
    empresas.push({ ...info, vagas });
    // Na primeira leitura de uma empresa tudo seria «novo»; só se contam novas a partir da segunda.
    const jaLida = antes.empresas.some((x) => x.nome === e.nome && x.vagas?.length);
    const novas = vagas.filter((v) => v.vistaEm === agora).length;
    const pt = vagas.filter((v) => v.pais === 'Portugal').length;
    console.log(`[startups] ${e.nome}: ${vagas.length} vagas (${pt} em Portugal${jaLida ? `, ${novas} novas` : ', primeira leitura'})`);
  } catch (err) {
    // Uma empresa que falha não apaga as vagas que já tinha: guarda-se o erro e mantém-se a lista anterior.
    const anterior = antes.empresas.find((x) => x.nome === e.nome);
    empresas.push({ ...info, vagas: anterior?.vagas || [], erro: err.message });
    console.error(`[startups] ${e.nome} falhou: ${err.message}`);
  }
}

gravar('multinacionais.json', { geradoEm: agora, empresas });
console.log(`[startups] ${empresas.reduce((n, e) => n + e.vagas.length, 0)} vagas gravadas em dados/multinacionais.json`);
