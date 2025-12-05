import {deepEquals} from './deep_equals.ts';
import type {ThisSig} from './this_sig.ts';

const _id = Symbol();
const _hasOnchangeVersion = Symbol();
const _compValue = Symbol();
const _defaultValue = Symbol();
const _flags = Symbol();
const _value = Symbol();
const _promiseOrError = Symbol();
const _dependOnMe = Symbol();
const _iDependOn = Symbol();
const _onChangeCallbacks = Symbol();
const _optionalFields = Symbol();
const _unwrap = Symbol();

/**	The currently evaluating signal, used to track dependencies during computation.

	When a signal starts computation, it becomes the evalContext.
	Other signals accessed during computation register the evalContext as a dependent.
	When the computation ends, evalContext is restored to its previous value.

	This mechanism ensures that nested signal computations correctly track
	their dependencies to the appropriate parent computation.
 **/
let evalContext: Sig<unknown>|undefined;

/**	Callbacks scheduled to be invoked when signals change.
	These are batched and executed during the flush cycle to ensure consistent state.
 **/
const pendingOnChange = new Array<OnChangeRecord<Any>>;

/**	Signals scheduled for recomputation after their dependencies changed.
	These are processed in order during the flush cycle, with the cause signal provided for context.
 **/
const pendingRecomp = new Array<{subj: Sig<unknown>, knownToBeChanged: boolean, cause: Sig<Any>}>;

let batchLevel = 0;

let idEnum = 0;

let hasOnchangeVersion = 1;

// deno-lint-ignore no-explicit-any
type Any = any;

/**	A value that can be T, a Sig of T, or an Error.
	This type represents the possible forms that a signal value or computation result can take.
 **/
type Value<T> = T|Sig<T>|Error;

/**	A value or a Promise that resolves to a value.
	This allows signal computations to be either synchronous or asynchronous.
 **/
type ValueOrPromise<T> = Value<T>|Promise<Value<T>>;

/**	Computation function for signals.
	The `sync()` callback allows recording dependencies after async operations.
	By default, dependencies are tracked only until the first `await` point.
	Call `sync()` after each `await` to resume dependency tracking until the next `await`.

	@param sync Callback to mark synchronization points after `await` to resume dependency tracking.
	@param cause The signal that triggered this recomputation, if any.
 **/
type CompValue<T> = (sync: () => void, cause?: Sig<unknown>) => ValueOrPromise<T>;

/**	Callback function to set a new value for a computed signal.
	Used when creating computed signals that need custom logic for updating their backing value.
 **/
type SetValue<T> = (value: T) => void;

/**	Callback function to cancel an ongoing async computation.
	Invoked when a new computation starts before the previous promise resolves,
	allowing cleanup of resources or aborting pending async operations.

	@param promise The promise from the ongoing computation that is being superseded.
 **/
type CancelComp<T> = (promise: Promise<T>) => void;

/**	Callback function invoked when a signal's value changes.
	Called with the signal as `this` context and receives the previous value or Error.

	@param prevValue The previous value or Error that the signal held before the change.
 **/
type OnChange<T> = (this: Sig<T>, prevValue: T|Error) => void;

/**	Internal record for pending onChange callbacks.
	Used to batch and schedule onChange notifications during the flush cycle.
 **/
type OnChangeRecord<T> = {callback: OnChange<T>, thisArg: Sig<T>, prevValue: T|Error};

type MutSig<T> =
(	T extends Record<string|symbol, Any> ?
		{[K in keyof T as K extends number ? never : K]: T[K] extends ((...args: Any[]) => Any) ? T[K] : never} :
	T extends Record<infer RK, infer RV>|null|undefined ?
		{[K in RK as K extends number ? never : K]: Record<RK, RV>[K] extends ((...args: Any[]) => Any) ? Record<RK, RV>[K]|undefined : never} :
		object
);

/**	Processes all pending signal recomputations and onChange callbacks.
	This ensures that signals are updated in the correct order and all listeners are notified.
 **/
function flushPendingOnChange()
{	if (!batchLevel && !evalContext && (pendingRecomp.length>0 || pendingOnChange.length>0))
	{	batchLevel++;
		while (true)
		{	for (let i=0; i<pendingRecomp.length; i++)
			{	const {subj, knownToBeChanged, cause} = pendingRecomp[i];
				recomp(subj, CompType.None, knownToBeChanged, cause);
			}
			pendingRecomp.length = 0;
			for (let i=0; i<pendingOnChange.length; i++)
			{	const {callback, thisArg, prevValue} = pendingOnChange[i];
				try
				{	callback.call(thisArg, prevValue);
				}
				catch (e)
				{	console.error('Error in signal onChange callback:', e);
				}
			}
			pendingOnChange.length = 0;
			if (!pendingRecomp.length)
			{	break;
			}
		}
		batchLevel--;
	}
}

