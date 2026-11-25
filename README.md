# Navega Saúde — Gestão de Demandas Ribeirinhas

Sistema web desenvolvido para organizar o agendamento e a priorização de atendimentos médicos em comunidades ribeirinhas e rurais de difícil acesso. A plataforma conecta o registro feito em campo pelos **Agentes Comunitários de Saúde (ACS)** ao painel da **Coordenação**, incluindo planos de contingência para períodos de seca.

---

## Como o Sistema Funciona (Arquitetura)

O projeto é dividido em três camadas independentes:

* **Frontend (`index.html`, `style.css`, `script.js`):** Interface responsiva e acessível para celular e computador. Faz a validação inicial dos campos (`.trim()`, `required`, `type`), exibe uma tela de revisão antes do envio e atualiza a página sem recarregar via `fetch()`.
* **Backend (`app.py` em Python + Flask):** API REST que centraliza as regras de negócio, valida os dados recebidos, controla as regras de isolamento na seca e protege a privacidade dos pacientes.
* **Dados (Estruturas em memória no servidor):** Armazenamento isolado no backend (`COMUNIDADES` e `DEMANDAS`), acessado exclusivamente através das rotas da API.

---

## Rotas da API e Regras de Negócio

| Método | Rota | O que faz | Status Codes |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/comunidades` | Lista as comunidades, datas de visita, status de seca e polo alternativo. | `200` |
| `POST` | `/api/demandas` | Cadastra uma nova demanda aplicando validações de tipo e regras da seca. | `201`, `400`, `404`, `422` |
| `GET` | `/api/comunidades/<id>/resumo` | Retorna apenas os totais de demandas por tipo e prioridade (**sem nomes de pacientes**). | `200`, `404` |
| `GET` | `/api/comunidades/<id>/demandas` | Lista as demandas da comunidade para a Coordenação dar baixa nos atendimentos. | `200`, `404` |
| `PATCH` | `/api/demandas/<id>/atendida` | Marca uma demanda como atendida e impede que seja marcada duas vezes. | `200`, `404`, `409` |

### Principais Regras Implementadas
* **Contingência na Seca:** Comunidades isoladas na estiagem bloqueiam o agendamento fluvial comum (`422`), oferecendo ao ACS duas alternativas: encaminhar o paciente para uma **Comunidade Polo acessível** (mantendo o registro da comunidade de origem) ou acionar **Contingência** (teleconsulta/remoção urgente para casos prioritários e fila de espera para rotina).
* **Privacidade:** O endpoint `/resumo` exibe apenas números agregados para o planejamento logístico, sem expor nomes ou Cartão SUS.

---

## Como Executar o Projeto

1. **Instale as dependências do Python:**
   ```bash
   py -m pip install flask flask-cors
