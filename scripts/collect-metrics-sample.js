#!/usr/bin/env node
/**
 * Coletor de amostra de métricas
 *
 * Uso:
 *   METRICS_URL=https://chatnevesecosta.vercel.app/api/metrics \
 *   METRICS_TOKEN=<token-admin> \
 *   node scripts/collect-metrics-sample.js
 *
 * Saida:
 *   - Cria a pasta output/ se nao existir.
 *   - Salva metrics-YYYYMMDD-HHMMSS.json com timestamp e snapshot.
 *   - Nao armazena PII; apenas contadores e timestamp.
 */

const fs = require('fs');
const path = require('path');

const url = process.env.METRICS_URL || 'http://localhost:3000/api/metrics';
const token = process.env.METRICS_TOKEN;

if (!token) {
  console.error('[collect-metrics] METRICS_TOKEN nao configurado.');
  process.exit(1);
}

async function main() {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const status = response.status;
      const body = await response.text();
      console.error(`[collect-metrics] Erro ${status}: ${body}`);
      process.exit(1);
    }

    const data = await response.json();

    const now = new Date();
    const timestamp = now.toISOString();
    const filename = `metrics-${timestamp.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)}.json`;

    const output = {
      collectedAt: timestamp,
      source: url,
      metrics: data.metrics || {}
    };

    const outputDir = path.join(__dirname, '..', 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, filename);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    console.log(`[collect-metrics] Snapshot salvo em: ${outputPath}`);
    console.log(`[collect-metrics] Contadores: ${Object.keys(output.metrics).length}`);
  } catch (err) {
    console.error('[collect-metrics] Falha ao coletar:', err.message);
    process.exit(1);
  }
}

main();
