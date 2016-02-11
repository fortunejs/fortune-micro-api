'use strict'

const inflection = require('inflection')

const settings = require('./settings')
const reservedKeys = settings.reservedKeys
const inBrackets = settings.inBrackets
const vocabulary = settings.vocabulary
const namespace = settings.namespace
const namespaceDelimiter = settings.namespaceDelimiter
const queryDelimiter = settings.queryDelimiter
const isField = settings.isField
const isMatch = settings.isMatch

const idField = namespace + namespaceDelimiter + reservedKeys.identifier
const metaField = namespace + namespaceDelimiter + reservedKeys.meta


module.exports = {
  initializeContext, showContext, validateContext, mapRecord, showQueries,
  attachIncluded, castId, encodeRoute, parseBuffer, extractNamespace
}


function initializeContext (contextRequest, request, response) {
  const uriTemplate = this.uriTemplate
  const methodMap = this.methodMap
  const recordTypes = this.recordTypes
  const adapter = this.adapter
  const keys = this.keys
  const NotFoundError = this.errors.NotFoundError
  const meta = contextRequest.meta
  const options = this.options
  const namespaceMap = options.namespaceMap
  const obfuscateURIs = options.obfuscateURIs
  const inflectPath = options.inflectPath
  const inflectType = options.inflectType
  const allowLevel = options.allowLevel
  let url = request.url

  request.meta = {}

  // Set the request method.
  const method = request.meta.method = contextRequest.method =
    methodMap[request.method]

  // Unobfuscate URIs.
  if (obfuscateURIs) {
    // The query string should not be obfuscated.
    const route = url.slice(1).split(queryDelimiter)
    const query = queryDelimiter + route.slice(1).join(queryDelimiter)

    url = '/' + new Buffer((route[0] + Array(5 - route[0].length % 4)
      .join('=')).replace(/\-/g, '+').replace(/_/g, '/'), 'base64')
      .toString() + query
  }

  // Decode URI Component only for the query string.
  const uriObject = contextRequest.uriObject = uriTemplate.fromUri(url)

  if (!Object.keys(uriObject).length && url.length > 1)
    throw new NotFoundError(`Invalid URI.`)

  const type = request.meta.type = contextRequest.type =
    uriObject.type ? inflectPath ?
      inflection.singularize(uriObject.type) : uriObject.type : null

  // Respond to options request, or bad method.
  if ((!type || type in recordTypes) && !method) {
    delete uriObject.query
    const output = {
      meta: {
        headers: {
          'Allow': allowLevel[Object.keys(uriObject)
            .filter(key => uriObject[key]).length].join(', ')
        }
      }
    }
    response.statusCode = 204
    throw output
  }

  // Show the index route.
  if (!type && method === this.methods.find) {
    const output = {
      payload: { [reservedKeys.context]: showContext(options) }
    }

    delete output.payload[reservedKeys.context][namespace]

    for (let type in recordTypes) {
      const key = inflectType ? inflection.capitalize(type) : type
      const prefix = key in namespaceMap ?
        namespaceMap[key] + namespaceDelimiter : ''

      output.payload[prefix + key] = {
        [reservedKeys.id]: encodeRoute(uriTemplate.fillFromObject({
          type: inflectPath ? inflection.pluralize(type) : type
        }), obfuscateURIs)
      }
    }

    response.statusCode = 200
    throw output
  }

  const fields = recordTypes[type]

  let ids = request.meta.ids = contextRequest.ids = uriObject.ids ?
    (Array.isArray(uriObject.ids) ?
    uriObject.ids : [ uriObject.ids ]) : null

  if (options.castId && ids)
    ids = request.meta.ids = contextRequest.ids = ids.map(castId)

  attachQueries.call(this, contextRequest)

  request.meta.include = contextRequest.include
  request.meta.options = contextRequest.options

  const relatedField = uriObject.relatedField

  if (relatedField && (!(relatedField in fields) ||
    !(keys.link in fields[relatedField]) ||
    fields[relatedField][keys.denormalizedInverse]))
    throw new NotFoundError(`The field "${relatedField}" is ` +
      `not a link on the type "${type}".`)

  return relatedField ? adapter.find(type, ids, {
    // We only care about getting the related field.
    fields: { [relatedField]: true }
  }, meta)

  .then(records => {
    // Reduce the related IDs from all of the records into an array of
    // unique IDs.
    const relatedIds = Array.from((records || []).reduce((ids, record) => {
      const value = record[relatedField]

      if (Array.isArray(value)) for (let id of value) ids.add(id)
      else ids.add(value)

      return ids
    }, new Set()))

    const relatedType = fields[relatedField][keys.link]

    // Copy the original type and IDs to temporary keys.
    contextRequest.relatedField = request.meta.relatedField = relatedField
    contextRequest.originalType = type
    contextRequest.originalIds = ids

    // Write the related info to the request, which should take
    // precedence over the original type and IDs.
    contextRequest.type = request.meta.type = relatedType
    contextRequest.ids = request.meta.ids = relatedIds

    return contextRequest
  }) : contextRequest
}


