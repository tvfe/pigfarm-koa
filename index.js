'use strict';
var koa = require("koa");
var cookie = require("cookie");
var extend = require("extend");
var pigfarm = require('pigfarm.js');
var compress = require("koa-compress");
var EventEmitter = require("events");
var debug = require("debug")('pigfarm-koa');
var pe = new (require("pretty-error"));
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
            this.body = yield pig.call(this, serveroption.additionFood ? extend({
                    QUERY: this.query,
                    COOKIE: this.cookie

                }, serveroption.additionFood.call(this)) : {
                    QUERY: this.query,
                    COOKIE: this.cookie

                }
            )
        } catch (e) {
            this.status = e.status || 503;

            if (process.env.NODE_ENV != 'production') {
                this.body = `<html>
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

function outputJSON(obj) {
    return String(JSON.stringify(obj))
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/'/g, '&#39;')
}