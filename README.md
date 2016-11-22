# Fortune Micro API Serializer

[![Build Status](https://img.shields.io/travis/fortunejs/fortune-micro-api/master.svg?style=flat-square)](https://travis-ci.org/fortunejs/fortune-micro-api)
[![npm Version](https://img.shields.io/npm/v/fortune-micro-api.svg?style=flat-square)](https://www.npmjs.com/package/fortune-micro-api)
[![License](https://img.shields.io/npm/l/fortune-micro-api.svg?style=flat-square)](https://raw.githubusercontent.com/fortunejs/fortune-micro-api/master/LICENSE)

This is a [Micro API](http://micro-api.org) serializer for [Fortune.js](http://fortunejs.com), which is compatible with the specification as of **2016-09-06**.

```sh
$ npm install fortune-micro-api
```


## Usage

```js
const http = require('http')
const fortune = require('fortune')
const fortuneHTTP = require('fortune-http')
const microApiSerializer = require('fortune-micro-api')

// `instance` is an instance of Fortune.js.
const listener = fortuneHTTP(instance, {
  serializers: [
    // The `options` object here is optional.
    [ microApiSerializer, options ]
  ]
})

// The listener function may be used as a standalone server, or
// may be composed as part of a framework.
const server = http.createServer((request, response) =>
  listener(request, response)
  .catch(error => { /* error logging */ }))

server.listen(8080)
```


The `options` object is as follows:

- `inflectType`: convert record type name to *PascalCase* in the payload. Default: `true`.
- `namespaces`: Custom namespaces in the top-level `@context` object, keyed by namespace, valued by URI. Default: `{}`.
- `namespaceMap`: An object keyed by field or type names, valued by namespace. For example, `{ name: 'custom' }` would map the field or type `name` to the namespace `custom`. Default: `{}`.
- `base`: base URI with trailing slash. Default `null`.
- `entryPoint`: URI to the entry point. Default `/`.

**Inherited options**:

- `bufferEncoding`: which encoding type to use for input buffer fields.
- `maxLimit`: maximum number of records to show per page.
- `includeLimit`: maximum depth of fields per include.
- `uriBase64`: encode URIs in base64 to discourage clients from tampering with the URI.
- `castId`: try to cast string IDs to numbers if possible.


## Extension

This serializer interprets a special field on type definitions: `isReverse`:

```js
{
  person: {
    actedIn: { link: 'movie', inverse: 'actor', isArray: true, isReverse: true }
  },
  movie: {
    actor: { link: 'person', inverse: 'actedIn', isArray: true }
  }
}
```

This will tell the serializer to rely on the `@reverse` property.


## MessagePack

Instead of using JSON as a serialization format, it can optionally use [MessagePack](http://msgpack.org) instead, with an unregistered media type `application/x-micro-api`.

```js
const microApiSerializer = require('fortune-micro-api')

// Alternative serializer with unregistered media type.
const microApiMsgPack = microApiSerializer.msgpack
```


## License

This software is licensed under the [MIT license](https://raw.githubusercontent.com/fortunejs/fortune-micro-api/master/LICENSE).
