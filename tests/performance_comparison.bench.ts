/**	Performance Comparison: Local Signals vs Preact Signals

	This benchmark suite compares the performance characteristics of the local
	signals implementation against Preact's @preact/signals-core across various
	use cases.
 **/

import {type Sig, sig, batch} from '../mod.ts';
import {signal, computed, effect, batch as prBatch} from './deps.ts';

// =============================================================================
// Benchmark 1: Basic Signal Operations
// =============================================================================

Deno.bench
(	{	name: 'Local - Create signal',
		group: 'basic-create',
		baseline: true,
		fn()
		{	for (let i = 0; i < 1000; i++)
			{	sig(i);
			}
		},
	}
);

Deno.bench
(	{	name: 'Preact - Create signal',
		group: 'basic-create',
		fn()
		{	for (let i = 0; i < 1000; i++)
			{	signal(i);
			}
		},
	}
);

Deno.bench
(	{	name: 'Local - Read signal',
		group: 'basic-read',
		baseline: true,
		fn()
		{	const s = sig(42);
			for (let i = 0; i < 1000; i++)
			{	s.value;
			}
		},
	}
);

Deno.bench
(	{	name: 'Preact - Read signal',
		group: 'basic-read',
		fn()
		{	const s = signal(42);
			for (let i = 0; i < 1000; i++)
			{	s.value;
			}
		},
	}
);

Deno.bench
(	{	name: 'Local - Write signal',
		group: 'basic-write',
		baseline: true,
		fn()
		{	const s = sig(0);
			for (let i = 0; i < 1000; i++)
			{	s.value = i;
			}
		},
	}
);

Deno.bench
(	{	name: 'Preact - Write signal',
		group: 'basic-write',
		fn()
		{	const s = signal(0);
			for (let i = 0; i < 1000; i++)
			{	s.value = i;
			}
		},
	}
);

// =============================================================================
// Benchmark 2: Computed Signals (Shallow)
// =============================================================================

Deno.bench
(	{	name: 'Local - Computed (1 dependency)',
		group: 'computed-shallow',
		baseline: true,
		fn()
		{	const a = sig(1);
			const b = sig(() => a.value * 2);

			for (let i = 0; i < 100; i++)
			{	a.value = i;
				b.value; // Read to trigger computation
			}
		},
	}
);

Deno.bench
(	{	name: 'Preact - Computed (1 dependency)',
		group: 'computed-shallow',
		fn()
		{	const a = signal(1);
			const b = computed(() => a.value * 2);

			for (let i = 0; i < 100; i++)
			{	a.value = i;
				b.value; // Read to trigger computation
			}
		},
	}
);

Deno.bench
(	{	name: 'Local - Computed (3 dependencies)',
		group: 'computed-multi',
		baseline: true,
		fn()
		{	const a = sig(1);
			const b = sig(2);
			const c = sig(3);
			const sum = sig(() => a.value + b.value + c.value);

			for (let i = 0; i < 100; i++)
			{	a.value = i;
				b.value = i + 1;
				c.value = i + 2;
				sum.value;
			}
		},
	}
);

Deno.bench
(	{	name: 'Preact - Computed (3 dependencies)',
		group: 'computed-multi',
		fn()
		{	const a = signal(1);
			const b = signal(2);
			const c = signal(3);
			const sum = computed(() => a.value + b.value + c.value);

			for (let i = 0; i < 100; i++)
			{	a.value = i;
				b.value = i + 1;
				c.value = i + 2;
				sum.value;
			}
		},
	}
);

// =============================================================================
// Benchmark 3: Deep Computed Chains
// =============================================================================

Deno.bench
(	{	name: 'Local - Computed chain (depth 10)',
		group: 'computed-chain',
		baseline: true,
		fn()
		{	const s0 = sig(1);
			const s1 = sig(() => s0.value + 1, 0);
			const s2 = sig(() => s1.value + 1, 0);
			const s3 = sig(() => s2.value + 1, 0);
			const s4 = sig(() => s3.value + 1, 0);
			const s5 = sig(() => s4.value + 1, 0);
			const s6 = sig(() => s5.value + 1, 0);
			const s7 = sig(() => s6.value + 1, 0);
			const s8 = sig(() => s7.value + 1, 0);
			const s9 = sig(() => s8.value + 1, 0);

			for (let i = 0; i < 100; i++)
			{	s0.value = i;
				s9.value;
			}
		},
	}
);

