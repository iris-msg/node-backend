import express from 'express'
import mongoose from 'mongoose'
import { existsSync } from 'fs'
import { join } from 'path'
import { applyMiddleware, applyRoutes, applyErrorHandler } from './router'
import { makeModels, IModelSet } from './models'
import { I18n, i18n, LocalI18n } from './i18n'
import { initializeFirebase, firebaseEnabled } from './services'
import { ReallocationTask } from './tasks'
import winston from 'winston'
import validateEnvironment from 'valid-env'
import { runMigrations } from './migrator'

//
// The environment variables that are required for the app to start
//
export const RequiredVariables = [
  'MONGO_URI',
  'JWT_SECRET',
  'API_URL',
  'WEB_URL',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_SID',
  'TWILIO_NUMBER',
  'PLAY_STORE_URL'
]

//
// The files that must be present for the app to start
//
export const RequiredFiles = ['assetlinks.json', 'google-account.json']

//
// Arguments for mongo (defined here to be reused everywhere)
//
export const mongoArgs: mongoose.ConnectionOptions = {
  useNewUrlParser: true,
  useCreateIndex: true,
  useUnifiedTopology: true
}

//
// Wraps up the running of the whole API into an instance of this class
//
export default class App {
  reallocTask = new ReallocationTask()

  static create(): App {
    return new this()
  }

  async run() {
    try {
      let logger = this.makeLogger()
      logger.debug('Starting up')

      this.checkEnvironment()
      logger.debug('Environment is ok')

      initializeFirebase()
      logger.debug('Initialized Firebase')

      let i18n = await this.makeI18n()
      let models = makeModels(mongoose.connection)
      let app = this.createExpressApp(models, i18n, logger)
      logger.debug('Created app')

      await new Promise(resolve => app.listen(3000, resolve))
      logger.info('Server started on 0.0.0.0:3000')

      await this.connectToMongo()
      logger.debug('Connected to Mongo')

      let migrations = await runMigrations(
        mongoose.connection,
        join(__dirname, 'migrations')
      )
      if (migrations.length === 0) {
        logger.debug('No migrations to run')
      } else {
        logger.debug('Ran migrations: ' + migrations.join(', '))
      }

      this.startTasks(models, i18n.makeInstance('en'), logger)
      logger.debug('Started tasks')
    } catch (error) {
      console.log('Failed to start')
      console.log(error)
    }
  }

  async makeI18n(): Promise<I18n> {
    await i18n.setup()
    return i18n
  }

  makeLogger(): winston.Logger {
    let logLevel = (process.env.LOG_LEVEL || 'error').toLowerCase()

    let allowedLevels = ['error', 'warn', 'info', 'verbose', 'debug', 'silly']

    if (!allowedLevels.includes(logLevel)) {
      console.log(`Invalid Log level '${logLevel}'`)
      process.exit(1)
    }

    let allLevels = winston.config.npm.levels
    let current = winston.config.npm.levels[logLevel]

    let logsPath = join(__dirname, '../logs')

    return winston.createLogger({
      level: logLevel,
      format: winston.format.json(),
      transports: [
        new winston.transports.File({
          filename: 'error.log',
          dirname: logsPath,
          level: 'error',
          silent: current < allLevels.error
        }),
        new winston.transports.File({
          filename: 'warn.log',
          dirname: logsPath,
          level: 'warn',
          silent: current < allLevels.warn
        }),
        new winston.transports.File({
          filename: 'info.log',
          dirname: logsPath,
          level: 'info',
          silent: current < allLevels.info
        }),
        new winston.transports.File({
          filename: 'debug.log',
          dirname: logsPath,
          level: 'debug',
          silent: current < allLevels.debug
        }),
        new winston.transports.Console({
          level: logLevel,
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    })
  }

  startTasks(models: IModelSet, i18n: LocalI18n, log: winston.Logger) {
    this.reallocTask.schedule({ models, i18n, log })
  }

  checkEnvironment() {
    // See if there are any missing variables
    // and fail if there are any missing variables
    validateEnvironment(RequiredVariables)

    // See if there are any missing files
    // Uses `sync` because the app cannot start without them
    let missingFiles = RequiredFiles.map(filename =>
      join(__dirname, '..', filename)
    ).filter(path => !existsSync(path))

    if (missingFiles.length > 0) {
      console.log(`Missing files: ${missingFiles.join(', ')}`)
      process.exit(1)
    }

    // Work out if we can use firebase
    if (!firebaseEnabled()) {
      console.log(`Firebase isn't configured`)
      console.log(`- Ensure 'FIREBASE_DB' is set`)
      console.log(`- Ensure 'google-account.json' is mounted and valid`)
      process.exit(1)
    }
  }

  createExpressApp(
    models: IModelSet,
    i18n: I18n,
    log: winston.Logger
  ): express.Application {
    let app = express()
    applyMiddleware(app, log)
    applyRoutes(app, models, i18n, log)
    applyErrorHandler(app, i18n, log)
    return app
  }

  async connectToMongo() {
    return mongoose.connect(process.env.MONGO_URI!, mongoArgs)
  }
}

export const defaultApp = new App()
