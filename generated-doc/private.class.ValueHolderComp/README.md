# `class` ValueHolderComp\<T> `extends` [ValueHolderPromise](../private.class.ValueHolderPromise/README.md)\<T>

[Documentation Index](../README.md)

ValueHolder for computed signals with computation functions.
Manages lazy recomputation, dependency tracking, and optional setter functions.
Automatically recomputes when dependencies change or when accessed if stale.

## This class has

- [constructor](#-constructorflagsandonchangeversion-flags-prevvalue-t-defaultvalue-t-dependonme-dependonme--undefined-onchangecallbacks-arrayonchangeunknown--weakrefonchangeunknown--undefined-id-number-prevpromiseorerror-promiset--error--undefined-cancelcomp-cancelcompt--undefined-compvalue-sigt--compvaluet-setvalue-setvaluet)
- 3 properties:
[iDependOn](#-idependon-sigany),
[compValue](#-compvalue-sigt--compvaluet),
[setValue](#-setvalue-setvaluet)
- 4 methods:
[get](#-override-getownersig-sigt-t),
[adopt](#-override-adoptownersig-sigt-compvalue-valueorpromiset--compvaluet-cancelcomp-cancelcompt-comptype),
[getErrorValue](#-override-geterrorvalueownersig-sigt-error),
[getPromise](#-override-getpromiseownersig-sigt-promiset)
- 3 inherited members from [ValueHolderPromise](../private.class.ValueHolderPromise/README.md), 6 from [ValueHolder](../private.class.ValueHolder/README.md)


#### 🔧 `constructor`(flagsAndOnchangeVersion: [Flags](../private.enum.Flags/README.md), prevValue: T, defaultValue: T, dependOnMe: [DependOnMe](../private.type.DependOnMe/README.md) | `undefined`, onChangeCallbacks: Array\<[OnChange](../private.type.OnChange/README.md)\<`unknown`> | WeakRef\<[OnChange](../private.type.OnChange/README.md)\<`unknown`>>> | `undefined`, id: `number`, prevPromiseOrError: Promise\<T> | Error | `undefined`, cancelComp: [CancelComp](../private.type.CancelComp/README.md)\<T> | `undefined`, compValue: [Sig](../class.Sig/README.md)\<T> | [CompValue](../private.type.CompValue/README.md)\<T>, setValue?: [SetValue](../private.type.SetValue/README.md)\<T>)



#### 📄 iDependOn: [Sig](../class.Sig/README.md)\<`any`>\[]

> Signals that this signal depends on, along with what aspects (value/promise/error) were observed.
> When a dependency changes, we check if the observed aspect changed to determine if recomputation is needed.



#### 📄 compValue: [Sig](../class.Sig/README.md)\<T> | [CompValue](../private.type.CompValue/README.md)\<T>



#### 📄 setValue?: [SetValue](../private.type.SetValue/README.md)\<T>



#### ⚙ `override` get(ownerSig: [Sig](../class.Sig/README.md)\<T>): T

> Gets the signal's value, triggering recomputation if needed.
> This ensures computed signals are always up-to-date when accessed.



#### ⚙ `override` adopt(ownerSig: [Sig](../class.Sig/README.md)\<T>, compValue: [ValueOrPromise](../private.type.ValueOrPromise/README.md)\<T> | [CompValue](../private.type.CompValue/README.md)\<T>, cancelComp?: [CancelComp](../private.type.CancelComp/README.md)\<T>): [CompType](../private.enum.CompType/README.md)

> Sets a new value or computation for a computed signal.
> If this signal has a setValue callback, invokes it and triggers recomputation.
> Otherwise, allows replacing the computation function or converting to static/promise signal.
> 
> 🎚️ Parameter **ownerSig**:
> 
> The signal being updated
> 
> 🎚️ Parameter **compValue**:
> 
> New value, promise, computation function, or signal
> 
> 🎚️ Parameter **cancelComp**:
> 
> Optional cancellation callback for async computations
> 
> ✔️ Return value:
> 
> Flags indicating what changed (value/promise/error)



#### ⚙ `override` getErrorValue(ownerSig: [Sig](../class.Sig/README.md)\<T>): Error

> Returns the Error object if this signal is in error state.



#### ⚙ `override` getPromise(ownerSig: [Sig](../class.Sig/README.md)\<T>): Promise\<T>

> Returns the active promise if this signal is in promise state.
> Used by Sig.promise getter to access the promise without triggering recomputation.



