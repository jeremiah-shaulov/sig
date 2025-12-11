# `const` `enum` CompType

[Documentation Index](../README.md)

Flags indicating which aspects of a signal's state were observed during computation.
Used as a bitmask to track what type of changes should trigger recomputation.

- `None`: No observation occurred.
- `Value`: The signal's value was accessed via `sig.value`.
- `Promise`: The signal's promise state was accessed via `sig.promise`.
- `Error`: The signal's error state was accessed via `sig.error`.

When a dependency changes, only signals that observed the changed aspect are recomputed.

#### None = <mark>0</mark>



#### Value = <mark>1</mark>



#### Promise = <mark>2</mark>



#### Error = <mark>4</mark>



