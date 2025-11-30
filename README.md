<!--
	This file is generated with the following command:
	deno run --allow-all https://raw.githubusercontent.com/jeremiah-shaulov/tsa/v0.0.57/tsa.ts doc-md --outFile=README.md --outUrl=https://raw.githubusercontent.com/jeremiah-shaulov/sig/0.0.1/README.md --importUrl=jsr:@shaulov/sig@0.0.1 mod.ts
-->

# sig - signals library

[Documentation Index](generated-doc/README.md)

This module is signals library for any purpose.

Signals are value containers that allow notification of the value changes.
Signals can also represent functions that compute values from other signals, reacting to their changes,
and notifying subscribers when the computed value changes.

This is well-adopted by UI frameworks, that refresh the UI parts as the reaction to data changes.
The data wrapped in signals can be loaded from server, or provided by user interaction.

This signals implementation is unique. Here are it's main features:

- All signal types (holding static values, or computing their values synchronously or asynchronously) are created
  by the single function `sig()`, and have the same interface.
- Signals can enter 3 states, and you can react to state transitions: value state, busy (promise) state, and error state.
- Automatic memory management through weak references.
- Simple view on properties of the object stored inside the signal, where they are automatically converted to another signals.
- Simple conversion of object methods to computation signals.
- Object inplace mutation with notification of changes.

```ts
import {sig} from 'jsr:@shaulov/sig@0.0.1';

const dataLoader = sig(fetch('https://example.com/').then(res => res.text()));
dataLoader.subscribe
(	function()
	{	if (this.busy.value)
		{	console.log('Data is loading...');
		}
		else if (this.error.value)
		{	console.error('Data load error:', this.error.value);
		}
		else
		{	console.log('Data loaded:', this.value);
		}
	}
);
```

## Default values

Each signal has value and default value.
The default value is returned when the signal is in error state, or in busy state before the first async computation.

## Signal States

A signal can be in one of three states:
- **Value state**: Holds a computed or static value
- **Busy state**: Async computation in progress
- **Error state**: Computation threw or returned an Error

### Accessing Signal States

- `mySig.value` - Current value (returns default in error/busy state)
- `mySig.promise` - The Promise if in busy state, otherwise `undefined`
- `mySig.busy.value` - `true` when in busy state, `false` otherwise
- `mySig.error.value` - The Error object if in error state, otherwise `undefined`
- `mySig.default` - The default value provided when the signal was created

`mySig.busy` and `mySig.error` are signals themselves, enabling reactive tracking
of state transitions.

## Creating signals holding values

Use `sig()` function to create signals.
Here are examples:

`sig()` without arguments creates a signal with `undefined` value, and `undefined` default value.
In this case you need to specify the type parameter to indicate the intended value type, and
this type must include `undefined`.

```ts
const sigA = sig<string|undefined>();
sigA.value = 'ok';
```

`sig(primitiveArg)` with single boolean, number, bigint or string argument, creates a signal holding that primitive value,
and the default value is the empty value for that type (false, 0, 0n, or '').

```ts
const sigB = sig(42);
console.log(sigB.value); // 42
```

The second argument to `sig()` is the default value.

```ts
const sigC = sig('hello', 'default greeting');
console.log(sigC.value); // 'hello'

const sigD = sig('hello', undefined); // default value is undefined, and the resulting signal type is Sig<string|undefined>

const sigE = sig<number>(100, NaN); // initial value is 100, default value is NaN

const sigF = sig<number|boolean>(0); // initial value is 0, default value is 0, type is Sig<number|boolean>
sigF.value = false;

const sigG = sig(['a', 'b', 'c']); // default value undefined

const sigH = sig({x: 10, y: 20, z: 30}, {x: 0, y: 0}); // default value {x:0, y:0}, type is Sig<{x:number, y:number, z:number|undefined}>
```

Signals can be created initially in error or busy state.

```ts
const sigErr = sig<number>(new Error('Initial error'), 0);
console.log(sigErr.value); // 0 (default value)
console.log(sigErr.error.value); // Error: Initial error

const sigBusy = sig<number>(Promise.resolve(123), 0);
console.log(sigBusy.value); // 0 (default value)
console.log(sigBusy.busy.value); // true
```

## Creating computation signals

`sig(computeFn, defaultValue)` creates a computation signal (default value is optional, and will be undefined if not provided).
The function is called to compute the signal value, and can access other signals to react to their changes.

