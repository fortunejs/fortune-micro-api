# Fortune Micro API Serializer

[![Build Status](https://img.shields.io/travis/fortunejs/fortune-micro-api/master.svg?style=flat-square)](https://travis-ci.org/fortunejs/fortune-micro-api)
[![npm Version](https://img.shields.io/npm/v/fortune-micro-api.svg?style=flat-square)](https://www.npmjs.com/package/fortune)
[![License](https://img.shields.io/npm/l/fortune-micro-api.svg?style=flat-square)](https://raw.githubusercontent.com/fortunejs/fortune-micro-api/master/LICENSE)

This is an ad-hoc [Micro API](http://micro-api.org) serializer for [Fortune.js](http://fortunejs.com), which is compatible with the specification as of **27 August 2015**.

```sh
$ npm install fortune-micro-api
```


## Usage

```js
import fortune from 'fortune'
import microApi from 'fortune-micro-api'

const store = fortune.create({
  serializers: [ {
    type: microApi,
    options: { ... }
  } ]
})
```

The `options` object is as follows:

- `inflectPath`: pluralize the record type name in the URI. Default: `true`.
- `inflectType`: convert record type name to *PascalCase* in the payload. Default: `true`.
- `maxLimit`: maximum number of records to show per page. Default: `1000`.
- `includeLimit`: maximum depth of fields per include. Default: `3`.
- `bufferEncoding`: which encoding type to use for input buffer fields. Default: `base64`.
- `obfuscateURIs`: obfuscate URIs to encourage use of hypermedia. Default: `true`.
- `namespaces`: Custom namespaces in the top-level `@context` object, keyed by namespace, valued by URI. Default: `{}`.
- `namespaceMap`: An object keyed by field or type names, valued by namespace. For example, `{ name: 'custom' }` would map the field or type `name` to the namespace `custom`. Default: `{}`.
- `vocabulary`: which vocabulary to use. Default `http://schema.org/`.
- `base`: base IRI with trailing slash. Default `null`.

Internal options:

- `castId`: try to cast string IDs to numbers if possible. Default: `false`.
- `uriTemplate`: URI template string.
- `allowLevel`: HTTP methods to allow ordered by appearance in URI template.


## Extension

This serializer interprets a special field on type definitions: `isReverse`:

```js
store.defineType('person', {
  actedIn: { link: 'movie', inverse: 'actor', isArray: true, isReverse: true }
})

store.defineType('movie', {
  actor: { link: 'person', inverse: 'actedIn', isArray: true }
})
```

This will tell the serializer to rely on the `@reverse` property.


## License

This software is licensed under the [MIT license](https://raw.githubusercontent.com/fortunejs/fortune-micro-api/master/LICENSE).
