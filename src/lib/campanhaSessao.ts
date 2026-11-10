/** Publicar o registro é condição para encerrar a sessão e remover suas salas. */
export async function encerrarSalas(
  publicar: () => Promise<void>,
  encerrar: () => void,
  salas: { id: string; apagar: () => Promise<void> }[],
) {
  await publicar();
  encerrar();
  const falhas: string[] = [];
  for (const sala of salas) {
    try {
      await sala.apagar();
    } catch (erro) {
      console.error('[campanha] apagar sala:', sala.id, erro);
      falhas.push(sala.id);
    }
  }
  return falhas;
}
