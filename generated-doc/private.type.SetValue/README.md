# `type` SetValue\<T>

[Documentation Index](../README.md)

Callback function to set a new value for a computed signal.
Used when creating computed signals that need custom logic for updating their backing value.

`type` SetValue\<T> = (value: T) => `void`