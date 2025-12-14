# `function` batch

[Documentation Index](../README.md)

```ts
import {batch} from "jsr:@shaulov/sig@0.0.13"
```

`function` batch\<T>(callback: () => T): T

Batches multiple signal updates into a single change cycle.

During normal operation, each signal change immediately triggers recomputation
of dependent signals and invokes onChange callbacks. When making multiple related
signal changes, this can cause unnecessary intermediate computations.

`batch()` defers all dependent recomputations and onChange notifications until
the callback completes. This ensures dependent signals are updated only once
with the final state, improving performance and avoiding intermediate states.

```ts
const sigA = sig(1);
const sigB = sig(2);
const sigC = sig(() => sigA.value + sigB.value);

batch
(	() =>
	{	sigA.value = 10;  // sigC not recomputed yet
		sigB.value = 20;  // sigC not recomputed yet
	}
); // sigC recomputes once here with final values

console.log(sigC.value); // 30
```

Works with both synchronous and asynchronous callbacks. For async callbacks,
batching continues until the returned Promise resolves or rejects.

🎚️ Parameter **callback**:

Function containing signal updates to batch. Can be sync or async.

✔️ Return value:

The return value of the callback (including Promises).

