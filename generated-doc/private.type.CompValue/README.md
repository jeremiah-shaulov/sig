# `type` CompValue\<T>

[Documentation Index](../README.md)

Computation function for signals.
The `sync()` callback allows recording dependencies after async operations.
By default, dependencies are tracked only until the first `await` point.
Call `sync()` after each `await` to resume dependency tracking until the next `await`.

🎚️ Parameter **sync**:

Callback to mark synchronization points after `await` to resume dependency tracking.

🎚️ Parameter **cause**:

The signal that triggered this recomputation, if any.

`type` CompValue\<T> = (sync: () => `void`, cause?: [Sig](../class.Sig/README.md)\<`unknown`>) => [ValueOrPromise](../private.type.ValueOrPromise/README.md)\<T>