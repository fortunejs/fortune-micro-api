const deepEqual = require('deep-equal')
const qs = require('querystring')

const tapdance = require('tapdance')
const run = tapdance.run
const comment = tapdance.comment
const ok = tapdance.ok

const httpTest = require('fortune/test/http')
const microApiSerializer = require('../lib')

const mediaType = 'application/vnd.micro+json'
const test = httpTest.bind(null, {
  serializers: [
    [ microApiSerializer, {
      vocabulary: 'http://example.com/',
      base: 'http://api.example.com/',
      namespaces: {
        foo: 'http://bar.com/'
      },
      namespaceMap: {
        name: 'foo',
        Animal: 'foo'
      },
      inflectPath: true,
      uriBase64: false,
      castId: true
    } ]
  ]
})


run(() => {
  comment('show index')
  return test('/', null, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    ok(Object.keys(response.body).length === 4,
      'number of types correct')
  })
})


run(() => {
  comment('show collection')
  return test('/user', null, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    ok(response.body['@graph'].length === 3,
      'number of records correct')
  })
})


run(() => {
  comment('show individual record with include')
  return test(`/user/1?${qs.stringify({
    'include': [ 'spouse', 'spouse.friends' ]
  })}`, null, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    ok(response.body['@graph'].length === 3, 'number of records correct')
  })
})


run(() => {
  comment('show individual record with encoded ID')
  return test(`/animal/%2Fwtf?${qs.stringify({
    'fields': [ 'birthday', 'type' ]
  })}`, null, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    ok(response.body['@graph'].length === 1,
      'number of records correct')
    ok(Object.keys(response.body['@graph'][0]).length === 6,
      'number of fields correct')
  })
})


run(() => {
  comment('sort a collection and use sparse fields')
  return test(
  `/user?${qs.stringify({
    'sort': [ 'birthday', '-name' ],
    'fields': [ 'name', 'birthday' ]
  })}`, null, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    ok(deepEqual(
      response.body['@graph'].map(record => record['foo:name']),
      [ 'John Doe', 'Microsoft Bob', 'Jane Doe' ]),
      'sort order is correct')
  })
})


run(() => {
  comment('match on a collection')
  return test(`/user?${qs.stringify({
    'match.name': [ 'John Doe', 'Jane Doe' ],
    'match.birthday': '1992-12-07'
  })}`, null, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    ok(deepEqual(
      response.body['@graph'].map(record => record['foo:name']).sort(),
      [ 'John Doe' ]), 'match is correct')
  })
})


run(() => {
  comment('show related records')
  return test('/user/2/ownedPets', null, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    ok(response.body['@graph'].length === 2,
      'number of records correct')
  })
})


run(() => {
  comment('find an empty collection')
  return test(encodeURI('/☯'), null, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    ok(Array.isArray(response.body['@graph']) &&
      !response.body['@graph'].length,
      'payload is empty array')
  })
})


run(() => {
  comment('find a single non-existent record')
  return test('/user/4', null, response => {
    ok(response.status === 404, 'status is correct')
    ok(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    ok('µ:error' in response.body, 'error object exists')
    ok(response.body['µ:error'].name === 'NotFoundError',
      'name is correct')
    ok(response.body['µ:error'].description.length, 'message exists')
  })
})


run(() => {
  comment('find a collection of non-existent related records')
  return test('/user/3/ownedPets', null, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    ok(Array.isArray(response.body['@graph']) &&
      !response.body['@graph'].length,
      'payload is empty array')
  })
})


