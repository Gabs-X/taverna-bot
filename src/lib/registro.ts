// Transforma interações em frases legíveis para o log ("/gotica duelo membro:@Fulano", "Gótica: Alimentar").
// Puro (sem Discord) para dar para testar.

export type OpcaoBruta = { name: string; type: number; value?: string | number | boolean; options?: OpcaoBruta[] };

// Tipos de opção do Discord (ApplicationCommandOptionType).
const SUB = 1;
const GRUPO_SUB = 2;
const USUARIO = 6;
const CANAL = 7;
const CARGO = 8;
const MENCIONAVEL = 9;

function valorLegivel(o: OpcaoBruta) {
  const v = o.value;
  if (o.type === USUARIO || (o.type === MENCIONAVEL && typeof v === 'string')) return `<@${v}>`;
  if (o.type === CANAL) return `<#${v}>`;
  if (o.type === CARGO) return `<@&${v}>`;
  const texto = String(v).replace(/\s+/g, ' ');
  return texto.length > 60 ? `"${texto.slice(0, 57)}…"` : texto.includes(' ') ? `"${texto}"` : texto;
}

/** "/grupo canal tipo:voz nome:\"Sala 2\"" a partir do nome do comando e das opções brutas. */
export function descreverComando(nome: string, opcoes: readonly OpcaoBruta[] = []): string {
  const partes = [`/${nome}`];
  let atuais = opcoes;
  // Desce por grupo de subcomando e subcomando.
  while (atuais.length === 1 && (atuais[0].type === SUB || atuais[0].type === GRUPO_SUB)) {
    partes.push(atuais[0].name);
    atuais = atuais[0].options ?? [];
  }
  for (const o of atuais) if (o.value !== undefined) partes.push(`${o.name}:${valorLegivel(o)}`);
  return partes.join(' ');
}

const ACOES_GOTICA: Record<string, string> = {
  alimentar: 'alimentou', conversar: 'conversou com', musica: 'ouviu música com', passear: 'passeou com', dormir: 'pôs para dormir',
};
const ACOES_DUELO: Record<string, string> = {
  aceitar: 'aceitou o duelo', recusar: 'fugiu do duelo', atacar: 'atacou', feitico: 'lançou feitiço', defender: 'defendeu', desistir: 'desistiu',
};
const ACOES_GRUPO: Record<string, string> = {
  aprovar: 'aprovou pedido', outronome: 'abriu "aprovar com outro nome" do pedido', recusar: 'abriu "recusar" do pedido',
  alternar: 'clicou para entrar/sair do grupo', aceitar: 'aceitou entrada no grupo', negar: 'recusou entrada no grupo', apagar: 'confirmou apagar o grupo',
};

/** Botões e formulários: "prefixo:acao:..." vira uma frase. Prefixo desconhecido cai no texto bruto. */
export function descreverBotao(customId: string, valorFormulario?: string): string {
  const [prefixo, acao = '', a = '', b = ''] = customId.split(':');
  switch (prefixo) {
    case 'cargo':
      return acao.startsWith('atv-') ? `Painel: ligou/desligou a atividade ${acao.slice(4)}` : `Painel: ligou/desligou o jogo ${acao}`;
    case 'lfg':
      return `LFG: ${acao || 'botão'}`;
    case 'jam':
      return acao === 'encerrar' ? 'Jam: encerrou a Jam' : `Jam: ${acao}`;
    case 'reset':
      return acao === 'confirmar' ? '⚠️ Setup: CONFIRMOU limpar o servidor inteiro' : 'Setup: cancelou a limpeza total';
    case 'limpartudo':
      return acao === 'confirmar' ? '⚠️ Limpar: CONFIRMOU apagar todas as mensagens do canal' : 'Limpar: cancelou';
    case 'gotica':
      return `Gótica: ${ACOES_GOTICA[acao] ?? acao} a gótica${a ? ` de <@${a}>` : ''}`;
    case 'duelo':
      return `Duelo: ${ACOES_DUELO[acao] ?? acao}`;
    case 'radio':
      return `Rádio: ${{ pular: 'pulou a música', pausar: 'pausou/continuou', desligar: 'desligou o rádio' }[acao] ?? acao}`;
    case 'quiz':
      return `Quiz: chutou ${acao}`;
    case 'grupo':
      if (acao === 'aceitar' || acao === 'negar') return `Subgrupo: ${ACOES_GRUPO[acao]} #${a} de <@${b}>`;
      return `Subgrupo: ${ACOES_GRUPO[acao] ?? acao} #${a}`;
    case 'grupom':
      return acao === 'outronome'
        ? `Subgrupo: aprovou o pedido #${a} com o nome "${valorFormulario ?? ''}"`
        : `Subgrupo: recusou o pedido #${a}${valorFormulario ? ` (motivo: ${valorFormulario})` : ''}`;
    default:
      return `Botão ${customId}`;
  }
}

/** Divide linhas em mensagens de até `limite` caracteres (o Discord aceita 2000). */
export function agruparLinhas(linhas: readonly string[], limite = 1900): string[] {
  const blocos: string[] = [];
  let atual = '';
  for (const l of linhas) {
    const linha = l.length > limite ? `${l.slice(0, limite - 1)}…` : l;
    if (atual && atual.length + 1 + linha.length > limite) {
      blocos.push(atual);
      atual = '';
    }
    atual = atual ? `${atual}\n${linha}` : linha;
  }
  if (atual) blocos.push(atual);
  return blocos;
}