/**	Flags indicating which aspects of a signal's state were observed during computation.
	Used as a bitmask to track what type of changes should trigger recomputation.

	- `None`: No observation occurred.
	- `Value`: The signal's value was accessed via `sig.value`.
	- `Promise`: The signal's promise state was accessed via `sig.promise`.
	- `Error`: The signal's error state was accessed via `sig.error`.

	When a dependency changes, only signals that observed the changed aspect are recomputed.
 **/
const enum CompType
{	None = 0,
	Value = 1,     // Observed the signal's value
	Promise = 2,   // Observed the signal's promise state
	Error = 4,     // Observed the signal's error state
}

/**	Internal flags tracking signal state.

	`flags & Flags.ValueStatusMask` - Computation status:
	- `Value`: The signal's value is current and valid.
	- `WantRecomp`: The signal is stale and needs recomputation.
	- `RecompInProgress`: Currently computing, prevent redundant recomputations.

	`flags & Flags.IsErrorSignal` - Whether this signal treats Error as a value (for sig.error).
 **/
const enum Flags
{	// Value status:
	ValueStatusMask = 3,
	Value = 0,              // Value is current and valid
	WantRecomp = 1,         // Value is stale and needs recomputation
	RecompInProgress = 2,   // Currently computing a new value

	// Signal type:
	IsErrorSignal = 4,	    // Signal treats Error as a value
}

class OptionalFields<T>
{	/**	Optional setter called when setting a new value on a computed signal.
	 **/
	setValue: SetValue<unknown> | undefined;

	/**	Optional callback to cancel ongoing async computations
	 **/
	cancelComp: CancelComp<unknown> | undefined;

	/**	Cached proxy-wrapped version of this signal providing the `ThisSig` interface.
	 **/
	this: ThisSig<T> | undefined;

	/**	If this signal represents a property of another signal, reference to the parent.
	 **/
	propOfSignal: Sig<Any> | undefined;

	/**	Path to follow from the parent signal (`propOfSignal`) to reach this property.
	 **/
	propOfSignalPath: Array<string|symbol> | undefined;
}

/**	Type returned by the {@link sig()} function.
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

	@template T Type of the value stored in the signal.
 **/
export class Sig<T>
{	// symbol properties are private

	/** @ignore */
	[_id] = idEnum++;

	/** @ignore */
	[_hasOnchangeVersion] = 0;

	/**	Static value, Promise, Error, or computation function that produces the signal's value.
		@ignore
	 **/
	[_compValue]: Value<T>|Promise<T>|CompValue<T>;

	/**	Default value returned when signal is in error/promise state or uninitialized.
		@ignore
	 **/
	[_defaultValue]: T;

	/**	Whether the signal needs recomputation, and other internal state flags.
		@ignore
	 **/
	[_flags]: Flags;

	/**	Current value. If in promise state, this holds the last value or default. If in error state, holds the default value.
		@ignore
	 **/
	[_value]: T;

	/**	Active promise if the signal is in promise state, Error object if the signal is in error state, undefined otherwise.
		@ignore
	 **/
	[_promiseOrError]: Promise<T> | Error | undefined;

	/**	Weakly-referenced list of signals that depend on this signal.
		When this signal changes, these dependent signals are marked for recomputation.
		@ignore
	 **/
	[_dependOnMe]: Map<number, {subj: WeakRef<Sig<unknown>>, compType: CompType}> | undefined;

	/**	Signals that this signal depends on, along with what aspects (value/promise/error) were observed.
		When a dependency changes, we check if the observed aspect changed to determine if recomputation is needed.
		@ignore
	 **/
	[_iDependOn]: Sig<Any>[] | undefined;

	/**	Callbacks to invoke when the signal's value changes.
		@ignore
	 **/
	[_onChangeCallbacks]: Array<OnChange<unknown> | WeakRef<OnChange<unknown>>> | undefined;

	/**	Optional fields.
		@ignore
	 **/
	[_optionalFields]: OptionalFields<T> | undefined;

	/**	This constructor is used internally. Use the {@link sig()} function to create signals.
	 **/
	constructor(compValue: ValueOrPromise<T>|CompValue<T>, defaultValue: T, setValue?: SetValue<T>, cancelComp?: CancelComp<T>, isErrorSignal?: boolean)
	{	this[_compValue] = typeof(compValue)=='function' ? compValue : convPromise(compValue);
		this[_defaultValue] = defaultValue;
		this[_flags] = Flags.WantRecomp | (isErrorSignal ? Flags.IsErrorSignal : 0);
		this[_value] = defaultValue;
		const useSetValue = typeof(compValue)=='function' && !(compValue instanceof Sig) ? setValue as SetValue<unknown> : undefined;
		if (useSetValue || cancelComp)
		{	this[_optionalFields] = new OptionalFields<T>;
			this[_optionalFields].setValue = useSetValue;
			this[_optionalFields].cancelComp = cancelComp as CancelComp<unknown>|undefined;
		}
	}

