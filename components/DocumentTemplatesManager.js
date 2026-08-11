import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const LEGAL_AREAS = [
  'Direito Trabalhista',
  'Direito Previdenciário',
  'Direito Civil',
  'Direito do Consumidor',
  'Direito Administrativo'
];

const CASE_TYPES = [
  'Licença Prêmio',
  'Indenização',
  'Contrato',
  'Cobrança',
  'Mandado de Segurança',
  'Outro'
];

export default function DocumentTemplatesManager() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    legal_area: '',
    case_type: '',
    template_text: ''
  });

  useEffect(() => {
    fetchTemplates();
  }, []);

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

    try {
      if (editingTemplate) {
        const { error } = await supabase
          .from('document_templates')
          .update(formData)
          .eq('id', editingTemplate.id);

        if (error) throw error;
        console.log('[TEMPLATES] Template atualizado');
      } else {
        const { error } = await supabase
          .from('document_templates')
          .insert([formData]);

        if (error) throw error;
        console.log('[TEMPLATES] Template criado');
      }

      setShowForm(false);
      setEditingTemplate(null);
      setFormData({
        name: '',
        description: '',
        legal_area: '',
        case_type: '',
        template_text: ''
      });
      fetchTemplates();
    } catch (error) {
      console.error('[TEMPLATES] Erro ao salvar:', error);
      alert('Erro ao salvar template');
    }
  };

  const handleEditTemplate = (template) => {
    setEditingTemplate(template);
    setFormData(template);
    setShowForm(true);
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

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">📄 Templates de Documentos</h2>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingTemplate(null);
            setFormData({
              name: '',
              description: '',
              legal_area: '',
              case_type: '',
              template_text: ''
            });
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          + Novo Template
        </button>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="mb-6 p-4 border rounded bg-gray-50">
          <h3 className="text-lg font-bold mb-4">{editingTemplate ? 'Editar Template' : 'Novo Template'}</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <input
              type="text"
              placeholder="Nome do template"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="px-3 py-2 border rounded"
            />
            <select
              value={formData.legal_area}
              onChange={(e) => setFormData({ ...formData, legal_area: e.target.value })}
              className="px-3 py-2 border rounded"
            >
              <option value="">Selecione a área jurídica</option>
              {LEGAL_AREAS.map(area => (
                <option key={area} value={area}>{area}</option>
              ))}
            </select>
            <select
              value={formData.case_type}
              onChange={(e) => setFormData({ ...formData, case_type: e.target.value })}
              className="px-3 py-2 border rounded"
            >
              <option value="">Selecione o tipo de caso (opcional)</option>
              {CASE_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Descrição"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="px-3 py-2 border rounded"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-semibold mb-2">
              Texto do Template (use {'{{placeholder}}'} para dados dinâmicos)
            </label>
            <textarea
              value={formData.template_text}
              onChange={(e) => setFormData({ ...formData, template_text: e.target.value })}
              className="w-full px-3 py-2 border rounded font-mono text-sm"
              rows="12"
              placeholder="Exemplo: Requerimento de {{client_name}} para {{municipality}}"
            />
            <p className="text-xs text-gray-600 mt-2">
              Placeholders: client_name, client_phone, municipality, agency, client_role, case_type, case_summary, date, year
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSaveTemplate}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Salvar
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setEditingTemplate(null);
              }}
              className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de Templates */}
      {loading ? (
        <p className="text-center text-gray-500">Carregando templates...</p>
      ) : templates.length === 0 ? (
        <p className="text-center text-gray-500">Nenhum template encontrado</p>
      ) : (
        <div className="space-y-4">
          {templates.map(template => (
            <div key={template.id} className="p-4 border rounded-lg bg-gray-50">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-bold text-lg">{template.name}</h4>
                  <p className="text-sm text-gray-600">{template.description}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditTemplate(template)}
                    className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDeleteTemplate(template.id)}
                    className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                  >
                    Deletar
                  </button>
                </div>
              </div>

              <div className="flex gap-3 mb-2">
                {template.legal_area && (
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                    {template.legal_area}
                  </span>
                )}
                {template.case_type && (
                  <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">
                    {template.case_type}
                  </span>
                )}
              </div>

              <div className="bg-white p-3 rounded border border-gray-300 text-sm font-mono max-h-32 overflow-y-auto">
                {template.template_text.substring(0, 200)}...
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
