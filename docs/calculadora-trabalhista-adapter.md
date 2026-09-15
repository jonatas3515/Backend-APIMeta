# Adaptador de Integração Offline do Cálculo Trabalhista

## Objetivo

`lib/laborSettlementAdapter.js` é a única ponte recomendada entre o orquestrador trabalhista (`lib/laborSettlementOrchestrator.js`) e os futuros pontos de integração (webhook, `lib/ai.js`, `pages/api/ai/ask.js`, etc.).

Ele recebe uma mensagem, um estado e metadados opcionais, e devolve um resultado estruturado.

## Contrato

### Entrada

```js
{
  message: 'texto da mensagem',
  state: {
    active: false,
    intent: null,
    collected: {},
    askedFields: [],
    status: 'idle'
  },
  metadata: {
    source: 'offline_test'
  }
}
```

### Saída

```js
{
  handled: true|false,
  flow: 'labor_settlement_estimate|labor_question|other|error',
  state: {},
  response: { kind: 'question|estimate|guidance|invalid|ignored|error', text: '...', data: null },
  calculation: null|{},
  missingFields: [],
  warnings: []
}
```

## Regras

- Chama `handleLaborSettlementMessage` como única fonte de fluxo.
- Não duplica classificador, intake, motor ou formatador.
- Não calcula, arredonda ou inventa valores.
- Não persiste `state`.
- Não registra `message`, salário, datas ou PII.
- `handled` é `true` para `labor_settlement_estimate` e `labor_question`; `false` para `other`.
- Se `handleLaborSettlementMessage` lançar erro, devolve resposta segura sem stack trace.

## `handled` vs `flow`

| `flow` | `handled` | Significado |
|---|---|---|
| `labor_settlement_estimate` | `true` | Iniciou ou continua coleta de cálculo. |
| `labor_question` | `true` | Dúvida trabalhista; sem cálculo automático. |
| `other` | `false` | Não é trabalhista ou não reconhecido. |
| `error` | `false` | Erro sanitizado. |

## Estado

O `state` é recebido e devolvido. O chamador decide:
- se mantém entre mensagens;
- qual chave de conversa usa;
- se descarta após `cancelled`.

Não há persistência no adaptador.

## Futura conexão com WhatsApp

1. O webhook/web worker recebe a mensagem e carrega `state` da memória/conversa.
2. Chama `adaptLaborSettlement({ message, state, metadata })`.
3. Se `handled === true`, envia `response.text` como resposta e guarda `state`.
4. Se `handled === false`, devolve para o fluxo normal da IA.

## Riscos

- O `state` deve ser controlado por conversa/thread, não global.
- Não armazenar `collected`, `message` nem `calculation` em logs ou métricas.
- Dados sensíveis só podem transitar em memória.

## Próximos passos

1. Conectar em ambiente de teste ao `pages/api/webhook.js` usando memória curta.
2. Adicionar limite de tempo e inatividade no `state`.
3. Validar LGPD: não persistir PII, não incluir PII em respostas externas.