	/**	If this Sig is wrapped in a Proxy (as returned by `mySig.this`), returns the underlying Sig.
		The actual unwrap happens in the Proxy handler, when it accesses any property existing on the Sig.
		@ignore
	 **/
	get [_unwrap]()
	{	return this;
	}

	/**	Returns the current value of the signal.
		If in error state, returns the default value.
		In promise state, returns the last value or default.
	 **/
	get value(): T
	{	recomp(this, CompType.Value) && flushPendingOnChange();
		return this[_value];
	}

	/**	Sets a new value for the signal.
		Alias for the `set()` method.
	 **/
	set value(value: ValueOrPromise<T>|CompValue<T>)
	{	this.set(value);
	}

	/**	Sets a new value for the signal.
		This is the same as assigning to `mySig.value` (but allows to provide a cancellation callback as well).
		Accepts a static value, Error, Promise, computation function, or another signal.
		You can convert between static and computed signals freely.

		Exception: Signals created with a value setter cannot change their computation function.
		For these signals, `set()` invokes the setter with the new value.

		@param compValue New value for the signal. Same types as {@link sig()} constructor.
		@param cancelComp Optional callback to cancel an ongoing async computation when new computation starts. Only used when `compValue` is a computation function. If not provided, any existing cancelation callback is removed.
	 **/
	set(compValue: ValueOrPromise<T>|CompValue<T>, cancelComp?: CancelComp<T>)
	{	if (this[_optionalFields]?.setValue)
		{	if (typeof(compValue)=='function' || compValue instanceof Sig)
			{	throw new Error('Cannot override computation function for signals with value setters');
			}
			doSetValue(this, convPromise(compValue), false, undefined, true) && flushPendingOnChange();
		}
		else
		{	// Cancel the current computation with the OLD cancelComp before replacing it
			if (this[_promiseOrError] instanceof Promise)
			{	this[_optionalFields]?.cancelComp?.(this[_promiseOrError]);
			}
			this[_compValue] = typeof(compValue)=='function' ? compValue : convPromise(compValue);
			if (typeof(compValue)=='function' && !(compValue instanceof Sig))
			{	this[_optionalFields] ??= new OptionalFields<T>;
				this[_optionalFields].cancelComp = cancelComp as CancelComp<unknown>;
			}
			else if (this[_optionalFields])
			{	this[_optionalFields].cancelComp = undefined;
			}
			this[_flags] = Flags.WantRecomp | (this[_flags] & Flags.IsErrorSignal);
			recomp(this, CompType.None, false, undefined, true) && flushPendingOnChange();
		}
	}

	/**	Returns a Proxy-wrapped version of this signal providing the `ThisSig` interface.
		Enables accessing properties and methods of the signal's value as signals.
		Property accesses are cached.
	**/
	get this(): ThisSig<T>
	{	if (!this[_optionalFields]?.this)
		{	const propsCache = new Map<string|symbol, WeakRef<Sig<unknown>>>;
			this[_optionalFields] ??= new OptionalFields<T>;
			this[_optionalFields].this ??= new Proxy
			(	sig,
				{	apply: (_target, _thisArg: unknown, args: unknown[]) => sigApply(this, args),

					// `prop` in `Sig`, but not in (some arbitrary) Function object
					has: (_target, prop) => prop in this && !(prop in sig),

					get: (_target, prop) =>
					{	if (prop in this && !(prop in sig))
						{	// Regular property or method, like `set`, `convert`, etc.
							const propValue = (this as Any)[prop];
							return typeof(propValue)!='function' || propValue instanceof Sig ? propValue : propValue.bind(this);
						}
						let cur = propsCache.get(prop)?.deref();
						if (!cur)
						{	cur = getProp(this, prop);
							propsCache.set(prop, new WeakRef(cur));
						}
						return cur;
					},

					set: (_target, prop, newValue) =>
					{	if (prop !== 'value')
						{	throw new Error('Cannot set this property');
						}
						this.set(newValue);
						return true;
					},

					// So `instanceof Sig` works
					getPrototypeOf: () => Sig.prototype,
				}
			) as Any as ThisSig<T>;
		}
		return this[_optionalFields].this;
	}

