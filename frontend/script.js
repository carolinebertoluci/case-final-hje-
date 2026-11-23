(function () {
  'use strict';

  /* ========== DADOS ========== */
  const TIPOS = [
    { id: 'clinico',    rotulo: 'Clínico geral' },
    { id: 'prenatal',   rotulo: 'Pré-natal' },
    { id: 'ultrassom',  rotulo: 'Ultrassom' },
    { id: 'odonto',     rotulo: 'Odontologia' },
    { id: 'retorno',    rotulo: 'Retorno' }
  ];

  // A partir de quantas demandas pendentes de pré-natal a comunidade ganha destaque.
  const LIMITE_PRENATAL = 3;

  // naRota: true = faz parte da próxima rota da equipe
  const COMUNIDADES = [
    { id: 'c1', nome: 'Vila Esperança',   naRota: true },
    { id: 'c2', nome: 'Ribeirão Seco',    naRota: true },
    { id: 'c3', nome: 'Sítio das Palmeiras', naRota: true },
    { id: 'c4', nome: 'Assentamento Novo Horizonte', naRota: true },
    { id: 'c5', nome: 'Beira do Rio',     naRota: true },
    { id: 'c6', nome: 'Serra Alta',       naRota: false }
  ];
// Perfis de coordenação e quais comunidades cada um pode acessar ('*' = todas)
  const COORDENADORES = [
    { pin: '1010', nome: 'Dra. Helena (Coordenação Geral)', comunidades: ['*'] },
    { pin: '2020', nome: 'Enf. Carlos (Regional Norte)',    comunidades: ['c1', 'c2', 'c3'] },
    { pin: '3030', nome: 'Enf. Mariana (Regional Sul)',     comunidades: ['c4', 'c5', 'c6'] }
  ];

  // Guarda o coordenador logado na sessão atual (ao fechar a aba, bloqueia de novo)
  let coordenadorAtivo = null;
  try {
    const salvo = sessionStorage.getItem('rota-saude:coord');
    if (salvo) coordenadorAtivo = JSON.parse(salvo);
  } catch (e) { /* ignora */ }
  /* ========== ARMAZENAMENTO (localStorage) ==========
     Os dados ficam salvos neste navegador e sobrevivem ao recarregar a página.
     Cada demanda tem o campo "sincronizada": false = ainda não enviada ao servidor.
     Quando existir um backend, basta preencher API_URL. */
  const CHAVE = 'rota-saude:v1';
  const API_URL = null; // exemplo: 'http://localhost:5000/api'

  const demandas = [];

  // Dados de exemplo (usados só na primeira vez ou ao chamar resetarDados())
  const EXEMPLOS = [
    ['c1', 'prenatal', 'prioritaria', 'Ana Paula Ribeiro', '1998-03-12'],
    ['c1', 'prenatal', 'rotina', 'Juliana Souza Lima', '2001-07-30'],
    ['c1', 'prenatal', 'rotina', 'Camila Ferreira', '1995-11-02'],
    ['c1', 'ultrassom', 'rotina', 'Rita de Cássia Alves', '1992-01-18'],
    ['c1', 'clinico', 'prioritaria', 'José Antônio Pereira', '1950-05-09'],
    ['c2', 'clinico', 'rotina', 'Marcos Vinícius Dias', '1987-09-21'],
    ['c2', 'odonto', 'rotina', 'Lucas Gabriel Rocha', '2012-04-14'],
    ['c2', 'retorno', 'prioritaria', 'Maria Aparecida Santos', '1944-12-01'],
    ['c3', 'prenatal', 'prioritaria', 'Fernanda Oliveira', '2003-02-25'],
    ['c3', 'prenatal', 'prioritaria', 'Larissa Mendes', '1999-06-17'],
    ['c3', 'prenatal', 'rotina', 'Patrícia Gomes', '1990-10-05'],
    ['c3', 'prenatal', 'rotina', 'Sandra Regina Costa', '1996-08-08'],
    ['c3', 'clinico', 'rotina', 'Antônio Carlos Nunes', '1960-03-03'],
    ['c4', 'odonto', 'rotina', 'Pedro Henrique Lima', '2010-01-27'],
    ['c4', 'clinico', 'rotina', 'Helena Martins', '1978-05-30'],
    ['c4', 'prenatal', 'rotina', 'Bruna Carvalho', '2000-09-09'],
    ['c5', 'retorno', 'rotina', 'Francisco das Chagas', '1955-07-07'],
    ['c5', 'ultrassom', 'prioritaria', 'Vanessa Teixeira', '1994-12-19']
  ];

  // Id único gerado no aparelho, para não repetir entre vários ACS
  function novoId() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* segue */ }
    return 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function criarExemplos() {
    demandas.length = 0;
    EXEMPLOS.forEach(function (x, i) {
      demandas.push({
        id: 'ex-' + (i + 1), atendida: false, criadaEm: Date.now() + i, sincronizada: true,
        comunidadeId: x[0], tipo: x[1], prioridade: x[2], nome: x[3], nascimento: x[4], cartaoSus: ''
      });
    });
  }

  function lerArmazenado() {
    try {
      const bruto = localStorage.getItem(CHAVE);
      if (!bruto) return false;
      const dados = JSON.parse(bruto);
      if (!dados || !Array.isArray(dados.demandas)) return false;
      demandas.length = 0;
      dados.demandas.forEach(function (d) { demandas.push(d); });
      return true;
    } catch (e) {
      return false;
    }
  }

  function gravar() {
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ versao: 1, demandas: demandas }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function salvar() {
    if (!gravar()) {
      avisar('Não foi possível salvar neste aparelho. Os dados podem sumir ao fechar a página.');
    }
    sincronizar();
  }

  function adicionarDemanda(d) {
    const demanda = Object.assign(
      { id: novoId(), atendida: false, criadaEm: Date.now(), sincronizada: false }, d);
    demandas.push(demanda);
    salvar();
    return demanda;
  }

  function alterarAtendimento(demanda, atendida) {
    demanda.atendida = atendida;
    demanda.sincronizada = false; // mudou, precisa ser enviada de novo
    salvar();
  }

  // Apaga o que foi salvo e volta aos dados de exemplo (útil antes da apresentação)
  function resetarDados() {
    try { localStorage.removeItem(CHAVE); } catch (e) { /* ignora */ }
    criarExemplos();
    gravar();
    renderCoordenacao();
    atualizarAjudaComunidade();
  }
  window.resetarDados = resetarDados; // rode resetarDados() no console do navegador

  /* ----- Sincronização com o servidor (só age se API_URL estiver preenchida) ----- */
  let sincronizando = false;
  function sincronizar() {
    if (!API_URL || sincronizando || !navigator.onLine) return;
    const pendentes = demandas.filter(function (d) { return !d.sincronizada; });
    if (!pendentes.length) return;

    sincronizando = true;
    fetch(API_URL + '/demandas/sincronizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demandas: pendentes })
    })
      .then(function (r) { if (!r.ok) throw new Error('Erro ' + r.status); return r.json(); })
      .then(function () {
        pendentes.forEach(function (d) { d.sincronizada = true; });
        gravar();
      })
      .catch(function () { /* sem sinal ou servidor fora: continua pendente e tenta depois */ })
      .then(function () { sincronizando = false; });
  }
  window.addEventListener('online', sincronizar);

  /* ========== UTILITÁRIOS ========== */
  const $ = function (sel) { return document.querySelector(sel); };

  function el(tag, attrs) {
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    for (let i = 2; i < arguments.length; i++) {
      const filho = arguments[i];
      if (filho == null) continue;
      node.appendChild(typeof filho === 'string' ? document.createTextNode(filho) : filho);
    }
    return node;
  }

  function rotuloTipo(id) { return TIPOS.find(function (t) { return t.id === id; }).rotulo; }
  function nomeComunidade(id) { return COMUNIDADES.find(function (c) { return c.id === id; }).nome; }

  function hojeISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function calcularIdade(iso) {
    const p = iso.split('-').map(Number);
    const h = new Date();
    let idade = h.getFullYear() - p[0];
    if (h.getMonth() + 1 < p[1] || (h.getMonth() + 1 === p[1] && h.getDate() < p[2])) idade--;
    return idade;
  }

  function plural(n, singular, pluralTxt) { return n + ' ' + (n === 1 ? singular : pluralTxt); }

  let temporizador;
  function avisar(texto) {
    const aviso = $('#aviso');
    aviso.textContent = texto;
    aviso.classList.add('visivel');
    clearTimeout(temporizador);
    temporizador = setTimeout(function () { aviso.classList.remove('visivel'); }, 3500);
  }

  /* ========== ABAS ========== */
  const abas = [
    { botao: $('#aba-acs'),   tela: $('#tela-acs') },
    { botao: $('#aba-coord'), tela: $('#tela-coord') }
  ];

  function ativarAba(indice, focar) {
    abas.forEach(function (a, i) {
      const ativa = i === indice;
      a.botao.setAttribute('aria-selected', ativa);
      a.botao.tabIndex = ativa ? 0 : -1;
      a.tela.hidden = !ativa;
    });
    if (focar) abas[indice].botao.focus();
    if (indice === 1) renderCoordenacao();
  }

  abas.forEach(function (a, i) {
    a.botao.addEventListener('click', function () { ativarAba(i); });
    a.botao.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        ativarAba((i + 1) % abas.length, true);
      }
    });
  });

  /* ========== TELA DO ACS ========== */
  const form = $('#form-demanda');
  const selComunidade = $('#comunidade');

  COMUNIDADES.forEach(function (c) {
    selComunidade.appendChild(el('option', { value: c.id, text: c.nome }));
  });

  const boxTipos = $('#opcoes-tipo');
  TIPOS.forEach(function (t) {
    boxTipos.appendChild(
      el('label', { class: 'opcao' },
        el('input', { type: 'radio', name: 'tipo', value: t.id }),
        el('span', {}, el('strong', { text: t.rotulo }))
      )
    );
  });

  function atualizarAjudaComunidade() {
    const ajuda = $('#ajuda-comunidade');
    const id = selComunidade.value;
    if (!id) { ajuda.textContent = ''; return; }
    const n = demandas.filter(function (d) { return d.comunidadeId === id && !d.atendida; }).length;
    ajuda.textContent = n === 0
      ? 'Nenhuma demanda aguardando nesta comunidade.'
      : plural(n, 'demanda aguardando', 'demandas aguardando') + ' atendimento nesta comunidade.';
  }

  /* ----- Validação ----- */
  const regras = {
    comunidade: function (v) {
      return v.comunidade ? '' : 'Escolha a comunidade onde o paciente mora.';
    },
    tipo: function (v) {
      return v.tipo ? '' : 'Escolha o tipo de atendimento que o paciente precisa.';
    },
    prioridade: function (v) {
      return v.prioridade ? '' : 'Marque se o atendimento é de rotina ou prioritário.';
    },
    nome: function (v) {
      const nome = v.nome.replace(/\s+/g, ' ').trim();
      if (!nome) return 'Escreva o nome do paciente.';
      if (!/^[\p{L}][\p{L}'’.\- ]*$/u.test(nome)) return 'Use só letras no nome. Não coloque números nem símbolos.';
      if (nome.split(' ').length < 2) return 'Escreva o nome e o sobrenome do paciente, para não confundir com outra pessoa.';
      return '';
    },
    nascimento: function (v, campo) {
      if (campo.validity.badInput) return 'Essa data não existe. Confira o dia, o mês e o ano.';
      if (!v.nascimento) return 'Informe a data de nascimento do paciente.';
      if (v.nascimento > hojeISO()) return 'A data de nascimento não pode ser no futuro. Confira o ano.';
      if (calcularIdade(v.nascimento) > 120) return 'Essa data deixaria o paciente com mais de 120 anos. Confira o ano.';
      return '';
    },
    cartaoSus: function (v) {
      const num = v.cartaoSus.replace(/[\s.\-]/g, '');
      if (!num) return '';
      if (!/^\d+$/.test(num)) return 'O Cartão SUS tem só números. Confira ou deixe em branco.';
      if (num.length !== 15) return 'O Cartão SUS tem 15 números e você digitou ' + num.length + '. Confira ou deixe em branco.';
      return '';
    }
  };

  const ordemCampos = ['comunidade', 'tipo', 'prioridade', 'nome', 'nascimento', 'cartaoSus'];

  function lerValores() {
    const fd = new FormData(form);
    return {
      comunidade: fd.get('comunidade') || '',
      tipo: fd.get('tipo') || '',
      prioridade: fd.get('prioridade') || '',
      nome: fd.get('nome') || '',
      nascimento: fd.get('nascimento') || '',
      cartaoSus: fd.get('cartaoSus') || ''
    };
  }

  function elementoCampo(nome) {
    return form.querySelector('[name="' + nome + '"]');
  }

  function mostrarErro(nome, msg) {
    const p = $('#erro-' + nome);
    const campo = elementoCampo(nome);
    const caixa = campo.closest('.campo');
    p.textContent = msg;
    p.hidden = !msg;
    caixa.classList.toggle('invalido', !!msg);
    if (campo.type === 'radio') campo.setAttribute('aria-invalid', !!msg);
    else campo.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  function validarCampo(nome) {
    const msg = regras[nome](lerValores(), elementoCampo(nome));
    mostrarErro(nome, msg);
    return msg;
  }

  function validarTudo() {
    const erros = [];
    ordemCampos.forEach(function (nome) {
      const msg = validarCampo(nome);
      if (msg) erros.push({ nome: nome, msg: msg });
    });
    return erros;
  }

  // Valida ao sair do campo e limpa o erro ao corrigir
  ['comunidade', 'nome', 'nascimento', 'cartaoSus'].forEach(function (nome) {
    const campo = elementoCampo(nome);
    campo.addEventListener('blur', function () { validarCampo(nome); });
    campo.addEventListener('input', function () {
      if (!$('#erro-' + nome).hidden) validarCampo(nome);
    });
  });
  form.querySelectorAll('input[name="tipo"]').forEach(function (r) {
    r.addEventListener('change', function () { validarCampo('tipo'); });
  });
  form.querySelectorAll('input[name="prioridade"]').forEach(function (r) {
    r.addEventListener('change', function () { validarCampo('prioridade'); });
  });
  selComunidade.addEventListener('change', atualizarAjudaComunidade);

  // Em campos de rádio, a classe "invalido" fica no fieldset
  form.querySelectorAll('fieldset.campo').forEach(function (f) {
    f.classList.add('campo');
  });

  function mostrarResumoErros(erros) {
    const box = $('#resumo-erros');
    box.textContent = '';
    if (!erros.length) { box.hidden = true; return; }
    box.appendChild(el('p', { text: erros.length === 1
      ? 'Falta corrigir 1 item para registrar a demanda:'
      : 'Faltam corrigir ' + erros.length + ' itens para registrar a demanda:' }));
    const ul = el('ul');
    erros.forEach(function (e) {
      const a = el('a', { href: '#', text: e.msg });
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        elementoCampo(e.nome).focus();
      });
      ul.appendChild(el('li', {}, a));
    });
    box.appendChild(ul);
    box.hidden = false;
  }

let rascunhoDemanda = null;
  const painelRevisao = $('#painel-revisao');
  const listaRevisao = $('#lista-revisao');

  function formatarDataBR(iso) {
    const p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function formatarSus(num) {
    if (!num) return 'Não informado';
    return num.replace(/(\d{3})(\d{4})(\d{4})(\d{4})/, '$1 $2 $3 $4');
  }

  function abrirRevisao(dados) {
    rascunhoDemanda = dados;
    listaRevisao.textContent = '';

    const itens = [
      { rotulo: 'Comunidade', valor: nomeComunidade(dados.comunidadeId) },
      { rotulo: 'Tipo de atendimento', valor: rotuloTipo(dados.tipo) },
      {
        rotulo: 'Prioridade',
        valor: dados.prioridade === 'prioritaria' ? 'Prioritária (atender primeiro)' : 'Rotina',
        destaque: dados.prioridade === 'prioritaria'
      },
      { rotulo: 'Paciente', valor: dados.nome },
      { rotulo: 'Nascimento', valor: formatarDataBR(dados.nascimento) + ' (' + calcularIdade(dados.nascimento) + ' anos)' },
      { rotulo: 'Cartão SUS', valor: formatarSus(dados.cartaoSus) }
    ];

    itens.forEach(function (item) {
      const dt = el('dt', { text: item.rotulo });
      const dd = el('dd', {
        class: item.destaque ? 'revisao-prio' : '',
        text: item.valor
      });
      listaRevisao.appendChild(dt);
      listaRevisao.appendChild(dd);
    });

    form.hidden = true;
    painelRevisao.hidden = false;
    painelRevisao.focus();
    painelRevisao.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Passo 1: Valida e abre a revisão
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    $('#confirmacao').hidden = true;

    const erros = validarTudo();
    mostrarResumoErros(erros);

    if (erros.length) {
      $('#resumo-erros').focus();
      $('#resumo-erros').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const v = lerValores();
    abrirRevisao({
      comunidadeId: v.comunidade,
      tipo: v.tipo,
      prioridade: v.prioridade,
      nome: v.nome.replace(/\s+/g, ' ').trim(),
      nascimento: v.nascimento,
      cartaoSus: v.cartaoSus.replace(/\D/g, '')
    });
  });

  // Passo 2A: Voltar para corrigir algo no formulário
  $('#btn-voltar-edicao').addEventListener('click', function () {
    painelRevisao.hidden = true;
    form.hidden = false;
    $('#nome').focus();
  });

  // Passo 2B: Confirmar e gravar definitivamente
  $('#btn-confirmar-envio').addEventListener('click', function () {
    if (!rascunhoDemanda) return;

    const dados = rascunhoDemanda;
    adicionarDemanda(dados);
    rascunhoDemanda = null;

    // Reseta o formulário mantendo a comunidade selecionada
    const comunidadeAtual = dados.comunidadeId;
    form.reset();
    selComunidade.value = comunidadeAtual;
    ordemCampos.forEach(function (n) { mostrarErro(n, ''); });
    atualizarAjudaComunidade();

    painelRevisao.hidden = true;
    form.hidden = false;

    const conf = $('#confirmacao');
    conf.textContent = 'Pronto! A demanda de ' + dados.nome + ' (' + rotuloTipo(dados.tipo) + ', ' +
      (dados.prioridade === 'prioritaria' ? 'prioritária' : 'rotina') + ') foi registrada em ' +
      nomeComunidade(comunidadeAtual) + '. Você já pode registrar outra.';
    conf.hidden = false;
    conf.focus();
    renderCoordenacao();
  });

  /* ========== TELA DA COORDENAÇÃO ========== */
  const abertas = new Set(); // comunidades com a lista de pacientes aberta

  function pendentes(comId) {
    return demandas.filter(function (d) { return d.comunidadeId === comId && !d.atendida; });
  }

  function contagens(comId) {
    const lista = pendentes(comId);
    const porTipo = {};
    TIPOS.forEach(function (t) {
      const doTipo = lista.filter(function (d) { return d.tipo === t.id; });
      porTipo[t.id] = {
        total: doTipo.length,
        prioritarias: doTipo.filter(function (d) { return d.prioridade === 'prioritaria'; }).length
      };
    });
    return {
      total: lista.length,
      prioritarias: lista.filter(function (d) { return d.prioridade === 'prioritaria'; }).length,
      porTipo: porTipo
    };
  }

  function criarNumero(valor, rotulo, destaque) {
    return el('div', { class: 'numero' + (destaque ? ' destaque' : '') },
      el('strong', { text: String(valor) }), el('span', { text: rotulo }));
  }

  function renderResumo(comunidadesRota) {
    let total = 0, prio = 0, alertas = 0;
    comunidadesRota.forEach(function (c) {
      const k = contagens(c.id);
      total += k.total; prio += k.prioritarias;
      if (k.porTipo.prenatal.total >= LIMITE_PRENATAL) alertas++;
    });
    const box = $('#resumo-rota');
    box.textContent = '';
    box.appendChild(criarNumero(total, 'demandas aguardando'));
    box.appendChild(criarNumero(prio, 'prioritárias'));
    box.appendChild(criarNumero(alertas,
      alertas === 1 ? 'comunidade com muito pré-natal' : 'comunidades com muito pré-natal', alertas > 0));
  }

  function criarLinhaDemanda(d) {
    const detalhe = rotuloTipo(d.tipo) + ' · ' + calcularIdade(d.nascimento) + ' anos' +
      (d.prioridade === 'prioritaria' ? ' · Prioritária' : '');
    const li = el('li', { class: 'demanda' + (d.prioridade === 'prioritaria' ? ' prioritaria' : '') + (d.atendida ? ' atendida' : '') },
      el('span', { class: 'nome', text: d.nome }),
      el('span', { class: 'detalhe', text: detalhe })
    );
    if (d.atendida) {
      li.appendChild(el('button', { type: 'button', class: 'botao-desfazer', 'data-acao': 'desfazer', 'data-id': d.id,
        'aria-label': 'Desfazer: voltar a demanda de ' + d.nome + ' para a lista de espera', text: 'Desfazer' }));
    } else {
      li.appendChild(el('button', { type: 'button', class: 'botao-atender', 'data-acao': 'atender', 'data-id': d.id,
        'aria-label': 'Marcar como atendida a demanda de ' + d.nome, text: 'Marcar como atendida' }));
    }
    return li;
  }

  function criarCartao(c) {
    const k = contagens(c.id);
    const alerta = k.porTipo.prenatal.total >= LIMITE_PRENATAL;
    const cartao = el('article', { class: 'comunidade' + (alerta ? ' alerta-prenatal' : ''), 'data-com': c.id });

    cartao.appendChild(el('header', {},
      el('h3', { text: c.nome }),
      el('span', { class: 'total', text: plural(k.total, 'demanda', 'demandas') })
    ));

    if (alerta) {
      cartao.appendChild(el('p', { class: 'selo-prenatal',
        text: 'Muitas gestantes: ' + k.porTipo.prenatal.total + ' em pré-natal' }));
    }

    const corpo = el('tbody');
    TIPOS.forEach(function (t) {
      const x = k.porTipo[t.id];
      const tr = el('tr', { class: (t.id === 'prenatal' && alerta) ? 'linha-prenatal-alta' : '' },
        el('th', { scope: 'row', text: t.rotulo }),
        el('td', { class: x.total ? '' : 'zero', text: String(x.total) }),
        el('td', { class: x.prioritarias ? 'tag-prio' : 'zero', text: String(x.prioritarias) })
      );
      // th de linha com visual de célula normal
      tr.firstChild.style.fontWeight = 'inherit';
      tr.firstChild.style.fontSize = 'inherit';
      tr.firstChild.style.color = 'inherit';
      corpo.appendChild(tr);
    });
    cartao.appendChild(el('table', {},
      el('caption', { class: 'sr', text: 'Demandas de ' + c.nome + ' por tipo de atendimento' }),
      el('thead', {}, el('tr', {},
        el('th', { scope: 'col', text: 'Tipo' }),
        el('th', { scope: 'col', text: 'Total' }),
        el('th', { scope: 'col', text: 'Prioritárias' })
      )),
      corpo
    ));

    // Lista de pacientes
    const todas = demandas.filter(function (d) { return d.comunidadeId === c.id; });
    const aguardando = todas.filter(function (d) { return !d.atendida; }).sort(function (a, b) {
      if (a.prioridade !== b.prioridade) return a.prioridade === 'prioritaria' ? -1 : 1;
      return a.criadaEm - b.criadaEm;
    });
    const atendidas = todas.filter(function (d) { return d.atendida; });

    const det = el('details', { 'data-com': c.id },
      el('summary', { text: 'Ver pacientes (' + aguardando.length + ' aguardando)' }));
    if (abertas.has(c.id)) det.open = true;

    if (aguardando.length) {
      const ul = el('ul', { class: 'demandas' });
      aguardando.forEach(function (d) { ul.appendChild(criarLinhaDemanda(d)); });
      det.appendChild(ul);
    } else {
      det.appendChild(el('p', { class: 'vazio', text: 'Todas as demandas desta comunidade foram atendidas.' }));
    }
    if (atendidas.length) {
      det.appendChild(el('p', { class: 'subtitulo', text: 'Já atendidas (' + atendidas.length + ')' }));
      const ul2 = el('ul', { class: 'demandas' });
      atendidas.forEach(function (d) { ul2.appendChild(criarLinhaDemanda(d)); });
      det.appendChild(ul2);
    }
    cartao.appendChild(det);
    return cartao;
  }

  function atualizarTelaCoordenacao() {
    const bloqueio = $('#bloqueio-coord');
    const painel = $('#painel-coord');

    if (!coordenadorAtivo) {
      bloqueio.hidden = false;
      painel.hidden = true;
      return;
    }

    bloqueio.hidden = true;
    painel.hidden = false;
    $('#info-coordenador').textContent = coordenadorAtivo.nome;
    renderCoordenacao();
  }

  function renderCoordenacao() {
    if (!coordenadorAtivo) return;

    // Filtra apenas comunidades na rota E permitidas para este coordenador
    const permitidas = coordenadorAtivo.comunidades;
    const rota = COMUNIDADES.filter(function (c) {
      const temPermissao = permitidas.includes('*') || permitidas.includes(c.id);
      return c.naRota && temPermissao;
    });

    $('#subtitulo-coord').textContent = permitidas.includes('*')
      ? 'Exibindo todas as comunidades da próxima rota.'
      : 'Exibindo apenas as comunidades sob sua responsabilidade (' + rota.length + ').';

    renderResumo(rota);
    const lista = $('#lista-comunidades');
    lista.textContent = '';

    if (!rota.length) {
      lista.appendChild(el('p', { class: 'vazio', text: 'Nenhuma comunidade sob sua responsabilidade está na próxima rota.' }));
    } else {
      rota.forEach(function (c) { lista.appendChild(criarCartao(c)); });
    }
    atualizarAjudaComunidade();
  }

  // Eventos de autenticação e bloqueio da aba Coordenação
  const formLoginCoord = $('#form-login-coord');
  if (formLoginCoord) {
    formLoginCoord.addEventListener('submit', function (e) {
      e.preventDefault();
      const inputPin = $('#pin-coord');
      const erroPin = $('#erro-pin');
      const pinDigitado = inputPin.value.trim();

      const encontrado = COORDENADORES.find(function (c) { return c.pin === pinDigitado; });
      if (!encontrado) {
        erroPin.textContent = 'Código inválido. Verifique seu PIN de coordenação.';
        erroPin.hidden = false;
        inputPin.closest('.campo').classList.add('invalido');
        inputPin.focus();
        return;
      }

      erroPin.hidden = true;
      inputPin.closest('.campo').classList.remove('invalido');
      inputPin.value = '';
      coordenadorAtivo = encontrado;
      try { sessionStorage.setItem('rota-saude:coord', JSON.stringify(encontrado)); } catch (err) { /* ignora */ }

      atualizarTelaCoordenacao();
      avisar('Acesso liberado: ' + encontrado.nome);
    });
  }

  const btnSairCoord = $('#btn-sair-coord');
  if (btnSairCoord) {
    btnSairCoord.addEventListener('click', function () {
      coordenadorAtivo = null;
      try { sessionStorage.removeItem('rota-saude:coord'); } catch (err) { /* ignora */ }
      atualizarTelaCoordenacao();
      avisar('Aba de coordenação bloqueada.');
    });
  }

  // Marcar como atendida / desfazer, sem recarregar a página
  $('#lista-comunidades').addEventListener('click', function (e) {
    const botao = e.target.closest('button[data-acao]');
    if (!botao) return;
    const d = demandas.find(function (x) { return String(x.id) === botao.dataset.id; });
    if (!d) return;

    const atender = botao.dataset.acao === 'atender';
    alterarAtendimento(d, atender);
    abertas.add(d.comunidadeId);
    renderCoordenacao();

    // Devolve o foco para um botão próximo, para quem usa teclado
    const cartao = document.querySelector('article[data-com="' + d.comunidadeId + '"]');
    const proximo = cartao && (cartao.querySelector('.botao-atender') || cartao.querySelector('summary'));
    if (proximo) proximo.focus();

    avisar(atender
      ? 'Demanda de ' + d.nome + ' marcada como atendida.'
      : 'Demanda de ' + d.nome + ' voltou para a lista de espera.');
  });

  // Lembra quais listas estão abertas
  $('#lista-comunidades').addEventListener('toggle', function (e) {
    const det = e.target;
    if (det.tagName !== 'DETAILS') return;
    if (det.open) abertas.add(det.dataset.com); else abertas.delete(det.dataset.com);
  }, true);

  /* ========== INÍCIO ========== */
  if (!lerArmazenado()) {   // primeira vez neste navegador: começa com os exemplos
    criarExemplos();
    gravar();
  }
  atualizarAjudaComunidade();
  renderCoordenacao();

  // Se outra aba do mesmo navegador alterar os dados, esta aba atualiza sozinha
  window.addEventListener('storage', function (e) {
    if (e.key !== CHAVE) return;
    if (lerArmazenado()) {
      renderCoordenacao();
      atualizarAjudaComunidade();
    }
  });
})();