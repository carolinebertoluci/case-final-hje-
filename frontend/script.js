(function () {
  'use strict';

  /* ==================== 1. CONFIGURAÇÃO E DADOS FIXOS ==================== */
  const API_URL = 'http://localhost:5000/api';
  const LIMITE_PRENATAL = 3;

  const TIPOS = [
    { id: 'clinico',   rotulo: 'Clínico geral' },
    { id: 'prenatal',  rotulo: 'Pré-natal' },
    { id: 'ultrassom', rotulo: 'Ultrassom' },
    { id: 'odonto',    rotulo: 'Odontologia' },
    { id: 'retorno',   rotulo: 'Retorno' }
  ];

  const COORDENADORES = [
    { pin: '1010', nome: 'Dra. Helena (Coordenação Geral)', comunidades: ['*'] },
    { pin: '2020', nome: 'Enf. Carlos (Regional Norte)',    comunidades: ['c1', 'c2', 'c3'] },
    { pin: '3030', nome: 'Enf. Mariana (Regional Sul)',     comunidades: ['c4', 'c5', 'c6'] }
  ];

  /* ==================== 2. ESTADO ==================== */
  const $ = (sel) => document.querySelector(sel);
  let comunidades = [];
  let rascunho = null;
  let coordenadorAtivo = JSON.parse(sessionStorage.getItem('rota-saude:coord') || 'null');
  const abertas = new Set();

  /* ==================== 3. UTILITÁRIOS DOM (createElement) ==================== */
  function criarEl(tag, props, filhos) {
    const el = document.createElement(tag);
    if (props) {
      Object.entries(props).forEach(([chave, valor]) => {
        if (chave === 'className') el.className = valor;
        else if (chave === 'textContent') el.textContent = valor;
        else if (chave.startsWith('data-')) el.setAttribute(chave, valor);
        else el[chave] = valor;
      });
    }
    if (filhos) {
      filhos.forEach((f) => {
        if (f == null) return;
        el.appendChild(typeof f === 'string' ? document.createTextNode(f) : f);
      });
    }
    return el;
  }

  const rotuloTipo = (id) => TIPOS.find((t) => t.id === id)?.rotulo || id;
  const buscarComunidade = (id) => comunidades.find((c) => c.id === id);
  const formatarDataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : 'Sem data prevista');
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
    timerAviso = setTimeout(() => el.classList.remove('visivel'), 4000);
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

  // Monta opções de tipo via createElement()
  const boxTipos = $('#opcoes-tipo');
  TIPOS.forEach((t, idx) => {
    const input = criarEl('input', { type: 'radio', name: 'tipo', value: t.id, required: idx === 0 });
    const span = criarEl('span', null, [criarEl('strong', { textContent: t.rotulo })]);
    boxTipos.appendChild(criarEl('label', { className: 'opcao' }, [input, span]));
  });

  async function carregarComunidades() {
    try {
      const resp = await fetch(`${API_URL}/comunidades`);
      comunidades = await resp.json();

      selComunidade.textContent = '';
      selComunidade.appendChild(criarEl('option', { value: '', textContent: 'Selecione a comunidade…' }));
      comunidades.forEach((c) => {
        const avisoSeca = c.inacessivel_seca ? ' [INACESSÍVEL NA SECA]' : '';
        selComunidade.appendChild(criarEl('option', { value: c.id, textContent: `${c.nome}${avisoSeca}` }));
      });
    } catch (err) {
      avisar('Erro ao conectar com o servidor Flask.');
    }
  }

  function atualizarAjudaComunidade() {
    const c = buscarComunidade(selComunidade.value);
    const ajuda = $('#ajuda-comunidade');
    if (!c) { ajuda.textContent = ''; return; }

    if (c.inacessivel_seca) {
      const polo = buscarComunidade(c.polo_alternativo_id);
      const txtPolo = polo ? ` (Polo de apoio: ${polo.nome})` : '';
      ajuda.textContent = `Atenção: ${c.nome} está isolada na seca${txtPolo}. Você escolherá o plano na revisão.`;
    } else {
      ajuda.textContent = `Próxima visita prevista: ${formatarDataBR(c.proxima_visita)}.`;
    }
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

    marcar('comunidade', v.comunidade_id ? '' : 'Escolha a comunidade onde o paciente mora.');
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

    marcar('cartaoSus', v.cartao_sus && v.cartao_sus.length !== 15 ? 'O Cartão SUS deve ter exatamente 15 números.' : '');

    const boxErros = $('#resumo-erros');
    boxErros.textContent = '';
    boxErros.hidden = erros.length === 0;

    if (erros.length) {
      boxErros.appendChild(criarEl('p', { textContent: `Corrija ${erros.length} item(ns) antes de continuar:` }));
      const ul = criarEl('ul', null, erros.map((msg) => criarEl('li', { textContent: msg })));
      boxErros.appendChild(ul);
    }

    return erros.length === 0;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    $('#confirmacao').hidden = true;

    const fd = new FormData(form);
    const dados = {
      comunidade_id: (fd.get('comunidade') || '').trim(),
      tipo: (fd.get('tipo') || '').trim(),
      prioridade: (fd.get('prioridade') || '').trim(),
      nome: (fd.get('nome') || '').replace(/\s+/g, ' ').trim(),
      nascimento: (fd.get('nascimento') || '').trim(),
      cartao_sus: (fd.get('cartaoSus') || '').replace(/\D/g, '').trim()
    };

    if (!validarFormulario(dados)) {
      $('#resumo-erros').focus();
      return;
    }

    rascunho = dados;
    const com = buscarComunidade(dados.comunidade_id);
    const susFormatado = dados.cartao_sus
      ? dados.cartao_sus.replace(/(\d{3})(\d{4})(\d{4})(\d{4})/, '$1 $2 $3 $4')
      : 'Não informado';

    const listaRev = $('#lista-revisao');
    listaRev.textContent = '';
    const itensRev = [
      ['Comunidade', `${com.nome} (Visita: ${formatarDataBR(com.proxima_visita)})`, false],
      ['Atendimento', rotuloTipo(dados.tipo), false],
      ['Prioridade', dados.prioridade === 'prioritaria' ? 'Prioritária (atender primeiro)' : 'Rotina', dados.prioridade === 'prioritaria'],
      ['Paciente', dados.nome, false],
      ['Nascimento', `${formatarDataBR(dados.nascimento)} (${calcularIdade(dados.nascimento)} anos)`, false],
      ['Cartão SUS', susFormatado, false]
    ];
    itensRev.forEach(([rotulo, valor, destaque]) => {
      listaRev.appendChild(criarEl('dt', { textContent: rotulo }));
      listaRev.appendChild(criarEl('dd', { className: destaque ? 'revisao-prio' : '', textContent: valor }));
    });

    const boxSeca = $('#box-contingencia-seca');
    if (com.inacessivel_seca) {
      const polo = buscarComunidade(com.polo_alternativo_id);
      $('#rotulo-opcao-polo').textContent = polo
        ? `Encaminhar para Polo: ${polo.nome} (Visita: ${formatarDataBR(polo.proxima_visita)})`
        : 'Encaminhar para Comunidade Polo';
      $('#rotulo-opcao-contingencia').textContent = dados.prioridade === 'prioritaria'
        ? 'Acionar Teleconsulta / Remoção de Urgência (Prioritária)'
        : 'Registrar na Fila de Espera da Seca (Rotina)';
      boxSeca.hidden = false;
    } else {
      boxSeca.hidden = true;
    }

    form.hidden = true;
    $('#painel-revisao').hidden = false;
    $('#painel-revisao').focus();
  });

  $('#btn-voltar-edicao').addEventListener('click', () => {
    $('#painel-revisao').hidden = true;
    form.hidden = false;
    $('#nome').focus();
  });

  $('#btn-confirmar-envio').addEventListener('click', async () => {
    if (!rascunho) return;

    const com = buscarComunidade(rascunho.comunidade_id);
    const estrategia = com.inacessivel_seca
      ? (document.querySelector('input[name="estrategia_seca"]:checked')?.value || 'polo')
      : 'rota';

    try {
      const resp = await fetch(`${API_URL}/demandas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rascunho, estrategia_seca: estrategia })
      });
      const resultado = await resp.json();

      if (!resp.ok) {
        $('#painel-revisao').hidden = true;
        form.hidden = false;

        const boxErros = $('#resumo-erros');
        boxErros.textContent = '';
        boxErros.appendChild(criarEl('p', { textContent: `Registro recusado pelo servidor (Erro ${resp.status}):` }));
        boxErros.appendChild(criarEl('ul', null, [criarEl('li', { textContent: resultado.erro })]));
        boxErros.hidden = false;
        boxErros.focus();
        return;
      }

      const comAtual = rascunho.comunidade_id;
      const nomeSalvo = rascunho.nome;
      const destino = buscarComunidade(resultado.comunidade_id);
      rascunho = null;

      form.reset();
      selComunidade.value = comAtual;
      atualizarAjudaComunidade();

      $('#painel-revisao').hidden = true;
      form.hidden = false;

      const conf = $('#confirmacao');
      const detalheDestino = resultado.modalidade === 'polo'
        ? `redirecionada para o Polo ${destino.nome}`
        : resultado.modalidade === 'teleconsulta_urgente'
          ? 'registrada em ALERTA DE TELECONSULTA / REMOÇÃO'
          : resultado.modalidade === 'fila_seca'
            ? 'registrada na Fila de Contingência da Seca'
            : `salva na rota de ${destino.nome}`;

      conf.textContent = `Pronto! A demanda de ${nomeSalvo} foi ${detalheDestino}.`;
      conf.hidden = false;
      conf.focus();
    } catch (err) {
      avisar('Falha de comunicação com o servidor Flask.');
    }
  });

  /* ==================== 6. TELA DA COORDENAÇÃO (PIN + RESUMO API) ==================== */
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

  async function atualizarTelaCoordenacao() {
    $('#bloqueio-coord').hidden = !!coordenadorAtivo;
    $('#painel-coord').hidden = !coordenadorAtivo;
    if (!coordenadorAtivo) return;

    $('#info-coordenador').textContent = coordenadorAtivo.nome;

    const permitidas = coordenadorAtivo.comunidades;
    const rota = comunidades.filter((c) => c.na_rota && (permitidas.includes('*') || permitidas.includes(c.id)));

    const dadosComunidades = await Promise.all(rota.map(async (c) => {
      const [respResumo, respDemandas] = await Promise.all([
        fetch(`${API_URL}/comunidades/${c.id}/resumo`),
        fetch(`${API_URL}/comunidades/${c.id}/demandas`)
      ]);
      return { resumo: await respResumo.json(), demandas: await respDemandas.json() };
    }));

    let totalGeral = 0, prioGeral = 0, alertasPrenatal = 0, contingenciasUrgentes = 0;
    dadosComunidades.forEach(({ resumo }) => {
      totalGeral += resumo.total_abertas;
      prioGeral += resumo.total_prioritarias;
      contingenciasUrgentes += resumo.contingencia_urgente || 0;
      if ((resumo.por_tipo.prenatal?.total || 0) >= LIMITE_PRENATAL) alertasPrenatal++;
    });

    // Monta indicadores do topo via createElement()
    const boxResumo = $('#resumo-rota');
    boxResumo.textContent = '';
    const criarCardNumero = (valor, rotulo, destaque) =>
      criarEl('div', { className: 'numero' + (destaque ? ' destaque' : '') }, [
        criarEl('strong', { textContent: String(valor) }),
        criarEl('span', { textContent: rotulo })
      ]);

    boxResumo.appendChild(criarCardNumero(totalGeral, 'demandas aguardando', false));
    boxResumo.appendChild(criarCardNumero(prioGeral, 'prioritárias', false));
    boxResumo.appendChild(criarCardNumero(
      alertasPrenatal,
      alertasPrenatal === 1 ? 'comunidade com muito pré-natal' : 'comunidades com muito pré-natal',
      alertasPrenatal > 0
    ));
    if (contingenciasUrgentes > 0) {
      boxResumo.appendChild(criarCardNumero(
        contingenciasUrgentes,
        contingenciasUrgentes === 1 ? 'teleconsulta / remoção urgente' : 'teleconsultas / remoções urgentes',
        true
      ));
    }

    const tagsModalidade = {
      polo: ' · Via Polo (origem isolada)',
      teleconsulta_urgente: ' · ALERTA TELECONSULTA / REMOÇÃO',
      fila_seca: ' · Fila da Seca'
    };

    // Monta cartões de comunidades e listas de pacientes via createElement()
    const listaComunidades = $('#lista-comunidades');
    listaComunidades.textContent = '';

    dadosComunidades.forEach(({ resumo, demandas }) => {
      const qtdPrenatal = resumo.por_tipo.prenatal?.total || 0;
      const alerta = qtdPrenatal >= LIMITE_PRENATAL;

      const cartao = criarEl('article', { className: 'comunidade' + (alerta ? ' alerta-prenatal' : '') });
      cartao.appendChild(criarEl('header', null, [
        criarEl('h3', { textContent: resumo.comunidade_nome }),
        criarEl('span', { className: 'total', textContent: `${resumo.total_abertas} ${resumo.total_abertas === 1 ? 'demanda' : 'demandas'}` })
      ]));

      const infoVisita = `Visita: ${formatarDataBR(resumo.proxima_visita)}` +
        (resumo.inacessivel_seca ? ' · Inacessível na seca' : '') +
        (resumo.redirecionadas_polo ? ` · ${resumo.redirecionadas_polo} via polo` : '');
      const pVisita = criarEl('p', { className: 'ajuda', textContent: infoVisita });
      pVisita.style.margin = '-.4rem 0 .75rem';
      cartao.appendChild(pVisita);

      if (alerta) {
        cartao.appendChild(criarEl('p', { className: 'selo-prenatal', textContent: `Muitas gestantes: ${qtdPrenatal} em pré-natal` }));
      }

      const tbody = criarEl('tbody');
      TIPOS.forEach((t) => {
        const info = resumo.por_tipo[t.id] || { total: 0, prioritarias: 0 };
        tbody.appendChild(criarEl('tr', { className: t.id === 'prenatal' && alerta ? 'linha-prenatal-alta' : '' }, [
          criarEl('td', { textContent: t.rotulo }),
          criarEl('td', { className: info.total ? '' : 'zero', textContent: String(info.total) }),
          criarEl('td', { className: info.prioritarias ? 'tag-prio' : 'zero', textContent: String(info.prioritarias) })
        ]));
      });

      cartao.appendChild(criarEl('table', null, [
        criarEl('thead', null, [criarEl('tr', null, [
          criarEl('th', { textContent: 'Tipo' }),
          criarEl('th', { textContent: 'Total' }),
          criarEl('th', { textContent: 'Prioritárias' })
        ])]),
        tbody
      ]));

      const aguardando = demandas.filter((d) => !d.atendida)
        .sort((a, b) => (a.prioridade === b.prioridade ? 0 : a.prioridade === 'prioritaria' ? -1 : 1));
      const atendidas = demandas.filter((d) => d.atendida);

      const criarItemPaciente = (d) => {
        const origemTxt = d.comunidade_origem_id && d.comunidade_origem_id !== d.comunidade_id
          ? ` · Morador de ${buscarComunidade(d.comunidade_origem_id)?.nome}`
          : '';
        const modTxt = tagsModalidade[d.modalidade] || '';
        const detalheTxt = `${rotuloTipo(d.tipo)} · ${calcularIdade(d.nascimento)} anos` +
          `${d.prioridade === 'prioritaria' ? ' · Prioritária' : ''}${origemTxt}${modTxt}`;

        const acao = d.atendida
          ? criarEl('span', { className: 'ajuda', textContent: 'Concluída' })
          : criarEl('button', {
              type: 'button',
              className: 'botao-atender',
              'data-id': d.id,
              'data-com': resumo.comunidade_id,
              textContent: 'Marcar como atendida'
            });

        return criarEl('li', {
          className: `demanda ${d.prioridade === 'prioritaria' ? 'prioritaria' : ''} ${d.atendida ? 'atendida' : ''}`
        }, [
          criarEl('span', { className: 'nome', textContent: d.nome }),
          criarEl('span', { className: 'detalhe', textContent: detalheTxt }),
          acao
        ]);
      };

      const det = criarEl('details', { 'data-com': resumo.comunidade_id, open: abertas.has(resumo.comunidade_id) }, [
        criarEl('summary', { textContent: `Gerenciar atendimentos (${aguardando.length} aguardando)` })
      ]);

      if (aguardando.length) {
        det.appendChild(criarEl('ul', { className: 'demandas' }, aguardando.map(criarItemPaciente)));
      } else {
        det.appendChild(criarEl('p', { className: 'vazio', textContent: 'Todas as demandas desta comunidade foram atendidas.' }));
      }

      if (atendidas.length) {
        det.appendChild(criarEl('p', { className: 'subtitulo', textContent: `Já atendidas (${atendidas.length})` }));
        det.appendChild(criarEl('ul', { className: 'demandas' }, atendidas.map(criarItemPaciente)));
      }

      cartao.appendChild(det);
      listaComunidades.appendChild(cartao);
    });
  }

  $('#lista-comunidades').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;

    try {
      const resp = await fetch(`${API_URL}/demandas/${btn.dataset.id}/atendida`, { method: 'PATCH' });
      const resultado = await resp.json();

      if (!resp.ok) {
        avisar(`Erro ${resp.status}: ${resultado.erro}`);
        return;
      }

      abertas.add(btn.dataset.com);
      await atualizarTelaCoordenacao();
      avisar(`Demanda de ${resultado.nome} marcada como atendida.`);
    } catch (err) {
      avisar('Erro ao comunicar com o servidor.');
    }
  });

  $('#lista-comunidades').addEventListener('toggle', (e) => {
    if (e.target.tagName !== 'DETAILS') return;
    if (e.target.open) abertas.add(e.target.dataset.com);
    else abertas.delete(e.target.dataset.com);
  }, true);

  /* ==================== 7. INICIALIZAÇÃO ==================== */
  carregarComunidades();
})();