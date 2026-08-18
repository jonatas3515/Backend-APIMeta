import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/useAuth';
import axios from 'axios';
import { getAuthHeaders } from '../lib/api';

const CATEGORIES = [
  { key: 'conversations', label: 'Conversas', icon: '💬' },
  { key: 'cases', label: 'Casos', icon: '⚖️' },
  { key: 'documents', label: 'Documentos', icon: '📄' },
  { key: 'insights', label: 'Insights', icon: '💡' }
];

const HISTORY_KEY = 'nc_global_search_history';

export default function GlobalSearch() {
  const { authUser } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [history, setHistory] = useState([]);
  const inputRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) {
        try {
          setHistory(JSON.parse(saved).slice(0, 5));
        } catch {
          setHistory([]);
        }
      }
    }
  }, []);

  const isMac = typeof navigator !== 'undefined' && navigator.platform?.toUpperCase().includes('MAC');
  const shortcut = isMac ? 'Cmd+K' : 'Ctrl+K';

  const performSearch = useCallback(async (term) => {
    if (!term.trim() || term.trim().length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const { data } = await axios.get(`/api/search?q=${encodeURIComponent(term)}`, { headers });
      setResults(data);
      setSelectedIndex(0);
    } catch (error) {
      console.error('[GLOBAL SEARCH] Erro na busca:', error);
      setResults({ conversations: [], cases: [], documents: [], insights: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, performSearch]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };

    const handleOpen = () => setOpen(true);
    window.addEventListener('nc:open-global-search', handleOpen);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('nc:open-global-search', handleOpen);
    };
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (!authUser) return null;

  const allItems = results
    ? [
        ...(results.conversations || []),
        ...(results.cases || []),
        ...(results.documents || []),
        ...(results.insights || [])
      ]
    : [];

  const handleSelect = (item) => {
    if (!item?.href) return;
    setOpen(false);
    saveToHistory(query);
    router.push(item.href);
  };

  const saveToHistory = (term) => {
    if (!term.trim()) return;
    const next = [term.trim(), ...history.filter(h => h !== term.trim())].slice(0, 5);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  };

  const handleKeyDown = (e) => {
    if (!allItems.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % allItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + allItems.length) % allItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = allItems[selectedIndex];
      if (item) {
        handleSelect(item);
      }
    }
  };

  const getCategoryIcon = (type, kind) => {
    if (type === 'conversation') return '💬';
    if (type === 'case') return '⚖️';
    if (type === 'insight') return '💡';
    if (type === 'document' && kind === 'routine') return '🔄';
    return '📄';
  };

  const getCategoryLabel = (type, kind) => {
    if (type === 'conversation') return 'Conversa';
    if (type === 'case') return 'Caso';
    if (type === 'insight') return 'Insight';
    if (type === 'document' && kind === 'routine') return 'Rotina';
    return 'Documento';
  };

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="fixed bottom-20 right-4 md:bottom-4 z-50 bg-nc-yellow text-nc-black p-3 rounded-full shadow-card hover:bg-nc-yellow-600 transition"
      title={`Busca global (${shortcut})`}
    >
      <span className="text-xl">🔍</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-24 bg-nc-black/60 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="w-[92%] max-w-2xl bg-nc-white rounded-nc shadow-card border border-nc-gray-300 overflow-hidden"
      >
        {/* Header do input */}
        <div className="relative border-b border-nc-gray-200">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-nc-text-muted text-lg">
            🔍
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar casos, conversas, documentos..."
            className="w-full pl-12 pr-24 py-4 text-nc-text bg-transparent outline-none placeholder-nc-text-muted text-base"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-nc-text-muted border border-nc-gray-300 rounded px-2 py-1 hidden sm:inline">
            {shortcut}
          </span>
        </div>

        {/* Área de resultados */}
        <div className="max-h-[70vh] overflow-y-auto p-2">
          {query.trim().length < 2 && history.length > 0 && !results && (
            <div className="p-2">
              <p className="text-xs font-semibold text-nc-text-secondary uppercase tracking-wide mb-2 px-2">
                Buscas recentes
              </p>
              {history.map((h, i) => (
                <button
                  key={i}
                  onClick={() => setQuery(h)}
                  className="w-full text-left px-3 py-2 rounded hover:bg-nc-gray-100 text-sm text-nc-text"
                >
                  🕒 {h}
                </button>
              ))}
            </div>
          )}

          {loading && (
            <div className="p-8 text-center text-nc-text-secondary text-sm">
              <span className="inline-block w-5 h-5 border-2 border-nc-yellow border-t-transparent rounded-full animate-spin mr-2" />
              Buscando...
            </div>
          )}

          {!loading && query.trim().length >= 2 && allItems.length === 0 && (
            <div className="p-8 text-center text-nc-text-secondary text-sm">
              Nenhum resultado encontrado
            </div>
          )}

          {!loading && results && allItems.length > 0 && (
            <div className="py-2">
              {CATEGORIES.map(category => {
                const items = results[category.key] || [];
                if (items.length === 0) return null;

                return (
                  <div key={category.key} className="mb-4">
                    <p className="text-xs font-semibold text-nc-text-secondary uppercase tracking-wide px-3 mb-1 flex items-center gap-1">
                      <span>{category.icon}</span>
                      {category.label}
                    </p>
                    {items.map((item, idx) => {
                      const globalIndex = allItems.indexOf(item);
                      const isSelected = globalIndex === selectedIndex;
                      return (
                        <button
                          key={item.id || idx}
                          onClick={() => handleSelect(item)}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
                          className={`w-full text-left px-3 py-2.5 rounded flex items-start gap-3 transition mx-1 ${
                            isSelected ? 'bg-nc-gray-100' : 'hover:bg-nc-gray-50'
                          }`}
                        >
                          <span className="text-lg mt-0.5">
                            {getCategoryIcon(item.type, item.kind)}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-nc-text-title truncate">
                              {item.title}
                            </p>
                            {item.subtitle && (
                              <p className="text-xs text-nc-text-secondary truncate">
                                {item.subtitle}
                              </p>
                            )}
                            {item.meta && (
                              <p className="text-[10px] text-nc-text-muted truncate mt-0.5">
                                {item.meta}
                              </p>
                            )}
                          </div>
                          <span className="text-[10px] text-nc-text-muted uppercase">
                            {getCategoryLabel(item.type, item.kind)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer com dicas */}
        <div className="border-t border-nc-gray-200 p-2 px-4 flex justify-between text-[10px] text-nc-text-muted bg-nc-gray-50">
          <span>↑↓ navegar</span>
          <span>Enter selecionar</span>
          <span>Esc fechar</span>
        </div>
      </div>
    </div>
  );
}
