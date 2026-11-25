```markdown
# Navega Saúde — Gestão de Demandas Ribeirinhas

Sistema web para organizar o agendamento e a priorização de atendimentos médicos em comunidades ribeirinhas e rurais, conectando o registro em campo pelos **Agentes Comunitários de Saúde (ACS)** ao painel da **Coordenação**, com planos de contingência para períodos de seca.

---

## Arquitetura e Requisitos Técnicos

O projeto segue rigorosamente a separação em três camadas:

* **Frontend (`index.html`, `style.css`, `script.js`):** Interface responsiva e acessível. Realiza validação no navegador (`required`, `type` e higienização com `.trim()`), etapa de revisão antes do envio, atualização dinâmica sem recarregar a página (`fetch()` + `classList`) e construção de listas via `document.createElement()`. Nunca acessa dados sem passar pela API.
* **Backend (`app.py` — Python + Flask):** API REST que centraliza todas as validações e regras de negócio, devolvendo respostas em JSON com os status codes adequados (`200`, `201`, `400`, `404`, `409`, `422`) e projetando apenas os campos necessários para cada tela.
* **Camada de Dados:** Estruturas isoladas em memória no servidor (`COMUNIDADES` e `DEMANDAS`).

---

## Documentação da API e Regras de Negócio

| Método | Rota | Descrição | Status Codes |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/comunidades` | Lista comunidades, datas de visita, isolamento na seca e polo alternativo. | `200` |
| `POST` | `/api/demandas` | Registra uma demanda validando tipos permitidos e regras de seca. | `201`, `400`, `404`, `422` |
| `GET` | `/api/comunidades/<id>/resumo` | Devolve apenas totais agregados por tipo e prioridade (**sem nomes de pacientes**). | `200`, `404` |
| `GET` | `/api/comunidades/<id>/demandas` | Lista demandas da comunidade para baixa pela coordenação (sem expor Cartão SUS). | `200`, `404` |
| `PATCH` | `/api/demandas/<id>/atendida` | Marca uma demanda como atendida e bloqueia baixa duplicada. | `200`, `404`, `409` |

* **Contingência na Seca:** Comunidades isoladas bloqueiam o agendamento fluvial direto (`422`), permitindo redirecionar o paciente para uma **Comunidade Polo acessível** (mantendo a comunidade de origem) ou registrar em **Contingência** (teleconsulta/remoção urgente para casos prioritários e fila sazonal para rotina).

---

## Como Executar

1. **Instale as dependências:**
   ```bash
   py -m pip install flask flask-cors

```

2. **Inicie o servidor:**
```bash
py app.py

```


A API ficará disponível em `http://127.0.0.1:5000`.
3. **Abra o frontend:**
* Abra o arquivo `index.html` no navegador (ou via *Live Server* no VS Code).
* **PINs da Coordenação:** `1010` (Geral), `2020` (Regional Norte) e `3030` (Regional Sul).



---

## Uso de Inteligência Artificial e Revisão

* **Onde a IA foi utilizada:** Apoio na organização modular do JavaScript e CSS, padronização de códigos de status HTTP (`422` e `409`) e estruturação da lógica de redirecionamento para comunidades polo na seca.
* **Como o código foi revisado:** Conferência manual das três camadas para garantir acesso exclusivo via API, montagem das listas via `document.createElement()`, ausência de dados nominais no `/resumo` e testes manuais de validação (`.trim()`), bloqueio/contingência na seca, restrição por PIN e baixa de atendimentos.

```

```
