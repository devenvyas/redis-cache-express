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
  var redis_client;
  var generate_cache_key = function(req, options) {
    var url = req.url;
    if(!!options.refresh_cache) {
      url = url.replace(options.refresh_cache.key+'='+options.refresh_cache.value, '');
    }
    url = url[url.length-1] == '?' ? url.substr(0, url.length-1) : url;
    return url;
  };

  options = options || {};

  if(typeof(options.port) === 'undefined') {
    options.port = 6379;
  }

  if(typeof(options.host) === 'undefined') {
    options.host = 'localhost';
  }

  if(typeof(options.client) === 'undefined') {
    redis_client = redis.createClient(options.port, options.host);
    redis_client.on('error', function() {
      debug('Unable to connect to Redis on %s:%s', options.port, options.host);
    });
  }
  else if(typeof(options.client) !== 'object' || typeof(options.client.connected) !== 'boolean') {
    debug('A connected redis client or connection options are required. This library supports only => https://github.com/NodeRedis/node_redis')
    return { middleware: function(req, res, next) { next() } };
  }
  else {
    redis_client = options.client;
  }

  if(typeof(options.ttl) === 'undefined') {
    options.ttl = 0;
  }

  if(typeof(options.cache_key) === 'undefined' || typeof(options.cache_key) !== 'function') {
    options.cache_key = generate_cache_key;
  }

  function middleware(req, res, next) {
    var _send = res.send;
    var cache_key = options.cache_key(req, options)
    var refresh_cache = options.refresh_cache;
    var use_cache = !!refresh_cache && req.url.search(refresh_cache.key+'='+refresh_cache.value) > -1 ? false : true;

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
          redis_client.set(cache_key, body, 'ex', options.ttl);
        }
      }
      return _send.call(this, body);
    }

    if(use_cache && redis_client.connected) {
      redis_client.get(cache_key, function(err, reply) {
        if(!reply) {
          next(); 
          return;
        }

        res.set('X-APP-CACHE-KEY', cache_key);
        res.send(reply);
      })
    }
    else
      next();
  }

  return {
    client: redis_client,
    middleware: middleware,
    generate_cache_key: generate_cache_key
  }
}