Deno.bench
(	{	name: 'Preact - Computed chain (depth 10)',
		group: 'computed-chain',
		fn()
		{	const s0 = signal(1);
			const s1 = computed(() => s0.value + 1);
			const s2 = computed(() => s1.value + 1);
			const s3 = computed(() => s2.value + 1);
			const s4 = computed(() => s3.value + 1);
			const s5 = computed(() => s4.value + 1);
			const s6 = computed(() => s5.value + 1);
			const s7 = computed(() => s6.value + 1);
			const s8 = computed(() => s7.value + 1);
			const s9 = computed(() => s8.value + 1);

			for (let i = 0; i < 100; i++)
			{	s0.value = i;
				s9.value;
			}
		},
	}
);

// =============================================================================
// Benchmark 4: Diamond Dependencies
// =============================================================================

Deno.bench
(	{	name: 'Local - Diamond dependency',
		group: 'diamond',
		baseline: true,
		fn()
		{	const root = sig(1);
			const left = sig(() => root.value * 2, 0);
			const right = sig(() => root.value * 3, 0);
			const bottom = sig(() => left.value + right.value, 0);

			for (let i = 0; i < 100; i++)
			{	root.value = i;
				bottom.value;
			}
		},
	}
);

Deno.bench
(	{	name: 'Preact - Diamond dependency',
		group: 'diamond',
		fn()
		{	const root = signal(1);
			const left = computed(() => root.value * 2);
			const right = computed(() => root.value * 3);
			const bottom = computed(() => left.value + right.value);

			for (let i = 0; i < 100; i++)
			{	root.value = i;
				bottom.value;
			}
		},
	}
);

// =============================================================================
// Benchmark 5: Wide Dependencies
// =============================================================================

Deno.bench
(	{	name: 'Local - Wide dependencies (20 inputs)',
		group: 'wide',
		baseline: true,
		fn()
		{	const signals = Array.from({ length: 20 }, (_, i) => sig(i));
			const sum = sig(() => signals.reduce((acc, s) => acc + s.value, 0));

			for (let i = 0; i < 50; i++)
			{	signals[i % 20].value = i;
				sum.value;
			}
		},
	}
);

Deno.bench
(	{	name: 'Preact - Wide dependencies (20 inputs)',
		group: 'wide',
		fn()
		{	const signals = Array.from({ length: 20 }, (_, i) => signal(i));
			const sum = computed(() => signals.reduce((acc, s) => acc + s.value, 0));

			for (let i = 0; i < 50; i++)
			{	signals[i % 20].value = i;
				sum.value;
			}
		},
	}
);

// =============================================================================
// Benchmark 6: Batched Updates
// =============================================================================

Deno.bench
(	{	name: 'Local - Batch updates',
		group: 'batch',
		baseline: true,
		fn()
		{	const a = sig(1);
			const b = sig(2);
			const c = sig(3);
			const sum = sig(() => a.value + b.value + c.value, 0);
			let execCount = 0;
			const callback = () => execCount++;
			sum.subscribe(callback);

			for (let i = 0; i < 100; i++)
			{	batch(() =>
				{	a.value = i;
					b.value = i + 1;
					c.value = i + 2;
				});
			}

			// Wait for microtask flush
			return new Promise(resolve => queueMicrotask(() =>
			{	sum.unsubscribe(callback);
				resolve();
			}));
		},
	}
);

Deno.bench
(	{	name: 'Preact - Batch updates',
		group: 'batch',
		fn()
		{	const a = signal(1);
			const b = signal(2);
			const c = signal(3);
			const sum = computed(() => a.value + b.value + c.value);
			let execCount = 0;
			effect(() =>
			{	sum.value;
				execCount++;
			});

			for (let i = 0; i < 100; i++)
			{	prBatch(() =>
				{	a.value = i;
					b.value = i + 1;
					c.value = i + 2;
				});
			}
		},
	}
);

// =============================================================================
// Benchmark 7: Property Access
// =============================================================================

Deno.bench
(	{	name: 'Local - Property signals (auto)',
		group: 'properties',
		baseline: true,
		fn()
		{	const obj = sig({ x: 1, y: 2, z: 3 });
			const sum = sig(() => obj.value!.x + obj.value!.y + obj.value!.z, 0);

			for (let i = 0; i < 100; i++)
			{	obj.this.x.set(i);
				obj.this.y.set(i + 1);
				obj.this.z.set(i + 2);
				sum.value;
			}
		},
	}
);

Deno.bench
(	{	name: 'Preact - Property computed (manual)',
		group: 'properties',
		fn()
		{	const obj = signal({ x: 1, y: 2, z: 3 });
			const x = computed(() => obj.value.x);
			const y = computed(() => obj.value.y);
			const z = computed(() => obj.value.z);
			const sum = computed(() => x.value + y.value + z.value);

			for (let i = 0; i < 100; i++)
			{	obj.value = { x: i, y: i + 1, z: i + 2 };
				sum.value;
			}
		},
	}
);

