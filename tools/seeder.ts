import { Model, Document } from 'mongoose'
import { resolve } from 'path'
import { safeLoad } from 'js-yaml'
import { readFile } from 'fs-extra'
import { IModelSet } from '../src/models'

export type Seed = {
  [modelName: string]: {
    [id: string]: any
  }
}

export type ModelMap = {
  [modelName: string]: Model<Document>
}

export async function applySeed (seedName: String, models: IModelSet) {
  let path = resolve(__dirname, `../seeds/${seedName}.yml`)
  let seed = safeLoad(String(await readFile(path)))
  
  if (!seed) throw new Error('Invalid Seed')
  
  let output: any = {}
  await Promise.all(Object.entries(seed).map(async ([modelName, data]) => {
    if (!(models as any)[modelName]) {
      throw new Error(`Invalid model in seed '${modelName}'`)
    } else {
      output[modelName] = await seedModel((models as any)[modelName], data)
    }
  }))
  
  return output
}

async function seedModel (Model: Model<Document>, data: any): Promise<any> {
  let names = Object.keys(data)
  let documents = Object.values(data)
  
  let models = await Model.insertMany(documents)
  
  let keyedModels: any = {}
  models.forEach((model, index) => {
    keyedModels[names[index]] = model
  })
  
  return keyedModels
}
