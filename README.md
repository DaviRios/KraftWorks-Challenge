# Kraft Works People API

Backend em Node.js e TypeScript para consultar pessoas em cargos políticos na
[OpenStates API v3](https://v3.openstates.org/docs), armazenar os dados em
PostgreSQL e disponibilizá-los ao frontend por uma API REST.

## Tecnologias

- Node.js com TypeScript
- Fastify
- Zod
- Prisma ORM
- PostgreSQL 17
- Docker Compose
- OpenAPI/Swagger com interface Scalar
- Biome

## Estrutura do projeto

```text
backend/
├── README.md
└── api/
    ├── compose.yaml
    ├── prisma/
    │   ├── migrations/
    │   └── schema.prisma
    ├── src/
    │   ├── people.controller.ts
    │   ├── people.repository.ts
    │   ├── people.service.ts
    │   └── server.ts
    ├── .env.example
    └── package.json
```

## Configuração local

### 1. Token da OpenStates

Crie uma conta no
[perfil da Plural Policy](https://open.pluralpolicy.com/accounts/profile/) e gere
um token de API.

### 2. Dependências e variáveis de ambiente

```bash
cd api
pnpm install
```

Copie `api/.env.example` para `api/.env`. No PowerShell:

```powershell
Copy-Item .env.example .env
```

Preencha as variáveis:

```dotenv
OPENSTATES_API_KEY=seu-token
DATABASE_URL=postgresql://kraft:kraft_dev@localhost:5433/kraft_people
```

O arquivo `.env` está no `.gitignore` e não deve ser versionado.

### 3. PostgreSQL

```bash
docker compose up -d
pnpm exec prisma generate
pnpm exec prisma migrate deploy
```

O PostgreSQL é publicado na porta local `5433` e utiliza o volume persistente
`postgres_data`.

### 4. Servidor

```bash
pnpm dev
```

Endereço local: `http://localhost:3000`.

## Endpoints

### `GET /api/people`

Lista as pessoas atualmente armazenadas no PostgreSQL. A intenção desse endpoint
é atender o frontend pelo cache local, sem realizar uma nova chamada à
OpenStates.

Resposta esperada:

```json
[
  {
    "id": "identificador-da-pessoa",
    "name": "Jane Doe",
    "role": "Senator",
    "imageUrl": "https://example.com/photo.jpg",
    "state": "California",
    "party": "Democratic"
  }
]
```

### `POST /api/people/sync`

Busca as páginas de pessoas do estado informado na OpenStates e executa `upsert`
dos registros no PostgreSQL.

O código atual valida `state` como uma sigla de duas letras:

```json
{
  "state": "CA"
}
```

Exemplo:

```bash
curl -X POST http://localhost:3000/api/people/sync \
  -H "Content-Type: application/json" \
  -d '{"state":"CA"}'
```

Respostas documentadas:

- `200`: sincronização concluída;
- `400`: corpo da requisição inválido;
- `500`: erro interno;
- `502`: falha durante a sincronização com a OpenStates.

## Swagger/OpenAPI

Com o servidor em execução:

- interface interativa: `http://localhost:3000/docs`;
- especificação JSON: `http://localhost:3000/docs/openapi.json`;
- especificação YAML: `http://localhost:3000/docs/openapi.yaml`.

O Swagger descreve as duas rotas, seus payloads, campos de resposta, códigos HTTP
e a diferença entre leitura do cache e sincronização externa.

## Cache e banco de dados

A tabela `people` possui:

- UUID interno;
- identificador externo único;
- nome;
- cargo;
- URL da foto;
- estado;
- partido;
- datas de criação e atualização.

O endpoint de sincronização utiliza o identificador externo no `upsert`, evitando
registros duplicados. A tabela também possui índices para estado e partido.

## Checklist atualizado

### Requisitos implementados no código

- [x] Backend em TypeScript com Node.js.
- [x] Fastify configurado.
- [x] Token lido por `OPENSTATES_API_KEY`.
- [x] Autenticação externa pelo header `X-API-KEY`.
- [x] Consumo do endpoint `/people` da OpenStates.
- [x] Mapeamento de nome, cargo, foto, estado e partido.
- [x] Paginação da resposta externa.
- [x] Validação da resposta da OpenStates com Zod.
- [x] `GET /api/people` criado e registrado.
- [x] `POST /api/people/sync` criado e registrado.
- [x] Persistência por `upsert` implementada.
- [x] PostgreSQL definido no Docker Compose.
- [x] Volume persistente e healthcheck do banco.
- [x] Schema Prisma e migration inicial.
- [x] Índices para estado e partido.
- [x] Swagger/Scalar configurado.
- [x] Descrições, schemas e códigos HTTP documentados no Swagger.
- [x] README e `.env.example` criados.

O desafio exige endpoint **ou** agendamento para atualização. A existência do
`POST /api/people/sync` cobre a opção de atualização por endpoint.

### Pontos pendentes ou que precisam de revisão

- [ ] Corrigir o script manual `test-people-service.ts`, que ainda usa a
  assinatura antiga de `PeopleService`.
- [ ] Fazer a checagem TypeScript completa passar; atualmente o arquivo de teste
  manual gera erros de compilação.
- [ ] Revisar a inicialização do Prisma Client no servidor com a configuração do
  Prisma 7 e do adapter PostgreSQL.
- [ ] Alinhar o valor salvo em `state`: o serviço mapeia o nome da jurisdição,
  enquanto a coluna atual está limitada a dois caracteres.
- [ ] Confirmar se a sigla de duas letras enviada à OpenStates é aceita como
  jurisdição ou convertê-la para nome/identificador OCD antes da chamada.
- [ ] Alinhar o identificador retornado pelo `GET /api/people` com o identificador
  retornado pela sincronização.
- [ ] Adicionar testes unitários automatizados.
- [ ] Adicionar testes de integração com PostgreSQL.
- [ ] Criar um script de build e corrigir o script `start` para produção.
- [ ] Adicionar filtros e paginação ao `GET /api/people`.
- [ ] Adicionar healthcheck da aplicação.
- [ ] Adicionar sincronização agendada, caso desejado; ela é opcional para o
  requisito atual.

## Observação sobre a revisão

Esta atualização foi documental. Ela não executou uma nova sincronização paga
com a OpenStates nem alterou a lógica de negócio, o schema do banco ou as
migrations existentes.
