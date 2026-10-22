// SVG → PNG fora do processo principal: a gótica (~0,6 s), o duelo (~1 s), o rank e o quiz não travam
// os outros comandos nem o áudio da música. Dois processos em paralelo, criados no primeiro uso.
import { Worker } from 'node:worker_threads';

const TAMANHO = 2;
const LIMITE_MS = 30_000;

type Espera = { resolve: (png: Buffer) => void; reject: (e: Error) => void; trabalhador: number; timer: NodeJS.Timeout };
const trabalhadores: (Worker | undefined)[] = [];
const esperando = new Map<number, Espera>();
let proximoId = 0;
let vez = 0;

function criar(k: number) {
  const w = new Worker(new URL('./renderizarWorker.ts', import.meta.url));
  w.on('message', ({ id, png, erro }: { id: number; png?: Uint8Array; erro?: string }) => {
    const e = esperando.get(id);
    if (!e) return;
    esperando.delete(id);
    clearTimeout(e.timer);
    if (erro || !png) e.reject(new Error(erro ?? 'imagem vazia'));
    else e.resolve(Buffer.from(png));
  });
  // Se o processo cair, falha o que ele estava fazendo e outro é criado no próximo pedido.
  const derrubar = (motivo: string) => {
    trabalhadores[k] = undefined;
    for (const [id, e] of esperando) {
      if (e.trabalhador !== k) continue;
      esperando.delete(id);
      clearTimeout(e.timer);
      e.reject(new Error(motivo));
    }
  };
  w.on('error', (e: Error) => derrubar(e.message));
  w.on('exit', (codigo) => derrubar(`processo de imagem saiu (código ${codigo})`));
  w.unref(); // não segura o bot aberto ao desligar
  trabalhadores[k] = w;
  return w;
}

/** PNG do SVG. `fontes`: carrega as fontes do sistema (só quem tem texto, como o cartão do /rank). */
export function renderizarPng(svg: string, { fontes = false } = {}): Promise<Buffer> {
  const k = vez++ % TAMANHO;
  const w = trabalhadores[k] ?? criar(k);
  const id = proximoId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      esperando.delete(id);
      reject(new Error('a imagem demorou demais'));
    }, LIMITE_MS);
    esperando.set(id, { resolve, reject, trabalhador: k, timer });
    w.postMessage({ id, svg, fontes });
  });
}
