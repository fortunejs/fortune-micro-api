const deepEqual = require('fortune/lib/common/deep_equal')
const qs = require('querystring')

const run = require('tapdance')

const httpTest = require('fortune-http/test/http_test')
const microApiSerializer = require('../lib')
const settings = require('../lib/settings')

const reservedKeys = settings.reservedKeys
const mediaType = settings.mediaType
const unregisteredMediaType = settings.unregisteredMediaType

const options = {
  entryPoint: 'http://example.com/',
  externalContext: '/context.jsonld',
  castId: true
}

const httpOptions = {
  serializers: [
    [ microApiSerializer, options ],
    [ microApiSerializer.msgpack, options ]
  ]
}

function test (path, parameters, callback) {
  return httpTest(httpOptions, path, parameters, callback)
}


run((assert, comment) => {
  comment('use msgpack')
  return test('/', {
    headers: {
      'Accept': unregisteredMediaType,
      'Accept-Encoding': '*'
    }
  }, response => {
    assert(response.status === 200, 'status is correct')
    assert(response.headers['content-type'] === unregisteredMediaType,
      'content type is correct')
  })
})


run((assert, comment) => {
  comment('show index')
  return test('/', null, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    assert('User' in response.body, 'user type in body')
    assert('Animal' in response.body, 'animal type in body')
    assert('☯' in response.body, 'mystery type in body')
  })
})


run((assert, comment) => {
  comment('show collection')
  return test('/user', null, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    assert(response.body.graph.length === 3,
      'number of records correct')
  })
})


run((assert, comment) => {
  comment('show individual record with include')
  return test(`/user/1?${qs.stringify({
    'include': [ 'spouse', 'spouse.friends' ]
  })}`, null, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    assert(response.body.graph.length === 3, 'number of records correct')
  })
})


run((assert, comment) => {
  comment('show individual record with encoded ID')
  return test(`/animal/%2Fwtf?${qs.stringify({
    'fields': [ 'birthday', 'type' ]
  })}`, null, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    assert(!('graph' in response.body), 'single record')
    assert(Object.keys(response.body).length === 6,
      'number of fields correct')
  })
})


run((assert, comment) => {
  comment('sort a collection and use sparse fields')
  return test(
  `/user?${qs.stringify({
    'sort': [ 'birthday', '-name' ],
    'fields': [ 'name', 'birthday' ]
  })}`, null, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    assert(deepEqual(
      response.body.graph.map(record => record.name),
      [ 'John Doe', 'Microsoft Bob', 'Jane Doe' ]),
      'sort order is correct')
  })
})


run((assert, comment) => {
  comment('match on a collection')
  return test(`/user?${qs.stringify({
    'match.name': [ 'John Doe', 'Jane Doe' ],
    'match.birthday': '1992-12-07'
  })}`, null, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    assert(deepEqual(
      response.body.graph.map(record => record.name).sort(),
      [ 'John Doe' ]), 'match is correct')
  })
})


run((assert, comment) => {
  comment('show related records')
  return test('/user/2/ownedPets', null, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    assert(response.body.graph.length === 2,
      'number of records correct')
  })
})


run((assert, comment) => {
  comment('find an empty collection')
  return test(encodeURI('/☯'), null, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    assert(Array.isArray(response.body.graph) &&
      !response.body.graph.length,
      'payload is empty array')
  })
})


run((assert, comment) => {
  comment('find a single non-existent record')
  return test('/user/4', null, response => {
    assert(response.status === 404, 'status is correct')
    assert(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    assert('error' in response.body, 'error object exists')
    assert(response.body.error.label === 'NotFoundError',
      'name is correct')
    assert(response.body.error.comment.length, 'message exists')
  })
})


run((assert, comment) => {
  comment('find a collection of non-existent related records')
  return test('/user/3/ownedPets', null, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    assert(Array.isArray(response.body.graph) &&
      !response.body.graph.length,
      'payload is empty array')
  })
})


