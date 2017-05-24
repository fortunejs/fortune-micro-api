'use strict'

const msgpack = require('msgpack-lite')

const settings = require('./settings')
const mediaType = settings.mediaType
const unregisteredMediaType = settings.unregisteredMediaType
const typeMappings = settings.typeMappings
const reservedKeys = settings.reservedKeys
const defaults = settings.defaults

const helpers = require('./helpers')
const capitalize = helpers.capitalize
const showQueries = helpers.showQueries
const showContext = helpers.showContext
const mapRecord = helpers.mapRecord
const attachIncluded = helpers.attachIncluded
const parseBuffer = helpers.parseBuffer

const contextField = reservedKeys.context
const hrefField = reservedKeys.href
const idField = reservedKeys.id
const typeField = reservedKeys.type
const metaField = reservedKeys.meta
const queryField = reservedKeys.query
const errorField = reservedKeys.error

// Index fields.
const definitionsField = reservedKeys.definitions
const classField = reservedKeys['class']
const propertyOfField = reservedKeys.propertyOf
const propertyTypeField = reservedKeys.propertyType
const labelField = reservedKeys.label
const commentField = reservedKeys.comment
const isArrayField = reservedKeys.isArray
const inverseField = reservedKeys.inverse


module.exports = microApiSerializer

// Expose MessagePack serializer.
microApiSerializer.msgpack = HttpSerializer =>
  microApiSerializer(HttpSerializer, true)

// Expose external context function.
microApiSerializer.showExternalContext = helpers.showExternalContext


