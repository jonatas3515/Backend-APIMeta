import { useState } from 'react';
import axios from 'axios';
import { apiCall } from '../lib/apiClient';

const AREAS = ['', 'civel', 'trabalhista', 'previdenciario', 'administrativo', 'consumidor', 'familia', 'tributario'];
const TIPOS = ['', 'modelo_peca', 'clausula', 'tese', 'checklist', 'jurisprudencia'];
const TRIBUNAIS = ['', 'TJBA', 'TRF1', 'TRT5', 'TRF5', 'STJ', 'STF'];

const fetchTemplates = async (area, caseType) => {
  try {
    const params = new URLSearchParams();
    if (area) params.set('legal_area', area);
    if (caseType) params.set('case_type', caseType);
    const { data } = await axios.get(`/api/templates?${params.toString()}`);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[AI] Erro ao buscar templates:', err);
    return [];
  }
};

const buildEnrichedPrompt = async (query, area, caseType, docType) => {
  const templates = await fetchTemplates(area, caseType);
  const templateNames = templates.map((t) => `- ${t.name}: ${t.description || 'sem descrição'}`).join('\n');

  let prompt = query;
  if (docType === 'modelo_peca' && templates.length > 0) {
    prompt = `${query}\n\nUtilize preferencialmente a estrutura dos seguintes modelos cadastrados, quando compatíveis:\n${templateNames}\n\nGere apenas o esqueleto da peça com as seções: cabeçalho/endereçamento, qualificação das partes, fatos, fundamentos jurídicos, pedidos e requerimentos. Não invente dados pessoais, fatos ou valores. Deixe marcadores claros [PREENCHER] onde o advogado deve inserir informações.`;
  }
  return prompt;
};

export default function OfficeAIAssistant() {
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('');
  const [type, setType] = useState('');
  const [tribunal, setTribunal] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState([]);
  const [error, setError] = useState('');

  const handleAsk = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setAnswer('');
    setSources([]);
    setError('');

    try {
      const headers = await getAuthHeaders();
      const enriched = await buildEnrichedPrompt(query.trim(), area, '', type);
      const { data } = await axios.post('/api/ai/ask', {
        query: enriched,
        area: area || null,
        tribunal: tribunal || null,
        type: type || null
      }, { headers });

      setAnswer(data.answer);
      setSources(data.sources || []);
    } catch (err) {
      console.error('[AI] Erro:', err);
      setError(err.response?.data?.error || 'Erro ao consultar a IA.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-white">
      <div className="p-4 border-b border-gray-200 bg-white z-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">🧠 Assistente IA do Escritório</h1>
        <p className="text-sm text-gray-600">
          Consulte a base de conhecimento para rascunhos, modelos, teses e argumentos.
        </p>
      </div>

      <form onSubmit={handleAsk} className="p-4 space-y-3 border-b border-gray-200">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pergunta ou comando</label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex: Gere uma petição inicial consumerista por cobrança indevida..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Área</label>
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              {AREAS.map(a => (
                <option key={a} value={a}>{a ? a.charAt(0).toUpperCase() + a.slice(1) : 'Todas'}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de documento</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              {TIPOS.map(t => (
                <option key={t} value={t}>{t ? t.replace(/_/g, ' ') : 'Todos'}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tribunal</label>
            <select
              value={tribunal}
              onChange={(e) => setTribunal(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              {TRIBUNAIS.map(t => (
                <option key={t} value={t}>{t || 'Todos'}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? 'Consultando...' : 'Consultar IA'}
          </button>
          <span className="text-xs text-gray-500">
            As respostas são auxiliares e devem ser revisadas pelo advogado.
          </span>
        </div>
      </form>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {answer && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Resposta</h2>
            <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {answer}
            </div>
          </div>
        )}

        {sources.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Fontes consultadas</h2>
            <ul className="space-y-2">
              {sources.map((s, i) => (
                <li key={`${s.title}-${s.type}-${i}`} className="text-xs text-gray-600 border-l-2 border-blue-300 pl-2">
                  <strong>{s.title}</strong>
                  <span className="block text-gray-500">
                    {s.type} {s.area ? `· ${s.area}` : ''} {s.tribunal ? `· ${s.tribunal}` : ''}
                    {s.tags?.length > 0 ? ` · ${s.tags.join(', ')}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

