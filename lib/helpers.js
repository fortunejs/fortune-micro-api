import inflection from 'inflection'
import { reservedKeys, inBrackets, mediaType, vocabulary,
  isField, isMatch } from './settings'


const queryDelimiter = '?'


export function initializeContext (context, request) {
  const {
    uriTemplate, methodMap, inputMethods,
    options, recordTypes, adapter, keys,
    errors: { UnsupportedError, NotFoundError, BadRequestError }
  } = this

  const { request: { serializerInput, serializerOutput,
    payload, meta } } = context

  const method = context.request.method = methodMap[request.method]

  // Not according to the spec but probably a good idea in practice, do not
  // allow a different media type for input.
  if (serializerInput !== serializerOutput && inputMethods.has(method))
    throw new UnsupportedError(
      `The media type of the input must be "${mediaType}".`)

  const { obfuscateURIs, inflectPath } = options

  let { url } = request

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
  const uriObject = uriTemplate.fromUri(
    url.split(queryDelimiter).map((part, index) =>
      index > 0 ? decodeURIComponent(part) : part).join(queryDelimiter))

  if (!Object.keys(uriObject).length && url.length > 1)
    throw new NotFoundError(`Invalid URI.`)

  context.request.uriObject = uriObject

  context.request.type = uriObject.type ? inflectPath ?
    inflection.singularize(uriObject.type) : uriObject.type : null

  context.request.ids = uriObject.ids ?
    (Array.isArray(uriObject.ids) ?
    uriObject.ids : [ uriObject.ids ]) : null

  const { request: { type, ids } } = context
  const fields = recordTypes[type]

  if (options.castId && ids) context.request.ids = ids.map(castId)

  attachQueries.call(this, context)

  if (Buffer.isBuffer(payload))
    try { context.request.payload = JSON.parse(payload.toString()) }
    catch (error) {
      throw new BadRequestError(`Invalid JSON: ${error.message}`)
    }

  const { relatedField } = uriObject

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
    const relatedIds = [ ...(records || []).reduce((ids, record) => {
      const value = record[relatedField]

      if (Array.isArray(value)) for (let id of value) ids.add(id)
      else ids.add(value)

      return ids
    }, new Set()) ]

    const relatedType = fields[relatedField][keys.link]

    // Copy the original type and IDs to temporary keys.
    context.request.relatedField = relatedField
    context.request.originalType = type
    context.request.originalIds = ids

    // Write the related info to the request, which should take
    // precedence over the original type and IDs.
    context.request.type = relatedType
    context.request.ids = relatedIds

    return context
  }) : context
}


function attachQueries (context) {
  const { recordTypes, keys, options, castValue,
    options: { includeLimit, maxLimit } } = this
  const { request, request: { type } } = context
  const fields = recordTypes[type]
  const reduceFields = (fields, field) => {
    fields[field] = true
    return fields
  }
  const castMap = (type, options, x) => castValue(x, type, options)

  let { request: { uriObject: { query } } } = context
  if (!query) query = {}

  // Iterate over dynamic query strings.
  for (let parameter of Object.keys(query)) {
    // Attach fields option.
    if (parameter.match(isField)) {
      const sparseField = query[parameter]
      const sparseType = (parameter.match(inBrackets) || [])[1]
      const fields = (Array.isArray(sparseField) ?
        sparseField : [ sparseField ]).reduce(reduceFields, {})

      if (sparseType === type)
        request.options.fields = fields
      else if (sparseType) {
        if (!(sparseType in request.includeOptions))
          request.includeOptions[sparseType] = {}

        request.includeOptions[sparseType].fields = fields
      }
    }

    // Attach match option.
    if (parameter.match(isMatch)) {
      if (!request.options.match) request.options.match = {}
      const field = (parameter.match(inBrackets) || [])[1]
      const fieldType = fields[field][keys.type]
      const value = query[parameter]

      request.options.match[field] = Array.isArray(value) ?
        value.map(castMap.bind(null, fieldType, options)) :
        castValue(value, fieldType, options)
    }
  }

  // Attach sort option.
  if ('sort' in query) {
    let sort = query.sort
    if (!Array.isArray(sort)) sort = [ sort ]

    request.options.sort = sort.reduce((sort, field) => {
      const firstChar = field.charAt(0)

      if (firstChar === '-') sort[field.slice(1)] = false
      else sort[field] = true

      return sort
    }, {})
  }

  // Attach include option.
  if ('include' in query)
    request.include = (Array.isArray(query.include) ?
      query.include : [ query.include ])
      .map(i => i.split('.').slice(0, includeLimit))

  // Attach offset option.
  if ('offset' in query)
    request.options.offset = Math.abs(parseInt(query.offset, 10))

  // Attach limit option.
  if ('limit' in query)
    request.options.limit = Math.abs(parseInt(query.limit, 10))

  // Check limit option.
  const { options: { limit } } = request
  if (!limit || limit > maxLimit) request.options.limit = maxLimit
}


export function showContext (options) {
  const context = {}

  if (options.vocabulary)
    context[reservedKeys.vocabulary] = options.vocabulary

  if (options.base)
    context[reservedKeys.base] = options.base

  context[options.namespace] = vocabulary

  return context
}


export function validateContext (payload) {
  const {
    errors: { BadRequestError },
    options: { vocabulary: vocab, namespace }
  } = this

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
}


export function mapRecord (type, record) {
  const { keys, recordTypes, uriTemplate,
    options: { namespace, inflectType, inflectPath, obfuscateURIs }
  } = this
  const idField = `${namespace}:${reservedKeys.identifier}`
  const metaField = `${namespace}:${reservedKeys.meta}`
  const fields = recordTypes[type]
  const clone = {}

  const id = record[keys.primary]

  clone[reservedKeys.type] = inflectType ? inflection.capitalize(type) : type
  clone[reservedKeys.id] =
    encodeRoute(uriTemplate.fillFromObject({
      type: inflectPath ? inflection.pluralize(type) : type,
      ids: id
    }), obfuscateURIs)
  clone[metaField] = { [reservedKeys.context]: null }
  clone[idField] = id

  for (let field in record) {
    const fieldDefinition = fields[field]

    // Handle undefined fields.
    if (!fieldDefinition) {
      if (field !== keys.primary)
        clone[metaField][field] = record[field]
      continue
    }

    // Rearrange order of typed fields.
    if (fieldDefinition[keys.type]) {
      clone[field] = record[field]
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

    if (!fieldIsReverse) clone[field] = node
    else {
      const fieldInverse = fieldDefinition[keys.inverse]

      if (!(reservedKeys.reverse in clone))
        clone[reservedKeys.reverse] = {}

      clone[reservedKeys.reverse][fieldInverse] = node
    }
  }

  if (Object.keys(clone[metaField]).length === 1) delete clone[metaField]

  return clone
}


export function showQueries (request) {
  const { include, options } = request

  return {
    include: include ? include.map(path => path.join('.')) : [],
    offset: options.offset || 0,
    limit: options.limit || 0,
    match: options.match || {},
    field: options.field || {},
    sort: options.sort || {}
  }
}


export function attachIncluded (record) {
  const { options: { namespace } } = this
  const metaField = `${namespace}:${reservedKeys.meta}`

  if (!(metaField in record))
    record[metaField] = { [reservedKeys.context]: null }

  record[metaField].included = true

  return record
}


export function castId (id) {
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
export function encodeRoute (route, encode) {
  return encode ? '/' + new Buffer(route.slice(1)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') : route
}