function attachQueries (contextRequest) {
  const recordTypes = this.recordTypes
  const keys = this.keys
  const options = this.options
  const castValue = this.castValue
  const includeLimit = options.includeLimit
  const maxLimit = options.maxLimit
  const type = contextRequest.type
  const fields = recordTypes[type]
  const reduceFields = (fields, field) => {
    fields[field] = true
    return fields
  }
  const castMap = (type, options, x) => castValue(x, type, options)
  const query = contextRequest.uriObject.query || {}

  contextRequest.options = {}

  // Iterate over dynamic query strings.
  for (let parameter in query) {
    // Attach fields option.
    if (parameter.match(isField)) {
      const sparseField = query[parameter].split(',')
      const sparseType = (parameter.match(inBrackets) || [])[1]
      const fields = sparseField.reduce(reduceFields, {})

      if (sparseType === type)
        contextRequest.options.fields = fields
      else if (sparseType) {
        if (!(sparseType in contextRequest.includeOptions))
          contextRequest.includeOptions[sparseType] = {}

        contextRequest.includeOptions[sparseType].fields = fields
      }
    }

    // Attach match option.
    if (parameter.match(isMatch)) {
      if (!contextRequest.options.match) contextRequest.options.match = {}
      const field = (parameter.match(inBrackets) || [])[1]
      const fieldType = fields[field][keys.type]
      const value = query[parameter].split(',')

      contextRequest.options.match[field] =
        value.map(castMap.bind(null, fieldType, options))
    }
  }

  // Attach sort option.
  if ('sort' in query)
    contextRequest.options.sort = query.sort.split(',')
      .reduce((sort, field) => {
        if (field.charAt(0) === '-') sort[field.slice(1)] = false
        else sort[field] = true
        return sort
      }, {})

  // Attach include option.
  if ('include' in query)
    contextRequest.include = query.include.split(',')
      .map(i => i.split('.').slice(0, includeLimit))

  // Attach offset option.
  if ('offset' in query)
    contextRequest.options.offset = Math.abs(parseInt(query.offset, 10))

  // Attach limit option.
  if ('limit' in query)
    contextRequest.options.limit = Math.abs(parseInt(query.limit, 10))

  // Check limit option.
  const limit = contextRequest.options.limit
  if (!limit || limit > maxLimit) contextRequest.options.limit = maxLimit
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

  if (!payload) throw new BadRequestError(`Payload is missing.`)

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
  const uriTemplate = this.uriTemplate
  const options = this.options

  const inflectType = options.inflectType
  const inflectPath = options.inflectPath
  const obfuscateURIs = options.obfuscateURIs
  const namespaceMap = options.namespaceMap

  const typeKey = inflectType ? inflection.capitalize(type) : type
  const fields = recordTypes[type]
  const id = record[keys.primary]
  const clone = {}

  clone[reservedKeys.type] = (typeKey in namespaceMap ?
    `${namespaceMap[typeKey]}:` : '') + typeKey

  clone[reservedKeys.id] =
    encodeRoute(uriTemplate.fillFromObject({
      type: inflectPath ? inflection.pluralize(type) : type,
      ids: id
    }), obfuscateURIs)

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
      [reservedKeys.id]:
        encodeRoute(uriTemplate.fillFromObject({
          type: inflectPath ? inflection.pluralize(type) : type,
          ids: id, relatedField: field
        }), obfuscateURIs),
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


function castId (id) {
  // Stolen from jQuery source code:
  // https://api.jquery.com/jQuery.isNumeric/
  const float = Number.parseFloat(id)
  return id - float + 1 >= 0 ? float : id
}


/**
 * Encode a route in Base64 encoding or URI encoding.
 *
 * @param {String} route
 * @param {Boolean} encode
 */
function encodeRoute (route, encode) {
  return encode ? '/' + new Buffer(route.slice(1)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') : route
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
