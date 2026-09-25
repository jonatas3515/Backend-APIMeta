import { sortMessagesBySequence, buildMessageMeta } from '../lib/messageMeta';

// Reproduz o cenário real observado em produção:
// - sessão A em 23/09 com sequence 1..40 (subset representativo);
// - sessão B em 24-25/09 com sequence 1..12 reiniciada após reset de intake_data (>4h inativa);
// - uma mensagem humana enviada pelo painel, sem sequence, entre elas.
// A ordem de exibição deve ser estritamente cronológica por created_at,
// independente de sequence colidir entre sessões.

const msg = (id, ts, sequence) => ({
  id,
  created_at: ts,
  internal_note: sequence == null ? null : buildMessageMeta({ sequence })
});

describe('sortMessagesBySequence', () => {
  const sessionA = [
    msg('a1', '2026-09-23T16:12:29.862Z', 1),
    msg('a2', '2026-09-23T16:13:24.413Z', 4),
    msg('a3', '2026-09-23T18:02:40.422Z', 21),
    msg('a4', '2026-09-23T18:03:43.142Z', 29),
    msg('a5', '2026-09-23T18:03:59.891Z', 36),
    msg('a6', '2026-09-23T18:04:16.011Z', 40)
  ];
  const sessionB = [
    msg('b1', '2026-09-24T23:08:14.358Z', 1), // imagem do teste
    msg('b2', '2026-09-24T23:08:14.359Z', 2),
    msg('b3', '2026-09-24T23:12:11.786Z', 3), // "acordo parcelado"
    msg('b4', '2026-09-24T23:12:11.789Z', 6),
    msg('b5', '2026-09-25T00:50:26.965Z', 7), // imagem
    msg('b6', '2026-09-25T00:50:26.966Z', 8),
    msg('b7', '2026-09-25T01:09:21.876Z', 9),
    msg('b8', '2026-09-25T01:09:21.879Z', 12)
  ];
  const human = msg('h1', '2026-09-25T00:51:31.712Z', null); // humano, sem seq

  const all = [...sessionA, ...sessionB, human];
  const chronological = [...all].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at) || String(a.id).localeCompare(String(b.id))
  );

  test('ordena por created_at mesmo com sequence reiniciada entre sessões', () => {
    const sorted = sortMessagesBySequence(all);
    expect(sorted.map((m) => m.id)).toEqual(chronological.map((m) => m.id));
  });

  test('mensagens recentes da sessão B ficam no fim da lista', () => {
    const sorted = sortMessagesBySequence(all);
    const lastIds = sorted.slice(-3).map((m) => m.id);
    // cronologicamente, os últimos são h1 (00:51), b7 e b8 (01:09) — nunca mensagens antigas de seq alto
    expect(lastIds).toEqual(['h1', 'b7', 'b8']);
    // e todas as mensagens da sessão B vêm depois de todas da sessão A
    const lastB = sorted.findIndex((m) => m.id === 'b8');
    const firstA = sorted.findIndex((m) => m.id === 'a6');
    expect(lastB).toBeGreaterThan(firstA);
  });

  test('mensagem humana sem sequence mantém posição cronológica', () => {
    const sorted = sortMessagesBySequence(all);
    const idx = sorted.findIndex((m) => m.id === 'h1');
    expect(sorted[idx - 1].id).toBe('b6'); // 00:50:26
    expect(sorted[idx + 1].id).toBe('b7'); // 01:09:21
  });

  test('embaralhamento de entrada não altera o resultado', () => {
    const shuffled = [all[7], all[0], all[14], all[3], all[10], all[5], all[1], all[13], all[8], all[2], all[11], all[6], all[4], all[12], all[9]];
    const sorted = sortMessagesBySequence(shuffled);
    expect(sorted.map((m) => m.id)).toEqual(chronological.map((m) => m.id));
  });
});
