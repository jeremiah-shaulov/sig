# `class` ValueHolderPromise\<T> `extends` [ValueHolder](../private.class.ValueHolder/README.md)\<T>

[Documentation Index](../README.md)

ValueHolder that can store promises and errors in addition to regular values.
Manages promise resolution, error states, and async cancellation.
Used for signals created with promises or that can transition to promise/error states.

## This class has

- [constructor](#-constructorflagsandonchangeversion-flags-prevvalue-t-defaultvalue-t-dependonme-dependonme--undefined-onchangecallbacks-arrayonchangeunknown--weakrefonchangeunknown--undefined-id-number-promiseorerror-error--promisevaluet-cancelcomp-cancelcompt)
- 2 properties:
[promiseOrError](#-promiseorerror-promiset--error--undefined),
[cancelComp](#-cancelcomp-cancelcompt)
- 4 methods:
[getPromise](#-override-getpromise-promiset),
[getError](#-override-geterror-error),
[set](#-override-setownersig-sigt-compvalue-valueorpromiset--compvaluet-cancelcomp-cancelcompt-comptype),
[doSetValue](#-override-dosetvalueownersig-sigt-newvalue-t--promiset--error-knowntobechanged-booleanfalse-bysetter-booleanfalse-comptype)
- 7 inherited members from [ValueHolder](../private.class.ValueHolder/README.md)


#### 🔧 `constructor`(flagsAndOnchangeVersion: [Flags](../private.enum.Flags/README.md), prevValue: T, defaultValue: T, dependOnMe: [DependOnMe](../private.type.DependOnMe/README.md) | `undefined`, onChangeCallbacks: Array\<[OnChange](../private.type.OnChange/README.md)\<`unknown`> | WeakRef\<[OnChange](../private.type.OnChange/README.md)\<`unknown`>>> | `undefined`, id: `number`, promiseOrError?: Error | Promise\<[Value](../private.type.Value/README.md)\<T>>, cancelComp?: [CancelComp](../private.type.CancelComp/README.md)\<T>)



#### 📄 promiseOrError: Promise\<T> | Error | `undefined`



#### 📄 cancelComp?: [CancelComp](../private.type.CancelComp/README.md)\<T>



#### ⚙ `override` getPromise(): Promise\<T>

> Returns the active promise if this signal is in promise state.
> Used by Sig.promise getter to access the promise without triggering recomputation.



#### ⚙ `override` getError(): Error

> Returns the Error object if this signal is in error state.
> Used by Sig[_curError] method to access the error without triggering recomputation.



#### ⚙ `override` set(ownerSig: [Sig](../class.Sig/README.md)\<T>, compValue: [ValueOrPromise](../private.type.ValueOrPromise/README.md)\<T> | [CompValue](../private.type.CompValue/README.md)\<T>, cancelComp?: [CancelComp](../private.type.CancelComp/README.md)\<T>): [CompType](../private.enum.CompType/README.md)

> Sets a new value for the signal, potentially converting the ValueHolder type.
> Converts to ValueHolderComp for functions/signals, ValueHolderPromise for promises/errors.



#### ⚙ `override` doSetValue(ownerSig: [Sig](../class.Sig/README.md)\<T>, newValue: T | Promise\<T> | Error, knownToBeChanged: `boolean`=false, bySetter: `boolean`=false): [CompType](../private.enum.CompType/README.md)

> Updates a signal's value and manages state transitions.
> Handles transitions between value/promise/error states.
> Performs deep equality checks to determine if change notifications are needed.
> Schedules onChange callbacks and dependent signal recomputations.
> For promises, sets up resolution handlers to update the signal when resolved/rejected.
> 
> 🎚️ Parameter **ownerSig**:
> 
> Signal to update
> 
> 🎚️ Parameter **newValue**:
> 
> New value, promise, or error
> 
> 🎚️ Parameter **knownToBeChanged**:
> 
> Skip equality check if we know it changed
> 
> 🎚️ Parameter **bySetter**:
> 
> Whether this update came from a setter function (triggers setValue callback)
> 
> ✔️ Return value:
> 
> Flags indicating what changed (value/promise/error)



