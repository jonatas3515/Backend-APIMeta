import { createContext, useState, useEffect, useCallback } from 'react';

const AreaFilterContext = createContext();

export function AreaFilterProvider({ children, initialArea = '', onChange }) {
  const [selectedArea, setSelectedArea] = useState('');
  const [loading, setLoading] = useState(true);

  // Inicializa a partir do localStorage ou valor padrão
  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('nc_global_legal_area') : null;
      if (stored) {
        setSelectedArea(stored);
      } else if (initialArea) {
        setSelectedArea(initialArea);
      }
    } finally {
      setLoading(false);
    }
  }, [initialArea]);

  const changeArea = useCallback((area) => {
    const value = area || '';
    setSelectedArea(value);
    try {
      if (typeof window !== 'undefined') {
        if (value) {
          localStorage.setItem('nc_global_legal_area', value);
        } else {
          localStorage.removeItem('nc_global_legal_area');
        }
      }
    } catch (e) {
      console.warn('[AREA-FILTER] Erro ao salvar no localStorage:', e);
    }
    if (onChange) onChange(value);
  }, [onChange]);

  const clearArea = useCallback(() => {
    changeArea('');
  }, [changeArea]);

  return (
    <AreaFilterContext.Provider
      value={{
        selectedArea,
        setSelectedArea: changeArea,
        clearArea,
        isActive: !!selectedArea,
        loading
      }}
    >
      {children}
    </AreaFilterContext.Provider>
  );
}

export default AreaFilterContext;
