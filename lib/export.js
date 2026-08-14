const MAX_RECORDS = 1000;

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function todayString() {
  return new Date().toISOString().split('T')[0];
}

function formatDate(date) {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('pt-BR');
}

function formatDateTime(date) {
  if (!date) return '-';
  return new Date(date).toLocaleString('pt-BR');
}

function sanitize(value) {
  if (value === null || value === undefined) return '-';
  return String(value);
}

function sanitizeSheetName(name) {
  return name
    .replace(/[:\\/?*\[\]]/g, '-')
    .trim()
    .slice(0, 31);
}

function headerFooter(doc, title, subtitle = '') {
  const pageWidth = doc.internal.pageSize.getWidth();
  const date = new Date().toLocaleString('pt-BR');
  doc.setFontSize(18);
  doc.text(title, 14, 22);
  if (subtitle) {
    doc.setFontSize(11);
    doc.text(subtitle, 14, 30);
  }
  doc.setFontSize(9);
  doc.text(`Gerado em: ${date} - Confidencial - Uso interno`, 14, doc.internal.pageSize.getHeight() - 10);
  doc.text('Neves & Costa Advocacia', pageWidth - 14, doc.internal.pageSize.getHeight() - 10, { align: 'right' });
}

// ============================================================================
// AGENDA
// ============================================================================

export async function exportAgendaPdf({ agenda, filters = {} }) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape' });

  const flat = [];
  Object.entries(agenda.by_day || {}).forEach(([date, items]) => {
    items.slice(0, MAX_RECORDS - flat.length).forEach((item) => {
      if (flat.length >= MAX_RECORDS) return;
      flat.push({ ...item, date });
    });
  });

  const filterText = ['legal_area', 'municipality', 'agency', 'priority']
    .filter((k) => filters[k])
    .map((k) => `${k}: ${filters[k]}`)
    .join(' | ') || 'Sem filtros';

  headerFooter(doc, 'Agenda Jurídica', `Filtros: ${filterText}`);

  autoTable(doc, {
    startY: 38,
    head: [['Data', 'Título', 'Tipo', 'Área', 'Município', 'Prioridade', 'Status']],
    body: flat.map((item) => [
      formatDate(item.date),
      sanitize(item.title),
      sanitize(item.event_type || item.item_type),
      sanitize(item.legal_area),
      sanitize(item.municipality),
      sanitize(item.priority),
      sanitize(item.status || '-')
    ]),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235] },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    foot: [['', '', '', '', '', '', `Total: ${flat.length} itens`]]
  });

  doc.save(`agenda_${todayString()}.pdf`);
}

export async function exportAgendaExcel({ agenda, filters = {} }) {
  const XLSX = await import('xlsx');
  const rows = [];
  Object.entries(agenda.by_day || {}).forEach(([date, items]) => {
    items.slice(0, MAX_RECORDS - rows.length).forEach((item) => {
      if (rows.length >= MAX_RECORDS) return;
      rows.push({
        Data: formatDate(date),
        Título: item.title,
        Tipo: item.event_type || item.item_type,
        Área: item.legal_area,
        Município: item.municipality,
        'Área Jurídica (filtro)': filters.legal_area || '-',
        Prioridade: item.priority,
        Status: item.status || '-',
        Responsável: item.assigned_user_name || '-'
      });
    });
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName('Agenda'));

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([new Uint8Array(buf)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  downloadBlob(blob, `agenda_${todayString()}.xlsx`);
}

// ============================================================================
// MÉTRICAS DE DEMANDA
// ============================================================================

export async function exportMetricsPdf({ summary, casesByArea, casesByType, casesByLocation, funnelData, timeSeriesData, filters = {} }) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'portrait' });

  const filterText = Object.entries(filters)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' | ') || 'Sem filtros';

  headerFooter(doc, 'Métricas de Demanda', `Filtros: ${filterText}`);

  let startY = 38;

  if (summary) {
    doc.setFontSize(12);
    doc.text('Resumo Executivo', 14, startY);
    startY += 8;
    doc.setFontSize(10);
    doc.text(`Total de casos: ${summary.total_cases || 0} | Áreas: ${summary.areas_count || 0} | Municípios: ${summary.municipalities_count || 0} | Órgãos: ${summary.agencies_count || 0}`, 14, startY);
    startY += 12;
  }

  const sections = [
    { title: 'Casos por Área Jurídica', data: casesByArea.slice(0, MAX_RECORDS), head: ['Área', 'Quantidade'], map: (i) => [i.area, i.count] },
    { title: 'Casos por Tipo', data: casesByType.slice(0, MAX_RECORDS), head: ['Tipo', 'Quantidade'], map: (i) => [i.type, i.count] },
    { title: 'Municípios/Órgãos', data: casesByLocation.slice(0, MAX_RECORDS), head: ['Município', 'Órgão', 'Casos', 'Área Predominante'], map: (i) => {
      const topArea = i.areas ? Object.entries(i.areas).sort((a, b) => b[1] - a[1])[0] : null;
      return [i.municipality || 'N/A', i.agency || 'N/A', i.count, topArea ? `${topArea[0]} (${topArea[1]})` : 'N/A'];
    } },
    { title: 'Funil de Conversão', data: funnelData.slice(0, MAX_RECORDS), head: ['Etapa', 'Contagem', 'Taxa (%)'], map: (i) => [i.label, i.count, i.conversionRate] },
    { title: 'Evolução Mensal', data: timeSeriesData.slice(0, MAX_RECORDS), head: ['Mês', 'Conversas', 'Casos', 'Encerrados'], map: (i) => [i.month, i.conversations, i.cases, i.closed] }
  ];

  for (const section of sections) {
    if (section.data.length === 0) continue;
    if (startY > 230) {
      doc.addPage();
      startY = 20;
    }
    doc.setFontSize(12);
    doc.text(section.title, 14, startY);
    startY += 8;
    autoTable(doc, {
      startY,
      head: [section.head],
      body: section.data.map(section.map),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235] },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { top: 20 }
    });
    startY = doc.lastAutoTable.finalY + 12;
  }

  doc.save(`metricas_demanda_${todayString()}.pdf`);
}

