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
var zlib = require('zlib');

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
  options.filter = function() { return false; }
  options.perf_timer = !!options.perf_timer ? options.perf_timer : () => {};

  var create_key = function(req, options) {
    var url = req.url;
    var invalidate = !!options.invalidate ? options.invalidate : false;
    var rx = new RegExp('[?&]?' + invalidate.param_key + '=' + invalidate.param_value);

    if(!!invalidate) {
      url = url.replace(rx, '');
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
      var headers = req.headers;
      var ttl = _options.ttl || 3600;
      var compress = _options.compress || false;

      var invalidate_cache = function(url, invalidate) {
        if(!!invalidate && url.search(invalidate.param_key+'='+invalidate.param_value) > -1) {
          redis_client.DEL(cache_key);
          return true;
        }

        return false;
      }

      if(compress) {
        cache_key = cache_key + ':compress'
      }

      res.send = function(body) {
        _send.call(this, body);

        if(
          typeof(res._headers['x-app-cache-key']) === 'undefined'
          && res.statusCode === 200
          && typeof(body) === 'string'
          && redis_client.connected
          && !_options.filter(url, headers)
        ) {
          if(_options.transform.body && typeof(_options.transform.body) === 'function') {
            body = _options.transform.body(body);
            if(typeof(body) !== 'string') {
              debug('Transform did not return a string, skipping SET');
              return;
            }
          }
          if(_options.with_locals) {
            body = res.locals[_options.locals_key];
          }
          if(compress) {
            let timerStart = process.hrtime();
            zlib.deflate(body, function (err, compressed_body) {
              let timerEnd = process.hrtime(timerStart);
              options.perf_timer('cache_deflate_time', timerEnd);
              if (err) {
                console.log('Error deflating!', err);
                return;
              }

              redis_client.set(cache_key, compressed_body.toString('base64'), 'ex', ttl);
            });
          }
          else {
            redis_client.set(cache_key, body, 'ex', ttl);
          }

        }

        return;
      }

      if(!_options.filter(url, headers) && redis_client.connected && !invalidate_cache(url, invalidate)) {
        redis_client.get(cache_key, function(err, reply) {
          if(!reply) {
            next();
            return;
          }

          res.set('x-app-cache-key', cache_key);

          switch(accepts(req).type(['html', 'json'])) {
            case 'json':
              res.setHeader('Content-Type', 'application/json');
              break
            case 'html':
              res.setHeader('Content-Type', 'text/html')
              break
            default:
              res.setHeader('Content-Type', 'text/html')
              break
          }

          var compressionPromise = new Promise((resolve, reject) => {
            if(compress) {
              let timerStart = process.hrtime();
              zlib.inflate(new Buffer(reply, 'base64'), (err, response) => {
                let timerEnd = process.hrtime(timerStart);
                options.perf_timer('cache_inflate_time', timerEnd);
                if (err) {
                  console.log('Error inflating!', err);
                  return;
                }

                resolve(response)
              });
            }
            else {
              resolve(reply)
            }

          })

          compressionPromise.then((response) => {
            if(typeof(_options.send) !== 'undefined' && _options.send === false) {
              res.body = response;
              next();
              return;
            }
            if (_options.with_locals) {
              res.locals[_options.locals_key] = response;
              next();
              return;
            }
            res.send(response);
          })

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
