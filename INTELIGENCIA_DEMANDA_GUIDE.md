# Inteligência de Demanda - Guia Completo

## 📊 O que foi implementado

### 1. **APIs de Métricas**

#### GET /api/metrics?action=cases-by-area
Retorna contagem de casos por área jurídica:
```json
[
  { "area": "Direito Trabalhista", "count": 45 },
  { "area": "Direito Previdenciário", "count": 32 },
  { "area": "Direito Administrativo", "count": 28 }
]
```

#### GET /api/metrics?action=cases-by-type
Retorna contagem de casos por tipo:
```json
[
  { "type": "Licença Prêmio", "count": 25 },
  { "type": "Adicional Noturno", "count": 18 },
  { "type": "Demissão", "count": 15 }
]
```

#### GET /api/metrics?action=cases-by-location
Retorna distribuição por município e órgão:
```json
[
  {
    "municipality": "Prado",
    "agency": "Prefeitura",
    "count": 12,
    "areas": { "Trabalhista": 8, "Administrativo": 4 }
  },
  {
    "municipality": "Itabuna",
    "agency": "Câmara Municipal",
    "count": 8,
    "areas": { "Administrativo": 5, "Cível": 3 }
  }
]
```

#### GET /api/metrics?action=funnel-conversion
Retorna funil de conversão com taxas:
```json
[
  {
    "stage": "lead_novo",
    "label": "Leads Novos",
    "count": 100,
    "conversionRate": 100
  },
  {
    "stage": "intake_em_andamento",
    "label": "Intake em Andamento",
    "count": 75,
    "conversionRate": 75
  },
  {
    "stage": "proposta_enviada",
    "label": "Proposta Enviada",
    "count": 45,
    "conversionRate": 60
  }
]
```

#### GET /api/metrics?action=time-series
Retorna evolução mensal:
```json
[
  {
    "month": "2024-06",
    "conversations": 25,
    "cases": 15,
    "closed": 3
  },
  {
    "month": "2024-07",
    "conversations": 32,
    "cases": 20,
    "closed": 5
  }
]
```

#### GET /api/metrics?action=summary
Retorna resumo executivo:
```json
{
  "total_cases": 105,
  "top_area": { "name": "Direito Trabalhista", "count": 45 },
  "top_type": { "name": "Licença Prêmio", "count": 25 },
  "top_municipality": { "name": "Prado", "count": 12 },
  "top_agency": { "name": "Prefeitura", "count": 10 },
  "areas_count": 5,
  "types_count": 12,
  "municipalities_count": 8,
  "agencies_count": 6
}
```

---

### 2. **Filtros Disponíveis**

Todos os endpoints aceitam:
- `legal_area` - Filtrar por área jurídica
- `start_date` - Data inicial (YYYY-MM-DD)
- `end_date` - Data final (YYYY-MM-DD)

**Exemplo:**
```
GET /api/metrics?action=cases-by-type&legal_area=Trabalhista&start_date=2024-01-01&end_date=2024-08-31
```

---

### 3. **Componente React**

#### MetricsPanel.js
Painel completo com:

**Resumo Executivo:**
- Total de Casos
- Número de Áreas Jurídicas
- Número de Municípios
- Número de Órgãos

**Gráficos:**
- 📋 **Casos por Área Jurídica** - Barras horizontais com contagem
- 🏷️ **Casos por Tipo** - Top 10 tipos de casos
- 🗺️ **Mapa de Calor** - Tabela com Município | Órgão | Casos | Área Predominante
- 📈 **Funil de Conversão** - Barras com taxa de conversão entre etapas
- 📅 **Evolução Mensal** - Tabela com Conversas | Casos | Encerrados

**Filtros:**
- Data inicial e final
- Botão "Limpar Filtros"

---

## 🎯 Casos de Uso

### 1. Entender Demanda
```
Pergunta: "Qual área jurídica tem mais casos?"
Resposta: Acesse Métricas → Casos por Área
Resultado: Direito Trabalhista com 45 casos (43% do total)
```

### 2. Identificar Oportunidades
```
Pergunta: "Quais municípios/órgãos mais demandam?"
Resposta: Acesse Métricas → Mapa de Calor
Resultado: Prado (Prefeitura) com 12 casos, Itabuna (Câmara) com 8
```

### 3. Avaliar Desempenho do Funil
```
Pergunta: "Quantos leads viram clientes?"
Resposta: Acesse Métricas → Funil de Conversão
Resultado: 100 leads → 75 intake → 45 proposta → 20 contrato (20% conversão)
```

