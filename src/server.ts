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

const app = fastify().withTypeProvider<ZodTypeProvider>()

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
      title: 'API challenge',
      description: 'API for the challenge project of kraft works',
      version: '1.0.0',
    },
  },
  transform: jsonSchemaTransform,
})

app.register(ScalarApiReference, {
  routePrefix: '/docs',
})

app.listen({ port: 3000, host: '0.0.0.0' }).then(() => {
  console.log('Server is running')
  console.log('Swagger docs available at http://0.0.0.0:3000/docs')
})