```ts
const sigA = sig(10);
const sigB = sig(20);
const sigC = sig(() => sigA.value + sigB.value); // sigC computes sum of sigA and sigB

console.log(sigC.value); // 30

sigA.value = 15;
console.log(sigC.value); // 35
```

If the function throws an error, the signal enters error state.
In this state, the signal's `error` property holds the error object, and the `value` property returns the default value.

The function can also return an Error object (`return new Error('...')`) to enter error state.

```ts
const sigErr = sig<number>(() => {throw new Error('Computation failed')}, 0);
console.log(sigErr.value); // 0 (default value)
console.log(sigErr.error.value); // Error: Computation failed
```

The function can be asynchronous, or return a Promise, to enter busy state.
In this state, the signal's `busy` property holds `true`, and the `value` property is the default value, or the last resolved value.
The computation restarts on each change of the accessed signals.
If it starts a new computation while a previous one is still pending, the previous one is ignored when it resolves, and you
can provide cancellation function when you create the signal, that will be called to abort the previous computation.

```ts
const sigUrl = sig('https://example.com/?id=1');

let abortController: AbortController|undefined;

const sigData = sig
(	// computation function:
	async () =>
	{	console.log('Begin fetching', sigUrl.value);
		abortController = new AbortController;
		const response = await fetch(sigUrl.value, {signal: abortController.signal});
		if (!response.ok)
		{	throw new Error(`HTTP error ${response.status}`);
		}
		return await response.text();
	},

	// default value:
	'Loading...',

	// no value setter:
	undefined,

	// cancellation function:
	() =>
	{	console.log('Aborting fetch...');
		abortController?.abort();
	}
);

sigData.subscribe
(	function()
	{	if (this.busy.value)
		{	console.log('Data is loading...');
		}
		else if (this.error.value)
		{	console.error('Data load error:', this.error.value);
		}
		else
		{	console.log('Data loaded:', this.value);
		}
	}
);

setTimeout(() => sigUrl.value = 'https://example.com/?id=2', 1);
```

When a computation function returns another signal, the outer signal adopts
the inner signal's state (including errors):

```ts
const sigA = sig(1, undefined);
const sigB = sig(() => sigA.value); // when sigA is error, sigB returns undefined (sigA's default)
const sigC = sig(() => sigA); // when sigA is error, sigC also enters error state
```

## Signal value

The signal's `value` property holds the current value.
Assigning a new value to this property updates the signal's value, notifies subscribers, and triggers recomputation of dependent signals.

`mySig.set(newValueOrFn, cancelComp)` method is an alternative way to set the signal's value.
It has the second argument `cancelComp` that allows to set new cancellation function to the signal (overriding that set when the signal was created).

Signals can be converted from value-holding signals to computation signals, and vice versa.

```ts
const sigA = sig(10);
const sigB = sig(20);

console.log(sigA.value); // 10
console.log(sigB.value); // 20

sigB.value = () => sigA.value * 3;
console.log(sigB.value); // 30

sigB.value = 40;
console.log(sigB.value); // 40
```

One exception from this rule is computed signals with value setters (they cannot be converted back to value signals).

## Creating computation signals with value setter

You can provide a value setter function as the third argument to `sig()`.
This function is called when you assign a value to the computed signal.

```ts
let backingValue = 0;
const mySig = sig(() => backingValue, undefined, newValue => {backingValue = newValue});
```

Assigning a value to `mySig.value` doesn't convert the signal to a value signal; instead, it calls the setter function with the new value.

## Subscribing to signal changes

Use `mySig.subscribe(callback)` to subscribe to signal changes.
The callback is called whenever the signal's value, busy state, or error state changes.
Inside the callback, `this` refers to the signal.

```ts
const mySig = sig(0);
mySig.subscribe
(	function(prevValue)
	{	console.log('Signal changed: prevValue=', prevValue, 'value=', this.value, 'busy=', this.busy.value, 'error=', this.error.value);
	}
);

mySig.value = 42; // Triggers subscription callback
```

To unsubscribe, use the `unsubscribe()` method:

```ts
function onChange()
{	console.log('Signal changed to', this.value);
}

mySig.subscribe(onChange);

// Later, to unsubscribe:
mySig.unsubscribe(onChange);
```

Also you can pass a `WeakRef` to the `subscribe()` method.
In this case, when the referenced object is garbage collected, the subscription is automatically removed.

```ts
let onChange = function()
{	console.log('Signal changed to', this.value);
};

mySig.subscribe(new WeakRef(onChange));

setTimeout(() => {onChange = null}, 1000);
```

