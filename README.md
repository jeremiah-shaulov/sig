<!--
	This file is generated with the following command:
	deno run --allow-all https://raw.githubusercontent.com/jeremiah-shaulov/tsa/v0.0.57/tsa.ts doc-md --outFile=README.md --outUrl=https://raw.githubusercontent.com/jeremiah-shaulov/sig/0.0.15/README.md --importUrl=jsr:@shaulov/sig@0.0.15 mod.ts
-->

# sig - feature-rich multipurpose signals library

[Documentation Index](generated-doc/README.md)

This module is signals library for any purpose.
It can be used with deno, bun, node, or in browser environment.

## Overview

Signals are value containers that can notify subscribers when their values change.
Signals can also represent functions that compute values from other signals, automatically reacting to their changes,
and notifying subscribers when the computed value changes.

This is well-adopted by UI frameworks, that refresh the UI parts as the reaction to data changes.
The data wrapped in signals can be loaded from server, or provided by user interaction.

This signals implementation is unique. Here are it's main features:

- **Unified API**: All signal types (holding static values, or computing their values synchronously or asynchronously)
  are created with the single [sig()](generated-doc/function.sig/README.md) function and share the same [Sig](generated-doc/class.Sig/README.md) interface.
- **Three-State Model**: Signals can enter 3 states, and you can react to state transitions: value state, busy (promise) state, and error state.
- **Automatic Memory Management**: Through weak references.
- **Property Signals**: Simple view on properties of the object stored inside the signal, where they are automatically converted to another signals.
- **Method Signals**: Simple conversion of object methods to computation signals.
- **In-Place Mutations**: Allows to call modifying methods with change notifications.

## Example

```ts
// To download and run this example:
// curl 'https://raw.githubusercontent.com/jeremiah-shaulov/sig/0.0.15/README.md' | perl -ne 's/^> //; $y=$1 if /^```(.)?/; print $_ if $y&&$m; $m=$y&&$m+/<example-p9mn>/' > /tmp/example-p9mn.ts
// deno run --allow-net /tmp/example-p9mn.ts

import {sig} from 'jsr:@shaulov/sig@0.0.15';

// Load data asynchronously
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

await dataLoader.promise;
```

## Default Values

Each [Sig](generated-doc/class.Sig/README.md) has both a current value and a default value. The default value is returned
when the signal is in error state or in busy state before the first async computation completes.

## Signal States

A signal can be in one of three mutually exclusive states:

- **Value state**: Holds a computed or static value
- **Busy state**: Async computation in progress
- **Error state**: Computation threw or returned an Error

### Accessing Signal States

- `mySig.value` - Current value (returns default value when in error or initial busy state)
- `mySig.promise` - The Promise if in busy state, otherwise `undefined`
- `mySig.busy.value` - `true` when in busy state, `false` otherwise
- `mySig.error.value` - The Error object if in error state, otherwise `undefined`
- `mySig.default` - The default value provided when the signal was created

`mySig.busy` and `mySig.error` are signals themselves, enabling reactive tracking
of state transitions.

## Creating Signals Holding Values

Use the [sig()](generated-doc/function.sig/README.md) function to create signals. Here are examples:

### Signal with Undefined Value

[sig](generated-doc/function.sig/README.md) without arguments creates a signal with `undefined` value and `undefined` default.
In this case you need to specify the type parameter to indicate the intended value type, and
this type must include `undefined`.

```ts
const sigA = sig<string|undefined>();
sigA.value = 'ok';
```

### Signal from Primitive

`sig(primitiveArg)` with a single boolean, number, bigint, or string argument creates a signal holding
that value, and the default value is the empty value for that type (false, 0, 0n, or ''):

```ts
const sigB = sig(42);
console.log(sigB.value); // 42
console.log(sigB.default); // 0
```

### Explicit Default Value

The second argument to [sig](generated-doc/function.sig/README.md) sets the default value:

```ts
const sigC = sig('hello', 'default greeting');
console.log(sigC.value); // 'hello'

const sigD = sig('hello', undefined); // default value is undefined, type is Sig<string|undefined>

const sigE = sig<number>(100, NaN); // initial value is 100, default value is NaN

const sigF = sig<number|boolean>(0); // initial value is 0, default value is 0, type is Sig<number|boolean>
sigF.value = false;

