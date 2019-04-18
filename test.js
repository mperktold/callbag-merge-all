const test = require('tape');
const fromPromise = require('callbag-from-promise');
const { mergeAll, NO_INNER_SOURCES } = require('./index');

const range = (from, to, pullList) => {
	let i = from;
	let _sink;
	const source = (type, data) => {
		if (type === 0) (_sink = data)(0, source);
		if (type === 1) {
			if (pullList) pullList.push(data);
			if (i <= to) _sink(1, i++);
			else         _sink(2);
		}
	};
	return source;
}

const listenableOf = (...values) => (start, sink) => {
	if (start !== 0) return;
	let end = false;
	sink(0, (t, d) => {
		if (t === 2) end = true;
	});
	for (const i of values) {
		if (end) break;
		sink(1, i);
	}
	sink(2);
};

const map = fn => source => (start, sink) => {
	if (start !== 0) return;
	return source(0, (t, d) => sink(t, t === 1 ? fn(d) : d));
};

test('it subscribes to each inner source emitted by input source', t => {
	'use strict';
	let expectedValues = ["1 1","3 9","2 4"];
	const createInner = value => fromPromise(new Promise((resolve, reject) => {
		let period = value % 2 ? 400 : 1000;
		setTimeout(resolve, period, `${value} ${value*value}`);
	}));
	const inputSource = (start, sink) => {
		if(start !== 0) return;
		sink(0, (t,d) => {
			if(t === 2) clearInterval(emitter);
		});
		let count = 1;
		let emitter = setInterval(() => {
			if(count === 4){
				clearInterval(emitter);
				setTimeout(() => sink(2), 1500);
				return;
			}
			sink(1, createInner(count++));
		}, 500);

	};
	const outputSource = mergeAll(inputSource);
	outputSource(0, (type,d) => {
		if(type === 1) {
			t.equal(d, expectedValues.shift(), "Got the result when emitted");
		}
	});
	setTimeout(() => t.end(), 4000);
});

test('it stops emitting when sink unsubscribes', t => {
	'use strict';
	const doSomething = value => new Promise((resolve, reject) => {
		setTimeout(resolve, 1000, (value*value));
	});
	const inputSource = (start, sink) => {
		if(start !== 0) return;
		sink(0, (t,d) => {
			if(t === 2) clearInterval(emitter);
		});
		let count = 1;
		let emitter = setInterval(function(){
			if(count === 4){
				clearInterval(emitter);
				setTimeout(() => sink(2), 1500);
				return;
			}
			sink(1, fromPromise(doSomething(count++)));
		}, 1500);

	};
	const outputSource = mergeAll(inputSource);
	let talkback;
	outputSource(0, (type,d) => {
		if(type === 0) talkback = d;
		if(type === 1) {
			t.equal(d, 1, "Got only the results before unsubscribing");
			t.pass('When combineResults function is not specified, default to inner source');
			talkback(2);
		}
	});
	setTimeout(() => t.end(), 4000);
});

test('it flattens pullable inner sources to a pullable output source', t => {
	'use strict';
	let inputPulls = [];
	let innerPulls = [];

	const createInner = i => map(j => i + '-' + j)(range(0, 2, innerPulls));
	const inputSource = map(createInner)(range(0, 2, inputPulls));
	const outputSource = mergeAll(inputSource);
	const expectedValues = ['0-0', '0-1', '0-2', '1-0', '1-1', '1-2', '2-0', '2-1', '2-2'];
	const actualValues = [];
	let talkback = (t, d) => {};
	let stopped = false;
	outputSource(0, (type, d) => {
		if (type === 0) talkback = d;
		if (type === 1) actualValues.push(d);
		if (type === 2) stopped = true;
	});
	t.equal(actualValues.length, 0, 'Got no values before first pull');
	t.equal(inputPulls.length, 0, 'Input got source no pulls');
	t.equal(innerPulls.length, 0, 'Inner sources got no pulls');
	for (let i = 0; i < expectedValues.length; i++) {
		talkback(1);
		t.equal(inputPulls.length, Math.ceil((i + 1) / 3), 'Input source got a pull whenever a new inner is needed');
		t.equal(innerPulls.length, i + inputPulls.length, 'Inner sources got a pull whenever output source is pulled or previous ended while pulled');
		t.equal(actualValues.length, i + 1, 'Got 1 value on each pull');
	}
	t.deepEqual(actualValues, expectedValues, 'Got all values in the right order');
	t.notOk(stopped, 'Got no end before additional pull');
	talkback(1);
	t.ok(stopped, 'Got end on additional pull');
	t.end();
});

test('it flattens pullable inner sources to a pullable output source even if the input source is listenable', t=>{
	'use strict';
	let innerPulls = [];

	const createInner = i => map(j => i + '-' + j)(range(0, 2, innerPulls));
	const inputSource = map(createInner)(listenableOf(0, 1, 2));
	const outputSource = mergeAll(inputSource);

	const expectedValues = ['0-0', '0-1', '0-2', '1-0', '1-1', '1-2', '2-0', '2-1', '2-2'];
	const actualValues = [];
	let talkback = (t, d) => {};
	let stopped = false;
	outputSource(0, (type, d) => {
		if (type === 0) talkback = d;
		if (type === 1) actualValues.push(d);
		if (type === 2) stopped = true;
	});
	t.equal(actualValues.length, 0, 'Got no values before first pull');
	for (let i = 0; i < expectedValues.length; i++) {
		talkback(1);
		t.equal(actualValues.length, i + 1, 'Got 1 value on each pull');
	}
	t.deepEqual(actualValues, expectedValues, 'Got all values in the right order');
	t.notOk(stopped, 'Got no end before additional pull');
	talkback(1);
	t.ok(stopped, 'Got end on additional pull');
	t.end();
});

