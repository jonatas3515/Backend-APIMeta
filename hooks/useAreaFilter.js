import { useContext } from 'react';
import AreaFilterContext from '../contexts/AreaFilterContext';

const noop = () => {};

export default function useAreaFilter() {
  const context = useContext(AreaFilterContext);
  if (!context) {
    console.warn('[useAreaFilter] Fora do provider, retornando fallback');
    return {
      selectedArea: '',
      setSelectedArea: noop,
      clearArea: noop,
      isActive: false,
      loading: false
    };
  }
  return {
    selectedArea: context.selectedArea ?? '',
    setSelectedArea: context.setSelectedArea ?? noop,
    clearArea: context.clearArea ?? noop,
    isActive: context.isActive ?? false,
    loading: context.loading ?? false
  };
}
