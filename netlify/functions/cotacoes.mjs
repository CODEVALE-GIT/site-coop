// Cotações da Graindex para a faixa do topo (/api/cotacoes).
// Chave em API_COTACOES (Netlify). Cache de 2 min.

// Só os contratos listados aparecem; vencido sai da faixa.
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

const BASE = "https://api.graindex.com.br/api/v1";
const MESES = "FGHJKMNQUVXZ"; // F=jan ... Z=dez
const NOMES_MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_A_FRENTE = 26;
const MAX_FUTUROS = 12;

function chave() {
  const k = (globalThis.Netlify && Netlify.env.get("API_COTACOES")) || (typeof process !== "undefined" && process.env.API_COTACOES) || "";
  return k.trim();
}

// hoje em Brasília (AAAA-MM-DD)
function hojeBRT(agora) {
  return new Date(agora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

// B3 usa ano com 2 dígitos (BGIX26), CBOT/ICE com 1 (ZSX6)
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

// "NOV/2026" -> "Nov/26"
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

// contratos em aberto, do mais próximo ao mais distante
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
    // sem negócio no dia = preço de ajuste
    parado: !!q.stale || (q.priceSource === "settle" && !q.volume),
    hora: q.tradeAt || q.lastUpdate || q.datetime || null,
  };
}

export function montarFaixa(itens, cotacoesPorFonte, agora) {
  const hoje = hojeBRT(agora);
  const saida = [];
  const futuros = {};
  for (const item of itens) {
    const cot = cotacoesPorFonte[item.fonte];
    if (!cot) continue;
    let escolhidas;
    if (item.codigo) {
      escolhidas = cot.filter((q) => q.symbol === item.codigo && typeof q.price === "number");
    } else {
      escolhidas = (item.contratos || [])
        .map((cod) => cot.find((q) => q.symbol === cod))
        .filter((q) => q && typeof q.price === "number" && q.price > 0 && q.isValid !== false && !q.stale &&
          (!q.exerciseDate || q.exerciseDate >= hoje));
    }
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
      "Netlify-CDN-Cache-Control": ok ? "public, durable, s-maxage=120, stale-while-revalidate=600" : "no-store",
    },
  });
}

export default async () => {
  const agora = new Date();
  if (!chave()) return resposta({ erro: "sem_chave", itens: [] }, false);

  // um pedido por bolsa
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