	/**	Provides access to mutable methods that trigger change notifications.

		Normally, signals detect changes only through `set()` calls using deep equality.
		Direct mutations don't trigger updates:

		```ts
		const sigA = sig(['a', 'b', 'c']);
		const sigS = sigA.slice(1);

		console.log(sigS.value); // ['b', 'c']

		sigA.value?.push('d'); // No change notification!
		console.log(sigS.value); // ['b', 'c'] -- unchanged!
		```

		Using `mut`, the signal triggers change events after method execution:

		```ts
		const sigA = sig(['a', 'b', 'c']);
		const sigS = sigA.this.slice(1);

		console.log(sigS.value); // ['b', 'c']

		sigA.mut.push('d'); // Triggers change notification
		console.log(sigS.value); // ['b', 'c', 'd']
		```

		If the called method returned a Promise, the notification is triggered after it resolves.
		For rejected Promises, no notification occurs.
	 **/
	get mut(): MutSig<T>
	{	return new Proxy
		(	{},
			{	get: (_target, prop) =>
				{	const {value} = this;
					const method = value!=null && !(value instanceof Error) ? (value as Any)[prop] : undefined;
					if (typeof(method) != 'function')
					{	throw new Error(`Not a method`);
					}
					const notify = (res?: Any) =>
					{	invokeOnChangeCallbacks(this, CompType.Value, value);
						flushPendingOnChange();
						return res;
					};
					return (...args: unknown[]) =>
					{	const res = method.apply(value, args);
						if (res instanceof Promise)
						{	return res.then(notify);
						}
						notify();
						return res;
					};
				}
			}
		) as Any;
	}

	/**	Returns the active Promise when the signal is in promise state, otherwise `undefined`.
		If the value is already computed, or if the signal is in error state, returns `undefined`.
	 **/
	get promise(): Promise<T>|undefined
	{	recomp(this, CompType.Promise) && flushPendingOnChange();
		return this[_promiseOrError] instanceof Promise ? this[_promiseOrError] : undefined;
	}

	/**	Returns a signal that is `true` when this signal is in promise state, `false` otherwise.
		Useful for reactively tracking async computation state.
	 **/
	get busy(): Sig<boolean>
	{	return new Sig
		(	() =>
			{	recomp(this, CompType.Promise) && flushPendingOnChange();
				return this[_promiseOrError] instanceof Promise;
			},
			false
		);
	}

	/**	Returns a signal containing the Error object when in error state, otherwise `undefined`.
		This signal itself is never in promise state.
	 **/
	get error(): Sig<Error|undefined>
	{	return new Sig<Error|undefined>
		(	() => sigError(this),
			undefined,
			undefined,
			undefined,
			true
		);
	}

	/**	Returns the default value of the signal, as provided when the signal was created.
	 **/
	get default(): T
	{	return this[_defaultValue];
	}

	/**	Creates a new signal by applying a transformation function to this signal's value.
		The conversion function receives the value and returns the transformed result.
		Promises and errors propagate through the conversion:
		- Promise state: Conversion applied after promise resolves
		- Error state: Error propagates to the converted signal

		```ts
		const pathname = sig('/path/to/file.txt');
		const filename = pathname.convert(p => p.split('/').pop() || '', '');
		console.log(filename.value); // 'file.txt'
		```

		This is equivalent to:

		```ts
		const pathname = sig('/path/to/file.txt');
		const filename = sig
		(	() =>
			{	const e = pathname.error.value;
				if (e)
				{	throw e;
				}
				const p = pathname.promise;
				if (p)
				{	return p.then
					(	value => value.split('/').pop() || ''
					);
				}
				else
				{	return pathname.value.split('/').pop() || '';
				}
			},
			''
		);
		```
	 **/
	convert<V, D=V>(compValue: (value: T) => ValueOrPromise<V>, defaultValue: D, setValue?: SetValue<V|D>, cancelComp?: CancelComp<V|D>): Sig<D extends V ? V : V|D>;
	/**	Overload for when no default value is provided.
	 **/
	convert<V>(compValue: (value: T) => ValueOrPromise<V>): Sig<V|undefined>;
	convert<V, D=V>(compValue: (value: T) => ValueOrPromise<V>, defaultValue?: D, setValue?: SetValue<V|D>, cancelComp?: CancelComp<V|D>): Sig<D extends V ? V : V|D>
	{	return sig<V, D>
		(	() => sigConvert(this, compValue),
			defaultValue as D,
			setValue,
			cancelComp
		);
	}

