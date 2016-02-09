'use strict'

const uriTemplates = require('uri-templates')
const inflection = require('inflection')

const settings = require('./settings')
const mediaType = settings.mediaType
const reservedKeys = settings.reservedKeys
const defaults = settings.defaults
const namespace = settings.namespace
const namespaceDelimiter = settings.namespaceDelimiter

const helpers = require('./helpers')
const initializeContext = helpers.initializeContext
const showQueries = helpers.showQueries
const castId = helpers.castId
const showContext = helpers.showContext
const validateContext = helpers.validateContext
const mapRecord = helpers.mapRecord
const attachIncluded = helpers.attachIncluded
const encodeRoute = helpers.encodeRoute
const parseBuffer = helpers.parseBuffer
const extractNamespace = helpers.extractNamespace

const idField = namespace + namespaceDelimiter + reservedKeys.identifier
const queryField = namespace + namespaceDelimiter + reservedKeys.query
const errorField = namespace + namespaceDelimiter + reservedKeys.error


module.exports = HttpSerializer => Object.assign(
class MicroApiSerializer extends HttpSerializer {

  constructor (dependencies) {
    super(dependencies)

    const options = this.options
    const methods = this.methods

    const methodMap = {
      GET: methods.find,
      POST: methods.create,
      PATCH: methods.update,
      DELETE: methods.delete,
      OPTIONS: this.showAllow.bind(this)
    }

    // Set options.
    for (let key in defaults)
      if (!(key in options))
        options[key] = defaults[key]

    const uriTemplate = uriTemplates(options ?
      options.uriTemplate : null || defaults.uriTemplate)

    Object.defineProperties(this, {

      // Parse the URI template.
      uriTemplate: { value: uriTemplate },

      // Default method mapping.
      methodMap: { value: methodMap },

      // Methods which may accept input.
      inputMethods: { value: new Set([ methods.create, methods.update ]) }

    })
  }


  processRequest (context) {
    return arguments.length === 1 ? context :
      initializeContext.call(this, context, arguments[1])
  }


  processResponse (context, request, response) {
    if (arguments.length === 1) return context

    // Set UTF-8 charset.
    response.setHeader('Content-Type', `${mediaType}; charset=utf-8`)

    const jsonSpaces = this.options.jsonSpaces
    const bufferEncoding = this.options.bufferEncoding
    const payload = context.response.payload

    if (arguments.length === 1) return context

    if (payload !== null)
      context.response.payload = JSON.stringify(payload, (key, value) => {
        // Duck type checking for buffer stringification.
        if (value && value.type === 'Buffer' &&
          Array.isArray(value.data) &&
          Object.keys(value).length === 2)
          return new Buffer(value.data).toString(bufferEncoding)

        return value
      }, jsonSpaces)

    return context
  }


  showAllow (context) {
    const allowLevel = this.options.allowLevel
    const uriObject = context.request.uriObject

    delete uriObject.query

    const degree = Object.keys(uriObject)
      .filter(key => uriObject[key]).length

    const allow = allowLevel[degree]

    if (allow) context.response.meta.headers['Allow'] = allow.join(', ')

    return context
  }


  showIndex (context) {
    const recordTypes = this.recordTypes
    const uriTemplate = this.uriTemplate
    const options = this.options
    const inflectPath = options.inflectPath
    const inflectType = options.inflectType
    const obfuscateURIs = options.obfuscateURIs
    const namespaceMap = options.namespaceMap
    const output = { [reservedKeys.context]: showContext(options) }

    delete output[reservedKeys.context][namespace]

    for (let type in recordTypes) {
      const key = inflectType ? inflection.capitalize(type) : type
      const prefix = key in namespaceMap ?
        namespaceMap[key] + namespaceDelimiter : ''

      output[prefix + key] = {
        [reservedKeys.id]: encodeRoute(uriTemplate.fillFromObject({
          type: inflectPath ? inflection.pluralize(type) : type
        }), obfuscateURIs)
      }
    }

    context.response.payload = output

    return context
  }


  showResponse (context, records, include) {
    if (!records) return this.showIndex(context)

    const keys = this.keys
    const methods = this.methods
    const options = this.options
    const uriTemplate = this.uriTemplate
    const NotFoundError = this.errors.NotFoundError

    const inflectPath = options.inflectPath
    const obfuscateURIs = options.obfuscateURIs

    const request = context.request
    const method = request.method
    const type = request.type
    const ids = request.ids
    const relatedField = request.relatedField
    const response = context.response
    const updateModified = response.updateModified

    // Handle a not found error.
    if (ids && ids.length && method === methods.find &&
      !relatedField && !records.length)
      throw new NotFoundError(`No records match the request.`)

    // Delete and update requests may not respond with anything.
    if (method === methods.delete ||
    (method === methods.update && !updateModified))
      return context

    // Create method should include location header.
    if (method === methods.create)
      response.meta.headers['Location'] =
        encodeRoute(uriTemplate.fillFromObject({
          type: inflectPath ? inflection.pluralize(type) : type,
          ids: records.map(record => record[keys.primary])
        }), obfuscateURIs)

    const output = { [reservedKeys.context]: showContext(options) }

    // For the find method, it may be helpful to show available queries.
    if (method === methods.find)
      output[queryField] = Object.assign({
        [reservedKeys.context]: null,
        count: records.count
      }, showQueries(request))

    // At least one type will be present.
    output[reservedKeys.graph] = records.map(record =>
      mapRecord.call(this, type, record))

    if (include) for (let includeType in include)
      output[reservedKeys.graph] = output[reservedKeys.graph]
        .concat(include[includeType]
        .map(mapRecord.bind(this, includeType))
        .map(attachIncluded.bind(this)))

    response.payload = output

    return context
  }


  showError (context, error) {
    const options = this.options
    const MethodError = this.errors.MethodError
    const name = error.name
    const message = error.message
    const output = {
      [reservedKeys.context]: showContext(options)
    }

    delete output[reservedKeys.context][reservedKeys.base]

    if (error.constructor === MethodError)
      this.showAllow(context)

    output[errorField] = Object.assign({},
      name ? { name } : null,
      message ? { description: message } : null,
      error)

    context.response.payload = output

    return context
  }


  parseCreate (context) {
    context.request.payload = parseBuffer.call(this, context.request.payload)

    const keys = this.keys
    const castValue = this.castValue
    const options = this.options
    const recordTypes = this.recordTypes
    const MethodError = this.errors.MethodError
    const BadRequestError = this.errors.BadRequestError

    const namespaceMap = options.namespaceMap
    const inflectType = options.inflectType

    const request = context.request
    const payload = request.payload
    const type = request.type
    const ids = request.ids
    const relatedField = request.relatedField

    const fields = recordTypes[type]
    const cast = (type, options) => value => castValue(value, type, options)

    if (ids) throw new MethodError(
      `Can not create with IDs in the route.`)

    if (relatedField) throw new MethodError(
      `Can not create related record.`)

    validateContext.call(this, payload)

    return payload[reservedKeys.graph].map(record => {
      const compareType = inflectType ? inflection.capitalize(type) : type

      // Extract the `@type` on a record.
      const recordType = extractNamespace.call(this,
        record[reservedKeys.type], namespaceMap)

      if (recordType !== compareType)
        throw new BadRequestError(
          `The field "${reservedKeys.type}" must be valued ` +
          `as "${compareType}".`)

      for (let field in record) {
        const value = record[field]

        field = extractNamespace.call(this, field, namespaceMap)

        if (field === keys.primary) {
          record[keys.primary] = options.castId ? castId(value) : value
          continue
        }

        const fieldDefinition = fields[field] || {}
        const fieldType = fieldDefinition[keys.type]
        const fieldLink = fieldDefinition[keys.link]

        if (fieldLink) {
          record[field] = value[idField]
          continue
        }

        record[field] = Array.isArray(value) ?
          value.map(cast(fieldType, options)) :
          castValue(value, fieldType, options)
      }

      for (let field in record[reservedKeys.reverse]) {
        const value = record[reservedKeys.reverse][field]
        let reverseField

        field = extractNamespace.call(this, field, namespaceMap)

        for (let f in fields)
          if (fields[f][keys.inverse] === field &&
            fields[f][reservedKeys.isReverse]) {
            reverseField = f
            break
          }

        if (!reverseField) throw new BadRequestError(
          `Reverse field for "${field}" not found.`)

        record[reverseField] = value[idField]
      }

      delete record[reservedKeys.reverse]

      return record
    })
  }


  parseUpdate (context) {
    context.request.payload = parseBuffer.call(this, context.request.payload)

    const keys = this.keys
    const castValue = this.castValue
    const options = this.options
    const recordTypes = this.recordTypes
    const BadRequestError = this.errors.BadRequestError

    const namespaceMap = options.namespaceMap
    const inflectType = options.inflectType

    const request = context.request
    const payload = request.payload
    const type = request.type
    const ids = request.ids

    const fields = recordTypes[type]
    const cast = (type, options) => value => castValue(value, type, options)

    validateContext.call(this, payload)

    return payload[reservedKeys.graph].map(update => {
      const compareType = inflectType ? inflection.capitalize(type) : type

      // Extract the `@type` on an update.
      const updateType = extractNamespace.call(this,
        update[reservedKeys.type], namespaceMap)

      if (updateType !== compareType)
        throw new BadRequestError(
          `The field "${reservedKeys.type}" must be valued ` +
          `as "${compareType}".`)

      const clone = {}
      const id = options.castId ?
        castId(update[idField]) : update[idField]

      if (!id) throw new BadRequestError(
        `A value for "${idField}" is missing.`)

      if (ids && !ids.some(i => i === id))
        throw new BadRequestError(`The requested ID "${id}" is ` +
          `not addressable.`)

      clone[keys.primary] = id

      const replace = {}

      for (let field in update) {
        const value = update[field]

        field = extractNamespace.call(this, field, namespaceMap)

        const fieldDefinition = fields[field] || {}
        const fieldType = fieldDefinition[keys.type]
        const fieldLink = fieldDefinition[keys.link]

        if (fieldLink) {
          if (!(idField in value))
            throw new BadRequestError(`The field "${field}" must be an ` +
              `object containing at least the key "${idField}".`)

          replace[field] = value[idField]
          continue
        }

        replace[field] = Array.isArray(value) ?
          value.map(cast(fieldType, options)) :
          castValue(value, fieldType, options)
      }

      for (let field in update[reservedKeys.reverse]) {
        const value = update[reservedKeys.reverse][field]
        let reverseField

        field = extractNamespace.call(this, field, namespaceMap)

        for (let f in fields)
          if (fields[f][keys.inverse] === field &&
            fields[f][reservedKeys.isReverse]) {
            reverseField = f
            break
          }

        if (!reverseField) throw new BadRequestError(
          `Reverse field for "${field}" not found.`)

        replace[reverseField] = value[idField]
      }

      clone.replace = replace

      const operate = update[reservedKeys.operate]

      if (operate) {
        castFields(operate.push, operate.pull)
        if ('push' in operate) clone.push = operate.push
        if ('pull' in operate) clone.pull = operate.pull
      }

      return clone
    })

    function castFields () {
      for (let object of arguments)
        for (let field in object) {
          const value = object[field]
          const fieldDefinition = fields[field] || {}
          const fieldType = fieldDefinition[keys.type]

          object[field] = Array.isArray(value) ?
            value.map(cast(fieldType, options)) :
            castValue(value, fieldType, options)
        }
    }
  }

}, { id: mediaType })