function microApiSerializer (HttpSerializer, isMsgPack) {
  class MicroApiSerializer extends HttpSerializer {

    constructor (dependencies) {
      super(dependencies)

      const options = this.options

      if (!('entryPoint' in options)) throw new Error(
        'The "entryPoint" option is required, it must be a URL ' +
        'to the entry point.')

      // Strip trailing slash.
      options.entryPoint = options.entryPoint.replace(/\/$/, '')

      // Set options.
      for (const key in defaults)
        if (!(key in options))
          options[key] = defaults[key]

      // Override `encodeRoute` method by prefixing entry point.
      const encodeRoute = this.encodeRoute
      this.encodeRoute = (type, id, field, b64) =>
        options.entryPoint + encodeRoute(type, id, field, b64)
    }


    processResponse (contextResponse, request, response) {
      const options = this.options
      let payload = contextResponse.payload

      if (!contextResponse.meta) contextResponse.meta = {}
      if (!contextResponse.meta.headers) contextResponse.meta.headers = {}

      if (payload && 'records' in payload)
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
            return new Buffer(value.data).toString(options.bufferEncoding)

          return value
        }, options.jsonSpaces)

        // Set UTF-8 charset.
        response.setHeader('Content-Type', `${mediaType}; charset=utf-8`)
      }
      else contextResponse.payload = msgpack.encode(payload)

      if (options.externalContext)
        response.setHeader('Link',
          `<${options.entryPoint}${options.externalContext}>; ` +
          'rel="http://www.w3.org/ns/json-ld#context"; ' +
          'type="application/ld+json"')

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
      const inflectType = options.inflectType
      const definitions = []
      const fields = {}

      const payload = contextResponse.payload = {}

      if (!options.externalContext)
        contextResponse.payload[contextField] = showContext(options)

      payload[hrefField] = encodeRoute(null, null, null, uriBase64)
      payload[typeField] = reservedKeys.ontology
      payload[definitionsField] = definitions

      for (const type in recordTypes) {
        const key = inflectType ? capitalize(type) : type

        payload[key] = {
          [hrefField]: encodeRoute(type, null, null, uriBase64)
        }

        const doc = {
          [hrefField]: `#${encodeURIComponent(key)}`,
          [idField]: key,
          [typeField]: classField
        }

        if (type in documentation)
          doc[commentField] = typeof documentation[type] === 'object' ?
            (documentation[type][language] ||
            documentation[type][defaultLanguage]) :
            documentation[type]

        definitions.push(doc)

        for (const field in recordTypes[type]) {
          const definition = recordTypes[type][field]

          if (!fields.hasOwnProperty(field)) {
            const doc = fields[field] = {
              [hrefField]: `#${encodeURIComponent(field)}`,
              [idField]: field,
              [propertyOfField]: []
            }

            if (keys.type in definition) doc[propertyTypeField] =
              typeMappings[definition[keys.type].prototype.constructor.name]
            else if (keys.link in definition) {
              doc[propertyTypeField] = `#${encodeURIComponent(inflectType ?
                capitalize(definition[keys.link]) : definition[keys.link])}`

              if (keys.inverse in definition &&
                definition.propertyIsEnumerable(keys.inverse))
                doc[inverseField] =
                  `#${encodeURIComponent(definition[keys.inverse])}`
            }

            if (keys.isArray in definition) doc[isArrayField] = true

            if (field in documentation) doc[commentField] =
              typeof documentation[field] === 'object' ?
                (documentation[field][language] ||
                documentation[field][defaultLanguage]) :
                documentation[field]
          }

          fields[field][propertyOfField].push(`#${encodeURIComponent(key)}`)
        }
      }

      for (const field in fields)
        definitions.push(fields[field])

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
      const originalType = request.meta.originalType
      const originalIds = request.meta.originalIds
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

      const output = {}

      if (!options.externalContext)
        output[contextField] = showContext(options)

      output[hrefField] = encodeRoute(
        originalType || type,
        originalIds || ids,
        relatedField, uriBase64)
      output[metaField] = Object.assign({
        [reservedKeys.context]: null,
        count: records.count
      }, contextResponse.meta)

      delete output[metaField].headers

      // For the find method, it may be helpful to show available queries.
      if (method === methods.find)
        output[queryField] = Object.assign({
          [reservedKeys.context]: null
        }, showQueries(request.meta))

      // Handle edge case when one record is expected.
      if ((method !== methods.find || (ids && ids.length === 1)) &&
        records.length === 1 && !include) {
        delete output[queryField]
        Object.assign(output, mapRecord.call(this, type, records[0]))
      }

      // At least one type will be present.
      else output[reservedKeys.graph] = records.map(record =>
        mapRecord.call(this, type, record))

      if (include)
        for (const includeType in include)
          Array.prototype.push.apply(output[reservedKeys.graph],
            include[includeType].map(record =>
              attachIncluded.call(this,
                mapRecord.call(this, includeType, record))))

      contextResponse.payload = output

      return contextResponse
    }


    showError (error) {
      const options = this.options
      const errorObject = Object.assign({
        [labelField]: error.name,
        [commentField]: error.message
      }, error)

      delete errorObject.meta
      delete errorObject.payload

      const payload = {}

      if (!options.externalContext)
        payload[contextField] = showContext(options)

      payload[errorField] = errorObject
      error.payload = payload
    }


    parsePayload (contextRequest) {
      switch (contextRequest.method) {
      case this.methods.create:
        return this.parseCreate(contextRequest)
      case this.methods.update:
        return this.parseUpdate(contextRequest)
      default:
        throw new Error('Method is invalid.')
      }
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

      return (payload[reservedKeys.graph] || [ payload ]).map(record => {
        for (const field in record) {
          const value = record[field]

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

        for (const field in record[reservedKeys.reverse]) {
          const value = record[reservedKeys.reverse][field]
          let reverseField

          for (const f in fields)
            if (fields[f][keys.inverse] === field &&
              f in options.reverseFields) {
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

      const payload = contextRequest.payload
      const type = contextRequest.type
      const ids = contextRequest.ids

      const fields = recordTypes[type]
      const cast = (type, options) => value => castValue(value, type, options)

      return (payload[reservedKeys.graph] || [ payload ]).map(update => {
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

        for (const field in update) {
          const value = update[field]
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

        for (const field in update[reservedKeys.reverse]) {
          const value = update[reservedKeys.reverse][field]
          let reverseField

          for (const f in fields)
            if (fields[f][keys.inverse] === field &&
              f in options.reverseFields) {
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

  }

  MicroApiSerializer.mediaType = isMsgPack ?
    unregisteredMediaType : mediaType

  return MicroApiSerializer
}