export async function exportMetricsExcel({ summary, casesByArea, casesByType, casesByLocation, funnelData, timeSeriesData }) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const addSheet = (name, rows) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(name));
  };

  if (summary) {
    addSheet('Resumo', [
      { Indicador: 'Total de Casos', Valor: summary.total_cases },
      { Indicador: 'Áreas Jurídicas', Valor: summary.areas_count },
      { Indicador: 'Municípios', Valor: summary.municipalities_count },
      { Indicador: 'Órgãos', Valor: summary.agencies_count }
    ]);
  }

  addSheet('Áreas', casesByArea.map((i) => ({ Área: i.area, Quantidade: i.count })));
  addSheet('Tipos de Caso', casesByType.map((i) => ({ Tipo: i.type, Quantidade: i.count })));
  addSheet('Municípios/Órgãos', casesByLocation.map((i) => {
    const topArea = i.areas ? Object.entries(i.areas).sort((a, b) => b[1] - a[1])[0] : null;
    return {
      Município: i.municipality || 'N/A',
      Órgão: i.agency || 'N/A',
      Casos: i.count,
      'Área Predominante': topArea ? `${topArea[0]} (${topArea[1]})` : 'N/A'
    };
  }));
  addSheet('Funil', funnelData.map((i) => ({ Etapa: i.label, Contagem: i.count, 'Taxa (%)': i.conversionRate })));
  addSheet('Evolução Mensal', timeSeriesData.map((i) => ({ Mês: i.month, Conversas: i.conversations, Casos: i.cases, Encerrados: i.closed })));

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([new Uint8Array(buf)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  downloadBlob(blob, `metricas_demanda_${todayString()}.xlsx`);
}

// ============================================================================
// FUNIL DE CONVERSÃO
// ============================================================================

export async function exportFunnelPdf({ metrics, conversions, filters = {} }) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'portrait' });

  const filterText = Object.entries(filters)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' | ') || 'Sem filtros';

  headerFooter(doc, 'Funil de Conversão', `Filtros: ${filterText}`);

  autoTable(doc, {
    startY: 38,
    head: [['Etapa', 'Total', 'Com Caso', 'Humano', 'Tempo Médio (dias)']],
    body: (metrics || []).slice(0, MAX_RECORDS).map((m) => [
      m.funnel_stage,
      m.total_count,
      m.with_case_count,
      m.human_mode_count,
      Number(m.avg_days_in_stage).toFixed(1)
    ]),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235] },
    alternateRowStyles: { fillColor: [249, 250, 251] }
  });

  const totalLeads = metrics?.reduce((sum, m) => sum + m.total_count, 0) || 0;
  const totalWithCase = metrics?.reduce((sum, m) => sum + m.with_case_count, 0) || 0;

  const finalY = doc.lastAutoTable.finalY + 12;
  doc.setFontSize(11);
  doc.text(`Taxa de conversão total: ${totalLeads > 0 ? ((totalWithCase / totalLeads) * 100).toFixed(1) : 0}%`, 14, finalY);

  if ((conversions || []).length > 0 && finalY < 220) {
    doc.setFontSize(12);
    doc.text('Taxa por Etapa', 14, finalY + 12);
    autoTable(doc, {
      startY: finalY + 18,
      head: [['Etapa', 'Conversas', 'Taxa do Total (%)', 'Queda da Anterior (%)']],
      body: conversions.slice(0, MAX_RECORDS).map((c) => [
        c.funnel_stage,
        c.count,
        c.conversion_from_first,
        c.drop_rate_from_previous ? Math.abs(c.drop_rate_from_previous).toFixed(1) : '-'
      ]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235] },
      alternateRowStyles: { fillColor: [249, 250, 251] }
    });
  }

  doc.save(`funil_conversao_${todayString()}.pdf`);
}

