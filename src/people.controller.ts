import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import type { PeopleService } from './people.service.js'

const syncPeopleBodySchema = z.object({
  state: z.string().trim().min(2),
})

const personResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string().nullable(),
  imageUrl: z.string().nullable(),
  state: z.string(),
  party: z.string(),
})

const syncPeopleResponseSchema = z.object({
  fetched: z.number().int().nonnegative(),
  people: z.array(personResponseSchema),
})

const errorResponseSchema = z.object({
  message: z.string(),
})

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
        summary: 'Busca e atualiza pessoas de um estado',
        body: syncPeopleBodySchema,
        response: {
          200: syncPeopleResponseSchema,
          502: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await options.peopleService.fetchByState(request.body.state)

        return reply.code(200).send(result)
      } catch (error) {
        request.log.error(error)

        return reply.code(502).send({
          message: 'Não foi possível consultar a OpenStates',
        })
      }
    },
  )
}
