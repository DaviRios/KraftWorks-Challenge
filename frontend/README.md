# Representa - frontend

Interface em Vite, React e TypeScript para consultar as pessoas armazenadas pela
API do desafio. Os filtros de estado e partido atualizam a consulta imediatamente.

## Desenvolvimento

```bash
npm install
npm run dev
```

Por padrão, a aplicação consulta `http://localhost:3001`. Para usar outro endereço,
copie `.env.example` para `.env` e altere `VITE_API_URL`.

## Contrato da API

Com o backend em execução, gere novamente os tipos a partir do Swagger:

```bash
npm run generate:types
```

## Validação

```bash
npm run lint
npm run build
```
