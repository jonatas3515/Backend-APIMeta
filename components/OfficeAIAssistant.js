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

        {feedback && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700" data-testid="ai-save-feedback">
            {feedback}
          </div>
        )}

        {answer && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-700">Resposta</h2>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-100"
                  title="Copiar resposta"
                >
                  📋 Copiar
                </button>
                <button
                  onClick={openKnowledgeModal}
                  className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-100"
                  title="Salvar como rascunho na Base de Conhecimento"
                  data-testid="btn-save-knowledge"
                >
                  💾 Salvar na Base
                </button>
                <button
                  onClick={openTemplateModal}
                  className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-100"
                  title="Salvar na biblioteca de modelos"
                  data-testid="btn-save-template"
                >
                  📄 Salvar como Modelo
                </button>
              </div>
            </div>
            <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {answer}
            </div>
          </div>
        )}

        {saveModal === 'knowledge' && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeSaveModal} role="dialog" aria-modal="true" aria-label="Salvar na Base de Conhecimento">
            <div className="bg-white rounded-lg max-w-lg w-full p-5 shadow-xl space-y-3" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-gray-900">Salvar na Base de Conhecimento</h3>
              <input
                value={saveForm.title || ''}
                onChange={(e) => setSaveForm((s) => ({ ...s, title: e.target.value }))}
                placeholder="Título"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                data-testid="knowledge-title"
              />
              <div className="grid grid-cols-3 gap-2">
                <select value={saveForm.type || 'modelo_peca'} onChange={(e) => setSaveForm((s) => ({ ...s, type: e.target.value }))} className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white" data-testid="knowledge-type">
                  {KNOWLEDGE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                </select>
                <select value={saveForm.area || ''} onChange={(e) => setSaveForm((s) => ({ ...s, area: e.target.value }))} className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white" data-testid="knowledge-area">
                  {AREAS.map(a => <option key={a} value={a}>{a ? a.charAt(0).toUpperCase() + a.slice(1) : 'Área'}</option>)}
                </select>
                <select value={saveForm.tribunal || ''} onChange={(e) => setSaveForm((s) => ({ ...s, tribunal: e.target.value }))} className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white" data-testid="knowledge-tribunal">
                  {TRIBUNAIS.map(t => <option key={t} value={t}>{t || 'Tribunal'}</option>)}
                </select>
              </div>
              <textarea
                value={saveForm.content || ''}
                onChange={(e) => setSaveForm((s) => ({ ...s, content: e.target.value }))}
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
                data-testid="knowledge-content"
              />
              <div className="flex justify-end gap-2">
                <button onClick={closeSaveModal} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg" disabled={saving}>Cancelar</button>
                <button onClick={confirmSave} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-60" disabled={saving || !saveForm.title?.trim() || !saveForm.content?.trim()} data-testid="knowledge-confirm">
                  {saving ? 'Salvando...' : 'Salvar rascunho'}
                </button>
              </div>
            </div>
          </div>
        )}

        {saveModal === 'template' && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeSaveModal} role="dialog" aria-modal="true" aria-label="Salvar como Modelo">
            <div className="bg-white rounded-lg max-w-lg w-full p-5 shadow-xl space-y-3" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-gray-900">Salvar como Modelo de Documento</h3>
              <input
                value={saveForm.name || ''}
                onChange={(e) => setSaveForm((s) => ({ ...s, name: e.target.value }))}
                placeholder="Nome do modelo"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                data-testid="template-name"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={saveForm.description || ''}
                  onChange={(e) => setSaveForm((s) => ({ ...s, description: e.target.value }))}
                  placeholder="Descrição"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  data-testid="template-description"
                />
                <select value={saveForm.legal_area || ''} onChange={(e) => setSaveForm((s) => ({ ...s, legal_area: e.target.value }))} className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white" data-testid="template-area">
                  {AREAS.map(a => <option key={a} value={a}>{a ? a.charAt(0).toUpperCase() + a.slice(1) : 'Área Jurídica'}</option>)}
                </select>
              </div>
              <textarea
                value={saveForm.template_text || ''}
                onChange={(e) => setSaveForm((s) => ({ ...s, template_text: e.target.value }))}
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
                data-testid="template-text"
              />
              <div className="flex justify-end gap-2">
                <button onClick={closeSaveModal} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg" disabled={saving}>Cancelar</button>
                <button onClick={confirmSave} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-60" disabled={saving || !saveForm.name?.trim() || !saveForm.template_text?.trim()} data-testid="template-confirm">
                  {saving ? 'Salvando...' : 'Salvar modelo'}
                </button>
              </div>
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


