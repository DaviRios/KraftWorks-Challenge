# Kraft Challenge — People Directory

Aplicação fullstack que consulta pessoas em cargos políticos na OpenStates,
armazena os dados em PostgreSQL e os exibe em uma interface React com filtros
por estado e partido.

O projeto pode ser executado por completo com Docker Compose. As migrations do
banco são aplicadas automaticamente quando o backend inicia.

## 1. Pré-requisitos

Para executar a aplicação, você precisa de:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e
  em execução;
- um token da OpenStates. Crie uma conta no
  [perfil da Plural Policy](https://open.pluralpolicy.com/accounts/profile/) e
  gere seu API Token.

Node.js e pnpm são necessários somente para executar os comandos de
desenvolvimento fora dos containers.

## 2. Criar o arquivo de ambiente

Na raiz do projeto, abra o PowerShell e copie o arquivo de exemplo:

```powershell
Copy-Item .env.example .env
```

Depois, abra o arquivo `.env` e substitua os valores de exemplo. Uma configuração
local pode ficar assim:

```dotenv
OPENSTATES_API_KEY=cole-seu-token-aqui
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=people_db
VITE_API_URL=http://localhost:3001
```

Não adicione aspas nem espaços antes ou depois dos valores. O arquivo `.env` é
ignorado pelo Git e não deve ser enviado ao repositório.

### Variáveis disponíveis

| Variável | Obrigatória | Finalidade |
| --- | --- | --- |
| `OPENSTATES_API_KEY` | Sim | Autentica as requisições de sincronização na OpenStates. |
| `PORT` | Não | Porta usada ao iniciar o backend manualmente. O Docker Compose fixa a porta `3001`. |
| `POSTGRES_USER` | Não | Usuário do PostgreSQL. O padrão do Compose é `postgres`. |
| `POSTGRES_PASSWORD` | Não | Senha do PostgreSQL. O padrão do Compose é `postgres`. |
| `POSTGRES_DB` | Não | Nome do banco. O padrão do Compose é `people_db`. |
| `VITE_API_URL` | Não | URL pública do backend usada pelo frontend. O padrão é `http://localhost:3001`. |

O backend recebe a `DATABASE_URL` montada automaticamente pelo Docker Compose e
escuta a porta `3001`; não é necessário configurar esses valores para o fluxo
com Docker.

## 3. Construir e iniciar a aplicação

Ainda na raiz do projeto, execute:

```powershell
docker compose up --build
```

Esse comando constrói e inicia três containers separados: PostgreSQL, backend e
frontend. Aguarde até os logs informarem que o backend está escutando na porta
`3001` e o frontend está disponível.

Para deixar os containers executando em segundo plano, use:

```powershell
docker compose up --build -d
```

## 4. URLs locais

Com os containers em execução:

- frontend: [http://localhost:5173](http://localhost:5173);
- backend: [http://localhost:3001](http://localhost:3001);
- documentação interativa da API: [http://localhost:3001/docs](http://localhost:3001/docs);
- especificação OpenAPI em JSON: [http://localhost:3001/docs/openapi.json](http://localhost:3001/docs/openapi.json).

O endereço `http://localhost:5173` é a URL esperada para a execução local com
Docker Compose. O desafio não exige publicação do frontend em um serviço de
hosting.

## 5. Executar a sincronização inicial

Em uma instalação nova, o PostgreSQL começa vazio. Para carregar os dados:

1. acesse [http://localhost:3001/docs](http://localhost:3001/docs);
2. abra `POST /api/people/sync`;
3. clique em **Test Request** e envie a requisição.

Esse endpoint realiza a sincronização geral e **não recebe body nem parâmetros**.
Também é possível executá-lo pelo PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/people/sync
```

Uma resposta bem-sucedida apresenta a quantidade de pessoas persistidas e de
jurisdições processadas:

```json
{
  "fetched": 7527,
  "states": 51
}
```

Os números acima são apenas um exemplo e podem mudar conforme os dados da
OpenStates. O campo `states` informa quantas jurisdições foram realmente
sincronizadas naquela execução e pode ser `0` quando todo o cache estiver
atualizado.

## 6. Tempo e cota da primeira carga

A sincronização percorre todas as páginas dos 50 estados e do Distrito de
Colúmbia. Por isso, a primeira carga pode levar vários minutos e consumir uma
parte relevante da cota do token da OpenStates. Mantenha o backend em execução e
aguarde a resposta antes de iniciar outra sincronização.

Não é necessário chamar esse endpoint para navegar ou filtrar dados que já
estejam salvos.

## 7. Como o cache funciona

O frontend consulta `GET /api/people`, e esse endpoint lê somente o PostgreSQL.
Ele não chama a OpenStates durante a listagem ou a aplicação dos filtros.

O endpoint `POST /api/people/sync` é o responsável por consultar a API externa e
fazer `upsert` dos registros. O identificador da OpenStates é único no banco,
evitando duplicações durante novas sincronizações.

Como o volume do PostgreSQL é persistente, ao parar e iniciar a stack novamente
os dados continuam disponíveis. Nas execuções futuras, basta subir os containers
e abrir o frontend. Ao solicitar outra sincronização, o backend consulta apenas
jurisdições sem dados ou cuja atualização mais recente ocorreu há mais de sete
dias. Uma segunda sincronização simultânea é recusada com status `409`.

## 8. Parar a aplicação sem apagar os dados

Na raiz do projeto, execute:

```powershell
docker compose down
```

Esse comando remove os containers e a rede, mas preserva o volume do PostgreSQL.

## 9. Apagar containers e dados locais

Para remover também o volume e todos os dados armazenados no PostgreSQL:

```powershell
docker compose down -v
```

Essa operação apaga o cache local. Na próxima inicialização será necessário
executar uma nova sincronização completa.

## 10. Desenvolvimento e validação

Para executar lint, testes e builds fora do Docker, instale
[Node.js](https://nodejs.org/) e ative o pnpm pelo Corepack:

```powershell
corepack enable
pnpm install --frozen-lockfile
```

Execute os comandos abaixo a partir da raiz do projeto.

### Backend

```powershell
pnpm --dir backend run lint
pnpm --dir backend run test
pnpm --dir backend run build
```

O build do backend também executa a geração do Prisma Client, os testes
unitários, o lint e a compilação TypeScript.

### Frontend

```powershell
pnpm --dir frontend run lint
pnpm --dir frontend run build
```

Para regenerar os tipos TypeScript a partir do contrato OpenAPI, mantenha o
backend em execução e use:

```powershell
pnpm --dir frontend run generate:types
```

## Endpoints principais

### `GET /api/people`

Lista pessoas armazenadas no PostgreSQL. O parâmetro `state` é obrigatório e
`party` é opcional.

```text
GET /api/people?state=CA
GET /api/people?state=CA&party=Democratic
```

### `POST /api/people/sync`

Atualiza o cache PostgreSQL com dados da OpenStates. A rota não recebe body e
pode levar vários minutos para responder.

## Estrutura do projeto

```text
kraft_challenge/
├── backend/          # API Fastify, Prisma, migrations e testes unitários
├── frontend/         # Vite, React, TypeScript e CSS Modules
├── compose.yaml      # PostgreSQL, backend e frontend
├── .env.example      # exemplo das variáveis do Docker Compose
└── README.md
```

## Tecnologias

- **Frontend:** Vite, React, TypeScript, TanStack Query, Fetch API, CSS Modules e
  Biome;
- **Backend:** Node.js, TypeScript, Fastify, Zod, Prisma, OpenAPI/Swagger e Biome;
- **Banco de dados:** PostgreSQL 17 com volume persistente;
- **Infraestrutura:** Docker e Docker Compose.
