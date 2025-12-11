# `class` ValueHolder\<T>

[Documentation Index](../README.md)

Base class for storing signal values and managing their state.
Provides core functionality for value storage, retrieval, and updates.
Subclasses extend this to handle promises and computed values.

## This class has

- [constructor](#-constructorflagsandonchangeversion-flags-value-t-defaultvalue-t)
- 3 properties:
[flagsAndOnchangeVersion](#-flagsandonchangeversion-flags),
[value](#-value-t),
[defaultValue](#-defaultvalue-t)
- 6 methods:
[get](#-get_ownersig-sigt-t),
[getPromise](#-getpromise-promiset),
[getError](#-geterror-error),
[set](#-setownersig-sigt-compvalue-valueorpromiset--compvaluet-cancelcomp-cancelcompt-comptype),
[recomp](#-recomp_ownersig-sigt-_knowntobechanged-booleanfalse-_cause-sigunknown-_nocancelcomp-booleanfalse-comptype),
[doSetValue](#-dosetvalueownersig-sigt-newvalue-t-knowntobechanged-booleanfalse-comptype)


#### 🔧 `constructor`(flagsAndOnchangeVersion: [Flags](../private.enum.Flags/README.md), value: T, defaultValue: T)



#### 📄 flagsAndOnchangeVersion: [Flags](../private.enum.Flags/README.md)



#### 📄 value: T



#### 📄 defaultValue: T



#### ⚙ get(\_ownerSig: [Sig](../class.Sig/README.md)\<T>): T



#### ⚙ getPromise(): Promise\<T>

> Returns the active promise if this signal is in promise state.
> For non-promise signals, always returns undefined.



#### ⚙ getError(): Error

> Returns the Error object if this signal is in error state.
> For non-error signals, always returns undefined.



#### ⚙ set(ownerSig: [Sig](../class.Sig/README.md)\<T>, compValue: [ValueOrPromise](../private.type.ValueOrPromise/README.md)\<T> | [CompValue](../private.type.CompValue/README.md)\<T>, cancelComp?: [CancelComp](../private.type.CancelComp/README.md)\<T>): [CompType](../private.enum.CompType/README.md)

> Sets a new value for the signal, potentially converting the ValueHolder type.
> Converts to ValueHolderComp for functions/signals, ValueHolderPromise for promises/errors.
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



#### ⚙ recomp(\_ownerSig: [Sig](../class.Sig/README.md)\<T>, \_knownToBeChanged: `boolean`=false, \_cause?: [Sig](../class.Sig/README.md)\<`unknown`>, \_noCancelComp: `boolean`=false): [CompType](../private.enum.CompType/README.md)



#### ⚙ doSetValue(ownerSig: [Sig](../class.Sig/README.md)\<T>, newValue: T, knownToBeChanged: `boolean`=false): [CompType](../private.enum.CompType/README.md)

> Updates a signal's value and manages state transitions.
> Handles transitions between value/promise/error states.
> Performs deep equality checks to determine if change notifications are needed.
> Schedules onChange callbacks and dependent signal recomputations.
> 
> 🎚️ Parameter **ownerSig**:
> 
> Signal to update
> 
> 🎚️ Parameter **newValue**:
> 
> New value (not promise or error for base class)
> 
> 🎚️ Parameter **knownToBeChanged**:
> 
> Skip equality check if we know it changed
> 
> 🎚️ Parameter **bySetter**:
> 
> Whether this update came from a setter function
> 
> ✔️ Return value:
> 
> Flags indicating what changed (value/promise/error)



