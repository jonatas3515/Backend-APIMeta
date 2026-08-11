import { useState, useEffect } from 'react';
import axios from 'axios';

export default function DocumentGenerator({ conversation }) {
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [formData, setFormData] = useState({});
  const [document, setDocument] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (selectedTemplate && templates.length > 0) {
      const template = templates.find(t => t.id === selectedTemplate);
      const initialData = {};
      template?.fields?.forEach(field => {
        initialData[field.field] = '';
      });
      setFormData(initialData);
      setDocument('');
    }
  }, [selectedTemplate, templates]);

  const fetchTemplates = async () => {
    try {
      const { data } = await axios.get('/api/documents');
      setTemplates(data.templates || []);
    } catch (error) {
      console.error('Erro ao buscar templates:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await axios.post('/api/documents', {
        templateId: selectedTemplate,
        data: formData
      });
      setDocument(data.document);
    } catch (error) {
      console.error('Erro ao gerar documento:', error);
      alert(error.response?.data?.error || 'Erro ao gerar documento');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(document);
    alert('Documento copiado!');
  };

  const selectedTemplateData = templates.find(t => t.id === selectedTemplate);

  const autoFill = () => {
    const filled = { ...formData };
    
    if (conversation.client_name) {
      filled.cliente_nome = conversation.client_name;
    }
    if (conversation.municipality) {
      filled.municipio = conversation.municipality;
    }
    if (conversation.state) {
      filled.estado = conversation.state;
    }
    if (conversation.organ) {
      filled.orgao = conversation.organ;
    }
    if (conversation.position) {
      filled.cargo = conversation.position;
    }
    if (conversation.assigned_to) {
      filled.advogado_nome = conversation.assigned_to;
    }
    if (conversation.case_type) {
      filled.objeto = conversation.case_type;
      filled.assunto = conversation.case_type;
    }
    
    setFormData(filled);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-gray-900">📄 Gerar Documento</h3>
        <button
          onClick={autoFill}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          ✨ Preencher do caso
        </button>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">Template</label>
        <select
          value={selectedTemplate}
          onChange={(e) => setSelectedTemplate(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Selecione um template...</option>
          {templates.map(template => (
            <option key={template.id} value={template.id}>{template.name}</option>
          ))}
        </select>
      </div>

      {selectedTemplateData && (
        <p className="text-xs text-gray-500">{selectedTemplateData.description}</p>
      )}

      {selectedTemplate && (
        <form onSubmit={handleSubmit} className="space-y-3">
          {selectedTemplateData?.fields?.map(field => (
            <div key={field.field}>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={formData[field.field] || ''}
                onChange={(e) => setFormData({ ...formData, [field.field]: e.target.value })}
                placeholder={field.label}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 disabled:bg-gray-300 transition"
          >
            {loading ? 'Gerando...' : '📄 Gerar Documento'}
          </button>
        </form>
      )}

      {document && (
        <div className="border-t border-gray-200 pt-3">
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-semibold text-sm text-gray-800">Documento Gerado</h4>
            <button
              onClick={handleCopy}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              📋 Copiar
            </button>
          </div>
          <pre className="bg-gray-50 p-3 rounded-lg text-xs text-gray-700 whitespace-pre-wrap max-h-80 overflow-y-auto font-mono">
            {document}
          </pre>
        </div>
      )}
    </div>
  );
}
