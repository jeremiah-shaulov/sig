import {deepEquals} from './deep_equals.ts';
import type {ThisSig} from './this_sig.ts';

const _propOfSignal = Symbol();
const _valueHolder = Symbol();
const _dependOnMe = Symbol();

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
	`flags & Flags.HasOnChangePositive` - Cached result: whether this signal has onChange listeners.
	`flags & ~Flags.FlagsMask` - Global onChange version number for cache invalidation.
 **/
const enum Flags
{	// Value status (bits 0-1):
	ValueStatusMask = 3,
	Value = 0,              // Value is current and valid
	WantRecomp = 1,         // Value is stale and needs recomputation
	RecompInProgress = 2,   // Currently computing a new value

	// Signal type (bit 2):
	IsErrorSignal = 4,	    // Signal treats Error as a value (for sig.error)

	FlagsLowMask = 7,       // Mask for bits 0-2

	// onChange listener cache (bit 3):
	HasOnChangePositive = 8, // Signal has onChange listeners (direct or transitive)

	FlagsMask = 15,         // Mask for all flag bits (0-3)
	OnChangeVersionStep = 16, // Step size for incrementing global onChange version (bit 4+)
}

/**	The currently evaluating signal, used to track dependencies during computation.

	When a signal starts computation, it becomes the evalContext.
	Other signals accessed during computation register the evalContext as a dependent.
	When the computation ends, evalContext is restored to its previous value.

	This mechanism ensures that nested signal computations correctly track
	their dependencies to the appropriate parent computation.
 **/
let evalContext: SigComp<unknown> | undefined;
let evalContextWeak: WeakRef<SigComp<unknown>> | undefined;
let evalContextIDependOn: DependRec[] | undefined;
let evalContextIDependOnLen = 0;

/**	Callbacks scheduled to be invoked when signals change.
	These are batched and executed during the flush cycle to ensure consistent state.
 **/
const pendingOnChange = new Array<OnChangeRecord<Any>>;

/**	Signals scheduled for recomputation after their dependencies changed.
	These are processed in order during the flush cycle, with the cause signal provided for context.
 **/
const pendingRecomp = new Array<{subj: SigComp<unknown>, knownToBeChanged: boolean, cause: Sig<Any>}>;

/**	Nesting level of batch() calls. When > 0, changes are deferred until all batches complete. **/
let batchLevel = 0;

/**	Counter for assigning unique IDs to signal instances. **/
let idEnum = 0;

/**	Global version number for onChange listener tracking.
	Incremented when subscriptions change to invalidate cached hasOnchange() results.
	Stored in high bits of _flagsAndOnchangeVersion.
 **/
let hasOnchangeVersion = Flags.OnChangeVersionStep;

// deno-lint-ignore no-explicit-any
type Any = any;

type SigComp<T> = Sig<T> & {[_valueHolder]: ValueHolderComp<T>};

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

type DependRec = {source: Sig<Any>, target: WeakRef<SigComp<unknown>>, compType: CompType};
type DependOnMe = Map<number, DependRec>;

/**	Proxy type for `sig.mut` that provides access to mutating methods.
	Only includes methods (not properties) from the signal's value type.
	Calling methods through this proxy triggers change notifications after execution.
	Used to detect in-place mutations that wouldn't otherwise trigger reactivity.
 **/
type MutSig<T> =
(	T extends Record<string|symbol, Any> ?
		{[K in keyof T as K extends number ? never : K]: T[K] extends ((...args: Any[]) => Any) ? T[K] : never} :
	T extends Record<infer RK, infer RV>|null|undefined ?
		{[K in RK as K extends number ? never : K]: Record<RK, RV>[K] extends ((...args: Any[]) => Any) ? Record<RK, RV>[K]|undefined : never} :
		object
);

/**	Processes all pending signal recomputations and onChange callbacks.
	This ensures that signals are updated in the correct order and all listeners are notified.

	Only runs when not in a batch and not currently evaluating a signal.
	Continues processing until no new recomputations are triggered by onChange callbacks.
	This handles cascading updates where one signal change triggers another.
 **/
