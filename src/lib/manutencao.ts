// Saúde do bot: perceber que ficou fora do ar e girar os backups do banco. Puro, para dar para testar.

/** Reinício normal leva segundos; acima disso o bot ficou fora do ar (PC desligado, sem internet...). */
export const LIMITE_QUEDA = 3 * 60_000;

export const ficouFora = (ultimoSinal: number | undefined, agora: number) =>
  !!ultimoSinal && agora - ultimoSinal > LIMITE_QUEDA ? agora - ultimoSinal : 0;

/** Nome do backup do dia (data de Brasília). */
export const nomeBackup = (agora: number) =>
  `taverna-${new Date(agora).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })}.db`;

/** Backups que sobram depois de guardar os `manter` mais novos. */
export const backupsVelhos = (nomes: string[], manter: number) =>
  nomes.filter((n) => /^taverna-\d{4}-\d{2}-\d{2}\.db$/.test(n)).sort().reverse().slice(manter);

/** Cópia tirada logo depois de uma sessão de RPG: taverna-2026-11-11-sessao-2130-minha-mesa.db. */
export function nomeBackupSessao(agora: number, campanha: string) {
  const d = new Date(agora);
  const dia = d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '');
  const nome = campanha.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'mesa';
  return `taverna-${dia}-sessao-${hora}-${nome}.db`;
}

/** Cópias de sessão que sobram depois de guardar as `manter` mais novas. */
export const backupsDeSessaoVelhos = (nomes: string[], manter: number) =>
  nomes.filter((n) => /^taverna-\d{4}-\d{2}-\d{2}-sessao-\d{4}-[a-z0-9-]+\.db$/.test(n)).sort().reverse().slice(manter);

/** Backups da nuvem que ainda não estão no PC (diários e de sessão), do mais velho para o mais novo. */
export const backupsQueFaltam = (remotos: string[], locais: string[]) => {
  const tem = new Set(locais);
  return remotos.filter((n) => /^taverna-\d{4}-\d{2}-\d{2}(-sessao-\d{4}-[a-z0-9-]+)?\.db$/.test(n) && !tem.has(n)).sort();
};

/** Um arquivo da pasta dados da nuvem, como o `find -printf '%P\t%s\t%T@\n'` lista. */
export type ArquivoRemoto = { caminho: string; tamanho: number; em: number };

/** Lê a lista do `find` (caminho, tamanho e data em segundos), ignorando linhas estranhas e caminhos que saem da pasta. */
export function lerListaRemota(saida: string): ArquivoRemoto[] {
  return saida
    .split('\n')
    .map((l) => l.replace(/\r$/, '').split('\t'))
    .filter((p) => p.length === 3 && p[0] && !p[0].startsWith('/') && !p[0].split('/').includes('..'))
    .map(([caminho, tamanho, em]) => ({ caminho, tamanho: Number(tamanho), em: Number(em) }))
    .filter((a) => Number.isFinite(a.tamanho) && Number.isFinite(a.em));
}

/** O que precisa vir da nuvem: arquivo que não existe aqui ou mudou (tamanho ou data diferentes). */
export function arquivosParaTrazer(remotos: ArquivoRemoto[], local: (caminho: string) => { tamanho: number; em: number } | null) {
  return remotos
    .filter((r) => {
      const l = local(r.caminho);
      return !l || l.tamanho !== r.tamanho || Math.abs(l.em - Math.floor(r.em)) > 2;
    })
    .map((r) => r.caminho);
}