const sigG = sig(['a', 'b', 'c']); // default value undefined

const sigH = sig({x: 10, y: 20, z: 30}, {x: 0, y: 0}); // default value {x: 0, y: 0}, type is Sig<{x: number, y: number, z: number|undefined}>
```

### Initial Error or Busy State

Signals can be created in error or busy state by passing an Error or Promise object:

```ts
const sigErr = sig<number>(new Error('Initial error'), 0);
console.log(sigErr.value); // 0 (default value)
console.log(sigErr.error.value); // Error: Initial error

const sigBusy = sig<number>(Promise.resolve(123), 0);
console.log(sigBusy.value); // 0 (default value)
console.log(sigBusy.busy.value); // true
```

## Creating Computation Signals

`sig(computeFn, defaultValue)` creates a computation signal (default value is optional, and will be undefined if not provided).
The function is called to compute the signal value, and can access other signals to react to their changes:

```ts
const sigA = sig(10);
const sigB = sig(20);
const sigC = sig(() => sigA.value + sigB.value); // sigC computes sum of sigA and sigB

console.log(sigC.value); // 30

sigA.value = 15;
console.log(sigC.value); // 35
```

The computation function is called only when necessary: if the signal has no subscribers, it's called only when signal's value is accessed.
In the example above, the function is not yet called after assigning `15` to `sigA.value`, but only when `sigC.value` is accessed in the `console.log` statement.

### Error Handling in Computations

If the function throws an error, the signal enters error state.
In this state, the signal's `error` property holds the error object, and the `value` property returns the default value.

The function can also return an Error object (`return new Error('...')`) to enter error state:

```ts
const sigErr = sig<number>(() => {throw new Error('Computation failed')}, 0);
console.log(sigErr.value); // 0 (default value)
console.log(sigErr.error.value); // Error: Computation failed
```

### Async Computations

Computation functions can be async or return a Promise. While the Promise is pending,
the signal enters busy state.
In this state, the signal's `busy` property holds `true`, and the `value` property is the default value, or the last resolved value.
The computation restarts on each change of the accessed signals (if the signal has subscribers to value change).
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

### Returning Signals from Computations

When a computation function returns another signal, the outer signal adopts
the inner signal's state, including error and busy states:

```ts
const sigA = sig(1, undefined);
const sigB = sig(() => sigA.value); // when sigA is error, sigB returns undefined (sigA's default)
const sigC = sig(() => sigA); // when sigA is error, sigC also enters error state
```

## Signal Values

The signal's `value` property holds the current value.
Assigning a new value to this property updates the signal's value, triggers recomputation of dependent signals (if necessary), and notifies subscribers.

```ts
const mySig = sig(10);
mySig.value = 42; // Updates value
```

Alternatively, use `mySig.set(newValueOrFn, cancelComp)` method, that does the same, but also accepts an optional cancellation function as the second argument:

```ts
const mySig = sig(10);
mySig..set(42); // Updates value
```

### Converting Between Signal Types

Signals can be converted between value-holding and computed modes by assignment:

```ts
const sigA = sig(10);
const sigB = sig(20);

console.log(sigA.value); // 10
console.log(sigB.value); // 20

sigB.value = () => sigA.value * 3; // Convert to computed signal
console.log(sigB.value); // 30

sigB.value = 40; // Convert back to value signal
console.log(sigB.value); // 40
```

Exception: Computed signals with value setters (see below) cannot be converted to value signals.

## Creating Computation Signals with Value Setters

Provide a setter function as the third argument to [sig](generated-doc/function.sig/README.md) to create a computed signal
that can be assigned to. The setter is called when you assign a value:

```ts
let backingValue = 0;
const mySig = sig(() => backingValue, undefined, newValue => {backingValue = newValue});

console.log(mySig.value); // 0
mySig.value = 42; // Calls setter, doesn't convert to value signal
console.log(mySig.value); // 42
```

## Subscribing to Signal Changes

Use `mySig.subscribe(callback)` to register a callback that runs whenever the signal's
value, busy state, or error state changes. Inside the callback, `this` refers to the signal:

```ts
const mySig = sig(0);
mySig.subscribe
(	function(prevValue)
	{	console.log('Changed from', prevValue, 'to', this.value);
		console.log('busy=', this.busy.value, 'error=', this.error.value);
	}
);