Note, that in this example, the `onChange` function will not be unsubscribed after 1 second,
but later in the future it will.

## Dependency tracking

When a computation signal accesses other signals, those signals are tracked as dependencies.
If the function accesses only certain child signal state, like `sigX.busy.value`, only that state is tracked.

Each time a computation runs, the dependencies are replaced with the currently accessed signals.

Child signals used in the computation hold weak references to the parent, so the parent can be eventually gone.

```ts
const sigA = sig(1);
const sigB = sig(() => sigA.value + 1); // sigB depends on sigA
const sigC = sig(() => sigA.error.value?.message); // sigC depends on sigA, and will recompute when sigA enters error state
```

For async computations, dependencies are tracked only until the first `await`.
Use the `sync()` callback to resume dependency tracking after each `await`:

```ts
const sigA = sig(1);
const sigB = sig(2);
const sigC = sig
(	async sync =>
	{	const a = sigA.value; // dependency recorded
		await new Promise(r => setTimeout(r, 100));
		sync(); // resume dependency tracking
		const b = sigB.value; // dependency recorded
		return a + b;
	}
);
```

Changes propagate through the dependency graph, triggering recomputations only when values actually change.
The implementation uses deep equality checking to detect changes.

## Property and Method Signals

Properties and methods of the underlying value can be automatically converted into signals,
when requested via the `mySig.this` Proxy.

```ts
const userSig = sig({name: 'Alice', age: 30});
const nameSig = userSig.this.name; // Sig<string|undefined> (undefined if `userSig` is undefined)
console.log(nameSig.value); // 'Alice'

userSig.value = {name: 'Bob', age: 25};
console.log(nameSig.value); // 'Bob'

nameSig.value = 'Charlie';
console.log(userSig.value); // {name: 'Charlie', age: 25}
```

It's sufficient to reference `this` only once in a chain of properties.
Each accessed property returns already Proxy-wrapped signals for further property access.

```ts
const userSig = sig({profile: {name: 'Alice', age: 30}});
const nameSig = userSig.this.profile.name; // Sig<string|undefined>
```

Method calls on `mySig.this` properties create computed signals that call the method:

```ts
const sigA = sig(['a', 'b', 'c']);
const sigS = sigA.this.slice(1);

console.log(sigS.value); // ['b', 'c']

sigA.value = ['a', 'b', 'c', 'd'];
console.log(sigS.value); // ['b', 'c', 'd']
```

Method arguments can also be signals. In this case, the method will be re-evaluated when any of the argument signals change.

```ts
const sigA = sig(['a', 'b', 'c', 'd', 'e']);
const sigI = sig(1);
const sigS = sigA.this.slice(sigI);

console.log(sigS.value); // ['b', 'c', 'd', 'e']

sigI.value = 2;
console.log(sigS.value); // ['c', 'd', 'e']
```

## Modifying Signal Values

To change signal's value, assign to `mySig.value`, or use `mySig.set()`.

Signals know about changes made to their values through `mySig.value` or `mySig.set()`,
using deep equality checks to determine if the value actually changed.

Signals don't automatically detect mutations made directly to their values.
For in-place mutations (like array methods that modify the array), use the `mut` property:

```ts
const sigA = sig(['a', 'b', 'c']);
const sigS = sigA.this.slice(1);

console.log(sigS.value); // ['b', 'c']

sigA.mut.push('d');
console.log(sigS.value); // ['b', 'c', 'd']
```

Calling methods through `mut` triggers change notifications after the method completes (without comparison).
If the method was asynchronous (returns a Promise), the notification is triggered after it resolves.
For rejected Promises, no notification occurs.

## Changes batching

During normal operation, each signal change immediately triggers recomputation
of dependent signals and invokes onChange callbacks. When making multiple related
signal changes, this can cause unnecessary intermediate computations.

`batch()` defers all dependent recomputations and onChange notifications until
the callback completes. This ensures dependent signals are updated only once
with the final state, improving performance and avoiding intermediate states.

```ts
const sigA = sig(1);
const sigB = sig(2);
const sigC = sig(() => sigA.value + sigB.value);

batch
(	() =>
	{	sigA.value = 10;  // sigC not recomputed yet
		sigB.value = 20;  // sigC not recomputed yet
	}
); // sigC recomputes once here with final values

console.log(sigC.value); // 30
```

Works with both synchronous and asynchronous callbacks. For async callbacks,
batching continues until the returned Promise resolves or rejects.

## Further Reading

- See [Sig](generated-doc/class.Sig/README.md) type for full signal interface.