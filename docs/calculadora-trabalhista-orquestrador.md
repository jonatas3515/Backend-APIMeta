# Orquestrador do Cálculo Trabalhista

## Objetivo

Módulo offline e puro que encadeia a coleta de intenção, dados, normalização, cálculo e formatação de resposta para a estimativa de verbas trabalhistas.

Função principal: `handleLaborSettlementMessage({ message, state })`.

## Contrato de entrada

```js
{
  message: 'texto atual do usuário',
  state: {
    active: false,
    intent: null,
    collected: {},
    askedFields: [],
    status: 'idle|collecting|ready|completed|cancelled'
  }
}
```

## Contrato de saída

```js
{
  status: 'idle|collecting|ready|completed|cancelled',
  intent: 'labor_settlement_estimate|labor_question|other',
  state: { ... },
  response: {
    kind: 'question|estimate|guidance|invalid|ignored',
    text: '...',
    data: null
  },
  calculation: null | object,
  missingFields: [],
  warnings: []
}
```

## Fluxo

1. `classifyLaborIntent(message)` — detecta a intenção.
2. `extractLaborFields(message, askedFields, collected)` — extrai, sem IA, os campos possíveis da mensagem.
3. `processLaborSettlementIntake(collected)` — normaliza e valida os dados.
4. `formatLaborSettlementResponse(...)` — monta a resposta, sem recalcular.

## Regras importantes

- O motor (`laborSettlementCalculator.js`) é a única fonte de valores.
- O orquestrador não calcula, arredonda ou inventa valores.
- O orquestrador não persiste dados, não registra PII e não chama APIs externas.
- `state` é mantido puro; o chamador decide se e como persisti-lo.
- Campos válidos coletados não são apagados.
- Valores inválidos (ex: `R$ abc`) retornam `kind: 'invalid'`.
- Respostas ambíguas são marcadas como `desconhecido` ou faltantes.

## Tratamento de datas

- Aceita `DD/MM/AAAA` e `AAAA-MM-DD`.
- Quando há uma única data, associa ao campo que ainda está vazio ou ao campo perguntado.
- Datas com desligamento anterior à admissão são inválidas.

## Cancelamento

Reconhece expressões como "cancelar", "parar", "desistir" e limpa o `state`.

## Limitações

- O parser é determinístico e limitado; frases indiretas ou incompletas podem não ser reconhecidas.
- Não mantém contexto além do `state` fornecido.
- Não integra com WhatsApp, Gemini ou banco nesta etapa.

## Próximos passos

1. Criar função adaptadora para o fluxo ativo da IA (`lib/ai.js` / `lib/aiRag.js`).
2. Adicionar endpoint controlado, se autorizado, sem persistir PII.
3. Testar integração em ambiente seguro antes de deploy.