mySig.value = 42; // Triggers subscription callback
```

### Unsubscribing

To remove a subscription, use `unsubscribe()`:

```ts
function onChange()
{	console.log('Signal changed to', this.value);
}

mySig.subscribe(onChange);

// Later, to unsubscribe:
mySig.unsubscribe(onChange);
```

### Weak Reference Subscriptions

Pass a `WeakRef` to `subscribe()` for automatic cleanup when the referenced object
is garbage collected:

```ts
import {sig, Sig} from 'jsr:@shaulov/sig@0.0.15';

const mySig = sig(42);

let onChange: ((this: Sig<number>) => void) | null = function()
{	console.log('Signal changed to', this.value);
};

mySig.subscribe(new WeakRef(onChange));

setTimeout(() => {onChange = null}, 3000);
// onChange will be automatically unsubscribed after garbage collection
```

## Dependency Tracking

When a computation function accesses other signals, those signals are automatically tracked
as dependencies. The computed signal will recompute whenever any dependency changes:

```ts
const sigA = sig(1);
const sigB = sig(() => sigA.value + 1); // sigB depends on sigA's value
const sigC = sig(() => sigA.error.value?.message); // sigC depends on sigA's error state
```

### Selective State Tracking

If a computation accesses only specific signal properties (like `sigX.busy.value`),
only changes to that property trigger recomputation.

### Dynamic Dependencies

Each time a computation runs, its dependencies are updated based on which signals
it actually accesses. This means conditionally accessed signals only trigger recomputation
when they're actually being used:

```ts
const useA = sig(true);
const sigA = sig(1);
const sigB = sig(2);
const computed = sig(() => useA.value ? sigA.value : sigB.value);
// When useA is true, changes to sigB don't trigger recomputation
```

### Weak References

Child signals hold weak references to parent computed signals, allowing parent signals
to be garbage collected when no longer referenced elsewhere.

This particularly means, that computed signals with subscribers will stop
producing notifications, if the signal vanishes,
and you should keep strong references to signals that you still need.

The following example proves this.

```ts
import {type Sig, sig} from 'jsr:@shaulov/sig@0.0.15';

const sigA = sig(0);

let sigB: Sig<string> | undefined = sig(() => `Value: ${sigA.value}`, '');
sigB.subscribe
(	function()
	{	console.log(this.value);
	}
);

// After 3 seconds, remove reference to sigB
setTimeout
(	() =>
	{	sigB = undefined;

		// Create memory pressure to encourage GC (works on most JS engines)
		const waste: unknown[] = [];
		for (let i=0; i<5000; i++)
		{	waste.push(new Array(10000).fill(Math.random()));
		}
		waste.length = 0; // Release the waste
	},
	3000
);

// Increment sigA every second to trigger notifications
const h = setInterval(() => sigA.value++, 1000);

// Stop after 10 seconds
setTimeout(() => clearInterval(h), 10_000);
```

### Async Dependency Tracking

For async computations, dependencies are tracked only until the first `await`.
Use the `sync()` callback parameter to resume dependency tracking after each `await`:

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

### Debugging Dependencies

Sometimes it's not obvious which dependency caused a recomputation.
This library passes 2 arguments to computation functions: `sync` (see above) and `cause`.
The latter is a signal that caused the recomputation, or `undefined` if this is the first computation.
`cause` is tracked only for signals, that have subscribers.

```ts
// To download and run this example:
// curl 'https://raw.githubusercontent.com/jeremiah-shaulov/sig/0.0.15/README.md' | perl -ne 's/^> //; $y=$1 if /^```(.)?/; print $_ if $y&&$m; $m=$y&&$m+/<example-65ya>/' > /tmp/example-65ya.ts
// deno run /tmp/example-65ya.ts

import {sig} from 'jsr:@shaulov/sig@0.0.15';
import {assertEquals} from 'jsr:@std/assert@1.0.16/equals';

const sigA = sig(1);
const sigB = sig(2);
const sigC = sig(3);

const computed = sig
(	(_sync, cause) =>
	{	if (cause)
		{	console.log(`Recomputed because of: ${cause}`);
		}
		else
		{	console.log('Initial computation');
		}
		return sigA.value + sigB.value + sigC.value;
	}
);

