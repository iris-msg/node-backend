import { applyMiddleware, applyRoutes, applyErrorHandler } from '../router'
import { openDb, closeDb } from '../../tools/testHarness'
import * as supertest from 'supertest'
import * as express from 'express'

const expectedRoutes = [
  { method: 'get', url: '/users/me' },
  { method: 'post', url: '/users/login-request' },
  { method: 'post', url: '/users/login-check' },
  { method: 'post', url: '/users/verify-request' },
  { method: 'post', url: '/users/verify-check' },
  { method: 'post', url: '/users/update-fcm' }
  
  // { method: 'get', url: '/organisations' },
  // { method: 'get', url: '/organisations/1' },
  // { method: 'post', url: '/organisations' },
  // { method: 'del', url: '/organisations/1' },
  // { method: 'get', url: '/organisations/1/donors' },
  // { method: 'get', url: '/organisations/1/subscribers' }
]

describe('Routing', () => {
  
  let app: express.Express
  let agent: supertest.SuperTest<supertest.Test>
  let db: any
  beforeEach(async () => {
    db = await openDb()
    app = express()
    applyMiddleware(app)
    applyRoutes(app)
    applyErrorHandler(app)
    agent = supertest.agent(app)
  })
  
  afterEach(async () => {
    await closeDb(db)
  })
  
  expectedRoutes.forEach(({ method = 'get', url }) => {
    it(`${method.toUpperCase()}: ${url}`, async () => {
      let { status } = await (agent as any)[method](url)
      expect(status).not.toBe(404)
      expect(status).not.toBe(500)
    })
  })
  
})
