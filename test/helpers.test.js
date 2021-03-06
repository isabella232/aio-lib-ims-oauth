/*
Copyright 2018 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const {
  IMS_CLI_OAUTH_URL, randomId, authSiteUrl, createServer, cors, handleGET, handlePOST, stringToJson, handleUnsupportedHttpMethod,
  handleOPTIONS, codeTransform
} = require('../src/helpers')

const http = require('http')
const querystring = require('querystring')
const url = require('url')

jest.mock('http')

const createMockResponse = () => ({
  setHeader: jest.fn(),
  end: jest.fn(),
  statusCode: null,
  writeHead: jest.fn()
})

const createRequest = ({ url } = {}) => {
  const evts = {}

  return {
    url,
    on: (event, callback) => {
      evts[event] = callback
    },
    fire: (event, data) => {
      evts[event] && evts[event](data)
    }
  }
}

beforeAll(() => {
  jest.useRealTimers()
})

afterAll(() => {
  jest.useFakeTimers()
})

beforeEach(() => {
  jest.restoreAllMocks()
})

test('exports', () => {
  expect(typeof createServer).toEqual('function')
  expect(typeof randomId).toEqual('function')
  expect(typeof authSiteUrl).toEqual('function')
})

test('createServer', async () => {
  const server = {
    listen: jest.fn(),
    close: jest.fn(),
    on: jest.fn((event, callback) => {
      if (event === 'listening') {
        setTimeout(callback, 100)
      }
    })
  }

  http.createServer.mockImplementation(callback => {
    return server
  })

  await expect(createServer()).resolves.toEqual(server)
})

test('stringToJson', () => {
  expect(stringToJson('{')).toEqual({})
  expect(stringToJson('{ "foo": "bar" }')).toEqual({ foo: 'bar' })
})

test('randomId', () => {
  const r1 = randomId()
  const r2 = randomId()

  expect(r1).not.toEqual(r2)
  expect(r1.length).toEqual(8)
})

test('authSiteUrl', () => {
  let queryParams, env, url

  // success (prod)
  env = 'prod'
  url = IMS_CLI_OAUTH_URL[env]
  queryParams = { a: 'b', c: 'd' }
  expect(authSiteUrl(queryParams, env)).toEqual(`${url}?a=b&c=d`)

  // coverage (default env)
  env = undefined
  queryParams = { a: 'b', c: 'd', e: undefined, f: null }
  expect(authSiteUrl(queryParams, env)).toEqual(`${url}?a=b&c=d`)

  // success (stage)
  env = 'stage'
  url = IMS_CLI_OAUTH_URL[env]
  queryParams = { a: 'b', c: 'd', e: undefined, f: null }
  expect(authSiteUrl(queryParams, env)).toEqual(`${url}?a=b&c=d`)
})

test('handleGET', async () => {
  const id = 'abcd'
  let state = {}
  let queryData = {}
  const done = jest.fn()
  const authCode = 'my-auth-code'

  state = { id }
  queryData = { code_type: 'auth_code', code: authCode, state: JSON.stringify(state) }
  const url = `/?${querystring.stringify(queryData)}`
  const req = createRequest({ url })

  // success
  await expect(handleGET(req, createMockResponse(), id, done)).resolves.toEqual(authCode)

  // failure
  await expect(handleGET(req, createMockResponse(), 'an-altered-id', done)).rejects.toEqual(new Error(`error code=${authCode}`))
})

test('handlePOST', async () => {
  const id = 'abcd'
  let state = {}
  let queryData = {}
  const done = jest.fn()
  const authCode = 'my-auth-code'

  const req = createRequest()
  state = { id }
  queryData = { code_type: 'auth_code', code: authCode, state: JSON.stringify(state) }

  setTimeout(() => {
    req.fire('data', querystring.stringify(queryData))
    req.fire('end')
  }, 100)
  await expect(handlePOST(req, createMockResponse(), id, done)).resolves.toEqual(authCode)

  setTimeout(() => {
    req.fire('data', querystring.stringify(queryData))
    req.fire('end')
  }, 100)
  await expect(handlePOST(req, createMockResponse(), 'an-altered-id', done)).rejects.toEqual(new Error(`error code=${authCode}`))
})

test('handleUnsupportedHttpMethod', async () => {
  const req = { method: 'PUT' }
  const res = {
    setHeader: jest.fn(),
    end: jest.fn(),
    statusCode: null
  }

  handleUnsupportedHttpMethod(req, res)
  expect(res.statusCode).toEqual(405)
  expect(res.end).toHaveBeenCalled()
})

test('handleOPTIONS', async () => {
  const req = { method: 'OPTIONS' }
  const res = {
    setHeader: jest.fn(),
    end: jest.fn(),
    statusCode: null
  }

  handleOPTIONS(req, res)
  expect(res.end).toHaveBeenCalled()
})

test('codeTransform', async () => {
  let code

  code = 'my-code'
  expect(codeTransform(code, 'auth_code')).toEqual(code)

  code = { access_token: 'my-access-token' }
  expect(codeTransform(JSON.stringify(code), 'access_token')).toEqual(code)
})

test('cors', () => {
  let env, origin
  const headers = {}
  const response = {
    setHeader: (header, value) => {
      headers[header] = value
    }
  }

  const allowOriginHeader = 'Access-Control-Allow-Origin'

  // prod env
  env = 'prod'
  cors(response, env)
  origin = new url.URL(IMS_CLI_OAUTH_URL[env]).origin
  expect(headers[allowOriginHeader]).toEqual(origin)

  // stage env
  env = 'stage'
  cors(response, env)
  origin = new url.URL(IMS_CLI_OAUTH_URL[env]).origin
  expect(headers[allowOriginHeader]).toEqual(origin)

  // default env (coverage)
  env = 'prod'
  cors(response) // default
  origin = new url.URL(IMS_CLI_OAUTH_URL[env]).origin
  expect(headers[allowOriginHeader]).toEqual(origin)
})
