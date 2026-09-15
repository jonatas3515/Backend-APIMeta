# Classificador e Formatador de Resposta Trabalhista

## Objetivo

Esta etapa adiciona dois módulos puramente determinísticos para futura
 integração com a IA do escritório:

- `lib/laborSettlementIntent.js` — classifica se a mensagem do cliente é um
  pedido de cálculo de verbas trabalhistas, uma pergunta trabalhista ou
  outro assunto.
- `lib/laborSettlementResponse.js` — formata o resultado do
  `laborSettlementIntake` e do `laborSettlementCalculator` em texto
  responsivo e seguro.

Ambos são offline, sem IA, sem banco e sem registro do texto recebido.

## Classificador de intenção

### Contrato

```js
const result = classifyLaborIntent('Quanto vou receber se for demitido?');
```

Retorna:

```js
{
  intent: 'labor_settlement_estimate', // ou 'labor_question' | 'other'
  confidence: 'high',                  // ou 'medium' | 'low'
  signals: ['quanto', 'demitido'],
  requiresIntake: true
}
```

### Classes

| Intenção | Quando reconhecida |
|---|---|
| `labor_settlement_estimate` | Há sinal de quantidade/valor/estimativa **e** termo trabalhista. |
| `labor_question` | Há termo trabalhista, mas sem pedido de cálculo. |
| `other` | Sem sinal trabalhista relevante ou consulta genérica (salário mínimo, FGTS conceitual, saudação). |

### Sinais de cálculo

- `quanto`, `quanto vou`, `quanto tenho`, `quanto posso`
- `valor`, `calcular`, `estimativa`, `acerto`, `conta`, `total`
- `receber`, `daria`, `ficaria`, `sair`, `pedir conta`

### Sinais de tema trabalhista

- `rescisão`, `demissão`, `demitido`, `trabalhista`, `trabalho`, `emprego`
- `carteira`, `registrado`, `FGTS`, `férias`, `13º`, `aviso prévio`
- `jornada`, `admissão`, `desligamento`, `justa causa`, `verbas rescisórias`

### Falsos positivos evitados

- `Quanto é o salário mínimo?` → `other`
- `O que é FGTS?` → `other`
- `Tenho direito a férias?` → `labor_question` (não cálculo)
- `Fui mandado embora` → `labor_question` (não cálculo)
- `Rescisão` sozinho → `labor_question` (não cálculo)

## Formatador de resposta

### Contrato

```js
const response = formatLaborSettlementResponse({
  status: 'ready',
  intakeResult,
  calculation,
  intent,
  missingFields: [],
  ambiguousFields: [],
  warnings: [],
  nextQuestions: []
});
```

### Comportamento por status

| Status | Resposta |
|---|---|
| `labor_question` | Sinaliza que é uma dúvida e oferece estimativa se o usuário quiser. |
| `needs_information` | Pede somente os campos faltantes, sem questionário amplo. |
| `invalid` | Indica dado inconsistente e solicita correção. |
| `ready` | Apresenta estimativa com itens separados em calculados, condicionais e não calculados. |

### Regras do texto ready

- Título: **Estimativa preliminar de verbas trabalhistas**.
- Lista `calculated` com valores em BRL.
- Lista `conditional` com ressalva de que dependem de prova/reconhecimento.
- Lista `not_calculated` indicando o que não entrou.
- Total estimado, quando disponível.
- Premissas limitadas às 8 primeiras para não poluir.
- Avisos obrigatórios no final.
- Nunca expõe salário literal nem PII.

### Exemplo de saída ready

```
*Estimativa preliminar de verbas trabalhistas*

*Verbas calculadas:*
- Saldo de salário: R$ 1.000,00
- 13º salário proporcional: R$ 1.750,00
- Férias proporcionais: R$ 500,00
- 1/3 constitucional sobre férias proporcionais: R$ 166,67
- Aviso-prévio indenizado: R$ 3.000,00

*Verbas condicionais (dependem de prova ou reconhecimento):*
- FGTS e multa de 40%: a confirmar

*Verbas não incluídas nesta estimativa:*
- Horas extras: não incluído nesta estimativa
- Convenção coletiva / Acordo coletivo: não incluído nesta estimativa

Total estimado: R$ 6.516,67

*Avisos:*
Esta é uma estimativa preliminar e não representa garantia de valor.
O cálculo depende de confirmação dos fatos, documentos e regras aplicáveis.
Parcelas controvertidas devem ser analisadas por profissional.
```

## Fluxo futuro de integração

1. IA recebe mensagem do cliente.
2. Chama `classifyLaborIntent`.
3. Se `labor_settlement_estimate`, coleta/atualiza dados com
   `processLaborSettlementIntake`.
4. Quando `status === 'ready'`, chama `formatLaborSettlementResponse`.
5. Envia texto formatado de volta ao cliente.
6. Nunca substitui o motor; nunca altera o cálculo.

## Limitações

- O classificador é baseado em sinais estáticos; linguagem muito indireta
  pode não ser reconhecida.
- Não entende contexto de múltiplas mensagens.
- Não integra com o assistente ativo nesta etapa.
- Não lida com sinônimos fora das listas configuradas.

## Arquivos

- `lib/laborSettlementIntent.js`
- `lib/laborSettlementResponse.js`
- `__tests__/laborSettlementIntent.test.js`
- `__tests__/laborSettlementResponse.test.js`
- `docs/calculadora-trabalhista-nlp.md`
