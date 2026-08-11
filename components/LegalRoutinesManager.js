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

const FUNNEL_STAGES = [
  'lead_novo',
  'intake_em_andamento',
  'intake_concluido',
  'proposta_enviada',
  'contrato_assinado',
  'acao_protocolada',
  'aguardando_decisao',
  'encerrado'
];

export default function LegalRoutinesManager() {
  const [routines, setRoutines] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    legal_area: '',
    case_type: '',
    funnel_stage: '',
    steps: [],
    documents_to_generate: [],
    reminders_to_create: []
  });

  useEffect(() => {
    fetchRoutines();
    fetchTemplates();
  }, []);

  const fetchRoutines = async () => {
    try {
      const { data, error } = await supabase
        .from('legal_routines')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRoutines(data || []);
    } catch (error) {
      console.error('[ROUTINES] Erro ao buscar:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('document_templates')
        .select('id, name, legal_area')
        .eq('is_active', true);

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('[ROUTINES] Erro ao buscar templates:', error);
    }
  };

  const handleSaveRoutine = async () => {
    if (!formData.name || !formData.legal_area) {
      alert('Nome e área jurídica são obrigatórios');
      return;
    }

    try {
      if (editingRoutine) {
        const { error } = await supabase
          .from('legal_routines')
          .update(formData)
          .eq('id', editingRoutine.id);

        if (error) throw error;
        console.log('[ROUTINES] Rotina atualizada');
      } else {
        const { error } = await supabase
          .from('legal_routines')
          .insert([formData]);

        if (error) throw error;
        console.log('[ROUTINES] Rotina criada');
      }

      setShowForm(false);
      setEditingRoutine(null);
      setFormData({
        name: '',
        description: '',
        legal_area: '',
        case_type: '',
        funnel_stage: '',
        steps: [],
        documents_to_generate: [],
        reminders_to_create: []
      });
      fetchRoutines();
    } catch (error) {
      console.error('[ROUTINES] Erro ao salvar:', error);
      alert('Erro ao salvar rotina');
    }
  };

  const handleEditRoutine = (routine) => {
    setEditingRoutine(routine);
    setFormData(routine);
    setShowForm(true);
  };

  const handleDeleteRoutine = async (id) => {
    if (!confirm('Tem certeza que deseja deletar esta rotina?')) return;

    try {
      const { error } = await supabase
        .from('legal_routines')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
      fetchRoutines();
    } catch (error) {
      console.error('[ROUTINES] Erro ao deletar:', error);
      alert('Erro ao deletar rotina');
    }
  };

  const addStep = () => {
    setFormData({
      ...formData,
      steps: [...formData.steps, { description: '', order: formData.steps.length + 1 }]
    });
  };

  const updateStep = (idx, description) => {
    const newSteps = [...formData.steps];
    newSteps[idx].description = description;
    setFormData({ ...formData, steps: newSteps });
  };

  const removeStep = (idx) => {
    setFormData({
      ...formData,
      steps: formData.steps.filter((_, i) => i !== idx)
    });
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">⚖️ Rotinas Jurídicas</h2>
        <button
          onClick={() => {
            setShowForm(true);
            setEditingRoutine(null);
            setFormData({
              name: '',
              description: '',
              legal_area: '',
              case_type: '',
              funnel_stage: '',
              steps: [],
              documents_to_generate: [],
              reminders_to_create: []
            });
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          + Nova Rotina
        </button>
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="mb-6 p-4 border rounded bg-gray-50">
          <h3 className="text-lg font-bold mb-4">{editingRoutine ? 'Editar Rotina' : 'Nova Rotina'}</h3>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <input
              type="text"
              placeholder="Nome da rotina"
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
              <option value="">Tipo de caso (opcional)</option>
              {CASE_TYPES.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <select
              value={formData.funnel_stage}
              onChange={(e) => setFormData({ ...formData, funnel_stage: e.target.value })}
              className="px-3 py-2 border rounded"
            >
              <option value="">Etapa do funil (opcional)</option>
              {FUNNEL_STAGES.map(stage => (
                <option key={stage} value={stage}>{stage}</option>
              ))}
            </select>
          </div>

          <textarea
            placeholder="Descrição da rotina"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 border rounded mb-4"
            rows="3"
          />

          <div className="mb-4">
            <h4 className="font-semibold mb-2">Passos da Rotina</h4>
            <div className="space-y-2 mb-2">
              {formData.steps.map((step, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    placeholder={`Passo ${idx + 1}`}
                    value={step.description}
                    onChange={(e) => updateStep(idx, e.target.value)}
                    className="flex-1 px-3 py-2 border rounded"
                  />
                  <button
                    onClick={() => removeStep(idx)}
                    className="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addStep}
              className="px-3 py-1 bg-gray-400 text-white rounded text-sm hover:bg-gray-500"
            >
              + Adicionar Passo
            </button>
          </div>

          <div className="mb-4">
            <h4 className="font-semibold mb-2">Templates de Documentos a Gerar</h4>
            <div className="space-y-2">
              {templates.map(template => (
                <label key={template.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.documents_to_generate.includes(template.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({
                          ...formData,
                          documents_to_generate: [...formData.documents_to_generate, template.id]
                        });
                      } else {
                        setFormData({
                          ...formData,
                          documents_to_generate: formData.documents_to_generate.filter(id => id !== template.id)
                        });
                      }
                    }}
                  />
                  <span className="text-sm">{template.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSaveRoutine}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Salvar
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setEditingRoutine(null);
              }}
              className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de Rotinas */}
      {loading ? (
        <p className="text-center text-gray-500">Carregando rotinas...</p>
      ) : routines.length === 0 ? (
        <p className="text-center text-gray-500">Nenhuma rotina encontrada</p>
      ) : (
        <div className="space-y-4">
          {routines.map(routine => (
            <div key={routine.id} className="p-4 border rounded-lg bg-gray-50">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h4 className="font-bold text-lg">{routine.name}</h4>
                  <p className="text-sm text-gray-600">{routine.description}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditRoutine(routine)}
                    className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDeleteRoutine(routine.id)}
                    className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                  >
                    Deletar
                  </button>
                </div>
              </div>

              <div className="flex gap-3 mb-3">
                {routine.legal_area && (
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                    {routine.legal_area}
                  </span>
                )}
                {routine.case_type && (
                  <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">
                    {routine.case_type}
                  </span>
                )}
                {routine.funnel_stage && (
                  <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded">
                    {routine.funnel_stage}
                  </span>
                )}
              </div>

              {routine.steps && routine.steps.length > 0 && (
                <div className="mb-3">
                  <p className="text-sm font-semibold">Passos:</p>
                  <ol className="text-sm text-gray-700 ml-4 list-decimal">
                    {routine.steps.map((step, idx) => (
                      <li key={idx}>{step.description}</li>
                    ))}
                  </ol>
                </div>
              )}

              {routine.documents_to_generate && routine.documents_to_generate.length > 0 && (
                <p className="text-sm text-gray-600">
                  📄 {routine.documents_to_generate.length} documento(s) a gerar
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