	/**	Converts this signal to use getter (computation function), and setter.
		First time the signal's value is requested, it's computed as usual, and the result is stored in a hidden static variable.
		Then the `compValue` is applied to that variable to compute the new signal value.

		After the first computation, the signal becomes decoupled from its original dependencies, and allows only setting static values, and getting them with conversion function applied.
		When the signal's `set()` method is called, it updates the hidden static variable, and triggers recomputation by applying `compValue` to the new variable value.

		```ts
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
	 **/
	setConverter(compValue: (value: T) => ValueOrPromise<T>)
	{	const vh = new Sig(this[_compValue], this[_defaultValue], undefined, this[_optionalFields]?.cancelComp)
		this[_compValue] = () => sigConvert(vh, compValue);
		this[_optionalFields] ??= new OptionalFields<T>;
		this[_optionalFields].setValue = ((newValue: T) => vh.set(newValue)) as SetValue<unknown>;
		this[_optionalFields].cancelComp = undefined;
		this[_flags] = Flags.WantRecomp | (this[_flags] & Flags.IsErrorSignal);
	}

	/**	Registers a callback invoked when the signal's value changes.

		Signals normally compute lazily. Adding a listener makes the signal actively
		recompute whenever dependencies change.

		Adding the first listener to an uncomputed signal triggers immediate computation
		to establish dependencies. After the computation, the callback can be invoked if the value differs from default.

		@param callback Function to call on value changes. Can be a direct reference or WeakRef.
	 **/
	subscribe(callback: OnChange<T>|WeakRef<OnChange<T>>)
	{	const onChangeCallbacks = this[_onChangeCallbacks];
		if (onChangeCallbacks)
		{	const callbackFunc = callback instanceof WeakRef ? callback.deref() : callback;
			if (traverseWeak(onChangeCallbacks).some(c => c == callbackFunc))
			{	return;
			}
			onChangeCallbacks.push(callback as Any);
		}
		else
		{	this[_onChangeCallbacks] = [callback as Any];
		}
		hasOnchangeVersion++;
		recomp(this, CompType.None) && flushPendingOnChange(); // this is needed if computation never called for this signal, to record dependencies
	}

	/**	Removes a previously added onChange listener.
	 **/
	unsubscribe(callback: OnChange<T>|WeakRef<OnChange<T>>)
	{	const onChangeCallbacks = this[_onChangeCallbacks];
		if (onChangeCallbacks)
		{	const callbackFunc = callback instanceof WeakRef ? callback.deref() : callback;
			for (let i=0; i<onChangeCallbacks.length; i++)
			{	const cb = onChangeCallbacks[i];
				if (cb instanceof WeakRef ? cb.deref()==callbackFunc : cb==callbackFunc)
				{	onChangeCallbacks[i] = onChangeCallbacks[onChangeCallbacks.length - 1];
					onChangeCallbacks.length--;
					hasOnchangeVersion++;
					break;
				}
			}
		}
	}

	/**	Automatic conversion to string.
		Returns word "Sig" with appended computation function converted to string, or value for non-computed signals.
	 **/
	[Symbol.toPrimitive]()
	{	return `Sig ${this[_compValue]}`;
	}

	/**	For `JSON.stringify()`.
		Returns the current value of the signal (`this.value`).
	 **/
	toJSON()
	{	return this.value;
	}
}

function addMyselfAsDepToBeingComputed<T>(that: Sig<T>, compType: CompType)
{	if (compType && evalContext)
	{	const depRef = that[_dependOnMe]?.get(evalContext[_id]);
		if (!depRef)
		{	if (checkCircular(that, evalContext))
			{	throw new Error('Circular dependency detected between signals');
			}
			that[_dependOnMe] ??= new Map;
			that[_dependOnMe].set(evalContext[_id], {subj: new WeakRef(evalContext), compType});
			if (!evalContext[_iDependOn]?.includes(that))
			{	evalContext[_iDependOn] ??= [];
				evalContext[_iDependOn].push(that);
			}
		}
		else
		{	depRef.compType |= compType;
		}
	}
}

function checkCircular<T>(that: Sig<T>, target: Sig<Any>, visited=new Set<Sig<Any>>): boolean|undefined
{	if (that == target)
	{	return true;
	}
	if (visited.has(that))
	{	return false;
	}
	visited.add(that);
	return that[_iDependOn]?.some(dep => checkCircular(dep, target, visited));
}

function removeMyselfAsDepFromUsedSignals<T>(that: Sig<T>)
{	if (that[_iDependOn])
	{	for (const usedSig of that[_iDependOn])
		{	usedSig[_dependOnMe]?.delete(that[_id]);
		}
		that[_iDependOn].length = 0;
	}
}