// =============================================================================
// Benchmark 8: Nested Property Access
// =============================================================================

Deno.bench
(	{	name: 'Local - Nested properties',
		group: 'nested',
		baseline: true,
		fn()
		{	const obj = sig({ a: { b: { c: 42 } } });
			const value = sig(() => obj.value!.a.b.c);

			for (let i = 0; i < 100; i++)
			{	obj.this.a.b.c.set(i);
				value.value;
			}
		},
	}
);

Deno.bench
(	{	name: 'Preact - Nested properties',
		group: 'nested',
		fn()
		{	const obj = signal({ a: { b: { c: 42 } } });
			const value = computed(() => obj.value.a.b.c);

			for (let i = 0; i < 100; i++)
			{	obj.value = { a: { b: { c: i } } };
				value.value;
			}
		},
	}
);

// =============================================================================
// Benchmark 9: Array Operations
// =============================================================================

Deno.bench
(	{	name: 'Local - Array mutations (.mut)',
		group: 'array-mut',
		baseline: true,
		fn()
		{	const arr = sig<number[]>([]);
			const len = sig(() => arr.value!.length, 0);

			for (let i = 0; i < 100; i++)
			{	arr.mut.push(i);
				len.value;
			}
		},
	}
);

Deno.bench
(	{	name: 'Preact - Array mutations (reassign)',
		group: 'array-mut',
		fn()
		{	const arr = signal<number[]>([]);
			const len = computed(() => arr.value.length);

			for (let i = 0; i < 100; i++)
			{	arr.value = [...arr.value, i];
				len.value;
			}
		},
	}
);

Deno.bench
(	{	name: 'Local - Array method signals',
		group: 'array-methods',
		baseline: true,
		fn()
		{	const arr = sig([1, 2, 3, 4, 5]);
			const sliced = arr.this.slice(1, 4);
			const mapped = arr.this.map((x: number) => x * 2);

			for (let i = 0; i < 100; i++)
			{	arr.value = [i, i + 1, i + 2, i + 3, i + 4];
				sliced.value;
				mapped.value;
			}
		},
	}
);

Deno.bench
(	{	name: 'Preact - Array method computed',
		group: 'array-methods',
		fn()
		{	const arr = signal([1, 2, 3, 4, 5]);
			const sliced = computed(() => arr.value.slice(1, 4));
			const mapped = computed(() => arr.value.map((x: number) => x * 2));

			for (let i = 0; i < 100; i++)
			{	arr.value = [i, i + 1, i + 2, i + 3, i + 4];
				sliced.value;
				mapped.value;
			}
		},
	}
);

// =============================================================================
// Benchmark 10: Effects / Change Listeners
// =============================================================================

Deno.bench
(	{	name: 'Local - onChange listeners',
		group: 'effects',
		baseline: true,
		fn()
		{	const s = sig(0);
			let sum = 0;
			function callback(this: Sig<number>) { sum += this.value; }
			s.subscribe(callback);

			for (let i = 0; i < 100; i++)
			{	s.value = i;
			}

			return new Promise(resolve => queueMicrotask(() =>
			{	s.unsubscribe(callback);
				resolve();
			}));
		},
	}
);

Deno.bench
(	{	name: 'Preact - effect',
		group: 'effects',
		fn()
		{	const s = signal(0);
			let sum = 0;
			effect(() => { sum += s.value; });

			for (let i = 0; i < 100; i++)
			{	s.value = i;
			}
		},
	}
);

// =============================================================================
// Benchmark 11: Memory Churn (Create/Destroy)
// =============================================================================

Deno.bench
(	{	name: 'Local - Signal lifecycle (1000 signals)',
		group: 'lifecycle',
		baseline: true,
		fn()
		{	const signals = [];
			for (let i = 0; i < 1000; i++)
			{	signals.push(sig(i));
			}
			// Let them be GC'd
			signals.length = 0;
		},
	}
);

Deno.bench
(	{	name: 'Preact - Signal lifecycle (1000 signals)',
		group: 'lifecycle',
		fn()
		{	const signals = [];
			for (let i = 0; i < 1000; i++)
			{	signals.push(signal(i));
			}
			// Let them be GC'd
			signals.length = 0;
		},
	}
);

// =============================================================================
// Benchmark 12: Async Operations (Local only)
// =============================================================================

