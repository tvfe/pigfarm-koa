'use strict';
const koa = require("koa");
const cookie = require("cookie");
const extend = require("extend");
const pigfarm = require('pigfarm.js');
const compress = require("koa-compress");
const bodyparser = require("koa-bodyparser");
const EventEmitter = require("events");
const debug = require("debug")('pigfarm-koa');
const pe = new (require("pretty-error"));
require("statuses")['555'] = 'autonode render error';
/**
 *
 * @param pigfood
 *  data
 *  render
 *
 * @param serveroption
 *  header
 *  gzip
 *  additionFood:fn
 *  debug
 *
 * @returns {*}
 */
let exportee = function (pigfood, serveroption) {
	serveroption = serveroption || {};

	let app = new koa();
	let pig = pigfarm(pigfood);

	let helpers = pigfood.helper || {};

	// 转发pigfarm的内部事件
	Object.keys(EventEmitter.prototype).forEach(key=> {
		app[key] = pig[key] && pig[key].bind ? pig[key].bind(pig) : pig[key];
	});

	debug('create koa');
	if (serveroption.gzip) {
		app.use(compress({
			filter: ()=> true,
			threshold: isNaN(+serveroption.gzip) ? 1024 : serveroption.gzip
		}));
	}

	app.use(async (context, next)=> {
		debug('request', context.req.url);
		context.cookie = context.request.headers['cookie'] ? cookie.parse(context.request.headers['cookie']) : {};
		await next();
	});

	app.use(bodyparser());

	app.use(async context=> {
		let start = process.uptime();

		let fetchContext = serveroption.additionFood ? extend({
			QUERY: context.query,
			COOKIE: context.cookie,
			HEADER: context.header,
			BODY: context.request.body || {}

		}, serveroption.additionFood.call(context)) : {
			QUERY: context.query,
			COOKIE: context.cookie,
			HEADER: context.header,
			BODY: context.request.body || {}
		};

		try {
			app.emit('requeststart', context);

			let body = await pig.call(context, fetchContext);

			callhook(helpers._pigfarmRenderEnd, [context, fetchContext]);
			if (serveroption.header) {
				Object.keys(serveroption.header).forEach((header)=> {
					context.set(header, serveroption.header[header]);
				});
			}
			context.body = body;
		} catch (e) {
			app.emit('requesterror', context, e);
			context.status = e.status || 503;

			callhook(helpers._pigfarmRequestError, [context, e, fetchContext]);
			if (serveroption.header) {
				Object.keys(serveroption.header).forEach((header)=> {
					context.set(header, serveroption.header[header]);
				});
			}
            if (e.headers) {
                Object.keys(e.headers).forEach((header) => {
                    context.set(header, e.headers[header]);
                });
            }
			if (process.env.NODE_ENV != 'production') {
				context.body = `<html>
                <head>
                <title>error</title>
                </head>
                <body>
                <h1>tips: open console, you can see your renderData</h1>
                <div>${pe.withoutColors().render(e).replace(/\n/g, '<br />')}</div>
                <script>console.log(${e.renderData ? outputJSON(e.renderData) : null})</script>
                </body>
                </html>`;
			} else {
				if (serveroption.debug) {
					context.set('pigfarm', e.message);
				}
				context.body = ''
			}
		}
		app.emit('requestend', context, (process.uptime() - start) * 1000);
	});

	debug('created');
	return app;
};

exportee.useFetcher = function () {
	pigfarm.useFetcher.apply(this, arguments);
};

module.exports = exportee;

function outputJSON(obj) {
	return String(JSON.stringify(obj))
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/'/g, '&#39;')
}
function callhook(fn, args) {
    try {
		fn && fn.apply(this, args)
	} catch(e) {}
}