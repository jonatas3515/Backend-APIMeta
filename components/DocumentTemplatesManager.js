import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { apiJson } from '../lib/apiClient';

const LEGAL_AREAS = [
  'Geral',
  'Direito do Consumidor',
  'Direito Trabalhista',
  'Direito Previdenciário',
  'Direito Civil',
  'Direito de Família e Sucessões',
  'Direito Administrativo'
];

const CASE_TYPES = [
  'Contrato de Honorários',
  'Procuração',
  'Justiça Gratuita',
  'Petição Inicial',
  'Defesa / Contestação',
  'Recurso',
  'Execução',
  'Indenização',
  'Catálogo de Poderes',
  'Outro'
];

export default function DocumentTemplatesManager() {
  const router = useRouter();
  const searchRef = useRef(null);
  const fileInputRef = useRef(null);

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedArea, setSelectedArea] = useState('all');

  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    legal_area: 'Geral',
    case_type: 'Outro',
    template_text: '',
    placeholders: []
  });

  // Estado do Modal do Agente IA
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiInputMode, setAiInputMode] = useState('file'); // 'file' ou 'text'
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileBase64, setFileBase64] = useState('');
  const [rawText, setRawText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgressText, setAiProgressText] = useState('');
  const [aiError, setAiError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  // Atalho T: foca no campo de busca de templates
  useEffect(() => {
    if (router.isReady && router.query.focus === 'search' && searchRef.current) {
      searchRef.current.focus();
      const query = { ...router.query };
      delete query.focus;
      query.tab = 'templates';
      router.replace({ pathname: router.pathname, query }, undefined, { shallow: true });
    }
  }, [router.isReady, router.query]);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('document_templates')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('[TEMPLATES] Erro ao buscar:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!formData.name || !formData.template_text) {
      alert('Nome e texto do template são obrigatórios');
      return;
    }

    // Extrai automaticamente os placeholders usados no texto (ex: {{nome}})
    const matches = formData.template_text.match(/\{\{([^{}]+)\}\}/g) || [];
    const extractedPlaceholders = Array.from(new Set(matches.map(m => m.replace(/[{}]/g, '').trim())));

    const payload = {
      ...formData,
      placeholders: extractedPlaceholders
    };

    try {
      if (editingTemplate) {
        const { error } = await supabase
          .from('document_templates')
          .update(payload)
          .eq('id', editingTemplate.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('document_templates')
          .insert([payload]);

        if (error) throw error;
      }

      setShowForm(false);
      setEditingTemplate(null);
      setFormData({
        name: '',
        description: '',
        legal_area: 'Geral',
        case_type: 'Outro',
        template_text: '',
        placeholders: []
      });
      fetchTemplates();
    } catch (error) {
      console.error('[TEMPLATES] Erro ao salvar:', error);
      alert('Erro ao salvar template');
    }
  };

  const handleEditTemplate = (template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name || '',
      description: template.description || '',
      legal_area: template.legal_area || 'Geral',
      case_type: template.case_type || 'Outro',
      template_text: template.template_text || '',
      placeholders: template.placeholders || []
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteTemplate = async (id) => {
    if (!confirm('Tem certeza que deseja deletar este template?')) return;

    try {
      const { error } = await supabase
        .from('document_templates')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
      fetchTemplates();
    } catch (error) {
      console.error('[TEMPLATES] Erro ao deletar:', error);
      alert('Erro ao deletar template');
    }
  };

  const handleCopyText = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Upload e leitura do arquivo (PDF ou DOCX)
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setAiError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        const base64Data = result.split(',')[1] || result;
        setFileBase64(base64Data);
      }
    };
    reader.onerror = () => {
      setAiError('Falha ao ler o arquivo selecionado.');
    };
    reader.readAsDataURL(file);
  };

  // Execução da análise e padronização pelo Agente IA
  const handleExtractWithAi = async () => {
    if (aiInputMode === 'file' && (!fileBase64 || !selectedFile)) {
      setAiError('Por favor selecione um arquivo PDF ou .DOCX.');
      return;
    }
    if (aiInputMode === 'text' && !rawText.trim()) {
      setAiError('Por favor cole o texto da peça jurídica.');
      return;
    }

    setAiLoading(true);
    setAiError(null);
    setAiProgressText('Carregando documento e conectando com o Agente IA...');

    const timer1 = setTimeout(() => {
      setAiProgressText('Analisando termos jurídicos, qualificações e cláusulas...');
    }, 2000);

    const timer2 = setTimeout(() => {
      setAiProgressText('Substituindo dados sensíveis por variáveis padronizadas {{placeholders}}...');
    }, 5500);

    try {
      const payload = {
        filename: selectedFile?.name || 'documento.txt',
        mimeType: selectedFile?.type || (selectedFile?.name?.endsWith('.docx') ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/pdf'),
        fileBase64: aiInputMode === 'file' ? fileBase64 : null,
        rawText: aiInputMode === 'text' ? rawText : null
      };

      const result = await apiJson('/api/templates/extract-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!result.success || !result.template) {
        throw new Error(result.error || 'Não foi possível extrair o template.');
      }

      const extracted = result.template;

      // Abre o formulário principal já preenchido com os dados extraídos pela IA
      setFormData({
        name: extracted.name || selectedFile?.name?.replace(/\.[^/.]+$/, '') || 'Novo Modelo Padronizado',
        description: extracted.description || 'Modelo padronizado automaticamente por IA.',
        legal_area: extracted.legal_area || 'Geral',
        case_type: extracted.case_type || 'Outro',
        template_text: extracted.template_text || '',
        placeholders: extracted.placeholders || []
      });

      setEditingTemplate(null);
      setShowAiModal(false);
      setShowForm(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('[AI_EXTRACT]', err);
      setAiError(err.message || 'Erro ao processar o documento com IA. Tente novamente.');
    } finally {
      clearTimeout(timer1);
      clearTimeout(timer2);
      setAiLoading(false);
      setAiProgressText('');
    }
  };

  const filteredTemplates = templates.filter(t => {
    const matchesSearch =
      (t.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.legal_area || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.case_type || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesArea = selectedArea === 'all' || t.legal_area === selectedArea;

    return matchesSearch && matchesArea;
  });

  return (
    <div className="space-y-6">
      {/* Barra de Ações Superior */}
      <div className="bg-[#181A1B] border border-[#2A2D2F] rounded-xl p-4 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
        <div className="flex-1 flex flex-col sm:flex-row gap-3">
          <input
            ref={searchRef}
            type="text"
            placeholder="Buscar modelo ou cláusula... (Atalho: T)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-3.5 py-2 bg-[#1B1D1E] border border-[#2A2D2F] rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-nc-yellow"
          />

          <select
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            className="px-3 py-2 bg-[#1B1D1E] border border-[#2A2D2F] rounded-lg text-sm text-gray-300 focus:outline-none focus:border-nc-yellow"
          >
            <option value="all">Todas as Áreas ({templates.length})</option>
            {LEGAL_AREAS.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Botão do Agente IA Enterprise */}
          <button
            type="button"
            onClick={() => {
              setShowAiModal(true);
              setAiError(null);
            }}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black rounded-lg text-sm transition shadow-lg flex items-center gap-2 group cursor-pointer"
          >
            <span>🤖 Extrair com IA</span>
            <span className="text-[10px] bg-slate-950 text-amber-400 px-1.5 py-0.5 rounded font-black tracking-wide">
              ENTERPRISE
            </span>
          </button>

          {/* Botão Manual */}
          <button
            type="button"
            onClick={() => {
              setShowForm(true);
              setEditingTemplate(null);
              setFormData({
                name: '',
                description: '',
                legal_area: 'Geral',
                case_type: 'Outro',
                template_text: '',
                placeholders: []
              });
            }}
            className="px-4 py-2 bg-[#1E2022] hover:bg-[#2A2D2F] text-gray-200 border border-[#2A2D2F] font-semibold rounded-lg text-sm transition flex items-center gap-1.5 cursor-pointer"
          >
            <span>+</span> Novo Manual
          </button>
        </div>
      </div>

      {/* MODAL DO AGENTE IA (ENTERPRISE) */}
      {showAiModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-[#181A1B] border border-[#2A2D2F] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-fadeIn">
            {/* Cabeçalho do Modal */}
            <div className="p-4 border-b border-[#2A2D2F] bg-gradient-to-r from-[#1B1D1E] to-[#222527] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">🤖</span>
                <div>
                  <h3 className="font-bold text-gray-100 text-base flex items-center gap-2">
                    Agente IA de Padronização de Peças
                    <span className="text-[10px] bg-amber-400/20 text-amber-400 border border-amber-500/40 px-1.5 py-0.5 rounded font-black">
                      ENTERPRISE
                    </span>
                  </h3>
                  <p className="text-xs text-gray-400">
                    Extraia texto de PDF ou DOCX e substitua dados sensíveis por variáveis padronizadas.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!aiLoading) setShowAiModal(false);
                }}
                disabled={aiLoading}
                className="text-gray-400 hover:text-gray-100 text-lg font-bold p-1 rounded hover:bg-[#2A2D2F] disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            {/* Corpo do Modal */}
            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              {/* Seletor de Modo: Arquivo ou Texto */}
              <div className="flex gap-2 p-1 bg-[#1B1D1E] rounded-lg border border-[#2A2D2F]">
                <button
                  type="button"
                  onClick={() => setAiInputMode('file')}
                  className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition ${
                    aiInputMode === 'file'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  📁 Anexar Arquivo (PDF / .DOCX)
                </button>
                <button
                  type="button"
                  onClick={() => setAiInputMode('text')}
                  className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold transition ${
                    aiInputMode === 'text'
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  📝 Colar Texto da Minuta
                </button>
              </div>

              {aiInputMode === 'file' ? (
                <div className="space-y-3">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-[#2A2D2F] hover:border-amber-500/60 rounded-xl p-8 text-center cursor-pointer bg-[#1B1D1E]/60 transition group"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-4xl group-hover:scale-110 transition">📄</span>
                      <p className="text-sm font-semibold text-gray-200">
                        {selectedFile ? selectedFile.name : 'Clique para selecionar seu arquivo PDF ou .DOCX'}
                      </p>
                      <p className="text-xs text-gray-400">
                        Suporta minutas de petições, procurações, contratos de honorários e declarações.
                      </p>
                      {selectedFile && (
                        <span className="text-xs bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded mt-2">
                          ✓ Arquivo pronto para análise ({(selectedFile.size / 1024).toFixed(1)} KB)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-gray-300">
                    Cole abaixo a íntegra da minuta existente:
                  </label>
                  <textarea
                    rows={8}
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder="Cole aqui o texto completo da procuração, contrato ou petição..."
                    className="w-full p-3 bg-[#1B1D1E] border border-[#2A2D2F] rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-nc-yellow font-mono"
                  />
                </div>
              )}

              {/* Mensagem de Erro */}
              {aiError && (
                <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 rounded-lg text-xs">
                  ⚠️ {aiError}
                </div>
              )}

              {/* Dica das variáveis padronizadas */}
              <div className="p-3 bg-[#1B1D1E] rounded-lg border border-[#2A2D2F] text-xs text-gray-400 space-y-1">
                <p className="font-semibold text-gray-300 flex items-center gap-1.5">
                  <span>💡</span> Como o Agente IA padronizará seu documento:
                </p>
                <p>
                  O robô detectará nomes de pessoas, CPFs, RGs, profissões, endereços e valores, convertendo-os automaticamente em variáveis dinâmicas como <code className="text-amber-400 font-mono">{'{{client_name}}'}</code>, <code className="text-amber-400 font-mono">{'{{cpf}}'}</code>, <code className="text-amber-400 font-mono">{'{{municipality}}'}</code> e <code className="text-amber-400 font-mono">{'{{date}}'}</code>.
                </p>
              </div>
            </div>

            {/* Rodapé do Modal com Ações */}
            <div className="p-4 border-t border-[#2A2D2F] bg-[#1E2022] flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                disabled={aiLoading}
                className="px-4 py-2 bg-[#2A2D2F] hover:bg-[#34383B] text-gray-300 rounded-lg text-xs font-semibold transition disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleExtractWithAi}
                disabled={aiLoading}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black rounded-lg text-sm transition shadow-lg flex items-center gap-2 disabled:opacity-50"
              >
                {aiLoading ? (
                  <>
                    <span className="animate-spin text-base">⏳</span>
                    <span>{aiProgressText || 'Processando com IA...'}</span>
                  </>
                ) : (
                  <>
                    <span>⚡ Analisar e Padronizar Documento</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FORMULÁRIO DE CRIAÇÃO / EDIÇÃO */}
      {showForm && (
        <div className="bg-[#181A1B] border-2 border-nc-yellow/40 rounded-xl p-5 shadow-2xl space-y-4 animate-fadeIn">
          <div className="flex justify-between items-center border-b border-[#2A2D2F] pb-3">
            <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2">
              <span>📄</span> {editingTemplate ? 'Editar Modelo' : 'Novo Modelo Padronizado'}
            </h3>
            <button
              onClick={() => {
                setShowForm(false);
                setEditingTemplate(null);
              }}
              className="text-gray-400 hover:text-gray-200 text-sm font-semibold"
            >
              ✕ Fechar
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="lg:col-span-2">
              <label className="block text-xs font-semibold text-gray-300 mb-1">Nome do Template *</label>
              <input
                type="text"
                placeholder="Ex: Contrato de Honorários - Êxito 30%"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 bg-[#1B1D1E] border border-[#2A2D2F] rounded text-sm text-gray-100 focus:outline-none focus:border-nc-yellow"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Área Jurídica</label>
              <select
                value={formData.legal_area}
                onChange={(e) => setFormData({ ...formData, legal_area: e.target.value })}
                className="w-full px-3 py-2 bg-[#1B1D1E] border border-[#2A2D2F] rounded text-sm text-gray-200 focus:outline-none focus:border-nc-yellow"
              >
                {LEGAL_AREAS.map(area => (
                  <option key={area} value={area}>{area}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">Tipo de Documento</label>
              <select
                value={formData.case_type}
                onChange={(e) => setFormData({ ...formData, case_type: e.target.value })}
                className="w-full px-3 py-2 bg-[#1B1D1E] border border-[#2A2D2F] rounded text-sm text-gray-200 focus:outline-none focus:border-nc-yellow"
              >
                {CASE_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Descrição Breve</label>
            <input
              type="text"
              placeholder="Ex: Cláusula de êxito com honorários de sucumbência e rescisão antecipada."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 bg-[#1B1D1E] border border-[#2A2D2F] rounded text-sm text-gray-100 focus:outline-none focus:border-nc-yellow"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-xs font-semibold text-gray-300">
                Texto do Template (com variáveis dinâmicas {'{{...}}'}) *
              </label>
              <span className="text-[11px] text-gray-400">
                Variáveis disponíveis: client_name, cpf, rg, rg_expeditor, marital_status, profession, birth_date, mother_name, father_name, address, municipality, state, cep, case_summary, promovido, date, year
              </span>
            </div>
            <textarea
              value={formData.template_text}
              onChange={(e) => setFormData({ ...formData, template_text: e.target.value })}
              className="w-full p-3 bg-[#1B1D1E] border border-[#2A2D2F] rounded font-mono text-xs text-gray-200 focus:outline-none focus:border-nc-yellow leading-relaxed"
              rows={14}
              placeholder="Insira o texto padronizado com as variáveis..."
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setShowForm(false);
                setEditingTemplate(null);
              }}
              className="px-4 py-2 bg-[#1E2022] text-gray-300 border border-[#2A2D2F] rounded text-xs font-semibold hover:bg-[#2A2D2F] transition"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveTemplate}
              className="px-5 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded text-xs transition shadow-md"
            >
              ✓ Salvar Template
            </button>
          </div>
        </div>
      )}

      {/* LISTAGEM DE TEMPLATES */}
      {loading ? (
        <div className="text-center py-12 text-gray-500 space-y-2">
          <div className="animate-spin text-2xl">⏳</div>
          <p className="text-sm">Carregando modelos do escritório...</p>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="bg-[#181A1B] border border-[#2A2D2F] rounded-xl p-12 text-center text-gray-400 space-y-3">
          <span className="text-4xl">📂</span>
          <p className="text-base font-semibold text-gray-200">Nenhum modelo encontrado</p>
          <p className="text-xs text-gray-400 max-w-md mx-auto">
            {searchTerm
              ? 'Tente buscar com outros termos ou altere o filtro de área.'
              : 'Clique em "Extrair com IA" para subir um PDF/.DOCX ou em "Novo Manual" para cadastrar.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredTemplates.map(template => {
            const hasPlaceholders = Array.isArray(template.placeholders) && template.placeholders.length > 0;
            return (
              <div
                key={template.id}
                className="bg-[#181A1B] border border-[#2A2D2F] hover:border-gray-700 rounded-xl p-5 flex flex-col justify-between gap-4 transition shadow-md"
              >
                <div>
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div>
                      <h4 className="font-bold text-base text-gray-100 flex items-center gap-2">
                        <span>📄</span> {template.name}
                      </h4>
                      {template.description && (
                        <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                          {template.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    {template.legal_area && (
                      <span className="text-[11px] px-2 py-0.5 bg-blue-950/70 text-blue-300 border border-blue-800/60 rounded-md font-medium">
                        {template.legal_area}
                      </span>
                    )}
                    {template.case_type && (
                      <span className="text-[11px] px-2 py-0.5 bg-emerald-950/70 text-emerald-300 border border-emerald-800/60 rounded-md font-medium">
                        {template.case_type}
                      </span>
                    )}
                    {hasPlaceholders && (
                      <span className="text-[11px] px-2 py-0.5 bg-amber-950/50 text-amber-300 border border-amber-800/50 rounded-md font-mono">
                        {template.placeholders.length} variáveis
                      </span>
                    )}
                  </div>

                  <div className="bg-[#1B1D1E] p-3 rounded-lg border border-[#2A2D2F] text-xs font-mono text-gray-400 max-h-36 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {template.template_text.slice(0, 320)}...
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[#2A2D2F]">
                  <button
                    type="button"
                    onClick={() => handleCopyText(template.id, template.template_text)}
                    className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1 transition"
                  >
                    <span>{copiedId === template.id ? '✓ Copiado!' : '📋 Copiar Texto'}</span>
                  </button>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditTemplate(template)}
                      className="px-3 py-1 bg-blue-950/60 text-blue-300 border border-blue-800/60 rounded text-xs hover:bg-blue-900/60 transition"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(template.id)}
                      className="px-3 py-1 bg-red-950/40 text-red-300 border border-red-800/60 rounded text-xs hover:bg-red-900/60 transition"
                    >
                      Deletar
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