Deno.bench
(	{	name: 'Local - Promise resolution',
		group: 'async',
		baseline: true,
		fn: async () =>
		{	const promises = [];
			for (let i = 0; i < 10; i++)
			{	const s = sig(Promise.resolve(i));
				promises.push(s.promise);
			}
			await Promise.all(promises);
		},
	}
);

Deno.bench
(	{	name: 'Local - Async computed with sync()',
		group: 'async-computed',
		baseline: true,
		fn: async () =>
		{	const a = sig(1);
			const b = sig(2);
			const asyncSum = sig(async (sync) =>
			{	const valA = a.value;
				await Promise.resolve();
				sync();
				const valB = b.value;
				return valA + valB;
			});

			for (let i = 0; i < 10; i++)
			{	a.set(i);
				await asyncSum.promise;
			}
		},
	}
);

// =============================================================================
// Benchmark 13: Real-World Scenario - Form Validation
// =============================================================================

Deno.bench
(	{	name: 'Local - Form validation',
		group: 'form',
		baseline: true,
		fn()
		{	const email = sig('');
			const password = sig('');
			const confirmPassword = sig('');

			const emailValid = sig(() =>
			{	const value = email.value;
				return value.includes('@') && value.includes('.');
			});

			const passwordValid = sig(() => password.value.length >= 8);

			const passwordsMatch = sig(() =>
				password.value === confirmPassword.value
			);

			const formValid = sig(() =>
				emailValid.value && passwordValid.value && passwordsMatch.value
			);

			for (let i = 0; i < 100; i++)
			{	email.value = `user${i}@example.com`;
				password.value = `password${i}`;
				confirmPassword.value = `password${i}`;
				formValid.value;
			}
		},
	}
);

Deno.bench
(	{	name: 'Preact - Form validation',
		group: 'form',
		fn()
		{	const email = signal('');
			const password = signal('');
			const confirmPassword = signal('');

			const emailValid = computed(() =>
			{	const value = email.value;
				return value.includes('@') && value.includes('.');
			});

			const passwordValid = computed(() => password.value.length >= 8);

			const passwordsMatch = computed(() =>
				password.value === confirmPassword.value
			);

			const formValid = computed(() =>
				emailValid.value && passwordValid.value && passwordsMatch.value
			);

			for (let i = 0; i < 100; i++)
			{	email.value = `user${i}@example.com`;
				password.value = `password${i}`;
				confirmPassword.value = `password${i}`;
				formValid.value;
			}
		},
	}
);

// =============================================================================
// Benchmark 14: Real-World Scenario - Data Grid Updates
// =============================================================================

interface Row
{	id: number;
	name: string;
	value: number;
	selected: boolean;
}

Deno.bench
(	{	name: 'Local - Data grid (100 rows)',
		group: 'data-grid',
		baseline: true,
		fn()
		{	const rows = sig<Row[]>
			(	Array.from({ length: 100 }, (_, i) =>
				({	id: i,
					name: `Row ${i}`,
					value: i * 10,
					selected: false,
				}))
			);

			const selectedCount = sig(() =>
				rows.value!.filter((r: Row) => r.selected).length
			, 0);

			const totalValue = sig(() =>
				rows.value!
					.filter((r: Row) => r.selected)
					.reduce((sum: number, r: Row) => sum + r.value, 0)
			, 0);

			for (let i = 0; i < 50; i++)
			{	const current = rows.value;
				const updated = current!.map((r: Row, idx: number) =>
				({	...r,
					selected: idx % 2 === i % 2,
				}));
				rows.value = updated;
				selectedCount.value;
				totalValue.value;
			}
		},
	}
);

Deno.bench
(	{	name: 'Preact - Data grid (100 rows)',
		group: 'data-grid',
		fn()
		{	const rows = signal<Row[]>
			(	Array.from({ length: 100 }, (_, i) =>
				({	id: i,
					name: `Row ${i}`,
					value: i * 10,
					selected: false,
				}))
			);

			const selectedCount = computed(() =>
				rows.value.filter((r: Row) => r.selected).length
			);

			const totalValue = computed(() =>
				rows.value
					.filter((r: Row) => r.selected)
					.reduce((sum: number, r: Row) => sum + r.value, 0)
			);

			for (let i = 0; i < 50; i++)
			{	const current = rows.value;
				const updated = current.map((r: Row, idx: number) =>
				({	...r,
					selected: idx % 2 === i % 2,
				}));
				rows.value = updated;
				selectedCount.value;
				totalValue.value;
			}
		},
	}
);

// =============================================================================
// Benchmark 15: Real-World Scenario - Shopping Cart
// =============================================================================

interface CartItem
{	id: number;
	name: string;
	price: number;
	quantity: number;
}

