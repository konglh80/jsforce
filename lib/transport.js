/*global process, Sfdc */

'use strict';

var inherits = require('inherits'),
    Promise = require('./promise');

/* */

var request = require('request'),
    canvas = require('./browser/canvas'),
    jsonp = require('./browser/jsonp');

// set options if defaults setting is available in request, which is not available in xhr module.
if (request.defaults) {
  var defaults = {
    followAllRedirects: true
  };
  if (process.env.HTTP_PROXY) {
    defaults.proxy = process.env.HTTP_PROXY;
  }
  if (parseInt(process.env.HTTP_TIMEOUT)) {
    defaults.timeout = parseInt(process.env.HTTP_TIMEOUT);
  }
  request = request.defaults(defaults);
}

var baseUrl;
if (typeof window === 'undefined') {
  baseUrl = process.env.LOCATION_BASE_URL || "";
} else {
  var apiHost = normalizeApiHost(window.location.host);
  baseUrl = apiHost ? "https://" + apiHost : "";
}

/**
 * Add stream() method to promise (and following promise chain), to access original request stream.
 * @private
 */
function streamify(promise, factory) {
  var _then = promise.then;
  promise.then = function() {
    factory();
    var newPromise = _then.apply(promise, arguments);
    return streamify(newPromise, factory);
  };
  promise.stream = factory;
  return promise;
}

/**
 * Normarize Salesforce API host name
 * @private
 */
function normalizeApiHost(apiHost) {
  var m = /(\w+)\.(visual\.force|salesforce)\.com$/.exec(apiHost);
  if (m) {
    apiHost = m[1] + ".salesforce.com";
  }
  return apiHost;
}

/**
 * Class for HTTP request transport
 *
 * @class
 * @protected
 */
var Transport = module.exports = function() {};

/**
 * Make HTTP request, returns promise instead of stream
 *
 * @param {Object} params - HTTP request
 * @param {Callback.<Object>} [callback] - Calback Function
 * @param {Callback.<Object>} [options] - Options
 * @returns {Promise.<Object>}
 */
Transport.prototype.httpRequest = function(params, callback, options) {
  var deferred = Promise.defer();
  var req;
  var httpRequest = request;
  if (options && options.jsonp && jsonp.supported) {
    httpRequest = jsonp.createRequest(options.jsonp);
  } else if (options && options.signedRequest && canvas.supported) {
    httpRequest = canvas.createRequest(options.signedRequest);
  }
  var createRequest = function() {
    if (!req) {
      req = httpRequest(params, function(err, response) {
        if (err) {
          deferred.reject(err);
        } else {
          deferred.resolve(response);
        }
      });
    }
    return req;
  };
  return streamify(deferred.promise, createRequest).thenCall(callback);
};

/**
 * Class for HTTP request transport using AJAX proxy service
 *
 * @class Transport~ProxyTransport
 * @protected
 * @extends Transport
 * @param {String} proxyUrl - AJAX Proxy server URL
 */
var ProxyTransport = Transport.ProxyTransport = function(proxyUrl) {
  this._proxyUrl = proxyUrl;
};

inherits(ProxyTransport, Transport);

/**
 * Make HTTP request via AJAX proxy
 *
 * @method Transport~ProxyTransport#httpRequest
 * @param {Object} params - HTTP request
 * @param {Callback.<Object>} [callback] - Calback Function
 * @returns {Promise.<Object>}
 */
ProxyTransport.prototype.httpRequest = function(params, callback) {
  var url = params.url;
  if (url.indexOf("/") === 0) {
    url = baseUrl + url;
  }
  var proxyParams = {
    method: params.method,
    url: this._proxyUrl + '?' + Date.now() + "." + ("" + Math.random()).substring(2),
    headers: {
      'salesforceproxy-endpoint': url
    }
  };
  if (params.body || params.body === "") {
    proxyParams.body = params.body;
  }
  if (params.headers) {
    for (var name in params.headers) {
      proxyParams.headers[name] = params.headers[name];
    }
  }
  return ProxyTransport.super_.prototype.httpRequest.call(this, proxyParams, callback);
};


var MoblorTransport = Transport.MoblorTransport = function() {
};

inherits(MoblorTransport, Transport);

var DEFAULT_PREFIX = 'Identity_Default_';
var prefixHash = {};
var generate = function( key ) {
  key = key || DEFAULT_PREFIX;
  var number = -1;
  if ( typeof prefixHash [ key ] !== 'undefined' ) {
    number = prefixHash [ key ];
  }

  number++;
  prefixHash[ key ] = number;
  var identify = {
    'key': key,
    'number': number,
    'uniqueId': key + number
  };

  return identify;
}

var sendRequest = function ( url, method, headers, body, cache ) {
  console.log( 'Url: ' + url );
  console.log( 'Method: ' + method );
  console.log( 'Headers: ', headers );
  console.log( 'Body: ', body );
  var identity = generate( 'moblorCallbackHandler' );
  var callbackId = identity.uniqueId;
  var deferred = Promise.defer();
  console.log( 'Register callback : ' + callbackId );
  window[ callbackId ] = function ( result ) {
    console.log( 'Callback invoked: ' + callbackId );
    console.log( 'Url: ' + url );
    console.log( 'Result: ' );
    console.log( result );
    if ( result ) {
      if( !result.status ) {
        if( result.data ) {
          deferred.resolve( result.data );
        } else {
          deferred.resolve( result );
        }
      } else {
        if ( result.status === 'true' ) {
          deferred.resolve( result.data );
        } else {
          deferred.reject( result );
        }
      }
    }
    else {
      deferred.reject( null );
    }

    delete window[ callbackId ];
  };

  var param = null;
    if ( typeof body === 'string' && body.indexOf( '&' ) > 0 ) {
    var arr = body.split( '&' );
    param = {};
    arr.forEach( function ( pair ) {
      var keyAndValue = pair.split( '=' );
      var key = keyAndValue[ 0 ];
      var val = decodeURIComponent( keyAndValue[ 1 ] );
      param[ key ] = val;
    } );
  } else if ( typeof body === 'string' ) {
    param = JSON.parse( body );
  } else if ( toString.apply( body ) === '[object Object]' ) {
    param = body;
  } else {
    param = body;
  }

  var data = {};
  data.param = param;
  data.method = method;
  data.header = headers;
  // data[ 'Content-Type' ] = 'application/x-www-form-urlencoded';
  data.api = url;
  data.cache = cache ? 1 : 0;
  data.callback = callbackId;
  window.WebViewJavascriptBridge.callHandler(
    'getDataByMoblor',
    JSON.stringify( data ),
    'callback'
    );

  return deferred.promise;
};

/**
 * Make HTTP request via AJAX proxy
 *
 * @method Transport~MoblorTransport#httpRequest
 * @param {Object} params - HTTP request
 * @returns {Promise.<Object>}
 */
MoblorTransport.prototype.httpRequest = function(params) {
  return sendRequest( params.url, params.method, params.headers, params.body, false );
};
