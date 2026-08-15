import { useContext } from 'react';
import AreaFilterContext from '../contexts/AreaFilterContext';

export default function useAreaFilter() {
  const context = useContext(AreaFilterContext);
  if (!context) {
    throw new Error('useAreaFilter deve ser usado dentro de AreaFilterProvider');
  }
  return context;
}