Deno.bench
(	{	name: 'Local - Shopping cart',
		group: 'shopping-cart',
		baseline: true,
		fn()
		{	const items = sig<CartItem[]>([]);
			const subtotal = sig(() =>
				items.value!.reduce((sum: number, item: CartItem) => sum + item.price * item.quantity, 0)
			, 0);

			const tax = sig(() => subtotal.value * 0.1, 0);
			const shipping = sig(() => subtotal.value > 50 ? 0 : 5, 0);
			const total = sig(() => subtotal.value + tax.value + shipping.value, 0);

			// Add items
			for (let i = 0; i < 10; i++)
			{	items.mut.push
				({	id: i,
					name: `Item ${i}`,
					price: 10 + i,
					quantity: 1,
				});
				total.value;
			}

			// Update quantities
			for (let i = 0; i < 10; i++)
			{	const current = items.value;
				const updated = current!.map((item: CartItem, idx: number) =>
					idx === i ? { ...item, quantity: item.quantity + 1 } : item
				);
				items.value = updated;
				total.value;
			}
		},
	}
);

Deno.bench
(	{	name: 'Preact - Shopping cart',
		group: 'shopping-cart',
		fn()
		{	const items = signal<CartItem[]>([]);

			const subtotal = computed(() =>
				items.value.reduce((sum: number, item: CartItem) => sum + item.price * item.quantity, 0)
			);

			const tax = computed(() => subtotal.value * 0.1);
			const shipping = computed(() => subtotal.value > 50 ? 0 : 5);
			const total = computed(() => subtotal.value + tax.value + shipping.value);

			// Add items
			for (let i = 0; i < 10; i++)
			{	items.value = [...items.value,
				{	id: i,
					name: `Item ${i}`,
					price: 10 + i,
					quantity: 1,
				}];
				total.value;
			}

			// Update quantities
			for (let i = 0; i < 10; i++)
			{	const current = items.value;
				const updated = current.map((item, idx) =>
					idx === i ? { ...item, quantity: item.quantity + 1 } : item
				);
				items.value = updated;
				total.value;
			}
		},
	}
);

// =============================================================================
// Benchmark 16: Conditional Dependencies
// =============================================================================

Deno.bench
(	{	name: 'Local - Conditional dependencies',
		group: 'conditional',
		baseline: true,
		fn()
		{	const condition = sig(true);
			const a = sig(10);
			const b = sig(20);
			const result = sig(() => condition.value ? a.value : b.value);

			for (let i = 0; i < 100; i++)
			{	if (i % 3 === 0)
				{	condition.value = !condition.value;
				}
				a.value = i;
				b.value = i * 2;
				result.value;
			}
		},
	}
);

Deno.bench
(	{	name: 'Preact - Conditional dependencies',
		group: 'conditional',
		fn()
		{	const condition = signal(true);
			const a = signal(10);
			const b = signal(20);
			const result = computed(() => condition.value ? a.value : b.value);

			for (let i = 0; i < 100; i++)
			{	if (i % 3 === 0)
				{	condition.value = !condition.value;
				}
				a.value = i;
				b.value = i * 2;
				result.value;
			}
		},
	}
);

// =============================================================================
// Benchmark 17: Large Object Graph
// =============================================================================

Deno.bench
(	{	name: 'Local - Large object graph (1000 signals)',
		group: 'large-graph',
		baseline: true,
		fn()
		{	// Create a large dependency graph
			const base = Array.from({ length: 100 }, (_, i) => sig(i));
			const layer1 = Array.from({ length: 100 }, (_, i) =>
				sig(() => base[i].value * 2)
			);
			const layer2 = Array.from({ length: 100 }, (_, i) =>
				sig(() => layer1[i].value! + 1, 0)
			);
			const final = sig(() =>
				layer2.reduce((sum: number, s) => sum + s.value, 0)
			, 0);

			// Update base signals
			for (let i = 0; i < 10; i++)
			{	base[i % 100].value = i;
			}

			final.value;
		},
	}
);

Deno.bench
(	{	name: 'Preact - Large object graph (1000 signals)',
		group: 'large-graph',
		fn()
		{	const base = Array.from({ length: 100 }, (_, i) => signal(i));
			const layer1 = Array.from({ length: 100 }, (_, i) =>
				computed(() => base[i].value * 2)
			);
			const layer2 = Array.from({ length: 100 }, (_, i) =>
				computed(() => layer1[i].value + 1)
			);
			const final = computed(() =>
				layer2.reduce((sum, s) => sum + s.value, 0)
			);

			for (let i = 0; i < 10; i++)
			{	base[i % 100].value = i;
			}

			final.value;
		},
	}
);
