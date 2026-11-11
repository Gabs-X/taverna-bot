// Monta o bestiário do Daggerheart a partir do livro do mestre (texto tirado do PDF com `pdftotext -enc UTF-8 livro.pdf livro.txt`).
// O resultado (dados/bestiario/dh.json) tem o texto do livro, então fica só em dados/ (fora do Git), como as imagens das cartas.
// Uso: node scripts/bestiario-dh.ts caminho/livro.txt [saida.json]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { lerBestiario } from '../src/lib/bestiario.ts';

const [entrada, saida = 'dados/bestiario/dh.json'] = process.argv.slice(2);
if (!entrada) {
  console.error('Uso: node scripts/bestiario-dh.ts livro.txt [saida.json]');
  process.exit(1);
}
const lista = lerBestiario(readFileSync(entrada, 'utf8'));
mkdirSync(dirname(saida), { recursive: true });
writeFileSync(saida, JSON.stringify(lista, null, 1));
const porTipo = new Map<string, number>();
for (const a of lista) porTipo.set(a.tipo, (porTipo.get(a.tipo) ?? 0) + 1);
console.log(`${lista.length} adversários em ${saida}:`, Object.fromEntries(porTipo));
