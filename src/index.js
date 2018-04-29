'use strict';

const Hapi = require('hapi');

const testFunction = require('./helpers/eveMarketAnalysis');

testFunction();

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
