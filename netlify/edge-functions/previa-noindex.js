// Netlify: em qualquer endereço que não seja o domínio oficial (ex.: codevale.netlify.app, prévias),
// pede ao Google e outros buscadores para não indexar. No codevale.agr.br não faz nada.
// Só roda na página e no robots.txt (imagens, CSS e JS não passam por aqui).

export default async (request, context) => {
  const url = new URL(request.url);
  const oficial = url.hostname === "codevale.agr.br" || url.hostname.endsWith(".codevale.agr.br");
  if (oficial) return; // segue normal

  if (url.pathname === "/robots.txt") {
    return new Response("User-agent: *\nDisallow: /\n", {
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" },
    });
  }
  const resp = await context.next();
  resp.headers.set("X-Robots-Tag", "noindex, nofollow");
  return resp;
};

export const config = { path: ["/", "/index.html", "/robots.txt"] };
