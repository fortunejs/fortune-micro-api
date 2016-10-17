'use strict'

const msgpack = require('msgpack-lite')

const settings = require('./settings')
const mediaType = settings.mediaType
const unregisteredMediaType = settings.unregisteredMediaType
const reservedKeys = settings.reservedKeys
const defaults = settings.defaults
const namespace = settings.namespace
const namespaceDelimiter = settings.namespaceDelimiter

const helpers = require('./helpers')
const capitalize = helpers.capitalize
const showQueries = helpers.showQueries
const showContext = helpers.showContext
const validateContext = helpers.validateContext
const mapRecord = helpers.mapRecord
const attachIncluded = helpers.attachIncluded
const parseBuffer = helpers.parseBuffer
const extractNamespace = helpers.extractNamespace

/* eslint-disable max-len */
const idField = namespace + namespaceDelimiter + reservedKeys.identifier
const typeField = namespace + namespaceDelimiter + reservedKeys.type
const metaField = namespace + namespaceDelimiter + reservedKeys.meta
const queryField = namespace + namespaceDelimiter + reservedKeys.query
const errorField = namespace + namespaceDelimiter + reservedKeys.error

// Index fields.
const uVocabField = namespace + namespaceDelimiter + reservedKeys.uVocab
const uTypeField = namespace + namespaceDelimiter + reservedKeys.uType
const belongsToField = namespace + namespaceDelimiter + reservedKeys.belongsTo
const descriptionField = namespace + namespaceDelimiter + reservedKeys.description
const isArrayField = namespace + namespaceDelimiter + reservedKeys.isArray
const inverseField = namespace + namespaceDelimiter + reservedKeys.inverse
/* eslint-enable max-len */


module.exports = microApiSerializer

microApiSerializer.msgpack = HttpSerializer =>
  microApiSerializer(HttpSerializer, true)