computed.subscribe(() => {}); // add subscription to enable cause tracking

assertEquals(computed.value, 6); // Initial computation

sigA.value = 10; // Recomputed because of: 10
assertEquals(computed.value, 15);

sigB.value = 20; // Recomputed because of: 20
assertEquals(computed.value, 33);
```

### Change Detection

Changes propagate through the dependency graph, triggering recomputations only when
values actually change. The implementation uses deep equality checking to prevent
unnecessary updates when the new value is deeply equal to the previous value.

## Property and Method Signals

The `.this` proxy automatically converts object properties and methods into reactive signals:

### Property Signals

```ts
const userSig = sig({name: 'Alice', age: 30});
const nameSig = userSig.this.name; // Sig<string|undefined> (undefined if `userSig` is undefined)
console.log(nameSig.value); // 'Alice'

userSig.value = {name: 'Bob', age: 25};
console.log(nameSig.value); // 'Bob'

nameSig.value = 'Charlie';
console.log(userSig.value); // {name: 'Charlie', age: 25}
```

### Nested Properties

Reference `.this` only once at the beginning of a property chain. Each property
access returns already a proxy-wrapped signal for further access:

```ts
const userSig = sig({profile: {name: 'Alice', age: 30}});
const nameSig = userSig.this.profile.name; // Sig<string|undefined>
```

### Method Signals

Method calls through `.this` create computed signals that re-evaluate the method:

```ts
// To download and run this example:
// curl 'https://raw.githubusercontent.com/jeremiah-shaulov/sig/0.0.15/README.md' | perl -ne 's/^> //; $y=$1 if /^```(.)?/; print $_ if $y&&$m; $m=$y&&$m+/<example-pf4z>/' > /tmp/example-pf4z.ts
// deno run /tmp/example-pf4z.ts

import {sig} from 'jsr:@shaulov/sig@0.0.15';

const sigA = sig(['a', 'b', 'c']);
const sigS = sigA.this.slice(1);

console.log(sigS.value); // ['b', 'c']

sigA.value = ['a', 'b', 'c', 'd'];
console.log(sigS.value); // ['b', 'c', 'd'] (automatically recomputed)
```

### Signal Arguments

Method arguments can be signals. When argument signals change, the method is re-evaluated:

```ts
// To download and run this example:
// curl 'https://raw.githubusercontent.com/jeremiah-shaulov/sig/0.0.15/README.md' | perl -ne 's/^> //; $y=$1 if /^```(.)?/; print $_ if $y&&$m; $m=$y&&$m+/<example-ksv8>/' > /tmp/example-ksv8.ts
// deno run /tmp/example-ksv8.ts

import {sig} from 'jsr:@shaulov/sig@0.0.15';

const sigA = sig(['a', 'b', 'c', 'd', 'e']);
const sigI = sig(1);
const sigS = sigA.this.slice(sigI);

console.log(sigS.value); // ['b', 'c', 'd', 'e']

sigI.value = 2;
console.log(sigS.value); // ['c', 'd', 'e'] (recomputed with new argument)
```

Example with Map:

```ts
// To download and run this example:
// curl 'https://raw.githubusercontent.com/jeremiah-shaulov/sig/0.0.15/README.md' | perl -ne 's/^> //; $y=$1 if /^```(.)?/; print $_ if $y&&$m; $m=$y&&$m+/<example-rlut>/' > /tmp/example-rlut.ts
// deno run /tmp/example-rlut.ts

import {sig} from 'jsr:@shaulov/sig@0.0.15';

const sigMap = sig(new Map([['a', 1], ['b', 2], ['c', 3]]));
const sigKey = sig('a');
const sigValue = sigMap.this.get(sigKey);

console.log(sigValue.value); // 1

sigKey.value = 'b';
console.log(sigValue.value); // 2

sigMap.mut.set('b', 20);
console.log(sigValue.value); // 20
```

## Modifying Signal Values (`mut`)

Assigning to `mySig.value` or using `mySig.set()` triggers change notifications
(if the new value is not deeply equal to the previous value).
However, signals don't automatically detect mutations made directly to their values.
For in-place mutations (like array methods that modify the array),
use the `.mut` proxy to trigger change notifications:

```ts
const sigA = sig(['a', 'b', 'c']);
const sigS = sigA.this.slice(1);

