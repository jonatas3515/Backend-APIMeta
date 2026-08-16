import FeeServiceAdmin from '../../components/FeeServiceAdmin';
import { useAuth } from '../../lib/useAuth';

export default function AdminFeeServices() {
  const { profile, loading } = useAuth();

  if (loading) {
    return <p className="p-8 text-center text-gray-500">Carregando...</p>;
  }

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-red-600 font-medium">Acesso negado. Apenas administradores.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-6xl mx-auto p-4">
        <FeeServiceAdmin />
      </div>
    </div>
  );
}