### 4. Acompanhar Tendências
```
Pergunta: "Está crescendo o número de atendimentos?"
Resposta: Acesse Métricas → Evolução Mensal
Resultado: Junho 25 conversas → Julho 32 conversas (+28%)
```

### 5. Focar Esforços
```
Pergunta: "Onde investir em marketing/conteúdo?"
Resposta: Combine Casos por Tipo + Mapa de Calor
Resultado: Licença Prêmio em Prado/Prefeitura = maior oportunidade
```

---

## 📊 Exemplos de Análises

### Exemplo 1: Análise de Demanda por Área
```
Direito Trabalhista: 45 casos (43%)
  - Licença Prêmio: 25
  - Adicional Noturno: 12
  - Demissão: 8

Direito Previdenciário: 32 casos (30%)
  - Aposentadoria: 18
  - Benefício: 14

Direito Administrativo: 28 casos (27%)
  - Licitação: 15
  - Recurso Administrativo: 13
```

### Exemplo 2: Mapa de Calor Geográfico
```
Prado (Prefeitura): 12 casos
  - Trabalhista: 8
  - Administrativo: 4

Itabuna (Câmara Municipal): 8 casos
  - Administrativo: 5
  - Cível: 3

Ilhéus (Prefeitura): 6 casos
  - Trabalhista: 4
  - Previdenciário: 2
```

### Exemplo 3: Funil de Conversão
```
Leads Novos: 100 (100%)
Intake em Andamento: 75 (75%)
Intake Concluído: 60 (80% do anterior)
Proposta Enviada: 45 (75% do anterior)
Contrato Assinado: 20 (44% do anterior)
Ação Protocolada: 15 (75% do anterior)
Encerrado: 8 (53% do anterior)

Taxa de Conversão Final: 8% (leads → encerrado)
```

### Exemplo 4: Evolução Temporal
```
Junho 2024:
  - Conversas: 25
  - Casos: 15
  - Encerrados: 3

Julho 2024:
  - Conversas: 32 (+28%)
  - Casos: 20 (+33%)
  - Encerrados: 5 (+67%)

Agosto 2024:
  - Conversas: 28 (-12%)
  - Casos: 18 (-10%)
  - Encerrados: 4 (-20%)
```

---

## 🔍 Insights Estratégicos

### Força em Direito Trabalhista
- 43% dos casos são trabalhistas
- Licença Prêmio é o tipo mais comum (25 casos)
- Concentrado em Prado/Prefeitura

**Ação:** Investir em conteúdo sobre Licença Prêmio, focar divulgação em Prado

### Oportunidade em Direito Administrativo
- 27% dos casos
- Crescimento em Itabuna/Câmara Municipal
- Recurso Administrativo é demanda forte

**Ação:** Expandir expertise em Direito Administrativo, criar parcerias com órgãos

### Desafio na Conversão
- 100 leads → 8 encerrados (8% conversão)
- Maior queda: Proposta → Contrato (44%)

**Ação:** Revisar proposta, melhorar comunicação, aumentar follow-up

### Crescimento Positivo
- Junho → Julho: +28% em conversas
- Agosto: Estabilização (esperado)

**Ação:** Manter ritmo, investigar o que funcionou em Julho

---

## 📈 Performance Esperada

### Consultas Rápidas
- `cases-by-area`: < 500ms
- `cases-by-type`: < 500ms
- `cases-by-location`: < 1s
- `funnel-conversion`: < 1s
- `time-series`: < 1s

### Escalabilidade
- Suporta até 100k casos
- Índices em created_at, legal_area, municipality, agency
- Sem impacto em dados operacionais

---

## 🔮 Próximos Passos

1. **Análise com IA**
   - Botão "Analisar Tendências"
   - Gemini gera insights automáticos
   - Sugestões de foco estratégico

2. **Exportação de Relatórios**
   - PDF com gráficos
   - Excel com dados brutos
   - Agendamento de relatórios

3. **Alertas Automáticos**
   - Notificar quando conversão cai
   - Alertar sobre novas tendências
   - Sugerir ações baseado em dados

4. **Comparação Temporal**
   - Mês anterior vs. atual
   - Ano anterior vs. atual
   - Tendências de longo prazo

5. **Segmentação Avançada**
   - Por advogado responsável
   - Por cliente (pessoa/empresa)
   - Por status de pagamento

---

**Última atualização:** 2024-08-11  
**Status:** ✅ Implementado e pronto para uso  
**Deploy:** https://backend-apimeta.vercel.app
