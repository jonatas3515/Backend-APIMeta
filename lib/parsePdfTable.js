/**
 * Extrai tabela de texto de PDFs simples (por exemplo, tabelas da OAB).
 * Sem OCR: PDFs escaneados/imagens nao sao suportados.
 * Nao loga PII.
 */

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.js';

function normalizeHeader(value) {
  if (value == null) return '';
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function hasRecognizedKeyword(header, keywords) {
  const low = normalizeHeader(header);
  return keywords.some((k) => low.includes(k));
}

function recognizeHeader(headers) {
  return {
    area: headers.find((h) => hasRecognizedKeyword(h, ['area', 'area juridica', 'area_juridica', 'areajuridica', 'legal_area'])),
    tipo: headers.find((h) => hasRecognizedKeyword(h, ['tipo', 'tipo caso', 'case_type', 'tipocaso', 'tipo_caso'])),
    servico: headers.find((h) => hasRecognizedKeyword(h, ['servico', 'service', 'nome', 'item', 'descricao', 'descricão'])),
    minimo: headers.find((h) => hasRecognizedKeyword(h, ['minimo', 'min', 'min_amount', 'valor minimo'])),
    sugerido: headers.find((h) => hasRecognizedKeyword(h, ['sugerido', 'suggested', 'sugestao', 'sugestão', 'suggested_amount'])),
    maximo: headers.find((h) => hasRecognizedKeyword(h, ['maximo', 'max', 'max_amount', 'valor maximo']))
  };
}

function isHeaderRow(values) {
  const joined = values.map(normalizeHeader).join(' ');
  const recognized = ['area', 'tipo', 'servico', 'minimo', 'sugerido', 'maximo'];
  return recognized.some((k) => joined.includes(k));
}

function splitLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return [];
  // Tenta tabulacoes primeiro
  const byTab = trimmed.split('\t');
  if (byTab.length >= 2) return byTab.map((s) => s.trim());
  // Depois 2 ou mais espacos
  const bySpaces = trimmed.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
  if (bySpaces.length >= 2) return bySpaces;
  // Linha unica
  return [trimmed];
}

function cleanPageText(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

async function parsePdfToText(buffer) {
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;
  const textParts = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join(' ');
    textParts.push(pageText);
  }

  return textParts.join('\n');
}

export async function parsePdfTable(buffer) {
  const text = await parsePdfToText(buffer);
  if (!text.trim()) {
    return [];
  }

  const lines = cleanPageText(text);
  const allRows = [];
  let headers = null;

  for (const line of lines) {
    const values = splitLine(line);
    if (values.length < 2) continue;
    if (!headers) {
      if (isHeaderRow(values)) {
        headers = values;
        continue;
      }
    }
    allRows.push(values);
  }

  if (!headers) {
    const maxCols = allRows.reduce((max, row) => Math.max(max, row.length), 0);
    headers = Array.from({ length: Math.max(1, maxCols) }, (_, i) => `col${i}`);
  }

  const normalizedHeaders = headers.map((h) => (h ? h.toString().trim() : ''));
  const result = allRows.map((row) => {
    const obj = {};
    normalizedHeaders.forEach((h, i) => {
      obj[h] = row[i] !== undefined ? row[i] : '';
    });
    return obj;
  });

  return result;
}
