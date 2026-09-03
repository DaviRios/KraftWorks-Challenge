# Testes unitários do backend

Os testes usam `node:test`, `node:assert/strict` e o `tsx` já declarado nas
dependências de desenvolvimento. Não foi necessário alterar o `package.json`,
o lockfile, a configuração ou o código da aplicação.

## Execução manual

Na pasta `backend`, com Node.js 20.6 ou superior e as dependências já disponíveis:

```sh
node --import tsx --test --test-concurrency=1 tests/unit/people.service.test.ts tests/unit/people.repository.test.ts tests/unit/people.controller.test.ts
```

Para executar apenas uma camada, informe somente o arquivo correspondente:

```sh
node --import tsx --test tests/unit/people.service.test.ts
```

Os testes não foram executados durante esta entrega, conforme solicitado.

## Cobertura planejada

- **PeopleService:** chave obrigatória, autenticação, parâmetros da consulta,
  timeout simulado, paginação, mapeamento de campos, extração da sigla do estado,
  campos opcionais, respostas vazias, validação com Zod, erros HTTP/rede/JSON,
  ausência de persistência parcial, falhas de persistência e leitura do cache.
- **PeopleRepository:** chave externa de upsert, campos de criação e atualização,
  operações agrupadas em uma transação, valores nulos, lista vazia, filtros de
  estado e partido, ordenação por nome, identificação pública e propagação de erros.
- **peopleController:** registro das rotas, chamadas ao serviço, respostas dos
  handlers, registro de erros, normalização e validação dos schemas de entrada
  e contratos de resposta.

## Isolamento

O `fetch` é substituído por um mock em cada teste do serviço. Chamadas sem uma
resposta simulada falham localmente. Os mocks são restaurados automaticamente
pelo contexto de cada teste; a suíte do serviço não usa testes concorrentes.

O repositório recebe um objeto com métodos simulados do Prisma. Nenhum cliente
de banco é instanciado. Esses testes verificam os argumentos enviados ao Prisma;
não verificam a execução SQL nem o rollback real de uma transação.

O controller recebe um objeto que captura os handlers e os schemas registrados.
Os handlers e schemas são exercitados diretamente, sem criar uma instância do
Fastify. A validação HTTP automática e a serialização pelo framework ficam fora
do escopo destes testes unitários.

Nenhum teste importa `src/server.ts`, carrega `.env`, inicia API, abre porta,
consulta a OpenStates, conecta ao PostgreSQL ou depende de Docker. A inicialização
do servidor e os testes de integração não fazem parte desta suíte.
