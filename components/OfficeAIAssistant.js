import { useState } from 'react';
import { apiJson } from '../lib/apiClient';

const AREAS = ['', 'civel', 'trabalhista', 'previdenciario', 'administrativo', 'consumidor', 'familia', 'tributario'];
const TIPOS = ['', 'modelo_peca', 'clausula', 'tese', 'checklist', 'jurisprudencia'];
const TRIBUNAIS = ['', 'TJBA', 'TRF1', 'TRT5', 'TRF5', 'STJ', 'STF'];
const KNOWLEDGE_TYPES = ['modelo_peca', 'tese', 'clausula', 'jurisprudencia', 'checklist'];

function makeTitle(query) {
  const trimmed = String(query || '').trim();
  return trimmed.length > 50 ? `${trimmed.slice(0, 50)}…` : trimmed;
}

const fetchTemplates = async (area, caseType) => {
  try {
    const params = new URLSearchParams();
    if (area) params.set('legal_area', area);
    if (caseType) params.set('case_type', caseType);
    const data = await apiJson(`/api/templates?${params.toString()}`, { method: 'GET' });
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
  const [saveModal, setSaveModal] = useState(null); // 'knowledge' | 'template'
  const [saveForm, setSaveForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const showFeedback = (text) => {
    setFeedback(text);
    setTimeout(() => setFeedback(''), 5000);
  };

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(answer);
      } else {
        const el = document.createElement('textarea');
        el.value = answer;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      showFeedback('📋 Resposta copiada!');
    } catch (err) {
      showFeedback('Não foi possível copiar. Selecione o texto manualmente.');
    }
  };

  const openKnowledgeModal = () => {
    setSaveForm({
      title: makeTitle(query),
      type: KNOWLEDGE_TYPES.includes(type) ? type : 'modelo_peca',
      area,
      tribunal,
      content: answer
    });
    setSaveModal('knowledge');
  };

  const openTemplateModal = () => {
    setSaveForm({
      name: makeTitle(query),
      description: 'Minuta gerada via Assistente IA',
      legal_area: area,
      template_text: answer
    });
    setSaveModal('template');
  };

  const closeSaveModal = () => {
    setSaveModal(null);
    setSaveForm({});
    setSaving(false);
  };

  const confirmSave = async () => {
    setSaving(true);
    try {
      if (saveModal === 'knowledge') {
        await apiJson('/api/knowledge/documents', {
          method: 'POST',
          body: JSON.stringify({
            title: saveForm.title,
            type: saveForm.type,
            area: saveForm.area || null,
            tribunal: saveForm.tribunal || null,
            tags: ['gerado_por_ia'],
            content: saveForm.content
          })
        });
        showFeedback('✅ Salvo como rascunho na Base de Conhecimento!');
      } else if (saveModal === 'template') {
        await apiJson('/api/templates', {
          method: 'POST',
          body: JSON.stringify({
            name: saveForm.name,
            description: saveForm.description || 'Minuta gerada via Assistente IA',
            legal_area: saveForm.legal_area || null,
            template_text: saveForm.template_text
          })
        });
        showFeedback('✅ Salvo na biblioteca de Modelos de Documento!');
      }
      closeSaveModal();
    } catch (err) {
      console.error('[AI] Erro ao salvar:', err);
      setError(err.message || 'Erro ao salvar a resposta.');
      setSaving(false);
    }
  };

  const handleAsk = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setAnswer('');
    setSources([]);
    setError('');

    try {
      const enriched = await buildEnrichedPrompt(query.trim(), area, '', type);
      const data = await apiJson('/api/ai/ask', {
        method: 'POST',
        body: JSON.stringify({
          query: enriched,
          area: area || null,
          tribunal: tribunal || null,
          type: type || null
        })
      });

      setAnswer(data?.answer || '');
      setSources(data?.sources || []);
    } catch (err) {
      console.error('[AI] Erro:', err);
      setError(err.response?.data?.error || 'Erro ao consultar a IA.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#181A1B] text-gray-100">
      <div className="p-4 border-b border-gray-800 bg-[#1B1D1E] z-10">
        <h1 className="text-2xl font-bold text-white mb-1">🧠 Assistente IA do Escritório</h1>
        <p className="text-xs text-gray-400">
          Consulte a base de conhecimento para rascunhos, modelos, teses e argumentos.
        </p>
      </div>

      <form onSubmit={handleAsk} className="p-4 space-y-3 border-b border-gray-800 bg-[#181A1B]">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Pergunta ou comando</label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex: Gere uma petição inicial consumerista por cobrança indevida..."
            rows={3}
            className="w-full px-3 py-2 bg-[#1E2022] border border-[#2A2D2F] rounded-xl text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-nc-yellow"
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Área</label>
            <select
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="w-full px-3 py-2 bg-[#1E2022] border border-[#2A2D2F] rounded-xl text-sm text-gray-200 focus:outline-none focus:border-nc-yellow"
            >
              {AREAS.map(a => (
                <option key={a} value={a}>{a ? a.charAt(0).toUpperCase() + a.slice(1) : 'Todas'}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Tipo de documento</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 bg-[#1E2022] border border-[#2A2D2F] rounded-xl text-sm text-gray-200 focus:outline-none focus:border-nc-yellow"
            >
              {TIPOS.map(t => (
                <option key={t} value={t}>{t ? t.replace(/_/g, ' ') : 'Todos'}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Tribunal</label>
            <select
              value={tribunal}
              onChange={(e) => setTribunal(e.target.value)}
              className="w-full px-3 py-2 bg-[#1E2022] border border-[#2A2D2F] rounded-xl text-sm text-gray-200 focus:outline-none focus:border-nc-yellow"
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
            className="px-5 py-2.5 bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-black font-bold rounded-xl text-sm shadow-sm transition disabled:opacity-50"
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

        {feedback && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700" data-testid="ai-save-feedback">
            {feedback}
          </div>
        )}

        {answer && (
          <div className="bg-[#1B1D1E] border border-gray-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-white">Resposta</h2>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="text-xs px-3 py-1.5 bg-[#1E2022] border border-[#2A2D2F] text-gray-300 hover:text-white rounded-lg hover:border-gray-600 transition"
                  title="Copiar resposta"
                >
                  📋 Copiar
                </button>
                <button
                  onClick={openKnowledgeModal}
                  className="text-xs px-3 py-1.5 bg-[#1E2022] border border-[#2A2D2F] text-gray-300 hover:text-white rounded-lg hover:border-gray-600 transition"
                  title="Salvar como rascunho na Base de Conhecimento"
                  data-testid="btn-save-knowledge"
                >
                  💾 Salvar na Base
                </button>
                <button
                  onClick={openTemplateModal}
                  className="text-xs px-3 py-1.5 bg-[#1E2022] border border-[#2A2D2F] text-gray-300 hover:text-white rounded-lg hover:border-gray-600 transition"
                  title="Salvar na biblioteca de modelos"
                  data-testid="btn-save-template"
                >
                  📄 Salvar como Modelo
                </button>
              </div>
            </div>
            <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
              {answer}
            </div>
          </div>
        )}

        {saveModal === 'knowledge' && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeSaveModal} role="dialog" aria-modal="true" aria-label="Salvar na Base de Conhecimento">
            <div className="bg-[#1B1D1E] border border-gray-800 rounded-xl max-w-lg w-full p-5 shadow-xl space-y-3 text-gray-100" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-white">Salvar na Base de Conhecimento</h3>
              <input
                value={saveForm.title || ''}
                onChange={(e) => setSaveForm((s) => ({ ...s, title: e.target.value }))}
                placeholder="Título"
                className="w-full px-3 py-2 bg-[#1E2022] border border-[#2A2D2F] rounded-lg text-sm text-gray-100"
                data-testid="knowledge-title"
              />
              <div className="grid grid-cols-3 gap-2">
                <select value={saveForm.type || 'modelo_peca'} onChange={(e) => setSaveForm((s) => ({ ...s, type: e.target.value }))} className="w-full px-2 py-2 bg-[#1E2022] border border-[#2A2D2F] rounded-lg text-sm text-gray-200" data-testid="knowledge-type">
                  {KNOWLEDGE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
                <select value={saveForm.area || ''} onChange={(e) => setSaveForm((s) => ({ ...s, area: e.target.value }))} className="w-full px-2 py-2 bg-[#1E2022] border border-[#2A2D2F] rounded-lg text-sm text-gray-200" data-testid="knowledge-area">
                  {AREAS.map(a => <option key={a} value={a}>{a ? a.charAt(0).toUpperCase() + a.slice(1) : 'Área'}</option>)}
                </select>
                <select value={saveForm.tribunal || ''} onChange={(e) => setSaveForm((s) => ({ ...s, tribunal: e.target.value }))} className="w-full px-2 py-2 bg-[#1E2022] border border-[#2A2D2F] rounded-lg text-sm text-gray-200" data-testid="knowledge-tribunal">
                  {TRIBUNAIS.map(t => <option key={t} value={t}>{t || 'Tribunal'}</option>)}
                </select>
              </div>
              <textarea
                value={saveForm.content || ''}
                onChange={(e) => setSaveForm((s) => ({ ...s, content: e.target.value }))}
                rows={8}
                className="w-full px-3 py-2 bg-[#1E2022] border border-[#2A2D2F] rounded-lg text-sm text-gray-100 resize-none"
                data-testid="knowledge-content"
              />
              <div className="flex justify-end gap-2">
                <button onClick={closeSaveModal} className="px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 text-gray-300 rounded-lg" disabled={saving}>Cancelar</button>
                <button onClick={confirmSave} className="px-4 py-1.5 text-sm bg-nc-yellow text-nc-black font-bold rounded-lg disabled:opacity-60" disabled={saving || !saveForm.title?.trim() || !saveForm.content?.trim()} data-testid="knowledge-confirm">
                  {saving ? 'Salvando...' : 'Salvar rascunho'}
                </button>
              </div>
            </div>
          </div>
        )}

        {saveModal === 'template' && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeSaveModal} role="dialog" aria-modal="true" aria-label="Salvar como Modelo">
            <div className="bg-[#1B1D1E] border border-gray-800 rounded-xl max-w-lg w-full p-5 shadow-xl space-y-3 text-gray-100" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-white">Salvar como Modelo de Documento</h3>
              <input
                value={saveForm.name || ''}
                onChange={(e) => setSaveForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="Nome do modelo"
                className="w-full px-3 py-2 bg-[#1E2022] border border-[#2A2D2F] rounded-lg text-sm text-gray-100"
                data-testid="template-name"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={saveForm.description || ''}
                  onChange={(e) => setSaveForm((s) => ({ ...s, description: e.target.value }))}
                  placeholder="Descrição"
                  className="w-full px-3 py-2 bg-[#1E2022] border border-[#2A2D2F] rounded-lg text-sm text-gray-100"
                  data-testid="template-description"
                />
                <select value={saveForm.legal_area || ''} onChange={(e) => setSaveForm((s) => ({ ...s, legal_area: e.target.value }))} className="w-full px-2 py-2 bg-[#1E2022] border border-[#2A2D2F] rounded-lg text-sm text-gray-200" data-testid="template-area">
                  {AREAS.map(a => <option key={a} value={a}>{a ? a.charAt(0).toUpperCase() + a.slice(1) : 'Área Jurídica'}</option>)}
                </select>
              </div>
              <textarea
                value={saveForm.template_text || ''}
                onChange={(e) => setSaveForm((s) => ({ ...s, template_text: e.target.value }))}
                rows={8}
                className="w-full px-3 py-2 bg-[#1E2022] border border-[#2A2D2F] rounded-lg text-sm text-gray-100 resize-none"
                data-testid="template-text"
              />
              <div className="flex justify-end gap-2">
                <button onClick={closeSaveModal} className="px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 text-gray-300 rounded-lg" disabled={saving}>Cancelar</button>
                <button onClick={confirmSave} className="px-4 py-1.5 text-sm bg-nc-yellow text-nc-black font-bold rounded-lg disabled:opacity-60" disabled={saving || !saveForm.name?.trim() || !saveForm.template_text?.trim()} data-testid="template-confirm">
                  {saving ? 'Salvando...' : 'Salvar modelo'}
                </button>
              </div>
            </div>
          </div>
        )}

        {sources.length > 0 && (
          <div className="bg-[#1B1D1E] border border-gray-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-white mb-2">Fontes consultadas</h2>
            <ul className="space-y-2">
              {sources.map((s, i) => (
                <li key={`${s.title}-${s.type}-${i}`} className="text-xs text-gray-400 border-l-2 border-blue-500 pl-2">
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


