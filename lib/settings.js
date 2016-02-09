'use strict'

module.exports = {
  // Registered media type.
  mediaType: 'application/vnd.micro+json',

  // Namespace for the Micro API vocabulary.
  namespace: 'µ',

  // Namespace delimiter.
  namespaceDelimiter: ':',

  // Query delimiter.
  queryDelimiter: '?',

  // Vocabulary information.
  vocabulary: 'http://micro-api.org/',

  // Reserved keys from the JSON-LD & Micro API specifications.
  reservedKeys: {
    // JSON LD
    context: '@context',
    vocabulary: '@vocab',
    base: '@base',
    id: '@id',
    reverse: '@reverse',
    type: '@type',
    graph: '@graph',

    // Micro API
    identifier: 'id',
    error: 'error',
    meta: 'meta',
    query: 'query',
    operate: 'operate',

    // Type definition fields
    isReverse: 'isReverse'
  },

  defaults: {
    // Inflect the record type name in the URI, assuming that the record type
    // name is singular.
    inflectPath: true,

    // Inflect the record type name in the payload to be PascalCase.
    inflectType: true,

    // Maximum number of records to show per page.
    maxLimit: 1000,

    // Maximum number of fields per include.
    includeLimit: 3,

    // What encoding to use for input buffer fields.
    bufferEncoding: 'base64',

    // How many spaces to use for pretty printing JSON.
    jsonSpaces: 2,

    // Obfuscate URIs to encourage use of hypermedia.
    obfuscateURIs: true,

    // Vocabulary for resolving IRIs with.
    vocabulary: 'http://schema.org/',

    // Custom namespaces in the top-level `@context` object.
    namespaces: {},

    // Custom namespace mapping.
    namespaceMap: {},

    // Base IRI with trailing slash.
    base: null,

    // Whether or not to try to cast string IDs to numbers.
    castId: false,

    // URI Template. See RFC 6570:
    // https://tools.ietf.org/html/rfc6570
    uriTemplate: '{/type,ids,relatedField}{?query*}',

    // What HTTP methods may be allowed, ordered by appearance in URI template.
    allowLevel: [
      [ 'GET' ], // Index
      [ 'GET', 'POST', 'PATCH', 'DELETE' ], // Collection
      [ 'GET', 'PATCH', 'DELETE' ], // Records
      [ 'GET', 'PATCH', 'DELETE' ] // Related records
    ]
  },

  // Regular expressions.
  inBrackets: /\[([^\]]+)\]/,
  isField: /^fields\[/,
  isMatch: /^match\[/
}
