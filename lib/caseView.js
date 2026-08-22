/**
 * Resolve a visão de Casos a partir dos parâmetros da URL.
 * Não faz chamadas de rede e não expõe dados pessoais.
 *
 * @param {Object} params
 * @param {string|undefined} params.tab
 * @param {string|undefined} params.caseId
 * @param {string|undefined} params.caseView
 * @returns {Object} { activeTab, caseId, caseView, redirectUrl, notice }
 */
export function resolveCaseView({ tab, caseId, caseView }) {
  let activeTab = tab || 'cases';
  let view = caseView || null;
  let cId = caseId || null;
  let redirectUrl = null;
  let notice = null;

  if (tab === 'collaboration') {
    activeTab = 'cases';
    if (caseId) {
      view = 'colaboracao';
      cId = caseId;
      redirectUrl = `/?tab=cases&caseId=${encodeURIComponent(caseId)}&caseView=colaboracao`;
    } else {
      view = 'list';
      cId = null;
      notice = 'Selecione um caso para acessar a colaboração.';
      redirectUrl = '/?tab=cases';
    }
  } else if (tab === 'insights') {
    activeTab = 'cases';
    view = 'insights';
    cId = null;
    redirectUrl = '/?tab=cases&caseView=insights';
  }

  if (cId && !view) {
    view = 'visao-geral';
  }

  return { activeTab, caseId: cId, caseView: view, redirectUrl, notice };
}