function recomp<T>(that: Sig<T>, compType: CompType, knownToBeChanged=false, cause?: Sig<unknown>, noCancelComp=false): CompType
{	addMyselfAsDepToBeingComputed(that, compType);
	if ((that[_flags] & Flags.ValueStatusMask) == Flags.WantRecomp)
	{	that[_flags] = Flags.RecompInProgress | (that[_flags] & Flags.IsErrorSignal);
		let newValue: T|Promise<T>|Error;
		// 1. Remove myself as dependency from signals used in my computation function. Later `compValue` will readd myself to those signals for which computation triggers
		removeMyselfAsDepFromUsedSignals(that);
		// 2. Call `compValue`
		const compValue = that[_compValue];
		if (typeof(compValue)=='function' || compValue instanceof Sig)
		{	const prevEvalContext = evalContext;
			evalContext = that as Sig<unknown>;
			try
			{	if (!noCancelComp && that[_promiseOrError] instanceof Promise)
				{	that[_optionalFields]?.cancelComp?.(that[_promiseOrError]);
				}
				const result = compValue instanceof Sig ? compValue : (compValue as CompValue<T>)(() => sigSync(that), cause);
				newValue = result instanceof Sig ? result.promise ?? sigError(result[_unwrap]) ?? result.value : convPromise(result);
			}
			catch (e)
			{	newValue = e instanceof Error ? e : new Error(e+'');
			}
			evalContext = prevEvalContext;

		}
		else
		{	newValue = compValue;
		}
		// 3. Add onChangeCallbacks to pending (if changed)
		that[_flags] = Flags.Value | (that[_flags] & Flags.IsErrorSignal);
		return doSetValue(that, newValue, knownToBeChanged);
	}
	return CompType.None;
}

function sigSync<T>(that: Sig<T>)
{	const compSubj = that as Sig<unknown>;
	if (compSubj != evalContext)
	{	const prevEvalContext = evalContext;
		evalContext = compSubj;
		that[_flags] = Flags.RecompInProgress | (that[_flags] & Flags.IsErrorSignal);
		queueMicrotask
		(	() =>
			{	evalContext = prevEvalContext;
				that[_flags] = Flags.Value | (that[_flags] & Flags.IsErrorSignal);
			}
		);
	}
}

function doSetValue<T>(that: Sig<T>, newValue: T|Promise<T>|Error, knownToBeChanged=false, ofValuePromise?: Promise<T>, bySetter=false): CompType
{	let changeType = CompType.None;
	if (!ofValuePromise || ofValuePromise===that[_promiseOrError]) // ignore result of old promise if `that.valuePromise` was set to a new promise
	{	const prevError = that[_promiseOrError] instanceof Error ? that[_promiseOrError] : undefined;
		const prevValue = that[_value];
		if (newValue instanceof Promise)
		{	if (prevError)
			{	changeType = CompType.Error|CompType.Promise; // error -> promise
			}
			else if (!that[_promiseOrError])
			{	changeType = CompType.Value|CompType.Promise; // value -> promise
			}
			const promise = newValue;
			that[_promiseOrError] = promise;
			promise.then
			(	v =>
				{	doSetValue(that, v, knownToBeChanged, promise, bySetter);
				},
				e =>
				{	doSetValue(that, e instanceof Error ? e : new Error(e+''), knownToBeChanged, promise, bySetter);
				}
			);
		}
		else
		{	let newError = !(that[_flags] & Flags.IsErrorSignal) && newValue instanceof Error ? newValue : undefined;
			if (bySetter && !newError)
			{	try
				{	that[_optionalFields]?.setValue?.(newValue);
					that[_flags] = Flags.WantRecomp | (that[_flags] & Flags.IsErrorSignal);
					return recomp(that, CompType.None);
				}
				catch (e)
				{	newError = e instanceof Error ? e : new Error(e+'');
				}
			}
			if (newError)
			{	if (that[_promiseOrError] instanceof Promise)
				{	changeType = CompType.Promise|CompType.Error; // promise -> error
				}
				else if (!prevError)
				{	changeType = CompType.Value|CompType.Error; // value -> error
				}
				else if (newError.constructor!=prevError.constructor || newError.message!=prevError.message)
				{	changeType = CompType.Error; // error -> error
				}
			}
			else
			{	if (that[_promiseOrError] instanceof Promise)
				{	changeType = CompType.Promise|CompType.Value; // promise -> value
				}
				else if (prevError)
				{	changeType = CompType.Error|CompType.Value; // error -> value
				}
				else if (knownToBeChanged || !deepEquals(newValue, prevValue))
				{	changeType = CompType.Value; // value -> value
				}
			}
			that[_value] = newError ? that[_defaultValue] : newValue as T;
			that[_promiseOrError] = newError;
			if (that[_compValue] instanceof Promise)
			{	that[_compValue] = newValue as T; // unwrap the promise once it's resolved
			}
		}
		if (changeType)
		{	invokeOnChangeCallbacks(that, changeType, prevError ?? prevValue);
			if (ofValuePromise)
			{	flushPendingOnChange();
			}
		}
	}
	return changeType;
}

