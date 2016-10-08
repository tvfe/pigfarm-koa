'use strict';
var koa = require("koa");
var cookie = require("cookie");
var extend = require("extend");
var pigfarm = require('pigfarm.js');
var compress = require("koa-compress");
var EventEmitter = require("events");
var debug = require("debug")('pigfarm-koa');
/**
 *
 * @param pigfood
 *  data
 *  render
 *
 * @param serveroption
 *  header
 *  gzip
 *
 *
 * @returns {*}
 */
var exportee = function (pigfood, serveroption) {
	serveroption = serveroption || {};

	var app = koa();
	var pig = pigfarm(pigfood);
	debug('create koa');
	if (serveroption.gzip) {
		app.use(compress({
			filter: ()=> true,
			threshold: isNaN(+serveroption.gzip) ? 1024 : serveroption.gzip
		}));
	}

	app.use(function *(next) {
		debug('request', this.req.url);
		this.cookie = this.request.headers['cookie'] ? cookie.parse(this.request.headers['cookie']) : {};
		yield next;
	});

	app.use(function *() {
		try {
			this.body = yield pig(serveroption.additionFood ? extend({
					QUERY: this.query,
					COOKIE: this.cookie

				}, serveroption.additionFood.call(this)) : {
					QUERY: this.query,
					COOKIE: this.cookie

				}
			)
		} catch (e) {
			this.response.status = e.status || 503;

			if (process.env.NODE_ENV != 'production') {
				// this.response.body = pe.withoutColors().render(e);
			} else {
				this.body = ''
			}
		}
	});

	Object.keys(EventEmitter.prototype).forEach(key=> {
		app[key] = pig[key] && pig[key].bind ? pig[key].bind(pig) : pig[key];
	});
	debug('created');
	return app;
};

exportee.useFetcher = function () {
    pigfarm.useFetcher.apply(this, arguments);
};

module.exports = exportee;