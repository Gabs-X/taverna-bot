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
