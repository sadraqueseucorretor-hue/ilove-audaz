# AUDAZ CONNECT — Fase 1 (DEBUG)

Extensão Chrome (Manifest V3) que **observa** as respostas que o próprio Bora Vender
entrega à sessão já logada do usuário e monta um relatório da estrutura real do
espelho de vendas. Nesta fase o alvo é só o **Conquista Maraponga**.

Ela não faz login, não lê cookies nem tokens, não dispara requisições próprias e
não altera nada no portal.

## Arquitetura

```
injected.js        CAPTURA      intercepta (só leitura) fetch/XHR no contexto da página
config.js                       alvo, padrões de URL, chaves sensíveis, aliases
lib/redact.js      SEGURANÇA    remove valores sensíveis (token, CPF, e-mail, cliente…)
lib/schema.js      ESTRUTURA    tipos, perfil de campos, exemplos
lib/discovery.js   DESCOBERTA   acha o alvo, o ID dele e o espelho correspondente
lib/normalize.js   NORMALIZAÇÃO espelho → formato audaz.disponibilidade/v1 (mapeamento confirmado)
lib/report.js      RELATÓRIO    JSON de debug + console estruturado
lib/page-ui.js     UI na página aviso discreto + destaque do empreendimento
content.js         ORQUESTRADOR liga tudo e conversa com o popup
background.js                   selo no ícone (Fase 3: sincronização com o Audaz)
popup.html/js      INTERFACE    status, botão Puxar disponibilidade, JSON
```

## Como testar

1. Abra `chrome://extensions`, ligue o **Modo do desenvolvedor**, clique em
   **Carregar sem compactação** e selecione esta pasta `audaz-connect`.
2. Abra o Bora Vender e faça login normalmente. **Se já estava aberto, recarregue (F5)**:
   a observação só começa quando a página carrega com a extensão ativa.
3. Clique no ícone da extensão → **PUXAR DISPONIBILIDADE**.
   - Se o espelho do Maraponga já foi carregado nesta aba → resultado **capturado**.
   - Senão → **escutando**: o nome do empreendimento fica destacado na tela (se visível).
     Abra o espelho dele normalmente no portal. Um aviso aparece no canto quando for capturado.
4. Abra o DevTools (F12) → aba **Console**: há um grupo
   `AUDAZ CONNECT · DEBUG · Conquista Maraponga · …` com tabelas dos campos encontrados.

## O que me enviar depois do teste

- O arquivo de **Baixar relatório** (`audaz-connect-debug-*.json`), e
- O arquivo de **Baixar espelho bruto** (`audaz-connect-espelho-bruto-*.json`).

Os dois já saem sanitizados (valores de chaves como token, CPF, e-mail, telefone,
cliente e corretor viram `[removido]`). Mesmo assim, dê uma olhada antes de enviar.

Com isso eu escrevo o mapeamento confirmado em `lib/normalize.js` (bloco, unidade,
andar, valor, status…) com base nos campos reais — e só então seguimos para a Fase 2.

### Se o resultado for "aguardando" mesmo depois de abrir o espelho

O nome `obter-espelho-de-vendas` pode não aparecer na URL. Nesse caso, no DevTools:
**Network** → filtre por **Fetch/XHR** → abra o espelho do Maraponga → clique na
requisição que trouxe as unidades e me envie: a **URL** (aba Headers, sem copiar
cabeçalhos de Authorization/Cookie), o **Payload** e um trecho da aba **Response**.
O relatório também lista as últimas requisições observadas, o que ajuda a achá-la.

## Formato confirmado (teste real de 12/10/2026)

- Espelho: `GET be.direcional.com.br/bora-vender/v1/unidade/obter-espelho-de-vendas?IdEmpreendimentoSales=<id>`
  → `{ blocos: [ { nome, andar: [ { valor, unidades: [...] } ] } ] }`
- Lista de empreendimentos da regional: `GET .../v1/empreendimento/obter?unidadeDeNegocio=Direcional&regional=CE&somenteDisponiveis=false`

| Audaz | Campo do portal |
|---|---|
| identificador | `identificador` (BL01-0102) |
| bloco | `blocoEtapa` |
| unidade | derivado do `identificador` (0102) |
| andar | `andar` |
| tipologia | `tipoPlanta` |
| quartos | `numQuartos` |
| areaPrivativa | `areaPrivativaPrincipal` |
| vagas | `qtdeVagas` |
| valorFinalKit | `valorFinalKit` |
| avaliacaoBancaria | `valorAvalBancaria` |
| status | `statusUnidade` → disponível / reservado / vendido / indisponível / outro |

O botão **Baixar normalizado** gera o pacote `disponibilidade-<empreendimento>-*.json`
(também salvo localmente em `chrome.storage.local`, chave `ac:lastPackage`).