run(() => {
  comment('create record')
  return test('/animal', {
    method: 'post',
    headers: { 'Content-Type': mediaType },
    body: {
      '@context': {
        '@vocab': 'http://example.com/',
        'µ': 'http://micro-api.org/',
        'foo': 'http://bar.com/'
      },
      '@graph': [ {
        '@type': 'foo:Animal',
        'foo:name': 'Rover',
        birthday: new Date().toJSON(),
        picture: new Buffer('This is a string.').toString('base64'),
        nicknames: [ 'Foo', 'Bar' ],
        owner: { 'µ:id': 1 }
      } ]
    }
  }, response => {
    ok(response.status === 201, 'status is correct')
    ok(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    ok(response.headers['location'] === response.body['@graph'][0]['@id'],
      'location header is correct')
    ok(response.body['@graph'][0]['@type'], 'type is correct')
    ok(response.body['@graph'][0].owner['µ:id'] === 1, 'link is correct')
    ok(new Buffer(response.body['@graph'][0].picture, 'base64')
      .toString() === 'This is a string.', 'buffer is correct')
    ok(Date.now() - new Date(response.body['@graph'][0].birthday)
      .getTime() < 60 * 1000, 'date is close enough')
  }, (change, methods) => {
    ok(change[methods.create].animal[0], 'created ID exists')
  })
})


run(() => {
  comment('create record with existing ID should fail')
  return test('/user', {
    method: 'post',
    headers: { 'Content-Type': mediaType },
    body: {
      '@context': {
        '@vocab': 'http://example.com/',
        'µ': 'http://micro-api.org/',
        'foo': 'http://bar.com/'
      },
      '@graph': [ { '@type': 'User', 'µ:id': 1 } ]
    }
  }, response => {
    ok(response.status === 409, 'status is correct')
    ok(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    ok(response.body['µ:error'], 'error exists')
  })
})


run(() => {
  comment('create record on wrong route should fail')
  return test('/user/1', {
    method: 'post',
    headers: { 'Content-Type': mediaType },
    body: {}
  }, response => {
    ok(response.status === 405, 'status is correct')
    ok(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    ok(response.body['µ:error'], 'error exists')
  })
})


run(() => {
  comment('update record #1')
  return test('/user/2', {
    method: 'patch',
    headers: { 'Content-Type': mediaType },
    body: {
      '@context': {
        '@vocab': 'http://example.com/',
        'µ': 'http://micro-api.org/',
        'foo': 'http://bar.com/'
      },
      '@graph': [ {
        '@type': 'User',
        'µ:id': 2,
        'foo:name': 'Jenny Death',
        spouse: { 'µ:id': 3 },
        enemies: { 'µ:id': [ 3 ] },
        friends: { 'µ:id': [ 1, 3 ] }
      } ]
    }
  }, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    ok(Math.abs(new Date(response.body['@graph'][0].lastModified).getTime() -
      Date.now()) < 5 * 1000, 'update modifier is correct')
  })
})


run(() => {
  comment('update record #2')
  return test('/animal/2', {
    method: 'patch',
    headers: { 'Content-Type': mediaType },
    body: {
      '@context': {
        '@vocab': 'http://example.com/',
        'µ': 'http://micro-api.org/',
        'foo': 'http://bar.com/'
      },
      '@graph': [ {
        '@type': 'foo:Animal',
        'µ:id': 2,
        nicknames: [ 'Baz', 'Qux' ]
      } ]
    }
  }, response => {
    ok(response.status === 200, 'status is correct')
    ok(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    ok(Math.abs(new Date(response.body['@graph'][0].lastModified).getTime() -
      Date.now()) < 5 * 1000, 'update modifier is correct')
  })
})


run(() => {
  comment('delete a single record')
  return test('/animal/3', { method: 'delete' }, response => {
    ok(response.status === 204, 'status is correct')
  })
})


run(() => {
  comment('respond to options: index')
  return test('/', { method: 'options' }, response => {
    ok(response.status === 204, 'status is correct')
    ok(response.headers['allow'] === 'GET', 'allow header is correct')
  })
})


run(() => {
  comment('respond to options: collection')
  return test('/user', { method: 'options' }, response => {
    ok(response.status === 204, 'status is correct')
    ok(response.headers['allow'] === 'GET, POST, PATCH, DELETE',
      'allow header is correct')
  })
})


run(() => {
  comment('respond to options: IDs')
  return test('/user/3', { method: 'options' }, response => {
    ok(response.status === 204, 'status is correct')
    ok(response.headers['allow'] === 'GET, PATCH, DELETE',
      'allow header is correct')
  })
})


run(() => {
  comment('respond to options: related')
  return test('/user/3/ownedPets', { method: 'options' }, response => {
    ok(response.status === 204, 'status is correct')
    ok(response.headers['allow'] === 'GET, PATCH, DELETE',
      'allow header is correct')
  })
})


run(() => {
  comment('respond to options: fail')
  return test('/foo', { method: 'options' }, response => {
    ok(response.status === 404, 'status is correct')
  })
})
