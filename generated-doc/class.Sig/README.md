# `class` Sig\<T>

[Documentation Index](../README.md)

```ts
import {Sig} from "jsr:@shaulov/sig@0.0.18"
```

Type returned by the [sig()](../function.sig/README.md) function.
Signals are reactive values that automatically recompute when their dependencies change.

## Creating Signals

Signals can be created from:
- A static value (number, string, object, etc.)
- A Promise (signal starts in promise state)
- A computation function (synchronous or asynchronous)
- An Error object (signal starts in error state)
- Another signal (wraps the underlying signal)

Signals can hold values of any type. Each signal has a default value that is returned
when the signal is in error or promise state, or before the first computation.

Use the `sig()` function to create a signal:

```ts
const sig1 = sig(0); // default value is automatically 0
const sig2 = sig(0, NaN); // default value is NaN
const sig3 = sig(1, undefined); // default value is undefined
const sig4 = sig(fetch('/endpoint').then(res => res.json())); // starts in promise state
const sig5 = sig(() => sig1.value + 1); // computed signal, default value is undefined
const sig6 = sig(() => sig1.value + 1, 0); // computed signal with explicit default
const sig7 = sig<string | undefined>(new Error('Initial error')); // starts in error state
const sig8 = sig(sig2); // wraps another signal (can be set to something else later)
const sig9 = sig<string | undefined>(); // undefined initial and default value
// const sig10 = sig<string>(); // Error - default value is undefined, but string doesn't allow undefined
```

When creating a signal with a single argument of type boolean, number, bigint, or string,
the default value is automatically set to the appropriate zero value (`false`, `0`, `0n`, or `''`).

Otherwise, if no explicit default is provided, it defaults to `undefined`.

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

When a computation function returns another signal, the outer signal adopts
the inner signal's state (including errors):

```ts
const sigA = sig(1, undefined);
const sigB = sig(() => sigA.value); // when sigA is error, sigB returns undefined (sigA's default)
const sigC = sig(() => sigA); // when sigA is error, sigC also enters error state
```

Creating from an existing signal is equivalent to wrapping it in a computation function:

```ts
const sigA = sig(1);
const sigB = sig(sigA); // equivalent to sig(() => sigA)
```

## Reactivity

Signals automatically track dependencies and propagate changes:
- Computation functions are called lazily (only when the value is accessed)
- When dependencies change, dependent signals are marked for recomputation
- onChange listeners are invoked after changes, batched in the flush cycle

Dependencies are established when a signal accesses another signal's value:

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

Changes propagate through the dependency graph, triggering recomputations only when necessary.
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

To change signal's value, assign to `mySig.value`, or use `mySig.set()` (the latter also allows to set new cancelation function).

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

## This class has

