'use strict'

const inflection = require('inflection')

const settings = require('./settings')
const reservedKeys = settings.reservedKeys
const vocabulary = settings.vocabulary
const namespace = settings.namespace
const namespaceDelimiter = settings.namespaceDelimiter

const idField = namespace + namespaceDelimiter + reservedKeys.identifier
const metaField = namespace + namespaceDelimiter + reservedKeys.meta


module.exports = {
  showContext, validateContext, mapRecord, showQueries,
  attachIncluded, parseBuffer, extractNamespace
}


function showContext (options) {
  const context = { [namespace]: vocabulary }

  if (options.vocabulary)
    context[reservedKeys.vocabulary] = options.vocabulary

  if (options.base)
    context[reservedKeys.base] = options.base

  Object.assign(context, options.namespaces)

  return context
}


function validateContext (payload) {
  const BadRequestError = this.errors.BadRequestError
  const vocab = this.options.vocabulary
  const namespaces = this.options.namespaces

  if (!(reservedKeys.context in payload)) throw new BadRequestError(
    `The "${reservedKeys.context}" object is missing.`)

  if (vocab && payload[reservedKeys.context][reservedKeys.vocabulary]
    !== vocab) throw new BadRequestError(
      `The "${reservedKeys.vocabulary}" value is invalid, ` +
      `it must be "${vocab}".`)

  if (payload[reservedKeys.context][namespace]
    !== vocabulary) throw new BadRequestError(
      `The "${namespace}" value is invalid, ` +
      `it must be "${vocabulary}".`)

  for (let ns in namespaces)
    if (payload[reservedKeys.context][ns] !== namespaces[ns])
      throw new BadRequestError(
        `The "${ns}" namespace is invalid, ` +
        `it must be "${namespaces[ns]}".`)
}


function mapRecord (type, record) {
  const keys = this.keys
  const recordTypes = this.recordTypes
  const encodeRoute = this.encodeRoute
  const options = this.options

  const inflectType = options.inflectType
  const uriBase64 = options.uriBase64
  const namespaceMap = options.namespaceMap

  const typeKey = inflectType ? inflection.capitalize(type) : type
  const fields = recordTypes[type]
  const id = record[keys.primary]
  const clone = {}

  clone[reservedKeys.type] = (typeKey in namespaceMap ?
    `${namespaceMap[typeKey]}:` : '') + typeKey

  clone[reservedKeys.id] = encodeRoute(type, id, null, uriBase64)

  clone[metaField] = { [reservedKeys.context]: null }
  clone[idField] = id

  for (let field in record) {
    const fieldDefinition = fields[field]
    const key = field in namespaceMap ?
      `${namespaceMap[field]}:${field}` : field

    // Handle undefined fields.
    if (!fieldDefinition) {
      if (field !== keys.primary)
        clone[metaField][key] = record[field]
      continue
    }

    // Rearrange order of typed fields.
    if (fieldDefinition[keys.type]) {
      clone[key] = record[field]
      continue
    }

    // Handle link fields.
    const ids = record[field]
    const fieldIsReverse = fieldDefinition[reservedKeys.isReverse]

    const node = {
      [reservedKeys.id]: encodeRoute(type, id, field, uriBase64),
      [idField]: ids
    }

    if (!fieldIsReverse) clone[key] = node
    else {
      const field = fieldDefinition[keys.inverse]
      const key = field in namespaceMap ?
        `${namespaceMap[field]}:${field}` : field

      if (!(reservedKeys.reverse in clone))
        clone[reservedKeys.reverse] = {}

      clone[reservedKeys.reverse][key] = node
    }
  }

  if (Object.keys(clone[metaField]).length === 1) delete clone[metaField]

  return clone
}


function showQueries (meta) {
  const include = meta.include
  const options = meta.options

  return {
    include: include ? include.map(path => path.join('.')) : [],
    offset: options.offset || 0,
    limit: options.limit || 0,
    match: options.match || {},
    range: options.range || {},
    exists: options.exists || {},
    fields: options.fields || {},
    sort: options.sort || {}
  }
}


function attachIncluded (record) {
  if (!(metaField in record))
    record[metaField] = { [reservedKeys.context]: null }

  record[metaField].included = true

  return record
}


function parseBuffer (payload) {
  const BadRequestError = this.errors.BadRequestError

  if (!Buffer.isBuffer(payload)) return payload

  try {
    return JSON.parse(payload.toString())
  }
  catch (error) {
    throw new BadRequestError(`Invalid JSON: ${error.message}`)
  }
}


function extractNamespace (key, namespaceMap) {
  const BadRequestError = this.errors.BadRequestError
  let namespace

  // Extract the namespace.
  key = key.split(namespaceDelimiter)
  if (key.length > 1) {
    namespace = key[0]
    key = key.slice(1).join(namespaceDelimiter)
  }
  else key = key[0]

  // Check the namespace.
  if (key in namespaceMap && namespace !== namespaceMap[key])
    throw new BadRequestError(`The namespace for "${key}" ` +
      `must be "${namespaceMap[key]}".`)

  return key
}
