// Vagas abertas no Landing.jobs com local em Portugal. A API é pública e devolve 50 por página.
// A empresa só vem no link da vaga (landing.jobs/at/<empresa>/<vaga>), por isso agrupa-se por aí.
import { buscar, esperar, gravar, descodificar } from './comum.mjs';

const vagas = [];
for (let offset = 0; offset < 10000; offset += 50) {
  const res = await buscar(`https://landing.jobs/api/v1/jobs?limit=50&offset=${offset}`);
  if (!res.ok) throw new Error(`[startups] Landing.jobs respondeu ${res.status} na página ${offset / 50}`);
  const pagina = await res.json();
  if (!pagina.length) break;
  for (const v of pagina) {
    const pt = (v.locations || []).filter((l) => l.country_code === 'PT');
    if (!pt.length) continue;
    vagas.push({
      empresa: v.url.split('/at/')[1]?.split('/')[0] || '',
      titulo: descodificar(v.title),
      url: v.url,
      cidades: [...new Set(pt.map((l) => l.city))],
      remoto: !!v.remote,
      tipo: v.type,
      salario: v.gross_salary_low ? [v.gross_salary_low, v.gross_salary_high] : null,
      tags: v.tags || [],
      publicada: v.published_at,
    });
  }
  await esperar(500);
}
gravar('landing.json', vagas);
console.log(`[startups] Landing.jobs: ${vagas.length} vagas em Portugal, ${new Set(vagas.map((v) => v.empresa)).size} empresas`);
