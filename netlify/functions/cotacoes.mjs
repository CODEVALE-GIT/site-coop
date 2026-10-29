// Função do Netlify: busca as cotações na Graindex e devolve em JSON para a faixa do topo do site.
// Endereço no site: /api/cotacoes
// A chave da Graindex fica na Netlify (variável API_COTACOES) e nunca é enviada ao navegador.
// O resultado fica guardado na Netlify por 2 minutos: a Graindex é consultada no máximo
// uma vez a cada 2 minutos, não importa quantas pessoas estejam no site.

// ======================= LISTA DA FAIXA DE COTAÇÕES =======================
// Para trocar, incluir ou tirar uma cotação, edite só esta lista (a ordem aqui é a ordem na faixa).
// A faixa mostra SÓ os contratos listados aqui. Quando um contrato vence, ele sai da faixa e
// nada entra no lugar: para mostrar outros meses, é preciso editar esta lista e publicar de novo.
//   nome:        texto que aparece na faixa
//   fonte:       bolsa na Graindex: "cambio", "b3", "cbot" ou "ice"
//   raiz:        código do produto (usado para a janelinha de vencimentos)
//   contratos:   códigos exatos a mostrar. Letra do mês: F jan, G fev, H mar, J abr, K mai, M jun,
//                N jul, Q ago, U set, V out, X nov, Z dez. Ano: CBOT/ICE com 1 dígito (ZSH7 = mar/2027),
//                B3 com 2 dígitos (BGIV26 = out/2026).
//   codigo:      código fixo (só para o câmbio, que não tem vencimento)
//   unidade:     texto da unidade
//   divisor:     divide o preço (ex.: 100 transforma centavos de dólar em dólar)
//   casas:       casas decimais
//   futuro:      (só para o câmbio) qual contrato futuro mostrar na janelinha de vencimentos
// Ao clicar numa cotação, o site abre uma janelinha com os próximos vencimentos daquele produto.
// Códigos disponíveis no contrato da CODEVALE (out/2026):
//   cambio: DOL COM (dólar comercial), EUROCOM (euro comercial)
//   b3:     BGI boi gordo, CCM milho, SJC soja (mini, US$/sc), ICF café arábica, ETH etanol, DOL dólar futuro
//   cbot:   ZS soja, ZC milho, ZW trigo, KE trigo Kansas, ZM farelo de soja, ZL óleo de soja
//   ice:    KC café arábica, CT algodão, SB açúcar, CC cacau, OJ suco de laranja, DX índice do dólar
export const ITENS = [
  { nome: "Soja Chicago", fonte: "cbot", raiz: "ZS", unidade: "US$/bu", divisor: 100, casas: 2,
    contratos: ["ZSH7", "ZSK7", "ZSN7"] },                                  // mar, mai, jul/2027
  { nome: "Milho Chicago", fonte: "cbot", raiz: "ZC", unidade: "US$/bu", divisor: 100, casas: 2,
    contratos: ["ZCH7", "ZCK7", "ZCN7"] },                                  // mar, mai, jul/2027
  { nome: "Milho B3", fonte: "b3", raiz: "CCM", unidade: "R$/sc", casas: 2,
    contratos: ["CCMF27", "CCMH27", "CCMK27"] },                            // jan, mar, mai/2027
  { nome: "Boi Gordo B3", fonte: "b3", raiz: "BGI", unidade: "R$/@", casas: 2,
    contratos: ["BGIV26", "BGIX26", "BGIZ26", "BGIF27", "BGIG27", "BGIH27"] }, // out/2026 a mar/2027
  { nome: "Dólar comercial", fonte: "cambio", codigo: "DOL COM", unidade: "R$", casas: 4,
    futuro: { nome: "Dólar futuro B3", fonte: "b3", raiz: "DOL", unidade: "R$", divisor: 1000, casas: 4 } },
];
// ==========================================================================

const BASE = "https://api.graindex.com.br/api/v1";
const MESES = "FGHJKMNQUVXZ"; // letras dos meses nos códigos (F = jan ... Z = dez)
const NOMES_MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_A_FRENTE = 26; // procura contratos até pouco mais de 2 anos à frente
const MAX_FUTUROS = 12;    // vencimentos mostrados na janelinha

function chave() {
  const k = (globalThis.Netlify && Netlify.env.get("API_COTACOES")) || (typeof process !== "undefined" && process.env.API_COTACOES) || "";
  return k.trim();
}

