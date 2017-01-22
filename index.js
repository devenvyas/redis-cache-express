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
  var generate_cache_key = function(req) {
    return req.url;
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
    res.send = function(body) {
      if(redis_client.connected && typeof(body) === 'string') {
        if(!options.ttl)
          redis_client.set(generate_cache_key(req), body);
        else
          redis_client.set(generate_cache_key(req), body, ex, options.ttl);
      }
      return _send.call(this, body);
    }

    next();
  }

  return {
    client: redis_client,
    middleware: middleware
  }
}