function flushPendingOnChange()
{	if (!batchLevel && !evalContext && (pendingRecomp.length>0 || pendingOnChange.length>0))
	{	batchLevel++;
		while (true)
		{	for (let i=0; i<pendingRecomp.length; i++)
			{	const {subj, knownToBeChanged, cause} = pendingRecomp[i];
				recomp(subj, knownToBeChanged, cause);
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
{	#busySig: Sig<boolean> | undefined;
	#errorSig: Sig<Error|undefined> | undefined;
	#this: ThisSig<T> | undefined;

	[_valueHolder]: ValueHolder<T>;

	/**	Weakly-referenced list of signals that depend on this signal.
		When this signal changes, these dependent signals are marked for recomputation.
	 **/
	[_dependOnMe]: DependOnMe|undefined;

	/**	If this signal represents a property of another signal, reference to the parent.
	 **/
	[_propOfSignal]: {parent: Sig<Any>, path: Array<string|symbol>} | undefined;

	/**	This constructor is used internally. Use the {@link sig()} function to create signals.
	 **/
	constructor(valueHolder: ValueHolder<T>)
	{	this[_valueHolder] = valueHolder;
	}

	/**	Returns the current value of the signal.
		If in error state, returns the default value.
		In promise state, returns the last value or default.
	 **/
	get value(): T
	{	return this[_valueHolder].get(this);
	}

	/**	Sets a new value for the signal.
		Alias for the `set()` method.
	 **/
	set value(value: T)
	{	this[_valueHolder].set(this, value, false, true) && flushPendingOnChange();
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
	{	this[_valueHolder].adopt(this, compValue, cancelComp) && flushPendingOnChange();
	}

	/**	Returns a Proxy-wrapped version of this signal providing the `ThisSig` interface.
		Enables accessing properties and methods of the signal's value as signals.
		Property accesses are cached.
	**/
	get this(): ThisSig<T>
	{	if (!this.#this)
		{	const propsCache = new Map<string|symbol, WeakRef<Sig<unknown>>>;
			this.#this ??= new Proxy
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
		return this.#this;
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

	/**	Returns a signal containing the Error object when in error state, otherwise `undefined`.
		This signal itself is never in promise state.
	 **/
	get error(): Sig<Error|undefined>
	{	if (!this.#errorSig)
		{	const valueHolder: ValueHolder<Error|undefined> = new ValueHolderComp<Error|undefined>(Flags.WantRecomp|Flags.IsErrorSignal, undefined, undefined, undefined, idEnum++, undefined, undefined, () => this[_valueHolder].getErrorValue(this));
			this.#errorSig = new Sig(valueHolder);
		}
		return this.#errorSig;
	}

	/**	Returns a signal that is `true` when this signal is in promise state, `false` otherwise.
		Useful for reactively tracking async computation state.
	 **/
	get busy(): Sig<boolean>
	{	if (!this.#busySig)
		{	const valueHolder: ValueHolder<boolean> = new ValueHolderComp(Flags.WantRecomp, false, false, undefined, idEnum++, undefined, undefined, () => !!this.promise);
			this.#busySig = new Sig(valueHolder);
		}
		return this.#busySig;
	}

	/**	Returns the active Promise when the signal is in promise state, otherwise `undefined`.
		If the value is already computed, or if the signal is in error state, returns `undefined`.
	 **/
	get promise(): Promise<T>|undefined
	{	return this[_valueHolder].getPromise(this);
	}

	/**	Returns the default value of the signal, as provided when the signal was created.
	 **/
	get default(): T
	{	return this[_valueHolder].defaultValue;
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
	{	// Create a backing signal to hold the raw value
		const valueHolder = this[_valueHolder];
		const curPromiseOrError = valueHolder instanceof ValueHolderPromise ? valueHolder.promiseOrError : undefined;
		const backingSig = new Sig(new ValueHolderPromise(valueHolder.flagsAndOnchangeVersion & Flags.FlagsMask, valueHolder.get(this), valueHolder.defaultValue, undefined, idEnum++, curPromiseOrError));
		// Convert this signal to a computed signal that applies the converter
		this[_valueHolder] = new ValueHolderConv<T>
		(	valueHolder.flagsAndOnchangeVersion & ~Flags.FlagsMask | Flags.WantRecomp,
			valueHolder.value,
			valueHolder.defaultValue,
			valueHolder.onChangeCallbacks,
			valueHolder.id,
			curPromiseOrError,
			undefined,
			() => sigConvert(backingSig, compValue),
			(newValue: T) => backingSig.set(newValue)
		);
	}

	/**	Removes a previously set converter function, reverting the signal to a regular signal.
		If the signal has a converter set via {@link setConverter()}, this method removes it
		and restores the signal to its pre-converter state with the current computed value.

		After calling this method, the signal behaves as a regular static signal,
		and `set()` calls will directly replace the value instead of invoking the converter.

		```ts
		const sigA = sig(5);
		sigA.setConverter(v => v * 2);
		console.log(sigA.value); // 10

		sigA.unsetConverter();
		console.log(sigA.value); // 10 (still the converted value)

		sigA.value = 7;
		console.log(sigA.value); // 7 (no longer doubled)
		```

		If no converter is set, this method has no effect.
	 **/
	unsetConverter()
	{	const valueHolder = this[_valueHolder];
		if (valueHolder instanceof ValueHolderConv)
		{	this[_valueHolder] = new ValueHolderPromise(valueHolder.flagsAndOnchangeVersion & Flags.FlagsMask, valueHolder.get(this), valueHolder.defaultValue, valueHolder.onChangeCallbacks, idEnum++, valueHolder.promiseOrError);
		}
	}

	/**	Registers a callback invoked when the signal's value changes.

		Signals normally compute lazily. Adding a listener makes the signal actively
		recompute whenever dependencies change.

		When adding the first listener to a computed signal, whose value is not yet computed or stale,
		this triggers immediate computation to establish dependencies.
		After the computation, the callback can be invoked if the value differs from default.

		@param callback Function to call on value changes. Can be a direct reference or WeakRef.
	 **/
	subscribe(callback: OnChange<T>|WeakRef<OnChange<T>>)
	{	const {onChangeCallbacks} = this[_valueHolder];
		if (onChangeCallbacks)
		{	const callbackFunc = callback instanceof WeakRef ? callback.deref() : callback;
			if (traverseWeak(onChangeCallbacks).some(c => c === callbackFunc))
			{	return;
			}
			onChangeCallbacks.push(callback as Any);
		}
		else
		{	this[_valueHolder].onChangeCallbacks = [callback as Any];
		}
		hasOnchangeVersion += Flags.OnChangeVersionStep;
		if ((this[_valueHolder].flagsAndOnchangeVersion & Flags.ValueStatusMask) == Flags.WantRecomp)
		{	recomp(this as Any) && flushPendingOnChange(); // this is needed if computation never called for this signal, to record dependencies
		}
	}

	/**	Removes a previously added onChange listener.
	 **/
	unsubscribe(callback: OnChange<T>|WeakRef<OnChange<T>>)
	{	const {onChangeCallbacks} = this[_valueHolder];
		if (onChangeCallbacks)
		{	const callbackFunc = callback instanceof WeakRef ? callback.deref() : callback;
			for (let i=0; i<onChangeCallbacks.length; i++)
			{	const cb = onChangeCallbacks[i];
				if (cb instanceof WeakRef ? cb.deref()===callbackFunc : cb===callbackFunc)
				{	onChangeCallbacks[i] = onChangeCallbacks[onChangeCallbacks.length - 1];
					onChangeCallbacks.length--;
					hasOnchangeVersion += Flags.OnChangeVersionStep;
					break;
				}
			}
		}
	}

	/**	Automatic conversion to string.
		Returns word "Sig" with appended computation function converted to string, or value for non-computed signals.
	 **/
	[Symbol.toPrimitive]()
	{	return 'compValue' in this[_valueHolder] ? `Sig ${this[_valueHolder].compValue}` : `Sig ${this[_valueHolder].value}`;
	}

	/**	For `JSON.stringify()`.
		Returns the current value of the signal (`this.value`).
	 **/
	toJSON()
	{	return this.value;
	}
}

/**	Registers the currently evaluating signal as a dependent of this signal.
	When this signal changes, the dependent will be marked for recomputation.
	Tracks which aspects (value/promise/error) were observed to minimize unnecessary updates.

	@param ownerSig The signal being accessed (dependency)
	@param compType Which aspect of the signal was accessed (value/promise/error)
 **/
function addMyselfAsDepToBeingComputed<T>(ownerSig: Sig<T>, compType: CompType)
{	if (evalContext)
	{	const atLen = evalContextIDependOn![evalContextIDependOnLen];
		if (atLen?.source === ownerSig)
		{	evalContextIDependOn![evalContextIDependOnLen++].compType = compType;
		}
		else
		{	let i = evalContextIDependOn!.length;
			while (--i >= 0)
			{	if (evalContextIDependOn![i].source === ownerSig)
				{	if (i > evalContextIDependOnLen)
					{	// Dependency found later in array, swap it to current position
						evalContextIDependOn![i].compType = compType;
						evalContextIDependOn![evalContextIDependOnLen++] = evalContextIDependOn![i];
						evalContextIDependOn![i] = atLen;
					}
					else
					{	evalContextIDependOn![i].compType |= compType;
					}
					break;
				}
			}
			if (i < 0)
			{	// New dependency: check for circular references before adding
				if (ownerSig[_valueHolder] instanceof ValueHolderComp && checkCircular(ownerSig[_valueHolder], evalContext[_valueHolder]))
				{	throw new Error('Circular dependency detected between signals');
				}
				// Add bidirectional dependency links
				evalContextWeak ??= new WeakRef(evalContext);
				const dependRec = {source: ownerSig, target: evalContextWeak, compType};
				ownerSig[_dependOnMe] ??= new Map;
				ownerSig[_dependOnMe].set(evalContext[_valueHolder].id, dependRec);
				// New dependency not in array yet
				evalContextIDependOn![evalContextIDependOnLen++] = dependRec;
				if (atLen !== undefined)
				{	evalContextIDependOn![evalContextIDependOn!.length] = atLen;
				}
			}
		}
	}
}

/**	Detects circular dependencies in the signal dependency graph.
	Prevents infinite loops by checking if a signal depends on itself through a chain.

	@param ownerSig Starting signal to check
	@param target Signal to search for in the dependency chain
	@param visited Set of already-visited signals to avoid infinite loops
	@returns true if circular dependency detected, false otherwise
 **/
function checkCircular<T>(ownerSig: ValueHolderComp<T>, target: ValueHolderComp<Any>, visited=new Set<ValueHolderComp<Any>>): boolean
{	if (ownerSig === target)
	{	return true;
	}
	if (visited.has(ownerSig))
	{	return false;
	}
	visited.add(ownerSig);
	return ownerSig.iDependOn.some(dep => dep.source[_valueHolder] instanceof ValueHolderComp && checkCircular(dep.source[_valueHolder], target, visited));
}

/**	Base class for storing signal values and managing their state.
	Provides core functionality for value storage, retrieval, and updates.
	Subclasses extend this to handle promises and computed values.
 **/
class ValueHolder<T>
{	constructor
	(	public flagsAndOnchangeVersion: Flags,
		public value: T,
		public defaultValue: T,

		/**	Callbacks to invoke when the signal's value changes.
		**/
		public onChangeCallbacks?: Array<OnChange<unknown> | WeakRef<OnChange<unknown>>>,

		/**	Unique identifier for each signal instance, used in dependency tracking maps.
		 **/
		public id = idEnum++,
	){}

	get(ownerSig: Sig<T>)
	{	addMyselfAsDepToBeingComputed(ownerSig, CompType.Value);
		return this.value;
	}

	/**	Returns the Error object if this signal is in error state.
		For non-error signals, always returns undefined.
	 **/
	getErrorValue(ownerSig: Sig<T>): Error|undefined
	{	addMyselfAsDepToBeingComputed(ownerSig, CompType.Error);
		return undefined;
	}

	/**	Returns the active promise if this signal is in promise state.
		For non-promise signals, always returns undefined.
	 **/
	getPromise(ownerSig: Sig<T>): Promise<T>|undefined
	{	addMyselfAsDepToBeingComputed(ownerSig, CompType.Promise);
		return undefined;
	}

	/**	Sets a new value for the signal.

		@param ownerSig The signal being updated
		@param value New value
		@param knownToBeChanged Skip equality check if we know it changed
		@returns Flags indicating what changed (value/promise/error)
	 **/
	set(ownerSig: Sig<T>, newValue: T, knownToBeChanged=false, _bySetter=false): CompType
	{	let changeType = CompType.None;
		const prevValue = this.value;
		if (knownToBeChanged || !deepEquals(newValue, prevValue))
		{	changeType = CompType.Value; // value -> value
		}
		// Update the signal's value and state
		this.value = newValue;
		if (changeType)
		{	invokeOnChangeCallbacks(ownerSig, changeType, prevValue);
		}
		return changeType;
	}

	/**	Sets a new value for the signal, potentially converting the ValueHolder type.
		Converts to ValueHolderComp for functions/signals, ValueHolderPromise for promises/errors.

		@param ownerSig The signal being updated
		@param compValue New value, promise, computation function, or signal
		@param cancelComp Optional cancellation callback for async computations
		@returns Flags indicating what changed (value/promise/error)
	 **/
	adopt(ownerSig: Sig<T>, compValue: ValueOrPromise<T>|CompValue<T>, cancelComp?: CancelComp<T>): CompType
	{	if (typeof(compValue)=='function' || compValue instanceof Sig)
		{	// Upgrade to ValueHolderComp
			const newValueHolder = new ValueHolderComp<T>(this.flagsAndOnchangeVersion & ~Flags.FlagsMask | Flags.WantRecomp, this.value, this.defaultValue, this.onChangeCallbacks, this.id, undefined, compValue instanceof Sig ? undefined : cancelComp, compValue as Sig<T>|CompValue<T>);
			ownerSig[_valueHolder] = newValueHolder;
			return recomp(ownerSig as SigComp<T>, false, undefined, true);
		}
		if (compValue instanceof Promise)
		{	// Upgrade to ValueHolderPromise
			const newValueHolder = new ValueHolderPromise<T>(this.flagsAndOnchangeVersion & ~Flags.FlagsMask, this.value, this.defaultValue, this.onChangeCallbacks, this.id, undefined, cancelComp);
			ownerSig[_valueHolder] = newValueHolder;
			return valueHolderPromiseUpdate(ownerSig, convPromise(compValue));
		}
		if (compValue instanceof Error)
		{	// Upgrade to ValueHolderPromise with error
			const newValueHolder = new ValueHolderPromise<T>(this.flagsAndOnchangeVersion & ~Flags.FlagsMask, this.value, this.defaultValue, this.onChangeCallbacks, this.id);
			ownerSig[_valueHolder] = newValueHolder;
			return valueHolderPromiseUpdate(ownerSig, compValue);
		}
		return this.set(ownerSig, compValue);
	}
}

/**	ValueHolder that can store promises and errors in addition to regular values.
	Manages promise resolution, error states, and async cancellation.
	Used for signals created with promises or that can transition to promise/error states.
 **/
class ValueHolderPromise<T> extends ValueHolder<T>
{	promiseOrError: Promise<T> | Error | undefined;

	constructor
	(	flagsAndOnchangeVersion: Flags,
		prevValue: T,
		defaultValue: T,
		onChangeCallbacks: Array<OnChange<unknown> | WeakRef<OnChange<unknown>>> | undefined,
		id: number,
		promiseOrError?: Error|Promise<Value<T>>,
		public cancelComp?: CancelComp<T>
	)
	{	super(flagsAndOnchangeVersion, prevValue, defaultValue, onChangeCallbacks, id);
		this.promiseOrError = promiseOrError instanceof Promise ? convPromise(promiseOrError) : promiseOrError;
	}

	/**	Returns the Error object if this signal is in error state.
	 **/
	override getErrorValue(ownerSig: Sig<T>)
	{	addMyselfAsDepToBeingComputed(ownerSig, CompType.Error);
		return this.promiseOrError instanceof Error ? this.promiseOrError : undefined;
	}

	/**	Returns the active promise if this signal is in promise state.
		Used by Sig.promise getter to access the promise without triggering recomputation.
	 **/
	override getPromise(ownerSig: Sig<T>)
	{	addMyselfAsDepToBeingComputed(ownerSig, CompType.Promise);
		return this.promiseOrError instanceof Promise ? this.promiseOrError : undefined;
	}

	/**	Sets a new value for the signal.

		@param ownerSig Signal to update
		@param newValue New value, promise, or error
		@param knownToBeChanged Skip equality check if we know it changed
		@param bySetter Whether this update came from a setter function (triggers setValue callback)
		@returns Flags indicating what changed (value/promise/error)
	**/
	override set(ownerSig: Sig<T>, newValue: T, knownToBeChanged=false, bySetter=false): CompType
	{	let changeType = CompType.None;
		const prevError = this.promiseOrError instanceof Error ? this.promiseOrError : undefined;
		const prevValue = this.value;
		let newError: Error|undefined;
		if (bySetter && this instanceof ValueHolderComp && this.setValue)
		{	// Try to apply the setter function, catching any errors it throws
			batchLevel++;
			try
			{	this.setValue(newValue);
				// Setter succeeded, now recompute to get the new value
				this.flagsAndOnchangeVersion = Flags.WantRecomp | (this.flagsAndOnchangeVersion & ~Flags.ValueStatusMask);
				return recomp(ownerSig as SigComp<T>);
			}
			catch (e)
			{	// Setter threw an error, treat as error state
				newError = e instanceof Error ? e : new Error(e+'');
			}
			finally
			{	batchLevel--;
			}
		}
		if (newError)
		{	if (this.promiseOrError instanceof Promise)
			{	changeType = CompType.Promise|CompType.Error; // promise -> error
			}
			else if (!prevError)
			{	changeType = CompType.Value|CompType.Error; // value -> error
			}
			else if (newError.constructor!==prevError.constructor || newError.message!==prevError.message)
			{	changeType = CompType.Error; // error -> error
			}
		}
		else
		{	// Transitioning out of error or promise state, or value changed
			if (this.promiseOrError instanceof Promise)
			{	changeType = CompType.Promise|CompType.Value; // promise -> value
			}
			else if (prevError)
			{	changeType = CompType.Error|CompType.Value; // error -> value
			}
			else if (knownToBeChanged || !deepEquals(newValue, prevValue))
			{	changeType = CompType.Value; // value -> value
			}
		}
		// Update the signal's value and state
		this.value = newError ? this.defaultValue : newValue;
		this.promiseOrError = newError;
		if (changeType)
		{	invokeOnChangeCallbacks(ownerSig, changeType, prevError ?? prevValue);
		}
		return changeType;
	}

	override adopt(ownerSig: Sig<T>, compValue: ValueOrPromise<T>|CompValue<T>, cancelComp?: CancelComp<T>): CompType
	{	// Cancel the current computation with the OLD cancelComp before replacing it
		if (this.promiseOrError instanceof Promise)
		{	this.cancelComp?.(this.promiseOrError);
		}
		if (typeof(compValue)=='function' || compValue instanceof Sig)
		{	// Upgrade to ValueHolderComp
			const newValueHolder = new ValueHolderComp<T>(this.flagsAndOnchangeVersion & ~Flags.FlagsMask | Flags.WantRecomp, this.value, this.defaultValue, this.onChangeCallbacks, this.id, this.promiseOrError, compValue instanceof Sig ? undefined : cancelComp, compValue as Sig<T>|CompValue<T>);
			ownerSig[_valueHolder] = newValueHolder;
			return recomp(ownerSig as SigComp<T>, false, undefined, true);
		}
		if (compValue instanceof Promise)
		{	this.cancelComp = cancelComp;
			return valueHolderPromiseUpdate(ownerSig, convPromise(compValue));
		}
		this.cancelComp = undefined;
		return valueHolderPromiseUpdate(ownerSig, compValue);
	}
}

/**	ValueHolder for computed signals with computation functions.
	Manages lazy recomputation, dependency tracking, and optional setter functions.
	Automatically recomputes when dependencies change or when accessed if stale.
 **/
class ValueHolderComp<T> extends ValueHolderPromise<T>
{	/**	Signals that this signal depends on, along with what aspects (value/promise/error) were observed.
		When a dependency changes, we check if the observed aspect changed to determine if recomputation is needed.
	 **/
	iDependOn = new Array<DependRec>;

	constructor
	(	flagsAndOnchangeVersion: Flags,
		prevValue: T,
		defaultValue: T,
		onChangeCallbacks: Array<OnChange<unknown> | WeakRef<OnChange<unknown>>> | undefined,
		id: number,
		prevPromiseOrError: Promise<T>|Error|undefined,
		cancelComp: CancelComp<T>|undefined,
		public compValue: Sig<T>|CompValue<T>,
		public setValue?: SetValue<T>
	)
	{	super(flagsAndOnchangeVersion, prevValue, defaultValue, onChangeCallbacks, id, prevPromiseOrError, cancelComp);
	}

	/**	Gets the signal's value, triggering recomputation if needed.
		This ensures computed signals are always up-to-date when accessed.
	 **/
	override get(ownerSig: Sig<T>)
	{	addMyselfAsDepToBeingComputed(ownerSig, CompType.Value);
		recomp(ownerSig as SigComp<T>);
		return this.value;
	}

	/**	Sets a new value or computation for a computed signal.
		If this signal has a setValue callback, invokes it and triggers recomputation.
		Otherwise, allows replacing the computation function or converting to static/promise signal.

		@param ownerSig The signal being updated
		@param compValue New value, promise, computation function, or signal
		@param cancelComp Optional cancellation callback for async computations
		@returns Flags indicating what changed (value/promise/error)
	 **/
	override adopt(ownerSig: Sig<T>, compValue: ValueOrPromise<T>|CompValue<T>, cancelComp?: CancelComp<T>): CompType
	{	if (this.setValue)
		{	if (typeof(compValue)=='function' || compValue instanceof Sig)
			{	throw new Error('Cannot override computation function for signals with value setters');
			}
			return valueHolderPromiseUpdate(ownerSig, compValue instanceof Promise ? convPromise(compValue) : compValue, false, true);
		}
		// Cancel the current computation with the OLD cancelComp before replacing it
		if (this.promiseOrError instanceof Promise)
		{	this.cancelComp?.(this.promiseOrError);
		}
		if (typeof(compValue)=='function' || compValue instanceof Sig)
		{	this.compValue = compValue as Sig<T>|CompValue<T>;
			this.cancelComp = compValue instanceof Sig ? undefined : cancelComp;
			this.flagsAndOnchangeVersion = this.flagsAndOnchangeVersion & ~Flags.FlagsMask | Flags.WantRecomp;
			return recomp(ownerSig as SigComp<T>, false, undefined, true);
		}
		if (compValue instanceof Promise)
		{	// Downgrade to ValueHolderPromise
			const newValueHolder = new ValueHolderPromise<T>(this.flagsAndOnchangeVersion & ~Flags.FlagsMask, this.value, this.defaultValue, this.onChangeCallbacks, this.id, this.promiseOrError, cancelComp);
			ownerSig[_valueHolder] = newValueHolder;
			return valueHolderPromiseUpdate(ownerSig, convPromise(compValue));
		}
		// Downgrade to ValueHolderPromise
		const newValueHolder = new ValueHolderPromise<T>(this.flagsAndOnchangeVersion & ~Flags.FlagsMask, this.value, this.defaultValue, this.onChangeCallbacks, this.id, this.promiseOrError);
		ownerSig[_valueHolder] = newValueHolder;
		return valueHolderPromiseUpdate(ownerSig, compValue);
	}

	/**	Returns the Error object if this signal is in error state.
	 **/
	override getErrorValue(ownerSig: Sig<T>)
	{	addMyselfAsDepToBeingComputed(ownerSig, CompType.Error);
		recomp(ownerSig as Any);
		return this.promiseOrError instanceof Error ? this.promiseOrError : undefined;
	}

	/**	Returns the active promise if this signal is in promise state.
		Used by Sig.promise getter to access the promise without triggering recomputation.
	 **/
	override getPromise(ownerSig: Sig<T>)
	{	addMyselfAsDepToBeingComputed(ownerSig, CompType.Promise);
		recomp(ownerSig as Any);
		return this.promiseOrError instanceof Promise ? this.promiseOrError : undefined;
	}
}

class ValueHolderConv<T> extends ValueHolderComp<T>
{
}

function valueHolderPromiseUpdate<T>(ownerSig: Sig<T>, newValue: T|Promise<T>|Error, knownToBeChanged=false, bySetter=false): CompType
{	const vh = ownerSig[_valueHolder] as ValueHolderPromise<T>;
	let changeType = CompType.None;
	const prevError = vh.promiseOrError instanceof Error ? vh.promiseOrError : undefined;
	const prevValue = vh.value;
	if (newValue instanceof Promise)
	{	if (prevError)
		{	changeType = CompType.Error|CompType.Promise; // error -> promise
		}
		else if (!vh.promiseOrError)
		{	changeType = CompType.Value|CompType.Promise; // value -> promise
		}
		const promise = newValue;
		vh.promiseOrError = promise;
		// Set up handlers to update signal when promise resolves or rejects
		promise.then
		(	v =>
			{	const valueHolder = ownerSig[_valueHolder]; // the value holder could have changed since the promise was set
				if (valueHolder instanceof ValueHolderPromise && valueHolder.promiseOrError===promise) // ignore result of old promise if `promiseOrError` was set to a new promise
				{	valueHolder.set(ownerSig, v, knownToBeChanged, bySetter) && flushPendingOnChange();
				}
			},
			e =>
			{	const valueHolder = ownerSig[_valueHolder]; // the value holder could have changed since the promise was set
				if (valueHolder instanceof ValueHolderPromise && valueHolder.promiseOrError===promise) // ignore result of old promise if `promiseOrError` was set to a new promise
				{	valueHolderPromiseUpdate(ownerSig, e instanceof Error ? e : new Error(e+''), knownToBeChanged, bySetter) && flushPendingOnChange();
				}
			}
		);
	}
	else
	{	let newError = !(vh.flagsAndOnchangeVersion & Flags.IsErrorSignal) && newValue instanceof Error ? newValue : undefined;
		if (bySetter && !newError && vh instanceof ValueHolderComp && vh.setValue)
		{	// Try to apply the setter function, catching any errors it throws
			batchLevel++;
			try
			{	vh.setValue(newValue);
				// Setter succeeded, now recompute to get the new value
				vh.flagsAndOnchangeVersion = Flags.WantRecomp | (vh.flagsAndOnchangeVersion & ~Flags.ValueStatusMask);
				return recomp(ownerSig as SigComp<T>);
			}
			catch (e)
			{	// Setter threw an error, treat as error state
				newError = e instanceof Error ? e : new Error(e+'');
			}
			finally
			{	batchLevel--;
			}
		}
		if (newError)
		{	if (vh.promiseOrError instanceof Promise)
			{	changeType = CompType.Promise|CompType.Error; // promise -> error
			}
			else if (!prevError)
			{	changeType = CompType.Value|CompType.Error; // value -> error
			}
			else if (newError.constructor!==prevError.constructor || newError.message!==prevError.message)
			{	changeType = CompType.Error; // error -> error
			}
		}
		else
		{	// Transitioning out of error or promise state, or value changed
			if (vh.promiseOrError instanceof Promise)
			{	changeType = CompType.Promise|CompType.Value; // promise -> value
			}
			else if (prevError)
			{	changeType = CompType.Error|CompType.Value; // error -> value
			}
			else if (knownToBeChanged || !deepEquals(newValue, prevValue))
			{	changeType = CompType.Value; // value -> value
			}
		}
		// Update the signal's value and state
		vh.value = newError ? vh.defaultValue : newValue as T;
		vh.promiseOrError = newError;
	}
	if (changeType)
	{	invokeOnChangeCallbacks(ownerSig, changeType, prevError ?? prevValue);
	}
	return changeType;
}

/**	Recomputes a signal's value if it needs recomputation.
	This is the core computation function that:
	1. Checks if recomputation is needed (WantRecomp flag)
	2. Removes old dependencies
	3. Executes the computation function with dependency tracking
	4. Establishes new dependencies
	5. Updates the value and triggers notifications

	@param ownerSig Signal to recompute
	@param knownToBeChanged Whether we know the value changed (skips equality check)
	@param cause The signal that triggered this recomputation (for debugging)
	@param noCancelComp Skip calling the cancel function for pending promises
	@returns Flags indicating what changed (value/promise/error)
**/
function recomp<T>(ownerSig: SigComp<T>, knownToBeChanged=false, cause?: Sig<unknown>, noCancelComp=false): CompType
{	const valueHolder = ownerSig[_valueHolder];
	if ((valueHolder.flagsAndOnchangeVersion & Flags.ValueStatusMask) == Flags.WantRecomp)
	{	valueHolder.flagsAndOnchangeVersion = Flags.RecompInProgress | (valueHolder.flagsAndOnchangeVersion & ~Flags.ValueStatusMask);
		let newValue: T|Promise<T>|Error;
		// 1. Call `compValue`
		const prevEvalContext = evalContext;
		const prevEvalContextWeak = evalContextWeak;
		const prevEvalContextIDependOn = evalContextIDependOn;
		const prevEvalContextIDependOnLen = evalContextIDependOnLen;
		evalContext = ownerSig as SigComp<unknown>;
		evalContextWeak = undefined;
		evalContextIDependOn = valueHolder.iDependOn;
		evalContextIDependOnLen = 0;
		try
		{	if (!noCancelComp && valueHolder.promiseOrError instanceof Promise)
			{	valueHolder.cancelComp?.(valueHolder.promiseOrError);
			}
			const {compValue} = valueHolder;
			const result = compValue instanceof Sig ? compValue : compValue(sigSync.bind(ownerSig as Any), cause);
			newValue = result instanceof Promise ? convPromise(result) : convNonPromise(result);
		}
		catch (e)
		{	newValue = e instanceof Error ? e : new Error(e+'');
		}
		doneCollectingDeps(valueHolder);
		evalContext = prevEvalContext;
		evalContextWeak = prevEvalContextWeak;
		evalContextIDependOn = prevEvalContextIDependOn;
		evalContextIDependOnLen = prevEvalContextIDependOnLen;
		// 2. Add onChangeCallbacks to pending (if changed)
		valueHolder.flagsAndOnchangeVersion = Flags.Value | (valueHolder.flagsAndOnchangeVersion & ~Flags.ValueStatusMask);
		return valueHolderPromiseUpdate(ownerSig, newValue, knownToBeChanged);
	}
	return CompType.None;
}

function doneCollectingDeps(vh: ValueHolderComp<Any>)
{	for (let i=evalContextIDependOnLen; i<evalContextIDependOn!.length; i++)
	{	evalContextIDependOn![i].source[_dependOnMe]?.delete(vh.id);
	}
	evalContextIDependOn!.length = evalContextIDependOnLen;
}

/**	Resumes dependency tracking after an async await point.
	Called by user code via the sync() callback parameter in async computations.
	Temporarily resets evalContext to allow tracking new dependencies.
 **/
function sigSync<T>(this: SigComp<T>)
{	const compSubj = this as Sig<unknown>;
	if (compSubj !== evalContext)
	{	const prevEvalContext = evalContext;
		const prevEvalContextWeak = evalContextWeak;
		const prevEvalContextIDependOn = evalContextIDependOn;
		const prevEvalContextIDependOnLen = evalContextIDependOnLen;
		const vh = this[_valueHolder];
		evalContext = compSubj as SigComp<unknown>;
		evalContextWeak = undefined;
		evalContextIDependOn = vh.iDependOn;
		evalContextIDependOnLen = vh.iDependOn.length; // Continue from where we left off
		vh.flagsAndOnchangeVersion = Flags.RecompInProgress | (vh.flagsAndOnchangeVersion & ~Flags.ValueStatusMask);
		queueMicrotask
		(	() =>
			{	// Don't call doneCollectingDeps here - let recomp handle it
				evalContext = prevEvalContext;
				evalContextWeak = prevEvalContextWeak;
				evalContextIDependOn = prevEvalContextIDependOn;
				evalContextIDependOnLen = prevEvalContextIDependOnLen;
				vh.flagsAndOnchangeVersion = Flags.Value | (vh.flagsAndOnchangeVersion & ~Flags.ValueStatusMask);
			}
		);
	}
}

/**	Schedules onChange callbacks and marks dependent signals for recomputation.
	Callbacks are batched and invoked during the flush cycle.
	Only triggers recomputation of dependents that observed the changed aspect.
	Cleansup garbage-collected weak references during iteration.

	@param ownerSig Signal that changed
	@param changeType Which aspects changed (value/promise/error)
	@param prevValue Previous value or error (passed to callbacks)
	@param knownToBeChanged Whether we know dependents need recomputation
 **/
function invokeOnChangeCallbacks<T>(ownerSig: Sig<T>, changeType: CompType, prevValue?: T|Error, knownToBeChanged=false)
{	const {onChangeCallbacks} = ownerSig[_valueHolder];
	if (onChangeCallbacks)
	{	for (const callback of traverseWeak(onChangeCallbacks))
		{	if (!pendingOnChange.some(p => p.callback===callback))
			{	pendingOnChange.push({callback, thisArg: ownerSig, prevValue});
			}
		}
	}
	if (ownerSig[_dependOnMe])
	{	for (const [id, {target, compType}] of ownerSig[_dependOnMe])
		{	const dep = target.deref();
			if (!dep)
			{	ownerSig[_dependOnMe].delete(id);
			}
			else if ((compType & changeType) && dep[_valueHolder] instanceof ValueHolderComp && (dep[_valueHolder].flagsAndOnchangeVersion & Flags.ValueStatusMask) != Flags.RecompInProgress)
			{	dep[_valueHolder].flagsAndOnchangeVersion = Flags.WantRecomp | (dep[_valueHolder].flagsAndOnchangeVersion & ~Flags.ValueStatusMask);
				if (hasOnchange(dep) && !pendingRecomp.some(p => p.subj === dep))
				{	pendingRecomp.push({subj: dep as Any, knownToBeChanged, cause: ownerSig});
				}
			}
		}
	}
}

/**	Determines if a signal has any onChange listeners (direct or transitive).
	Caches the result using a global version number for efficiency.
	When the version changes (due to subscribe/unsubscribe), cached results are invalidated.
	Recursively checks dependent signals to find transitive listeners.

	@param ownerSig Signal to check
	@returns Flag indicating whether onChange listeners exist
 **/
function hasOnchange<T>(ownerSig: Sig<T>): 0 | Flags.HasOnChangePositive
{	if ((ownerSig[_valueHolder].flagsAndOnchangeVersion & ~Flags.FlagsMask) != hasOnchangeVersion)
	{	const yes = ownerSig[_valueHolder].onChangeCallbacks?.length || ownerSig[_dependOnMe]?.values().some
		(	depRef =>
			{	const dep = depRef.target.deref();
				return dep && hasOnchange(dep);
			}
		);
		ownerSig[_valueHolder].flagsAndOnchangeVersion = (ownerSig[_valueHolder].flagsAndOnchangeVersion & Flags.FlagsLowMask) | (yes ? hasOnchangeVersion | Flags.HasOnChangePositive : hasOnchangeVersion);
	}
	return ownerSig[_valueHolder].flagsAndOnchangeVersion & Flags.HasOnChangePositive;
}

/**	Unwraps a non-promise value that might be a signal or error.
	If the value is a signal, extracts its promise, error, or current value.
	Used when computation functions return signals or errors directly.

	@param result Value that might be a signal, error, or regular value
	@returns The unwrapped value or error
 **/
function convNonPromise<T>(result: Value<T>)
{	return result instanceof Sig ? result.promise ?? result[_valueHolder].getErrorValue(result) ?? result.value : result;
}

/**	Unwraps nested signals and converts errors to rejected promises.
	If the value is a promise that resolves to a signal, extracts the signal's value.
	If the value is a promise that resolves to an error, converts it to a rejected promise.

	@param compValue Value or promise to convert
	@returns Unwrapped value or promise
 **/
function convPromise<T>(compValue: Promise<Value<T>>): Promise<T>
{	return compValue.then
	(	r =>
		{	const result = convNonPromise(r);
			if (result instanceof Error)
			{	throw result;
			}
			return result;
		}
	);
}

/**	Handles method calls on property signals (via sig.this.method(...)).
	Creates a computed signal that re-evaluates the method when dependencies change.
	Unwraps signal arguments to their values before calling the method.

	@param ownerSig Property signal representing a method
	@param args Arguments passed to the method (may include signals)
	@returns Proxy-wrapped signal containing the method's return value
 **/
function sigApply<T>(ownerSig: Sig<T>, args?: unknown[]): Any
{	const parentSig = ownerSig[_propOfSignal]?.parent;
	if (parentSig && typeof(ownerSig.value) == 'function') // if is a method of a parent signal's value
	{	const path = ownerSig[_propOfSignal]!.path;
		const useArgs = args ?? [];
		return parentSig.convert
		(	v => followPath(v, path, path.length-1)?.[path[path.length - 1]]?.(...useArgs.map(a => a instanceof Sig ? a.value : a))
		).this;
	}
}

/**	Creates a signal representing a property of another signal's value.
	The property signal automatically updates when the parent value changes.
	Setting the property signal updates the parent signal's value.
	Tracks the property path for nested property access.

	@param ownerSig Parent signal
	@param propName Property name to access
	@returns Proxy-wrapped signal representing the property
 **/
function getProp<T>(ownerSig: Sig<T>, propName: string|symbol): Sig<unknown>
{	const propOfSignal = ownerSig[_propOfSignal]?.parent;
	const propOfSignalPath = ownerSig[_propOfSignal]?.path;
	const parent: Sig<Any> = propOfSignal ?? ownerSig;
	const path = propOfSignalPath ? [...propOfSignalPath, propName] : [propName];
	const result = parent.convert<unknown>
	(	v => followPath(v, path, path.length),
		undefined,
		propValue =>
		{	const {value} = parent;
			const obj = followPath(value, path, path.length-1);
			if (obj!==null && typeof(obj)=='object' && !deepEquals(obj[path[path.length - 1]], propValue))
			{	obj[path[path.length - 1]] = propValue;
				invokeOnChangeCallbacks(parent, CompType.Value, value, true);
			}
		}
	);
	result[_propOfSignal] = {parent, path};
	return result.this as Any;
}

/**	Applies a conversion function to a signal's value, propagating all states.
	Used by sig.convert() to transform values while preserving promise/error states.
	If signal is in promise state, waits for resolution before converting.
	If signal is in error state, propagates the error without conversion.

	@param ownerSig Signal to convert
	@param compValue Conversion function
	@returns Converted value, promise, or error
 **/
function sigConvert<T, R>(ownerSig: Sig<T>, compValue: (value: T) => ValueOrPromise<R>)
{	if (ownerSig[_valueHolder] instanceof ValueHolderPromise)
	{	addMyselfAsDepToBeingComputed(ownerSig, CompType.Value|CompType.Promise|CompType.Error);
		if (ownerSig[_valueHolder] instanceof ValueHolderComp)
		{	recomp(ownerSig as SigComp<T>) && flushPendingOnChange();
		}
		const {promiseOrError} = ownerSig[_valueHolder];
		return promiseOrError instanceof Promise ? promiseOrError.then(compValue) : promiseOrError ?? compValue(ownerSig.value);
	}
	else
	{	return compValue(ownerSig.value);
	}
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
{	if (typeof(compValue)=='function' || compValue instanceof Sig)
	{	const valueHolder: ValueHolder<T> = new ValueHolderComp<T>(Flags.WantRecomp, defaultValue!, defaultValue!, undefined, idEnum++, undefined, cancelComp, compValue as CompValue<T>, setValue);
		return new Sig(valueHolder);
	}
	if (compValue instanceof Promise || compValue instanceof Error)
	{	const valueHolder: ValueHolder<T> = new ValueHolderPromise<T>(Flags.Value, defaultValue!, defaultValue!, undefined, idEnum++, compValue, cancelComp);
		return new Sig(valueHolder);
	}
	return new Sig
	(	new ValueHolder<T>
		(	Flags.Value,
			compValue!,
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
			)
		)
	);
}

/**	Traverses an object following a path of property names.
	Returns undefined if any intermediate value is null/undefined.
	Used for nested property access in sig.this.a.b.c patterns.

	@param obj Starting object
	@param path Array of property names to traverse
	@param pathLen Number of path elements to traverse
	@returns The value at the end of the path, or undefined
 **/
function followPath(obj: Any, path: Array<string|symbol>, pathLen: number)
{	for (let i=0; i<pathLen; i++)
	{	if (obj == null)
		{	return undefined;
		}
		obj = obj[path[i]];
	}
	return obj;
}

/**	Iterates over an array that may contain weak references.
	Automatically dereferences WeakRefs and removes garbage-collected entries.
	Updates the global version number when removing entries.
	Iterates in reverse to safely remove items during iteration.

	@param items Array of objects or weak references to objects
	@yields Dereferenced objects that are still alive
 **/
function *traverseWeak<T extends object>(items: Array<T|WeakRef<T>>)
{	for (let i=items.length; --i>=0;)
	{	const itemOrRef = items[i];
		const item = itemOrRef instanceof WeakRef ? itemOrRef.deref() : itemOrRef;
		if (!item)
		{	items[i] = items[items.length - 1];
			items.length--;
			hasOnchangeVersion += Flags.OnChangeVersionStep;
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

/**	Ends a batch operation and flushes pending changes.
	Called when batch() callback completes successfully.

	@param res Result to pass through
	@returns The result unchanged
 **/
function endBatch<T>(res?: T)
{	batchLevel--;
	flushPendingOnChange();
	return res;
}

/**	Ends a batch operation, flushes pending changes, and re-throws an error.
	Called when batch() callback throws or returns a rejected promise.

	@param error Error to re-throw
 **/
function endBatchThrow<T>(error?: T)
{	batchLevel--;
	flushPendingOnChange();
	throw error;
}
