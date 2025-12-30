# `class` ValueHolderComp\<T> `extends` [ValueHolderPromise](../private.class.ValueHolderPromise/README.md)\<T>

[Documentation Index](../README.md)

ValueHolder for computed signals with computation functions.
Manages lazy recomputation, dependency tracking, and optional setter functions.
Automatically recomputes when dependencies change or when accessed if stale.

## This class has

- [constructor](#-constructorflagsandonchangeversion-flags-prevvalue-t-defaultvalue-t-dependonme-dependonme--undefined-onchangecallbacks-arrayonchangeunknown--weakrefonchangeunknown--undefined-id-number-prevpromiseorerror-promiset--error--undefined-cancelcomp-cancelcompt--undefined-compvalue-sigt--compvaluet-idependon-sigany-setvalue-setvaluet)
- 3 properties:
[compValue](#-compvalue-sigt--compvaluet),
[iDependOn](#-idependon-sigany),
[setValue](#-setvalue-setvaluet)
- 3 methods:
[get](#-override-getownersig-sigt-t),
[set](#-override-setownersig-sigt-compvalue-valueorpromiset--compvaluet-cancelcomp-cancelcompt-comptype),
[recomp](#-recompownersig-sigcompt-knowntobechanged-booleanfalse-cause-sigunknown-nocancelcomp-booleanfalse-comptype)
- 5 inherited members from [ValueHolderPromise](../private.class.ValueHolderPromise/README.md), 6 from [ValueHolder](../private.class.ValueHolder/README.md)


#### 🔧 `constructor`(flagsAndOnchangeVersion: [Flags](../private.enum.Flags/README.md), prevValue: T, defaultValue: T, dependOnMe: [DependOnMe](../private.type.DependOnMe/README.md) | `undefined`, onChangeCallbacks: Array\<[OnChange](../private.type.OnChange/README.md)\<`unknown`> | WeakRef\<[OnChange](../private.type.OnChange/README.md)\<`unknown`>>> | `undefined`, id: `number`, prevPromiseOrError: Promise\<T> | Error | `undefined`, cancelComp: [CancelComp](../private.type.CancelComp/README.md)\<T> | `undefined`, compValue: [Sig](../class.Sig/README.md)\<T> | [CompValue](../private.type.CompValue/README.md)\<T>, iDependOn?: [Sig](../class.Sig/README.md)\<[Any](../private.type.Any/README.md)>\[], setValue?: [SetValue](../private.type.SetValue/README.md)\<T>)



#### 📄 compValue: [Sig](../class.Sig/README.md)\<T> | [CompValue](../private.type.CompValue/README.md)\<T>



#### 📄 iDependOn?: [Sig](../class.Sig/README.md)\<[Any](../private.type.Any/README.md)>\[]

> Signals that this signal depends on, along with what aspects (value/promise/error) were observed.
> When a dependency changes, we check if the observed aspect changed to determine if recomputation is needed.



#### 📄 setValue?: [SetValue](../private.type.SetValue/README.md)\<T>



#### ⚙ `override` get(ownerSig: [Sig](../class.Sig/README.md)\<T>): T

> Gets the signal's value, triggering recomputation if needed.
> This ensures computed signals are always up-to-date when accessed.



#### ⚙ `override` set(ownerSig: [Sig](../class.Sig/README.md)\<T>, compValue: [ValueOrPromise](../private.type.ValueOrPromise/README.md)\<T> | [CompValue](../private.type.CompValue/README.md)\<T>, cancelComp?: [CancelComp](../private.type.CancelComp/README.md)\<T>): [CompType](../private.enum.CompType/README.md)

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



#### ⚙ recomp(ownerSig: [SigComp](../private.type.SigComp/README.md)\<T>, knownToBeChanged: `boolean`=false, cause?: [Sig](../class.Sig/README.md)\<`unknown`>, noCancelComp: `boolean`=false): [CompType](../private.enum.CompType/README.md)

> Recomputes a signal's value if it needs recomputation.
> This is the core computation function that:
> 1. Checks if recomputation is needed (WantRecomp flag)
> 2. Removes old dependencies
> 3. Executes the computation function with dependency tracking
> 4. Establishes new dependencies
> 5. Updates the value and triggers notifications
> 
> 🎚️ Parameter **ownerSig**:
> 
> Signal to recompute
> 
> 🎚️ Parameter **knownToBeChanged**:
> 
> Whether we know the value changed (skips equality check)
> 
> 🎚️ Parameter **cause**:
> 
> The signal that triggered this recomputation (for debugging)
> 
> 🎚️ Parameter **noCancelComp**:
> 
> Skip calling the cancel function for pending promises
> 
> ✔️ Return value:
> 
> Flags indicating what changed (value/promise/error)



