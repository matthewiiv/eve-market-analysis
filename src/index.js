'use strict';
const request = require('superagent');
const async = require('async');
const Hapi = require('hapi');

const testFunction = require('./helpers/eveMarketAnalysis');
const testParallel = require('./eve_api/apiFunction');
const typeIds = require('./data').typeIds;
const regionIds = require('./data').regionIds;



var redis = require("redis")
var client = redis.createClient();
//testFunction();

testParallel(regionIds, 0);

// if you'd like to select database 3, instead of 0 (default), call
// client.select(3, function() { /* ... */ });

client.on("error", function (err) {
    console.log("Error " + err);
});




// client.hmset("user:1000", "username", "antirez", "birthyear", "1977", "verified", "1", function (err, replies) {
//     console.log(err, replies);
//     client.hgetall("user:1000", (err, replies) => {
//       console.log(replies.username);
//       client.quit();
//     })
// });

const server = Hapi.server({
    port: 3000,
    host: 'localhost'
});

server.route({
    method: 'GET',
    path: '/{name}',
    handler: (request, h) => {
        request.logger.info('In handler %s', request.path);
        return `Hello, ${encodeURIComponent(request.params.name)}!`;
    }
});

const init = async () => {

    await server.register(require('inert'));

    server.route({
        method: 'GET',
        path: '/',
        handler: (request, h) => {
            return h.file('./public/index.html');
        }
    });

    await server.start();
    console.log(`Server running at: ${server.info.uri}`);
};

process.on('unhandledRejection', (err) => {
    console.log(err);
    process.exit(1);
});

init();
