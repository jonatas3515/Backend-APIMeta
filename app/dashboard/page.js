'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/useAuth';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';
import Head from 'next/head';
import Sidebar from '@/components/Sidebar';

const priorityColors = {
  alta: 'bg-red-100 text-red-800 border-red-200',
  media: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  baixa: 'bg-green-100 text-green-800 border-green-200',
};

function DashboardLoading() {
  return (
    <div className="min-h-screen bg-nc-surface p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="h-8 w-48 bg-nc-gray-200 rounded animate-pulse mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="nc-card p-5 min-h-[200px]">
              <div className="h-6 w-32 bg-nc-gray-200 rounded animate-pulse mb-4" />
              <div className="space-y-3">
                <div className="h-4 w-full bg-nc-gray-100 rounded animate-pulse" />
                <div className="h-4 w-5/6 bg-nc-gray-100 rounded animate-pulse" />
                <div className="h-4 w-4/6 bg-nc-gray-100 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { authUser, profile, loading: authLoading } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (authLoading) return;
    if (!authUser) {
      setLoading(false);
      return;
    }

    fetchDashboard();
  }, [authUser, authLoading]);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError(null);

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const response = await fetch('/api/dashboard', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Erro ao carregar dashboard');
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('[DASHBOARD] Erro:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const completeTask = async (taskId) => {
    try {
      const { error } = await supabase
        .from('chat_reminders')
        .update({ status: 'completed' })
        .eq('id', taskId);

      if (error) throw error;

      fetchDashboard();
    } catch (err) {
      console.error('[DASHBOARD] Erro ao concluir tarefa:', err);
      alert('Erro ao concluir tarefa: ' + err.message);
    }
  };

  const formatDate = (date) => {
    if (!date) return '—';
    const d = new Date(date);
    return d.toLocaleDateString('pt-BR');
  };

  const formatDateTime = (date) => {
    if (!date) return '—';
    const d = new Date(date);
    return d.toLocaleString('pt-BR');
  };

  if (authLoading || loading) {
    return <DashboardLoading />;
  }

  if (!authUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-nc-surface">
        <div className="text-center">
          <p className="text-nc-text-secondary mb-4">Você precisa estar logado para acessar o dashboard.</p>
          <Link href="/" className="nc-btn-primary">
            Ir para o login
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-nc-surface p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="nc-card p-6 text-center">
            <h1 className="text-lg font-semibold text-red-600 mb-2">Erro ao carregar dashboard</h1>
            <p className="text-nc-text-secondary mb-4">{error}</p>
            <button onClick={fetchDashboard} className="nc-btn-primary">
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Dashboard - N&C Advocacia</title>
      </Head>
      <div className="flex flex-col md:flex-row h-screen bg-nc-surface overflow-hidden">
        <Sidebar activeTab="dashboard" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-nc-text-title">Visão do Dia</h1>
              <p className="text-sm text-nc-text-secondary mt-1">
                Olá, {profile?.name || 'Advogado'} · {new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
            <div className="mt-4 md:mt-0">
              <button onClick={fetchDashboard} className="nc-btn" title="Atualizar">
                ↻ Atualizar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {/* Métricas */}
            <div className="lg:col-span-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="nc-card p-4">
                  <p className="text-xs text-nc-text-secondary uppercase tracking-wide">Novos leads hoje</p>
                  <p className="text-2xl font-bold text-nc-text-title mt-1">{data.metrics.new_leads_today}</p>
                  <p className="text-xs text-nc-text-muted mt-1">{data.metrics.leads_comparison}</p>
                </div>
                <div className="nc-card p-4">
                  <p className="text-xs text-nc-text-secondary uppercase tracking-wide">Contratos fechados</p>
                  <p className="text-2xl font-bold text-nc-text-title mt-1">{data.metrics.contracts_today}</p>
                  <p className="text-xs text-nc-text-muted mt-1">{data.metrics.contracts_comparison}</p>
                </div>
                <div className="nc-card p-4">
                  <p className="text-xs text-nc-text-secondary uppercase tracking-wide">Casos ativos</p>
                  <p className="text-2xl font-bold text-nc-text-title mt-1">{data.metrics.active_cases}</p>
                </div>
                <div className="nc-card p-4">
                  <p className="text-xs text-nc-text-secondary uppercase tracking-wide">Prazos hoje</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">{data.metrics.due_today}</p>
                </div>
              </div>
            </div>

            {/* Próximos Prazos */}
            <div className="nc-card p-5 lg:col-span-2">
              <h2 className="text-lg font-semibold text-nc-text-title mb-4 flex items-center gap-2">
                <span>⏰</span> Próximos Prazos
              </h2>
              {data.next_deadlines?.length === 0 ? (
                <p className="text-sm text-nc-text-secondary">Nenhum prazo nos próximos 3 dias.</p>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {data.next_deadlines.map((item) => (
                    <Link 
                      key={item.id} 
                      href={`/cases?id=${item.case_id}`}
                      className="block p-3 rounded-nc border border-nc-gray-200 hover:border-nc-yellow transition bg-nc-white"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-nc-text text-sm">{item.title}</p>
                          <p className="text-xs text-nc-text-secondary mt-0.5">{item.legal_area || 'Geral'} · Vence em {formatDate(item.due_date)}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded border ${priorityColors[item.priority] || priorityColors.media}`}>
                          {item.priority}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Mensagens não lidas */}
            <div className="nc-card p-5">
              <h2 className="text-lg font-semibold text-nc-text-title mb-4 flex items-center gap-2">
                <span>💬</span> Não Lidas
                {data.unread_messages?.total > 0 && (
                  <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">{data.unread_messages.total}</span>
                )}
              </h2>
              {data.unread_messages?.conversations?.length === 0 ? (
                <p className="text-sm text-nc-text-secondary">Nenhuma mensagem não lida.</p>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {data.unread_messages.conversations.map((conv) => (
                    <Link 
                      key={conv.id} 
                      href={`/?conv=${conv.id}`}
                      className="block p-3 rounded-nc border border-nc-gray-200 hover:border-nc-yellow transition bg-nc-white"
                    >
                      <p className="font-medium text-nc-text text-sm">{conv.client_name || conv.client_phone}</p>
                      <p className="text-xs text-nc-text-secondary mt-0.5 truncate">{conv.last_message}</p>
                      <p className="text-xs text-nc-text-muted mt-1">{formatDateTime(conv.last_message_at)}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Casos Críticos */}
            <div className="nc-card p-5 lg:col-span-2">
              <h2 className="text-lg font-semibold text-nc-text-title mb-4 flex items-center gap-2">
                <span>🚨</span> Casos em Etapa Crítica
              </h2>
              {data.critical_cases?.length === 0 ? (
                <p className="text-sm text-nc-text-secondary">Nenhum caso parado na proposta há mais de 5 dias.</p>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {data.critical_cases.map((c) => (
                    <Link 
                      key={c.id} 
                      href={`/cases?id=${c.case_id}`}
                      className="block p-3 rounded-nc border border-nc-gray-200 hover:border-nc-yellow transition bg-nc-white"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-nc-text text-sm">{c.title}</p>
                          <p className="text-xs text-nc-text-secondary mt-0.5">
                            {c.client_name || 'Cliente'} · {c.legal_area || 'Geral'}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded">
                          {c.days_in_stage} dias
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Minhas Tarefas */}
            <div className="nc-card p-5">
              <h2 className="text-lg font-semibold text-nc-text-title mb-4 flex items-center gap-2">
                <span>✅</span> Minhas Tarefas
              </h2>
              {data.my_tasks?.length === 0 ? (
                <p className="text-sm text-nc-text-secondary">Nenhuma tarefa pendente.</p>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto">
                  {data.my_tasks.map((task) => (
                    <div 
                      key={task.id} 
                      className="p-3 rounded-nc border border-nc-gray-200 bg-nc-white"
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          onChange={() => completeTask(task.id)}
                          className="mt-1 w-4 h-4 accent-nc-yellow cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-nc-text text-sm">{task.title}</p>
                          {task.case_title && (
                            <p className="text-xs text-nc-text-secondary mt-0.5">Caso: {task.case_title}</p>
                          )}
                          <p className="text-xs text-nc-text-muted mt-1">
                            {formatDate(task.due_date)} · 
                            <span className={`ml-1 px-1.5 py-0.5 rounded text-xs border ${priorityColors[task.priority] || priorityColors.media}`}>
                              {task.priority}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          </div>
        </main>
      </div>
    </>
  );
}
