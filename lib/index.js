import uriTemplates from 'uri-templates'
import inflection from 'inflection'
import { mediaType, reservedKeys, defaults } from './settings'
import { initializeContext, showQueries, castId, showContext,
  mapRecord, attachIncluded, encodeRoute } from './helpers'


export default Serializer => Object.assign(
class MicroApiSerializer extends Serializer {

  constructor () {
    super(...arguments)

    const { options, methods } = this

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
    // If the request was initiated without HTTP arguments, this is a no-op.
    if (arguments.length === 1) return context

    return initializeContext.call(this, context, arguments[1])
  }


  showAllow (context) {
    const { options: { allowLevel } } = this
    const { request: { uriObject } } = context

    delete uriObject.query

    const degree = Object.keys(uriObject)
      .filter(key => uriObject[key]).length

    const allow = allowLevel[degree]

    if (allow) context.response.meta['Allow'] = allow.join(', ')

    return context
  }


  showIndex (context) {
    const { recordTypes, uriTemplate, options,
      options: { inflectPath, inflectType, obfuscateURIs, namespace }
    } = this
    const output = { [reservedKeys.context]: showContext(options) }

    delete output[reservedKeys.context][namespace]

    for (let type in recordTypes)
      output[inflectType ? inflection.capitalize(type) : type] = {
        [reservedKeys.id]: encodeRoute(uriTemplate.fillFromObject({
          type: inflectPath ? inflection.pluralize(type) : type
        }), obfuscateURIs)
      }

    context.response.payload = output

    return context
  }


  showResponse (context, records, include) {
    if (!records) return this.showIndex(context)

    const { keys, methods, options, uriTemplate,
      errors: { NotFoundError } } = this
    const { prefix, inflectPath } = options
    const { request, request: { method, type, ids, relatedField },
      response, response: { updateModified } } = context

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
      response.meta['Location'] = prefix +
        encodeRoute(uriTemplate.fillFromObject({
          type: inflectPath ? inflection.pluralize(type) : type,
          ids: records.map(record => record[keys.primary])
        }), options.obfuscateURIs)

    const output = {
      [reservedKeys.meta]: { count: records.count },
      [reservedKeys.graph]: []
    }

    // For the find method, it may be helpful to show available queries.
    if (method === methods.find)
      Object.assign(output[reservedKeys.meta], showQueries(queries, request))

    // At least one type will be present.
    output[reservedKeys.graph].push(
      ...records.map(record => mapRecord.call(this, type, record)))

    if (include) for (let includeType in include)
      output[reservedKeys.graph].push(...include[includeType]
        .map(mapRecord.bind(this, includeType))
        .map(attachIncluded))

    if (!Object.keys(output[reservedKeys.meta]).length)
      delete output[reservedKeys.meta]

    response.payload = output

    return context
  }


  showError (context, error) {
    const { errors: { MethodError } } = this
    const { name, message } = error
    const output = {}

    if (error.constructor === MethodError)
      this.showAllow(context)

    output[reservedKeys.error] = Object.assign({},
      name ? { name } : null,
      message ? { message } : null,
      error)

    context.response.payload = output

    return context
  }


  parseCreate (context) {
    const { keys, recordTypes, options, castValue,
      errors: { MethodError, BadRequestError } } = this
    const { request: { type, ids, payload, relatedField } } = context
    const cast = (type, options) => value => castValue(value, type, options)

    if (ids) throw new MethodError(
      `Can not create with IDs in the route.`)

    if (relatedField) throw new MethodError(
      `Can not create related record.`)

    const fields = recordTypes[type]

    return payload[reservedKeys.graph].map(record => {
      if (record[reservedKeys.type] !== type) throw new BadRequestError(
        `The field "${reservedKeys.type}" must be valued as "${type}".`)

      for (let field in record) {
        const value = record[field]

        if (field === keys.primary) {
          record[field] = options.castId ? castId(value) : value
          continue
        }

        const fieldDefinition = fields[field] || {}
        const fieldType = fieldDefinition[keys.type]
        const fieldLink = fieldDefinition[keys.link]

        if (fieldLink) {
          if (!(keys.primary in value))
            throw new BadRequestError(`The field "${field}" must be an ` +
              `object containing at least the key "${keys.primary}".`)

          record[field] = value[keys.primary]
          continue
        }

        record[field] = Array.isArray(value) ?
          value.map(cast(fieldType, options)) :
          castValue(value, fieldType, options)
      }

      return record
    })
  }


  parseUpdate (context) {
    const { request: { payload, type, ids } } = context
    const { keys, options, recordTypes, castValue,
      errors: { BadRequestError } } = this
    const fields = recordTypes[type]
    const cast = (type, options) => value => castValue(value, type, options)

    return payload[reservedKeys.graph].map(update => {
      if (update[reservedKeys.type] !== type) throw new BadRequestError(
        `The field "${reservedKeys.type}" must be valued as "${type}".`)

      const clone = {}
      const id = options.castId ?
        castId(update[keys.primary]) : update[keys.primary]

      if (!id) throw new BadRequestError(`An ID is missing.`)

      if (ids && !ids.some(i => i === id))
        throw new BadRequestError(`The requested ID "${id}" is ` +
          `not addressable.`)

      clone[keys.primary] = id

      const replace = {}

      for (let field in update) {
        const value = update[field]
        const fieldDefinition = fields[field] || {}
        const fieldType = fieldDefinition[keys.type]
        const fieldLink = fieldDefinition[keys.link]

        if (fieldLink) {
          if (!(keys.primary in value))
            throw new BadRequestError(`The field "${field}" must be an ` +
              `object containing at least the key "${keys.primary}".`)

          replace[field] = value[keys.primary]
          continue
        }

        replace[field] = Array.isArray(value) ?
          value.map(cast(fieldType, options)) :
          castValue(value, fieldType, options)
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