run((assert, comment) => {
  comment('create record')
  return test('/animal', {
    method: 'post',
    headers: { 'Content-Type': mediaType },
    body: {
      name: 'Rover',
      birthday: new Date().toJSON(),
      picture: new Buffer('This is a string.').toString('base64'),
      nicknames: [ 'Foo', 'Bar' ],
      owner: { 'id': 1 }
    }
  }, response => {
    assert(response.status === 201, 'status is correct')
    assert(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    assert(response.headers['location'] === response.body.href,
      'location header is correct')
    assert(response.body.type === 'Animal', 'type is correct')
    assert(response.body.owner.id === 1, 'link is correct')
    assert(new Buffer(response.body.picture, 'base64')
      .toString() === 'This is a string.', 'buffer is correct')
    assert(Date.now() - new Date(response.body.birthday)
      .getTime() < 60 * 1000, 'date is close enough')
  }, (change, methods) => {
    assert(change[methods.create].animal[0], 'created ID exists')
  })
})


run((assert, comment) => {
  comment('create record with existing ID should fail')
  return test('/user', {
    method: 'post',
    headers: { 'Content-Type': mediaType },
    body: {
      id: 1
    }
  }, response => {
    assert(response.status === 409, 'status is correct')
    assert(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    assert(response.body['error'], 'error exists')
  })
})


run((assert, comment) => {
  comment('create record on wrong route should fail')
  return test('/user/1', {
    method: 'post',
    headers: { 'Content-Type': mediaType },
    body: {}
  }, response => {
    assert(response.status === 405, 'status is correct')
    assert(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    assert(response.body.error, 'error exists')
  })
})


run((assert, comment) => {
  comment('update record #1')
  return test('/user/2', {
    method: 'patch',
    headers: { 'Content-Type': mediaType },
    body: {
      id: 2,
      name: 'Jenny Death',
      spouse: { id: 3 },
      enemies: { id: [ 3 ] },
      friends: { id: [ 1, 3 ] }
    }
  }, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    assert(Math.abs(new Date(response.body.lastModifiedAt)
      .getTime() - Date.now()) < 5 * 1000, 'update modifier is correct')
  })
})


run((assert, comment) => {
  comment('update record #2')
  return test('/animal/2', {
    method: 'patch',
    headers: { 'Content-Type': mediaType },
    body: {
      id: 2,
      nicknames: [ 'Baz', 'Qux' ]
    }
  }, response => {
    assert(response.status === 200, 'status is correct')
    assert(~response.headers['content-type'].indexOf(mediaType),
      'content type is correct')
    assert(Math.abs(new Date(response.body.lastModifiedAt)
      .getTime() - Date.now()) < 5 * 1000, 'update modifier is correct')
  })
})


run((assert, comment) => {
  comment('delete a single record')
  return test('/animal/3', { method: 'delete' }, response => {
    assert(response.status === 204, 'status is correct')
  })
})


run((assert, comment) => {
  comment('respond to options: index')
  return test('/', { method: 'options' }, response => {
    assert(response.status === 204, 'status is correct')
    assert(response.headers['allow'] === 'GET', 'allow header is correct')
  })
})


run((assert, comment) => {
  comment('respond to options: collection')
  return test('/user', { method: 'options' }, response => {
    assert(response.status === 204, 'status is correct')
    assert(response.headers['allow'] === 'GET, POST, PATCH, DELETE',
      'allow header is correct')
  })
})


run((assert, comment) => {
  comment('respond to options: IDs')
  return test('/user/3', { method: 'options' }, response => {
    assert(response.status === 204, 'status is correct')
    assert(response.headers['allow'] === 'GET, PATCH, DELETE',
      'allow header is correct')
  })
})


run((assert, comment) => {
  comment('respond to options: related')
  return test('/user/3/ownedPets', { method: 'options' }, response => {
    assert(response.status === 204, 'status is correct')
    assert(response.headers['allow'] === 'GET, PATCH, DELETE',
      'allow header is correct')
  })
})


run((assert, comment) => {
  comment('respond to options: fail')
  return test('/foo', { method: 'options' }, response => {
    assert(response.status === 404, 'status is correct')
  })
})

run((assert, comment) => {
  comment('show external context')

  let asserts = 0

  const response = {
    setHeader () {
      assert(true, 'header is set')
      asserts++
    },
    end (payload, callback) {
      const context = JSON.parse(payload.toString())[reservedKeys.context]
      assert(context[reservedKeys.base], 'base is set')
      assert(context[reservedKeys.vocabulary], 'vocab is set')
      asserts++
      callback()
    }
  }

  const options = {
    entryPoint: 'http://example.com',
    contexts: [],
    jsonSpaces: 2
  }

  return microApiSerializer.showExternalContext(response, options)
    .then(() => assert(asserts === 2, 'all assertions ran'))
    .catch(() => assert(false, 'something went wrong'))
})
