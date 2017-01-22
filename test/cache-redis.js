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
  beforeEach(function(done) {
    debug_stub.reset();
    var client = redis.createClient();
    client.on('connect', function() {
      client.flushdb(function(err, success) {
        client.quit();
        done();
      });
    });
  });

  describe('with a Redis client should', function() {
    it('return the middleware when a connected Redis client is provided', function() {
      var redis_client = redis.createClient();
      var cache_redis_res = cache_redis({ client: redis_client });
      expect(cache_redis_res.middleware).to.be.a('function');
    });

    it('print debug and return a basic middleware when an invalid Redis client is provided', function() {
      var cache_redis_res = cache_redis({ client: {} });
      expect(debug_stub.calledOnce).to.be.true;
      expect(cache_redis_res.middleware).to.be.a('function');
      expect(cache_redis_res.client).to.be.undefined;
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
      var cache_redis_res = cache_redis();
      expect(redis.createClient.calledOnce).to.be.true;
      cache_redis_res.client.quit();
    });

    it('on given host when connection values are provided', function() {
      var cache_redis_res = cache_redis({ port: 6379, host: 'localhost' });
      expect(redis.createClient.calledOnce).to.be.true;
      cache_redis_res.client.quit();
    });
  });

  describe('should cache the response', function() {
    var app = express();
    var agent = request(app);
    var url = '/test_url';
    var response = JSON.stringify({ "This is": "a JSON object" });
    
    it('with URL as the key by default', function(done) {
      var cache_redis_res = cache_redis();
      var middleware = cache_redis_res.middleware;
      var redis_client = cache_redis_res.client;

      app.get(url, middleware, function(req, res) {
        res.send(response);
      });

      agent.get(url)
      .end(function(err, res) {
        redis_client.get(url, function(err, reply) {
          expect(reply).to.equal(response);
          done();
        })
      })
    });

    it.only('with a Key generated from callback when provided', function(done) {
      var cache_key = function(req) {
        var prefix_value = '_cr_prefix';
        return prefix_value + ':' + req.url;
      };
      var cache_redis_res = cache_redis({ cache_key: cache_key });
      var middleware = cache_redis_res.middleware;
      var redis_client = cache_redis_res.client;
      var req = { url: url };

      app.get(url, middleware, function(req, res) {
        res.send(response);
      });

      agent.get(url)
      .end(function(err, res) {
        redis_client.get(cache_key(req), function(err, reply) {
          expect(reply).to.equal(response);
          done();
        })
      });
    });

    it('without an expiry when no TTL has been set');
    it('with a TTL of given value as provided in options');
    it('only when the response has a status code of 200');
  });

  describe('the cache should be', function() {
    it('skipped when given `skip value` in options is present in the URL');
    it('refreshed when given `refresh value` in options is present in the URL');
  });

  describe('when a cache is hit', function() {
    it('the middleware should send and end the response');
  });

});