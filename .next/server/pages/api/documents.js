"use strict";(()=>{var e={};e.id=753,e.ids=[753],e.modules={145:e=>{e.exports=require("next/dist/compiled/next-server/pages-api.runtime.prod.js")},6249:(e,a)=>{Object.defineProperty(a,"l",{enumerable:!0,get:function(){return function e(a,o){return o in a?a[o]:"then"in a&&"function"==typeof a.then?a.then(a=>e(a,o)):"function"==typeof a&&"default"===o?a:void 0}}})},8951:(e,a,o)=>{o.r(a),o.d(a,{config:()=>c,default:()=>s,routeModule:()=>u});var r={};o.r(r),o.d(r,{config:()=>_,default:()=>l});var i=o(1802),t=o(7153),d=o(6249);let n={contrato_honorarios:{name:"Contrato de Honor\xe1rios",description:"Contrato de presta\xe7\xe3o de servi\xe7os advocat\xedcios",fields:[{field:"cliente_nome",label:"Nome completo do cliente",required:!0},{field:"cliente_cpf",label:"CPF do cliente",required:!0},{field:"cliente_endereco",label:"Endere\xe7o do cliente",required:!1},{field:"objeto",label:"Objeto do contrato (qual a\xe7\xe3o/assunto)",required:!0},{field:"valor_entrada",label:"Valor da entrada (R$)",required:!1},{field:"valor_total",label:"Valor total dos honor\xe1rios (R$)",required:!0},{field:"parcelas",label:"N\xfamero de parcelas",required:!1,default:"1"},{field:"advogado_nome",label:"Nome do advogado",required:!0},{field:"advogado_oab",label:"OAB do advogado",required:!0},{field:"data",label:"Data do contrato",required:!0,default:()=>new Date().toLocaleDateString("pt-BR")}],generate:e=>`CONTRATO DE PRESTA\xc7\xc3O DE SERVI\xc7OS ADVOCAT\xcdCIOS

CONTRATANTE: ${e.cliente_nome}, CPF: ${e.cliente_cpf}, endere\xe7o: ${e.cliente_endereco||"n\xe3o informado"}.
CONTRATADO: ${e.advogado_nome}, OAB: ${e.advogado_oab}.

CL\xc1USULA 1\xaa - OBJETO
O presente contrato tem por objeto a presta\xe7\xe3o de servi\xe7os advocat\xedcios relativos a ${e.objeto}.

CL\xc1USULA 2\xaa - DOS HONOR\xc1RIOS
Pelo servi\xe7o contratado, o(a) CONTRATANTE pagar\xe1 ao(\xe0) CONTRATADO(A) a quantia de R$ ${e.valor_total}.
Entrada: R$ ${e.valor_entrada||"0,00"}.
Parcelamento: ${e.parcelas||"1"} parcela(s).

CL\xc1USULA 3\xaa - DAS OBRIGA\xc7\xd5ES
O(a) CONTRATADO(A) se obriga a prestar os servi\xe7os com zelo e dilig\xeancia, mantendo o(a) CONTRATANTE informado(a) sobre o andamento do caso.

CL\xc1USULA 4\xaa - VIG\xcaNCIA
O presente contrato entra em vigor na data de sua assinatura e permanece at\xe9 o t\xe9rmino do objeto.

E, por estarem de comum acordo, firmam o presente contrato.

Data: ${e.data}

_________________________________
${e.cliente_nome}
CONTRATANTE

_________________________________
${e.advogado_nome}
CONTRATADO(A)`},declaracao_residencia:{name:"Declara\xe7\xe3o de Resid\xeancia",description:"Declara\xe7\xe3o para comprova\xe7\xe3o de endere\xe7o",fields:[{field:"cliente_nome",label:"Nome completo",required:!0},{field:"cliente_cpf",label:"CPF",required:!0},{field:"endereco",label:"Endere\xe7o completo",required:!0},{field:"municipio",label:"Munic\xedpio",required:!0},{field:"estado",label:"UF",required:!0},{field:"data",label:"Data",required:!0,default:()=>new Date().toLocaleDateString("pt-BR")}],generate:e=>`DECLARA\xc7\xc3O DE RESID\xcaNCIA

Eu, ${e.cliente_nome}, CPF: ${e.cliente_cpf}, declaro, para os devidos fins, que resido no endere\xe7o abaixo:

Endere\xe7o: ${e.endereco}
Munic\xedpio: ${e.municipio}
UF: ${e.estado}

Declaro que as informa\xe7\xf5es acima s\xe3o verdadeiras e assumo inteira responsabilidade pelas mesmas.

${e.municipio}, ${e.data}

_________________________________
${e.cliente_nome}
CPF: ${e.cliente_cpf}`},autorizacao_representacao:{name:"Autoriza\xe7\xe3o de Representa\xe7\xe3o",description:"Procura\xe7\xe3o/advogacia para representar cliente",fields:[{field:"cliente_nome",label:"Nome completo do outorgante",required:!0},{field:"cliente_cpf",label:"CPF do outorgante",required:!0},{field:"advogado_nome",label:"Nome do advogado",required:!0},{field:"advogado_oab",label:"OAB do advogado",required:!0},{field:"poderes",label:"Poderes espec\xedficos",required:!1,default:"PODERES PARA ATUAR NA CAUSA"},{field:"data",label:"Data",required:!0,default:()=>new Date().toLocaleDateString("pt-BR")}],generate:e=>`PROCURA\xc7\xc3O AD JUDICIA

OUTORGANTE: ${e.cliente_nome}, CPF: ${e.cliente_cpf}.
OUTORGADO: ${e.advogado_nome}, OAB: ${e.advogado_oab}.

O OUTORGANTE confere ao OUTORGADO os poderes para represent\xe1-lo em todas as inst\xe2ncias judiciais e extrajudiciais, podendo praticar todos os atos necess\xe1rios, inclusive firmar compromissos, transigir, desistir, renunciar, receber e dar quita\xe7\xe3o.

Poderes espec\xedficos: ${e.poderes}

${e.data}

_________________________________
${e.cliente_nome}
OUTORGANTE`},declaracao_renda:{name:"Declara\xe7\xe3o de Renda",description:"Declara\xe7\xe3o de renda mensal para a\xe7\xf5es trabalhistas",fields:[{field:"cliente_nome",label:"Nome completo",required:!0},{field:"cliente_cpf",label:"CPF",required:!0},{field:"renda_mensal",label:"Renda mensal (R$)",required:!0},{field:"fonte_renda",label:"Fonte da renda",required:!0},{field:"data",label:"Data",required:!0,default:()=>new Date().toLocaleDateString("pt-BR")}],generate:e=>`DECLARA\xc7\xc3O DE RENDA

Eu, ${e.cliente_nome}, CPF: ${e.cliente_cpf}, declaro, para os devidos fins, que minha renda mensal \xe9 de R$ ${e.renda_mensal}.

Fonte de renda: ${e.fonte_renda}.

Declaro que as informa\xe7\xf5es s\xe3o verdadeiras e estou ciente de que eventuais omiss\xf5es podem gerar responsabiliza\xe7\xe3o legal.

Data: ${e.data}

_________________________________
${e.cliente_nome}
CPF: ${e.cliente_cpf}`},requerimento_adm:{name:"Requerimento Administrativo",description:"Requerimento padr\xe3o para \xf3rg\xe3os p\xfablicos",fields:[{field:"cliente_nome",label:"Nome do requerente",required:!0},{field:"cliente_cpf",label:"CPF",required:!0},{field:"orgao",label:"\xd3rg\xe3o destinat\xe1rio",required:!0},{field:"assunto",label:"Assunto do requerimento",required:!0},{field:"solicitacao",label:"Solicita\xe7\xe3o",required:!0},{field:"municipio",label:"Munic\xedpio",required:!0},{field:"data",label:"Data",required:!0,default:()=>new Date().toLocaleDateString("pt-BR")}],generate:e=>`REQUERIMENTO

Ilmo. Sr. Respons\xe1vel pelo(a) ${e.orgao}.

Eu, ${e.cliente_nome}, CPF: ${e.cliente_cpf}, por meio deste, venho requerer:

Assunto: ${e.assunto}

Solicita\xe7\xe3o:
${e.solicitacao}

Neste ato, requeiro o deferimento do pedido.

${e.municipio}, ${e.data}

_________________________________
${e.cliente_nome}
CPF: ${e.cliente_cpf}`}},_={api:{bodyParser:{sizeLimit:"1mb"}}};async function l(e,a){if("GET"===e.method)return a.status(200).json({success:!0,templates:Object.entries(n).map(([e,a])=>({id:e,name:a.name,description:a.description,fields:a.fields}))});if("POST"===e.method){let{templateId:o,data:r}=e.body;if(!o||!r)return a.status(400).json({error:"Template e dados s\xe3o obrigat\xf3rios"});try{let e=function(e,a){let o=n[e];if(!o)throw Error("Template n\xe3o encontrado");for(let e of o.fields){if(e.required&&!a[e.field])throw Error(`Campo obrigat\xf3rio n\xe3o preenchido: ${e.label}`);!a[e.field]&&e.default&&(a[e.field]="function"==typeof e.default?e.default():e.default)}return o.generate(a)}(o,r);return a.status(200).json({success:!0,document:e,templateId:o})}catch(e){return console.error("[DOCUMENTS] Erro ao gerar:",e),a.status(400).json({error:e.message})}}return a.status(405).json({error:"Method not allowed"})}let s=(0,d.l)(r,"default"),c=(0,d.l)(r,"config"),u=new i.PagesAPIRouteModule({definition:{kind:t.x.PAGES_API,page:"/api/documents",pathname:"/api/documents",bundlePath:"",filename:""},userland:r})},7153:(e,a)=>{var o;Object.defineProperty(a,"x",{enumerable:!0,get:function(){return o}}),function(e){e.PAGES="PAGES",e.PAGES_API="PAGES_API",e.APP_PAGE="APP_PAGE",e.APP_ROUTE="APP_ROUTE"}(o||(o={}))},1802:(e,a,o)=>{e.exports=o(145)}};var a=require("../../webpack-api-runtime.js");a.C(e);var o=a(a.s=8951);module.exports=o})();