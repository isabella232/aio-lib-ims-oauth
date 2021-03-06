/*
Copyright 2020 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

const http = require('http')
const url = require('url')
const crypto = require('crypto')
const debug = require('debug')('aio-lib-ims-oauth/helpers')
const querystring = require('querystring')

const DEFAULT_ENV = 'prod'
const PROTOCOL_VERSION = 2

const IMS_CLI_OAUTH_URL = {
  prod: 'https://aio-login.adobeioruntime.net/api/v1/web/default/applogin',
  stage: 'https://aio-login.adobeioruntime.net/api/v1/web/default/applogin-stage'
}

/**
 * Create a local server.
 *
 * @returns {Promise} resolves to the http.server created, after it has started
 */
async function createServer () {
  return new Promise(resolve => {
    const server = http.createServer()

    server.listen(0, '127.0.0.1')
    server.on('listening', () => {
      resolve(server)
    })
  })
}

/**
 * Construct the auth site url with these query params.
 *
 * @param {object} queryParams the query params to add to the url
 * @param {string} [env=prod] the IMS environment
 * @returns {string} the constructed url
 */
function authSiteUrl (queryParams, env = DEFAULT_ENV) {
  const uri = new url.URL(IMS_CLI_OAUTH_URL[env])
  Object.keys(queryParams).forEach(key => {
    const value = queryParams[key]
    if (value !== undefined && value !== null) {
      uri.searchParams.set(key, queryParams[key])
    }
  })
  return uri.href
}

/**
 * Generates a random 4 character hex id.
 *
 * @returns {string} a random string
 */
const randomId = () => crypto.randomBytes(4).toString('hex')

/**
 * Safe convert from string to json.
 *
 * @private
 * @param {string} value the value to parse to json
 * @returns {object} the json object converted from the input
 **/
function stringToJson (value) {
  try {
    return JSON.parse(value)
  } catch (e) {
    return {}
  }
}

/**
 * Sets the CORS headers to the response.
 *
 * @param {object} response the Response object
 * @param {string} [env=prod] the IMS environment
 * @returns {object} return the Response object
 */
function cors (response, env = DEFAULT_ENV) {
  response.setHeader('Content-Type', 'text/plain')
  response.setHeader('Access-Control-Allow-Origin', new url.URL(IMS_CLI_OAUTH_URL[env]).origin)
  response.setHeader('Access-Control-Request-Method', '*')
  response.setHeader('Access-Control-Allow-Methods', 'OPTIONS, POST')
  response.setHeader('Access-Control-Allow-Headers', '*')

  return response
}

/**
 * Transforms the code based on the codeTtype.
 *
 * @param {string} code the code to transform
 * @param {string} codeType one of 'access_token', 'auth_code'
 * @returns {string|object} the transformed code (if applicable)
 */
function codeTransform (code, codeType) {
  if (codeType === 'access_token') {
    return JSON.parse(code)
  }

  return code
}

/**
 * OPTIONS http method handler
 *
 * @param {object} request the Request object
 * @param {object} response the Response object
 * @param {string} [env=prod] the IMS environment
 */
function handleOPTIONS (request, response, env = DEFAULT_ENV) {
  cors(response, env).end()
}

/**
 * GET http method handler.
 *
 * @param {object} request the Request object
 * @param {object} response the Response object
 * @param {string} id the secret id to compare to from the request 'state' data
 * @param {Function} done callback function
 * @param {string} [env=prod] the IMS environment
 * @returns {Promise} resolves to the auth code or access_Token
 */
async function handleGET (request, response, id, done, env = DEFAULT_ENV) {
  return new Promise((resolve, reject) => {
    cors(response, env)
    const requestUrl = request.url.replace(/^.*\?/, '')
    const queryData = querystring.parse(requestUrl)
    const state = stringToJson(queryData.state)
    debug(`state: ${JSON.stringify(state)}`)
    debug(`queryData: ${JSON.stringify(queryData)}`)

    if (queryData.code && state.id === id) {
      resolve(codeTransform(queryData.code, queryData.code_type))
      const signedInUrl = `${IMS_CLI_OAUTH_URL[env]}/signed-in`
      response.setHeader('Cache-Control', 'private, no-cache')
      response.writeHead(302, { Location: signedInUrl })
      response.end()
    } else {
      response.statusCode = 400
      const message = 'An error occurred in the cli.'
      const errorUrl = `${IMS_CLI_OAUTH_URL[env]}/error?message=${message}`
      response.setHeader('Cache-Control', 'private, no-cache')
      response.writeHead(302, { Location: errorUrl })
      response.end()
      reject(new Error(`error code=${queryData.code}`))
    }
    done()
  })
}

/**
 * Create a JSON response.
 *
 * @param {object} params parameters
 * @param {string} [params.redirect] the redirect url
 * @param {string} [params.message] the message to display
 * @param {boolean} [params.error=false] whether the message is an error
 * @returns {object} the created JSON
 */
function createJsonResponse ({ redirect, message, error = false }) {
  return {
    protocol_version: PROTOCOL_VERSION,
    redirect,
    error,
    message
  }
}

/**
 * POST http method handler.
 *
 * @param {object} request the Request object
 * @param {object} response the Response object
 * @param {string} id the secret id to compare to from the request 'state' data
 * @param {Function} done callback function
 * @param {string} [env=prod] the IMS environment
 * @returns {Promise} resolves to the auth code or access_Token
 */
async function handlePOST (request, response, id, done, env = DEFAULT_ENV) {
  return new Promise((resolve, reject) => {
    cors(response, env)
    let body = ''

    request.on('data', data => {
      body += data.toString()
    })

    request.on('end', async () => {
      const queryData = querystring.parse(body)
      const state = stringToJson(queryData.state)
      debug(`state: ${JSON.stringify(state)}`)
      debug(`queryData: ${JSON.stringify(queryData)}`)

      if (queryData.code && state.id === id) {
        resolve(codeTransform(queryData.code, queryData.code_type))
        response.statusCode = 200
        const redirect = `${IMS_CLI_OAUTH_URL[env]}/signed-in`
        // send string for backwards compat reasons
        response.end(JSON.stringify(createJsonResponse({ redirect })))
      } else {
        response.statusCode = 400
        const message = 'An error occurred in the cli.'
        const redirect = `${IMS_CLI_OAUTH_URL[env]}/error?message=${message}`
        // send string for backwards compat reasons
        response.end(JSON.stringify(createJsonResponse({ redirect, message, error: true })))
        reject(new Error(`error code=${queryData.code}`))
      }
      done()
    })
  })
}

/**
 * Unsupported HTTP method handler.
 *
 * @param {object} request the Request object
 * @param {object} response the Response object
 * @param {string} [env=prod] the IMS environment
 */
function handleUnsupportedHttpMethod (request, response, env = DEFAULT_ENV) {
  response.statusCode = 405
  cors(response, env).end('Supported HTTP methods are OPTIONS, GET, POST')
}

module.exports = {
  handleGET,
  handlePOST,
  handleOPTIONS,
  handleUnsupportedHttpMethod,
  codeTransform,
  cors,
  stringToJson,
  randomId,
  authSiteUrl,
  createServer,
  IMS_CLI_OAUTH_URL
}
