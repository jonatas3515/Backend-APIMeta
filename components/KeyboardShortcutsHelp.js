import { useEffect, useRef } from 'react';

const CATEGORIES = [
  {
    title: 'Globais',
    shortcuts: [
      { keys: ['N'], description: 'Criar novo caso' },
      { keys: ['C'], description: 'Nova conversa' },
      { keys: ['A'], description: 'Abrir agenda' },
      { keys: ['T'], description: 'Buscar template' },
      { keys: ['D'], description: 'Abrir dashboard' },
      { keys: ['K'], description: 'Busca global' },
      { keys: ['?'], description: 'Abrir ajuda de atalhos' },
    ],
  },
  {
    title: 'Chat',
    shortcuts: [
      { keys: ['Enter'], description: 'Enviar mensagem' },
      { keys: ['Esc'], description: 'Fechar painel/chat' },
      { keys: ['M'], description: 'Marcar mensagens como lidas' },
    ],
  },
  {
    title: 'Casos',
    shortcuts: [
      { keys: ['E'], description: 'Editar caso selecionado' },
      { keys: ['Delete'], description: 'Excluir caso selecionado (com confirmação)' },
    ],
  },
  {
    title: 'Agenda',
    shortcuts: [
      { keys: ['H'], description: 'Ir para hoje' },
      { keys: ['7'], description: 'Próximos 7 dias' },
      { keys: ['3', '0'], description: 'Próximos 30 dias' },
    ],
  },
];

function KeyBadge({ children }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-1 bg-[#1E2022] border border-[#2A2D2F] rounded text-xs font-semibold text-gray-100 shadow-sm">
      {children}
    </span>
  );
}

export default function KeyboardShortcutsHelp({ open, onClose }) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    if (modalRef.current) {
      modalRef.current.focus();
    }
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-nc-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="w-[92%] max-w-2xl max-h-[85vh] overflow-y-auto bg-[#1B1D1E] rounded-nc shadow-card border border-[#2A2D2F] p-6 outline-none"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">⌨️ Atalhos de Teclado</h2>
          <button
            onClick={onClose}
            className="text-2xl text-gray-400 hover:text-gray-100 transition"
            title="Fechar (Esc)"
          >
            ×
          </button>
        </div>

        <p className="text-sm text-gray-400 mb-6">
          Os atalhos não são acionados enquanto você digita em campos de formulário.
          Você pode usar letras maiúsculas ou minúsculas.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {CATEGORIES.map((category) => (
            <div key={category.title}>
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-400 mb-3">
                {category.title}
              </h3>
              <div className="space-y-3">
                {category.shortcuts.map((shortcut) => (
                  <div key={shortcut.description} className="flex items-center gap-3">
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {shortcut.keys.map((k, i) => (
                        <span key={i} className="flex gap-1">
                          <KeyBadge>{k}</KeyBadge>
                        </span>
                      ))}
                    </div>
                    <span className="text-sm text-gray-100">{shortcut.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-gray-800 flex justify-between items-center text-xs text-gray-400">
          <span>Pressione <KeyBadge>?</KeyBadge> para abrir este modal a qualquer momento</span>
          <span>Esc ou clique fora para fechar</span>
        </div>
      </div>
    </div>
  );
}
