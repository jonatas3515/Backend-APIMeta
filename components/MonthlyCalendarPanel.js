import { useEffect, useMemo, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { supabase } from '../lib/supabaseClient';
import { safeError } from '../lib/safeLogger';
import AgendaPanel from './AgendaPanel';

const FERIADOS = {
  '01-01': 'Confraternização Universal',
  '04-21': 'Tiradentes',
  '05-01': 'Dia do Trabalhador',
  '09-07': 'Independência do Brasil',
  '10-12': 'Nossa Senhora Aparecida',
  '11-02': 'Finados',
  '11-15': 'Proclamação da República',
  '11-20': 'Consciência Negra',
  '12-25': 'Natal'
};

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const WEEK_DAYS = ['DOM','SEG','TER','QUA','QUI','SEX','SÁB'];

const BIRTHDAY_DEFAULT = `Prezado(a) {nome},

Em nome de toda a equipe Neves & Costa Advocacia e Consultoria, gostaríamos de lhe desejar um *Feliz Aniversário!*
Que este novo ciclo que se inicia seja repleto de realizações, saúde, paz e muitas conquistas, tanto na vida pessoal quanto na profissional. É uma imensa honra contar com sua confiança e tê-lo(a) como parte da nossa trajetória.
Tenha um excelente dia ao lado de seus familiares e amigos.

Atenciosamente,

⚖️ Equipe Neves & Costa
📱 (73) 99934-8552
🌐 www.nevesecosta.com.br`;

export function formatSalutationName(fullName) {
  if (!fullName || typeof fullName !== 'string') return 'Cliente';
  const rawWords = fullName.trim().split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) return 'Cliente';

  const toTitleCase = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  };

  const words = rawWords.map(toTitleCase);
  if (words.length === 1) return words[0];

  const firstNormalized = words[0]
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Prefixos comuns no Brasil que formam nomes compostos (ex.: João Pedro, João Lucas, Antonio Miguel, Ana Maria)
  const compoundStarters = new Set([
    'joao', 'jose', 'ana', 'maria', 'antonio', 'pedro',
    'luiz', 'luis', 'carlos', 'vitor', 'victor', 'paulo',
    'marcos', 'davi', 'david', 'lucas', 'arthur', 'artur', 'enzo'
  ]);

  const prepositions = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

  if (compoundStarters.has(firstNormalized) && words.length > 1) {
    const secondLower = words[1].toLowerCase();
    if (!prepositions.has(secondLower)) {
      return `${words[0]} ${words[1]}`;
    }
  }

  return words[0];
}

