from datetime import datetime
import uuid
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

TIPOS_VALIDOS = {'clinico', 'prenatal', 'ultrassom', 'odonto', 'retorno'}
PRIORIDADES_VALIDAS = {'rotina', 'prioritaria'}

# polo_alternativo_id indica qual comunidade acessível absorve os atendimentos na seca
COMUNIDADES = [
    {
        'id': 'c1',
        'nome': 'Vila Esperança',
        'na_rota': True,
        'proxima_visita': '2026-11-28',
        'inacessivel_seca': False,
        'polo_alternativo_id': None,
    },
    {
        'id': 'c2',
        'nome': 'Ribeirão Seco',
        'na_rota': True,
        'proxima_visita': '2026-11-29',
        'inacessivel_seca': True,
        'polo_alternativo_id': 'c1',  # Redireciona para Vila Esperança
    },
    {
        'id': 'c3',
        'nome': 'Sítio das Palmeiras',
        'na_rota': True,
        'proxima_visita': '2026-11-30',
        'inacessivel_seca': False,
        'polo_alternativo_id': None,
    },
    {
        'id': 'c4',
        'nome': 'Assentamento Novo Horizonte',
        'na_rota': True,
        'proxima_visita': '2026-12-02',
        'inacessivel_seca': False,
        'polo_alternativo_id': None,
    },
    {
        'id': 'c5',
        'nome': 'Beira do Rio',
        'na_rota': True,
        'proxima_visita': '2026-12-03',
        'inacessivel_seca': True,
        'polo_alternativo_id': 'c4',  # Redireciona para Assentamento Novo Horizonte
    },
    {
        'id': 'c6',
        'nome': 'Serra Alta',
        'na_rota': False,
        'proxima_visita': None,
        'inacessivel_seca': False,
        'polo_alternativo_id': None,
    },
]

DEMANDAS = [
    {
        'id': 'ex-1',
        'comunidade_id': 'c1',
        'comunidade_origem_id': 'c1',
        'modalidade': 'rota',
        'tipo': 'prenatal',
        'prioridade': 'prioritaria',
        'nome': 'Ana Paula Ribeiro',
        'nascimento': '1998-03-12',
        'cartao_sus': '',
        'atendida': False,
        'criada_em': '2026-11-20T09:00:00',
    },
    {
        'id': 'ex-2',
        'comunidade_id': 'c1',
        'comunidade_origem_id': 'c1',
        'modalidade': 'rota',
        'tipo': 'prenatal',
        'prioridade': 'rotina',
        'nome': 'Juliana Souza Lima',
        'nascimento': '2001-07-30',
        'cartao_sus': '',
        'atendida': False,
        'criada_em': '2026-11-20T09:15:00',
    },
    {
        'id': 'ex-3',
        'comunidade_id': 'c1',
        'comunidade_origem_id': 'c1',
        'modalidade': 'rota',
        'tipo': 'prenatal',
        'prioridade': 'rotina',
        'nome': 'Camila Ferreira',
        'nascimento': '1995-11-02',
        'cartao_sus': '',
        'atendida': False,
        'criada_em': '2026-11-20T09:30:00',
    },
    {
        'id': 'ex-4',
        'comunidade_id': 'c3',
        'comunidade_origem_id': 'c3',
        'modalidade': 'rota',
        'tipo': 'clinico',
        'prioridade': 'prioritaria',
        'nome': 'Antônio Carlos Nunes',
        'nascimento': '1960-03-03',
        'cartao_sus': '',
        'atendida': False,
        'criada_em': '2026-11-21T14:00:00',
    },
]


def buscar_comunidade(cid):
  return next((c for c in COMUNIDADES if c['id'] == cid), None)


@app.get('/api/comunidades')
def listar_comunidades():
  return jsonify(COMUNIDADES), 200


