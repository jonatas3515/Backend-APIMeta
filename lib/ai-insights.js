import { askGemini } from './ai';

export async function generateInsightWithAI(conversation) {
  try {
    const {
      client_name,
      legal_area,
      case_type,
      municipality,
      agency,
      client_role,
      case_summary,
      intake_data,
      status,
      confidential
    } = conversation;

    // Monta contexto para a IA
    const context = `Você é um assistente jurídico especializado em gerar insights de casos encerrados para uma central de conhecimento do escritório Neves & Costa Advocacia.

Baseado nas informações abaixo, gere um insight estruturado para reutilização em futuros atendimentos similares.

INFORMAÇÕES DO CASO:
- Área Jurídica: ${legal_area || 'Não especificada'}
- Tipo de Caso: ${case_type || 'Não especificado'}
- Município: ${municipality || 'Não especificado'}
- Órgão/Entidade: ${agency || 'Não especificado'}
- Papel do Cliente: ${client_role || 'Não especificado'}
- Status: ${status || 'Não especificado'}
- Cliente: ${client_name || 'Não identificado'}

RESUMO DO CASO:
${case_summary || 'Sem resumo disponível'}

DADOS DO INTAKE:
${intake_data ? JSON.stringify(intake_data, null, 2) : 'Sem dados de intake'}

GERE UM INSIGHT COM OS SEGUINTES CAMPOS (em JSON):

{
  "summary": "Visão geral concisa do caso e problema principal (2-3 linhas)",
  "strategy_notes": "Principais estratégias usadas ou recomendadas para casos similares (4-5 linhas)",
  "risk_notes": "Riscos jurídicos/probatórios observados e como mitigá-los (3-4 linhas)",
  "outcome_notes": "Resultado do caso e lições aprendidas (2-3 linhas)",
  "similar_patterns": "Padrões recorrentes observados que podem ajudar em novos casos (2-3 linhas)"
}

Responda APENAS com o JSON, sem explicações adicionais.`;

    const response = await askGemini(context, '');

    // Tenta fazer parse do JSON
    let insight = {};
    try {
      insight = JSON.parse(response);
    } catch (e) {
      console.error('[AI-INSIGHTS] Erro ao fazer parse da resposta da IA:', e);
      // Fallback: tenta extrair JSON da resposta
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        insight = JSON.parse(jsonMatch[0]);
      } else {
        insight = {
          summary: response.substring(0, 200),
          strategy_notes: 'Não foi possível gerar automaticamente',
          risk_notes: 'Não foi possível gerar automaticamente',
          outcome_notes: 'Não foi possível gerar automaticamente',
          similar_patterns: 'Não foi possível gerar automaticamente'
        };
      }
    }

    return {
      legal_area,
      case_type,
      municipality,
      agency,
      client_role,
      summary: insight.summary || '',
      strategy_notes: insight.strategy_notes || '',
      risk_notes: insight.risk_notes || '',
      outcome_notes: insight.outcome_notes || '',
      similar_patterns: insight.similar_patterns || '',
      source: 'ai_assisted',
      confidential: confidential || false
    };
  } catch (error) {
    console.error('[AI-INSIGHTS] Erro ao gerar insight:', error);
    throw error;
  }
}
