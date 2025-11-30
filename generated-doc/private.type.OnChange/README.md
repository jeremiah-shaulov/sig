# `type` OnChange\<T>

[Documentation Index](../README.md)

Callback function invoked when a signal's value changes.
Called with the signal as `this` context and receives the previous value or Error.

🎚️ Parameter **prevValue**:

The previous value or Error that the signal held before the change.

`type` OnChange\<T> = (this: [Sig](../class.Sig/README.md)\<T>, prevValue: T | Error) => `void`