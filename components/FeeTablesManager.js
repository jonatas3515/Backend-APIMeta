import { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { getAuthHeaders } from '../lib/api';
import { supabase } from '../lib/supabaseClient';
import { validatePreview } from '../lib/feeTableValidation';
const TABLE_TYPES = [
  { key: 'oab', label: 'Tabela da OAB' },
  { key: 'escritorio', label: 'Tabela do Escritório' }
];

export default function FeeTablesManager({ viewMode = null }) {
  const [tables, setTables] = useState({ oab: [], escritorio: [] });
  const [referenceItems, setReferenceItems] = useState([]);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [selectedType, setSelectedType] = useState('oab');
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [preview, setPreview] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [isPdf, setIsPdf] = useState(false);
  const [filters, setFilters] = useState({ legal_area: '', case_type: '', service: '' });
  const [previewValidation, setPreviewValidation] = useState(null);

  useEffect(() => {
    fetchTables();
    fetchReferenceItems();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchReferenceItems();
    }, 300);
    return () => clearTimeout(timer);
  }, [filters.legal_area, filters.case_type, filters.service]);

  const fetchReferenceItems = async () => {
    setReferenceLoading(true);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();
      if (filters.legal_area) params.set('legal_area', filters.legal_area);
      if (filters.case_type) params.set('case_type', filters.case_type);
      if (filters.service) params.set('service', filters.service);
      const { data } = await axios.get(`/api/fee-reference?${params.toString()}`, { headers });
      setReferenceItems(data || []);
    } catch (err) {
      console.error('[FEE-TABLES] Erro ao buscar referências:', err);
    } finally {
      setReferenceLoading(false);
    }
  };

  const fetchTables = async () => {
    try {
      const headers = await getAuthHeaders();
      const { data } = await axios.get('/api/fee-tables', { headers });
      const grouped = { oab: [], escritorio: [] };
      for (const item of data || []) {
        if (grouped[item.table_type]) grouped[item.table_type].push(item);
      }
      setTables(grouped);
    } catch (err) {
      console.error('[FEE-TABLES] Erro ao buscar tabelas:', err);
    }
  };

  const parseFile = (selectedFile) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          // Processa todas as abas/sheets do Excel e concatena
          let allRows = [];
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            allRows = allRows.concat(json);
          }
          resolve(allRows);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(selectedFile);
    });
  };

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    const isPdfFile = selectedFile.type === 'application/pdf' || selectedFile.name.toLowerCase().endsWith('.pdf');
    setIsPdf(isPdfFile);
    setMessage(null);
    setFile(selectedFile);
    if (!name) setName(selectedFile.name);

    if (isPdfFile) {
      setPreview([]);
      setPreviewValidation(null);
      setFile(null);
      setMessage({ type: 'error', text: 'PDFs não são suportados. Converta para Excel (.xlsx) ou CSV usando https://www.ilovepdf.com/pt/pdf_para_excel' });
      return;
    }

    try {
      const data = await parseFile(selectedFile);
      const parsedData = Array.isArray(data) ? data : [];
      setPreview(parsedData.slice(0, 10));
      const validation = validatePreview(parsedData);
      setPreviewValidation(validation);
      if (!validation.valid) {
        setMessage({ type: 'error', text: `Colunas ausentes: ${validation.missing.join(', ')}` });
      } else {
        setMessage({ type: 'success', text: `${validation.rowCount} linhas reconhecidas. Colunas: ${Object.entries(validation.recognized).filter(([, v]) => v).map(([k, v]) => `${k} (${v})`).join(', ')}` });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro ao ler o arquivo. Use CSV, Excel (.xlsx) ou PDF.' });
      setPreview([]);
      setPreviewValidation(null);
    }
  };

  const uploadPdf = async (pdfFile) => {
    const headers = await getAuthHeaders();
    const { data: signedData } = await axios.post('/api/upload-file', {
      fileName: pdfFile.name,
      fileType: pdfFile.type || 'application/pdf',
      conversationId: 'fee-tables'
    }, { headers });

    const uploadResponse = await fetch(signedData.signedUrl, {
      method: 'PUT',
      body: pdfFile,
      headers: {
        'Content-Type': pdfFile.type || 'application/pdf'
      }
    });

    if (!uploadResponse.ok) {
      throw new Error(`Erro no upload: ${uploadResponse.statusText}`);
    }

    const { data: urlData } = supabase.storage
      .from('chat-files')
      .getPublicUrl(signedData.filePath);

    return urlData.publicUrl;
  };

  const handleUpload = async () => {
    if (!file) {
      setMessage({ type: 'error', text: 'Selecione um arquivo primeiro.' });
      return;
    }
    if (!name.trim()) {
      setMessage({ type: 'error', text: 'Informe um nome para a tabela.' });
      return;
    }

    setUploading(true);
    setMessage(null);

    const headers = await getAuthHeaders();

    try {
      // PDF nao suportado - usuario deve converter para Excel/CSV
      const tableData = await parseFile(file);
      const validation = validatePreview(tableData);
      if (!validation.valid) {
        throw new Error(`Colunas ausentes: ${validation.missing.join(', ')}`);
      }

      await axios.post('/api/fee-tables', {
        name: name.trim(),
        table_type: selectedType,
        source_file_name: file.name,
        table_data: tableData
      }, { headers });

      setMessage({ type: 'success', text: 'Tabela salva com sucesso.' });
      setFile(null);
      setName('');
      setPreview([]);
      setIsPdf(false);
      fetchTables();
    } catch (err) {
      const raw = err.response?.data?.error || err.response?.data?.message || err.message || 'Erro ao salvar tabela';
      setMessage({ type: 'error', text: String(raw) });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Tem certeza que deseja remover esta tabela?')) return;
    try {
      const headers = await getAuthHeaders();
      await axios.delete(`/api/fee-tables?id=${id}`, { headers });
      fetchTables();
    } catch (err) {
      console.error('[FEE-TABLES] Erro ao remover:', err);
    }
  };

  const renderList = (type) => {
    const items = tables[type] || [];
    return (
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma tabela enviada.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="p-2 bg-white border rounded text-sm flex justify-between items-center">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-xs text-gray-500">
                  {item.source_file_name} • {item.file_url ? 'PDF' : `${Array.isArray(item.table_data) ? item.table_data.length : 0} linhas`} • {new Date(item.created_at).toLocaleDateString('pt-BR')}
                </p>
                {item.file_url && (
                  <a href={item.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs hover:underline">
                    Ver PDF
                  </a>
                )}
              </div>
              <button
                onClick={() => handleDelete(item.id)}
                className="text-red-600 text-xs hover:underline"
              >
                Remover
              </button>
            </div>
          ))
        )}
      </div>
    );
  };

  return (
    <div className="p-4 border rounded bg-white space-y-4">
      <h3 className="font-bold text-lg">📤 Tabelas de referência</h3>
      <p className="text-sm text-gray-600">
        Envie a tabela da OAB ou os valores cobrados pelo escritório. Os dados ficam salvos para consulta futura.
      </p>

      {message && (
        <div className={`p-3 rounded text-sm ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message.text}
        </div>
      )}

      <div className="space-y-3">
        <h4 className="font-semibold text-sm">🔍 Itens da Tabela da OAB</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            placeholder="Área jurídica"
            value={filters.legal_area}
            onChange={(e) => setFilters({ ...filters, legal_area: e.target.value })}
            className="border rounded p-2 text-sm"
          />
          <input
            placeholder="Tipo de caso"
            value={filters.case_type}
            onChange={(e) => setFilters({ ...filters, case_type: e.target.value })}
            className="border rounded p-2 text-sm"
          />
          <input
            placeholder="Serviço"
            value={filters.service}
            onChange={(e) => setFilters({ ...filters, service: e.target.value })}
            className="border rounded p-2 text-sm"
          />
        </div>

        <div className="border rounded bg-white p-2 overflow-x-auto">
          {referenceLoading ? (
            <p className="text-sm text-gray-500 p-2">Carregando referências...</p>
          ) : referenceItems.length === 0 ? (
            <p className="text-sm text-gray-500 p-2">Nenhum item encontrado na tabela da OAB.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-left">Área</th>
                  <th className="p-2 text-left">Tipo</th>
                  <th className="p-2 text-left">Serviço</th>
                  <th className="p-2 text-left">Mínimo</th>
                  <th className="p-2 text-left">Sugerido OAB</th>
                  <th className="p-2 text-left">Regional (70-80%)</th>
                  <th className="p-2 text-left">Máximo</th>
                </tr>
              </thead>
              <tbody>
                {referenceItems.map((item, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2">{item.legal_area}</td>
                    <td className="p-2">{item.case_type}</td>
                    <td className="p-2">{item.service}</td>
                    <td className="p-2">R$ {Number(item.min_amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="p-2">R$ {Number(item.suggested_amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="p-2 font-semibold text-blue-700">R$ {Number(item.regional_suggestion || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="p-2">R$ {Number(item.max_amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border rounded p-3 bg-gray-50 space-y-3">
          <h4 className="font-semibold text-sm">⬆️ Enviar nova tabela</h4>

          <div>
            <label className="block text-sm font-medium text-gray-700">Tipo</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full mt-1 border rounded p-2 text-sm"
            >
              {TABLE_TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Nome da tabela</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Tabela OAB 2025"
              className="w-full mt-1 border rounded p-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Arquivo (CSV, Excel ou PDF)</label>
            <input
              type="file"
              accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, .pdf, application/pdf"
              onChange={handleFileChange}
              className="w-full mt-1 text-sm"
            />
          </div>

          {preview.length > 0 && previewValidation && (
            <div className="border rounded bg-white p-2 text-xs space-y-2">
              <div className="flex gap-2 flex-wrap">
                <span className="font-semibold">Linhas: {previewValidation.rowCount}</span>
                <span className={`px-2 rounded ${previewValidation.valid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {previewValidation.valid ? 'Colunas válidas' : 'Colunas inválidas'}
                </span>
              </div>
              <p className="text-gray-700">
                <span className="font-semibold">Reconhecidas:</span>{' '}
                {Object.entries(previewValidation.recognized).filter(([, v]) => v).map(([k, v]) => `${k} (${v})`).join(', ') || 'nenhuma'}
              </p>
              {previewValidation.missing.length > 0 && (
                <p className="text-red-700">
                  <span className="font-semibold">Ausentes:</span>{' '}
                  {previewValidation.missing.join(', ')}
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-100">
                      {Object.keys(preview[0]).map((k) => (
                        <th key={k} className="p-1 border text-left">{k}</th>
                      ))}
                    </tr>
                  </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((v, j) => (
                        <td key={j} className="p-1 border">{String(v)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

          <button
            onClick={handleUpload}
            disabled={uploading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {uploading ? 'Salvando...' : 'Salvar tabela'}
          </button>
        </div>

        <div className="border rounded p-3 bg-gray-50 space-y-3">
          <h4 className="font-semibold text-sm">📂 Tabelas salvas</h4>
          {TABLE_TYPES.map((t) => (
            <div key={t.key}>
              <h5 className="font-medium text-sm mb-1">{t.label}</h5>
              {renderList(t.key)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
