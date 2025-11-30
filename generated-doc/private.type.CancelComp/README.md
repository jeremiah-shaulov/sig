# `type` CancelComp\<T>

[Documentation Index](../README.md)

Callback function to cancel an ongoing async computation.
Invoked when a new computation starts before the previous promise resolves,
allowing cleanup of resources or aborting pending async operations.

🎚️ Parameter **promise**:

The promise from the ongoing computation that is being superseded.

`type` CancelComp\<T> = (promise: Promise\<T>) => `void`