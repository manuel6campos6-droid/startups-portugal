# Startups em Portugal

Junta startups e empresas de tecnologia em Portugal, descobre as vagas abertas de cada uma e mostra tudo
numa página onde se marca o estado de cada candidatura.

Painel: https://claude.ai/artifact/SpXYVT6HDYSZsXRNsAhCNr (privado; candidaturas, fila e perfil ficam na tua conta do claude.ai).

## Fontes

| Fonte | O que dá |
| :---- | :------- |
| Lista oficial do Startup Portugal (dados.gov.pt) | ~690 empresas com estatuto de Startup/ScaleUp; só nome e NIPC |
| Ficha pública do einforma, por NIPC | morada, código postal, actividade (CAE), antiguidade e site |
| github.com/marmelo/tech-companies-in-portugal | ~350 empresas de tecnologia com site e página de carreiras (inclui multinacionais e consultoras) |
| API pública do Landing.jobs | vagas com local em Portugal |
| Greenhouse, Lever, Ashby, Workable, Recruitee, Teamtailor, Personio, BambooHR, JOIN | vagas abertas lidas da plataforma de recrutamento de cada empresa |

## Actualizar

Corre os passos por esta ordem (ou `npm run tudo`):

1. `npm run oficial`: descarrega a lista oficial mais recente.
2. `npm run extra`: descarrega a lista do GitHub.
3. `npm run registo`: completa a lista oficial pelo einforma. Lento de propósito (~1,5 s por empresa) para não sermos bloqueados; retoma onde ficou.
4. `npm run landing`: vagas do Landing.jobs.
5. `npm run vagas`: abre o site de cada empresa, encontra a página de carreiras e lê as vagas. Só volta a ver um site ao fim de 3 dias. Para testar: `npm run vagas -- 20`.
6. `npm run juntar`: gera `dados/startups.json`, que é o que a página mostra.

Depois disto, a página tem de ser republicada com o `startups.json` novo (pede ao Claude: «actualiza a página das startups»).

## Limites conhecidos

- Sites feitos só em JavaScript não mostram ligações ao programa; nesses não se encontra a página de carreiras.
- Uma empresa sem plataforma de recrutamento conhecida aparece com a página de carreiras mas sem lista de vagas.
- Startups sem estatuto oficial e fora da lista do GitHub não aparecem. Fontes por juntar: portefólios da Startup Lisboa, UPTEC, Startup Braga e IPN.

## Passos novos (Outubro 2026)

- `npm run vcs`: portefólios de 7 VCs portugueses. `npm run searchfunds`: search funds em Portugal (activo = à procura e com sinal desde há 18 meses).
- `npm run linkedin -- <passo>` (Apify; chave no `.env`, uma conta de cada vez): `posts`, `posts vcs 60`, `vcs-paginas`, `empresas N`, `fundadores 8`, `searchers`, `vagas-linkedin`, e, sem custo, `reprocessar` e `religar`.
- Plano grátis do Apify: actor de pessoas (fundadores/searchers) só dá 25 perfis por corrida e 10 corridas por conta; o resto mede-se em USD (5 por mês).