export function getWhatsAppSendUrl(phone, text) {
  const cleanPhone = (phone || '').replace(/\D/g, '');
  const encoded = encodeURIComponent(text);
  // No mobile, api.whatsapp.com dispara o app nativo diretamente.
  // No desktop, web.whatsapp.com evita o redirecionador do wa.me que corrompe emojis UTF-8 em .
  if (typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`;
  }
  return `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`;
}

export default function MonthlyCalendarPanel({ initialView = 'unificado' }) {
  // Modo de exibição: 'unificado' (ambos na mesma tela), 'calendar' (só grade), 'agenda' (só lista)
  const [viewMode, setViewMode] = useState(() => {
    if (initialView === 'agenda') return 'agenda';
    if (initialView === 'calendar') return 'calendar';
    return 'unificado';
  });

  const [cursor, setCursor] = useState(() => new Date());
  const [cases, setCases] = useState([]);
  const [birthdays, setBirthdays] = useState([]);
  const [birthdayTemplate, setBirthdayTemplate] = useState(BIRTHDAY_DEFAULT);
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      apiJson('/api/cases'),
      apiJson('/api/conversations').catch(() => []),
      apiJson('/api/office/current').catch(() => null)
    ]).then(([casesR, convsR, officeR]) => {
      if (!mounted) return;
      if (casesR.status === 'fulfilled') setCases(casesR.value || []);
      const convList = convsR.status === 'fulfilled' && Array.isArray(convsR.value) ? convsR.value : [];
      const convBdays = convList
        .filter((c) => Boolean(c.birth_or_foundation_date))
        .map((c) => ({ ...c, phone: c.client_phone || c.phone }));
      const allBdays = convBdays;
      const seen = new Set();
      const uniqueBdays = [];
      for (const b of allBdays) {
        const normPhone = (b.phone || b.client_phone || '').replace(/\D/g, '');
        const normName = (b.client_name || b.name || '').trim().toLowerCase();
        const dateKey = (b.birth_or_foundation_date || '').slice(0, 10);
        const uniqueKey = normPhone ? `${normPhone}_${dateKey}` : `${normName}_${dateKey}`;
        if (!uniqueKey || seen.has(uniqueKey)) continue;
        seen.add(uniqueKey);
        uniqueBdays.push(b);
      }
      setBirthdays(uniqueBdays);
      const officeData = officeR.status === 'fulfilled' ? (officeR.value?.data || officeR.value) : null;
      if (officeData) {
        const tpl = officeData.birthday_message || officeData.birthday_message_template;
        if (tpl) setBirthdayTemplate(tpl);
      }
      [casesR, convsR, officeR].filter((r) => r.status === 'rejected')
        .forEach((r) => safeError('calendar_load_error', r.reason, { component: 'MonthlyCalendarPanel' }));
    });
    return () => { mounted = false; };
  }, []);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  // Função para interpretar datas sem perder o dia por causa do fuso horário UTC-3
  const parseLocalDate = (dateStr) => {
    if (!dateStr) return null;
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
      return new Date(y, m - 1, d, 12, 0, 0);
    }
    return new Date(dateStr);
  };

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid = [];
    for (let i = 0; i < startOffset; i++) grid.push(null);
    for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(year, month, d));
    return grid;
  }, [year, month]);

  const deadlinesByDay = useMemo(() => {
    const map = {};
    cases.forEach((c) => {
      if (!c.deadline_date || c.status === 'encerrado' || c.status === 'arquivado') return;
      const d = parseLocalDate(c.deadline_date);
      if (!d || isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      (map[key] = map[key] || []).push(c);
    });
    return map;
  }, [cases]);

  const birthdaysByDay = useMemo(() => {
    const map = {};
    birthdays.forEach((b) => {
      if (!b.birth_or_foundation_date) return;
      try {
        const parts = b.birth_or_foundation_date.split('-');
        if (parts.length >= 3) {
          const m = parseInt(parts[1], 10) - 1;
          const day = parseInt(parts[2].slice(0, 2), 10);
          const key = `${m}-${day}`;
          (map[key] = map[key] || []).push(b);
        }
      } catch (_) {}
    });
    return map;
  }, [birthdays]);

  const prev = () => setCursor(new Date(year, month - 1, 1));
  const next = () => setCursor(new Date(year, month + 1, 1));
  const goToday = () => {
    const now = new Date();
    setCursor(now);
    setSelectedDay(now);
  };

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const selectedKey = `${selectedDay.getFullYear()}-${selectedDay.getMonth()}-${selectedDay.getDate()}`;
  const selectedBdayKey = `${selectedDay.getMonth()}-${selectedDay.getDate()}`;

  const selectedDeadlines = deadlinesByDay[selectedKey] || [];
  const selectedBirthdays = birthdaysByDay[selectedBdayKey] || [];

  const monthFeriados = useMemo(() => {
    const list = [];
    Object.entries(FERIADOS).forEach(([mmdd, name]) => {
      const [m, d] = mmdd.split('-').map(Number);
      if (m - 1 === month) {
        list.push({ day: d, name });
      }
    });
    return list.sort((a, b) => a.day - b.day);
  }, [month]);

  const handleMarcarCumprido = async (caseItem) => {
    // 1. Limpa o prazo no estado local sem encerrar o caso!
    setCases((prev) => prev.map((c) => (c.id === caseItem.id ? { ...c, deadline_date: null, deadline_type: null } : c)));
    setFeedbackMsg(`✓ Audiência/prazo de "${caseItem.title}" marcado como cumprido! O processo permanece ativo.`);
    setTimeout(() => setFeedbackMsg(null), 4000);
    try {
      // 2. No banco de dados, limpa apenas a data do prazo para que o processo permaneça em andamento
      await supabase
        .from('cases')
        .update({ deadline_date: null, deadline_type: null, updated_at: new Date().toISOString() })
        .eq('id', caseItem.id);

      // 3. Sincroniza e marca como concluída qualquer tarefa pendente vinculada a este caso
      await supabase
        .from('tasks')
        .update({ status: 'concluida', done: true, updated_at: new Date().toISOString() })
        .eq('case_id', caseItem.id)
        .eq('status', 'pendente');
    } catch (e) {
      safeError('calendar_cumprir_error', e, { component: 'MonthlyCalendarPanel' });
    }
  };

  return (
    <div className="p-4 md:p-6 bg-[#181A1B] text-gray-100 min-h-full" data-testid="monthly-calendar-panel">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Unificado & Seletor de Modo */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-800">
          <div>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2 text-white">
              <span>🗓️</span> Calendário & Agenda de Prazos
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Visualização integrada da grade mensal, aniversariantes do escritório e prazos da agenda detalhada
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-[#1B1D1E] p-1 rounded-xl border border-gray-800 text-xs">
            <button
              onClick={() => setViewMode('unificado')}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                viewMode === 'unificado'
                  ? 'bg-nc-yellow text-nc-black shadow-sm'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/40'
              }`}
              title="Exibe o calendário mensal em cima e a lista da agenda logo abaixo"
            >
              <span>🌟</span> Visão Unificada
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                viewMode === 'calendar'
                  ? 'bg-nc-yellow text-nc-black shadow-sm'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/40'
              }`}
            >
              <span>🗓️</span> Grade Mensal
            </button>
            <button
              onClick={() => setViewMode('agenda')}
              className={`px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 ${
                viewMode === 'agenda'
                  ? 'bg-nc-yellow text-nc-black shadow-sm'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/40'
              }`}
            >
              <span>📋</span> Agenda & Prazos
            </button>
          </div>
        </div>

        {/* FEEDBACK DE AÇÃO */}
        {feedbackMsg && (
          <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm font-medium animate-fadeIn">
            ✓ {feedbackMsg}
          </div>
        )}

        {/* 1. SEÇÃO DO CALENDÁRIO MENSAL (exibido no modo unificado ou no modo calendar) */}
        {(viewMode === 'unificado' || viewMode === 'calendar') && (
          <section id="grade-mensal" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Grade mensal */}
              <div className="lg:col-span-3 bg-[#1B1D1E] rounded-xl border border-gray-800 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4 bg-[#1E2022] border-b border-gray-800 text-gray-100 rounded-t-lg -m-5 mb-5 px-5 py-3">
                  <h2 className="text-lg font-bold capitalize text-white flex items-center gap-2">
                    <span>📅</span> {MONTH_NAMES[month]} {year}
                  </h2>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setCursor(new Date(year - 1, month, 1))} className="px-2.5 py-1 rounded bg-[#181A1B] border border-gray-700 hover:bg-gray-800 text-gray-200 text-xs font-bold" title="Ano anterior">«</button>
                    <button onClick={prev} className="px-2.5 py-1 rounded bg-[#181A1B] border border-gray-700 hover:bg-gray-800 text-gray-200 text-xs font-bold" title="Mês anterior">‹</button>
                    <button onClick={goToday} className="px-2.5 py-1 rounded bg-nc-yellow text-nc-black hover:bg-yellow-400 text-xs font-bold shadow-sm">Hoje</button>
                    <button onClick={next} className="px-2.5 py-1 rounded bg-[#181A1B] border border-gray-700 hover:bg-gray-800 text-gray-200 text-xs font-bold" title="Próximo mês">›</button>
                    <button onClick={() => setCursor(new Date(year + 1, month, 1))} className="px-2.5 py-1 rounded bg-[#181A1B] border border-gray-700 hover:bg-gray-800 text-gray-200 text-xs font-bold" title="Próximo ano">»</button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold text-gray-400 mb-2 uppercase">
                  {WEEK_DAYS.map((d) => <div key={d}>{d}</div>)}
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {cells.map((day, idx) => {
                    if (!day) return <div key={`e-${idx}`} className="min-h-[85px] bg-gray-800/20 rounded-lg border border-transparent" />;
                    const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
                    const bdayKey = `${day.getMonth()}-${day.getDate()}`;
                    const feriado = FERIADOS[`${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`];
                    const dayCases = deadlinesByDay[key] || [];
                    const dayBdays = birthdaysByDay[bdayKey] || [];
                    const isToday = key === todayKey;
                    const isSelected = key === selectedKey;

                    return (
                      <div
                        key={key}
                        onClick={() => setSelectedDay(day)}
                        className={`min-h-[85px] p-1.5 rounded-lg border text-xs cursor-pointer transition-all ${
                          isSelected
                            ? 'border-yellow-500 bg-yellow-950/40 ring-1 ring-yellow-400'
                            : isToday
                            ? 'border-yellow-500/80 bg-yellow-950/20'
                            : feriado
                            ? 'border-red-900/50 bg-red-950/20'
                            : 'border-[#2A2D2F] bg-[#1E2022] hover:border-gray-700'
                        }`}
                        data-testid={isToday ? 'calendar-today' : undefined}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[11px] font-bold ${isToday ? 'text-yellow-400 font-extrabold' : feriado ? 'text-red-400 font-extrabold' : 'text-gray-300 font-bold'}`}>
                            {day.getDate()}
                          </span>
                          {dayBdays.length > 0 && (
                            <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/50 px-1 py-0.5 rounded border border-emerald-800/50">
                              ({dayBdays.length}) 🎂
                            </span>
                          )}
                        </div>

                        {feriado && (
                          <p className="text-[9px] text-red-400 font-semibold leading-tight line-clamp-1 mb-0.5" title={feriado}>
                            {feriado}
                          </p>
                        )}

                        {/* Chips do dia */}
                        <div className="space-y-0.5">
                          {dayCases.slice(0, 2).map((c) => (
                            <p
                              key={c.id}
                              className={`text-[9px] rounded px-1 truncate ${
                                Number(c.case_value) > 0
                                  ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/50'
                                  : 'bg-gray-800 text-gray-300 border border-gray-700'
                              }`}
                              title={c.title}
                            >
                              {Number(c.case_value) > 0 ? '💰' : '⏰'} {c.title}
                            </p>
                          ))}
                          {dayCases.length > 2 && (
                            <p className="text-[8px] text-gray-500 text-center font-medium">+{dayCases.length - 2} mais</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Feriados do mês */}
                {monthFeriados.length > 0 && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <h4 className="text-xs font-bold text-red-800 mb-1 flex items-center gap-1">
                      <span>🇧🇷</span> Feriados Nacionais do Mês
                    </h4>
                    <ul className="text-[11px] text-red-700 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1">
                      {monthFeriados.map((f) => (
                        <li key={f.day} className="flex items-center gap-1.5">
                          <span className="font-bold text-red-800">{f.day}:</span> {f.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Painel lateral: Agenda do dia selecionado */}
              <div className="space-y-4">
                {/* Aniversariantes */}
                <div className="bg-[#1B1D1E] border border-gray-800 rounded-xl shadow-sm p-4">
                  <h3 className="font-bold text-sm text-white mb-3 flex items-center gap-2">
                    <span>🎂</span> Aniversariantes - {selectedDay.toLocaleDateString('pt-BR')}
                  </h3>
                  {selectedBirthdays.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-3">Nenhum aniversariante neste dia.</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {selectedBirthdays.map((b) => {
                        const phone = (b.phone || '').replace(/\D/g, '');
                        const salutationName = formatSalutationName(b.client_name);
                        const formattedText = (birthdayTemplate || BIRTHDAY_DEFAULT)
                          .replace(/\{nome\}/g, salutationName)
                          .replace(/\{escritorio\}/g, 'Neves & Costa Advocacia');
                        const waUrl = getWhatsAppSendUrl(phone, formattedText);
                        return (
                          <li key={b.id} className="text-xs text-gray-200 bg-[#1E2022] p-2.5 rounded-lg border border-[#2A2D2F] space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-white">{b.client_name || 'Cliente'}</span>
                              <span className="text-[10px] text-amber-400 font-bold bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/50">🎂 Aniversário</span>
                            </div>
                            {phone && (
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full text-center block text-[11px] px-2.5 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition shadow-sm"
                                data-testid={`whatsapp-btn-${b.id}`}
                              >
                                Enviar Parabéns via WhatsApp
                              </a>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Prazos do dia selecionado */}
                <div className="bg-[#1B1D1E] border border-gray-800 rounded-xl shadow-sm p-4">
                  <h3 className="font-bold text-sm text-white mb-3 flex items-center gap-2">
                    <span>⏰</span> Prazos de {selectedDay.toLocaleDateString('pt-BR')}
                  </h3>
                  {selectedDeadlines.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-3">Nenhum prazo neste dia.</p>
                  ) : (
                    <ul className="space-y-2">
                      {selectedDeadlines.map((c) => (
                        <li key={c.id} className="text-xs text-gray-200 bg-[#1E2022] p-2.5 rounded-lg border border-[#2A2D2F] flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-white">{c.title}</p>
                            {c.client_name && <p className="text-[11px] text-gray-400">Cliente: {c.client_name}</p>}
                            {Number(c.case_value) > 0 && (
                              <p className="text-[11px] font-bold text-emerald-400 mt-0.5">
                                💰 {Number(c.case_value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => handleMarcarCumprido(c)}
                            className="text-[10px] px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold whitespace-nowrap shadow-sm"
                            title="Marcar como cumprido"
                          >
                            ✓ Cumprir
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 2. SEÇÃO DA AGENDA & PRAZOS (exibido no modo unificado ou no modo agenda) */}
        {(viewMode === 'unificado' || viewMode === 'agenda') && (
          <section id="agenda-prazos" className="pt-2">
            {viewMode === 'unificado' && (
              <div className="flex items-center gap-3 mb-4 pt-2">
                <div className="h-px bg-gray-800 flex-1" />
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <span>📋</span> Detalhamento da Agenda & Prazos
                </span>
                <div className="h-px bg-gray-800 flex-1" />
              </div>
            )}
            <div className="bg-[#1B1D1E] rounded-xl border border-gray-800 shadow-sm p-2 overflow-hidden">
              <AgendaPanel />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
