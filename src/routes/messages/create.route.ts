import { RouteContext, MemberRole, MessageAttemptState } from '@/src/types'
import { IMember, IUser, IOrganisationWithUsers } from '@/src/models'
import { roundRobin, isMongoId } from '@/src/utils'
import { makeFirebaseMessenger, sendNewDonationFcm } from '@/src/services'

function makeError(name: string) {
  return `api.messages.create.${name}`
}

/* body params:
 * - orgId
 * - content
 */
export default async ({
  req,
  api,
  models,
  i18n,
  authJwt,
  log
}: RouteContext) => {
  // Check the request body
  let { orgId, content } = req.body
  let errors = new Set<string>()
  if (!content || content.length >= 140) {
    errors.add(makeError('badContent'))
  }
  if (!orgId || !isMongoId(orgId)) {
    errors.add(makeError('badOrg'))
  }
  if (errors.size > 0) throw errors

  // Check the user is valid
  let user = await models.User.findWithJwt(authJwt)
  if (!user) throw new Error('api.general.badAuth')

  // Check the org is valid
  let org: IOrganisationWithUsers = (await models.Organisation.findByIdForCoordinator(
    orgId,
    user.id
  ).populate('members.user')) as any

  // Fail if the organisation wasn't found
  if (!org) throw makeError('badOrg')

  // Cache now as a date
  let now = new Date()

  // Fetch active donors
  let donorList = org.members.filter(member => {
    let user: IUser = member.user as any
    return (
      member.role === MemberRole.Donor &&
      isActiveMember(member, user, now) &&
      user.fcmToken !== null
    )
  })

  // Fetch active subscribers
  let subscriberList = org.members.filter(member => {
    let user: IUser = member.user as any
    return (
      member.role === MemberRole.Subscriber && isActiveMember(member, user, now)
    )
  })

  // Allocate each subscriber a donor to send the message
  let allocation = roundRobin(
    subscriberList.map(d => d.user.id),
    donorList.map(d => d.user.id)
  )

  // Create the message
  let message = new models.Message({
    content,
    organisation: orgId,
    author: user.id
  })

  // Add an attempt for each allocation
  Object.keys(allocation).forEach(subscriberId => {
    message.attempts.push({
      state: MessageAttemptState.Pending,
      recipient: subscriberId,
      donor: allocation[subscriberId]
    })
  })

  // Store the message
  await message.save()

  // Send out fcm's to each donor
  let messenger = makeFirebaseMessenger()

  // Filter out the donors which have sms to send
  let usedDonors = Object.values(allocation)
  let activeDonors = donorList.filter(donor =>
    usedDonors.includes(donor.user.id)
  )

  // Send firebase messages to those donors
  await Promise.all(
    activeDonors.map(donor =>
      sendNewDonationFcm(messenger, donor.user, i18n, log)
    )
  )

  api.sendData(message)
}

function isActiveMember(member: IMember, user: IUser, since: Date): boolean {
  return (
    member.confirmedOn !== null &&
    member.confirmedOn <= since &&
    member.deletedOn === null &&
    user.verifiedOn !== null &&
    user.verifiedOn <= since
  )
}