function invokeOnChangeCallbacks<T>(that: Sig<T>, changeType: CompType, prevValue?: T|Error, knownToBeChanged=false)
{	const onChangeCallbacks = that[_onChangeCallbacks];
	if (onChangeCallbacks)
	{	for (const callback of traverseWeak(onChangeCallbacks))
		{	if (!pendingOnChange.some(p => p.callback==callback))
			{	pendingOnChange.push({callback, thisArg: that, prevValue});
			}
		}
	}
	if (that[_dependOnMe])
	{	for (const [id, {subj, compType}] of that[_dependOnMe])
		{	const dep = subj.deref();
			if (!dep)
			{	that[_dependOnMe].delete(id);
			}
			else if ((compType & changeType) && (dep[_flags] & Flags.ValueStatusMask) != Flags.RecompInProgress)
			{	dep[_flags] = Flags.WantRecomp | (dep[_flags] & Flags.IsErrorSignal);
				if (hasOnchange(dep) && !pendingRecomp.some(p => p.subj == dep))
				{	pendingRecomp.push({subj: dep, knownToBeChanged, cause: that});
				}
			}
		}
	}
}

function hasOnchange<T>(that: Sig<T>): boolean
{	if (Math.abs(that[_hasOnchangeVersion]) != hasOnchangeVersion)
	{	const yes = that[_onChangeCallbacks]?.length || that[_dependOnMe]?.values().some
		(	depRef =>
			{	const dep = depRef.subj.deref();
				return dep && hasOnchange(dep);
			}
		);
		that[_hasOnchangeVersion] = yes ? hasOnchangeVersion : -hasOnchangeVersion;
	}
	return that[_hasOnchangeVersion] > 0;
}

function convPromise<V, T>(compValue: V|Promise<Value<T>>): V|Promise<T>
{	return !(compValue instanceof Promise) ? compValue : compValue.then
	(	r =>
		{	const result = r instanceof Sig ? r.promise ?? sigError(r[_unwrap]) ?? r.value : r;
			if (result instanceof Error)
			{	throw result;
			}
			return result;
		}
	);
}

function sigError<T>(that: Sig<T>)
{	recomp(that, CompType.Error) && flushPendingOnChange();
	return that[_promiseOrError] instanceof Error ? that[_promiseOrError] : undefined;
}

function sigApply<T>(that: Sig<T>, args?: unknown[]): Any
{	const parentSig = that[_optionalFields]?.propOfSignal;
	if (parentSig && typeof(that.value) == 'function') // if is a method of a parent signal's value
	{	const path = that[_optionalFields]!.propOfSignalPath!;
		const useArgs = args ?? [];
		return parentSig.convert
		(	v => followPath(v, path, path.length-1)?.[path[path.length - 1]]?.(...useArgs.map(a => a instanceof Sig ? a.value : a))
		).this;
	}
}

function getProp<T>(that: Sig<T>, propName: string|symbol): Sig<unknown>
{	const propOfSignal = that[_optionalFields]?.propOfSignal;
	const propOfSignalPath = that[_optionalFields]?.propOfSignalPath;
	const parent: Sig<Any> = propOfSignal ?? that;
	const path = propOfSignalPath ? [...propOfSignalPath, propName] : [propName];
	const result = parent.convert<unknown>
	(	v => followPath(v, path, path.length),
		undefined,
		propValue =>
		{	const {value} = parent;
			const obj = followPath(value, path, path.length-1);
			if (obj!=null && typeof(obj)=='object' && !deepEquals(obj[path[path.length - 1]], propValue))
			{	obj[path[path.length - 1]] = propValue;
				invokeOnChangeCallbacks(parent, CompType.Value, value, true);
			}
		}
	);
	result[_optionalFields] ??= new OptionalFields<unknown>;
	result[_optionalFields].propOfSignal = parent;
	result[_optionalFields].propOfSignalPath = path;
	return result.this;
}

function sigConvert<T, R>(that: Sig<T>, compValue: (value: T) => ValueOrPromise<R>)
{	recomp(that, CompType.Value|CompType.Promise|CompType.Error) && flushPendingOnChange();
	const promiseOrError = that[_promiseOrError];
	return promiseOrError instanceof Promise ? promiseOrError.then(compValue) : promiseOrError ?? compValue(that[_value] as T);
}

/**	Creates a computed {@link Sig}.

	```ts
	let backingValue = 0;
	const mySig = sig(() => backingValue, undefined, newValue => {backingValue = newValue});
	```

	@param compValue Computation function. Can return a value, Promise, or throw an Error.
	@param defaultValue Default value returned in error state or before first computation.
	@param setValue Optional setter invoked when setting static values. Prevents replacing the computation function.
	@param cancelComp Optional callback to cancel ongoing async computations when replaced.
 **/
