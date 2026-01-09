# `const` `enum` Flags

[Documentation Index](../README.md)

Internal flags tracking signal state.

`flags & Flags.ValueStatusMask` - Computation status:
- `Value`: The signal's value is current and valid.
- `WantRecomp`: The signal is stale and needs recomputation.
- `RecompInProgress`: Currently computing, prevent redundant recomputations.

`flags & Flags.IsErrorSignal` - Whether this signal treats Error as a value (for sig.error).
`flags & Flags.HasOnChangePositive` - Cached result: whether this signal has onChange listeners.
`flags & ~Flags.FlagsMask` - Global onChange version number for cache invalidation.

#### ValueStatusMask = <mark>3</mark>



#### Value = <mark>0</mark>



#### WantRecomp = <mark>1</mark>



#### RecompInProgress = <mark>2</mark>



#### FlagsLowMask = <mark>3</mark>



#### HasOnChangePositive = <mark>4</mark>



#### FlagsMask = <mark>7</mark>



#### OnChangeVersionStep = <mark>8</mark>



