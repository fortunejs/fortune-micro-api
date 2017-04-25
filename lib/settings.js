'use strict'

module.exports = {
  // Registered media type.
  mediaType: 'application/vnd.micro+json',

  // Unregistered media type.
  unregisteredMediaType: 'application/x-micro-api',

  // Linked data type.
  linkedDataType: 'application/ld+json',

  // Micro API JSON-LD context.
  contextURI: 'http://micro-api.org/context.jsonld',

  // Reserved keys from the JSON-LD & Micro API specifications.
  reservedKeys: {
    // JSON LD
    baseContext: '@context',
    vocabulary: '@vocab',
    base: '@base',
    context: 'context',
    href: 'href',
    reverse: 'reverse',
    type: 'type',
    graph: 'graph',

    // Micro API
    id: 'id',
    error: 'error',
    meta: 'meta',
    query: 'query',
    operate: 'operate',
    isArray: 'isArray',

    // Ontology.
    definitions: 'definitions',
    ontology: 'Ontology',
    'class': 'Class',
    property: 'Property',
    propertyOf: 'propertyOf',
    propertyType: 'propertyType',
    label: 'label',
    comment: 'comment',
    inverse: 'inverse'
  },

  typeMappings: {
    'String': 'xsd:string',
    'Number': 'xsd:float',
    'Boolean': 'xsd:boolean',
    'Date': 'xsd:dateTime',
    'Buffer': 'xsd:base64Binary',
    'Object': 'xsd:complexType'
  },

  defaults: {
    // Inflect the record type name in the payload to be PascalCase.
    inflectType: true,

    // Maximum number of records to show per page.
    maxLimit: 1000,

    // Maximum number of fields per include.
    includeLimit: 3,

    // What encoding to use for input and output buffer fields.
    bufferEncoding: 'base64',

    // How many spaces to use for pretty printing JSON.
    jsonSpaces: 2,

    // Encode URIs using base64. Useful for discouraging clients from tampering
    // with the URI.
    uriBase64: false,

    // URI to the entry point.
    entryPoint: null,

    // Whether or not to try to cast string IDs to numbers.
    castId: false,

    // What additional contexts to provide, such as schema.org.
    contexts: [],

    // Which fields should be considered reverses.
    reverseFields: {},

    // What HTTP methods may be allowed, ordered by appearance in URI template.
    allowLevel: [
      [ 'GET' ], // Index
      [ 'GET', 'POST', 'PATCH', 'DELETE' ], // Collection
      [ 'GET', 'PATCH', 'DELETE' ], // Records
      [ 'GET', 'PATCH', 'DELETE' ] // Related records
    ]
  }
}
