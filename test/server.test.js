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

test('header', async function() {
	var res = await request({
		render: ()=> '',
		data: {}
	}, {
		header: {'content-type': 'application/javascript'}
	});
	assert.equal(res.header['content-type'], 'application/javascript');
});
test('header when error', async function() {
	var res = await request({
		render: ()=> {throw new Error('hehe')},
		data: {}
	}, {
		header: {'content-type': 'application/javascript'}
	});
	assert.equal(res.statusCode, 555);
	assert.equal(res.header['content-type'], 'application/javascript');
});

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

test.serial('render error', async function () {
	process.env.NODE_ENV = 'production';
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
	}, {
		debug: true
	});
	process.env.NODE_ENV = '';
	assert.equal(result.header.pigfarm, 'render error');
});

test('pigfarm hook', async function () {
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
test('request hook', async function() {
	let through = 0;
	return new Promise(function (resolve, reject) {
		var service = pigfarmkoa({
			render: ()=> {
			    throw new Error('hehe')
			},
			data: {
				auto: {
					type: "request",
					action: {
						url: "what://ever"
					}
				}
			}
		});
		service.on('requeststart', function (context) {
			through++;
		});
		service.on('requesterror', function () {
			through++;
		});
		service.on('requestend', function (context, time) {
			try {
				assert(time > 190);
				through++;
				assert.equal(through, 3);
			} catch(e) {
				return reject(e);
			}
			resolve();
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
test('post', async function() {

	return new Promise(function (resolve, reject) {
		var service = pigfarmkoa({
			render: (data)=> {
				return data.BODY.username
			},
			data: {
				auto: {
					type: "request",
					action: {
						url: "what://ever"
					}
				}
			}
		});

		supertest(service.callback())
			.post('/?query=1')
			.send({'username': 'xosuperpig'})
			.end(function (err, res) {
				try {
					assert.equal(res.text, 'xosuperpig')
				} catch(e) {
					return reject(e)
				}
				resolve();
			})
	})
});
test('header in error', async function() {
	return new Promise(function (resolve, reject) {
		let service = pigfarmkoa({
			render: (data)=> {
				return data.BODY.username
			},
			data: {
				auto: {
					type: "request",
					action: {
						url: "what://ever",
						fixBefore: function() {
							let error = new Error;
							error.status = 302;
							error.headers = {
								Location: 'http://v.qq.com'
							};
							throw error;
						},
						onError: e=> e
					}
				}
			}
		});

		supertest(service.callback())
			.post('/?query=1')
			.end(function (err, res) {
				try {
					assert.equal(res.headers.location, 'http://v.qq.com')
				} catch(e) {
					return reject(e)
				}
				resolve();
			})
	})
});
test('write header in helper renderend', async function() {
	return new Promise(function (resolve, reject) {
		let service = pigfarmkoa({
			template: 'haha',
			helper: {
				_pigfarmRenderEnd: (context, renderData)=> {
					context.set('set-cookie', 'date=' + renderData.somedata.date)
					context.set('location', 'http://v.qq.com')
				}
			},
			data: {
				somedata: {
					type: "request",
					action: {
						url: "what://ever",
						fixAfter: function() {
							return {
								date: Date.now()
							}
						}
					}
				}
			}
		});

		supertest(service.callback())
			.post('/?query=1')
			.end(function (err, res) {
				try {
					assert(res.headers['set-cookie'][0].indexOf('date=') == 0);
					assert.equal(res.headers['location'], 'http://v.qq.com');
				} catch(e) {
					return reject(e)
				}
				resolve();
			})
	})
});