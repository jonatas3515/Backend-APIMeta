import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import FeeServiceAdmin from '../../components/FeeServiceAdmin';
import { getAuthHeaders } from '../../lib/api';

export default function AdminFeeServices() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const check = async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/user', { headers });
        if (res.ok) {
          const data = await res.json();
          setUser(data);
          if (data.role !== 'admin') {
            router.push('/');
          }
        } else {
          router.push('/login');
        }
      } catch (err) {
        console.error('[ADMIN-FEE] Erro:', err);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };
    check();
  }, [router]);

  if (loading) return <p className="p-8 text-center text-gray-500">Carregando...</p>;
  if (!user || user.role !== 'admin') return null;

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-6xl mx-auto p-4">
        <FeeServiceAdmin />
      </div>
    </div>
  );
}
