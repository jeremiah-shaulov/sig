# `function` \_deepEquals

[Documentation Index](../README.md)

```ts
import {_deepEquals} from "jsr:@shaulov/sig@0.0.9"
```

`function` \_deepEquals(a: `unknown`, b: `unknown`): `boolean`

Performs a deep equality comparison between two values.
This function compares primitive values, arrays, and objects recursively.
It handles circular references and compares object properties including getters.

🎚️ Parameter **a**:

- The first value to compare

🎚️ Parameter **b**:

- The second value to compare

✔️ Return value:

`true` if the values are deeply equal, `false` otherwise

