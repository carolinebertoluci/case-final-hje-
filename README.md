# Navega Saúde — Gestão de Demandas Ribeirinhas

Sistema web desenvolvido para apoiar o planejamento de rotas e atendimentos médicos em comunidades ribeirinhas e rurais de difícil acesso. A solução conecta o registro realizado em campo pelos **Agentes Comunitários de Saúde (ACS)** ao painel de tomada de decisão da **Coordenação de Saúde**, contemplando regras de priorização clínica, privacidade de dados e planos de contingência durante períodos de estiagem (seca).

---

## Arquitetura em Três Camadas

O projeto foi estruturado com separação estrita de responsabilidades:

1. **Camada de Apresentação (`frontend/` — `index.html`, `style.css`, `script.js`):**
   * Interface acessível e responsiva (tipografia *Atkinson Hyperlegible* e *Bricolage Grotesque*, alto contraste e navegação por teclado).
   * Validação no navegador (`required`, `type`, higienização com `.trim()`) e etapa obrigatória de revisão antes do envio.
   * Comunicação assíncrona via `fetch()` sem recarregamento de página, estados visuais controlados por `classList` e construção dinâmica de listas via `document.createElement()`.
   * Controle de acesso por perfil (PIN) na aba da Coordenação.
2. **Camada de Aplicação e Regras de Negócio (`app.py` — Python + Flask):**
   * API RESTful responsável por validar regras de domínio, aplicar políticas de sazonalidade (seca), projetar apenas os campos necessários para cada tela e garantir que dados nominais sensíveis não sejam expostos nos endpoints agregados.
3. **Camada de Dados (Estruturas em Memória no Backend):**
   * Armazenamento isolado no servidor (`COMUNIDADES` e `DEMANDAS`), inacessível diretamente pelo frontend sem passar pelas rotas da API.

---

## Documentação da API REST

| Método | Rota | Descrição | Status Codes |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/comunidades` | Lista todas as comunidades com data prevista da próxima visita, status de isolamento na seca e polo alternativo. | `200 OK` |
| `POST` | `/api/demandas` | Registra uma nova demanda de atendimento aplicando validações de tipo e contingência de seca. | `201 Created`, `400 Bad Request`, `404 Not Found`, `422 Unprocessable Entity` |
| `GET` | `/api/comunidades/<id>/resumo` | Retorna totais agregados de demandas abertas por tipo e prioridade, além de alertas de contingência (**sem nomes de pacientes**). | `200 OK`, `404 Not Found` |
| `GET` | `/api/comunidades/<id>/demandas` | Lista as demandas da comunidade para gerenciamento de baixa pela coordenação (com projeção mínima de campos, omitindo Cartão SUS). | `200 OK`, `404 Not Found` |
| `PATCH` | `/api/demandas/<id>/atendida` | Marca uma demanda aberta como atendida, impedindo duplicidade de baixa. | `200 OK`, `404 Not Found`, `409 Conflict` |

### Regras de Negócio Implementadas no Backend
* **Restrição de Especialidades:** Apenas tipos cadastrados (`clinico`, `prenatal`, `ultrassom`, `odonto`, `retorno`) são aceitos; qualquer outro valor retorna `400 Bad Request`.
* **Contingência Logística e Clínica na Seca:**
  * Comunidades marcadas com `inacessivel_seca: True` bloqueiam agendamentos diretos na rota fluvial (`422 Unprocessable Entity`).
  * Para não deixar a população desassistida, o sistema permite encaminhar o paciente para uma **Comunidade Polo acessível** (mantendo o registro da comunidade de origem para indicadores epidemiológicos) ou acionar **Contingência** (teleconsulta/remoção urgente para casos prioritários e fila sazonal para rotina).
* **Idempotência de Baixa:** Tentar marcar como atendida uma demanda já concluída retorna `409 Conflict`.
* **Minimização e Privacidade de Dados:** O endpoint `/resumo` devolve estritamente contagens numéricas, e nenhuma rota retorna dados além do necessário para a renderização da tela.

---

## Como Executar o Projeto Localmente

### Pré-requisitos
* Python 3.10 ou superior
* Navegador web moderno

### Passo a passo
1. **Clone o repositório e acesse a pasta do projeto:**
   ```bash
   git clone <url-do-seu-repositorio>
   cd case-final-hje-
   ```

2. **Instale as dependências do backend:**
   ```bash
   py -m pip install flask flask-cors
   ```

3. **Inicie o servidor Flask:**
   ```bash
   py app.py
   ```
   O servidor ficará disponível em `http://127.0.0.1:5000`.

4. **Abra o frontend:**
   * Abra o arquivo `frontend/index.html` diretamente no navegador (ou via extensão *Live Server* no VS Code).
   * **Credenciais de demonstração na aba Coordenação:**
     * `1010` — Coordenação Geral (acesso a todas as comunidades)
     * `2020` — Regional Norte (`c1`, `c2`, `c3`)
     * `3030` — Regional Sul (`c4`, `c5`, `c6`)

---

## Uso de Inteligência Artificial e Processo de Revisão

Durante o desenvolvimento deste projeto, ferramentas de Inteligência Artificial generativa foram utilizadas como apoio técnico pontual, mantendo-se a arquitetura, as decisões de produto e a validação final sob controle da autora:

* **Onde a IA foi utilizada:**
  * **Refatoração e simplificação de código:** Apoio na organização modular do `script.js` e agrupamento de seletores no `style.css` para reduzir duplicação sem perda de funcionalidade.
  * **Padronização de API REST e tratamento de erros:** Consulta sobre os status HTTP mais adequados para regras de domínio (`422 Unprocessable Entity` para bloqueio de seca e `409 Conflict` para baixa duplicada).
  * **Modelagem da contingência na seca:** Estruturação da lógica de redirecionamento para comunidades polo e classificação entre teleconsulta urgente e fila sazonal.
* **Como o código foi revisado e validado:**
  * **Auditoria de requisitos:** Verificação manual de todas as camadas para garantir que o frontend nunca acessasse dados fora da API, que todas as listas fossem construídas via `document.createElement()` e que o endpoint `/resumo` não vazasse dados nominais.
  * **Testes de fluxo e borda:** Execução de testes manuais cobrindo preenchimento com espaços em branco (`.trim()`), validação de Cartão SUS e data de nascimento, fluxo de revisão pré-envio, bloqueio e redirecionamento de comunidades na seca, isolamento de permissões por PIN na Coordenação e persistência de estado via `PATCH`.
  * **Controle de versão:** Commits incrementais realizados no GitHub a cada etapa estável validada.
