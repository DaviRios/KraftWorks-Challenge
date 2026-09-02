import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import type { PeopleService } from './people.service.js'

const syncPeopleBodySchema = z
  .object({
    state: z
      .string()
      .trim()
      .length(2)
      .toUpperCase()
      .regex(/^[A-Z]{2}$/)
      .describe('Sigla de duas letras do estado em maiúsculas. Exemplo: CA.'),
  })
  .describe('Parâmetros da sincronização por estado')

const personResponseSchema = z
  .object({
    id: z.string().describe('Identificador da pessoa na OpenStates'),
    name: z.string().describe('Nome completo'),
    role: z.string().nullable().describe('Cargo político atual'),
    imageUrl: z.string().nullable().describe('URL da foto, quando disponível'),
    state: z.string().describe('Nome da jurisdição ou estado'),
    party: z.string().nullable().describe('Partido político, quando disponível'),
  })
  .describe('Pessoa em cargo político')

const syncPeopleResponseSchema = z
  .object({
    fetched: z
      .number()
      .int()
      .nonnegative()
      .describe('Quantidade de pessoas recebidas e persistidas'),
    people: z.array(personResponseSchema).describe('Pessoas sincronizadas'),
  })
  .describe('Resultado da sincronização')

const errorResponseSchema = z
  .object({
    message: z.string().describe('Descrição do erro'),
  })
  .describe('Erro da aplicação')

const validationErrorResponseSchema = z
  .object({
    statusCode: z.number().int().describe('Código HTTP'),
    code: z.string().describe('Código interno do Fastify'),
    error: z.string().describe('Categoria do erro HTTP'),
    message: z.string().describe('Detalhes da validação'),
  })
  .describe('Erro de validação da requisição')

const peopleListResponseSchema = z
  .array(personResponseSchema)
  .describe('Pessoas disponíveis no cache PostgreSQL')

interface PeopleControllerOptions {
  peopleService: PeopleService
}

export async function peopleController(
  app: FastifyInstance,
  options: PeopleControllerOptions,
) {
  const typedApp = app.withTypeProvider<ZodTypeProvider>()

  typedApp.post(
    '/people/sync',
    {
      schema: {
        tags: ['People'],
        operationId: 'syncPeopleByState',
        summary: 'Sincroniza pessoas de um estado',
        description:
          'Consulta todas as páginas da OpenStates para a jurisdição informada e atualiza o cache PostgreSQL por meio de upsert. Esta operação consome a API externa.',
        body: syncPeopleBodySchema,
        response: {
          200: syncPeopleResponseSchema,
          400: validationErrorResponseSchema,
          500: errorResponseSchema,
          502: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await options.peopleService.syncByState(request.body.state)
        return reply.code(200).send(result)
      } catch (error) {
        request.log.error(
          {
            err: error,
            state: request.body.state,
          },
          'Failed to sync people from OpenStates API',
        )

        return reply.code(502).send({
          message: 'Não foi possível consultar a OpenStates',
        })
      }
    },
  )

  typedApp.get(
    '/people',
    {
      schema: {
        tags: ['People'],
        operationId: 'listPeople',
        summary: 'Lista pessoas do cache local',
        description:
          'Retorna as pessoas persistidas no PostgreSQL sem realizar chamadas à OpenStates.',
        response: {
          200: peopleListResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const people = await options.peopleService.list()

      return reply.code(200).send(people)
    },
  )
}
