import { fastify } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'

import { fastifySwagger } from '@fastify/swagger'
import { fastifyCors } from '@fastify/cors'
import ScalarApiReference from '@scalar/fastify-api-reference'
import { peopleController } from './people.controller.js'
import { PeopleService } from './people.service.js'
import { PeopleRepository } from './people.repository.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'

const app = fastify({
  logger: true,
}).withTypeProvider<ZodTypeProvider>()

const databaseUrl = process.env.DATABASE_URL
const apiKey = process.env.OPENSTATES_API_KEY

if (!databaseUrl) {
  throw new Error('DATABASE_URL não foi definida')
}

const port = Number(process.env.PORT ?? 3001)

if (!Number.isInteger(port) || port <= 0) {
  throw new Error('PORT possui um valor inválido')
}

if (!apiKey) {
  throw new Error('OPENSTATES_API_KEY não foi definida')
}

const adapter = new PrismaPg({
  connectionString: databaseUrl,
})

const prisma = new PrismaClient({
  adapter,
})

const peopleRepository = new PeopleRepository(prisma)

const peopleService = new PeopleService(apiKey, peopleRepository)
app.setValidatorCompiler(validatorCompiler)
app.setSerializerCompiler(serializerCompiler)

app.register(fastifyCors, {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  //credentials: true, // permite envio automatico de cookies do front para o back sem precisar manualmente add cookies
})

app.register(fastifySwagger, {
  openapi: {
    info: {
      title: 'Kraft Works People API',
      description:
        'API REST que sincroniza pessoas em cargos políticos a partir da OpenStates e serve os dados armazenados localmente no PostgreSQL.',
      version: '1.0.0',
    },
    externalDocs: {
      description: 'Documentação da OpenStates API v3',
      url: 'https://v3.openstates.org/docs',
    },
    servers: [
      {
        url: `http://localhost:${port}`,
        description: 'Ambiente local',
      },
    ],
    tags: [
      {
        name: 'People',
        description: 'Consulta do cache local e sincronização com a OpenStates.',
      },
    ],
  },
  transform: jsonSchemaTransform,
})

app.register(ScalarApiReference, {
  routePrefix: '/docs',
  openApiDocumentEndpoints: {
    json: '/openapi.json',
    yaml: '/openapi.yaml',
  },
  configuration: {
    theme: 'purple',
    layout: 'modern',
    defaultHttpClient: {
      targetKey: 'js',
      clientKey: 'fetch',
    },
  },
})

app.register(peopleController, {
  prefix: '/api',
  peopleService,
})

app.addHook('onClose', async () => {
  await prisma.$disconnect()
})

async function start() {
  try {
    await app.listen({
      port,
      host: '0.0.0.0',
    })

    app.log.info('Server is running at http://localhost:3001')
    app.log.info('API documentation at http://localhost:3001/docs')
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

void start()
