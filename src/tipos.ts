import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  MessageContextMenuCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  RESTPostAPIContextMenuApplicationCommandsJSONBody,
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

// Formulários (modais) seguem a mesma ideia dos botões: roteados pelo prefixo do customId.
export type HandlerModal = {
  prefixo: string;
  executar(i: ModalSubmitInteraction, argumento: string): Promise<unknown>;
};

// Menus de seleção (lista suspensa) também são roteados pelo prefixo do customId.
export type HandlerSelecao = {
  prefixo: string;
  executar(i: StringSelectMenuInteraction, argumento: string): Promise<unknown>;
};

// Menus do botão direito numa mensagem (Apps → "Salvar citação").
export type MenuMensagem = {
  data: { name: string; toJSON(): RESTPostAPIContextMenuApplicationCommandsJSONBody };
  executar(i: MessageContextMenuCommandInteraction): Promise<unknown>;
};
