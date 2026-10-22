// Call lendária: 5+ pessoas na mesma call viram aviso para o servidor todo. Puro, para dar para testar.

export const MINIMO_LENDARIA = 5;
export const FIM_LENDARIA = 3; // abaixo disso a call deixa de ser lendária
export const ESPERA_AVISO = 60 * 60_000; // no máximo um aviso por hora no servidor (não vira spam)

/** O que fazer com a call agora que mudou o número de pessoas. */
export function mudancaLendaria(pessoas: number, ativa: boolean, ultimoAviso: number, agora: number): 'comecar' | 'terminar' | undefined {
  if (!ativa && pessoas >= MINIMO_LENDARIA && agora - ultimoAviso >= ESPERA_AVISO) return 'comecar';
  if (ativa && pessoas < FIM_LENDARIA) return 'terminar';
  return undefined;
}
