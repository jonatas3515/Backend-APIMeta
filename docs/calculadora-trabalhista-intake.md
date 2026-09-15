# Módulo de Coleta e Normalização — Calculadora Trabalhista

## Objetivo

O `lib/laborSettlementIntake.js` é o módulo intermediário responsável por
 receber dados coletados pela IA, normalizá-los, identificar campos
 faltantes ou ambíguos, e encaminhar uma estrutura segura para
 `lib/laborSettlementCalculator.js`.

Ele **nunca calcula**, **nunca arredonda** e **nunca inventa informações**.
Sua única função é garantir que o motor receba entradas limpas e
 documentar o que ainda falta.

## Diferença entre coletor e motor

| Coletor (`laborSettlementIntake`) | Motor (`laborSettlementCalculator`) |
|---|---|
| Interpreta e normaliza respostas em linguagem natural ou parcial. | Realiza cálculos determinísticos. |
| Identifica campos faltantes e ambíguos. | Define se o cálculo é completo, parcial ou insuficiente. |
| Sugere próximas perguntas. | Retorna itens calculados, condicionais e não calculados. |
| Não decide sobre vínculo empregatício. | Aplica premissas matemáticas e jurídicas documentadas. |

## Contrato de entrada

```js
{
  salary: 2500,                      // number | string
  admissionDate: '2024-01-10',       // YYYY-MM-DD ou DD/MM/YYYY
  terminationDate: '2025-07-10',
  terminationReason: 'fui demitido', // texto livre ou enum
  hasVacationAccrued: 'não',         // sim/nao/unknown ou variantes
  hasThirteenthAccrued: 'não sei',
  noticeStatus: 'desconhecido'       // trabalhado/indenizado/nao_cumprido/desconhecido
}
```

## Contrato de saída

```js
{
  status: 'ready|needs_information|invalid',
  normalizedInput: {
    salary: 2500,
    admissionDate: '2024-01-10',
    terminationDate: '2025-07-10',
    terminationReason: 'dispensa_sem_justa_causa',
    hasVacationAccrued: 'no',
    hasThirteenthAccrued: 'unknown',
    noticeStatus: 'desconhecido'
  },
  missingFields: [],
  ambiguousFields: [],
  calculation: { /* resultado do motor */ } | null,
  warnings: [ /* mensagens obrigatórias */ ],
  nextQuestions: [ /* perguntas sugeridas */ ]
}
```

## Regras de normalização

### `salary`

- Remove `R$`, pontos de milhar e converte vírgula decimal.
- Rejeita valores nulos, negativos ou não numéricos.

### Datas

- Aceita `YYYY-MM-DD` e `DD/MM/YYYY` (ou `DD-MM-YYYY`).
- Converte para `YYYY-MM-DD` no output.
- Rejeita desligamento anterior à admissão.

### Motivo do desligamento

Converte termos coloquiais para os valores controlados:

| Entrada exemplo | Valor normalizado |
|---|---|
| `fui demitido`, `dispensa sem justa causa` | `dispensa_sem_justa_causa` |
| `pedi demissão`, `pediu as contas` | `pedido_demissao` |
| `justa causa` | `justa_causa` |
| `acordo` | `acordo` |
| `rescisão indireta`, `em discussão` | `rescisao_indireta_em_discussao` |
| `contrato temporário` | `contrato_temporario` |
| `não sei`, `outro` | `desconhecido` |

Se não for possível classificar sem dúvida, o campo é marcado como
 `ambiguous` e a pergunta é repetida.

### `hasVacationAccrued` / `hasThirteenthAccrued`

- `sim`, `yes`, `s`, `tem` → `yes`
- `não`, `no`, `nao`, `não tem` → `no`
- qualquer outro valor → `unknown`

### `noticeStatus`

- `trabalhado`, `trabalhei`, `cumprido` → `trabalhado`
- `indenizado`, `recebi`, `pago` → `indenizado`
- `não cumprido`, `faltei` → `nao_cumprido`
- qualquer outro valor → `desconhecido`

## Campos obrigatórios

- `salary`
- `admissionDate`
- `terminationDate`
- `terminationReason`

Faltando qualquer um, o status é `needs_information` e `nextQuestions`
 contém a pergunta correspondente.

## Campos opcionais

- `hasVacationAccrued`
- `hasThirteenthAccrued`
- `noticeStatus`

Quando ausentes ou desconhecidos, são preenchidos com `unknown`/
 `desconhecido` e o cálculo prossegue, sinalizando a incerteza nas
 premissas.

## Perguntas mínimas

1. Qual era o salário mensal?
2. Qual foi a data de admissão?
3. Qual foi a data de desligamento?
4. O desligamento ocorreu por dispensa sem justa causa, pedido de
   demissão, justa causa, acordo, rescisão indireta, contrato temporário
   ou outra situação?
5. Havia férias vencidas não pagas?
6. Havia 13º salário vencido ou não pago?
7. O aviso-prévio foi trabalhado, indenizado, não cumprido ou você não
   sabe?

## Segurança e privacidade

- O módulo não grava logs.
- Não persiste dados pessoais.
- Não inclui salário, datas ou motivo em métricas.
- Não chama Gemini, APIs externas ou banco de dados.
- A IA deve usar o resultado do intake para chamar o motor, sem recalcular
  ou alterar valores.

## Limites jurídicos

- O coletor não assume reconhecimento de vínculo.
- Não interpreta "acho que" como confirmação.
- Não converte ambiguidade em resposta definitiva.
- Preserva o caráter condicional de FGTS, horas extras e convenção
  coletiva já definido pelo motor.

## Exemplo de uso

```js
const { processLaborSettlementIntake } = require('./lib/laborSettlementIntake');

const result = processLaborSettlementIntake({
  salary: 'R$ 3.000,00',
  admissionDate: '10/01/2023',
  terminationDate: '10/07/2024',
  terminationReason: 'fui demitido',
  hasVacationAccrued: 'não',
  hasThirteenthAccrued: 'não sei',
  noticeStatus: 'indenizado'
});

// result.status === 'ready'
// result.normalizedInput contém valores padronizados
// result.calculation contém o resultado do motor
```

## Próximos passos

1. Integrar `processLaborSettlementIntake` ao classificador de intenção da
   IA.
2. Criar template de resposta que use `calculation.warnings` e itens
   separados por status.
3. Somente depois, adicionar endpoint protegido (`/api/labor/settlement`)
   sem persistir dados pessoais.
