// Completa a lista oficial com morada, actividade (CAE) e site, a partir da ficha pública do einforma.
// Guarda cada ficha à medida que avança: se a corrida parar a meio, recomeça onde ficou.
// Um pedido a cada 1,5 s para não sermos bloqueados (688 empresas ≈ 17 minutos).
import { buscar, esperar, ler, gravar, descodificar } from './comum.mjs';

const LIMITE = Number(process.argv[2]) || Infinity;
const oficial = ler('oficial.json', null);
if (!oficial) throw new Error('[startups] falta dados/oficial.json: corre primeiro npm run oficial');

const registo = ler('registo.json', {});
// A ficha tem marcação schema.org; ler por itemprop/classe aguenta mudanças de texto à volta.
const campo = (html, re) => descodificar((html.match(re) || [])[1] || '').replace(/\s+/g, ' ').trim();

let feitas = 0, falhas = 0;
for (const e of oficial) {
  if (feitas >= LIMITE) break;
  if (registo[e.nipc] && !registo[e.nipc].erro) continue;
  try {
    const res = await buscar(`https://www.einforma.pt/servlet/app/portal/ENTP/prod/ETIQUETA_EMPRESA/nif/${e.nipc}`);
    if (res.status === 403 || res.status === 429) {
      console.error(`[startups] o einforma bloqueou (${res.status}); pára e volta a correr mais tarde, retoma onde ficou`);
      break;
    }
    const html = await res.text();
    const cp = campo(html, /itemprop="postalcode">([^<]*)/i);
    const cae = campo(html, /class="category"><a[^>]*>([^<]*)/i);
    const site = campo(html, /itemprop="url"[^>]*>\s*<a href="([^"]+)"/i).toLowerCase();
    registo[e.nipc] = {
      morada: campo(html, /itemprop="streetaddress">([^<]*)/i),
      codigoPostal: (cp.match(/\d{4}-\d{3}/) || [''])[0],
      localidade: cp.replace(/\d{4}-\d{3}/, '').trim(),
      cae: cae.split(' - ')[0].trim(),
      actividade: cae.split(' - ').slice(1).join(' - ').trim(),
      anos: Number(campo(html, /Antiguidade:<\/td><td[^>]*><span class="type">\s*(\d+)/i)) || null,
      site: /\./.test(site) ? (site.startsWith('http') ? site : 'https://' + site) : '',
    };
    if (!registo[e.nipc].cae) console.warn(`[startups] ficha sem actividade: ${e.nipc} ${e.nome}`);
  } catch (err) {
    falhas++;
    registo[e.nipc] = { erro: String(err.message || err) };
    console.warn(`[startups] falhou ${e.nipc} ${e.nome}: ${err.message}`);
  }
  feitas++;
  if (feitas % 20 === 0) { gravar('registo.json', registo); console.log(`[startups] ${feitas} fichas lidas`); }
  await esperar(1500);
}
gravar('registo.json', registo);
const total = Object.values(registo).filter((r) => !r.erro).length;
console.log(`[startups] registo: ${total}/${oficial.length} completas, ${falhas} falhas nesta corrida`);
