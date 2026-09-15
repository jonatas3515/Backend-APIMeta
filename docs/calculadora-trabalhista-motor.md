# Motor de Estimativa de Verbas Trabalhistas

## Objetivo

Este módulo fornece um motor determinístico e testável para estimar verbas
 trabalhistas básicas a partir de poucos dados essenciais. Ele é destinado a
 uso futuro por fluxos de IA e WhatsApp, mas **nunca substitui cálculo
 contábil, perícial ou decisão judicial**.

O resultado é sempre uma **estimativa preliminar**, com caráter educativo e
 de triagem, e deve ser acompanhado de avisos de limitação.

## Escopo da primeira versão

### Incluído

- Cálculo de saldo de salário.
- 13º salário proporcional do ano do desligamento.
- Férias proporcionais acrescidas de 1/3 constitucional.
- Férias vencidas (condicionadas à existência declarada).
- Aviso-prévio indenizado em hipóteses compatíveis.
- 13º salário vencido (condicionado à existência declarada).
- Estrutura de saída com `status`, `totalEstimated`, itens separados por
  status (`calculated`, `conditional`, `not_calculated`), premissas, campos
  faltantes, avisos e nível de confiança.

### Não incluído

- FGTS e multa de 40% (condicionados e não somados ao total).
- Horas extras e reflexos.
- Atualização monetária e juros.
- Convenção coletiva / acordo coletivo.
- Descontos fiscais ou previdenciários.
- Valores definitivos de liquidação.

## Entradas

| Campo | Tipo | Obrigatório | Valores / Notas |
|---|---|---|---|
| `salary` | `number` | sim | Salário mensal bruto ou líquido de referência. Deve ser positivo. |
| `admissionDate` | `string\|Date` | sim | Data de admissão. Aceita `YYYY-MM-DD` ou objeto `Date`. |
| `terminationDate` | `string\|Date` | sim | Data de desligamento. Aceita `YYYY-MM-DD` ou objeto `Date`. |
| `terminationReason` | `string` | sim | `dispensa_sem_justa_causa`, `pedido_demissao`, `justa_causa`, `acordo`, `rescisao_indireta_em_discussao`, `contrato_temporario`, `desconhecido`. |
| `hasVacationAccrued` | `string` | não | `yes`, `no`, `unknown` (padrão `unknown`). |
| `hasThirteenthAccrued` | `string` | não | `yes`, `no`, `unknown` (padrão `unknown`). |
| `noticeStatus` | `string` | não | `trabalhado`, `indenizado`, `nao_cumprido`, `desconhecido` (padrão `desconhecido`). |

## Saída

```json
{
  "status": "complete|partial|insufficient_data",
  "currency": "BRL",
  "totalEstimated": 0,
  "items": [
    {
      "code": "salary_balance",
      "name": "Saldo de salário",
      "amount": 0,
      "status": "calculated|conditional|not_calculated",
      "assumptions": []
    }
  ],
  "inputSummary": {
    "salary": 0,
    "admissionDate": "YYYY-MM-DD",
    "terminationDate": "YYYY-MM-DD",
    "terminationReason": "..."
  },
  "missingFields": [],
  "validationErrors": [],
  "assumptions": [],
  "warnings": [],
  "confidence": "low|medium|high"
}
```

## Verbas efetivamente calculadas

- `salary_balance` — Saldo de salário, proporcional aos dias trabalhados no
  mês do desligamento.
- `thirteenth_proportional` — 13º salário proporcional ao ano do
  desligamento, considerando meses trabalhados (regra de 15 dias).
- `thirteenth_accrued` — 13º salário vencido não pago (condicionado).
- `vacation_proportional` — Férias proporcionais sobre os meses residuais do
  período aquisitivo em andamento.
- `vacation_one_third` — 1/3 constitucional sobre férias proporcionais.
- `vacation_accrued` — Férias vencidas, quando declaradas (condicionado).
- `notice_indemnity` — Aviso-prévio indenizado, apenas nas hipóteses
  compatíveis (`dispensa_sem_justa_causa` / `contrato_temporario`).

## Verbas explicitamente não calculadas

