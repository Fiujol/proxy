#!/usr/bin/env node

// Import library
var args    = require('optimist').argv;
var main    = require('./src/main');
var modules = require('./src/modules');
var allowed = require('./allowed');


// Load modules
modules.load('allow');

// Parse allowed ip:port option into array
// Overrides the default allowed.js file
// TODO: remove this allowed.js file, and write a standard way to handle this allowed_ip option.
if(args.a || args.allow) {
	allowed = (args.a || args.allow).split(',');
}

// Init
main({
	port: process.env.PORT || 5999,
	workers: 2,
	ssl: false,
	key: "./default.key",
	cert: "./default.crt",
});
