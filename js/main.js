/* CODEVALE — scripts do site (versão estática, sem animações) */
(function () {
  /* ---------- Menu do celular ---------- */
  var toggle = document.querySelector('.menu-toggle');
  var menu = document.getElementById('menu');
  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* ---------- Notícias ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Notícias do agronegócio (automáticas): vêm da função do Netlify, que lê os feeds
  var AGRO_URL = '/api/agro-noticias'; // na Netlify, redirecionado para a função agro-noticias
  var agro = { itens: [], estado: 'carregando' }; // carregando | ok | erro
  function fmtDateTime(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '') + ' ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function agroCard(n) {
    var cat = n.categoria === 'Pecuária' ? 'pecuaria' : 'graos';
    var foto = n.imagem
      ? '<div class="news-thumb"><img src="' + esc(n.imagem) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add(\'sem-img\');this.remove()"></div>'
      : '';
    return '<a class="news-card cat-' + cat + (n.imagem ? ' has-img' : '') + '" href="' + esc(n.link) + '" target="_blank" rel="noopener">' + foto +
      '<div class="meta"><span>' + esc(n.fonte) + '</span>' +
      (n.data ? '<time datetime="' + esc(n.data) + '">' + fmtDateTime(n.data) + '</time>' : '') + '</div>' +
      '<h2>' + esc(n.titulo) + '</h2><p>' + esc(n.resumo) + '</p><span class="more">Ler no ' + esc(n.fonte) + ' ↗</span></a>';
  }

  // Lista de notícias: mostra 3 por vez, com botões para ver as anteriores.
  var box = document.querySelector('[data-news-list]');
  if (box) {
    var per = parseInt(box.getAttribute('data-per-page') || '3', 10);
    var pageIdx = 0;
    var prev = document.querySelector('[data-news-prev]');
    var next = document.querySelector('[data-news-next]');
    function lista() { return agro.itens; }
    function render() {
      var all = lista();
      var list = all.slice(pageIdx * per, pageIdx * per + per);
      if (agro.estado !== 'ok') {
        box.innerHTML = '<p class="news-empty">' + (agro.estado === 'carregando'
          ? 'Carregando as notícias do agronegócio…'
          : 'As notícias do agronegócio aparecem automaticamente quando o site está publicado no Netlify.') + '</p>';
      } else {
        box.innerHTML = list.length ? list.map(agroCard).join('') : '<p class="news-empty">Nenhuma notícia publicada ainda.</p>';
      }
      if (prev) prev.disabled = pageIdx === 0;
      if (next) next.disabled = (pageIdx + 1) * per >= all.length;
    }
    if (prev) prev.addEventListener('click', function () { if (pageIdx > 0) { pageIdx--; render(); } });
    if (next) next.addEventListener('click', function () { if ((pageIdx + 1) * per < lista().length) { pageIdx++; render(); } });
    function carregarAgro() {
      fetch(AGRO_URL)
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (j) { agro.itens = j.noticias || []; agro.estado = agro.itens.length ? 'ok' : 'erro'; })
        .catch(function () { if (!agro.itens.length) agro.estado = 'erro'; })
        .then(render);
    }
    render();
    carregarAgro();
    setInterval(carregarAgro, 15 * 60 * 1000); // confere notícias novas a cada 15 minutos
  }

  /* ---------- Abas: troca o conteúdo sem recarregar a página ---------- */
  var tabs = document.querySelectorAll('section.tab');
  var navLinks = document.querySelectorAll('.menu a');
  function showTab() {
    var hash = decodeURIComponent(location.hash.replace('#', '')) || 'inicio';
    var tabId = hash;
    if (!document.getElementById(tabId) || !document.getElementById(tabId).classList.contains('tab')) tabId = 'inicio';
    tabs.forEach(function (t) { t.hidden = t.id !== tabId; });
    var active = document.getElementById(tabId);
    document.title = active.getAttribute('data-title');
    navLinks.forEach(function (a) {
      if (a.getAttribute('href') === '#' + tabId) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (menu) { menu.classList.remove('open'); if (toggle) toggle.setAttribute('aria-expanded', 'false'); }
    window.scrollTo(0, 0);
  }
  if (tabs.length) {
    window.addEventListener('hashchange', showTab);
    showTab();
  }

  /* ---------- Aba História: alterna entre vídeo e foto ---------- */
  var mediaSwitch = document.querySelector('.media-switch');
  if (mediaSwitch) {
    mediaSwitch.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var which = b.getAttribute('data-media');
      mediaSwitch.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      document.querySelectorAll('[data-media-item]').forEach(function (el) {
        el.hidden = el.getAttribute('data-media-item') !== which;
        if (el.tagName === 'VIDEO' && el.hidden) el.pause();
      });
      var cap = document.querySelector('.media-caption');
      if (cap) cap.textContent = which === 'foto' ? 'Cooperados reunidos' : 'Reunião com cooperados';
    });
  }
  // Pausa o vídeo ao sair da aba História
  window.addEventListener('hashchange', function () {
    document.querySelectorAll('video').forEach(function (v) { v.pause(); });
  });

  /* ---------- Links de e-mail: menu para escolher onde escrever ----------
     Ao clicar num e-mail, aparece um menu com Gmail, Outlook, programa de e-mail
     do computador e copiar o endereço. Assunto opcional em data-assunto. */
  var emailMenu = null, emailMenuLink = null;
  function fecharEmailMenu() {
    if (emailMenu) { emailMenu.remove(); emailMenu = null; emailMenuLink = null; }
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="mailto:"]');
    if (!a) {
      if (emailMenu && !e.target.closest('.email-menu')) fecharEmailMenu();
      return;
    }
    if (a.closest('.email-menu')) return; // a própria opção "Programa de e-mail" segue normal
    e.preventDefault();
    // clicar de novo no mesmo e-mail fecha o menu
    if (emailMenu && emailMenuLink === a) { fecharEmailMenu(); return; }
    fecharEmailMenu();
    emailMenuLink = a;
    var email = a.getAttribute('href').replace('mailto:', '').split('?')[0];
    var assunto = 'Contato pelo site' + (a.getAttribute('data-assunto') ? ' – ' + a.getAttribute('data-assunto') : '');
    var to = encodeURIComponent(email), su = encodeURIComponent(assunto);
    emailMenu = document.createElement('div');
    emailMenu.className = 'email-menu';
    emailMenu.setAttribute('role', 'menu');
    emailMenu.innerHTML =
      '<a role="menuitem" target="_blank" rel="noopener" href="https://mail.google.com/mail/?view=cm&fs=1&to=' + to + '&su=' + su + '">Escrever no Gmail</a>' +
      '<a role="menuitem" target="_blank" rel="noopener" href="https://outlook.live.com/mail/0/deeplink/compose?to=' + to + '&subject=' + su + '">Escrever no Outlook</a>' +
      '<a role="menuitem" href="mailto:' + email + '?subject=' + su + '">Programa de e-mail do computador</a>' +
      '<button type="button" role="menuitem" data-copiar="' + esc(email) + '">Copiar endereço</button>';
    document.body.appendChild(emailMenu);
    // medidas em pixels da tela; no fim divide pelo zoom do site (telas grandes), que o navegador aplica de novo
    var z = window.CODEVALE_ZOOM || 1;
    var r = a.getBoundingClientRect(), m = emailMenu.getBoundingClientRect();
    var left = Math.min(r.left, window.innerWidth - m.width - 12);
    var top = r.bottom + 6;
    if (top + m.height > window.innerHeight - 8) top = r.top - m.height - 6;
    emailMenu.style.left = Math.max(12, left) / z + 'px';
    emailMenu.style.top = Math.max(8, top) / z + 'px';
    emailMenu.querySelector('a').focus();
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.email-menu [data-copiar]');
    if (!b) return;
    var ok = function () { b.textContent = 'Endereço copiado ✓'; setTimeout(fecharEmailMenu, 1200); };
    if (navigator.clipboard) navigator.clipboard.writeText(b.getAttribute('data-copiar')).then(ok, function () { b.textContent = b.getAttribute('data-copiar'); });
    else b.textContent = b.getAttribute('data-copiar');
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharEmailMenu(); });
  window.addEventListener('resize', fecharEmailMenu);
  window.addEventListener('hashchange', fecharEmailMenu);
  document.addEventListener('click', function (e) {
    if (e.target.closest('.email-menu a')) setTimeout(fecharEmailMenu, 0);
  });

  /* ---------- Faixa de cotações (Graindex) ----------
     Busca /api/cotacoes (função netlify/functions/cotacoes.mjs, onde fica a lista de cotações)
     e monta a faixa. Atualiza a cada 2 minutos, só enquanto a aba do navegador estiver aberta.
     Ao clicar numa cotação, abre uma janelinha com os próximos vencimentos; clicar fora (ou Esc) fecha. */
  (function () {
    var barra = document.querySelector('.quotes-bar');
    var trilho = barra && barra.querySelector('.cot-trilho');
    if (!trilho) return;
    var aviso = barra.querySelector('.quotes-loading');
    var COT_URL = '/api/cotacoes';
    var INTERVALO = 2 * 60 * 1000;
    var dados = null;

    function num(v, casas) {
      return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
    }
    function textoVariacao(c, casas) {
      if (c.variacao == null) return '';
      var sinal = c.variacao > 0 ? '+' : '';
      return sinal + num(c.variacao, casas) + (c.variacaoPct == null ? '' : ' (' + sinal + num(c.variacaoPct, 2) + '%)');
    }
    function classeVariacao(c) { return c.variacao > 0 ? ' sobe' : (c.variacao < 0 ? ' cai' : ''); }

    function cartao(c, copia) {
      var abre = c.chave ? ' data-chave="' + esc(c.chave) + '" role="button" tabindex="' + (copia ? '-1' : '0') +
        '" aria-haspopup="dialog" title="Ver próximos vencimentos"' : '';
      return '<li class="cot"' + abre + '>' +
        '<span class="cot-nome"><b>' + esc(c.nome) + '</b>' + (c.vencimento ? ' ' + esc(c.vencimento) : '') + '</span>' +
        '<span class="cot-valor">' + num(c.preco, c.casas) + (c.unidade ? '<small>' + esc(c.unidade) + '</small>' : '') + '</span>' +
        '<span class="cot-var' + classeVariacao(c) + '">' + (textoVariacao(c, c.casas) || '&nbsp;') + '</span>' +
        '</li>';
    }
    function montar(d) {
      dados = d;
      var hora = d.atualizado ? new Date(d.atualizado).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      var fim = '<li class="cot cot-fonte">Fonte: Graindex' + (hora ? ' · ' + hora : '') + '</li>';
      // A lista vai duas vezes para a faixa rolar sem emendas; a cópia fica escondida dos leitores de tela
      trilho.innerHTML =
        '<ul class="cot-lista">' + d.itens.map(function (c) { return cartao(c, false); }).join('') + fim + '</ul>' +
        '<ul class="cot-lista" aria-hidden="true">' + d.itens.map(function (c) { return cartao(c, true); }).join('') + fim + '</ul>';
      // Velocidade constante (cerca de 45 px por segundo), qualquer que seja o tamanho da lista
      var largura = trilho.scrollWidth / 2;
      trilho.style.setProperty('--dur', Math.max(20, Math.round(largura / 45)) + 's');
      barra.classList.remove('erro');
      barra.classList.add('pronto');
      if (aberta) preencher(aberta); // janelinha aberta: atualiza os valores dela
    }
    function falhou() {
      if (dados) return; // se já havia cotações na tela, mantém as últimas
      barra.classList.add('erro');
      if (aviso) aviso.textContent = 'Cotações indisponíveis no momento';
    }
    function carregar() {
      if (!window.fetch) return falhou();
      fetch(COT_URL)
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (d) { if (d && d.itens && d.itens.length) montar(d); else falhou(); })
        .catch(falhou);
    }

    /* Janelinha com os próximos vencimentos */
    var janela = document.createElement('div');
    janela.className = 'cot-janela';
    janela.setAttribute('role', 'dialog');
    janela.setAttribute('aria-labelledby', 'cot-janela-titulo');
    janela.tabIndex = -1;
    janela.hidden = true;
    barra.appendChild(janela);
    var aberta = null, origem = null;

    function preencher(chave) {
      var f = dados && dados.futuros && dados.futuros[chave];
      if (!f) return fechar();
      var temParado = f.contratos.some(function (c) { return c.parado; });
      janela.innerHTML =
        '<div class="cot-janela-topo"><div><strong id="cot-janela-titulo">' + esc(f.nome) + '</strong>' +
        '<span>Próximos vencimentos' + (f.unidade ? ' · ' + esc(f.unidade) : '') + '</span></div>' +
        '<button type="button" class="cot-fechar" aria-label="Fechar">&times;</button></div>' +
        '<table><thead><tr><th scope="col">Vencimento</th><th scope="col">Último</th><th scope="col">Variação</th></tr></thead><tbody>' +
        f.contratos.map(function (c) {
          return '<tr' + (c.parado ? ' class="parado"' : '') + '><th scope="row">' + esc(c.vencimento) + (c.parado ? '*' : '') + '</th>' +
            '<td>' + num(c.preco, f.casas) + '</td>' +
            '<td class="cot-var' + classeVariacao(c) + '">' + (textoVariacao(c, f.casas) || '–') + '</td></tr>';
        }).join('') +
        '</tbody></table>' +
        '<p class="cot-janela-nota">' + (temParado ? '* Sem negócio hoje: preço de ajuste. ' : '') + 'Fonte: Graindex.</p>';
    }
    function posicionar(li) {
      // Mede tudo relativo à faixa (funciona com o zoom do site em telas grandes)
      var rb = barra.getBoundingClientRect(), rl = li.getBoundingClientRect();
      var escala = rb.width / (barra.offsetWidth || rb.width) || 1;
      var largura = barra.offsetWidth, w = Math.min(340, largura - 16);
      var esq = (rl.left - rb.left) / escala;
      janela.style.width = w + 'px';
      janela.style.left = Math.max(8, Math.min(esq, largura - w - 8)) + 'px';
    }
    function abrir(li, peloTeclado) {
      var chave = li.getAttribute('data-chave');
      if (aberta === chave) return fechar();
      aberta = chave;
      origem = peloTeclado ? li : null;
      preencher(chave);
      posicionar(li);
      janela.hidden = false;
      barra.classList.add('aberta'); // pausa a faixa enquanto a janelinha estiver aberta
      if (peloTeclado) janela.focus();
    }
    function fechar() {
      if (!aberta) return;
      aberta = null;
      janela.hidden = true;
      barra.classList.remove('aberta');
      if (origem && document.body.contains(origem)) origem.focus();
      origem = null;
    }
    trilho.addEventListener('click', function (e) {
      var li = e.target.closest('.cot[data-chave]');
      if (li) { e.stopPropagation(); abrir(li, false); }
    });
    trilho.addEventListener('keydown', function (e) {
      var li = e.target.closest('.cot[data-chave]');
      if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(li, true); }
    });
    janela.addEventListener('click', function (e) {
      e.stopPropagation();
      if (e.target.closest('.cot-fechar')) fechar();
    });
    document.addEventListener('click', function () { fechar(); }); // clicar fora fecha
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fechar(); });
    window.addEventListener('resize', fechar);
    window.addEventListener('hashchange', fechar);

    carregar();
    setInterval(function () { if (!document.hidden) carregar(); }, INTERVALO);
  })();

  /* ---------- Mede o cabeçalho, a faixa de cotações e o rodapé de verdade ----------
     O espaço do conteúdo é calculado a partir dessas alturas (--chrome). Cada navegador/sistema
     desenha as letras e o widget com alturas um pouco diferentes; medindo, a aba sempre cabe sem rolar. */
  (function () {
    var partes = ['.topbar', '.quotes-bar', '.site-footer'].map(function (s) { return document.querySelector(s); });
    if (partes.some(function (p) { return !p; })) return;
    var main = document.querySelector('main');
    function medir() {
      var b = document.body;
      var total = partes.reduce(function (t, p) { return t + p.offsetHeight; }, 0);
      b.style.setProperty('--chrome', total + 'px');
      b.style.removeProperty('--pad-top');
      // Se mesmo assim ainda sobrar alguns pixels (letras maiores em algum sistema), diminui o espaço acima do título
      if (window.innerWidth > 900 && main) {
        var z = window.CODEVALE_ZOOM || 1;
        var sobra = (document.documentElement.scrollHeight - window.innerHeight) / z;
        if (sobra > 0) {
          var topo = parseFloat(getComputedStyle(main).paddingTop) || 0;
          b.style.setProperty('--pad-top', Math.max(8, topo - sobra - 1) + 'px');
        }
      }
    }
    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('hashchange', function () { setTimeout(medir, 0); });
    window.addEventListener('load', medir);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(medir);
    setTimeout(medir, 3000);
  })();

  /* ---------- Ano no rodapé ---------- */
  document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
