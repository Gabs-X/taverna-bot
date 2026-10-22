// Lança uma versão nova do Taverneiro:
//   npm run lancar -- patch   (correções: 1.2.3 → 1.2.4)
//   npm run lancar -- minor   (funções novas: 1.2.3 → 1.3.0)
//   npm run lancar -- major   (mudança grande: 1.2.3 → 2.0.0)
// Opcional: --sem-enviar (não manda para o GitHub).
//
// Escreve no CHANGELOG.md os commits desde a última versão, sobe o número no package.json, faz o commit
// "Versão vX.Y.Z" (sem coautoria), marca a tag e envia. O bot, ao reiniciar com a versão nova,
// anuncia no #novidades do Discord e no grupo do WhatsApp.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RAIZ = resolve(import.meta.dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8' }).trim();
const sair = (msg) => {
  console.error(`❌ ${msg}`);
  process.exit(1);
};

const tipo = process.argv[2];
const enviar = !process.argv.includes('--sem-enviar');
if (!['patch', 'minor', 'major'].includes(tipo)) sair('Diga o tipo: npm run lancar -- patch | minor | major');
if (git('status', '--porcelain')) sair('Há alterações sem commit. Faça o commit antes de lançar a versão.');

const pacote = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8'));
const [ma, mi, pa] = pacote.version.split('.').map(Number);
const nova = tipo === 'major' ? `${ma + 1}.0.0` : tipo === 'minor' ? `${ma}.${mi + 1}.0` : `${ma}.${mi}.${pa + 1}`;

let ultimaTag = '';
try {
  ultimaTag = git('describe', '--tags', '--abbrev=0', '--match', 'v*');
} catch {
  // primeira versão: pega o histórico todo
}
const commits = git('log', '--no-merges', '--format=%s', ...(ultimaTag ? [`${ultimaTag}..HEAD`] : []))
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !/^Versão v\d/.test(l));
if (!commits.length) sair(`Nada novo desde ${ultimaTag}.`);

const data = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const secao = `## v${nova} (${data})\n\n${commits.reverse().map((c) => `- ${c}`).join('\n')}\n`;
const arquivo = join(RAIZ, 'CHANGELOG.md');
const atual = existsSync(arquivo) ? readFileSync(arquivo, 'utf8') : '# Novidades do Taverneiro\n';
const [titulo, ...corpo] = atual.split('\n');
writeFileSync(arquivo, `${titulo}\n\n${secao}${corpo.join('\n').replace(/^\n+/, '\n')}`);

pacote.version = nova;
writeFileSync(join(RAIZ, 'package.json'), JSON.stringify(pacote, null, 2) + '\n');
const trava = join(RAIZ, 'package-lock.json');
if (existsSync(trava)) {
  const l = JSON.parse(readFileSync(trava, 'utf8'));
  l.version = nova;
  if (l.packages?.['']) l.packages[''].version = nova;
  writeFileSync(trava, JSON.stringify(l, null, 2) + '\n');
}

git('add', 'CHANGELOG.md', 'package.json', 'package-lock.json');
git('commit', '-m', `Versão v${nova}`);
git('tag', '-a', `v${nova}`, '-m', `Versão v${nova}\n\n${commits.map((c) => `- ${c}`).join('\n')}`);
console.log(`✅ Versão v${nova} criada (${commits.length} mudança(s) desde ${ultimaTag || 'o começo'}).`);

if (enviar) {
  git('push');
  git('push', 'origin', `v${nova}`);
  console.log('✅ Enviada para o GitHub.');
  // Página da versão no GitHub (se o gh estiver instalado e logado).
  try {
    execFileSync('gh', ['release', 'create', `v${nova}`, '--title', `Taverneiro v${nova}`, '--notes', commits.map((c) => `- ${c}`).join('\n')], { cwd: RAIZ, stdio: 'ignore' });
    console.log('✅ Página da versão criada no GitHub (Releases).');
  } catch {
    console.log('ℹ️ Não criei a página no GitHub Releases (gh não disponível); a tag já está lá.');
  }
}
console.log('O bot reinicia sozinho e anuncia no #novidades e no WhatsApp.');
