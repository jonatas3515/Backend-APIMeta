import { useState } from 'react';
import DocumentTemplatesManager from './DocumentTemplatesManager';
import LegalRoutinesManager from './LegalRoutinesManager';

export default function ModelsAndRoutinesPanel({ userRole }) {
  const [activeView, setActiveView] = useState('templates');

  const canEdit = userRole === 'admin' || userRole === 'advogado';

  if (!canEdit) {
    return (
      <div className="p-6 bg-[#1B1D1E] rounded-lg shadow">
        <p className="text-sm text-red-600 font-medium">🚫 Acesso restrito</p>
        <p className="text-sm text-gray-400 mt-1">Esta função é restrita a administradores e advogados.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-[#1B1D1E] rounded-lg shadow w-full h-full overflow-y-auto">
      <h2 className="text-2xl font-bold mb-4">📚 Modelos e Rotinas</h2>
      
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveView('templates')}
          className={`px-4 py-2 rounded font-medium ${
            activeView === 'templates'
              ? 'bg-nc-yellow text-nc-black font-bold shadow-xs'
              : 'bg-[#1E2022] text-gray-300 border border-[#2A2D2F] hover:bg-[#2A2D2F]'
          }`}
        >
          📄 Modelos de Documento
        </button>
        <button
          onClick={() => setActiveView('routines')}
          className={`px-4 py-2 rounded font-medium ${
            activeView === 'routines'
              ? 'bg-nc-yellow text-nc-black font-bold shadow-xs'
              : 'bg-[#1E2022] text-gray-300 border border-[#2A2D2F] hover:bg-[#2A2D2F]'
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
