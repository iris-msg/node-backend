import { Schema, Types } from 'mongoose'

const schemaOptions = {
  timestamps: true
}

export enum AttemptState {
  Pending = 'PENDING',
  Rejected = 'REJECTED',
  Failed = 'FAILED',
  Success = 'SUCCESS',
  NoService = 'NO_SERVICE',
  NoSmsData = 'NO_SMS_DATA',
  RadioOff = 'RADIO_OFF',
  Twilio = 'TWILIO',
  NoSenders = 'NO_SENDERS',
  NoResponse = 'NO_RESPONSE'
}

export interface IMessageAttempt extends Types.Subdocument {
  state: AttemptState
  recipient: Schema.Types.ObjectId
  donor: Schema.Types.ObjectId
  previousAttempt?: Schema.Types.ObjectId
}

export const MessageAttemptSchema = new Schema({
  state: {
    type: String,
    enum: Object.values(AttemptState)
  },
  recipient: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  donor: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  previousAttempt: {
    type: Schema.Types.ObjectId
  }
}, schemaOptions)