/*
 * AUDAZ CONNECT — configuração.
 * Tudo que é "conhecido" sobre o portal fica aqui, separado da lógica.
 * Nada aqui é formato presumido: são só pistas de busca, e o relatório
 * de DEBUG mostra o que de fato foi encontrado.
 */
(function (ns) {
  'use strict';
  ns.config = {
    version: '0.1.0',

    // Fase 1: só um empreendimento-alvo, para validar antes da captura em massa.
    debugTarget: { nome: 'Conquista Maraponga' },

    // Evidência informada pelo usuário: o portal usa uma operação com este nome.
    espelhoUrlPatterns: [/obter-espelho-de-vendas/i],

    // Palavras que tornam uma resposta "relevante" para o relatório.
    relevantUrlPattern: /espelho|disponib|empreendimento|unidade|produto|tabela|preco|venda/i,

    // Evidência informada pelo usuário: chave de ID do empreendimento parecida com esta.
    idKeyHints: [/^IdEmpreendimentoSales$/i, /id_?empreendimento/i],

    // Limites de memória do observador.
    maxObserved: 400,       // metadados (URL, status, tamanho)
    maxJsonKept: 120,       // corpos JSON mantidos em memória

    // Chaves cujo VALOR é removido de qualquer relatório/export (o nome da chave fica).
    sensitiveKeyPattern: /token|senha|password|secret|authorization|cookie|session|cpf|e-?mail|telefone|celular|whats|cliente|comprador|proponente|corretor/i,

    // Correções de nomenclatura (Fase 2+). Ex.: 'Direcional Viva Vida Maracanaú': 'Viva Vida Maracanaú'
    aliases: {}
  };
})(self.AudazConnect = self.AudazConnect || {});
