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

  // Controle de acesso por perfil (PIN -> comunidades permitidas)
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

  /* ==================== 3. UTILITÁRIOS ==================== */
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

  $('#opcoes-tipo').innerHTML = TIPOS.map((t) => `
    <label class="opcao">
      <input type="radio" name="tipo" value="${t.id}">
      <span><strong>${t.rotulo}</strong></span>
    </label>
  `).join('');

  // Carrega comunidades do GET /api/comunidades
  async function carregarComunidades() {
    try {
      const resp = await fetch(`${API_URL}/comunidades`);
      comunidades = await resp.json();

      selComunidade.innerHTML = '<option value="">Selecione a comunidade…</option>';
      comunidades.forEach((c) => {
        const avisoSeca = c.inacessivel_seca ? ' [INACESSÍVEL NA SECA]' : '';
        selComunidade.add(new Option(`${c.nome}${avisoSeca}`, c.id));
      });
    } catch (err) {
      avisar('Erro ao conectar com o servidor Flask (verifique se app.py está rodando).');
    }
  }

  // Mostra data da próxima visita ou alerta de seca ao selecionar comunidade
  function atualizarAjudaComunidade() {
    const c = buscarComunidade(selComunidade.value);
    const ajuda = $('#ajuda-comunidade');
    if (!c) { ajuda.textContent = ''; return; }

    if (c.inacessivel_seca) {
      const polo = buscarComunidade(c.polo_alternativo_id);
      const txtPolo = polo ? ` (Polo de apoio: ${polo.nome})` : '';
      ajuda.textContent = `Atenção: ${c.nome} está isolada na seca${txtPolo}. Você escolherá o plano de atendimento na revisão.`;
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
    boxErros.hidden = erros.length === 0;
    boxErros.innerHTML = erros.length
      ? `<p>Corrija ${erros.length} item(ns) antes de continuar:</p><ul>${erros.map((e) => `<li>${e}</li>`).join('')}</ul>`
      : '';

    return erros.length === 0;
  }

  // Etapa 1: Valida, abre revisão e exibe opções de contingência se a comunidade estiver na seca
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    $('#confirmacao').hidden = true;

    const fd = new FormData(form);
    const dados = {
      comunidade_id: fd.get('comunidade') || '',
      tipo: fd.get('tipo') || '',
      prioridade: fd.get('prioridade') || '',
      nome: (fd.get('nome') || '').replace(/\s+/g, ' ').trim(),
      nascimento: fd.get('nascimento') || '',
      cartao_sus: (fd.get('cartaoSus') || '').replace(/\D/g, '')
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

    $('#lista-revisao').innerHTML = `
      <dt>Comunidade</dt><dd>${com.nome} (Visita: ${formatarDataBR(com.proxima_visita)})</dd>
      <dt>Atendimento</dt><dd>${rotuloTipo(dados.tipo)}</dd>
      <dt>Prioridade</dt><dd class="${dados.prioridade === 'prioritaria' ? 'revisao-prio' : ''}">
        ${dados.prioridade === 'prioritaria' ? 'Prioritária (atender primeiro)' : 'Rotina'}
      </dd>
      <dt>Paciente</dt><dd>${dados.nome}</dd>
      <dt>Nascimento</dt><dd>${formatarDataBR(dados.nascimento)} (${calcularIdade(dados.nascimento)} anos)</dd>
      <dt>Cartão SUS</dt><dd>${susFormatado}</dd>
    `;

    // Se a comunidade está isolada na seca, habilita a escolha entre Polo de Apoio ou Contingência
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

  // Etapa 2: Envia via POST /api/demandas com a estratégia de seca selecionada
  $('#btn-confirmar-envio').addEventListener('click', async () => {
    if (!rascunho) return;

    const com = buscarComunidade(rascunho.comunidade_id);
    const estrategia = com.inacessivel_seca
      ? (document.querySelector('input[name="estrategia_seca"]:checked')?.value || 'polo')
      : 'rota';

    const payload = { ...rascunho, estrategia_seca: estrategia };

    try {
      const resp = await fetch(`${API_URL}/demandas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const resultado = await resp.json();

      if (!resp.ok) {
        $('#painel-revisao').hidden = true;
        form.hidden = false;

        const boxErros = $('#resumo-erros');
        boxErros.innerHTML = `<p>Registro recusado pelo servidor (Erro ${resp.status}):</p><ul><li>${resultado.erro}</li></ul>`;
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

    // Busca em paralelo o resumo anônimo (GET /api/comunidades/<id>/resumo) e as demandas de cada comunidade
    const dadosComunidades = await Promise.all(rota.map(async (c) => {
      const [respResumo, respDemandas] = await Promise.all([
        fetch(`${API_URL}/comunidades/${c.id}/resumo`),
        fetch(`${API_URL}/comunidades/${c.id}/demandas`)
      ]);
      return {
        resumo: await respResumo.json(),
        demandas: await respDemandas.json()
      };
    }));

    // Calcula totais gerais do topo a partir dos resumos retornados pela API
    let totalGeral = 0, prioGeral = 0, alertasPrenatal = 0, contingenciasUrgentes = 0;
    dadosComunidades.forEach(({ resumo }) => {
      totalGeral += resumo.total_abertas;
      prioGeral += resumo.total_prioritarias;
      contingenciasUrgentes += resumo.contingencia_urgente || 0;
      if ((resumo.por_tipo.prenatal?.total || 0) >= LIMITE_PRENATAL) alertasPrenatal++;
    });

    $('#resumo-rota').innerHTML = `
      <div class="numero"><strong>${totalGeral}</strong><span>demandas aguardando</span></div>
      <div class="numero"><strong>${prioGeral}</strong><span>prioritárias</span></div>
      <div class="numero ${alertasPrenatal > 0 ? 'destaque' : ''}">
        <strong>${alertasPrenatal}</strong>
        <span>${alertasPrenatal === 1 ? 'comunidade com muito pré-natal' : 'comunidades com muito pré-natal'}</span>
      </div>
      ${contingenciasUrgentes > 0 ? `
        <div class="numero destaque">
          <strong>${contingenciasUrgentes}</strong>
          <span>${contingenciasUrgentes === 1 ? 'teleconsulta / remoção urgente' : 'teleconsultas / remoções urgentes'}</span>
        </div>
      ` : ''}
    `;

    const tagsModalidade = {
      polo: ' · Via Polo (origem isolada)',
      teleconsulta_urgente: ' · ALERTA TELECONSULTA / REMOÇÃO',
      fila_seca: ' · Fila da Seca'
    };

    $('#lista-comunidades').innerHTML = dadosComunidades.map(({ resumo, demandas }) => {
      const qtdPrenatal = resumo.por_tipo.prenatal?.total || 0;
      const alerta = qtdPrenatal >= LIMITE_PRENATAL;

      const linhasTabela = TIPOS.map((t) => {
        const info = resumo.por_tipo[t.id] || { total: 0, prioritarias: 0 };
        return `
          <tr class="${t.id === 'prenatal' && alerta ? 'linha-prenatal-alta' : ''}">
            <td>${t.rotulo}</td>
            <td class="${info.total ? '' : 'zero'}">${info.total}</td>
            <td class="${info.prioritarias ? 'tag-prio' : 'zero'}">${info.prioritarias}</td>
          </tr>
        `;
      }).join('');

      const aguardando = demandas.filter((d) => !d.atendida)
        .sort((a, b) => (a.prioridade === b.prioridade ? 0 : a.prioridade === 'prioritaria' ? -1 : 1));
      const atendidas = demandas.filter((d) => d.atendida);

      const linhaPaciente = (d) => {
        const origemTxt = d.comunidade_origem_id && d.comunidade_origem_id !== d.comunidade_id
          ? ` · Morador de ${buscarComunidade(d.comunidade_origem_id)?.nome}`
          : '';
        const modTxt = tagsModalidade[d.modalidade] || '';

        return `
          <li class="demanda ${d.prioridade === 'prioritaria' ? 'prioritaria' : ''} ${d.atendida ? 'atendida' : ''}">
            <span class="nome">${d.nome}</span>
            <span class="detalhe">${rotuloTipo(d.tipo)} · ${calcularIdade(d.nascimento)} anos${d.prioridade === 'prioritaria' ? ' · Prioritária' : ''}${origemTxt}${modTxt}</span>
            ${d.atendida
              ? '<span class="ajuda">Concluída</span>'
              : `<button type="button" class="botao-atender" data-id="${d.id}" data-com="${resumo.comunidade_id}">Marcar como atendida</button>`}
          </li>
        `;
      };

      return `
        <article class="comunidade ${alerta ? 'alerta-prenatal' : ''}">
          <header>
            <h3>${resumo.comunidade_nome}</h3>
            <span class="total">${resumo.total_abertas} ${resumo.total_abertas === 1 ? 'demanda' : 'demandas'}</span>
          </header>
          <p class="ajuda" style="margin: -.4rem 0 .75rem;">
            Visita: <strong>${formatarDataBR(resumo.proxima_visita)}</strong>
            ${resumo.inacessivel_seca ? ' · <strong>Inacessível na seca</strong>' : ''}
            ${resumo.redirecionadas_polo ? ` · <strong>${resumo.redirecionadas_polo} via polo</strong>` : ''}
          </p>
          ${alerta ? `<p class="selo-prenatal">Muitas gestantes: ${qtdPrenatal} em pré-natal</p>` : ''}
          <table>
            <thead><tr><th>Tipo</th><th>Total</th><th>Prioritárias</th></tr></thead>
            <tbody>${linhasTabela}</tbody>
          </table>
          <details data-com="${resumo.comunidade_id}" ${abertas.has(resumo.comunidade_id) ? 'open' : ''}>
            <summary>Gerenciar atendimentos (${aguardando.length} aguardando)</summary>
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
  }

  // Dispara PATCH /api/demandas/<id>/atendida
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