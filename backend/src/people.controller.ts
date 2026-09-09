import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { type PeopleService, SyncAlreadyRunningError } from './people.service.js'

const peopleListQuerySchema = z.object({
  state: z
    .string()
    .trim()
    .length(2)
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  party: z.string().trim().optional(),
})

const personResponseSchema = z
  .object({
    id: z.string().describe('Identificador da pessoa na OpenStates'),
    name: z.string().describe('Nome completo'),
    role: z.string().nullable().describe('Cargo político atual'),
    imageUrl: z.string().nullable().describe('URL da foto, quando disponível'),
    state: z
      .string()
      .length(2)
      .toUpperCase()
      .regex(/^[A-Z]{2}$/)
      .describe('Nome da jurisdição ou estado'),
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
    states: z
      .number()
      .int()
      .nonnegative()
      .describe('Quantidade de estados e jurisdições sincronizados nesta execução'),
  })
  .describe('Resumo da sincronização geral')

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
        operationId: 'syncAllPeople',
        summary: 'Sincroniza pessoas de todos os estados',
        description:
          'Sincroniza as jurisdições sem dados ou cuja última atualização ocorreu há mais de sete dias. Percorre as páginas da OpenStates, respeita o limite da API externa e atualiza o cache PostgreSQL usando upsert. A primeira execução pode levar vários minutos.',
        response: {
          200: syncPeopleResponseSchema,
          409: errorResponseSchema,
          500: errorResponseSchema,
          502: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await options.peopleService.syncAll()
        return reply.code(200).send(result)
      } catch (error) {
        if (error instanceof SyncAlreadyRunningError) {
          return reply.code(409).send({
            message: error.message,
          })
        }

        request.log.error(
          {
            err: error,
          },
          'Failed to sync people from OpenStates API',
        )
        return reply.code(502).send({
          message: 'Failed to sync people from OpenStates API',
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
        querystring: peopleListQuerySchema,
        description:
          'Retorna as pessoas persistidas no PostgreSQL sem realizar chamadas à OpenStates.',
        response: {
          200: peopleListResponseSchema,
          400: validationErrorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const people = await options.peopleService.list(request.query)
      return reply.code(200).send(people)
    },
  )
}
