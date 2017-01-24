/*
  cache-redis
  Middleware for caching response data in Redis
*/

'use-strict';

/**
 * Module dependencies
 * @private
 */

var debug = require('debug')('cache-redis');
var redis = require('redis');
var extend = require('extend');

/**
 * Module exports
 */

module.exports = cache_redis;

/**
 * Cache response data in Redis
 * @param {Object} [options]
 * @return {Function} middleware
 * @public
 */

function cache_redis(options) {
  options = options || {};

  var create_key = function(req, options) {
    var url = req.url;
    var invalidate = !!options.invalidate ? options.invalidate : false;

    if(!!invalidate) {
      url = url.replace(invalidate.param_key + '=' + invalidate.param_value, '');
    }

    url = url[url.length-1] == '?' ? url.substr(0, url.length-1) : url;
    return url;
  };

  var redis_client;
  var redis_port = !!options.port ? options.port : 6379;
  var redis_host = !!options.host ? options.host : 'localhost';

  if(!!options.create_key || typeof(options.create_key) === 'function') {
    create_key = options.create_key;
  }

  if(typeof(options.client) === 'undefined') {
    redis_client = redis.createClient(redis_port, redis_host);
    debug('Connected to Redis on %s:%s', redis_port, redis_host);
    redis_client.on('connect', function() {
      debug('Connected to Redis on %s:%s', redis_port, redis_host);
    })
    redis_client.on('error', function() {
      debug('Unable to connect to Redis on %s:%s', redis_port, redis_host);
    });
  }
  else if(typeof(options.client) !== 'object' || typeof(options.client.connected) !== 'boolean') {
    debug('A connected redis client or connection options are required. This library supports only => https://github.com/NodeRedis/node_redis')
    return { middleware: function(req, res, next) { next() } };
  }
  else {
    redis_client = options.client;
  }

  function middleware(req, res, next) {
    var _send = res.send;
    var cache_key = create_key(req, options)
    var invalidate = options.invalidate;
    var url = req.url;
    var ttl = options.ttl;

    var use_cache = function(url, invalidate) {
      if(!redis_client.connected)
        return false;

      if(!!invalidate && url.search(invalidate.param_key+'='+invalidate.param_value) > -1)
        return false;

      return true;
    }

    res.send = function(body) {
      if(
        typeof(res._headers['x-app-cache-key']) === 'undefined' 
        && res.statusCode === 200 
        && typeof(body) === 'string'
        && redis_client.connected 
      ) {
        if(!options.ttl) {
          redis_client.set(cache_key, body);
        }
        else {
          redis_client.set(cache_key, body, 'ex', ttl);
        }
      }
      return _send.call(this, body);
    }

    if(use_cache(url, invalidate)) {
      redis_client.get(cache_key, function(err, reply) {
        if(!reply) {
          next(); 
          return;
        }

        res.set('x-app-cache-key', cache_key);
        res.send(reply);
      })
    }
    else
      next();
  }

  return {
    client: redis_client,
    middleware: middleware,
    create_key: create_key 
  }
}
