'use strict'

const url = require('url')
const path = require('path')
const fs = require('fs')
const http = require('http')
const settings = require('./settings')
const reservedKeys = settings.reservedKeys
const contextURI = settings.contextURI

const contextField = reservedKeys.context
const idField = reservedKeys.id
const hrefField = reservedKeys.href
const typeField = reservedKeys.type
const metaField = reservedKeys.meta

const contextsPath = path.join(__dirname, '../contexts.json')
const buffer = Buffer.from || Buffer

// Memoize these results.
let context
let externalContext

module.exports = {
  showContext, showExternalContext, mapRecord, showQueries,
  attachIncluded, parseBuffer, capitalize
}


function showContext (options) {
  if (context) return context

  const base = options.entryPoint

  context = options.contexts.concat(contextURI, {
    [reservedKeys.base]: base,
    [reservedKeys.vocabulary]: `${base}/#`
  })

  return context
}


function showExternalContext (response, options) {
  // The external context is retrieved from remote servers once upon
  // initialization, and is cached afterwards.
  if (externalContext) return endExternalContext(response)

  let cachedContexts = []

  try {
    cachedContexts = JSON.parse(fs.readFileSync(contextsPath))
  }
  catch (error) {
    // Just ignore the error.
  }

  return Promise.all(options.contexts.concat(contextURI).map(uri =>
    new Promise((resolve, reject) =>
      http.get(Object.assign(url.parse(uri), {
        headers: {
          'Accept': settings.linkedDataType,
          'User-Agent': 'curl'
        }
      }), response => {
        const chunks = []

        response.on('error', reject)
        response.on('data', chunk => chunks.push(chunk))
        response.on('end', () => resolve(JSON.parse(
          Buffer.concat(chunks).toString())[contextField]))
      })
    )
  ))
  .catch(() => {
    cachedContexts.isCached = true
    return cachedContexts
  })
  .then(contexts => {
    if (!contexts.isCached)
      try {
        fs.writeFileSync(contextsPath, JSON.stringify(contexts))
      }
      catch (error) {
        // Just ignore the error.
      }

    contexts.unshift({})
    contexts.push({
      [reservedKeys.base]: options.entryPoint,
      [reservedKeys.vocabulary]: `${options.entryPoint}/#`
    })

    externalContext = buffer(JSON.stringify({
      [contextField]: Object.assign.apply(null, contexts)
    }, null, options.jsonSpaces))

    return endExternalContext(response)
  })
}

function endExternalContext (response) {
  return new Promise((resolve, reject) => {
    response.setHeader('Content-Type', settings.linkedDataType)
    response.end(externalContext, error => error ? reject(error) : resolve())
  })
}


function mapRecord (type, record) {
  const keys = this.keys
  const recordTypes = this.recordTypes
  const encodeRoute = this.encodeRoute
  const options = this.options

  const inflectType = options.inflectType
  const uriBase64 = options.uriBase64

  const typeKey = inflectType ? capitalize(type) : type
  const fields = recordTypes[type]
  const id = record[keys.primary]
  const clone = {}

  clone[metaField] = { [contextField]: null }
  clone[typeField] = encodeURIComponent(typeKey)
  clone[hrefField] = encodeRoute(type, id, null, uriBase64)
  clone[idField] = id

  const unionFields = union(Object.keys(fields), Object.keys(record))

  for (let i = 0, j = unionFields.length; i < j; i++) {
    const field = unionFields[i]

    if (field === keys.primary || field === typeField ||
      field === hrefField || field === metaField) continue

    const fieldDefinition = fields[field]
    const hasField = field in record

    if (!hasField && !fieldDefinition[keys.link]) continue

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
    const fieldIsReverse = field in options.reverseFields
    const node = {
      [hrefField]: encodeRoute(type, id, field, uriBase64)
    }

    // If the field is on the returned record, show the ids, if any.
    if (hasField) node[idField] = record[field]

    if (!fieldIsReverse) clone[field] = node
    else {
      const field = fieldDefinition[keys.inverse]

      if (!(reservedKeys.reverse in clone))
        clone[reservedKeys.reverse] = {}

      clone[reservedKeys.reverse][field] = node
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
    record[metaField] = { [contextField]: null }

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


function capitalize (str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}


function union () {
  const result = []
  const seen = {}
  let value
  let array

  for (let g = 0, h = arguments.length; g < h; g++) {
    array = arguments[g]

    for (let i = 0, j = array.length; i < j; i++) {
      value = array[i]
      if (!(value in seen)) {
        seen[value] = true
        result.push(value)
      }
    }
  }

  return result
}
