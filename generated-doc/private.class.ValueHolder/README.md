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
- 5 methods:
[get](#-getownersig-sigt-t),
[getErrorValue](#-geterrorvalueownersig-sigt-error),
[getPromise](#-getpromiseownersig-sigt-promiset),
[set](#-setownersig-sigt-newvalue-t-knowntobechanged-booleanfalse-_bysetter-booleanfalse-comptype),
[adopt](#-adoptownersig-sigt-compvalue-valueorpromiset--compvaluet-cancelcomp-cancelcompt-comptype)


#### 🔧 `constructor`(flagsAndOnchangeVersion: [Flags](../private.enum.Flags/README.md), value: T, defaultValue: T)



#### 📄 flagsAndOnchangeVersion: [Flags](../private.enum.Flags/README.md)



#### 📄 value: T



#### 📄 defaultValue: T



#### ⚙ get(ownerSig: [Sig](../class.Sig/README.md)\<T>): T



#### ⚙ getErrorValue(ownerSig: [Sig](../class.Sig/README.md)\<T>): Error

> Returns the Error object if this signal is in error state.
> For non-error signals, always returns undefined.



#### ⚙ getPromise(ownerSig: [Sig](../class.Sig/README.md)\<T>): Promise\<T>

> Returns the active promise if this signal is in promise state.
> For non-promise signals, always returns undefined.



#### ⚙ set(ownerSig: [Sig](../class.Sig/README.md)\<T>, newValue: T, knownToBeChanged: `boolean`=false, \_bySetter: `boolean`=false): [CompType](../private.enum.CompType/README.md)

> Sets a new value for the signal.
> 
> 🎚️ Parameter **ownerSig**:
> 
> The signal being updated
> 
> 🎚️ Parameter **value**:
> 
> New value
> 
> 🎚️ Parameter **knownToBeChanged**:
> 
> Skip equality check if we know it changed
> 
> ✔️ Return value:
> 
> Flags indicating what changed (value/promise/error)



#### ⚙ adopt(ownerSig: [Sig](../class.Sig/README.md)\<T>, compValue: [ValueOrPromise](../private.type.ValueOrPromise/README.md)\<T> | [CompValue](../private.type.CompValue/README.md)\<T>, cancelComp?: [CancelComp](../private.type.CancelComp/README.md)\<T>): [CompType](../private.enum.CompType/README.md)

> Sets a new value for the signal, potentially upgrading the ValueHolder type.
> Upgrades to ValueHolderComp when given a function or signal (to enable computation).
> Upgrades to ValueHolderPromise when given a promise or error (to track promise/error state).
> For plain values, sets the value directly without changing the ValueHolder type.
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



