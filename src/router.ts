import express from 'express'
import bodyParser from 'body-parser'
import expressJwt from 'express-jwt'
import langParser from 'accept-language-parser'
import winston from 'winston'
import cors from 'cors'
import { RouteContext } from './types'
import * as routes from './routes'
import { IModelSet } from './models'
import { I18n, AvailableLocales, LocalisedApi } from './i18n'
import * as middleware from './middleware'
import path from 'path'

type CustomRoute = (ctx: RouteContext) => Promise<void>

type ExpressRoute = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => void

export function getLocale(req: express.Request): string {
  let accept: any = req.headers['accept-language'] || ''
  return langParser.pick(AvailableLocales, accept) || 'en'
}

export function makeRoute(
  route: CustomRoute,
  models: IModelSet,
  localiser: I18n,
  log: winston.Logger
): ExpressRoute {
  return async (req, res, next) => {
    try {
      let api = (req as any).api as LocalisedApi
      let authJwt = (req as any).user
      let i18n = localiser.makeInstance(getLocale(req))
      api.setLocaliser(i18n)
      await route({ models, i18n, req, res, next, api, authJwt, log })
    } catch (error) {
      next(error)
    }
  }
}

export function applyMiddleware(app: express.Application, log: winston.Logger) {
  app.use(bodyParser.urlencoded({ extended: false }))
  app.use(bodyParser.json())
  app.use(middleware.api())
  app.use(middleware.log(log, [/^\/docs/, /^\/health/]))
}

export function applyRoutes(
  app: express.Application,
  models: IModelSet,
  i18n: I18n,
  log: winston.Logger
) {
  const r = (route: CustomRoute) => makeRoute(route, models, i18n, log)

  // Reusable middleware
  let requiredJwt = middleware.jwt()
  let optionalJwt = middleware.jwt({ credentialsRequired: false })

  // Setup cors
  app.use(
    cors({
      origin: process.env.WEB_URL,
      allowedHeaders: [
        'X-Requested-With',
        'X-HTTP-Method-Override',
        'Content-Type, Accept'
      ]
    })
  )

  // General
  app.get('/', r(routes.general.hello))
  app.get('/health', r(routes.general.health))
  app.get('/app-version', r(routes.general.appVersion))
  app.get('/.well-known/assetlinks.json', r(routes.general.assetlinks))
  app.get('/open/*', r(routes.general.open))
  app.use('/docs', express.static('docs'))

  // Auth
  app.get('/users/me', optionalJwt, r(routes.auth.me))
  app.post('/users/login/request', optionalJwt, r(routes.auth.loginRequest))
  app.post('/users/login/check', optionalJwt, r(routes.auth.loginCheck))
  app.post('/users/update_fcm', requiredJwt, r(routes.auth.updateFcm))

  // Org Management
  app.get('/organisations', requiredJwt, r(routes.orgs.index))
  app.get('/organisations/:org_id', requiredJwt, r(routes.orgs.show))
  app.get('/organisations/:org_id/members', requiredJwt, r(routes.orgs.members))
  app.post('/organisations', requiredJwt, r(routes.orgs.create))
  app.delete('/organisations/:org_id', requiredJwt, r(routes.orgs.destroy))

  // Org Members
  app.post(
    '/organisations/:org_id/members',
    requiredJwt,
    r(routes.members.create)
  )
  app.delete(
    '/organisations/:org_id/members/:mem_id',
    requiredJwt,
    r(routes.members.destroy)
  )
  app.post('/accept/:token', r(routes.members.acceptInvite))
  app.get('/unsub/:token', r(routes.members.confirmUnsub))
  app.get('/unsub/:token/confirm', r(routes.members.unsubscribe))
  app.get('/invite/:token', r(routes.members.showInvite))

  // Messaging
  app.post('/messages', requiredJwt, r(routes.messages.create))
  app.get('/messages/attempts', requiredJwt, r(routes.messages.attemptsIndex))
  app.post('/messages/attempts', requiredJwt, r(routes.messages.attemptsUpdate))

  // SMS hooks
  app.post('/sms/handle', r(routes.sms.handle))

  // Public folder fallback
  app.use(
    express.static(path.join(__dirname, 'public'), {
      dotfiles: 'allow',
      index: false
    })
  )
}

export function applyErrorHandler(
  app: express.Application,
  localiser: I18n,
  log: winston.Logger
) {
  app.use(
    (
      error: any,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      let api = (req as any).api as LocalisedApi
      api.setLocaliser(localiser.makeInstance(getLocale(req)))

      if (error instanceof Set) {
        let errors = Array.from(error)
        log.error(`Caught errors: ${errors.join()}`)
        return api.sendFail(errors)
      }
      if (Array.isArray(error)) {
        log.error(`Caught errors: ${error.join()}`)
        return api.sendFail(error)
      }
      if (typeof error === 'string') {
        log.error(`Caught error: ${error}`, error)
        return api.sendFail(error)
      }
      if (error instanceof expressJwt.UnauthorizedError) {
        log.error(`Caught jwt.UnauthorizedError error`)
        return api.sendFail(`jwt.${error.code}`, 401)
      }
      if (error instanceof Error && api) {
        log.error(`Caught an error '${error.message}'`, {
          error,
          stack: error.stack
        })
        return api.sendFail(error.message, 400)
      }

      return api.sendFail('api.general.unknown')
    }
  )
}
