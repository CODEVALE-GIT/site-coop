// Cartão de aviso do site (/api/avisos).
// Lê a planilha "Avisos do site CODEVALE" (Google Planilhas, compartilhada como leitor por link).
// Colunas: Data | Título | Texto | Imagem | Link | Mostrar
// PLANILHA_AVISOS na Netlify troca o endereço, se precisar.
const PLANILHA = "https://docs.google.com/spreadsheets/d/1LxFXpaT0Wg8e5upCaS0S4JLiZds4Yzm3xzTZxfIqBUE/export?format=csv";

function endereco() {
  const u = (globalThis.Netlify && Netlify.env.get("PLANILHA_AVISOS")) || (typeof process !== "undefined" && process.env.PLANILHA_AVISOS) || PLANILHA;
  return u.trim();
}

export function lerCSV(texto) {
  const linhas = [];
  let linha = [], campo = "", aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = "";
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

const semAcento = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// link do Drive -> imagem direta
export function imagemDe(url) {
  url = (url || "").trim();
  if (!/^https:\/\//.test(url)) return "";
  const m = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{10,})/.exec(url);
  return m ? "https://drive.google.com/thumbnail?id=" + m[1] + "&sz=w1200" : url;
}

export function montarAviso(linhas) {
  if (!linhas.length) return null;
  const cab = linhas[0].map(semAcento);
  const col = (nome) => cab.indexOf(nome);
  const i = { data: col("data"), titulo: col("titulo"), texto: col("texto"), imagem: col("imagem"), link: col("link"), mostrar: col("mostrar") };
  if (i.titulo < 0 || i.mostrar < 0) return null;
  const pega = (l, k) => (i[k] >= 0 ? (l[i[k]] || "").trim() : "");
  const ativos = linhas.slice(1)
    .filter((l) => semAcento(pega(l, "mostrar")) === "sim" && pega(l, "titulo"))
    .map((l) => ({
      data: pega(l, "data"),
      titulo: pega(l, "titulo"),
      texto: pega(l, "texto"),
      imagem: imagemDe(pega(l, "imagem")),
      link: /^https?:\/\//.test(pega(l, "link")) ? pega(l, "link") : "",
    }));
  if (!ativos.length) return null;
  // vale a última linha marcada SIM
  const aviso = ativos[ativos.length - 1];
  aviso.id = String([...(aviso.data + aviso.titulo + aviso.texto)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));
  return aviso;
}

function resposta(dados, ok) {
  return new Response(JSON.stringify(dados), {
    status: ok ? 200 : 502,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60",
      "Netlify-CDN-Cache-Control": ok ? "public, durable, s-maxage=300, stale-while-revalidate=3600" : "public, s-maxage=60",
    },
  });
}

export default async () => {
  const url = endereco();
  if (!url) return resposta({ aviso: null }, true);
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(r.status);
    return resposta({ aviso: montarAviso(lerCSV(await r.text())) }, true);
  } catch {
    return resposta({ aviso: null }, false);
  }
};

export const config = { path: "/api/avisos" };
