export default function WhatsAppTemplateList({ templates, onDelete }) {
  if (!templates || templates.length === 0) {
    return <p className="text-sm text-nc-text-muted">Nenhum template cadastrado.</p>;
  }

  return (
    <div className="space-y-2">
      {templates.map(t => (
        <div key={t.id} className="border border-nc-gray-200 rounded p-3 bg-white text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-nc-text">{t.name}</p>
              <p className="text-xs text-nc-text-secondary">Categoria: {t.category}</p>
              <p className="text-xs text-nc-text-secondary truncate">{t.content}</p>
              <p className="text-xs text-nc-text-secondary">Variáveis: {(t.variables || []).join(', ')}</p>
            </div>
            <div className="text-right">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${
                t.status === 'approved'
                  ? 'bg-green-100 text-green-700 border-green-200'
                  : 'bg-gray-100 text-gray-600 border-gray-200'
              }`}>
                {t.status === 'approved' ? 'Aprovado' : 'Rascunho'}
              </span>
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(t.id)}
                  className="block mt-2 text-xs text-red-600 hover:text-red-800"
                  aria-label={`Excluir template ${t.name}`}
                >
                  Excluir
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
