import { createContext, useState, useEffect, useCallback } from 'react';
import { normalizeLegalArea, LEGAL_AREAS } from '../lib/legalAreas';

const AreaFilterContext = createContext();

const STORAGE_KEY = 'nc_global_legal_area_v2';
const LEGACY_STORAGE_KEY = 'nc_global_legal_area';

function getValidArea(value) {
  const normalized = normalizeLegalArea(value);
  if (normalized === '') return '';
  const valid = LEGAL_AREAS.find((a) => a.value === normalized);
  return valid ? valid.value : '';
}

export function AreaFilterProvider({ children, initialArea = '', onChange }) {
  const [selectedArea, setSelectedArea] = useState('');
  const [loading, setLoading] = useState(true);

  // Inicializa a partir do localStorage (novo ou legado) ou valor padrão
  useEffect(() => {
    try {
      let stored = null;
      if (typeof window !== 'undefined') {
        stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
          const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacy) {
            stored = legacy;
            localStorage.removeItem(LEGACY_STORAGE_KEY);
          }
        }
      }

      const validArea = stored ? getValidArea(stored) : getValidArea(initialArea);
      setSelectedArea(validArea);

      if (validArea && typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, validArea);
      }
    } finally {
      setLoading(false);
    }
  }, [initialArea]);

  const changeArea = useCallback((area) => {
    const value = getValidArea(area);
    setSelectedArea(value);
    try {
      if (typeof window !== 'undefined') {
        if (value) {
          localStorage.setItem(STORAGE_KEY, value);
        } else {
          localStorage.removeItem(STORAGE_KEY);
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
