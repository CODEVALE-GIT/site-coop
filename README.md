# Site CODEVALE

Site institucional da CODEVALE — Cooperativa de Desenvolvimento do Vale do Araguaia — publicado em [www.codevale.agr.br](https://www.codevale.agr.br).

Site estático (HTML, CSS e JavaScript), hospedado na Netlify. Cada envio para a branch `main` publica o site.

```
index.html                               Página do site (todas as abas)
css/style.css                            Visual
js/main.js                               Abas, menu do celular e notícias
netlify/functions/agro-noticias.mjs      Busca as notícias do agro (endereço /api/agro-noticias)
netlify/edge-functions/previa-noindex.js Fora do domínio oficial, pede aos buscadores para não indexar
netlify.toml                             Configuração da Netlify
```

Este repositório recebe só a versão publicada. A edição do site é feita no repositório de trabalho da cooperativa.
