# callbag-merge-all 👜

Callbag operator that merges all items of a source of sources into a single output source

`npm install callbag-merge-all`

The input source can be listenable or pullable, and its inner sources can be listenable
or pullable as well.

The output source reflects the nature of inner sources: Listenable inner sources are merged
into a listenable output source, pullable inner sources are merged into a pullable output
source. More on this [later](#details).

## Usage:

```js
const mergeAll   = require('callbag-merge-all');
const fromIter   = require('callbag-from-iter');
const of         = require('callbag-of');
const pipe       = require('callbag-pipe');
const map        = require('callbag-map');
const toIterable = require('callbag-to-iterable');

// Pullable sources
const iterable = pipe(
  fromIter([1, 2]),
  map(i => fromIter([`${i}a`, `${i}b`])),
  mergeAll,
  toIterable
);

for (const i of iterable) {
  console.log(i);                // Logs 1a, 1b, 2a, 2b
}

// Listenable sources
pipe(
  of(1, 2),
  map(i => of(`${i}a`, `${i}b`)),
  mergeAll,
  forEach(x => console.log(x))   // Logs 1a, 1b, 2a, 2b
);
```

## Merging a Pullable Source of Listenable Inner Sources

Since pullable inner sources should be merged into a pullable output source,
`mergeAll` doesn't pull the input by itself, but instead waits until the output
is pulled.

On the other hand, this creates a problem when merging a pullable source of
listenable inner sources: The output should be listenable, i.e. doesn't have
to be pulled. Although, to get the inner sources, `mergeAll` needs to pull the
outer input source, yet it can't, because it doesn't know in advance whether
the inner sources are pullable or listenable.

To solve this dilemma, `mergeAll` offers a compromise in this special case.
It creates a 'lazy listenable' output source: You must pull it once to get it started.
This pull is forwarded to the inner source and thereby fetches the first inner source.
After that first pull, it behaves exactly like a listenable source.
Then, whenever the last inner source completes, and there haven't been any unanswered
pulls to the output source, `mergeAll` issues a pull to the input with a special payload
`NO_INNER_SOURCES`. Most sources will interpret this as an ordinary pull, but
the special payload gives you the option to treat these pulls differently, e.g.
deferring them for a while.

```javascript

const tapUp   = require('callbag-tap-up');
const pull    = require('callbag-pull');
const observe = require('callbag-observe');

const output = pipe(
  fromIter([1, 2]),
  map(i => of(`${i}a`, `${i}b`)),
  tapUp(msg => console.log(msg)),   // Logs undefined, NO_INNER_SOURCES, NO_INNER_SOURCES
  mergeAll,
  pull(1),
  observe(x => console.log(x))      // Logs 1a, 1b, 2a, 2b
);
```