function microApiSerializer (HttpSerializer, isMsgPack) {
  return Object.assign(class MicroApiSerializer extends HttpSerializer {

    constructor (dependencies) {
      super(dependencies)

      const options = this.options

      // Set options.
      for (const key in defaults)
        if (!(key in options))
          options[key] = defaults[key]
    }


    processResponse (contextResponse, request, response) {
      const options = this.options
      const jsonSpaces = options.jsonSpaces
      const bufferEncoding = options.bufferEncoding
      let payload = contextResponse.payload

      if (!contextResponse.meta) contextResponse.meta = {}
      if (!contextResponse.meta.headers) contextResponse.meta.headers = {}
      if (payload && payload.records)
        contextResponse = this.showResponse(contextResponse,
          request, payload.records, payload.include)
      if (contextResponse instanceof Error) {
        if (contextResponse.isMethodInvalid) return contextResponse
        if (contextResponse.isTypeUnspecified)
          this.showIndex(contextResponse, request, response)
        else this.showError(contextResponse)
      }

      payload = contextResponse.payload
      if (!payload) return contextResponse

      if (!isMsgPack) {
        contextResponse.payload = JSON.stringify(payload, (key, value) => {
          // Duck type checking for buffer stringification.
          if (value && value.type === 'Buffer' &&
            Array.isArray(value.data) &&
            Object.keys(value).length === 2)
            return new Buffer(value.data).toString(bufferEncoding)

          return value
        }, jsonSpaces)

        // Set UTF-8 charset.
        response.setHeader('Content-Type', `${mediaType}; charset=utf-8`)
      }
      else contextResponse.payload = msgpack.encode(payload)

      return contextResponse
    }


    showIndex (contextResponse, request, response) {
      const keys = this.keys
      const recordTypes = this.recordTypes
      const encodeRoute = this.encodeRoute
      const options = this.options
      const defaultLanguage = this.message.defaultLanguage
      const documentation = this.documentation || {}
      const language = request.meta.language
      const uriBase64 = options.uriBase64
      const namespaceMap = options.namespaceMap
      const inflectType = options.inflectType
      const vocab = []
      const fields = {}

      contextResponse.payload = {
        [reservedKeys.context]: showContext(options),
        [uVocabField]: vocab
      }

      for (const type in recordTypes) {
        const key = inflectType ? capitalize(type) : type
        const prefix = key in namespaceMap ?
          namespaceMap[key] + namespaceDelimiter : ''

        contextResponse.payload[prefix + key] = {
          [reservedKeys.id]: encodeRoute(type, null, null, uriBase64)
        }

        if (prefix) continue

        const doc = { [idField]: key, [typeField]: uTypeField }

        if (type in documentation)
          doc[descriptionField] = typeof documentation[type] === 'object' ?
            (documentation[type][language] ||
            documentation[type][defaultLanguage]) :
            documentation[type]

        vocab.push(doc)

        for (const field in recordTypes[type]) {
          const definition = recordTypes[type][field]

          if (!fields.hasOwnProperty(field)) {
            const doc = fields[field] = {
              [idField]: field,
              [belongsToField]: []
            }

            if (keys.type in definition) doc[uTypeField] =
              namespace + namespaceDelimiter +
              definition[keys.type].prototype.constructor.name
            else if (keys.link in definition) {
              doc[uTypeField] = inflectType ?
                capitalize(definition[keys.link]) : definition[keys.link]

              if (keys.inverse in definition &&
                definition.propertyIsEnumerable(keys.inverse))
                doc[inverseField] = definition[keys.inverse]
            }

            if (keys.isArray in definition) doc[isArrayField] = true

            if (field in documentation) doc[descriptionField] =
              typeof documentation[field] === 'object' ?
                (documentation[field][language] ||
                documentation[field][defaultLanguage]) :
                documentation[field]
          }

          fields[field][belongsToField].push(key)
        }
      }

      for (const field in fields)
        vocab.push(fields[field])

      response.statusCode = 200
    }


    showResponse (contextResponse, request, records, include) {
      const keys = this.keys
      const methods = this.methods
      const encodeRoute = this.encodeRoute
      const NotFoundError = this.errors.NotFoundError

      const options = this.options
      const uriBase64 = options.uriBase64

      const method = request.meta.method
      const type = request.meta.type
      const ids = request.meta.ids
      const relatedField = request.meta.relatedField
      const updateModified = contextResponse.meta.updateModified

      // Handle a not found error.
      if (ids && ids.length && method === methods.find &&
        !relatedField && !records.length)
        return new NotFoundError('No records match the request.')

      // Delete and update requests may not respond with anything.
      if (method === methods.delete ||
      (method === methods.update && !updateModified)) {
        delete contextResponse.payload
        return contextResponse
      }

      // Create method should include location header.
      if (method === methods.create)
        contextResponse.meta.headers['Location'] =
          encodeRoute(type, records.map(record => record[keys.primary]),
            null, uriBase64)

      const output = {
        [reservedKeys.context]: showContext(options),
        [metaField]: Object.assign({
          [reservedKeys.context]: null,
          count: records.count
        }, contextResponse.meta, { headers: void 0 })
      }

      // For the find method, it may be helpful to show available queries.
      if (method === methods.find)
        output[queryField] = Object.assign({
          [reservedKeys.context]: null
        }, showQueries(request.meta))

      // At least one type will be present.
      output[reservedKeys.graph] = records.map(record =>
        mapRecord.call(this, type, record))

      if (include) for (const includeType in include)
        output[reservedKeys.graph] = output[reservedKeys.graph]
          .concat(include[includeType]
          .map(mapRecord.bind(this, includeType))
          .map(attachIncluded.bind(this)))

      contextResponse.payload = output

      return contextResponse
    }


    showError (error) {
      const options = this.options
      const name = error.name
      const description = error.message

      error.payload = {
        [reservedKeys.context]: showContext(options),
        [errorField]: Object.assign({ name, description }, error)
      }
    }


    parsePayload (contextRequest) {
      const methods = this.methods
      const method = contextRequest.method

      if (method === methods.create)
        return this.parseCreate(contextRequest)
      else if (method === methods.update)
        return this.parseUpdate(contextRequest)

      throw new Error('Method is invalid.')
    }


    parseCreate (contextRequest) {
      contextRequest.payload = parseBuffer.call(this, contextRequest.payload)

      const keys = this.keys
      const castValue = this.castValue
      const castToNumber = this.castToNumber
      const options = this.options
      const recordTypes = this.recordTypes
      const MethodError = this.errors.MethodError
      const BadRequestError = this.errors.BadRequestError

      const namespaceMap = options.namespaceMap
      const inflectType = options.inflectType

      const payload = contextRequest.payload
      const type = contextRequest.type
      const ids = contextRequest.ids
      const relatedField = contextRequest.relatedField

      const fields = recordTypes[type]
      const cast = (type, options) => value => castValue(value, type, options)

      if (ids) throw new MethodError(
        'Can not create with IDs in the route.')

      if (relatedField) throw new MethodError(
        'Can not create related record.')

      validateContext.call(this, payload)

      return payload[reservedKeys.graph].map(record => {
        const compareType = inflectType ? capitalize(type) : type

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
            record[keys.primary] = options.castId ? castToNumber(value) : value
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

          for (const f in fields)
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


    parseUpdate (contextRequest) {
      contextRequest.payload = parseBuffer.call(this, contextRequest.payload)

      const keys = this.keys
      const castValue = this.castValue
      const castToNumber = this.castToNumber
      const options = this.options
      const recordTypes = this.recordTypes
      const BadRequestError = this.errors.BadRequestError

      const namespaceMap = options.namespaceMap
      const inflectType = options.inflectType

      const payload = contextRequest.payload
      const type = contextRequest.type
      const ids = contextRequest.ids

      const fields = recordTypes[type]
      const cast = (type, options) => value => castValue(value, type, options)

      validateContext.call(this, payload)

      return payload[reservedKeys.graph].map(update => {
        const compareType = inflectType ? capitalize(type) : type

        // Extract the `@type` on an update.
        const updateType = extractNamespace.call(this,
          update[reservedKeys.type], namespaceMap)

        if (updateType !== compareType)
          throw new BadRequestError(
            `The field "${reservedKeys.type}" must be valued ` +
            `as "${compareType}".`)

        const clone = {}
        const id = options.castId ?
          castToNumber(update[idField]) : update[idField]

        if (!id) throw new BadRequestError(
          `A value for "${idField}" is missing.`)

        if (ids && !ids.some(i => i === id))
          throw new BadRequestError(
            `The requested ID "${id}" is not addressable.`)

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

          for (const f in fields)
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
        for (const object of arguments)
          for (const field in object) {
            const value = object[field]
            const fieldDefinition = fields[field] || {}
            const fieldType = fieldDefinition[keys.type]

            object[field] = Array.isArray(value) ?
              value.map(cast(fieldType, options)) :
              castValue(value, fieldType, options)
          }
      }
    }

  }, { mediaType: isMsgPack ? unregisteredMediaType : mediaType })
}
