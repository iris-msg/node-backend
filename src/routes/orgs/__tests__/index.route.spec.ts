import * as tst from '../../../../tools/testHarness'
import index from '../index.route'
import { IModelSet } from '../../../models'
import { MemberRole } from '../../../types'

let db: any
let models: IModelSet
let seed: tst.Seed
let agent: tst.Agent

async function pushMember(org: any, args: any) {
  org.members.push(args)
  await org.save()
}

beforeEach(async () => {
  ;({ db, models } = await tst.openDb())
  seed = await tst.applySeed('test/orgs', models)
  agent = tst.mockRoute(index, models, { jwt: true })
})

afterEach(async () => {
  await tst.closeDb(db)
})

describe('orgs.index', () => {
  it('should return organisations you belong to', async () => {
    await pushMember(seed.Organisation.a, {
      user: seed.User.verified.id,
      role: MemberRole.Coordinator,
      confirmedOn: new Date()
    })

    let res = await agent.get('/').set(tst.jwtHeader(seed.User.verified.id))

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
  })

  it('should return nothing for unverified users', async () => {
    await pushMember(seed.Organisation.a, {
      user: seed.User.unverified.id,
      role: MemberRole.Coordinator,
      confirmedOn: new Date()
    })

    let res = await agent.get('/').set(tst.jwtHeader(seed.User.unverified.id))

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([])
  })
})
