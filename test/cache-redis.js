var express = require('express');
var request = require('supertest');
var redis = require('redis');
var expect = require('chai').expect;
var proxyquire = require('proxyquire');
var sinon = require('sinon');
var app = express();

var debug_stub = sinon.stub();
var cache_redis = proxyquire('..', {
  'debug': function() {
    return debug_stub;
  },
  'redis': redis 
});

describe('calling cache_redis() ', function() {
  var app = express();
  var agent = request(app);
  var url = '/test_url';
  var response = JSON.stringify({ "This is": "a JSON object" });

  var init_middleware = function init_middleware(options) {
    var initialized = cache_redis(options);
    app = express();
    agent = request(app);
    app.get(url, initialized.middleware, function(req, res) {
      res.send(response);
    });

    return {
      client: initialized.client,
      middleware: initialized.middleware
    }
  };

  beforeEach(function(done) {
    var client = redis.createClient();
    client.on('connect', function() {
      client.flushdb(function(err, success) {
        client.quit();
        done();
      });
    });
    debug_stub.reset();
  });

  describe('with a Redis client should', function() {
    it('return the middleware when a connected Redis client is provided', function() {
      var redis_client = redis.createClient();
      var cache_redis_res = cache_redis({ client: redis_client });
      expect(cache_redis_res.middleware).to.be.a('function');
      redis_client.quit();
    });

    it('print debug and return a basic middleware when an invalid Redis client is provided', function() {
      var cache_redis = init_middleware({ client: {} });
      expect(debug_stub.calledOnce).to.be.true;
      expect(cache_redis.middleware).to.be.a('function');
      expect(cache_redis.client).to.be.undefined;
    });
  });

  describe('should connect to a Redis client', function() {
    var redis_spy;

    beforeEach(function(){
      redis_spy = sinon.spy(redis, 'createClient');
    });

    afterEach(function() {
      redis_spy.restore();
    });

    it('on localhost when no connection values are provided', function() {
      var redis_client = init_middleware().client;
      expect(redis.createClient.calledOnce).to.be.true;
      redis_client.quit();
    });

    it('on given host when connection values are provided', function() {
      var redis_client = init_middleware({ port: 6379, host: 'localhost' }).client;
      expect(redis.createClient.calledOnce).to.be.true;
      redis_client.quit();
    });
  });

  describe('should cache the response', function() {
    it('with URL as the key by default', function(done) {
      var redis_client = init_middleware({}).client;
      agent.get(url)
      .end(function(err, res) {
        redis_client.get(url, function(err, reply) {
          expect(reply).to.equal(response);
          redis_client.quit();
          done();
        })
      })
    });

    it('with a Key generated from callback when provided', function(done) {
      var cache_key = function(req) {
        var prefix_value = '_cr_prefix';
        return prefix_value + ':' + req.url;
      };
      var redis_client = init_middleware({ cache_key: cache_key }).client;
      var req = { url: url };

      agent.get(url)
      .end(function(err, res) {
        redis_client.get(cache_key(req), function(err, reply) {
          expect(reply).to.equal(response);
          redis_client.quit();
          done();
        })
      });
    });

    it('without an expiry when no TTL has been set', function(done) {
      var redis_client = init_middleware().client;
      var req = { url: url };

      agent.get(url)
      .end(function(err, res) {
        redis_client.get(url, function(err, reply) {
          redis_client.pttl(url, function(err, reply) {
            expect(reply).to.equal(-1);
            redis_client.quit();
            done();
          })
        })
      });
    });

    it('with a TTL of given value as provided in options', function(done) {
      var ttl = 1024440;
      var redis_client = init_middleware({ ttl: ttl }).client;

      agent.get(url)
      .end(function(err, res) {
        redis_client.get(url, function(err, reply) {
          redis_client.pttl(url, function(err, reply) {
            expect(Math.round(reply/1000)).to.equal(ttl);
            redis_client.quit();
            done();
          })
        })
      });
    });

    it('only when the response has a status code of 200', function(done) {
      var cache_redis = init_middleware();
      var redis_client = cache_redis.client;

      app = express();
      app.get(url, cache_redis.middleware, function(req, res) {
        res.status(404);
        res.send('A piece of data');
      })
      agent = request(app);

      agent.get(url)
      .end(function(err, res) {
        redis_client.get(url, function(err, reply) {
          expect(reply).to.be.null;
          redis_client.quit();
          done();
        })
      });
    });
  });

  describe('when a cache is hit', function() {
    it('the middleware should send and end the response', function(done) {
      var cache_redis = init_middleware();
      var redis_client = cache_redis.client;

      agent.get(url)
      .end(function(err, res) {
        expect(res.headers['x-app-cache-key']).to.be.undefined;

        agent.get(url)
        .end(function(err, res) {
          expect(res.headers['x-app-cache-key']).to.equal(url);
          redis_client.quit();
          done();
        });
      });

    });
  });

  describe('the cache should be', function() {
    it('skipped when given `skip value` in options is present in the URL', function(done) {
    });

    it('refreshed when given `refresh value` in options is present in the URL');
  });
});