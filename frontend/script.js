(function () {
  'use strict';

  /* ==================== 1. DADOS FIXOS ==================== */
  const TIPOS = [
    { id: 'clinico',   rotulo: 'Clínico geral' },
    { id: 'prenatal',  rotulo: 'Pré-natal' },
    { id: 'ultrassom', rotulo: 'Ultrassom' },
    { id: 'odonto',    rotulo: 'Odontologia' },
    { id: 'retorno',   rotulo: 'Retorno' }
  ];

  const COMUNIDADES = [
    { id: 'c1', nome: 'Vila Esperança',              naRota: true },
    { id: 'c2', nome: 'Ribeirão Seco',               naRota: true },
    { id: 'c3', nome: 'Sítio das Palmeiras',         naRota: true },
    { id: 'c4', nome: 'Assentamento Novo Horizonte', naRota: true },
    { id: 'c5', nome: 'Beira do Rio',                naRota: true },
    { id: 'c6', nome: 'Serra Alta',                  naRota: false }
  ];

  // Regra de acesso: cada PIN libera apenas as comunidades listadas ('*' = todas)
  const COORDENADORES = [
    { pin: '1010', nome: 'Dra. Helena (Coordenação Geral)', comunidades: ['*'] },
    { pin: '2020', nome: 'Enf. Carlos (Regional Norte)',    comunidades: ['c1', 'c2', 'c3'] },
    { pin: '3030', nome: 'Enf. Mariana (Regional Sul)',     comunidades: ['c4', 'c5', 'c6'] }
  ];

  const LIMITE_PRENATAL = 3;
  const CHAVE_STORAGE = 'rota-saude:v1';

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

  /* ==================== 2. ESTADO E PERSISTÊNCIA ==================== */
  const $ = (sel) => document.querySelector(sel);
  let demandas = [];
  let rascunho = null;
  let coordenadorAtivo = JSON.parse(sessionStorage.getItem('rota-saude:coord') || 'null');
  const abertas = new Set();

  function carregarDados() {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_STORAGE) || 'null');
    if (salvo && Array.isArray(salvo.demandas)) {
      demandas = salvo.demandas;
    } else {
      demandas = EXEMPLOS.map((x, i) => ({
        id: 'ex-' + (i + 1), atendida: false, criadaEm: Date.now() + i,
        comunidadeId: x[0], tipo: x[1], prioridade: x[2], nome: x[3], nascimento: x[4], cartaoSus: ''
      }));
      salvarDados();
    }
  }

  function salvarDados() {
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify({ demandas }));
  }

  window.resetarDados = function () {
    localStorage.removeItem(CHAVE_STORAGE);
    carregarDados();
    atualizarTelaCoordenacao();
    atualizarAjudaComunidade();
  };

  /* ==================== 3. UTILITÁRIOS ==================== */
  const rotuloTipo = (id) => TIPOS.find((t) => t.id === id).rotulo;
  const nomeComunidade = (id) => COMUNIDADES.find((c) => c.id === id).nome;
  const formatarDataBR = (iso) => iso.split('-').reverse().join('/');
  const hojeISO = () => new Date().toISOString().slice(0, 10);

  function calcularIdade(iso) {
    const [ano, mes, dia] = iso.split('-').map(Number);
    const hoje = new Date();
    let idade = hoje.getFullYear() - ano;
    if (hoje.getMonth() + 1 < mes || (hoje.getMonth() + 1 === mes && hoje.getDate() < dia)) idade--;
    return idade;
  }

  let timerAviso;
  function avisar(texto) {
    const el = $('#aviso');
    el.textContent = texto;
    el.classList.add('visivel');
    clearTimeout(timerAviso);
    timerAviso = setTimeout(() => el.classList.remove('visivel'), 3500);
  }

  /* ==================== 4. NAVEGAÇÃO ENTRE ABAS ==================== */
  function ativarAba(qual) {
    const ehAcs = qual === 'acs';
    $('#aba-acs').setAttribute('aria-selected', ehAcs);
    $('#aba-coord').setAttribute('aria-selected', !ehAcs);
    $('#tela-acs').hidden = !ehAcs;
    $('#tela-coord').hidden = ehAcs;

    if (!ehAcs) {
      atualizarTelaCoordenacao();
      if (!coordenadorAtivo) $('#pin-coord').focus();
    }
  }

  $('#aba-acs').addEventListener('click', () => ativarAba('acs'));
  $('#aba-coord').addEventListener('click', () => ativarAba('coord'));

  /* ==================== 5. TELA DO ACS (FORM + REVISÃO) ==================== */
  const form = $('#form-demanda');
  const selComunidade = $('#comunidade');

  // Preenche o select de comunidades e os botões de tipo de atendimento
  COMUNIDADES.forEach((c) => selComunidade.add(new Option(c.nome, c.id)));
  $('#opcoes-tipo').innerHTML = TIPOS.map((t) => `
    <label class="opcao">
      <input type="radio" name="tipo" value="${t.id}">
      <span><strong>${t.rotulo}</strong></span>
    </label>
  `).join('');

  function atualizarAjudaComunidade() {
    const id = selComunidade.value;
    if (!id) { $('#ajuda-comunidade').textContent = ''; return; }
    const qtd = demandas.filter((d) => d.comunidadeId === id && !d.atendida).length;
    $('#ajuda-comunidade').textContent = qtd === 0
      ? 'Nenhuma demanda aguardando nesta comunidade.'
      : `${qtd} ${qtd === 1 ? 'demanda aguardando' : 'demandas aguardando'} atendimento nesta comunidade.`;
  }
  selComunidade.addEventListener('change', atualizarAjudaComunidade);

  function validarFormulario(v) {
    const erros = [];
    const marcar = (campo, msg) => {
      const p = $('#erro-' + campo);
      p.textContent = msg;
      p.hidden = !msg;
      p.closest('.campo').classList.toggle('invalido', !!msg);
      if (msg) erros.push(msg);
    };

    marcar('comunidade', v.comunidadeId ? '' : 'Escolha a comunidade onde o paciente mora.');
    marcar('tipo', v.tipo ? '' : 'Escolha o tipo de atendimento.');
    marcar('prioridade', v.prioridade ? '' : 'Marque se é rotina ou prioritária.');

    let erroNome = '';
    if (!v.nome) erroNome = 'Escreva o nome do paciente.';
    else if (v.nome.split(' ').length < 2) erroNome = 'Escreva o nome e o sobrenome do paciente.';
    marcar('nome', erroNome);

    let erroNasc = '';
    if (!v.nascimento) erroNasc = 'Informe a data de nascimento.';
    else if (v.nascimento > hojeISO() || calcularIdade(v.nascimento) > 120) erroNasc = 'Data de nascimento inválida.';
    marcar('nascimento', erroNasc);

    const susLimpo = v.cartaoSus.replace(/\D/g, '');
    marcar('cartaoSus', susLimpo && susLimpo.length !== 15 ? 'O Cartão SUS deve ter exatamente 15 números.' : '');

    const boxErros = $('#resumo-erros');
    boxErros.hidden = erros.length === 0;
    boxErros.innerHTML = erros.length
      ? `<p>Corrija ${erros.length} item(ns) antes de continuar:</p><ul>${erros.map((e) => `<li>${e}</li>`).join('')}</ul>`
      : '';

    return erros.length === 0;
  }

  // Etapa 1: Valida e mostra a tela de revisão
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    $('#confirmacao').hidden = true;

    const fd = new FormData(form);
    const dados = {
      comunidadeId: fd.get('comunidade') || '',
      tipo: fd.get('tipo') || '',
      prioridade: fd.get('prioridade') || '',
      nome: (fd.get('nome') || '').replace(/\s+/g, ' ').trim(),
      nascimento: fd.get('nascimento') || '',
      cartaoSus: (fd.get('cartaoSus') || '').replace(/\D/g, '')
    };

    if (!validarFormulario(dados)) {
      $('#resumo-erros').focus();
      return;
    }

    rascunho = dados;
    const susFormatado = dados.cartaoSus
      ? dados.cartaoSus.replace(/(\d{3})(\d{4})(\d{4})(\d{4})/, '$1 $2 $3 $4')
      : 'Não informado';

    $('#lista-revisao').innerHTML = `
      <dt>Comunidade</dt><dd>${nomeComunidade(dados.comunidadeId)}</dd>
      <dt>Atendimento</dt><dd>${rotuloTipo(dados.tipo)}</dd>
      <dt>Prioridade</dt><dd class="${dados.prioridade === 'prioritaria' ? 'revisao-prio' : ''}">
        ${dados.prioridade === 'prioritaria' ? 'Prioritária (atender primeiro)' : 'Rotina'}
      </dd>
      <dt>Paciente</dt><dd>${dados.nome}</dd>
      <dt>Nascimento</dt><dd>${formatarDataBR(dados.nascimento)} (${calcularIdade(dados.nascimento)} anos)</dd>
      <dt>Cartão SUS</dt><dd>${susFormatado}</dd>
    `;

    form.hidden = true;
    $('#painel-revisao').hidden = false;
    $('#painel-revisao').focus();
  });

  // Etapa 2A: Voltar para corrigir
  $('#btn-voltar-edicao').addEventListener('click', () => {
    $('#painel-revisao').hidden = true;
    form.hidden = false;
    $('#nome').focus();
  });

  // Etapa 2B: Confirmar e salvar no localStorage
  $('#btn-confirmar-envio').addEventListener('click', () => {
    if (!rascunho) return;

    demandas.push({ id: 'd-' + Date.now(), atendida: false, criadaEm: Date.now(), ...rascunho });
    salvarDados();

    const comAtual = rascunho.comunidadeId;
    const nomeSalvo = rascunho.nome;
    rascunho = null;

    form.reset();
    selComunidade.value = comAtual;
    atualizarAjudaComunidade();

    $('#painel-revisao').hidden = true;
    form.hidden = false;

    const conf = $('#confirmacao');
    conf.textContent = `Pronto! A demanda de ${nomeSalvo} foi registrada em ${nomeComunidade(comAtual)}.`;
    conf.hidden = false;
    conf.focus();
  });

  /* ==================== 6. TELA DA COORDENAÇÃO (PIN + FILTRO) ==================== */
  $('#form-login-coord').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#pin-coord');
    const encontrado = COORDENADORES.find((c) => c.pin === input.value.trim());

    if (!encontrado) {
      $('#erro-pin').textContent = 'Código inválido. Tente 1010, 2020 ou 3030.';
      $('#erro-pin').hidden = false;
      input.closest('.campo').classList.add('invalido');
      return;
    }

    $('#erro-pin').hidden = true;
    input.closest('.campo').classList.remove('invalido');
    input.value = '';
    coordenadorAtivo = encontrado;
    sessionStorage.setItem('rota-saude:coord', JSON.stringify(encontrado));
    atualizarTelaCoordenacao();
    avisar('Acesso liberado: ' + encontrado.nome);
  });

  $('#btn-sair-coord').addEventListener('click', () => {
    coordenadorAtivo = null;
    sessionStorage.removeItem('rota-saude:coord');
    atualizarTelaCoordenacao();
    avisar('Aba de coordenação bloqueada.');
  });

  function atualizarTelaCoordenacao() {
    $('#bloqueio-coord').hidden = !!coordenadorAtivo;
    $('#painel-coord').hidden = !coordenadorAtivo;
    if (!coordenadorAtivo) return;

    $('#info-coordenador').textContent = coordenadorAtivo.nome;

    // Filtra apenas comunidades na rota E autorizadas para o coordenador logado
    const permitidas = coordenadorAtivo.comunidades;
    const rota = COMUNIDADES.filter((c) => c.naRota && (permitidas.includes('*') || permitidas.includes(c.id)));

    // Calcula totais gerais para os cards do topo
    let totalGeral = 0, prioGeral = 0, alertasPrenatal = 0;
    rota.forEach((c) => {
      const pend = demandas.filter((d) => d.comunidadeId === c.id && !d.atendida);
      totalGeral += pend.length;
      prioGeral += pend.filter((d) => d.prioridade === 'prioritaria').length;
      if (pend.filter((d) => d.tipo === 'prenatal').length >= LIMITE_PRENATAL) alertasPrenatal++;
    });

    $('#resumo-rota').innerHTML = `
      <div class="numero"><strong>${totalGeral}</strong><span>demandas aguardando</span></div>
      <div class="numero"><strong>${prioGeral}</strong><span>prioritárias</span></div>
      <div class="numero ${alertasPrenatal > 0 ? 'destaque' : ''}">
        <strong>${alertasPrenatal}</strong>
        <span>${alertasPrenatal === 1 ? 'comunidade com muito pré-natal' : 'comunidades com muito pré-natal'}</span>
      </div>
    `;

    // Renderiza os cartões de cada comunidade permitida
    $('#lista-comunidades').innerHTML = rota.map((c) => {
      const todas = demandas.filter((d) => d.comunidadeId === c.id);
      const aguardando = todas.filter((d) => !d.atendida)
        .sort((a, b) => (a.prioridade === b.prioridade ? a.criadaEm - b.criadaEm : a.prioridade === 'prioritaria' ? -1 : 1));
      const atendidas = todas.filter((d) => d.atendida);

      const qtdPrenatal = aguardando.filter((d) => d.tipo === 'prenatal').length;
      const alerta = qtdPrenatal >= LIMITE_PRENATAL;

      const linhasTabela = TIPOS.map((t) => {
        const doTipo = aguardando.filter((d) => d.tipo === t.id);
        const prioTipo = doTipo.filter((d) => d.prioridade === 'prioritaria').length;
        return `
          <tr class="${t.id === 'prenatal' && alerta ? 'linha-prenatal-alta' : ''}">
            <td>${t.rotulo}</td>
            <td class="${doTipo.length ? '' : 'zero'}">${doTipo.length}</td>
            <td class="${prioTipo ? 'tag-prio' : 'zero'}">${prioTipo}</td>
          </tr>
        `;
      }).join('');

      const linhaPaciente = (d) => `
        <li class="demanda ${d.prioridade === 'prioritaria' ? 'prioritaria' : ''} ${d.atendida ? 'atendida' : ''}">
          <span class="nome">${d.nome}</span>
          <span class="detalhe">${rotuloTipo(d.tipo)} · ${calcularIdade(d.nascimento)} anos${d.prioridade === 'prioritaria' ? ' · Prioritária' : ''}</span>
          <button type="button" class="${d.atendida ? 'botao-desfazer' : 'botao-atender'}" data-id="${d.id}">
            ${d.atendida ? 'Desfazer' : 'Marcar como atendida'}
          </button>
        </li>
      `;

      return `
        <article class="comunidade ${alerta ? 'alerta-prenatal' : ''}">
          <header>
            <h3>${c.nome}</h3>
            <span class="total">${aguardando.length} ${aguardando.length === 1 ? 'demanda' : 'demandas'}</span>
          </header>
          ${alerta ? `<p class="selo-prenatal">Muitas gestantes: ${qtdPrenatal} em pré-natal</p>` : ''}
          <table>
            <thead><tr><th>Tipo</th><th>Total</th><th>Prioritárias</th></tr></thead>
            <tbody>${linhasTabela}</tbody>
          </table>
          <details data-com="${c.id}" ${abertas.has(c.id) ? 'open' : ''}>
            <summary>Ver pacientes (${aguardando.length} aguardando)</summary>
            ${aguardando.length
              ? `<ul class="demandas">${aguardando.map(linhaPaciente).join('')}</ul>`
              : `<p class="vazio">Todas as demandas desta comunidade foram atendidas.</p>`}
            ${atendidas.length
              ? `<p class="subtitulo">Já atendidas (${atendidas.length})</p><ul class="demandas">${atendidas.map(linhaPaciente).join('')}</ul>`
              : ''}
          </details>
        </article>
      `;
    }).join('');

    atualizarAjudaComunidade();
  }

  // Clique em "Marcar como atendida" ou "Desfazer"
  $('#lista-comunidades').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    const d = demandas.find((x) => String(x.id) === btn.dataset.id);
    if (!d) return;

    d.atendida = !d.atendida;
    abertas.add(d.comunidadeId);
    salvarDados();
    atualizarTelaCoordenacao();
    avisar(d.atendida ? `Demanda de ${d.nome} marcada como atendida.` : `Demanda de ${d.nome} voltou para a fila.`);
  });

  // Guarda quais listas <details> o coordenador deixou abertas
  $('#lista-comunidades').addEventListener('toggle', (e) => {
    if (e.target.tagName !== 'DETAILS') return;
    if (e.target.open) abertas.add(e.target.dataset.com);
    else abertas.delete(e.target.dataset.com);
  }, true);

  /* ==================== 7. INICIALIZAÇÃO ==================== */
  carregarDados();
  atualizarAjudaComunidade();
})();