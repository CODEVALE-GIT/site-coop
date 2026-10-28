// TEMPORÁRIO: mostra o que a chave da Graindex enxerga (fontes, códigos, descrição e último preço),
// para escolher os ativos da barra de cotações. Remover depois que a barra estiver pronta.
// Endereço: /api/graindex/catalogo
// A chave fica na Netlify (variável API_COTACOES) e nunca é enviada ao navegador.

const BASE = "https://api.graindex.com.br";

function chave() {
  const k = (globalThis.Netlify && Netlify.env.get("API_COTACOES")) || process.env.API_COTACOES || "";
  return k.trim();
}

async function pedir(caminho) {
  const r = await fetch(BASE + caminho, { headers: { Authorization: "ApiKey " + chave(), Accept: "application/json" } });
  let corpo = null;
  try { corpo = await r.json(); } catch { /* resposta sem JSON */ }
  return { status: r.status, corpo };
}

function json(dados, status = 200) {
  return new Response(JSON.stringify(dados, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export default async () => {
  if (!chave()) return json({ erro: "A variável API_COTACOES não está configurada na Netlify (ou o site não foi publicado de novo depois de criá-la)." }, 500);

  const cat = await pedir("/api/v1/catalog");
  if (cat.status !== 200) {
    return json({ erro: "A Graindex recusou o pedido do catálogo.", status: cat.status, codigo: cat.corpo && cat.corpo.code, mensagem: cat.corpo && cat.corpo.message }, 502);
  }

  const fontes = (cat.corpo && cat.corpo.sources) || [];
  const resultado = [];
  for (const f of fontes) {
    const id = f.slug || f.id;
    const codigos = Array.isArray(f.symbols) ? f.symbols : [];
    const cotacoes = [];
    const erros = [];
    // A API exige a lista de códigos (symbols); pede em lotes de 40
    for (let i = 0; i < codigos.length; i += 40) {
      const lote = codigos.slice(i, i + 40).join(",");
      const q = await pedir("/api/v1/quotes/" + encodeURIComponent(id) + "?symbols=" + encodeURIComponent(lote));
      if (q.status === 200 && q.corpo && q.corpo.quotes) cotacoes.push(...q.corpo.quotes);
      else erros.push({ status: q.status, codigo: q.corpo && q.corpo.code, mensagem: q.corpo && q.corpo.message });
    }
    resultado.push({
      fonte: id,
      id: f.id,
      nome: f.name,
      descricao: f.description,
      codigosNoCatalogo: codigos.length,
      erros: erros.slice(0, 3),
      total: cotacoes.length,
      ativos: cotacoes.map((c) => ({
        codigo: c.symbol,
        descricao: c.description,
        vencimento: c.maturity,
        ultimo: c.price,
        variacao: c.change,
        variacaoPct: c.changePerc,
        parado: c.stale || c.sessionStale || false,
        atualizado: c.lastUpdate || c.asOf || c.datetime,
      })),
      // códigos que não voltaram com cotação (se houver)
      semCotacao: codigos.filter((c) => !cotacoes.some((q) => q.symbol === c)).slice(0, 100),
    });
  }
  return json({ geradoEm: new Date().toISOString(), fontes: resultado });
};

export const config = { path: "/api/graindex/catalogo" };