console.log(sigS.value); // ['b', 'c']

// sigA.value.push('d') - will NOT trigger notification, so use:
sigA.mut.push('d'); // Notification triggered after push completes

console.log(sigS.value); // ['b', 'c', 'd']
```

The `.mut` proxy triggers notifications after the method completes, without comparison.
For async methods (returning Promise), notification occurs after resolution. For rejected
Promises, no notification is triggered.

## Changes Batching

Use [batch()](generated-doc/function.batch/README.md) to defer all dependent recomputations and onChange notifications until
a block of code completes. This improves performance when making multiple related changes:

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

[batch()](generated-doc/function.batch/README.md) works with both synchronous and asynchronous callbacks. For async callbacks,
batching continues until the returned Promise resolves or rejects
(this blocks notifications to all signals during that time).

## Converting Signals

There are several options to convert a signal to another signal.

1. Wrap it in a computation signal:

```ts
const sigA = sig(10);
const sigB = sig(() => sigA.value * 2);
```

This is the most obvious way, but it doesn't handle all signal states (busy, error) automatically.

2. Use [Sig.convert()](generated-doc/class.Sig/README.md#-convertvcompvalue-value-t--valueorpromisev-sigv) method:

```ts
const sigA = sig(10);
const sigB = sigA.convert(val => val * 2);
```

In this case, when `sigA` is error, `sigB` also enters error state, rather than applying the conversion function.
When `sigA` is busy, the conversion function is called when the value is resolved.

```ts
sigA.value = new Error('Failure');
console.log(sigB.error.value); // Error: Failure

sigA.value = Promise.resolve(20);
console.log(sigB.busy.value); // true

// After promise resolves:
console.log(sigB.value); // 40
```

## Using Internal Converters or Validating Signal Values

Another useful signal method is [Sig.setConverter()](generated-doc/class.Sig/README.md#-setconvertercompvalue-value-t--valueorpromiset-void), that allows to apply
a conversion function each time the signal is assigned with a new value.

First, the conversion function will be applied to the signal's current value.
If the value is a pending Promise, the conversion will be applied when it resolves.
Then, if this signal was a cumputed one, it will become regular.
Then, on each assignment, the conversion function will be applied to the assigned value
before storing it in the signal.

```ts
// To download and run this example:
// curl 'https://raw.githubusercontent.com/jeremiah-shaulov/sig/0.0.15/README.md' | perl -ne 's/^> //; $y=$1 if /^```(.)?/; print $_ if $y&&$m; $m=$y&&$m+/<example-ajdy>/' > /tmp/example-ajdy.ts
// deno run /tmp/example-ajdy.ts

import {sig} from 'jsr:@shaulov/sig@0.0.15';

const sigA = sig(1);
sigA.setConverter
(	v =>
	{	if (v > 10)
		{	throw new Error('Value must be less than or equal to 10');
		}
		return v;
	}
);

