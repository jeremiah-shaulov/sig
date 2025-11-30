import {type Sig} from './sig.ts';

// deno-lint-ignore no-explicit-any
type Any = any;

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

type NotNull<T> = Exclude<T, null|undefined>;
type NotNever<T> = Exclude<T, never>;

/**	Transforms function arguments to allow either static values or signals of those values.
	This enables method calls on signal properties to accept both regular values and signals as arguments.
	If an argument is already a Sig type, it remains as-is; otherwise, it can be either the value or a Sig of that value.
 **/
type ArgOrSignal<Args extends Any[]> = {[K in keyof Args]: Args[K] extends Sig<Any> ? Args[K] : Args[K]|Sig<Args[K]>};

type SignalPropOrMethod<T, Nullable extends boolean> =
	 T extends ((...args: infer Args) => infer Ret) ?
		(...args: ArgOrSignal<Args>) => ThisSig<Nullable extends true ? Ret|undefined : Ret> :
		ThisSig<Nullable extends true ? T|undefined : T>;

/**	Check if a key K is required in all branches of union T.
	Used to distinguish between properties that exist in all union members vs. only some.
 **/
type IsRequiredKey<T, K extends PropertyKey> =
	T extends Any
		? K extends keyof T
			? true
			: false
		: never;

/**	A key is common if it's required in all branches (not just some).
	Common keys can be accessed without undefined in the result type.
 **/
type CommonKeys<T> = {
	[K in AllKeys<T>]: [IsRequiredKey<T, K>] extends [true] ? K : never
}[AllKeys<T>];

/**	Properties that exist in at least one union member.
	This gathers all possible property keys across all branches of a union type.
 **/
type AllKeys<T> = T extends Any ? string extends keyof T ? never : keyof T : never;

type IsRecord<T> = T extends {[K: string|symbol]: Any} ? string extends keyof T ? true : false : false;

/**	Get the union of all types for a given property key across all union members.
	This creates a union of all possible types that a property K can have in any branch of T.
 **/
type PropertyType<T, K extends PropertyKey> = T extends Any ? (K extends keyof T ? T[K] : never) : never;

/**	Keys that exist in Sig (to exclude from signal accessors).
	These are the built-in signal methods and properties that should not be treated as value properties.
 **/
type SignalCoreKeys = keyof Sig<Any>;