- `fgts` — FGTS e multa de 40% marcados como `conditional`.
- `overtime` — Horas extras marcadas como `not_calculated`.
- `collective_agreement` — Convenção coletiva marcada como `not_calculated`.
- `vacation_proportional` e `vacation_one_third` em demissão por justa causa
  são marcados como `conditional` (salvo exceções judiciais).
- Tudo em `rescisao_indireta_em_discussao` é `conditional`, sem total.

## Premissas jurídicas e matemáticas adotadas

1. **Mês comercial de 30 dias** para saldo de salário.
2. **Regra de avos de 15 dias** para 13º proporcional e férias
   proporcionais.
3. **Férias vencidas** são representadas por um período integral (salário +
   1/3), sem considerar histórico de pagamentos anteriores.
4. **Aviso-prévio indenizado** equivale a um salário, quando a situação for
   informada como `indenizado` e o motivo for compatível.
5. **Justa causa** afasta férias proporcionais na primeira aproximação,
   salvo exceções a serem analisadas por profissional.
6. **Rescisão indireta em discussão** não gera valores calculados: tudo
   depende de reconhecimento judicial.
7. **Arredondamento em BRL** com duas casas decimais (`toFixed(2)`).

## Exemplos sintéticos

### Exemplo 1: dispensa sem justa causa

```js
calculateLaborSettlement({
  salary: 3000,
  admissionDate: '2023-01-15',
  terminationDate: '2024-07-10',
  terminationReason: 'dispensa_sem_justa_causa',
  hasVacationAccrued: 'no',
  hasThirteenthAccrued: 'no',
  noticeStatus: 'indenizado'
});
```

Resultado: saldo de salário, 13º proporcional, férias proporcionais, 1/3 e
 aviso-prévio indenizado, além de itens condicionados (FGTS, horas extras,
 convenção) separados.

### Exemplo 2: demissão por justa causa

```js
calculateLaborSettlement({
  salary: 2000,
  admissionDate: '2022-05-01',
  terminationDate: '2024-06-30',
  terminationReason: 'justa_causa'
});
```

Resultado: saldo e 13º proporcional calculados; férias proporcionais e 1/3
 condicionados; FGTS e horas extras não calculados.

### Exemplo 3: rescisão indireta em discussão

```js
calculateLaborSettlement({
  salary: 4000,
  admissionDate: '2021-03-01',
  terminationDate: '2024-08-20',
  terminationReason: 'rescisao_indireta_em_discussao'
});
```

Resultado: `status` `partial`, confiança `medium`, `totalEstimated` `0`,
 todas as parcelas `conditional`.

## Limitações

- Não reconhece vínculo de emprego automaticamente.
- Não lê documentos, carteira de trabalho, contratos ou guias de recolhimento.
- Não considera dependentes, salário-família, insalubridade, periculosidade
  nem adicionais.
- Não aplica índices de atualização, juros moratórios ou correção monetária.
- Não calcula FGTS e multa por falta de base de incidência e depósitos.
- Não lida com múltiplos vínculos, contratos intermitentes ou temporários
  especiais.

## Plano para futura integração com IA

A IA deverá coletar os campos mínimos e chamar `calculateLaborSettlement`
com o objeto estruturado. A resposta da IA deve:

- apresentar apenas o `totalEstimated` como **estimativa**;
- listar os itens `calculated` e `conditional` separadamente;
- reproduzir os avisos obrigatórios do motor;
- nunca afirmar que o valor é definitivo;
- nunca afirmar que existe vínculo apenas com base no relato do usuário;
- recomendar análise profissional quando houver itens `conditional`.

## Arquivos

- `lib/laborSettlementCalculator.js` — motor determinístico.
- `__tests__/laborSettlementCalculator.test.js` — 25 casos sintéticos.
- `docs/calculadora-trabalhista-motor.md` — esta documentação.

## Regras para não apresentar valores como definitivos

1. Sempre iniciar a resposta com a mensagem de isenção de garantia.
2. Usar a palavra "estimativa" em toda comunicação com o usuário.
3. Destacar itens que ainda dependem de prova ou reconhecimento judicial.
4. Incluir a recomendação de análise por profissional quando houver
   condicionais.
5. Nunca arredondar para cima de forma a inflacionar a expectativa.
6. Rejeitar automaticamente salários, datas e motivos inválidos.
