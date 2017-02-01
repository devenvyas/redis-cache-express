# Redis-Express caching middleware

This library implements an Express middleware that allows for caching of HTML / JSON web responses using a Redis store.

Note: 
* This library has a hard-dependency on the [Node Redis](https://github.com/NodeRedis/node_redis) NPM package_
* This middleware will only cache requests that return a `200` HTTP status code

## Installation

`npm install --save redis-express-cache`

## Usage Examples

### Initialize the middleware using a Redis client:
```js

var app = express()();
var redis_cache = require('redis-express-cache');
var redis = require('redis');

var client = redis.createClient();

/* Pass in the initialized Redis client as an option param */
var options = { client: redis_client };

redis_cache = redis_cache(options);

app.get('/url_to_cache', function (req, res) {
  res.send('Will cache this response!')
}, redis_cache)

app.listen(3000, function () {
  console.log('Starting up!')
});

```

### Initialize the middleware without a Redis client:
```js

var app = express()();
var redis_cache = require('redis-express-cache');

/* 
- No options are passed here
- Since no client has been passed, the cache middleware will make an attempt to connect to a local Redis client
*/
redis_cache = redis_cache();

app.get('/url_to_cache', function (req, res) {
  res.send('Will cache this response!')
}, redis_cache)

```

### Allow for cache invalidation through URL:
```js

/* 
This will allow for a URL cache to be invalidated / refreshed when the following URL is hit:
http://www.example-domain.com/url_to_cache?refresh_cache=8c8c279a7a98069d432271c8db9d7df2
*/

var hash_value = '8c8c279a7a98069d432271c8db9d7df2'
var refresh_key = 'refresh_cache';

var options = {
  invalidate: {
    param_key: refresh_key,
    param_value: hash_value
  }
}

var redis_cache = redis_cache(options);

app.get('/url_to_cache', function (req, res) {
  res.send('Will cache this response!')
}, redis_cache)

```

## Available options:

### Redis client
* Pass in a Redis client that the middleware can use as a cache store
* When present, the provided `client` will be used
* When absent, the middleware will attempt a connection to a client on localhost
```js 
/* Usage */
var options = { client: redis.createClient() }
```

### TTL
* Provide a number in seconds that dictates the cache duration
* When present, the given URL will be cached for given seconds
* When absent, the given URL will be cached without an expiry
```js
/* Usage */
var options = { ttl: 86400 } /* Cache for 1 day */
```

### Enable cache invalidation via GET query params
* Allows for easy invalidation of cache entries by appending a GET param to the concerned URL
* Example:
    * Cached URL => `https://www.url.com/path_to_cache` 
    * Can be invalidated by calling `https://www.url.com/path_to_cache?refresh_cache=true`
```js
/* Usage */
var options = { 
  invalidate: {
    param_key: 'refresh_cache',
    param_value: 'true'
  }
}
```




