import * as tst from '@/tools/testHarness'
import create, { makeMessage } from '../create.route'
import { IModelSet } from '@/src/models'
import { MemberRole } from '@/src/types'
import { Response } from 'superagent'
import { verify } from 'jsonwebtoken'
import twilio from 'twilio'

jest.mock('twilio')

let db: any
let models: IModelSet
let seed: tst.Seed
let agent: tst.Agent
let sentMessages: any[]
let i18n = tst.mockI18n()

beforeEach(async () => {
  ;({ db, models } = await tst.openDb())
  seed = await tst.applySeed('test/members', models)
  agent = tst.mockRoute(create, models, { jwt: true, path: '/:org_id' })
  sentMessages = (twilio as any)().__resetMessages()

  seed.Organisation.a.members.push({
    role: MemberRole.Coordinator,
    confirmedOn: new Date(),
    user: seed.User.current.id
  })
  await seed.Organisation.a.save()
})

afterEach(async () => {
  await tst.closeDb(db)
})

async function inviteMember(
  phoneNumber: string,
  role: MemberRole,
  label?: string
): Promise<Response> {
  return agent
    .post('/' + seed.Organisation.a.id)
    .set(tst.jwtHeader(seed.User.current.id))
    .send({ phoneNumber, role, countryCode: 'GB', label })
}

function jwtPayloadFromMessageUrl(url: string): any {
  let token = url.split('/').pop()!
  return verify(token, process.env.JWT_SECRET!) as any
}

describe('orgs.members.invite', () => {
  it('should add a verified subscriber', async () => {
    let res = await inviteMember('07880123002', MemberRole.Subscriber)

    expect(res.status).toBe(200)

    let org = await models.Organisation.findById(seed.Organisation.a.id)
    expect(org!.members[1]).toMatchObject({
      user: seed.User.verified._id,
      confirmedOn: expect.any(Date),
      role: MemberRole.Subscriber
    })
  })

  it('should add an unverified subscriber', async () => {
    let res = await inviteMember('07880123002', MemberRole.Donor)

    expect(res.status).toBe(200)

    let org = await models.Organisation.findById(seed.Organisation.a.id)
    expect(org!.members[1]).toMatchObject({
      user: seed.User.verified._id,
      confirmedOn: null,
      role: MemberRole.Donor
    })
  })

  it('should create a verified user if not found', async () => {
    await inviteMember('07880123004', MemberRole.Subscriber)

    let user = await models.User.findOne({
      phoneNumber: '+447880123004'
    })

    expect(user).toBeTruthy()
    expect(user!.locale).toEqual('en')
    expect(user!.verifiedOn).toEqual(expect.any(Date))
  })

  it('should send the user a sms', async () => {
    await inviteMember('07880123002', MemberRole.Subscriber)
    expect(sentMessages).toHaveLength(1)
  })

  it('should fail if already a member', async () => {
    let org = seed.Organisation.a
    tst.addMember(org, seed.User.verified, MemberRole.Donor)
    await org.save()
    let res = await inviteMember('07880123002', MemberRole.Donor)
    expect(res.status).toBe(400)
  })

  it('should add a label to the member', async () => {
    await inviteMember('07880123002', MemberRole.Subscriber, 'new-sub')

    let org = await models.Organisation.findById(seed.Organisation.a.id)
    let member = org!.members.slice(-1)[0]
    expect(member.label).toBe('new-sub')
  })

  describe('#makeMessage', () => {
    // let memberId = 'fake-mem-id'
    // let orgId = 'fake-org-id'

    it('should add an unsub link for subscribers', async () => {
      const memberId = seed.Organisation.a.members[0].id

      let message = await makeMessage(
        i18n,
        MemberRole.Subscriber,
        seed.Organisation.a,
        memberId
      )

      let { mem, org } = jwtPayloadFromMessageUrl(message)

      expect(mem).toBe(memberId)
      expect(org).toBe(seed.Organisation.a.id)
    })

    it('should add a accept link for donors', async () => {
      const memberId = seed.Organisation.a.members[0].id

      let message = await makeMessage(
        i18n,
        MemberRole.Donor,
        seed.Organisation.a,
        memberId
      )

      let { mem, org } = jwtPayloadFromMessageUrl(message)

      expect(mem).toBe(memberId)
      expect(org).toBe(seed.Organisation.a.id)
    })
  })
})
