import { useState } from 'react';
import DocumentTemplatesManager from './DocumentTemplatesManager';
import LegalRoutinesManager from './LegalRoutinesManager';

export default function ModelsAndRoutinesPanel({ userRole }) {
  const [activeView, setActiveView] = useState('templates');

  const canEdit = userRole === 'admin' || userRole === 'advogado';

  if (!canEdit) {
    return (
      <div className="p-6 bg-white rounded-lg shadow">
        <p className="text-gray-600">Você não tem permissão para acessar esta área.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-white rounded-lg shadow w-full h-full overflow-y-auto">
      <h2 className="text-2xl font-bold mb-4">📚 Modelos e Rotinas</h2>
      
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveView('templates')}
          className={`px-4 py-2 rounded font-medium ${
            activeView === 'templates'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          📄 Modelos de Documento
        </button>
        <button
          onClick={() => setActiveView('routines')}
          className={`px-4 py-2 rounded font-medium ${
            activeView === 'routines'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          🔄 Rotinas Jurídicas
        </button>
      </div>

      {activeView === 'templates' && <DocumentTemplatesManager />}
      {activeView === 'routines' && <LegalRoutinesManager />}
    </div>
  );
}