@app.post('/api/demandas')
def registrar_demanda():
  dados = request.get_json(silent=True) or {}

  comunidade_id = (dados.get('comunidade_id') or '').strip()
  tipo = (dados.get('tipo') or '').strip()
  prioridade = (dados.get('prioridade') or '').strip()
  nome = (dados.get('nome') or '').strip()
  nascimento = (dados.get('nascimento') or '').strip()
  cartao_sus = (dados.get('cartao_sus') or '').strip()
  estrategia_seca = (dados.get('estrategia_seca') or 'rota').strip()

  if not all([comunidade_id, tipo, prioridade, nome, nascimento]):
    return jsonify({'erro': 'Campos obrigatórios ausentes.'}), 400

  if tipo not in TIPOS_VALIDOS:
    return (
        jsonify({'erro': f"Tipo de atendimento '{tipo}' não permitido."}),
        400,
    )

  if prioridade not in PRIORIDADES_VALIDAS:
    return jsonify({'erro': 'Prioridade inválida.'}), 400

  comunidade = buscar_comunidade(comunidade_id)
  if not comunidade:
    return jsonify({'erro': 'Comunidade não encontrada.'}), 404

  comunidade_destino_id = comunidade_id
  modalidade = 'rota'

  if comunidade['inacessivel_seca']:
    if estrategia_seca == 'rota':
      polo = buscar_comunidade(comunidade['polo_alternativo_id'])
      nome_polo = polo['nome'] if polo else 'um polo próximo'
      return (
          jsonify({
              'erro': (
                  f"{comunidade['nome']} está inacessível na seca. Redirecione"
                  f' para o polo ({nome_polo}) ou registre em contingência.'
              )
          }),
          422,
      )
    elif estrategia_seca == 'polo':
      polo = buscar_comunidade(comunidade['polo_alternativo_id'])
      if not polo or polo['inacessivel_seca']:
        return jsonify({'erro': 'Nenhum polo acessível disponível.'}), 422
      comunidade_destino_id = polo['id']
      modalidade = 'polo'
    elif estrategia_seca == 'contingencia':
      modalidade = (
          'teleconsulta_urgente'
          if prioridade == 'prioritaria'
          else 'fila_seca'
      )
    else:
      return jsonify({'erro': 'Estratégia de seca inválida.'}), 400

  nova_demanda = {
      'id': f'd-{uuid.uuid4().hex[:8]}',
      'comunidade_id': comunidade_destino_id,
      'comunidade_origem_id': comunidade_id,
      'modalidade': modalidade,
      'tipo': tipo,
      'prioridade': prioridade,
      'nome': nome,
      'nascimento': nascimento,
      'cartao_sus': cartao_sus,
      'atendida': False,
      'criada_em': datetime.now().isoformat(timespec='seconds'),
  }
  DEMANDAS.append(nova_demanda)

  # Devolve apenas o que a tela precisa para exibir a confirmação
  return (
      jsonify({
          'id': nova_demanda['id'],
          'comunidade_id': nova_demanda['comunidade_id'],
          'modalidade': nova_demanda['modalidade'],
          'nome': nova_demanda['nome'],
      }),
      201,
  )


@app.get('/api/comunidades/<comunidade_id>/demandas')
def listar_demandas_comunidade(comunidade_id):
  if not buscar_comunidade(comunidade_id):
    return jsonify({'erro': 'Comunidade não encontrada.'}), 404

  # Projeção de campos: não envia cartao_sus nem criada_em para a tela
  lista = [
      {
          'id': d['id'],
          'comunidade_id': d['comunidade_id'],
          'comunidade_origem_id': d['comunidade_origem_id'],
          'modalidade': d['modalidade'],
          'tipo': d['tipo'],
          'prioridade': d['prioridade'],
          'nome': d['nome'],
          'nascimento': d['nascimento'],
          'atendida': d['atendida'],
      }
      for d in DEMANDAS
      if d['comunidade_id'] == comunidade_id
  ]
  return jsonify(lista), 200


@app.patch('/api/demandas/<demanda_id>/atendida')
def marcar_atendida(demanda_id):
  demanda = next((d for d in DEMANDAS if d['id'] == demanda_id), None)
  if not demanda:
    return jsonify({'erro': 'Demanda não encontrada.'}), 404
  if demanda['atendida']:
    return (
        jsonify({'erro': 'Esta demanda já foi marcada como atendida.'}),
        409,
    )

  demanda['atendida'] = True
  demanda['atendida_em'] = datetime.now().isoformat(timespec='seconds')

  # Devolve apenas id, nome e status atualizado
  return (
      jsonify({
          'id': demanda['id'],
          'nome': demanda['nome'],
          'atendida': demanda['atendida'],
      }),
      200,
  )

@app.get('/api/comunidades/<comunidade_id>/resumo')
def resumo_comunidade(comunidade_id):
  comunidade = buscar_comunidade(comunidade_id)
  if not comunidade:
    return jsonify({'erro': 'Comunidade não encontrada.'}), 404

  abertas = [
      d
      for d in DEMANDAS
      if d['comunidade_id'] == comunidade_id and not d['atendida']
  ]

  por_tipo = {}
  for t in sorted(TIPOS_VALIDOS):
    do_tipo = [d for d in abertas if d['tipo'] == t]
    por_tipo[t] = {
        'total': len(do_tipo),
        'prioritarias': sum(
            1 for d in do_tipo if d['prioridade'] == 'prioritaria'
        ),
        'rotina': sum(1 for d in do_tipo if d['prioridade'] == 'rotina'),
    }

  return (
      jsonify({
          'comunidade_id': comunidade['id'],
          'comunidade_nome': comunidade['nome'],
          'proxima_visita': comunidade['proxima_visita'],
          'inacessivel_seca': comunidade['inacessivel_seca'],
          'total_abertas': len(abertas),
          'total_prioritarias': sum(
              1 for d in abertas if d['prioridade'] == 'prioritaria'
          ),
          'contingencia_urgente': sum(
              1 for d in abertas if d['modalidade'] == 'teleconsulta_urgente'
          ),
          'fila_seca': sum(
              1 for d in abertas if d['modalidade'] == 'fila_seca'
          ),
          'redirecionadas_polo': sum(
              1 for d in abertas if d['modalidade'] == 'polo'
          ),
          'por_tipo': por_tipo,
      }),
      200,
  )

if __name__ == '__main__':
  app.run(debug=True, port=5000)