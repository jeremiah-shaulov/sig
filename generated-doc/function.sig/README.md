# `function` sig

[Documentation Index](../README.md)

```ts
import {sig} from "jsr:@shaulov/sig@0.0.15"
```

`function` sig\<T>(compValue?: [ValueOrPromise](../private.type.ValueOrPromise/README.md)\<T> | [CompValue](../private.type.CompValue/README.md)\<T>, defaultValue?: T, setValue?: [SetValue](../private.type.SetValue/README.md)\<T>, cancelComp?: [CancelComp](../private.type.CancelComp/README.md)\<T>): [Sig](../class.Sig/README.md)\<T>

Creates a computed [Sig](../class.Sig/README.md).

```ts
let backingValue = 0;
const mySig = sig(() => backingValue, undefined, newValue => {backingValue = newValue});
```

------

Overload for when no default value is provided.

------

Creates a [Sig](../class.Sig/README.md) holding a boolean value.
Default value is automatically `false`.

------

Creates a [Sig](../class.Sig/README.md) holding a number value.
Default value is automatically `0`.

------

Creates a [Sig](../class.Sig/README.md) holding a bigint value.
Default value is automatically `0n`.

------

Creates a [Sig](../class.Sig/README.md) holding a string value.
Default value is automatically `''` (empty string).

------

Creates a [Sig](../class.Sig/README.md) that wraps another signal.
Equivalent to `sig(() => underlyingSignal)`, adopting the inner signal's state.

------

Creates a [Sig](../class.Sig/README.md) holding a static value, Promise, or Error.
Promises start in promise state, resolving to value or error state.

```ts
const sig1 = sig(42); // default: 0
const sig2 = sig(fetch('/endpoint').then(r => r.json())); // starts in promise state
const sig3 = sig<string | undefined>(new Error('Error')); // starts in error state
```

Primitive types (boolean/number/bigint/string) get automatic default values.

------

Creates a [Sig](../class.Sig/README.md) with no initial value (undefined).
Only valid when T allows undefined.

```ts
const sig1 = sig<undefined>(); // OK
const sig2 = sig<string | undefined>(); // OK
const sig3 = sig<string | undefined>(new Error('Error')); // OK - starts in error state
// const sig4 = sig<string>(); // Type error: string doesn't allow undefined
```

