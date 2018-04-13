import { applySeed, Seed, mockRoute, Agent, openDb, closeDb } from '../../../../tools/testHarness'
import verifyRequest from '../verifyRequest.route'
import * as express from 'express'
import * as supertest from 'supertest'
import { Mongoose } from 'mongoose'
import * as models from '../../../models'
import * as twilio from 'twilio'

jest.mock('twilio')

let db: Mongoose
let seed: Seed
let agent: Agent
let sentMessages: any[]

beforeEach(async () => {
  db = await openDb()
  seed = await applySeed('test/auth/verify-request', models)
  agent = mockRoute(verifyRequest)
  sentMessages = (twilio as any)().__resetMessages()
})

afterEach(async () => {
  await closeDb(db)
})

describe('auth.verify.request', () => {
  it('should create an unverified user', async () => {
    await agent.post('/')
      .send({ phoneNumber: '07880123003', locale: 'GB' })
    let users = await models.User.find()
    expect(users.length).toBe(3)
  })
  it('should format the phone number', async () => {
    await agent.post('/')
      .send({ phoneNumber: '07880123003', locale: 'GB' })
    let user = (await models.User.find())[2]
    expect(user.phoneNumber).toBe('+447880123003')
  })
  it('should create an authentication code', async () => {
    await agent.post('/')
      .send({ phoneNumber: '07880123003', locale: 'GB' })
    let codes = await models.AuthCode.find()
    expect(codes.length).toBe(1)
  })
  it('should send the authentication code', async () => {
    await agent.post('/')
      .send({ phoneNumber: '07880123003', locale: 'GB' })
    expect(sentMessages.length).toBe(1)
  })
  it('should format the authentication code', async () => {
    await agent.post('/')
      .send({ phoneNumber: '07880123003', locale: 'GB' })
    expect(sentMessages[0].body).toMatch(/\d{3}-\d{3}/)
  })
  it('should do nothing if the user exists', async () => {
    await agent.post('/')
      .send({ phoneNumber: '07880123001', locale: 'GB' })
    let users = await models.User.find()
    let codes = await models.AuthCode.find()
    expect(users).toHaveLength(2)
    expect(codes).toHaveLength(0)
    expect(sentMessages).toHaveLength(0)
  })
})