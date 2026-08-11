"use strict";(()=>{var e={};e.id=696,e.ids=[696,806],e.modules={145:e=>{e.exports=require("next/dist/compiled/next-server/pages-api.runtime.prod.js")},1309:e=>{e.exports=import("@supabase/supabase-js")},6249:(e,a)=>{Object.defineProperty(a,"l",{enumerable:!0,get:function(){return function e(a,o){return o in a?a[o]:"then"in a&&"function"==typeof a.then?a.then(a=>e(a,o)):"function"==typeof a&&"default"===o?a:void 0}}})},7590:(e,a,o)=>{o.a(e,async(e,s)=>{try{o.r(a),o.d(a,{config:()=>u,default:()=>l,routeModule:()=>d});var t=o(1802),r=o(7153),i=o(6249),n=o(7541),c=e([n]);n=(c.then?(await c)():c)[0];let l=(0,i.l)(n,"default"),u=(0,i.l)(n,"config"),d=new t.PagesAPIRouteModule({definition:{kind:r.x.PAGES_API,page:"/api/insights",pathname:"/api/insights",bundlePath:"",filename:""},userland:n});s()}catch(e){s(e)}})},9491:(e,a,o)=>{o.d(a,{T:()=>t});var s=o(9806);async function t(e){try{let{client_name:a,legal_area:o,case_type:t,municipality:r,agency:i,client_role:n,case_summary:c,intake_data:l,status:u,confidential:d}=e,m=`Voc\xea \xe9 um assistente jur\xeddico especializado em gerar insights de casos encerrados para uma central de conhecimento do escrit\xf3rio Neves & Costa Advocacia.

Baseado nas informa\xe7\xf5es abaixo, gere um insight estruturado para reutiliza\xe7\xe3o em futuros atendimentos similares.

INFORMA\xc7\xd5ES DO CASO:
- \xc1rea Jur\xeddica: ${o||"N\xe3o especificada"}
- Tipo de Caso: ${t||"N\xe3o especificado"}
- Munic\xedpio: ${r||"N\xe3o especificado"}
- \xd3rg\xe3o/Entidade: ${i||"N\xe3o especificado"}
- Papel do Cliente: ${n||"N\xe3o especificado"}
- Status: ${u||"N\xe3o especificado"}
- Cliente: ${a||"N\xe3o identificado"}

RESUMO DO CASO:
${c||"Sem resumo dispon\xedvel"}

DADOS DO INTAKE:
${l?JSON.stringify(l,null,2):"Sem dados de intake"}

GERE UM INSIGHT COM OS SEGUINTES CAMPOS (em JSON):

{
  "summary": "Vis\xe3o geral concisa do caso e problema principal (2-3 linhas)",
  "strategy_notes": "Principais estrat\xe9gias usadas ou recomendadas para casos similares (4-5 linhas)",
  "risk_notes": "Riscos jur\xeddicos/probat\xf3rios observados e como mitig\xe1-los (3-4 linhas)",
  "outcome_notes": "Resultado do caso e li\xe7\xf5es aprendidas (2-3 linhas)",
  "similar_patterns": "Padr\xf5es recorrentes observados que podem ajudar em novos casos (2-3 linhas)"
}

Responda APENAS com o JSON, sem explica\xe7\xf5es adicionais.`,x=await (0,s.askGemini)(m,""),p={};try{p=JSON.parse(x)}catch(a){console.error("[AI-INSIGHTS] Erro ao fazer parse da resposta da IA:",a);let e=x.match(/\{[\s\S]*\}/);p=e?JSON.parse(e[0]):{summary:x.substring(0,200),strategy_notes:"N\xe3o foi poss\xedvel gerar automaticamente",risk_notes:"N\xe3o foi poss\xedvel gerar automaticamente",outcome_notes:"N\xe3o foi poss\xedvel gerar automaticamente",similar_patterns:"N\xe3o foi poss\xedvel gerar automaticamente"}}return{legal_area:o,case_type:t,municipality:r,agency:i,client_role:n,summary:p.summary||"",strategy_notes:p.strategy_notes||"",risk_notes:p.risk_notes||"",outcome_notes:p.outcome_notes||"",similar_patterns:p.similar_patterns||"",source:"ai_assisted",confidential:d||!1}}catch(e){throw console.error("[AI-INSIGHTS] Erro ao gerar insight:",e),e}}},9806:(e,a,o)=>{o.d(a,{askGemini:()=>n});let s=process.env.GOOGLE_AI_API_KEY,t=`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${s}`,r=`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${s}`,i=`🚨 ATEN\xc7\xc3O: NEVES & COSTA ADVOCACIA N\xc3O TEM CNPJ 🚨

Voc\xea \xe9 o Jhon, assistente virtual da Neves & Costa Advocacia e Consultoria.

⚠️ INFORMA\xc7\xc3O CR\xcdTICA - LEIA PRIMEIRO:
- O escrit\xf3rio Neves & Costa Advocacia N\xc3O POSSUI CNPJ
- O escrit\xf3rio Neves & Costa Advocacia N\xc3O POSSUI CNPJ
- O escrit\xf3rio Neves & Costa Advocacia N\xc3O POSSUI CNPJ
- CNPJ 42.429.644/0001-44 N\xc3O \xc9 NOSSO - pertence a outro escrit\xf3rio
- "Neves Costa" (sem &) N\xc3O \xc9 NOSSO ESCRIT\xd3RIO
- Qualquer informa\xe7\xe3o do Google sobre CNPJ da Neves & Costa est\xe1 ERRADA

REGRAS CR\xcdTICAS - NUNCA VIOLAR:
1. NUNCA afirme que temos CNPJ - N\xc3O TEMOS
2. NUNCA cite o CNPJ 42.429.644/0001-44 como nosso - N\xc3O \xc9
3. NUNCA confunda "Neves Costa" com "Neves & Costa" - s\xe3o diferentes
4. Se encontrar informa\xe7\xe3o na internet sobre nosso CNPJ, diga que est\xe1 ERRADA
5. NUNCA invente endere\xe7o, OAB, advogado ou dados n\xe3o listados aqui
6. NUNCA repita apresenta\xe7\xe3o ap\xf3s primeira mensagem
7. NUNCA use listas com asteriscos ou bullets
8. NUNCA discorra mais de 2-3 frases por mensagem
9. NUNCA prometa resultado ou an\xe1lise jur\xeddica conclusiva

IDENTIFICA\xc7\xc3O (APENAS NA PRIMEIRA MENSAGEM):
"Ol\xe1! Eu sou o Jhon, estagi\xe1rio assistente aqui da Neves & Costa Advocacia. Em que posso ajudar?"

DADOS OFICIAIS - \xdaNICOS CORRETOS:
- Nome COMPLETO: Neves & Costa Advocacia e Consultoria (COM "&")
- Fundado: 2021 no Extremo Sul da Bahia
- Atendimento: 100% digital desde 2024
- \xc1reas: Direito Civil, Consumidor, Trabalhista e Previdenci\xe1rio
- WhatsApp: (73) 9122-5215
- Hor\xe1rio: Segunda a sexta, 8h \xe0s 18h
- CNPJ: ❌ N\xc3O POSSUI ❌
- Endere\xe7o f\xedsico: ❌ N\xc3O POSSUI (atendimento digital)

🚨 ALERTA - CONFUS\xc3O COM OUTRO ESCRIT\xd3RIO:
Se cliente mencionar:
- Cobran\xe7a/boleto em nosso nome
- Qualquer CNPJ (especialmente 42.429.644/0001-44)
- "Neves Costa" sem "&"
- Pagamento n\xe3o solicitado
- D\xedvida que n\xe3o reconhece

RESPONDA IMEDIATAMENTE:
"Aten\xe7\xe3o! A Neves & Costa Advocacia (com &) N\xc3O possui CNPJ. O CNPJ que voc\xea mencionou n\xe3o \xe9 nosso. Pode ser de outro escrit\xf3rio ou de uma cobran\xe7a banc\xe1ria (Bradesco, Santander, etc.). Para verificar pend\xeancias com bancos, entre em contato direto com a institui\xe7\xe3o. Nosso WhatsApp oficial: (73) 9122-5215."

ESTILO DE COMUNICA\xc7\xc3O:
- Respostas curtas: 1-3 frases
- Uma pergunta por vez
- Sem listas, sem asteriscos, sem bullets
- Sem repetir informa\xe7\xf5es j\xe1 ditas
- Linguagem natural e acolhedora
- NUNCA mencione o WhatsApp (73) 9122-5215 a menos que o cliente pergunte explicitamente "qual o contato" ou "como falar com voc\xeas"
- Responda APENAS o que foi perguntado, sem informa\xe7\xf5es extras

VOC\xca N\xc3O \xc9 ADVOGADO:
- N\xe3o fa\xe7a an\xe1lise jur\xeddica conclusiva
- NUNCA prometa resultado ou vit\xf3ria em processo
- NUNCA diga "vai conseguir", "voc\xea tem direito a X" ou "isso \xe9 ilegal" de forma definitiva
- SEMPRE sugerir an\xe1lise formal com um advogado da equipe antes de qualquer conclus\xe3o
- Encaminhe casos complexos para equipe

SEGURAN\xc7A E \xc9TICA PROFISSIONAL (LGPD):
- NUNCA pe\xe7a senhas, dados banc\xe1rios completos ou informa\xe7\xf5es sens\xedveis desnecess\xe1rias pelo WhatsApp
- NUNCA compartilhe dados de um cliente com terceiros
- NUNCA confirme identidade ou detalhes de caso sem cautela
- Se o cliente revelar ass\xe9dio, viol\xeancia, corrup\xe7\xe3o ou dela\xe7\xe3o, responda com discri\xe7\xe3o e sigilo
- Siga o princ\xedpio do m\xednimo necess\xe1rio: pe\xe7a apenas informa\xe7\xf5es estritamente relevantes

TOM DE RESPOSTA:
- NUNCA soar definitivo, autorit\xe1rio ou como se a resposta fosse decis\xe3o final
- Use express\xf5es como "Pode ser que...", "Um advogado precisa confirmar...", "A an\xe1lise formal vai esclarecer..."
- Evite afirma\xe7\xf5es absolutas sobre direito, valores ou resultados

🔔 ENCAMINHAR PARA HUMANO (marcar conversa como "needs_human"):
- Cliente pede "falar com advogado" ou "atendimento humano"
- Cliente diz "me liga" ou pede liga\xe7\xe3o
- Prazo processual ou audi\xeancia
- Pedido de contrata\xe7\xe3o
- Situa\xe7\xe3o urgente
- Suspeita de golpe confirmada
- Cliente insatisfeito ou irritado
- Quando voc\xea n\xe3o souber responder

Quando encaminhar, diga APENAS: "Vou encaminhar para nossa equipe. Aguarde o retorno."
N\xc3O mencione "pelo WhatsApp" ou o n\xfamero de telefone.

⚠️ LEMBRE-SE: N\xc3O TEMOS CNPJ. INFORMA\xc7\xd5ES DO GOOGLE EST\xc3O ERRADAS.`;async function n(e,a="",o=null){try{console.log("[GEMINI] Tentando Gemini 2.5 Flash-Lite..."),console.log("[GEMINI] API Key presente?",s?"Sim":"N\xc3O");let r=[];if(o&&(o.legal_area&&r.push(`\xc1REA DO CASO: ${o.legal_area}`),o.case_summary&&r.push(`RESUMO DO CASO: ${o.case_summary}`),o.intake_data?.answers)){let e=Object.entries(o.intake_data.answers).map(([e,a])=>`${e}: ${a}`).join("; ");r.push(`INFORMA\xc7\xd5ES COLETADAS: ${e}`)}let n=r.length>0?`CONTEXTO ATUAL DO ATENDIMENTO:
${r.join("\n")}

`:"",c=a?`HIST\xd3RICO DAS \xdaLTIMAS 24H (MAIS RECENTES POR \xdaLTIMO):
${a}

`:"",l=`${n}${c}NOVA MENSAGEM DO CLIENTE: ${e}

Responda como Jhon, considerando TODO o contexto acima. NUNCA repita sauda\xe7\xe3o de apresenta\xe7\xe3o. Responda apenas ao que foi perguntado.`,u=new AbortController,d=setTimeout(()=>{console.error("[GEMINI] ⏱️ TIMEOUT de 12 segundos atingido!"),u.abort()},12e3);console.log("[GEMINI] Iniciando fetch...");let m=await fetch(t,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system_instruction:{parts:[{text:i}]},contents:[{parts:[{text:l}]}]}),signal:u.signal});if(clearTimeout(d),console.log("[GEMINI] Fetch completou! Response status:",m.status),m.ok){let e=await m.json(),a=e.candidates?.[0]?.content?.parts?.[0]?.text;return console.log("[GEMINI] ✅ Resposta do Gemini 2.5:",a?.substring(0,100)),a||"Desculpe, n\xe3o consegui gerar uma resposta."}console.warn(`[GEMINI] ⚠️ Gemini 2.5 falhou (${m.status}), tentando fallback 1.5...`)}catch(e){console.warn(`[GEMINI] ⚠️ Erro ao tentar Gemini 2.5: ${e.message}`)}try{console.log("[GEMINI] Tentando Gemini 3.1 Flash-Lite (fallback)...");let o=a?`HIST\xd3RICO DA CONVERSA:
${a}

NOVA MENSAGEM DO CLIENTE: ${e}`:e,s=await fetch(r,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system_instruction:{parts:[{text:i}]},contents:[{parts:[{text:o}]}]})});if(!s.ok){let e=await s.text();throw console.error(`[GEMINI] ❌ Erro na API Gemini 3.1: status ${s.status} ${s.statusText}`),console.error(`[GEMINI] Corpo: ${e}`),Error(`Erro na API Gemini: ${s.status} ${s.statusText} - ${e}`)}let t=await s.json(),n=t.candidates?.[0]?.content?.parts?.[0]?.text;return console.log("[GEMINI] ✅ Resposta do Gemini 3.1:",n?.substring(0,100)),n||"Desculpe, n\xe3o consegui gerar uma resposta."}catch(e){throw console.error(`[GEMINI] ❌ Erro em ambos os modelos Gemini: ${e.message}`),e}}},7541:(e,a,o)=>{o.a(e,async(e,s)=>{try{o.r(a),o.d(a,{default:()=>n});var t=o(1309),r=o(9491),i=e([t]);t=(i.then?(await i)():i)[0];let m="https://uytvsxualogrimpueran.supabase.co",x=process.env.SUPABASE_SERVICE_ROLE_KEY,p=m&&x?(0,t.createClient)(m,x):null;async function n(e,a){if(!p)return a.status(500).json({error:"Supabase n\xe3o configurado"});let{method:o}=e;try{if("GET"===o)return c(e,a);if("POST"===o)return l(e,a);if("PATCH"===o)return u(e,a);if("DELETE"===o)return d(e,a);else return a.status(405).json({error:"M\xe9todo n\xe3o permitido"})}catch(e){return console.error("[INSIGHTS] Erro:",e),a.status(500).json({error:"Erro interno do servidor"})}}async function c(e,a){let{action:o,id:s,conversation_id:t,legal_area:i,case_type:n,municipality:c,agency:l,search:u,limit:d=50}=e.query;try{if("generate_proposal"===o){if(!t)return a.status(400).json({error:"conversation_id \xe9 obrigat\xf3rio"});let{data:e,error:o}=await p.from("conversations").select("*").eq("id",t).single();if(o||!e)return a.status(404).json({error:"Conversa n\xe3o encontrada"});let s=await (0,r.T)(e);return a.status(200).json(s)}if("similar"===o){if(!t)return a.status(400).json({error:"conversation_id \xe9 obrigat\xf3rio"});let{data:e}=await p.from("conversations").select("legal_area, case_type, municipality, agency, client_role").eq("id",t).single();if(!e)return a.status(200).json([]);let{data:o,error:s}=await p.rpc("find_similar_insights",{p_legal_area:e.legal_area,p_case_type:e.case_type,p_municipality:e.municipality,p_agency:e.agency,p_client_role:e.client_role,p_limit:5});if(s)throw s;return a.status(200).json(o||[])}if(s){let{data:e,error:o}=await p.from("case_insights").select(`
          *,
          users(name, email),
          conversations(client_name, client_phone),
          cases(title, status)
        `).eq("id",s).single();if(o)throw o;return await p.from("insight_usage").insert({insight_id:s,action:"view"}),a.status(200).json(e)}{let e=p.from("case_insights").select(`
        id, legal_area, case_type, municipality, agency, client_role,
        summary, created_at, created_by_user_id,
        users(name), conversations(client_name)
      `);i&&(e=e.eq("legal_area",i)),n&&(e=e.eq("case_type",n)),c&&(e=e.eq("municipality",c)),l&&(e=e.eq("agency",l)),u&&(e=e.or(`summary.ilike.%${u}%,strategy_notes.ilike.%${u}%,risk_notes.ilike.%${u}%,outcome_notes.ilike.%${u}%`)),e=e.eq("confidential",!1).order("created_at",{ascending:!1}).limit(parseInt(d));let{data:o,error:s}=await e;if(s)throw s;return a.status(200).json(o||[])}}catch(e){return console.error("[INSIGHTS] Erro ao buscar:",e),a.status(500).json({error:"Erro ao buscar insights"})}}async function l(e,a){let{action:o}=e.body;try{if("create"===o){let{case_id:o,conversation_id:s,legal_area:t,case_type:r,municipality:i,agency:n,client_role:c,summary:l,strategy_notes:u,risk_notes:d,outcome_notes:m,similar_patterns:x,created_by_user_id:N,source:g="manual",confidential:f=!1,confidential_reason:A}=e.body;if(!s)return a.status(400).json({error:"conversation_id \xe9 obrigat\xf3rio"});let{data:E,error:O}=await p.from("case_insights").insert({case_id:o||null,conversation_id:s,legal_area:t,case_type:r,municipality:i,agency:n,client_role:c,summary:l,strategy_notes:u,risk_notes:d,outcome_notes:m,similar_patterns:x,created_by_user_id:N||null,source:g,confidential:f,confidential_reason:A||null}).select().single();if(O)throw O;return console.log(`[INSIGHTS] Insight criado: ${E.id}`),a.status(201).json(E)}}catch(e){return console.error("[INSIGHTS] Erro ao criar:",e),a.status(500).json({error:"Erro ao criar insight"})}}async function u(e,a){let{id:o}=e.query,s=e.body;if(!o)return a.status(400).json({error:"ID \xe9 obrigat\xf3rio"});try{let{data:e,error:t}=await p.from("case_insights").update(s).eq("id",o).select().single();if(t)throw t;return console.log(`[INSIGHTS] Insight atualizado: ${o}`),a.status(200).json(e)}catch(e){return console.error("[INSIGHTS] Erro ao atualizar:",e),a.status(500).json({error:"Erro ao atualizar insight"})}}async function d(e,a){let{id:o}=e.query;if(!o)return a.status(400).json({error:"ID \xe9 obrigat\xf3rio"});try{let{error:e}=await p.from("case_insights").delete().eq("id",o);if(e)throw e;return console.log(`[INSIGHTS] Insight deletado: ${o}`),a.status(200).json({success:!0})}catch(e){return console.error("[INSIGHTS] Erro ao deletar:",e),a.status(500).json({error:"Erro ao deletar insight"})}}s()}catch(e){s(e)}})},7153:(e,a)=>{var o;Object.defineProperty(a,"x",{enumerable:!0,get:function(){return o}}),function(e){e.PAGES="PAGES",e.PAGES_API="PAGES_API",e.APP_PAGE="APP_PAGE",e.APP_ROUTE="APP_ROUTE"}(o||(o={}))},1802:(e,a,o)=>{e.exports=o(145)}};var a=require("../../webpack-api-runtime.js");a.C(e);var o=a(a.s=7590);module.exports=o})();