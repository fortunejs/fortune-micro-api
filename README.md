# Fortune Micro API Serializer

[![Build Status](https://img.shields.io/travis/fortunejs/fortune-micro-api/master.svg?style=flat-square)](https://travis-ci.org/fortunejs/fortune-micro-api)
[![npm Version](https://img.shields.io/npm/v/fortune.svg?style=flat-square)](https://www.npmjs.com/package/fortune)
[![License](https://img.shields.io/npm/l/fortune.svg?style=flat-square)](https://raw.githubusercontent.com/fortunejs/fortune-micro-api/master/LICENSE)

This is an ad-hoc [Micro API](http://micro-api.org) serializer for [Fortune.js](http://fortunejs.com).

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
- `maxLimit`: maximum number of records to show per page. Default: `1000`.
- `includeLimit`: maximum depth of fields per include. Default: `3`.
- `bufferEncoding`: which encoding type to use for input buffer fields. Default: `base64`.
- `obfuscateURIs`: obfuscate URIs to encourage use of hypermedia. Default: `true`.
- `prefix`: hyperlink prefix, without trailing slash. Default `''`.

Internal options:

- `queries`: queries to support, must be a set.
- `uriTemplate`: URI template string.
- `allowLevel`: HTTP methods to allow ordered by appearance in URI template.


## License

This software is licensed under the [MIT license](https://raw.githubusercontent.com/fortunejs/fortune-micro-api/master/LICENSE).
