/**
 * Extrai tabela de texto de PDFs simples (por exemplo, tabelas da OAB).
 * Sem OCR: PDFs escaneados/imagens nao sao suportados.
 * Nao loga PII.
 */

import { createWriteStream } from 'fs';
import { unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import PDFParser from 'pdf2json';

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

async function writeTempFile(buffer) {
  const filePath = join(tmpdir(), `oab-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
  const stream = createWriteStream(filePath);
  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
    stream.end(buffer);
  });
}

async function parsePdfToText(buffer) {
  const filePath = await writeTempFile(buffer);
  try {
    const pdfParser = new PDFParser(null, 1);
    const text = await new Promise((resolve, reject) => {
      pdfParser.on('pdfParser_dataError', (err) => reject(new Error(err?.parserError || 'Erro ao ler PDF')));
      pdfParser.on('pdfParser_dataReady', (pdfData) => {
        const pages = Array.isArray(pdfData?.Pages) ? pdfData.Pages : [];
        const lines = [];
        for (const page of pages) {
          const texts = [];
          const pageTexts = Array.isArray(page?.Texts) ? page.Texts : [];
          for (const text of pageTexts) {
            const t = text?.R?.[0]?.T;
            if (t != null) {
              texts.push(decodeURIComponent(t));
            }
          }
          const joined = texts.join(' ');
          const clean = joined.replace(/\s+/g, ' ').trim();
          if (clean) lines.push(clean);
        }
        resolve(lines.join('\n'));
      });
      pdfParser.loadPDF(filePath);
    });
    return text;
  } finally {
    try { await unlink(filePath); } catch {}
  }
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
    // Se nao identificou cabecalho, cria colunas genericas com base na maior linha
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
