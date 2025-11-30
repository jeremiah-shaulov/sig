# `type` ValueOrPromise\<T>

[Documentation Index](../README.md)

A value or a Promise that resolves to a value.
This allows signal computations to be either synchronous or asynchronous.

`type` ValueOrPromise\<T> = [Value](../private.type.Value/README.md)\<T> | Promise\<[Value](../private.type.Value/README.md)\<T>>