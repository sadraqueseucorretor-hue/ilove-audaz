/*
 * Normalização para o formato interno do Audaz.
 *
 * Fase 1: o MAPEAMENTO CONFIRMADO está vazio de propósito. Enquanto não
 * virmos a resposta real do espelho, `normalize` não converte nada:
 * devolve status "mapeamento_pendente" e apenas SUGESTÕES por nome de campo,
 * que precisam ser confirmadas com os dados reais antes de virar regra.
 */
(function (ns) {
  'use strict';

  /** Campos internos do Audaz (por unidade). */
  const TARGET_FIELDS = [
    { campo: 'identificador', pistas: [/^id$/i, /id_?unidade/i, /codigo/i] },
    { campo: 'bloco', pistas: [/bloco/i, /torre/i, /etapa/i, /quadra/i, /modulo/i] },
    { campo: 'unidade', pistas: [/^unidade$/i, /numero_?unidade/i, /nome_?unidade/i, /apto|apartamento/i, /^numero$/i] },
    { campo: 'andar', pistas: [/andar/i, /pavimento/i] },
    { campo: 'tipologia', pistas: [/tipologia/i, /planta/i] },
    { campo: 'tipoUnidade', pistas: [/tipo_?unidade/i, /^tipo$/i] },
    { campo: 'quartos', pistas: [/quarto/i, /dormit/i] },
    { campo: 'areaPrivativa', pistas: [/area_?priv/i, /area/i, /metragem/i] },
    { campo: 'vagas', pistas: [/vaga/i, /garagem/i] },
    { campo: 'valor', pistas: [/^valor$/i, /valor_?venda/i, /preco/i, /valor/i] },
    { campo: 'valorComKit', pistas: [/kit/i] },
    { campo: 'avaliacao', pistas: [/avalia/i] },
    { campo: 'status', pistas: [/status/i, /situacao/i, /disponib/i] }
  ];

  /**
   * Mapeamento confirmado: { campoAudaz: 'caminho.no.item' }.
   * Será preenchido SÓ depois de validarmos o JSON real do Conquista Maraponga.
   */
  const CONFIRMED_MAPPING = null;

  /** Sugere, para cada campo do Audaz, chaves reais que parecem correspondentes. */
  function suggestMapping(fieldProfile) {
    const keys = fieldProfile.map((f) => f.campo);
    const out = {};
    for (const t of TARGET_FIELDS) {
      const found = [];
      for (const re of t.pistas) {
        for (const k of keys) {
          const leaf = k.split('.').pop();
          if (re.test(leaf) && !found.includes(k)) found.push(k);
        }
      }
      out[t.campo] = found.length ? found.slice(0, 5) : null;
    }
    return out;
  }

  function normalize(/* items */) {
    if (!CONFIRMED_MAPPING) {
      return {
        status: 'mapeamento_pendente',
        mensagem: 'Normalização desativada até confirmarmos os campos com a resposta real do espelho.'
      };
    }
    // Implementado na sequência da Fase 1, com o mapeamento confirmado.
    return { status: 'nao_implementado' };
  }

  ns.normalize = { TARGET_FIELDS, suggestMapping, normalize };
})(self.AudazConnect);