export function sig<V, D=V>(compValue: CompValue<V>, defaultValue: D, setValue?: SetValue<V|D>, cancelComp?: CancelComp<V|D>): Sig<D extends V ? V : V|D>;
/**	Overload for when no default value is provided.
 **/
export function sig<V>(compValue: CompValue<V>): Sig<V|undefined>;

/**	Creates a {@link Sig} holding a boolean value.
	Default value is automatically `false`.
 **/
export function sig(value: boolean): Sig<boolean>;

/**	Creates a {@link Sig} holding a number value.
	Default value is automatically `0`.
 **/
export function sig(value: number): Sig<number>;

/**	Creates a {@link Sig} holding a bigint value.
	Default value is automatically `0n`.
 **/
export function sig(value: bigint): Sig<bigint>;

/**	Creates a {@link Sig} holding a string value.
	Default value is automatically `''` (empty string).
 **/
export function sig(value: string): Sig<string>;

/**	Creates a {@link Sig} that wraps another signal.
	Equivalent to `sig(() => underlyingSignal)`, adopting the inner signal's state.

	@param underlyingSignal Signal to wrap.
	@param defaultValue Default value when the underlying signal is in error state.
 **/
export function sig<V, D=V>(underlyingSignal: Sig<V>, defaultValue: D): Sig<D extends V ? V : V|D>;
/**	Overload for when no default value is provided.
 **/
export function sig<V>(underlyingSignal: Sig<V>): Sig<V|undefined>;

/**	Creates a {@link Sig} holding a static value, Promise, or Error.
	Promises start in promise state, resolving to value or error state.

	```ts
	const sig1 = sig(42); // default: 0
	const sig2 = sig(fetch('/endpoint').then(r => r.json())); // starts in promise state
	const sig3 = sig<string | undefined>(new Error('Error')); // starts in error state
	```

	Primitive types (boolean/number/bigint/string) get automatic default values.

	@param value Static value, Promise, or Error object.
	@param defaultValue Default for error/promise state (undefined for non-primitives).
 **/
export function sig<V, D=V>(value: V|Promise<V>|Error, defaultValue: D): Sig<D extends V ? V : V|D>;
/**	Overload for when no default value is provided.
 **/
export function sig<V>(value: V|Promise<V>): Sig<V|undefined>;

/**	Creates a {@link Sig} with no initial value (undefined).
	Only valid when T allows undefined.

	```ts
	const sig1 = sig<undefined>(); // OK
	const sig2 = sig<string | undefined>(); // OK
	const sig3 = sig<string | undefined>(new Error('Error')); // OK - starts in error state
	// const sig4 = sig<string>(); // Type error: string doesn't allow undefined
	```
 **/
export function sig<T>(...args: undefined extends T ? [Error?] : never): Sig<T>;

export function sig<T>(compValue?: ValueOrPromise<T>|CompValue<T>, defaultValue?: T, setValue?: SetValue<T>, cancelComp?: CancelComp<T>): Sig<T>
{	return new Sig
	(	compValue!,
		(	arguments.length!=1 ?
				defaultValue! :
			typeof(compValue)=='boolean' ?
				false as T :
			typeof(compValue)=='number' ?
				0 as T :
			typeof(compValue)=='bigint' ?
				0n as T :
			typeof(compValue)=='string' ?
				'' as T :
				defaultValue!
		),
		setValue,
		cancelComp
	) as Any;
}

function followPath(obj: Any, path: Array<string|symbol>, pathLen: number)
{	for (let i=0; i<pathLen; i++)
	{	if (obj == null)
		{	return undefined;
		}
		obj = obj[path[i]];
	}
	return obj;
}

function *traverseWeak<T extends object>(items: Array<T|WeakRef<T>>)
{	for (let i=items.length; --i>=0;)
	{	const itemOrRef = items[i];
		const item = itemOrRef instanceof WeakRef ? itemOrRef.deref() : itemOrRef;
		if (!item)
		{	items[i] = items[items.length - 1];
			items.length--;
			hasOnchangeVersion++;
		}
		else
		{	yield item;
		}
	}
}

/**	Batches multiple signal updates into a single change cycle.

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

	@param callback Function containing signal updates to batch. Can be sync or async.
	@returns The return value of the callback (including Promises).
 **/
export function batch<T>(callback: () => T): T
{	batchLevel++;
	try
	{	let res = callback();
		if (res instanceof Promise)
		{	batchLevel++;
			res = res.then(endBatch, endBatchThrow) as T;
		}
		return res;
	}
	finally
	{	endBatch();
	}
}

function endBatch<T>(res?: T)
{	batchLevel--;
	flushPendingOnChange();
	return res;
}

function endBatchThrow<T>(error?: T)
{	batchLevel--;
	flushPendingOnChange();
	throw error;
}
