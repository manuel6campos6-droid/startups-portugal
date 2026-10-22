import fs from 'node:fs';
import path from 'node:path';

export const DADOS = path.join(import.meta.dirname, '..', 'dados');
fs.mkdirSync(DADOS, { recursive: true });

export const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36';

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export function ler(nome, omissao) {
  const f = path.join(DADOS, nome);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : omissao;
}

export function gravar(nome, dados) {
  fs.writeFileSync(path.join(DADOS, nome), JSON.stringify(dados, null, 1));
}

// Os sites demoram ou penduram-se; sem limite de tempo uma empresa parada travava a corrida toda.
export async function buscar(url, { tempo = 15000, ...op } = {}) {
  const res = await fetch(url, {
    ...op,
    redirect: 'follow',
    signal: AbortSignal.timeout(tempo),
    headers: { 'user-agent': UA, 'accept-language': 'pt-PT,pt;q=0.9,en;q=0.8', ...(op.headers || {}) },
  });
  return res;
}

const ENTIDADES = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', ordm: 'º', ordf: 'ª', ccedil: 'ç', Ccedil: 'Ç' };
// O einforma escreve os acentos como entidades HTML (&atilde;); sem isto os nomes saíam ilegíveis.
export function descodificar(s = '') {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([AEIOUaeiouNnCcYy])(acute|grave|circ|tilde|uml|cedil);/g, (_, l, m) =>
      (l + { acute: '\u0301', grave: '\u0300', circ: '\u0302', tilde: '\u0303', uml: '\u0308', cedil: '\u0327' }[m]).normalize('NFC'))
    .replace(/&([a-z]+);/gi, (t, n) => ENTIDADES[n] ?? t);
}

export function textoDeHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split('\n').map((l) => l.trim()).filter(Boolean);
}