test('it flattens listenable inner sources to a listenable output source even if the input source is pullable', t => {
	'use strict';
	let inputPulls = [];

	const createInner = i => map(j => i + '-' + j)(listenableOf(0, 1, 2));
	const inputSource = map(createInner)(range(0, 2, inputPulls));
	const outputSource = mergeAll(inputSource);

	const expectedValues = ['0-0', '0-1', '0-2', '1-0', '1-1', '1-2', '2-0', '2-1', '2-2'];
	const expectedPulls = ['first pull', NO_INNER_SOURCES, NO_INNER_SOURCES, NO_INNER_SOURCES];
	const actualValues = [];
	let stopped = false;
	let talkback = (t, d) => {};
	outputSource(0, (type, d) => {
		if (type === 0) talkback = d;
		if (type === 1) actualValues.push(d);
		if (type === 2) stopped = true;
	});
	t.equal(inputPulls.length, 0, 'Waits until first pull');
	talkback(1, 'first pull');
	t.ok(stopped, 'Got end before returning from output source');
	t.equal(actualValues.length, expectedValues.length, 'Got only the right values');
	t.deepEqual(actualValues, expectedValues, 'Got all values in the right order');
	t.equal(inputPulls.length, expectedPulls.length, 'Input source got a pull whenever a new inner is needed');
	t.deepEqual(inputPulls, expectedPulls, 'Input pulls have payload of NO_INNER_SOURCES');
	t.end();
});

test('it immediately sends upstream messages to the oldest inner source without waiting for a push response to the previous message', t => {
	t.plan(3);
	const createInner = value => (start, sink) => {
		if (start !== 0) return;
		let buffer = [];
		sink(0, (t, d) => {
			if (t === 1) {
				if (d !== value) buffer.push(d);
				else {
					buffer.forEach(x => sink(1, value + '-' + x));
					sink(2);
				}
			}
			if (t === 2) sink(2);
		});
	};
	const inputSource = map(createInner)(listenableOf(0, 3, 6));
	const outputSource = mergeAll(inputSource);

	const expectedValues = ['3-0', '3-1', '3-2', '6-3', '6-4', '6-5'];
	const actualValues = [];
	let talkback = (t, d) => {};
	outputSource(0, (type, d) => {
		if (type === 0) talkback = d;
		if (type === 1) actualValues.push(d);
		if (type === 2) {
			t.equal(actualValues.length, expectedValues.length, 'Got only the right values');
			t.deepEqual(actualValues, expectedValues, 'Got all values in the right order');
			t.end();
		};
	});
	t.equal(actualValues.length, 0, 'Got no values before first pull');
	for (let i = 0; i <= expectedValues.length; i++) talkback(1, i);
});

test('it re-sends upstream messages to the next inner source when the previous one stopped without pushing back a value', t => {
	t.plan(3);
	const createInner = value => (start, sink) => {
		if (start !== 0) return;
		let ids = [];
		let endId;
		sink(0, (t, d) => {
			if (t === 1) {
				if (endId) return;
				if (d === value) endId = setTimeout(() => sink(2));
				else ids.push(setTimeout(() => {
					ids.shift();
					sink(1, value + '-' + d);
				}));
			}
			if (t === 2) {
				ids.forEach(clearTimeout);
				clearTimeout(endId);
				sink(2);
			}
		});
	};
	const inputSource = map(createInner)(listenableOf(0, 3, 6));
	const outputSource = mergeAll(inputSource);

	const expectedValues = ['3-0', '3-1', '3-2', '6-3', '6-4', '6-5'];
	const actualValues = [];
	let talkback;
	let timeout;
	outputSource(0, (type, d) => {
		if (type === 0) talkback = d;
		if (type === 1) actualValues.push(d);
		if (type === 2) {
			t.equal(actualValues.length, expectedValues.length, 'Got only the right values');
			t.deepEqual(actualValues, expectedValues, 'Got all values in the right order');
			t.end();
			clearTimeout(timeout);
		};
	});
	setTimeout(() => {
		t.equal(actualValues.length, 0, 'Got no values before first pull');
		for (let i = 0; i <= expectedValues.length; i++) talkback(1, i);
		timeout = setTimeout(() => t.end(), 2000);
	});
});

test('it does not overflow the stack when delivering a message to many empty pullable inner sources', t => {
	const createInner = () => (start, sink) => {
		if (start !== 0) return;
		sink(0, (t, d) => {
			if (t === 1 || t === 0) sink(2);
		});
	};
	const inputSource = map(createInner)((start, sink) => {
		if (start !== 0) return;
		let end = false;
		sink(0, (t, d) => {
			if (t === 2) end = true;
		});
		for (let i = 0; i < 10000; i++) {
			if (end) break;
			sink(1, i);
		}
		sink(2);
	});
	const outputSource = mergeAll(inputSource);
	let stopped = false;
	let talkback;
	outputSource(0, (type, d) => {
		t.notEqual(type, 1, 'Never got any value');
		if (type === 0) talkback = d;
		if (type === 2) stopped = true;
	});
	t.notOk(stopped, 'Got no end before first pull');
	t.doesNotThrow(() => talkback(1), null, 'No error thrown on pull');
	t.ok(stopped, 'Got end on first pull');
	t.end();
});
