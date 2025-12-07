import {type Sig} from './sig.ts';

// deno-lint-ignore no-explicit-any
type Any = any;

/**	Proxy-wrapped signal type that provides reactive property and method access.
	When you access `mySig.this`, you get a ThisSig that allows accessing properties
	of the signal's value as if they were signals themselves.

	For example, if `mySig` is `Sig<{name: string, age: number}>`, then:
	- `mySig.this.name` is `Sig<string>`
	- `mySig.this.age` is `Sig<number>`

	If `mySig` is `Sig<{name: string, age: number} | undefined>`, then:
	- `mySig.this.name` is `Sig<string|undefined>`
	- `mySig.this.age` is `Sig<number|undefined>`

	ThisSig acts as regular signal, and `instanceof Sig` check returns true.
	Only properties that don't conflict with Sig core methods are proxied.
	So `mySig.this.value`, `mySig.this.promise`, etc. still refer to the signal's properties.

	Accessing and calling a method on ThisSig doesn't call the menthod, but returns a signal with
	computation function that calls this method.

	```ts
	const mySig = sig(['a', 'b', 'c']); // Sig<string[] | undefined>
	const sigSlice = mySig.this.slice(0, 2); // computed Sig<string[] | undefined>
	sigSlice.value; // ['a', 'b']
	```

	Methods can be called with either static values or signals as arguments.
	```ts
	const start = sig(1);
	const end = sig(3);
	const sigSlice = mySig.this.slice(start, end); // computed Sig<string[] | undefined>
	```
 **/
export type ThisSig<T> = Sig<T> &
(	[Extract<T, null|undefined>] extends [never] ?
		IsRecord<T> extends true ?
			{[K in keyof T]: ThisSig<T[K]>} :
			{	[K in AllKeys<NotNull<T>> as K extends number|SignalCoreKeys ? never : K]:
				(	K extends CommonKeys<NotNull<T>> ?
						SignalPropOrMethod<NotNever<PropertyType<NotNull<T>, K>>, false> :
						SignalPropOrMethod<NotNever<PropertyType<NotNull<T>, K>>, true>
				)
			} :
		IsRecord<T> extends true ?
			{[K in keyof T]: ThisSig<T[K]|undefined>} :
			{	[K in AllKeys<NotNull<T>> as K extends number|SignalCoreKeys ? never : K]:
				(	SignalPropOrMethod<NotNever<PropertyType<NotNull<T>, K>>, true>
				)
			}
);

/**	Removes null and undefined from a union type.
	Used to extract the non-nullable portion of a value for property access.
 **/
type NotNull<T> = Exclude<T, null|undefined>;

/**	Removes never from a union type.
	Used to clean up conditional types that may produce never branches.
 **/
type NotNever<T> = Exclude<T, never>;

/**	Transforms function arguments to allow either static values or signals of those values.
	This enables method calls on signal properties to accept both regular values and signals as arguments.
	If an argument is already a Sig type, it remains as-is; otherwise, it can be either the value or a Sig of that value.
 **/
type ArgOrSignal<Args extends Any[]> = {[K in keyof Args]: Args[K] extends Sig<Any> ? Args[K] : Args[K]|Sig<Args[K]>};

/**	Converts a property or method type to its signal equivalent.
	Methods are converted to accept signal or static arguments and return signals.
	Properties are converted to signals of their type.
	The Nullable parameter adds undefined to the type when the parent can be null/undefined.

	@template T The property or method type
	@template Nullable Whether to include undefined in the result type
 **/
type SignalPropOrMethod<T, Nullable extends boolean> =
	 T extends ((...args: infer Args) => infer Ret) ?
		(...args: ArgOrSignal<Args>) => ThisSig<Nullable extends true ? Ret|undefined : Ret> :
		ThisSig<Nullable extends true ? T|undefined : T>;

/**	Check if a key K is required in all branches of union T.
	Used to distinguish between properties that exist in all union members vs. only some.
	Returns true if the key exists in every branch, false otherwise.

	Example: For `{a: string} | {a: number, b: string}`, 'a' is required but 'b' is not.
 **/
type IsRequiredKey<T, K extends PropertyKey> =
	T extends Any
		? K extends keyof T
			? true
			: false
		: never;

/**	A key is common if it's required in all branches (not just some).
	Common keys can be accessed without undefined in the result type.
	Filters AllKeys<T> to only include keys that pass IsRequiredKey.

	Example: For `{a: string} | {a: number, b: string}`, CommonKeys is 'a'.
 **/
type CommonKeys<T> = {
	[K in AllKeys<T>]: [IsRequiredKey<T, K>] extends [true] ? K : never
}[AllKeys<T>];

/**	Properties that exist in at least one union member.
	This gathers all possible property keys across all branches of a union type.
	Excludes index signatures (string extends keyof T) to avoid matching everything.

	Example: For `{a: string} | {b: number}`, AllKeys is 'a' | 'b'.
 **/
type AllKeys<T> = T extends Any ? string extends keyof T ? never : keyof T : never;

/**	Checks if a type is a record with index signature (e.g., Record<string, any>).
	Returns true if the type has string indexer (string extends keyof T).
	Used to handle index signature types differently in ThisSig.
 **/
type IsRecord<T> = T extends {[K: string|symbol]: Any} ? string extends keyof T ? true : false : false;

/**	Get the union of all types for a given property key across all union members.
	This creates a union of all possible types that a property K can have in any branch of T.

	Example: For `{a: string} | {a: number, b: boolean}` and key 'a',
	PropertyType is `string | number`.
 **/
type PropertyType<T, K extends PropertyKey> = T extends Any ? (K extends keyof T ? T[K] : never) : never;

/**	Keys that exist in Sig (to exclude from signal accessors).
	These are the built-in signal methods and properties that should not be treated as value properties.
	Includes things like 'value', 'set', 'subscribe', 'convert', etc.
 **/
type SignalCoreKeys = keyof Sig<Any>;
