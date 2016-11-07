'use strict';
var test = require("ava").test;
var pigfarmkoa = require("..");
var supertest = require("supertest");
var assert = require("assert");

var requestFactory = require("pigfarm-fetcher");
requestFactory.registerRequestor('default', function (cfg, callback) {
	setTimeout(function () {
		callback(null, {testdata: true});
	}, 200);
});

var request = function (pigfood, option, headers) {
	var _request = supertest(pigfarmkoa(pigfood, option).callback());
	return new Promise((resolve, reject)=> {
		var req = _request
			.get('/');

		if (headers) {
			Object.keys(headers).forEach(header=> {
				req.set(header, headers[header]);
			});
		}

		req.end(function (err, res) {
			err ? reject(err) : resolve(res);
		})
	});
};

test('gzip', async function () {
	var dom = '';
	for (var i = 0; i < 1024; i++) {
		dom += '<div></div>'
	}
	var res = await request({
		render: ()=> dom,
		data: {}
	}, {
		gzip: 1024
	}, {
		'Accept-Encoding': 'gzip'
	});
	assert.equal(res.header['content-encoding'], 'gzip')
});

test('render error', async function () {
    var result = await request({
		render: ()=> {throw new Error('render error')},
		data: {
			whatever: {
				type: "static",
				value: {
					a: 1,
					b: 2
				}
			}
		}
	});
	assert.notEqual(result.text.indexOf('Error: render error'), -1);
	assert.notEqual(result.text.indexOf('"whatever":{"a":1'), -1);
});

test('requestEnd hook', async function () {
	let through = 0;
	return new Promise(function (resolve, reject) {
		var service = pigfarmkoa({
			render: ()=> '<div></div>',
			data: {
				auto: {
					type: "request",
					action: {
						url: "what://ever",
						fixAfter: function (data) {
							extend(data, {wocao: 1});
							return data;
						}
					}
				}
			}
		});
		service.on('fetchstart', function (context) {
			console.log(context.query);
			through += 1;
			context.autonodeContext = context.autonodeContext || {};
			context.autonodeContext._timer = Date.now();
		});
		service.on('renderstart', function () {
			through += 10;
			throw new Error('hehe');
		});
		service.on('renderend', function (context) {
			through += 100;
			try {
				assert(!!context.autonodeContext._timer, 'hook changing context fail');
				assert.equal(through, 111);
			} catch (e) {
				return reject(e)
			}
			resolve()
		});
		try {
			supertest(service.callback())
				.get('/?query=1')
				.end(function (err, res) {
				})
		} catch (e) {
		}
	})
});