// Data de hoje no horário de Brasília (AAAA-MM-DD)
function hojeBRT(agora) {
  return new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

// Todos os códigos possíveis de um produto, do mês passado até ~2 anos à frente.
// B3 usa o ano com 2 dígitos (BGIX26); CBOT e ICE com 1 dígito (ZSX6).
export function codigosDe(item, agora) {
  const lista = [];
  const hoje = new Date(agora.getTime() - 3 * 3600 * 1000);
  let ano = hoje.getUTCFullYear(), mes = hoje.getUTCMonth() - 1;
  for (let i = 0; i <= MESES_A_FRENTE; i++, mes++) {
    if (mes < 0) { mes += 12; ano--; }
    if (mes > 11) { mes -= 12; ano++; }
    const a = item.fonte === "b3" ? String(ano).slice(-2) : String(ano).slice(-1);
    lista.push(item.raiz + MESES[mes] + a);
  }
  return lista;
}

// "NOV/2026" -> "Nov/26"; se não vier descrição, monta pelo código
function vencimentoDe(q, item) {
  const m = /^([A-Z]{3})\/(\d{4})$/.exec(q.description || "");
  if (m) return m[1][0] + m[1].slice(1).toLowerCase() + "/" + m[2].slice(2);
  const cod = (q.symbol || "").slice(item.raiz.length);
  const i = MESES.indexOf(cod[0]);
  return i >= 0 ? NOMES_MES[i] + "/" + cod.slice(1).slice(-2) : "";
}

async function pedirFonte(fonte, codigos) {
  const url = BASE + "/quotes/" + encodeURIComponent(fonte) + "?symbols=" + encodeURIComponent(codigos.join(","));
  const r = await fetch(url, {
    headers: { Authorization: "ApiKey " + chave(), Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(fonte + ": " + r.status);
  const corpo = await r.json();
  return Array.isArray(corpo.quotes) ? corpo.quotes : [];
}

// Contratos de um produto ainda em aberto, do mais próximo ao mais distante.
// Contratos "parados" antes do primeiro que está negociando são deixados de fora (já venceram na prática).
function contratosDe(prod, cot, hoje) {
  const lista = cot.filter((q) =>
    typeof q.symbol === "string" && q.symbol.startsWith(prod.raiz) &&
    MESES.includes(q.symbol[prod.raiz.length]) && /^\d+$/.test(q.symbol.slice(prod.raiz.length + 1)) &&
    typeof q.price === "number" && q.price > 0 && q.isValid !== false &&
    (!q.exerciseDate || q.exerciseDate >= hoje))
    .sort((a, b) => (a.exerciseDate || "").localeCompare(b.exerciseDate || ""));
  const primeiro = lista.findIndex((q) => !q.stale);
  return primeiro > 0 ? lista.slice(primeiro) : lista;
}

function linha(q, prod) {
  const div = prod.divisor || 1;
  return {
    vencimento: prod.codigo ? "" : vencimentoDe(q, prod),
    preco: q.price / div,
    variacao: typeof q.change === "number" ? q.change / div : null,
    variacaoPct: typeof q.changePerc === "number" ? q.changePerc : null,
    // sem negócio no dia: o preço é o de ajuste
    parado: !!q.stale || (q.priceSource === "settle" && !q.volume),
    hora: q.tradeAt || q.lastUpdate || q.datetime || null,
  };
}

// Escolhe, para cada item da lista, os vencimentos em aberto mais próximos (faixa)
// e junta os próximos vencimentos de cada produto (janelinha)
export function montarFaixa(itens, cotacoesPorFonte, agora) {
  const hoje = hojeBRT(agora);
  const saida = [];
  const futuros = {};
  for (const item of itens) {
    const cot = cotacoesPorFonte[item.fonte];
    if (!cot) continue; // a bolsa não respondeu: pula o item, o resto aparece
    let escolhidas;
    if (item.codigo) {
      escolhidas = cot.filter((q) => q.symbol === item.codigo && typeof q.price === "number");
    } else {
      // Só os contratos listados, na ordem da lista; vencido (ou parado de vez) sai da faixa
      escolhidas = (item.contratos || [])
        .map((cod) => cot.find((q) => q.symbol === cod))
        .filter((q) => q && typeof q.price === "number" && q.price > 0 && q.isValid !== false && !q.stale &&
          (!q.exerciseDate || q.exerciseDate >= hoje));
    }
    // Vencimentos para a janelinha (do próprio produto, ou do contrato futuro indicado no câmbio)
    const prodFut = item.codigo ? item.futuro : item;
    let chave = null;
    if (prodFut && cotacoesPorFonte[prodFut.fonte]) {
      chave = prodFut.fonte + ":" + prodFut.raiz;
      if (!futuros[chave]) {
        const contratos = contratosDe(prodFut, cotacoesPorFonte[prodFut.fonte], hoje).slice(0, MAX_FUTUROS);
        if (contratos.length) {
          futuros[chave] = {
            nome: prodFut.nome || item.nome,
            unidade: prodFut.unidade || "",
            casas: prodFut.casas ?? 2,
            contratos: contratos.map((q) => linha(q, prodFut)),
          };
        }
      }
      if (!futuros[chave]) chave = null;
    }
    for (const q of escolhidas) {
      saida.push({ nome: item.nome, unidade: item.unidade || "", casas: item.casas ?? 2, chave, ...linha(q, item) });
    }
  }
  return { itens: saida, futuros };
}

function resposta(dados, ok) {
  return new Response(JSON.stringify(dados), {
    status: ok ? 200 : 502,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": ok ? "public, max-age=60" : "no-store",
      // Guardado na Netlify por 2 minutos (todos os visitantes recebem a mesma resposta)
      "Netlify-CDN-Cache-Control": ok ? "public, durable, s-maxage=120, stale-while-revalidate=600" : "no-store",
    },
  });
}

export default async () => {
  const agora = new Date();
  if (!chave()) return resposta({ erro: "sem_chave", itens: [] }, false);

  // Junta os códigos por bolsa: um pedido por bolsa
  const porFonte = {};
  const juntar = (fonte, lista) => { (porFonte[fonte] = porFonte[fonte] || new Set()); lista.forEach((c) => porFonte[fonte].add(c)); };
  for (const item of ITENS) {
    juntar(item.fonte, item.codigo ? [item.codigo] : [...(item.contratos || []), ...codigosDe(item, agora)]);
    if (item.codigo && item.futuro) juntar(item.futuro.fonte, codigosDe(item.futuro, agora));
  }
  const fontes = Object.keys(porFonte);
  const resultados = await Promise.allSettled(fontes.map((f) => pedirFonte(f, [...porFonte[f]])));
  const cotacoes = {};
  resultados.forEach((r, i) => { if (r.status === "fulfilled") cotacoes[fontes[i]] = r.value; });

  const { itens, futuros } = montarFaixa(ITENS, cotacoes, agora);
  return resposta({ atualizado: agora.toISOString(), fonte: "Graindex", itens, futuros }, itens.length > 0);
};

export const config = { path: "/api/cotacoes" };
