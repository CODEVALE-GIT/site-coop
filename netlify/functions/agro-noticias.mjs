// Função do Netlify: busca as notícias do agro nos feeds RSS e devolve em JSON
// para a aba Notícias. Endereço no site: /.netlify/functions/agro-noticias
// O resultado fica guardado no Netlify por 15 minutos, então os portais
// não são consultados a cada visita.

// Para trocar ou acrescentar fontes, edite esta lista.
const FEEDS = [
  { url: "https://www.canalrural.com.br/agricultura/feed/", fonte: "Canal Rural", categoria: "Agricultura" },
  { url: "https://www.canalrural.com.br/pecuaria/feed/", fonte: "Canal Rural", categoria: "Pecuária" },
  { url: "https://www.comprerural.com/feed/", fonte: "Compre Rural", categoria: "Agronegócio" },
  { url: "https://www.portaldoagronegocio.com.br/feed", fonte: "Portal do Agronegócio", categoria: "Agronegócio" },
  { url: "https://g1.globo.com/rss/g1/economia/agronegocios/", fonte: "Globo Rural", categoria: "Agronegócio" },
];
// Máximo de notícias de cada feed, para uma fonte não ocupar a lista toda
const MAX_POR_FEED = 8;
const MAX_ITENS = 30;

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#8217": "’", "#8216": "‘", "#8220": "“", "#8221": "”", "#8211": "–", "#8212": "—", "#8230": "…" };
function decodificar(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (ENTIDADES[e.toLowerCase()] !== undefined) return ENTIDADES[e.toLowerCase()];
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return m;
  });
}
function texto(s) {
  if (!s) return "";
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  s = s.replace(/<[^>]+>/g, " ");
  return decodificar(s).replace(/\s+/g, " ").trim();
}
// Tira a foto e o crédito da foto ("Foto: ...", "Imagem gerada por IA") do resumo
function semFoto(html) {
  if (!html) return "";
  html = html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  if (/&lt;\/?[a-z]/i.test(html)) html = decodificar(html); // HTML escapado no feed
  return html
    .replace(/<figure[\s\S]*?<\/figure>/gi, " ")
    .replace(/<figcaption[\s\S]*?<\/figcaption>/gi, " ")
    .replace(/<img[^>]*>/gi, " ");
}
// Imagem da notícia: usa <media:content>, <enclosure> ou a primeira <img> da descrição
function imagemDo(item) {
  const tentativas = [
    /<media:content[^>]*url="([^"]+)"[^>]*>/i,
    /<media:thumbnail[^>]*url="([^"]+)"[^>]*>/i,
    /<enclosure[^>]*url="([^"]+)"[^>]*type="image[^"]*"[^>]*>/i,
    /<enclosure[^>]*type="image[^"]*"[^>]*url="([^"]+)"[^>]*>/i,
    /<image>\s*<url>(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?<\/url>/i, // usado pelo Portal do Agronegócio
  ];
  for (const re of tentativas) {
    const m = item.match(re);
    if (m) return decodificar(m[1]);
  }
  let desc = campo(item, "description").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  if (/&lt;img/i.test(desc)) desc = decodificar(desc);
  const img = desc.match(/<img[^>]*src="([^"]+)"/i);
  return img ? decodificar(img[1]) : "";
}
function campo(item, tag) {
  const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : "";
}
function resumir(s, max = 180) {
  if (s.length <= max) return s;
  return s.slice(0, s.lastIndexOf(" ", max)).replace(/[,.;:\s]+$/, "") + "…";
}

export function lerFeed(xml, fonte, categoria) {
  const itens = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  return itens.map((item) => {
    const titulo = texto(campo(item, "title"));
    const link = texto(campo(item, "link"));
    const data = new Date(texto(campo(item, "pubDate")));
    let resumo = texto(semFoto(campo(item, "description")));
    resumo = resumo.replace(/\s*O post .* apareceu primeiro em .*$/i, "");
    // Reforço: se o crédito da foto vier como texto comum, tira do começo do resumo
    resumo = resumo
      .replace(/^Imagem gerada por IA\s*/i, "")
      .replace(/^(Foto|FOTO|Imagem|Crédito)s?:\s*(?:[^/]{0,60}\/\s*Canal Rural|(?:[^\s/]+\s+){0,3}[^\s/]+\/[^\s]+|[^\s/,.]+(?=\s+[A-ZÀ-Ú]))?\s*/, "");
    return {
      titulo,
      link,
      imagem: imagemDo(item),
      data: isNaN(data) ? null : data.toISOString(),
      resumo: resumir(resumo),
      fonte,
      categoria,
    };
  }).map((n) => (/^https:\/\//.test(n.imagem) ? n : { ...n, imagem: "" }))
    .filter((n) => n.titulo && /^https?:\/\//.test(n.link));
}

export default async () => {
  const resultados = await Promise.allSettled(
    FEEDS.map(async (f) => {
      const r = await fetch(f.url, { headers: { "User-Agent": "CODEVALE-site/1.0 (+https://www.codevale.agr.br)" } });
      if (!r.ok) throw new Error(`${f.url}: ${r.status}`);
      return lerFeed(await r.text(), f.fonte, f.categoria)
        .sort((a, b) => (b.data || "").localeCompare(a.data || ""))
        .slice(0, MAX_POR_FEED);
    })
  );
  const vistos = new Set();
  const noticias = resultados
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value)
    .filter((n) => n.imagem) // só notícias com foto, para os cartões ficarem padronizados
    .filter((n) => (vistos.has(n.link) ? false : vistos.add(n.link)))
    .sort((a, b) => (b.data || "").localeCompare(a.data || ""))
    .slice(0, MAX_ITENS);

  const ok = noticias.length > 0;
  // No computador (netlify dev) não guarda nada, para os testes mostrarem sempre a versão nova
  const local = typeof process !== "undefined" && process.env && process.env.NETLIFY_DEV === "true";
  return new Response(JSON.stringify({ atualizado: new Date().toISOString(), noticias }), {
    status: ok ? 200 : 502,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": local ? "no-store" : "public, max-age=60",
      "Netlify-CDN-Cache-Control": ok && !local ? "public, s-maxage=900, stale-while-revalidate=3600" : "no-store",
    },
  });
};
