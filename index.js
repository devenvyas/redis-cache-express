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
var accepts = require('accepts');
var redis = require('redis');

/**
 * Module exports
 */

module.exports = cache_redis;

/**
 * Cache response data in Redis and reply with the same on cache hit
 * @param {Object} [options]
 * @return {Function} middleware
 * @public
 */

function cache_redis(options) {
  options = options || {};
  options.include_host = !!options.include_host ? options.include_host : false;
  options.transform = options.transform || {};

  var create_key = function(req, options) {
    var url = req.url;
    var invalidate = !!options.invalidate ? options.invalidate : false;

    if(!!invalidate) {
      url = url.replace(invalidate.param_key + '=' + invalidate.param_value, '');
      url = url.replace(/(\&|\?)$/, '');
    }

    if(options.include_host)
      url = req.hostname + url;

    if(!!options.transform.cache_key || typeof(options.transform.cache_key) === 'function') {
      url = options.transform.cache_key(url, req);
    }

    return url;
  };

  var redis_client;
  var redis_port = !!options.port ? options.port : 6379;
  var redis_host = !!options.host ? options.host : 'localhost';


  if(typeof(options.client) === 'undefined') {
    redis_client = redis.createClient(redis_port, redis_host);
    debug('Connected to Redis on %s:%s', redis_port, redis_host);

    redis_client.on('connect', function() {
      debug('Connected to Redis on %s:%s', redis_port, redis_host);
    });

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
    delete options.client;
  }

  function with_options(opts) {
    return function middleware(req, res, next) {
      var _options = Object.assign({}, options);

      if(opts) {
        _options = Object.assign(_options, opts);
      }

      var _send = res.send;
      var cache_key = create_key(req, _options);
      var invalidate = _options.invalidate;
      var url = req.url;
      var ttl = _options.ttl;

      var invalidate_cache = function(url, invalidate) {
        if(!!invalidate && url.search(invalidate.param_key+'='+invalidate.param_value) > -1) {
          redis_client.DEL(cache_key);
          return true;
        }

        return false;
      }

      res.send = function(body) {
        _send.call(this, body);

        if(
          typeof(res._headers['x-app-cache-key']) === 'undefined'
          && res.statusCode === 200
          && typeof(body) === 'string'
          && redis_client.connected
        ) {
          if(_options.transform.body && typeof(_options.transform.body) === 'function') {
            body = _options.transform.body(body);
            if(typeof(body) !== 'string') {
              debug('Transform did not return a string, skipping SET');
              return;
            }
          }

          if(!_options.ttl) {
            redis_client.set(cache_key, body);
          }
          else {
            redis_client.set(cache_key, body, 'ex', ttl);
          }
        }

        return;
      }

      if(redis_client.connected && !invalidate_cache(url, invalidate)) {
        redis_client.get(cache_key, function(err, reply) {
          if(!reply) {
            next();
            return;
          }

          res.set('x-app-cache-key', cache_key);

          switch(accepts(req).type(['html', 'json'])) {
            case 'json':
              res.set('Content-Type', 'applicaton/json');
              break
            case 'html':
              res.setHeader('Content-Type', 'text/html')
              break
            default:
              res.setHeader('Content-Type', 'text/html')
              break
          }

          if(typeof(_options.send) !== 'undefined' && _options.send === false) {
            res.body = reply;
            next();
            return;
          }

          res.send(reply);
          return;
        })
      }
      else {
        next();
        return;
      }
    }
  }

  return {
    client: redis_client,
    middleware: with_options({}),
    with_options: with_options,
    create_key: create_key
  }
}