console.log(sigA.value); // 1
sigA.value = 5;
console.log(sigA.value); // 5
sigA.value = 15;
console.log(sigA.error.value?.message); // Value must be less than or equal to 10
sigA.value = -15;
console.log(sigA.value); // -15
```

## Sig Type

All signals are instances of the [Sig](generated-doc/class.Sig/README.md) class, or `ThisSig` proxy objects.
For both `instanceof Sig` returns true (even though `ThisSig` is not a class, but has `typeof(thisSig) == 'function'`).

Here are properties and methods of the [Sig](generated-doc/class.Sig/README.md) interface:

> `class` Sig\<T><br>
> {<br>
> &nbsp; &nbsp; 🔧 [constructor](generated-doc/class.Sig/README.md#-constructorvalueholder-valueholdert)(valueHolder: [ValueHolder](generated-doc/private.class.ValueHolder/README.md)\<T>)<br>
> &nbsp; &nbsp; 📄 `accessor` [value](generated-doc/class.Sig/README.md#-accessor-value-t): T<br>
> &nbsp; &nbsp; 📄 `get` [this](generated-doc/class.Sig/README.md#-get-this-thissigt)(): ThisSig\<T><br>
> &nbsp; &nbsp; 📄 `get` [mut](generated-doc/class.Sig/README.md#-get-mut-mutsigt)(): MutSig\<T><br>
> &nbsp; &nbsp; 📄 `get` [error](generated-doc/class.Sig/README.md#-get-error-sigerror)(): [Sig](generated-doc/class.Sig/README.md)\<Error><br>
> &nbsp; &nbsp; 📄 `get` [busy](generated-doc/class.Sig/README.md#-get-busy-sigboolean)(): [Sig](generated-doc/class.Sig/README.md)\<`boolean`><br>
> &nbsp; &nbsp; 📄 `get` [promise](generated-doc/class.Sig/README.md#-get-promise-promiset)(): Promise\<T><br>
> &nbsp; &nbsp; 📄 `get` [default](generated-doc/class.Sig/README.md#-get-default-t)(): T<br>
> &nbsp; &nbsp; ⚙ [set](generated-doc/class.Sig/README.md#-setcompvalue-valueorpromiset--compvaluet-cancelcomp-cancelcompt-void)(compValue: [ValueOrPromise](generated-doc/private.type.ValueOrPromise/README.md)\<T> | [CompValue](generated-doc/private.type.CompValue/README.md)\<T>, cancelComp?: [CancelComp](generated-doc/private.type.CancelComp/README.md)\<T>): `void`<br>
> &nbsp; &nbsp; ⚙ [convert](generated-doc/class.Sig/README.md#-convertvcompvalue-value-t--valueorpromisev-sigv)\<V, D=V>(compValue: (value: T) => [ValueOrPromise](generated-doc/private.type.ValueOrPromise/README.md)\<V>, defaultValue: D, setValue?: [SetValue](generated-doc/private.type.SetValue/README.md)\<V | D>, cancelComp?: [CancelComp](generated-doc/private.type.CancelComp/README.md)\<V | D>): [Sig](generated-doc/class.Sig/README.md)\<D `extends` V ? V : V | D><br>
> &nbsp; &nbsp; ⚙ [convert](generated-doc/class.Sig/README.md#-convertvcompvalue-value-t--valueorpromisev-sigv)\<V>(compValue: (value: T) => [ValueOrPromise](generated-doc/private.type.ValueOrPromise/README.md)\<V>): [Sig](generated-doc/class.Sig/README.md)\<V><br>
> &nbsp; &nbsp; ⚙ [setConverter](generated-doc/class.Sig/README.md#-setconvertercompvalue-value-t--valueorpromiset-void)(compValue: (value: T) => [ValueOrPromise](generated-doc/private.type.ValueOrPromise/README.md)\<T>): `void`<br>
> &nbsp; &nbsp; ⚙ [unsetConverter](generated-doc/class.Sig/README.md#-unsetconverter-void)(): `void`<br>
> &nbsp; &nbsp; ⚙ [subscribe](generated-doc/class.Sig/README.md#-subscribecallback-onchanget--weakrefonchanget-void)(callback: [OnChange](generated-doc/private.type.OnChange/README.md)\<T> | WeakRef\<[OnChange](generated-doc/private.type.OnChange/README.md)\<T>>): `void`<br>
> &nbsp; &nbsp; ⚙ [unsubscribe](generated-doc/class.Sig/README.md#-unsubscribecallback-onchanget--weakrefonchanget-void)(callback: [OnChange](generated-doc/private.type.OnChange/README.md)\<T> | WeakRef\<[OnChange](generated-doc/private.type.OnChange/README.md)\<T>>): `void`<br>
> &nbsp; &nbsp; ⚙ [toJSON](generated-doc/class.Sig/README.md#-tojson-t)(): T<br>
> &nbsp; &nbsp; ⚙ [\[Symbol.toPrimitive\]](generated-doc/class.Sig/README.md#-symboltoprimitive-string)(): `string`<br>
> }

## All Symbols that this Module Exports

- [Sig](generated-doc/class.Sig/README.md) signal class.
- [sig()](generated-doc/function.sig/README.md) factory function to create signals.
- [batch()](generated-doc/function.batch/README.md) function to batch changes.
- [\_deepEquals()](generated-doc/function._deepEquals/README.md) function that this module uses internally for deep equality checks.