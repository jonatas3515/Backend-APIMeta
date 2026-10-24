import Head from 'next/head';
import Sidebar from '../components/Sidebar';
import ExecutiveDashboard from '../components/ExecutiveDashboard';
import Login from '../components/Login';
import { useAuth } from '../lib/useAuth';

export default function DashboardPage() {
  const { authUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-nc-surface">
        <p className="text-nc-text-muted">Carregando...</p>
      </div>
    );
  }

  if (!authUser) {
    return <Login />;
  }

  return (
    <>
      <Head>
        <title>Dashboard — N&C</title>
      </Head>
      <div className="flex h-screen bg-gray-100 overflow-hidden">
        <Sidebar activeTab="dashboard" />
        <main className="flex-1 overflow-y-auto">
          <ExecutiveDashboard />
        </main>
      </div>
    </>
  );
}