- [constructor](#-constructorvalueholder-valueholdert)
- 7 properties:
[value](#-accessor-value-t),
[this](#-get-this-thissigt),
[mut](#-get-mut-mutsigt),
[error](#-get-error-sigerror),
[busy](#-get-busy-sigboolean),
[promise](#-get-promise-promiset),
[default](#-get-default-t)
- 9 methods:
[set](#-setcompvalue-valueorpromiset--compvaluet-cancelcomp-cancelcompt-void),
[convert](#-convertv-dvcompvalue-value-t--valueorpromisev-defaultvalue-d-setvalue-setvaluev--d-cancelcomp-cancelcompv--d-sigd-extends-v--v--v--d),
[convert](#-convertvcompvalue-value-t--valueorpromisev-sigv),
[setConverter](#-setconvertercompvalue-value-t--valueorpromiset-void),
[unsetConverter](#-unsetconverter-void),
[subscribe](#-subscribecallback-onchanget--weakrefonchanget-void),
[unsubscribe](#-unsubscribecallback-onchanget--weakrefonchanget-void),
[toJSON](#-tojson-t),
[\[Symbol.toPrimitive\]](#-symboltoprimitive-string)


#### 🔧 `constructor`(valueHolder: [ValueHolder](../private.class.ValueHolder/README.md)\<T>)

> This constructor is used internally. Use the [sig()](../function.sig/README.md) function to create signals.



#### 📄 `accessor` value: T

> `get`
> 
> Returns the current value of the signal.
> If in error state, returns the default value.
> In promise state, returns the last value or default.

> `set`
> 
> Sets a new value for the signal.
> Alias for the `set()` method.



#### 📄 `get` this(): ThisSig\<T>

> Returns a Proxy-wrapped version of this signal providing the `ThisSig` interface.
> Enables accessing properties and methods of the signal's value as signals.
> Property accesses are cached.



#### 📄 `get` mut(): MutSig\<T>

> Provides access to mutable methods that trigger change notifications.
> 
> Normally, signals detect changes only through `set()` calls using deep equality.
> Direct mutations don't trigger updates:
> 
> ```ts
> const sigA = sig(['a', 'b', 'c']);
> const sigS = sigA.slice(1);
> 
> console.log(sigS.value); // ['b', 'c']
> 
> sigA.value?.push('d'); // No change notification!
> console.log(sigS.value); // ['b', 'c'] -- unchanged!
> ```
> 
> Using `mut`, the signal triggers change events after method execution:
> 
> ```ts
> const sigA = sig(['a', 'b', 'c']);
> const sigS = sigA.this.slice(1);
> 
> console.log(sigS.value); // ['b', 'c']
> 
> sigA.mut.push('d'); // Triggers change notification
> console.log(sigS.value); // ['b', 'c', 'd']
> ```
> 
> If the called method returned a Promise, the notification is triggered after it resolves.
> For rejected Promises, no notification occurs.



#### 📄 `get` error(): [Sig](../class.Sig/README.md)\<Error>

> Returns a signal containing the Error object when in error state, otherwise `undefined`.
> This signal itself is never in promise state.



#### 📄 `get` busy(): [Sig](../class.Sig/README.md)\<`boolean`>

> Returns a signal that is `true` when this signal is in promise state, `false` otherwise.
> Useful for reactively tracking async computation state.



#### 📄 `get` promise(): Promise\<T>

> Returns the active Promise when the signal is in promise state, otherwise `undefined`.
> If the value is already computed, or if the signal is in error state, returns `undefined`.



#### 📄 `get` default(): T

> Returns the default value of the signal, as provided when the signal was created.



#### ⚙ set(compValue: [ValueOrPromise](../private.type.ValueOrPromise/README.md)\<T> | [CompValue](../private.type.CompValue/README.md)\<T>, cancelComp?: [CancelComp](../private.type.CancelComp/README.md)\<T>): `void`

> Sets a new value for the signal.
> This is the same as assigning to `mySig.value` (but allows to provide a cancellation callback as well).
> Accepts a static value, Error, Promise, computation function, or another signal.
> You can convert between static and computed signals freely.
> 
> Exception: Signals created with a value setter cannot change their computation function.
> For these signals, `set()` invokes the setter with the new value.
> 
> 🎚️ Parameter **compValue**:
> 
> New value for the signal. Same types as [sig()](../function.sig/README.md) constructor.
> 
> 🎚️ Parameter **cancelComp**:
> 
> Optional callback to cancel an ongoing async computation when new computation starts. Only used when `compValue` is a computation function. If not provided, any existing cancelation callback is removed.



#### ⚙ convert\<V, D=V>(compValue: (value: T) => [ValueOrPromise](../private.type.ValueOrPromise/README.md)\<V>, defaultValue: D, setValue?: [SetValue](../private.type.SetValue/README.md)\<V | D>, cancelComp?: [CancelComp](../private.type.CancelComp/README.md)\<V | D>): [Sig](../class.Sig/README.md)\<D `extends` V ? V : V | D>

> Creates a new signal by applying a transformation function to this signal's value.
> The conversion function receives the value and returns the transformed result.
> Promises and errors propagate through the conversion:
> - Promise state: Conversion applied after promise resolves
> - Error state: Error propagates to the converted signal
> 
> ```ts
> const pathname = sig('/path/to/file.txt');
> const filename = pathname.convert(p => p.split('/').pop() || '', '');
> console.log(filename.value); // 'file.txt'
> ```
> 
> This is equivalent to:
> 
> ```ts
> const pathname = sig('/path/to/file.txt');
> const filename = sig
> (	() =>
> 	{	const e = pathname.error.value;
> 		if (e)
> 		{	throw e;
> 		}
> 		const p = pathname.promise;
> 		if (p)
> 		{	return p.then
> 			(	value => value.split('/').pop() || ''
> 			);
> 		}
> 		else
> 		{	return pathname.value.split('/').pop() || '';
> 		}
> 	},
> 	''
> );
> ```



#### ⚙ convert\<V>(compValue: (value: T) => [ValueOrPromise](../private.type.ValueOrPromise/README.md)\<V>): [Sig](../class.Sig/README.md)\<V>

> Overload for when no default value is provided.



#### ⚙ setConverter(compValue: (value: T) => [ValueOrPromise](../private.type.ValueOrPromise/README.md)\<T>): `void`

> Converts this signal to use getter (computation function), and setter.
> First time the signal's value is requested, it's computed as usual, and the result is stored in a hidden static variable.
> Then the `compValue` is applied to that variable to compute the new signal value.
> 
> After the first computation, the signal becomes decoupled from its original dependencies, and allows only setting static values, and getting them with conversion function applied.
> When the signal's `set()` method is called, it updates the hidden static variable, and triggers recomputation by applying `compValue` to the new variable value.
> 
> ```ts
> const sigA = sig(1);
> sigA.setConverter
> (	v =>
> 	{	if (v > 10)
> 		{	throw new Error('Value must be less than or equal to 10');
> 		}
> 		return v;
> 	}
> );
> 
> console.log(sigA.value); // 1
> sigA.value = 5;
> console.log(sigA.value); // 5
> sigA.value = 15;
> console.log(sigA.error.value?.message); // Value must be less than or equal to 10
> sigA.value = -15;
> console.log(sigA.value); // -15
> ```



#### ⚙ unsetConverter(): `void`

> Removes a previously set converter function, reverting the signal to a regular signal.
> If the signal has a converter set via [setConverter()](../class.Sig/README.md#-setconvertercompvalue-value-t--valueorpromiset-void), this method removes it
> and restores the signal to its pre-converter state with the current computed value.
> 
> After calling this method, the signal behaves as a regular static signal,
> and `set()` calls will directly replace the value instead of invoking the converter.
> 
> ```ts
> const sigA = sig(5);
> sigA.setConverter(v => v * 2);
> console.log(sigA.value); // 10
> 
> sigA.unsetConverter();
> console.log(sigA.value); // 10 (still the converted value)
> 
> sigA.value = 7;
> console.log(sigA.value); // 7 (no longer doubled)
> ```
> 
> If no converter is set, this method has no effect.



#### ⚙ subscribe(callback: [OnChange](../private.type.OnChange/README.md)\<T> | WeakRef\<[OnChange](../private.type.OnChange/README.md)\<T>>): `void`

> Registers a callback invoked when the signal's value changes.
> 
> Signals normally compute lazily. Adding a listener makes the signal actively
> recompute whenever dependencies change.
> 
> When adding the first listener to a computed signal, whose value is not yet computed or stale,
> this triggers immediate computation to establish dependencies.
> After the computation, the callback can be invoked if the value differs from default.
> 
> 🎚️ Parameter **callback**:
> 
> Function to call on value changes. Can be a direct reference or WeakRef.



#### ⚙ unsubscribe(callback: [OnChange](../private.type.OnChange/README.md)\<T> | WeakRef\<[OnChange](../private.type.OnChange/README.md)\<T>>): `void`

> Removes a previously added onChange listener.



#### ⚙ toJSON(): T

> For `JSON.stringify()`.
> Returns the current value of the signal (`this.value`).



#### ⚙ \[Symbol.toPrimitive](): `string`

> Automatic conversion to string.
> Returns word "Sig" with appended computation function converted to string, or value for non-computed signals.



