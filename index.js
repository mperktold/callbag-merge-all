const NO_INNER_SOURCES = Symbol('noInnerSources');

const mergeAll = inputSource => (start, sink) => {
    if (start !== 0) return;

    let inputSourceTalkback;
    let talkbacks = [];
    let noInner = true;
    let msgQueue = [];
    let msgIdx = 0;
    let state = 0;

    let loop = () => {
        if (state !== 0) return;
        state = 1;
        while (true) {
            if (state == 2) return;
            let currTalkback = talkbacks[0];
            if (currTalkback) {
                if (msgIdx >= msgQueue.length) break;
                currTalkback(1, msgQueue[msgIdx++]);
            }
            else if (!inputSourceTalkback) break;
            else if (msgIdx < msgQueue.length) {
                inputSourceTalkback(1, msgQueue[msgIdx]);
            }
            else if (noInner) {
                noInner = false;
                inputSourceTalkback(1, NO_INNER_SOURCES);
            }
            else break;
        }
        state = 0;
    };

    let stop = () => {
        state = 2;
        for (let tb of talkbacks) tb(2);
        if (inputSourceTalkback) inputSourceTalkback(2);
    };

    let checkTermination = err => {
        if (state !== 2 && (err || !inputSourceTalkback && talkbacks.length === 0)) {
            stop();
            sink(2, err);
        }
    }

    let pullHandle = (t, d) => {
        if (t === 1) {
            msgQueue.push(d);
            loop();
        }
        if (t === 2) stop();
    };

    let makeSink = () => {
        let talkback;
        return (t, d) => {
            if (t === 0) talkbacks.push(talkback = d);
            if (talkback === talkbacks[0]) {
                if (t === 1) {
                    msgQueue.shift();
                    msgIdx--;
                }
                if (t === 2) {
                    noInner = msgQueue.length === 0;
                    msgIdx = 0;
                }
            }
            if (t === 1) sink(1, d);
            if (t === 2) {
                talkbacks.splice(talkbacks.indexOf(talkback), 1);
                checkTermination(d);
            }
            loop();
        };
    };

    inputSource(0, (t, d) => {
        if (t === 0) {
            inputSourceTalkback = d;
            sink(0, pullHandle);
        }
        if (t === 1) d(0, makeSink());
        if (t === 2) {
            inputSourceTalkback = null;
            checkTermination(d);
        }
    });
}

module.exports = { mergeAll, NO_INNER_SOURCES };
