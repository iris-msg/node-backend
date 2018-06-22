import { RouteContext } from '@/src/types'
import { Types } from 'mongoose'

function makeError (name: string) {
  return `api.members.destroy.${name}`
}

/* auth:
 * - jwt
 *
 * url params:
 * - org_id
 * - mem_id
 */
export default async ({ req, api, models, authJwt }: RouteContext) => {
  
  if (!Types.ObjectId.isValid(req.params.org_id) || !Types.ObjectId.isValid(req.params.org_id)) {
    throw makeError('notFound')
  }
  
  // Find the current user
  let user = await models.User.findWithJwt(authJwt)
  if (!user) throw makeError('api.general.badAuth')
  
  // Find the organisation
  let org = await models.Organisation.findByIdForCoordinator(
    req.params.org_id, user.id
  )
  if (!org) throw makeError('notFound')
  
  // Find the membership
  let member = org.members.id(req.params.mem_id)
  if (!member) throw makeError('notFound')
  
  // Mark the membership as deleted
  member.deletedOn = new Date()
  await org.save()
  
  // Return a success
  api.sendData('ok')
}
