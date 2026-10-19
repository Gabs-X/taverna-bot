import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

export type Comando = {
  data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
  executar(i: ChatInputCommandInteraction): Promise<unknown>;
  autocompletar?(i: AutocompleteInteraction): Promise<unknown>;
};

// Botões são roteados pelo prefixo do customId ("cargo:valorant" → handler "cargo").
export type HandlerBotao = {
  prefixo: string;
  executar(i: ButtonInteraction, argumento: string): Promise<unknown>;
};
