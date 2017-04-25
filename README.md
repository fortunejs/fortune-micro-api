# Fortune Micro API Serializer

[![Build Status](https://img.shields.io/travis/fortunejs/fortune-micro-api/master.svg?style=flat-square)](https://travis-ci.org/fortunejs/fortune-micro-api)
[![npm Version](https://img.shields.io/npm/v/fortune-micro-api.svg?style=flat-square)](https://www.npmjs.com/package/fortune-micro-api)
[![License](https://img.shields.io/npm/l/fortune-micro-api.svg?style=flat-square)](https://raw.githubusercontent.com/fortunejs/fortune-micro-api/master/LICENSE)

This is a [Micro API](http://micro-api.org) serializer for [Fortune.js](http://fortunejs.com), which is compatible with the specification as of **2017-04-25**.

```sh
$ npm install fortune fortune-http fortune-micro-api
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

- `entryPoint`: URI to the entry point. **Required**.
- `inflectType`: convert record type name to *PascalCase* in the payload. Default: `true`.
- `reverseFields`: An object keyed by field names, which should use the `@reverse` property.
- `contexts`: An array valued by URIs to external contexts.

**Inherited options**:

- `bufferEncoding`: which encoding type to use for input buffer fields.
- `maxLimit`: maximum number of records to show per page.
- `includeLimit`: maximum depth of fields per include.
- `uriBase64`: encode URIs in base64 to discourage clients from tampering with the URI.
- `castId`: try to cast string IDs to numbers if possible.


## MessagePack

Instead of using JSON as a serialization format, it can optionally use [MessagePack](http://msgpack.org) instead, with an unregistered media type `application/x-micro-api`. It has the advantage of serializing dates and buffers properly.

```js
const microApiSerializer = require('fortune-micro-api')

// Alternative serializer with unregistered media type.
const microApiMsgPack = microApiSerializer.msgpack
```


## License

This software is licensed under the [MIT license](https://raw.githubusercontent.com/fortunejs/fortune-micro-api/master/LICENSE).