export async function exportFunnelExcel({ metrics, conversions }) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const totalLeads = metrics?.reduce((sum, m) => sum + m.total_count, 0) || 0;
  const totalWithCase = metrics?.reduce((sum, m) => sum + m.with_case_count, 0) || 0;
  const avgConversion = totalLeads > 0 ? ((totalWithCase / totalLeads) * 100).toFixed(1) : 0;

  const ws1 = XLSX.utils.json_to_sheet(metrics.map((m) => ({
    Etapa: m.funnel_stage,
    Total: m.total_count,
    'Com Caso': m.with_case_count,
    'Em Atendimento Humano': m.human_mode_count,
    'Tempo Médio (dias)': Number(m.avg_days_in_stage).toFixed(1)
  })));
  XLSX.utils.book_append_sheet(wb, ws1, sanitizeSheetName('Etapas'));

  const ws2 = XLSX.utils.json_to_sheet((conversions || []).map((c) => ({
    Etapa: c.funnel_stage,
    Conversas: c.count,
    'Taxa do Total (%)': c.conversion_from_first,
    'Queda da Anterior (%)': c.drop_rate_from_previous ? Math.abs(c.drop_rate_from_previous).toFixed(1) : '-'
  })));
  XLSX.utils.book_append_sheet(wb, ws2, sanitizeSheetName('Taxas'));

  const ws3 = XLSX.utils.json_to_sheet([
    { Indicador: 'Total de Leads', Valor: totalLeads },
    { Indicador: 'Com Caso Jurídico', Valor: totalWithCase },
    { Indicador: 'Taxa de Conversão Total (%)', Valor: avgConversion }
  ]);
  XLSX.utils.book_append_sheet(wb, ws3, sanitizeSheetName('Resumo'));

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([new Uint8Array(buf)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  downloadBlob(blob, `funil_conversao_${todayString()}.xlsx`);
}

// ============================================================================
// AUDITORIA
// ============================================================================

export async function exportAuditPdf({ auditLogs, filters = {} }) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape' });

  const filterText = Object.entries(filters)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' | ') || 'Sem filtros';

  headerFooter(doc, 'Auditoria de Casos', `Filtros: ${filterText}`);

  autoTable(doc, {
    startY: 38,
    head: [['Data', 'Usuário', 'Ação', 'Entidade', 'De', 'Para', 'Detalhes']],
    body: (auditLogs || []).slice(0, MAX_RECORDS).map((log) => [
      formatDateTime(log.created_at),
      sanitize(log.users?.name || 'Sistema'),
      sanitize(log.action).replace(/_/g, ' ').toUpperCase(),
      `${sanitize(log.entity_type)} ${sanitize(log.entity_id)}`,
      sanitize(log.old_value),
      sanitize(log.new_value),
      sanitize(log.details)
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235] },
    alternateRowStyles: { fillColor: [249, 250, 251] }
  });

  doc.save(`auditoria_casos_${todayString()}.pdf`);
}

export async function exportAuditExcel({ auditLogs }) {
  const XLSX = await import('xlsx');
  const rows = (auditLogs || []).slice(0, MAX_RECORDS).map((log) => ({
    Data: formatDateTime(log.created_at),
    Usuário: log.users?.name || 'Sistema',
    Ação: (log.action || '').replace(/_/g, ' ').toUpperCase(),
    Entidade: log.entity_type,
    'ID da Entidade': log.entity_id,
    'Valor Anterior': log.old_value,
    'Novo Valor': log.new_value,
    Detalhes: log.details,
    'IP/Ambiente': log.ip_address || '-'
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName('Auditoria'));

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([new Uint8Array(buf)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  downloadBlob(blob, `auditoria_casos_${todayString()}.xlsx`);
}

// ============================================================================
// LISTA DE CASOS
// ============================================================================

export async function exportCasesExcel(cases) {
  const XLSX = await import('xlsx');
  const rows = (cases || []).slice(0, MAX_RECORDS).map((c, idx) => ({
    Número: idx + 1,
    'Número Interno': c.id,
    Título: c.title,
    Cliente: c.client_name || '-',
    Área: c.legal_area,
    Tipo: c.case_type,
    Município: c.municipality,
    Órgão: c.agency,
    Status: c.status,
    Prioridade: c.priority,
    Responsável: c.assigned_user_name || '-',
    'Data de Criação': formatDate(c.created_at),
    'Data do Prazo': formatDate(c.deadline_date)
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName('Casos'));

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([new Uint8Array(buf)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  downloadBlob(blob, `casos_${todayString()}.xlsx`);
}
