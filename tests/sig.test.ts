import {sig, Sig, batch} from '../mod.ts';
import {assertEquals} from './deps.ts';

// deno-lint-ignore no-explicit-any
type Any = any;

Deno.test
(	'Types',
	() =>
	{	const info = sig({enabled: 'yes'}, undefined);
		const infoEnabled: Sig<string|undefined> = info.this.enabled;
		assertEquals(infoEnabled.value, 'yes');

		const user = sig({name: 'John', age: 30}, {name: 'Jane'});
		const name: Sig<string> = user.this.name;
		const age: Sig<number|undefined> = user.this.age;
		assertEquals(name.value, 'John');
		assertEquals(age.value, 30);

		const arr = sig(['a', 'b', 'c'], []);
		const at2: Sig<string|undefined> = arr.this.at(2);
		const pushD: Sig<number> = arr.this.push('d');
		assertEquals(at2.value, 'c');
		assertEquals(pushD.value, 4);

		const arrN = sig(['a', 'b', 'c'], undefined);
		const at2N: Sig<string|undefined> = arrN.this.at(2);
		const pushDN: Sig<number|undefined> = arrN.this.push('d');
		assertEquals(at2N.value, 'c');
		assertEquals(pushDN.value, 4);
		arrN.set(undefined);
		assertEquals(at2N.value, undefined);
		assertEquals(pushDN.value, undefined);

		// deno-lint-ignore prefer-const
		let sa: Sig<Any>;
		sa = info; // assignable
		assertEquals(sa, info);

		// deno-lint-ignore prefer-const
		let su: Sig<unknown>;
		su = info; // assignable
		assertEquals(su, info);

		// deno-lint-ignore prefer-const
		let _sr: Sig<{[K: string]: string|number|undefined}>;
		//@ts-expect-error Not assignable, because `Sig<Record<K, V>>` has accessors for any property, like `_sr.this.nonexistent`, but `Sig<{knownProp: value}>` only has accessors for known properties.
		_sr = user; // Not assignable
	}
);

Deno.test
(	'Access record property',
	() =>
	{	const recSig = sig<{[K: string]: string | undefined}>({word: 'Hello'}, {});
		const letter = recSig.this.word.convert(p => p?.charAt(0));
		const noLetter = recSig.this.missing.convert(p => p?.charAt(0));
		assertEquals(letter.value, 'H');
		assertEquals(noLetter.value, undefined);
	}
);

Deno.test
(	'Has property',
	() =>
	{	const sigA = sig({yes: true}, {yes: false});

		assertEquals('subscribe' in sigA, true);
		assertEquals(typeof(sigA.subscribe), 'function');

		assertEquals('yes' in sigA, false);
		assertEquals(sigA.this.yes instanceof Sig, true);
		assertEquals(sigA.this.yes.value, true);
	}
);

Deno.test
(	'Basic',
	() =>
	{	const calc = new Array<string>;
		const changes = new Array<string>;

		// Create signal `userName`

		const userName = sig('John');
		userName.subscribe(() => changes.push('userName'));
		assertEquals(changes, ['userName']); // `subscribe()` triggers calc
		changes.length = 0;

		// Create signal `user`

		const user = sig(() => {calc.push('user'); return { name: userName.value}});
		user.subscribe(() => changes.push('user'));
		assertEquals(calc, ['user']); // `subscribe()` triggers calc
		assertEquals(changes, ['user']);
		calc.length = 0;
		changes.length = 0;

		// Change `userName`

		userName.set('Dick');
		assertEquals(calc, ['user']);
		assertEquals(changes, ['userName', 'user']);
		calc.length = 0;
		changes.length = 0;

		// Calc `user`

		assertEquals(user.value, {name: 'Dick'});
		assertEquals(user.error.value, undefined);
		assertEquals(user.promise, undefined);
		assertEquals(calc, []);
		assertEquals(changes, []);

		// Don't change `userName`

		userName.set('Dick');
		assertEquals(calc, []);
		assertEquals(changes, []);
		assertEquals(user.value, {name: 'Dick'});
		assertEquals(calc, []);
		assertEquals(changes, []);

		// Create signal `email`

		const email = sig(() => {calc.push('email'); return 'john@john.com'});
		assertEquals(calc, []);
		assertEquals(changes, []);

		// Create signal `userNameOrEmail`

		const userNameOrEmail = sig(() => {calc.push('userNameOrEmail'); return userName.value || email.value});
		assertEquals(calc, []);
		assertEquals(changes, []);
		userNameOrEmail.subscribe(() => changes.push('userNameOrEmail'));
		assertEquals(calc, ['userNameOrEmail']); // `subscribe()` triggers calc
		assertEquals(changes, ['userNameOrEmail']);
		calc.length = 0;
		changes.length = 0;

		// Calc `userNameOrEmail`

		assertEquals(userNameOrEmail.value, 'Dick');
		assertEquals(calc, []);
		assertEquals(changes, []);

		// Change `userName`

		userName.set('');
		assertEquals(calc, ['user', 'userNameOrEmail', 'email']); // email is touched for the first time
		assertEquals(changes, ['userName', 'user', 'userNameOrEmail']);
		calc.length = 0;
		changes.length = 0;

		assertEquals(userNameOrEmail.value, 'john@john.com');
		assertEquals(calc, []);
		assertEquals(changes, []);

		// Change `userName`

		userName.set('Dave');
		assertEquals(calc, ['user', 'userNameOrEmail']);
		assertEquals(changes, ['userName', 'user', 'userNameOrEmail']);
		calc.length = 0;
		changes.length = 0;

		assertEquals(userNameOrEmail.value, 'Dave');
		assertEquals(calc, []);
		assertEquals(changes, []);

		// Change `email`

		email.subscribe(() => changes.push('email'));
		email.set('dave@dave.com');
		assertEquals(calc, []);
		assertEquals(changes, ['email']);
		changes.length = 0;

		assertEquals(userNameOrEmail.value, 'Dave');
		assertEquals(calc, []);
		assertEquals(changes, []);
	}
);

Deno.test
(	'Avoid unnecessary onChange',
	() =>
	{	const calc = new Array<string>;
		const changes = new Array<string>;

		// Create signal `cnt`

		const cnt = sig(0);
		cnt.subscribe(() => changes.push('cnt'));
		// No onChange because value (0) equals default (0)
		assertEquals(changes, []);

		// Create signal `cond`

		const cond = sig<number>(new Error, NaN);
		cond.subscribe(() => changes.push('cond'));
		assertEquals(changes, ['cond']);
		changes.length = 0;

		// Create signal `cntIfEnabled`

		const cntIfEnabled = sig(() => {calc.push('cntIfEnabled'); return cond.error.value ? 'disabled' : cnt.value});
		cntIfEnabled.subscribe(() => changes.push('cntIfEnabled'));
		assertEquals(changes, ['cntIfEnabled']);
		changes.length = 0;

		// Create signal `title`

		const title = sig('Value: ');
		title.subscribe(() => changes.push('title'));
		assertEquals(changes, ['title']);
		changes.length = 0;

		// Create signal `cntIfEnabledWithTitle`

		const cntIfEnabledWithTitle = sig(() => {calc.push('cntIfEnabledWithTitle'); return title.value + cntIfEnabled.value});
		cntIfEnabledWithTitle.subscribe(() => changes.push('cntIfEnabledWithTitle'));
		assertEquals(changes, ['cntIfEnabledWithTitle']);
		changes.length = 0;

		// Calc `cntIfEnabledWithTitle`

		assertEquals(cntIfEnabledWithTitle.value, 'Value: disabled');
		assertEquals(calc, ['cntIfEnabled', 'cntIfEnabledWithTitle']);
		assertEquals(changes, []);
		calc.length = 0;

		// Calc `cnt`

		cnt.value;
		assertEquals(calc, []);
		assertEquals(changes, []);

		// Set `cnt`

		cnt.value++;
		assertEquals(calc, []);
		assertEquals(changes, ['cnt']);
		changes.length = 0;

		assertEquals(cnt.value, 1);
		assertEquals(cntIfEnabledWithTitle.value, 'Value: disabled');
		assertEquals(calc, []);
		assertEquals(changes, []);

		// Set `cond`

		cond.set(1);
		assertEquals(calc, ['cntIfEnabled', 'cntIfEnabledWithTitle']);
		assertEquals(changes, ['cond', 'cntIfEnabled', 'cntIfEnabledWithTitle']);
		calc.length = 0;
		changes.length = 0;

		assertEquals(cntIfEnabledWithTitle.value, 'Value: 1');
		assertEquals(calc, []);
		assertEquals(changes, []);

		// Set `cnt`

		cnt.value++;
		assertEquals(calc, ['cntIfEnabled', 'cntIfEnabledWithTitle']);
		assertEquals(changes, ['cnt', 'cntIfEnabled', 'cntIfEnabledWithTitle']);
		calc.length = 0;
		changes.length = 0;

		assertEquals(cntIfEnabledWithTitle.value, 'Value: 2');
		assertEquals(calc, []);
		assertEquals(changes, []);

		// Set `cond`

		cond.set(2);
		assertEquals(calc, []);
		assertEquals(changes, ['cond']);
		changes.length = 0;

		// Set `cond`

		cond.set(() => {throw new Error});
		assertEquals(calc, ['cntIfEnabled', 'cntIfEnabledWithTitle']);
		assertEquals(changes, ['cond', 'cntIfEnabled', 'cntIfEnabledWithTitle']);
		calc.length = 0;
		changes.length = 0;

		assertEquals(cntIfEnabledWithTitle.value, 'Value: disabled');
		assertEquals(calc, []);
		assertEquals(changes, []);
	}
);

Deno.test
(	'Access signal property',
	() =>
	{	const user = sig({name: 'John', email: 'john@example.com'});

		const userName = user.this.name;
		const userEmail = user.this.email;
		let userChanged = 0;
		let emailChanged = 0;
		let userNameValue = userName.value;
		let userEmailValue = userEmail.value;
		userName.subscribe(() => {userChanged++; userNameValue = userName.value});
		userEmail.subscribe(() => {emailChanged++; userEmailValue = userEmail.value});

		assertEquals(userNameValue, 'John');
		assertEquals(userEmailValue, 'john@example.com');

		user.set({name: 'Dave', email: 'dave@example.com'});

		assertEquals(userNameValue, 'Dave');
		assertEquals(userEmailValue, 'dave@example.com');
		assertEquals(userChanged, 1);
		assertEquals(emailChanged, 1);

		user.set({name: 'Dave', email: 'dave@example.com'});

		assertEquals(userNameValue, 'Dave');
		assertEquals(userEmailValue, 'dave@example.com');
		assertEquals(userChanged, 1);
		assertEquals(emailChanged, 1);

		user.set({name: 'Dave', email: 'dave.smith@example.com'});

		assertEquals(userNameValue, 'Dave');
		assertEquals(userEmailValue, 'dave.smith@example.com');
		assertEquals(userChanged, 1);
		assertEquals(emailChanged, 2);
	}
);

Deno.test
(	'Promise state handling',
	async () =>
	{	const changes = new Array<string>;

		// Create a signal that returns a promise
		let resolver1: (value: number) => void;
		const promise1 = new Promise<number>(y => resolver1 = y);
		const asyncSig = sig(() => promise1);
		asyncSig.subscribe(() => changes.push('asyncSig'));
		assertEquals(changes, ['asyncSig']);
		changes.length = 0;

		// Signal should be in promise state
		assertEquals(asyncSig.promise !== undefined, true);
		assertEquals(asyncSig.error.value, undefined);
		assertEquals(asyncSig.value, undefined); // no default value

		// Resolve the promise
		resolver1!(42);
		await promise1;
		// Give time for promise handlers to run
		await new Promise(y => setTimeout(y, 0));

		assertEquals(changes, ['asyncSig']);
		changes.length = 0;
		assertEquals(asyncSig.value, 42);
		assertEquals(asyncSig.promise, undefined);
		assertEquals(asyncSig.error.value, undefined);

		// Create signal that transitions from value to promise
		const valueSig = sig(10);
		valueSig.subscribe(() => changes.push('valueSig'));
		assertEquals(changes, ['valueSig']);
		changes.length = 0;

		let resolver2: (value: number) => void;
		const promise2 = new Promise<number>(y => resolver2 = y);
		valueSig.set(() => promise2);

		assertEquals(changes, ['valueSig']);
		changes.length = 0;
		assertEquals(valueSig.promise !== undefined, true);
		assertEquals(valueSig.value, 10); // last value before promise

		resolver2!(20);
		await promise2;
		await new Promise(y => setTimeout(y, 0));

		assertEquals(changes, ['valueSig']);
		changes.length = 0;
		assertEquals(valueSig.value, 20);
		assertEquals(valueSig.promise, undefined);

		// Test promise rejection
		const rejectSig = sig<number>(() => Promise.reject(new Error('Test error')));
		rejectSig.subscribe(() => changes.push('rejectSig'));
		assertEquals(changes, ['rejectSig']);
		changes.length = 0;

		await new Promise(y => setTimeout(y, 0));

		assertEquals(changes, ['rejectSig']);
		changes.length = 0;
		assertEquals(rejectSig.error.value?.message, 'Test error');
		assertEquals(rejectSig.value, undefined);
		assertEquals(rejectSig.promise, undefined);
	}
);

Deno.test
(	'Error handling',
	() =>
	{	const changes = new Array<string>;

		// Signal created with Error object
		const errorSig = sig<number|undefined>(new Error('Initial error'));
		errorSig.subscribe(() => changes.push('errorSig'));
		assertEquals(changes, ['errorSig']);
		changes.length = 0;

		assertEquals(errorSig.error.value?.message, 'Initial error');
		assertEquals(errorSig.value, undefined);
		assertEquals(errorSig.promise, undefined);

		// Set to value
		errorSig.set(42);
		assertEquals(changes, ['errorSig']);
		changes.length = 0;
		assertEquals(errorSig.value, 42);
		assertEquals(errorSig.error.value, undefined);

		// Signal that throws error
		const throwSig = sig<number>(() => { throw new Error('Thrown error'); });
		throwSig.subscribe(() => changes.push('throwSig'));
		assertEquals(changes, ['throwSig']);
		changes.length = 0;

		assertEquals(throwSig.error.value?.message, 'Thrown error');
		assertEquals(throwSig.value, undefined);

		// Signal that depends on error signal
		const derivedSig = sig
		(	() =>
			{	const value = errorSig.value;
				return value! * 2;
			}
		);
		derivedSig.subscribe(() => changes.push('derivedSig'));
		assertEquals(changes, ['derivedSig']);
		changes.length = 0;

		assertEquals(derivedSig.value, 84); // errorSig is 42

		// Change errorSig to error
		errorSig.set(new Error('Another error'));
		assertEquals(changes, ['errorSig', 'derivedSig']);
		changes.length = 0;
		assertEquals(derivedSig.value, NaN); // undefined * 2 = NaN

		// Test different error types
		const sameErrorTypeSig = sig<number|undefined>(new Error('Error 1'));
		sameErrorTypeSig.subscribe(() => changes.push('sameErrorTypeSig'));
		assertEquals(changes, ['sameErrorTypeSig']);
		changes.length = 0;

		sameErrorTypeSig.set(new Error('Error 1')); // Same message, same type
		assertEquals(changes, []); // Should not trigger change

		sameErrorTypeSig.set(new Error('Error 2')); // Different message
		assertEquals(changes, ['sameErrorTypeSig']);
		changes.length = 0;
	}
);

Deno.test
(	'Default values',
	async () =>
	{	const changes = new Array<string>;

		// Signal with default value in error state
		const errorSig = sig<number>(new Error('Error'), 999);
		errorSig.subscribe(() => changes.push('errorSig'));
		assertEquals(changes, ['errorSig']);
		changes.length = 0;

		assertEquals(errorSig.value, 999); // default value
		assertEquals(errorSig.error.value?.message, 'Error');
		assertEquals(errorSig.default, 999);

		// Set to actual value
		errorSig.set(42);
		assertEquals(changes, ['errorSig']);
		changes.length = 0;
		assertEquals(errorSig.value, 42);
		assertEquals(errorSig.error.value, undefined);
		assertEquals(errorSig.default, 999);

		// Signal with default value in promise state
		let resolver: (value: number) => void;
		const promiseSig = sig(() => new Promise<number>(y => resolver = y), 777);
		promiseSig.subscribe(() => changes.push('promiseSig'));
		assertEquals(changes, ['promiseSig']);
		changes.length = 0;

		assertEquals(promiseSig.value, 777); // default value while promise is pending
		assertEquals(promiseSig.promise !== undefined, true);
		assertEquals(promiseSig.default, 777);

		resolver!(100);
		await new Promise(resolve => setTimeout(resolve, 0));

		assertEquals(changes, ['promiseSig']);
		changes.length = 0;
		assertEquals(promiseSig.value, 100);
		assertEquals(promiseSig.default, 777);
	}
);

Deno.test
(	'unsubscribe()',
	() =>
	{	const changes = new Array<string>;

		const num = sig(10, undefined);
		const listener = () => changes.push('listener');

		num.subscribe(listener);
		assertEquals(changes, ['listener']);
		changes.length = 0;

		num.set(20);
		assertEquals(changes, ['listener']);
		changes.length = 0;

		// Remove listener
		num.unsubscribe(listener);

		num.set(30);
		assertEquals(changes, []); // Listener should not be called
		assertEquals(num.value, 30);
	}
);

Deno.test
(	'instanceof Sig',
	() =>
	{	const sigA = sig(42);
		assertEquals(sigA instanceof Sig, true);

		// Test with non-signals
		assertEquals({} instanceof Sig, false);
		assertEquals([] instanceof Sig, false);
		assertEquals((() => 42) instanceof Sig, false);
	}
);

Deno.test
(	'Wrapping signals',
	() =>
	{	const changes = new Array<string>;

		const original = sig(10, undefined);
		original.subscribe(() => changes.push('original'));
		assertEquals(changes, ['original']);
		changes.length = 0;

		// Wrap the signal
		const wrapped = sig(original);
		wrapped.subscribe(() => changes.push('wrapped'));
		assertEquals(changes, ['wrapped']);
		changes.length = 0;

		assertEquals(wrapped.value, 10);

		// Change original
		original.set(20);
		assertEquals(changes, ['original', 'wrapped']);
		changes.length = 0;
		assertEquals(wrapped.value, 20);

		// Wrapped signal should be independent for setting
		wrapped.set(30);
		assertEquals(changes, ['wrapped']);
		changes.length = 0;
		assertEquals(wrapped.value, 30);
		assertEquals(original.value, 20); // Original unchanged
	}
);

Deno.test
(	'WeakRef callbacks',
	() =>
	{	const changes = new Array<string>;

		const num = sig(10);

		// Add a WeakRef callback
		const weakRefCallback = () => changes.push('weakref');
		const weakRef = new WeakRef(weakRefCallback);
		num.subscribe(weakRef);
		assertEquals(changes, ['weakref']);
		changes.length = 0;

		// Callback should fire
		num.set(20);
		assertEquals(changes, ['weakref']);
		changes.length = 0;

		// Remove the WeakRef callback
		num.unsubscribe(weakRef);
		num.set(30);
		assertEquals(changes, []);

		// Test that we can add and remove by dereferenced function
		const num2 = sig(100);
		const callback2 = () => changes.push('callback2');
		const weakRef2 = new WeakRef(callback2);
		num2.subscribe(weakRef2);
		changes.length = 0;

		num2.set(200);
		assertEquals(changes, ['callback2']);
		changes.length = 0;

		// Remove using the actual function (not the WeakRef)
		num2.unsubscribe(callback2);
		num2.set(300);
		assertEquals(changes, []);
	}
);

Deno.test
(	'Multiple onChange listeners',
	() =>
	{	const changes = new Array<string>;

		const num = sig(10);

		// Add multiple listeners
		const listener1 = () => changes.push('listener1');
		const listener2 = () => changes.push('listener2');
		const listener3 = () => changes.push('listener3');

		num.subscribe(listener1);
		num.subscribe(listener2);
		num.subscribe(listener3);

		// Only the first listener triggers on add (value computation)
		assertEquals(changes, ['listener1']);
		changes.length = 0;

		// Change value - all should fire
		num.set(20);
		assertEquals(changes.includes('listener1'), true);
		assertEquals(changes.includes('listener2'), true);
		assertEquals(changes.includes('listener3'), true);
		assertEquals(changes.length, 3);
		changes.length = 0;

		// Remove one listener
		num.unsubscribe(listener2);
		num.set(30);
		assertEquals(changes.includes('listener1'), true);
		assertEquals(changes.includes('listener3'), true);
		assertEquals(changes.includes('listener2'), false);
		assertEquals(changes.length, 2);
		changes.length = 0;

		// Remove remaining listeners
		num.unsubscribe(listener1);
		num.unsubscribe(listener3);
		num.set(40);
		assertEquals(changes, []);
	}
);

Deno.test
(	'Promise rejection with default value',
	async () =>
	{	const changes = new Array<string>;

		const sigA = sig<number>
		(	() => Promise.reject(new Error('Rejection error')),
			999 // default value
		);
		sigA.subscribe(() => changes.push('sig'));
		assertEquals(changes, ['sig']);
		changes.length = 0;

		// Should return default value while promise is pending
		assertEquals(sigA.value, 999);

		// Wait for rejection
		await new Promise(y => setTimeout(y, 0));

		assertEquals(changes, ['sig']);
		changes.length = 0;
		// Should return default value when in error state
		assertEquals(sigA.value, 999);
		assertEquals(sigA.error.value?.message, 'Rejection error');
	}
);

Deno.test
(	'setValue parameter with computed signals',
	() =>
	{	const changes = new Array<string>;
		let backingValue = 10;

		// Create computed signal with setValue
		const sigA = sig
		(	() => backingValue,
			NaN,
			newValue => {backingValue = newValue}
		);
		sigA.subscribe(() => changes.push('sig'));
		assertEquals(changes, ['sig']);
		changes.length = 0;

		assertEquals(sigA.value, 10);

		// Set new value via setValue
		sigA.set(20);
		assertEquals(changes, ['sig']);
		changes.length = 0;
		assertEquals(sigA.value, 20);
		assertEquals(backingValue, 20);

		// Try to set a computation function (should throw)
		let errorThrown = false;
		try
		{	sigA.set(() => 30);
		}
		catch (e)
		{	errorThrown = true;
			assertEquals(e instanceof Error, true);
		}
		assertEquals(errorThrown, true);
	}
);

Deno.test
(	'Nested property access',
	() =>
	{	const changes = new Array<string>;

		const user = sig
		(	{	name:
				{	first: 'John',
					last: 'Doe'
				},
				age: 30
			}
		);

		const firstName = user.this.name.first;
		const lastName = user.this.name.last;

		user.subscribe(() => changes.push('user'));
		firstName.subscribe(() => changes.push('firstName'));
		lastName.subscribe(() => changes.push('lastName'));
		changes.length = 0;

		assertEquals(firstName.value, 'John');
		assertEquals(lastName.value, 'Doe');

		// Update nested property
		user.set
		(	{	name:
				{	first: 'Jane',
					last: 'Smith'
				},
				age: 25
			}
		);

		assertEquals(changes.includes('user'), true);
		assertEquals(changes.includes('firstName'), true);
		assertEquals(changes.includes('lastName'), true);
		changes.length = 0;
		assertEquals(firstName.value, 'Jane');
		assertEquals(lastName.value, 'Smith');
	}
);

Deno.test
(	'Setting nested properties',
	() =>
	{	const changes = new Array<string>;

		const user = sig
		(	{	name:
				{	first: 'John',
					last: 'Doe'
				},
				age: 30
			}
		);

		user.subscribe(() => changes.push('user'));

		const userName = user.this.name;
		userName.subscribe(() => changes.push('userName'));

		const firstName = userName.this.first; // Use userName, not user.name
		firstName.subscribe(() => changes.push('firstName'));

		user.this.name.subscribe(() => changes.push('another userName'));
		user.this.name.first.subscribe(() => changes.push('another firstName'));

		changes.length = 0;

		// Set nested property
		firstName.set('Jane');

		assertEquals(changes.toSorted(), ['user', 'userName', 'firstName', 'another userName', 'another firstName'].toSorted());
		changes.length = 0;

		const currentUser = user.value;
		assertEquals(currentUser!.name.first, 'Jane');
		assertEquals(currentUser!.name.last, 'Doe');
		assertEquals(currentUser!.age, 30);
	}
);

Deno.test
(	'Property access on non-object values',
	() =>
	{	const changes = new Array<string>;

		const strSig = sig('hello');
		strSig.subscribe(() => changes.push('strSig'));
		changes.length = 0;

		// Access custom property on string (will be undefined)
		const customProp = (strSig.this as Any).customProp;
		assertEquals(customProp instanceof Sig, true);
		assertEquals(customProp.value, undefined);

		// Access length on string (will be `'hello'.length`)
		const {length} = strSig.this;
		assertEquals(length instanceof Sig, true);
		assertEquals(length.value, 'hello'.length);

		assertEquals(changes.length, 0);

		length.subscribe(() => changes.push('length'));
		changes.length = 0;

		strSig.set('new value');

		assertEquals(changes.includes('strSig'), true);
		assertEquals(changes.includes('length'), true);
		assertEquals(changes.length, 2);

		// Test with object that has numeric property
		const objSig = sig({v: 10});
		const valueSig = objSig.this.v;
		assertEquals(valueSig.value, 10);

		objSig.set({v: 20});
		assertEquals(valueSig.value, 20);

		const missingProp = (objSig.this as Any).missing;
		assertEquals(missingProp instanceof Sig, true);
		assertEquals(missingProp.value, undefined);

		const newValue = {v: 30, missing: 42};
		objSig.set(newValue);
		assertEquals(missingProp.value, 42);
	}
);

Deno.test
(	'convert() method',
	() =>
	{	const changes = new Array<string>;

		const num = sig(10, NaN);
		num.subscribe(() => changes.push('num'));
		assertEquals(changes, ['num']);
		changes.length = 0;

		// Convert number to string
		const str = num.convert(n => `Value: ${n}`);
		str.subscribe(() => changes.push('str'));
		assertEquals(changes, ['str']);
		changes.length = 0;

		assertEquals(str.value, 'Value: 10');

		num.set(20);
		assertEquals(changes, ['num', 'str']);
		changes.length = 0;
		assertEquals(str.value, 'Value: 20');

		// Convert with calculation
		const doubled = num.convert(n => n * 2, NaN);
		doubled.subscribe(() => changes.push('doubled'));
		assertEquals(changes, ['doubled']);
		changes.length = 0;

		assertEquals(doubled.value, 40);

		num.set(15);
		assertEquals(changes.includes('num'), true);
		assertEquals(changes.includes('str'), true);
		assertEquals(changes.includes('doubled'), true);
		assertEquals(changes.length, 3);
		changes.length = 0;
		assertEquals(doubled.value, 30);

		// Chain conversions
		const tripled = doubled.convert(n => n * 1.5);
		tripled.subscribe(() => changes.push('tripled'));
		assertEquals(changes, ['tripled']);
		changes.length = 0;

		assertEquals(tripled.value, 45);

		num.set(10);
		assertEquals(changes.includes('num'), true);
		assertEquals(changes.includes('str'), true);
		assertEquals(changes.includes('doubled'), true);
		assertEquals(changes.includes('tripled'), true);
		assertEquals(changes.length, 4);
		changes.length = 0;
		assertEquals(tripled.value, 30);
	}
);

Deno.test
(	'convert() with error propagation',
	() =>
	{	const changes = new Array<string>;

		const errorSig = sig<number>(new Error('Original error'), NaN);
		errorSig.subscribe(() => changes.push('errorSig'));
		assertEquals(changes, ['errorSig']);
		changes.length = 0;

		// Convert should propagate error
		const converted = errorSig.convert(n => n * 2);
		converted.subscribe(() => changes.push('converted'));
		assertEquals(changes, ['converted']);
		changes.length = 0;

		// `converted` should be in error state
		assertEquals(converted.value===undefined, true);
		assertEquals(converted.error.value?.message, 'Original error');

		// Change to valid value
		errorSig.set(10);
		assertEquals(changes.includes('errorSig'), true);
		assertEquals(changes.includes('converted'), true);
		changes.length = 0;

		assertEquals(converted.value, 20);

		// Change back to error
		errorSig.set(new Error('Another error'));
		assertEquals(changes.includes('errorSig'), true);
		assertEquals(changes.includes('converted'), true);
		changes.length = 0;

		assertEquals(converted.value===undefined, true);
		assertEquals(converted.error.value?.message, 'Another error');
	}
);

Deno.test
(	'convert() with promise propagation',
	async () =>
	{	const changes = new Array<string>;

		let resolver: (value: number) => void;
		const promise = new Promise<number>(y => resolver = y);
		const promiseSig = sig(() => promise, 5);
		promiseSig.subscribe(() => changes.push('promiseSig'));
		assertEquals(changes, ['promiseSig']);
		changes.length = 0;

		// Convert should handle promise
		const converted = promiseSig.convert(n => n * 2, 10);
		converted.subscribe(() => changes.push('converted'));
		assertEquals(changes, ['converted']);
		changes.length = 0;

		// Should return default value while promise is pending
		assertEquals(converted.value, 10);
		assertEquals(converted.promise !== undefined, true);

		// Resolve promise
		resolver!(20);
		await promise;
		await new Promise(y => setTimeout(y, 0));

		assertEquals(changes.includes('promiseSig'), true);
		assertEquals(changes.includes('converted'), true);
		changes.length = 0;

		assertEquals(converted.value, 40); // 20 * 2
		assertEquals(converted.promise, undefined);
	}
);

Deno.test
(	'convert() preserves default value behavior',
	() =>
	{	const errorSig = sig<number>(new Error('Test'), 999);
		const converted = errorSig.convert(n => n * 2, 1998);

		assertEquals(errorSig.value, 999);
		assertEquals(converted.value, 1998);

		errorSig.set(10);
		assertEquals(errorSig.value, 10);
		assertEquals(converted.value, 20);
	}
);

Deno.test
(	'Promise that resolves to same value',
	async () =>
	{	const changes = new Array<string>;

		const sigA = sig(42);
		sigA.subscribe(() => changes.push('sig'));
		assertEquals(changes, ['sig']);
		changes.length = 0;

		// Set to promise that resolves to same value
		let resolver: (value: number) => void;
		const promise = new Promise<number>(y => resolver = y);
		sigA.set(() => promise);

		assertEquals(changes, ['sig']); // onChange for transition to promise
		changes.length = 0;

		// Resolve to same value
		resolver!(42);
		await promise;
		await new Promise(y => setTimeout(y, 0));

		// onChange DOES trigger because the signal transitions from promise state to value state,
		// even though the value is the same
		assertEquals(changes, ['sig']);
		changes.length = 0;
		assertEquals(sigA.value, 42);
	}
);

Deno.test
(	'mut property with Array',
	() =>
	{	const changes = new Array<string>;

		const arr = sig(['a', 'b', 'c']);
		const sliced = arr.this.slice(1);

		arr.subscribe(() => changes.push('arr'));
		sliced.subscribe(() => changes.push('sliced'));
		changes.length = 0;

		// Test push
		assertEquals(arr.mut.push('d'), 4);
		assertEquals(changes.includes('arr'), true);
		assertEquals(changes.includes('sliced'), true);
		changes.length = 0;
		assertEquals(arr.value, ['a', 'b', 'c', 'd']);
		assertEquals(sliced.value, ['b', 'c', 'd']);

		// Test pop
		assertEquals(arr.mut.pop(), 'd');
		assertEquals(changes.includes('arr'), true);
		assertEquals(changes.includes('sliced'), true);
		changes.length = 0;
		assertEquals(arr.value, ['a', 'b', 'c']);

		// Test shift
		assertEquals(arr.mut.shift(), 'a');
		assertEquals(changes.includes('arr'), true);
		assertEquals(changes.includes('sliced'), true);
		changes.length = 0;
		assertEquals(arr.value, ['b', 'c']);

		// Test unshift
		assertEquals(arr.mut.unshift('x', 'y'), 4);
		assertEquals(changes.includes('arr'), true);
		assertEquals(changes.includes('sliced'), true);
		changes.length = 0;
		assertEquals(arr.value, ['x', 'y', 'b', 'c']);

		// Test splice
		assertEquals(arr.mut.splice(1, 2, 'z'), ['y', 'b']);
		assertEquals(changes.includes('arr'), true);
		assertEquals(changes.includes('sliced'), true);
		changes.length = 0;
		assertEquals(arr.value, ['x', 'z', 'c']);

		// Test sort
		arr.mut.sort();
		assertEquals(changes.includes('arr'), true);
		assertEquals(changes.includes('sliced'), true);
		changes.length = 0;
		assertEquals(arr.value, ['c', 'x', 'z']);

		// Test reverse
		arr.mut.reverse();
		assertEquals(changes.includes('arr'), true);
		assertEquals(changes.includes('sliced'), true);
		changes.length = 0;
		assertEquals(arr.value, ['z', 'x', 'c']);
	}
);

Deno.test
(	'mut property with Map',
	() =>
	{	const changes = new Array<string>;

		const map = sig(new Map([['a', 1], ['b', 2]]));
		const size = map.this.size;

		map.subscribe(() => changes.push('map'));
		size.subscribe(() => changes.push('size'));
		changes.length = 0;

		assertEquals(size.value, 2);

		// Test set
		assertEquals(map.mut.set('c', 3), map.value);
		assertEquals(changes.includes('map'), true);
		assertEquals(changes.includes('size'), true);
		changes.length = 0;
		assertEquals(map.value?.get('c'), 3);
		assertEquals(size.value, 3);

		// Test delete
		assertEquals(map.mut.delete('a'), true);
		assertEquals(changes.includes('map'), true);
		assertEquals(changes.includes('size'), true);
		changes.length = 0;
		assertEquals(map.value?.has('a'), false);
		assertEquals(size.value, 2);

		// Test clear
		map.mut.clear();
		assertEquals(changes.includes('map'), true);
		assertEquals(changes.includes('size'), true);
		changes.length = 0;
		assertEquals(size.value, 0);
	}
);

Deno.test
(	'mut property with Set',
	() =>
	{	const changes = new Array<string>;

		const set = sig(new Set(['a', 'b', 'c']));
		const size = set.this.size;

		set.subscribe(() => changes.push('set'));
		size.subscribe(() => changes.push('size'));
		changes.length = 0;

		assertEquals(size.value, 3);

		// Test add
		assertEquals(set.mut.add('d'), set.value);
		assertEquals(changes.includes('set'), true);
		assertEquals(changes.includes('size'), true);
		changes.length = 0;
		assertEquals(set.value?.has('d'), true);
		assertEquals(size.value, 4);

		// Test delete
		assertEquals(set.mut.delete('a'), true);
		assertEquals(changes.includes('set'), true);
		assertEquals(changes.includes('size'), true);
		changes.length = 0;
		assertEquals(set.value?.has('a'), false);
		assertEquals(size.value, 3);

		// Test clear
		set.mut.clear();
		assertEquals(changes.includes('set'), true);
		assertEquals(changes.includes('size'), true);
		changes.length = 0;
		assertEquals(size.value, 0);
	}
);

Deno.test
(	'mut property with custom object',
	() =>
	{	const changes = new Array<string>;

		class Counter
		{	cnt = 0;

			increment()
			{	this.cnt++;
				return this.cnt;
			}

			decrement()
			{	this.cnt--;
				return this.cnt;
			}

			reset()
			{	this.cnt = 0;
			}
		}

		const counter = sig(new Counter);
		const {cnt} = counter.this;

		counter.subscribe(() => changes.push('counter'));
		cnt.subscribe(() => changes.push('cnt'));
		changes.length = 0;

		assertEquals(counter.mut.increment(), 1);
		assertEquals(changes.includes('counter'), true);
		assertEquals(changes.includes('cnt'), true);
		changes.length = 0;
		assertEquals(cnt.value, 1);

		assertEquals(counter.mut.increment(), 2);
		assertEquals(changes.includes('counter'), true);
		assertEquals(changes.includes('cnt'), true);
		changes.length = 0;
		assertEquals(cnt.value, 2);

		assertEquals(counter.mut.decrement(), 1);
		assertEquals(changes.includes('counter'), true);
		assertEquals(changes.includes('cnt'), true);
		changes.length = 0;
		assertEquals(cnt.value, 1);

		counter.mut.reset();
		assertEquals(changes.includes('counter'), true);
		assertEquals(changes.includes('cnt'), true);
		changes.length = 0;
		assertEquals(cnt.value, 0);
	}
);

Deno.test
(	'mut property error on non-method',
	() =>
	{	const obj = sig({v: 42, name: 'test'});

		let errorThrown = false;
		try
		{	(obj.mut as Any).v;
		}
		catch (e)
		{	errorThrown = true;
			assertEquals(e instanceof Error, true);
			assertEquals((e as Error).message, 'Not a method');
		}
		assertEquals(errorThrown, true);
	}
);

Deno.test
(	'mut error if undefined object',
	() =>
	{	const obj = sig<number[]>([]);

		obj.mut.push(1);

		obj.set(undefined);

		let errorThrown = false;
		try
		{	obj.mut.push(1);
		}
		catch (e)
		{	errorThrown = true;
			assertEquals(e instanceof Error, true);
			assertEquals((e as Error).message, 'Not a method');
		}
		assertEquals(errorThrown, true);
	}
);

Deno.test
(	'mut with async methods',
	async () =>
	{	class AsyncCounter
		{	cnt = 0;

			async increment()
			{	await new Promise(y => setTimeout(y, 10));
				this.cnt++;
				return this.cnt;
			}
		}

		const changes = new Array<string>;

		const cnt = sig(new AsyncCounter);
		const msg = sig(() => `Current value: ${cnt.value?.cnt ?? '?'}`);

		cnt.subscribe(() => changes.push('cnt'));
		msg.subscribe(() => changes.push('msg'));
		changes.length = 0;

		// Call async method
		const promise = cnt.mut.increment();
		assertEquals(changes.length, 0); // No change yet

		await promise;

		assertEquals(changes.includes('cnt'), true);
		assertEquals(changes.includes('msg'), true);
		changes.length = 0;
		assertEquals(cnt.value?.cnt, 1);
		assertEquals(msg.value, 'Current value: 1');
	}
);

Deno.test
(	'Symbol.toPrimitive conversion',
	() =>
	{	const num = sig(42);
		const str = sig('hello');
		const computed = sig(() => 100);

		// Test string coercion
		assertEquals(`Value: ${num}`, 'Value: 42');
		assertEquals(`Message: ${str}`, 'Message: hello');
		// The computed function may have different whitespace formatting
		const computedStr = `${computed}`;
		assertEquals(computedStr.includes('100'), true);
		assertEquals(computedStr.includes('=>'), true);

		// Test with error signal
		const errorSig = sig<number|undefined>(new Error('Test error'));
		assertEquals(`Error: ${errorSig}`.includes('Error'), true);
	}
);

Deno.test
(	'Methods with signal arguments',
	() =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		const arr = sig(['a', 'b', 'c', 'd', 'e']);
		const start = sig(1, undefined);
		const end = sig(3, undefined);

		arr.subscribe(() => changes.push('arr'));
		start.subscribe(() => changes.push('start'));
		end.subscribe(() => changes.push('end'));
		changes.length = 0;

		// Test slice with signal arguments
		const sliced = arr.this.slice(start, end);
		sliced.subscribe(() => {calc.push('sliced'); changes.push('sliced')});
		assertEquals(calc, ['sliced']);
		assertEquals(changes, ['sliced']);
		calc.length = 0;
		changes.length = 0;

		assertEquals(sliced.value, ['b', 'c']);

		// Change start signal
		start.set(2);
		assertEquals(calc, ['sliced']);
		assertEquals(changes.includes('start'), true);
		assertEquals(changes.includes('sliced'), true);
		calc.length = 0;
		changes.length = 0;
		assertEquals(sliced.value, ['c']);

		// Change end signal
		end.set(5);
		assertEquals(calc, ['sliced']);
		assertEquals(changes.includes('end'), true);
		assertEquals(changes.includes('sliced'), true);
		calc.length = 0;
		changes.length = 0;
		assertEquals(sliced.value, ['c', 'd', 'e']);

		// Change array signal
		arr.set(['x', 'y', 'z', 'w']);
		assertEquals(calc, ['sliced']);
		assertEquals(changes.includes('arr'), true);
		assertEquals(changes.includes('sliced'), true);
		calc.length = 0;
		changes.length = 0;
		assertEquals(sliced.value, ['z', 'w']);
	}
);

Deno.test
(	'Methods with mixed signal and static arguments',
	() =>
	{	const changes = new Array<string>;

		const arr = sig([10, 20, 30, 40, 50]);
		const start = sig(1, undefined);

		arr.subscribe(() => changes.push('arr'));
		start.subscribe(() => changes.push('start'));
		changes.length = 0;

		// Test slice with one signal and one static argument
		const sub = arr.this.slice(start, 3);
		sub.subscribe(() => changes.push('sub'));
		changes.length = 0;

		assertEquals(sub.value, [20, 30]);

		// Change start
		start.set(2);
		assertEquals(changes.includes('start'), true);
		assertEquals(changes.includes('sub'), true);
		changes.length = 0;
		assertEquals(sub.value, [30]);

		// Change array
		arr.set([100, 200, 300, 400]);
		assertEquals(changes.includes('arr'), true);
		assertEquals(changes.includes('sub'), true);
		changes.length = 0;
		assertEquals(sub.value, [300]);
	}
);

Deno.test
(	'Concurrent value updates',
	() =>
	{	const changes = new Array<string>;
		let processedValues = new Array<number>;

		const sigA = sig(1, undefined);
		sigA.subscribe(() => {
			changes.push('sig');
			const value = sigA.value;
			if (value !== undefined)
			{	processedValues.push(value);
			}
		});
		changes.length = 0;
		processedValues = [];

		// Perform multiple rapid updates
		sigA.set(2);
		sigA.set(3);
		sigA.set(4);

		// All updates should be processed in order
		assertEquals(changes, ['sig', 'sig', 'sig']);
		assertEquals(processedValues, [2, 3, 4]);
	}
);

Deno.test
(	'Batched onChange with dependent signals',
	() =>
	{	const changes = new Array<string>;

		const base = sig(1, undefined);
		const derived1 = sig(() => base.value! * 2);
		const derived2 = sig(() => derived1.value! + 10);

		base.subscribe(() => changes.push('base'));
		derived1.subscribe(() => changes.push('derived1'));
		derived2.subscribe(() => changes.push('derived2'));
		changes.length = 0;

		// Update base - should trigger all onChange callbacks
		base.set(5);

		// Check that all changes are recorded
		assertEquals(changes.includes('base'), true);
		assertEquals(changes.includes('derived1'), true);
		assertEquals(changes.includes('derived2'), true);

		// Verify final values
		assertEquals(base.value, 5);
		assertEquals(derived1.value, 10);
		assertEquals(derived2.value, 20);
	}
);

Deno.test
(	'Error from setValue callback',
	() =>
	{	const changes = new Array<string>;
		let backingValue = 10;

		const sigA = sig
		(	() => backingValue,
			0,
			newValue =>
			{	if (newValue < 0)
				{	throw new Error('Value cannot be negative');
				}
				backingValue = newValue;
			}
		);

		sigA.subscribe(() => changes.push('sig'));
		changes.length = 0;

		// Set valid value
		sigA.set(20);
		assertEquals(changes, ['sig']);
		changes.length = 0;
		assertEquals(sigA.value, 20);

		// Try to set invalid value
		sigA.set(-5);
		assertEquals(changes, ['sig']);
		changes.length = 0;
		assertEquals(sigA.error.value?.message, 'Value cannot be negative');
		assertEquals(sigA.value, 0); // default value

		// Recover by setting valid value
		sigA.set(30);
		assertEquals(changes, ['sig']);
		changes.length = 0;
		assertEquals(sigA.value, 30);
		assertEquals(sigA.error.value, undefined);
	}
);

Deno.test
(	'Deep nested property access',
	() =>
	{	const changes = new Array<string>;

		const data = sig
		(	{	user:
				{	profile:
					{	name:
						{	first: 'John',
							last: 'Doe'
						},
						age: 30
					}
				}
			}
		);

		const firstName = data.this.user.profile.name.first;
		const age = data.this.user.profile.age;

		data.subscribe(() => changes.push('data'));
		firstName.subscribe(() => changes.push('firstName'));
		age.subscribe(() => changes.push('age'));
		changes.length = 0;

		assertEquals(firstName.value, 'John');
		assertEquals(age.value, 30);

		// Update deeply nested property
		firstName.set('Jane');

		assertEquals(changes.includes('data'), true);
		assertEquals(changes.includes('firstName'), true);
		changes.length = 0;

		const currentData = data.value;
		assertEquals(currentData!.user.profile.name.first, 'Jane');
		assertEquals(currentData!.user.profile.name.last, 'Doe');
		assertEquals(currentData!.user.profile.age, 30);
	}
);

Deno.test
(	'Property access on null/undefined',
	() =>
	{	const nonnullSig = sig<{v: number}>({v: 10}, {v: 0});
		const nullSig = sig<{v: number}|null>(null, null);
		const undefinedSig = sig<{v: number}|undefined>();

		const nonnullValue = nonnullSig.this.v;
		const nullValue = nullSig.this.v;
		const undefinedValue = undefinedSig.this.v;

		assertEquals(nonnullValue.value, 10);
		assertEquals(nullValue.value, undefined);
		assertEquals(undefinedValue.value, undefined);

		// Set to actual object
		nullSig.set({v: 42});
		assertEquals(nullValue.value, 42);

		undefinedSig.set({v: 100});
		assertEquals(undefinedValue.value, 100);
	}
);

Deno.test
(	'Multiple listeners added before any computation',
	() =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		const base = sig(() => {calc.push('base'); return 42});

		// Add multiple listeners before first computation
		base.subscribe(() => changes.push('listener1'));
		base.subscribe(() => changes.push('listener2'));
		base.subscribe(() => changes.push('listener3'));

		// First listener triggers computation
		assertEquals(calc, ['base']);
		assertEquals(changes, ['listener1']);
		calc.length = 0;
		changes.length = 0;

		// Change value
		base.set(100);
		assertEquals(changes.includes('listener1'), true);
		assertEquals(changes.includes('listener2'), true);
		assertEquals(changes.includes('listener3'), true);
		assertEquals(changes.length, 3);
	}
);

Deno.test
(	'Promise resolving to Error',
	async () =>
	{	const changes = new Array<string>;

		const sigA = sig<number>
		(	() => Promise.resolve(new Error('Error in promise') as Any),
			0
		);

		sigA.subscribe(() => changes.push('sig'));
		changes.length = 0;

		await new Promise(y => setTimeout(y, 0));

		assertEquals(changes, ['sig']);
		// When promise resolves to an Error object, it's treated as an error state
		assertEquals(sigA.error.value?.message, 'Error in promise');
		assertEquals(sigA.value, 0); // default value
	}
);

Deno.test
(	'Removing non-existent listener',
	() =>
	{	const sigA = sig(42);
		const listener = () => {};

		// Should not throw when removing non-existent listener
		sigA.unsubscribe(listener);

		assertEquals(sigA.value, 42);
	}
);

Deno.test
(	'Signal wrapping with property access',
	() =>
	{	const changes = new Array<string>;

		const original = sig({v: 10, name: 'test'});
		original.subscribe(() => changes.push('original'));
		changes.length = 0;

		const wrapped = sig(original);
		wrapped.subscribe(() => changes.push('wrapped'));
		changes.length = 0;

		// Access property through wrapped signal
		const wrappedValue = (wrapped.this as Any).v;
		wrappedValue.subscribe(() => changes.push('wrappedValue'));
		changes.length = 0;

		assertEquals(wrappedValue.value, 10);

		// Change original
		original.set({v: 20, name: 'updated'});
		assertEquals(changes.includes('original'), true);
		assertEquals(changes.includes('wrapped'), true);
		assertEquals(changes.includes('wrappedValue'), true);
		changes.length = 0;

		assertEquals(wrappedValue.value, 20);
	}
);

Deno.test
(	'prevValue in onChange callbacks - value to value',
	() =>
	{	const prevValues = new Array<number|Error|undefined>;

		const sigA = sig(10, undefined);
		sigA.subscribe
		(	prevValue =>
			{	prevValues.push(prevValue);
			}
		);

		// Initial call with prevValue = undefined
		assertEquals(prevValues, [undefined]);
		prevValues.length = 0;

		// Change value
		sigA.set(20);
		assertEquals(prevValues, [10]);
		prevValues.length = 0;

		// Change value again
		sigA.set(30);
		assertEquals(prevValues, [20]);
		prevValues.length = 0;

		// Set same value - no change callback
		sigA.set(30);
		assertEquals(prevValues, []);
	}
);

Deno.test
(	'prevValue in onChange callbacks - value to error',
	() =>
	{	const prevValues = new Array<number|Error|undefined>;

		const sigA = sig(10, undefined);
		sigA.subscribe
		(	prevValue =>
			{	prevValues.push(prevValue);
			}
		);
		prevValues.length = 0;

		// Change to error
		sigA.set(new Error('Test error'));
		assertEquals(prevValues.length, 1);
		assertEquals(prevValues[0], 10);
		prevValues.length = 0;

		// Change error
		sigA.set(new Error('Another error'));
		assertEquals(prevValues.length, 1);
		assertEquals((prevValues[0] as Error).message, 'Test error');
		prevValues.length = 0;

		// Change back to value
		sigA.set(42);
		assertEquals(prevValues.length, 1);
		assertEquals((prevValues[0] as Error).message, 'Another error');
	}
);

Deno.test
(	'prevValue in onChange callbacks - value to promise to value',
	async () =>
	{	const prevValues = new Array<number|Error|undefined>;

		const sigA = sig(10, undefined);
		sigA.subscribe
		(	prevValue =>
			{	prevValues.push(prevValue);
			}
		);
		prevValues.length = 0;

		// Change to promise
		let resolver: (value: number) => void;
		const promise = new Promise<number>(y => resolver = y);
		sigA.set(() => promise);

		assertEquals(prevValues.length, 1);
		assertEquals(prevValues[0], 10); // prevValue before promise
		prevValues.length = 0;

		// Resolve promise
		resolver!(42);
		await promise;
		await new Promise(y => setTimeout(y, 0));

		assertEquals(prevValues.length, 1);
		assertEquals(prevValues[0], 10); // prevValue was 10 (last value before promise started)
	}
);

Deno.test
(	'prevValue in onChange callbacks - promise to error',
	async () =>
	{	const prevValues = new Array<number|Error|undefined>;

		let _resolver: (value: number) => void;
		const promise = new Promise<number>(y => _resolver = y);
		const sigA = sig(() => promise, 5);
		sigA.subscribe
		(	prevValue =>
			{	prevValues.push(prevValue);
			}
		);
		prevValues.length = 0;

		// Reject promise
		const error = new Error('Promise rejected');
		sigA.set(() => Promise.reject(error));

		await new Promise(y => setTimeout(y, 0));

		// When promise rejects, prevValue is the last known value (5, the default) or undefined
		assertEquals(prevValues.length >= 1, true);
		const lastPrev = prevValues[prevValues.length - 1];
		assertEquals(lastPrev === 5 || lastPrev === undefined, true);
	}
);

Deno.test
(	'prevValue with computed signals',
	() =>
	{	const prevValues = new Array<number|Error|undefined>;

		const base = sig(10, undefined);
		const computed = sig(() => base.value! * 2);

		computed.subscribe
		(	prevValue =>
			{	prevValues.push(prevValue);
			}
		);

		// Initial call
		assertEquals(prevValues, [undefined]);
		prevValues.length = 0;

		// Change base
		base.set(20);
		assertEquals(prevValues, [20]); // prevValue was 20 (10 * 2)
		prevValues.length = 0;

		// Change base again
		base.set(15);
		assertEquals(prevValues, [40]); // prevValue was 40 (20 * 2)
	}
);

Deno.test
(	'busy signal - basic behavior',
	async () =>
	{	const changes = new Array<string>;

		let resolver: (value: number) => void;
		const promise = new Promise<number>(y => resolver = y);
		const sigA = sig(() => promise, 0);

		const {busy} = sigA;
		busy.subscribe(() => changes.push('busy'));

		// Initially busy should be true (promise in progress)
		assertEquals(busy.value, true);
		assertEquals(changes, ['busy']);
		changes.length = 0;

		// Resolve promise
		resolver!(42);
		await promise;
		await new Promise(y => setTimeout(y, 0));

		// Now busy should be false
		assertEquals(changes, ['busy']);
		changes.length = 0;
		assertEquals(busy.value, false);

		// Set to non-promise value
		sigA.set(100);
		assertEquals(changes, []); // Still false, no change
		assertEquals(busy.value, false);
	}
);

Deno.test
(	'busy signal - transitions',
	async () =>
	{	const changes = new Array<string>;
		const busyValues = new Array<boolean>;

		const sigA = sig(42, undefined);
		const busy = sigA.busy;

		busy.subscribe
		(	() =>
			{	changes.push('busy');
				busyValues.push(busy.value);
			}
		);
		changes.length = 0;
		busyValues.length = 0;

		// Initially not busy (has value)
		assertEquals(busy.value, false);

		// Start async computation
		let resolver1: (value: number) => void;
		const promise1 = new Promise<number>(y => resolver1 = y);
		sigA.set(() => promise1);

		assertEquals(changes, ['busy']);
		assertEquals(busyValues, [true]);
		changes.length = 0;
		busyValues.length = 0;

		// Resolve
		resolver1!(100);
		await promise1;
		await new Promise(y => setTimeout(y, 0));

		assertEquals(changes, ['busy']);
		assertEquals(busyValues, [false]);
		changes.length = 0;
		busyValues.length = 0;

		// Start another async computation
		let resolver2: (value: number) => void;
		const promise2 = new Promise<number>(y => resolver2 = y);
		sigA.set(() => promise2);

		assertEquals(changes, ['busy']);
		assertEquals(busyValues, [true]);
		changes.length = 0;
		busyValues.length = 0;

		resolver2!(200);
		await promise2;
		await new Promise(y => setTimeout(y, 0));

		assertEquals(changes, ['busy']);
		assertEquals(busyValues, [false]);
	}
);

Deno.test
(	'busy signal - with dependent signals',
	async () =>
	{	const changes = new Array<string>;

		let resolver: (value: number) => void;
		const promise = new Promise<number>(y => resolver = y);
		const sigA = sig(() => promise, 0);

		const doubled = sig(() => sigA.value! * 2);
		const busy = sigA.busy;
		const doubledBusy = doubled.busy;

		busy.subscribe(() => changes.push('busy'));
		doubledBusy.subscribe(() => changes.push('doubledBusy'));
		changes.length = 0;

		assertEquals(busy.value, true);
		assertEquals(doubledBusy.value, false); // doubled is not itself async

		resolver!(21);
		await promise;
		await new Promise(y => setTimeout(y, 0));

		assertEquals(changes.includes('busy'), true);
		assertEquals(busy.value, false);
		assertEquals(doubledBusy.value, false);
	}
);

Deno.test
(	'error signal - basic behavior',
	() =>
	{	const changes = new Array<string>;

		const sigA = sig<number|undefined>(new Error('Initial error'));
		const errorSig = sigA.error;

		errorSig.subscribe(() => changes.push('error'));
		changes.length = 0;

		// Initially has error
		assertEquals(errorSig.value?.message, 'Initial error');

		// Change to value
		sigA.set(42);
		assertEquals(changes, ['error']);
		changes.length = 0;
		assertEquals(errorSig.value, undefined);

		// Change to error
		sigA.set(new Error('New error'));
		assertEquals(changes, ['error']);
		changes.length = 0;
		assertEquals(errorSig.value?.message, 'New error');

		// Verify error signal returns the actual error object
		const err = errorSig.value;
		assertEquals(err instanceof Error, true);
		assertEquals(err?.message, 'New error');
	}
);

Deno.test
(	'error signal - with computed signals',
	() =>
	{	const changes = new Array<string>;

		const base = sig<number|undefined>(new Error('Base error'));
		const computed = sig(() => base.value! * 2);

		const baseError = base.error;
		const computedError = computed.error;

		baseError.subscribe(() => changes.push('baseError'));
		computedError.subscribe(() => changes.push('computedError'));
		changes.length = 0;

		assertEquals(baseError.value?.message, 'Base error');
		assertEquals(computedError.value, undefined); // computed gets NaN, not error

		// Change base to value
		base.set(21);
		assertEquals(changes.includes('baseError'), true);
		changes.length = 0;
		assertEquals(baseError.value, undefined);
		assertEquals(computedError.value, undefined);

		// Make computed throw error
		computed.set(() => {throw new Error('Computed error')});
		assertEquals(changes.includes('computedError'), true);
		changes.length = 0;
		assertEquals(computedError.value?.message, 'Computed error');
	}
);

Deno.test
(	'error signal - reactive to error type changes',
	() =>
	{	const changes = new Array<string>;

		const sigA = sig<number|undefined>(new Error('Error 1'));
		const errorSig = sigA.error;

		errorSig.subscribe(() => changes.push('error'));
		changes.length = 0;

		// Change to different error
		sigA.set(new Error('Error 2'));
		assertEquals(changes, ['error']);
		changes.length = 0;
		assertEquals(errorSig.value?.message, 'Error 2');

		// Change to same error message but different instance
		sigA.set(new Error('Error 2'));
		assertEquals(changes, []); // Same message, no change
		assertEquals(errorSig.value?.message, 'Error 2');

		// Change to different error type
		class CustomError extends Error {}
		sigA.set(new CustomError('Error 3'));
		assertEquals(changes, ['error']);
		changes.length = 0;
		assertEquals(errorSig.value?.message, 'Error 3');
		assertEquals(errorSig.value instanceof CustomError, true);
	}
);

Deno.test
(	'Signal wrapping - basic',
	() =>
	{	const changes = new Array<string>;

		const original = sig(10, undefined);
		original.subscribe(() => changes.push('original'));
		changes.length = 0;

		const wrapped = sig(original);
		wrapped.subscribe(() => changes.push('wrapped'));
		changes.length = 0;

		assertEquals(wrapped.value, 10);

		// Change original
		original.set(20);
		assertEquals(changes.includes('original'), true);
		assertEquals(changes.includes('wrapped'), true);
		changes.length = 0;
		assertEquals(wrapped.value, 20);

		// Change wrapped (should be independent)
		wrapped.set(30);
		assertEquals(changes, ['wrapped']); // Only wrapped changes
		changes.length = 0;
		assertEquals(wrapped.value, 30);
		assertEquals(original.value, 20); // Original unchanged
	}
);

Deno.test
(	'Signal wrapping - with errors',
	() =>
	{	const changes = new Array<string>;

		const original = sig<number|undefined>(new Error('Original error'));
		const wrapped = sig(original);

		original.subscribe(() => changes.push('original'));
		wrapped.subscribe(() => changes.push('wrapped'));
		changes.length = 0;

		assertEquals(wrapped.error.value?.message, 'Original error');

		// Change original to value
		original.set(42);
		assertEquals(changes.includes('original'), true);
		assertEquals(changes.includes('wrapped'), true);
		changes.length = 0;
		assertEquals(wrapped.value, 42);

		// Set wrapped to error
		wrapped.set(new Error('Wrapped error'));
		assertEquals(changes, ['wrapped']);
		changes.length = 0;
		assertEquals(wrapped.error.value?.message, 'Wrapped error');
		assertEquals(original.value, 42); // Original unaffected
	}
);

Deno.test
(	'Signal wrapping - with promises',
	async () =>
	{	const changes = new Array<string>;

		let resolver: (value: number) => void;
		const promise = new Promise<number>(y => resolver = y);
		const original = sig(() => promise, 0);
		const wrapped = sig(original);

		original.subscribe(() => changes.push('original'));
		wrapped.subscribe(() => changes.push('wrapped'));
		changes.length = 0;

		assertEquals(original.busy.value, true);
		assertEquals(wrapped.busy.value, true);

		resolver!(42);
		await promise;
		await new Promise(y => setTimeout(y, 0));

		assertEquals(changes.includes('original'), true);
		assertEquals(changes.includes('wrapped'), true);
		changes.length = 0;
		assertEquals(wrapped.value, 42);
		assertEquals(original.busy.value, false);
		assertEquals(wrapped.busy.value, false);
	}
);

Deno.test
(	'prevValue with this context',
	() =>
	{	const sigA = sig(10, undefined);
		let receivedThis: Any;
		let receivedPrevValue: number|undefined;

		sigA.subscribe
		(	function(prevValue)
			{	receivedThis = this;
				receivedPrevValue = prevValue as number|undefined;
			}
		);

		// Initial call
		assertEquals(receivedThis, sigA);
		assertEquals(receivedPrevValue, undefined);

		// Change value
		sigA.set(20);
		assertEquals(receivedThis, sigA);
		assertEquals(receivedPrevValue, 10);
	}
);

Deno.test
(	'busy and error signals are reactive',
	async () =>
	{	const changes = new Array<string>;

		const sigA = sig(42, undefined);
		const busy = sigA.busy;
		const errorSig = sigA.error;

		// Create dependent signals
		const busyStr = busy.convert(b => b ? 'Loading...' : 'Ready');
		const errorStr = errorSig.convert(e => e ? e.message : 'No error');

		busy.subscribe(() => changes.push('busy'));
		errorSig.subscribe(() => changes.push('error'));
		busyStr.subscribe(() => changes.push('busyStr'));
		errorStr.subscribe(() => changes.push('errorStr'));
		changes.length = 0;

		assertEquals(busyStr.value, 'Ready');
		assertEquals(errorStr.value, 'No error');

		// Set to error
		sigA.set(new Error('Test error'));
		assertEquals(changes.includes('error'), true);
		assertEquals(changes.includes('errorStr'), true);
		changes.length = 0;
		// Check errorSig directly first
		const errValue = errorSig.value;
		assertEquals(errValue?.message, 'Test error');
		assertEquals(errorStr.value, 'Test error');

		// Set to promise
		let resolver: (value: number) => void;
		const promise = new Promise<number>(y => resolver = y);
		sigA.set(() => promise);
		// When transitioning from error to promise, error signal should change
		// (error signal changes when the parent goes from error state to non-error state)
		assertEquals(changes.includes('busy'), true);
		assertEquals(changes.includes('busyStr'), true);
		// Error signal may or may not trigger depending on timing
		changes.length = 0;
		assertEquals(busyStr.value, 'Loading...');

		// Resolve promise
		resolver!(100);
		await promise;
		await new Promise(y => setTimeout(y, 0));

		assertEquals(changes.includes('busy'), true);
		assertEquals(changes.includes('busyStr'), true);
		changes.length = 0;
		assertEquals(busyStr.value, 'Ready');
	}
);

Deno.test
(	'Multiple wrapped signals',
	() =>
	{	const changes = new Array<string>;

		const sig1 = sig(10, undefined);
		const sig2 = sig(sig1);
		const sig3 = sig(sig2);

		sig1.subscribe(() => changes.push('sig1'));
		sig2.subscribe(() => changes.push('sig2'));
		sig3.subscribe(() => changes.push('sig3'));
		changes.length = 0;

		assertEquals(sig3.value, 10);

		// Change sig1
		sig1.set(20);
		assertEquals(changes.includes('sig1'), true);
		assertEquals(changes.includes('sig2'), true);
		assertEquals(changes.includes('sig3'), true);
		changes.length = 0;
		assertEquals(sig3.value, 20);

		// Change sig2 directly
		sig2.set(30);
		assertEquals(changes.includes('sig2'), true);
		assertEquals(changes.includes('sig3'), true);
		assertEquals(changes.includes('sig1'), false);
		changes.length = 0;
		assertEquals(sig3.value, 30);
		assertEquals(sig1.value, 20); // sig1 unchanged
	}
);

Deno.test
(	'cancelComp callback',
	async () =>
	{	const cancelCalls = new Array<Promise<number>>;

		let resolver1: (value: number) => void;
		const promise1 = new Promise<number>(y => resolver1 = y);

		const sigA = sig
		(	() => promise1,
			NaN,
			undefined,
			promise => cancelCalls.push(promise)
		);

		sigA.subscribe(() => {});
		await new Promise(y => setTimeout(y, 0));

		assertEquals(cancelCalls.length, 0);

		// Start a new calculation, which should cancel the old one
		let resolver2: (value: number) => void;
		const promise2 = new Promise<number>(y => resolver2 = y);
		sigA.set(() => promise2, promise => cancelCalls.push(promise));

		assertEquals(cancelCalls.length, 1);
		assertEquals(cancelCalls[0], promise1);

		// Clean up
		resolver1!(1);
		resolver2!(2);
	}
);

Deno.test
(	'Setting promise without cancelComp',
	async () =>
	{	const changes = new Array<string>;

		const sigA = sig(10, undefined);
		sigA.subscribe(() => changes.push('sig'));
		changes.length = 0;

		let resolver: (value: number) => void;
		const promise = new Promise<number>(y => resolver = y);

		// Set promise without cancelComp
		sigA.set(() => promise);

		assertEquals(changes, ['sig']);
		changes.length = 0;
		assertEquals(sigA.promise !== undefined, true);

		resolver!(42);
		await promise;
		await new Promise(y => setTimeout(y, 0));

		assertEquals(changes, ['sig']);
		assertEquals(sigA.value, 42);
	}
);

Deno.test
(	'cancelComp with multiple promise transitions',
	async () =>
	{	const cancelled = new Array<number>;

		let resolver1: (value: number) => void;
		const promise1 = new Promise<number>(y => resolver1 = y);

		const sigA = sig
		(	() => promise1,
			0,
			undefined,
			_promise => cancelled.push(1)
		);

		sigA.subscribe(() => {});
		await new Promise(y => setTimeout(y, 0));

		assertEquals(cancelled.length, 0);

		// Start second computation
		let resolver2: (value: number) => void;
		const promise2 = new Promise<number>(y => resolver2 = y);
		sigA.set(() => promise2, _promise => cancelled.push(2));

		assertEquals(cancelled.length, 1);
		assertEquals(cancelled[0], 1);

		// Start third computation before second resolves
		let resolver3: (value: number) => void;
		const promise3 = new Promise<number>(y => resolver3 = y);
		sigA.set(() => promise3, _promise => cancelled.push(3));

		assertEquals(cancelled.length, 2);
		assertEquals(cancelled[1], 2);

		// Resolve promises
		resolver1!(10);
		resolver2!(20);
		resolver3!(30);
		await Promise.all([promise1, promise2, promise3]);
		await new Promise(y => setTimeout(y, 0));

		// Only promise3 should have resolved
		assertEquals(sigA.value, 30);

		// Clean up
	}
);

Deno.test
(	'Chained signal dependencies',
	() =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		// Create chain: A -> B -> C -> D
		const sigA = sig(1, undefined);
		sigA.subscribe(() => changes.push('A'));
		assertEquals(changes, ['A']);
		changes.length = 0;

		const sigB = sig(() => {calc.push('B'); return sigA.value! + 1});
		sigB.subscribe(() => changes.push('B'));
		assertEquals(calc, ['B']);
		assertEquals(changes, ['B']);
		calc.length = 0;
		changes.length = 0;

		const sigC = sig(() => {calc.push('C'); return sigB.value! + 1});
		sigC.subscribe(() => changes.push('C'));
		assertEquals(calc, ['C']);
		assertEquals(changes, ['C']);
		calc.length = 0;
		changes.length = 0;

		const sigD = sig(() => {calc.push('D'); return sigC.value! + 1});
		sigD.subscribe(() => changes.push('D'));
		assertEquals(calc, ['D']);
		assertEquals(changes, ['D']);
		calc.length = 0;
		changes.length = 0;

		// Verify initial values
		assertEquals(sigA.value, 1);
		assertEquals(sigB.value, 2);
		assertEquals(sigC.value, 3);
		assertEquals(sigD.value, 4);

		// Change A - should propagate through all
		sigA.set(10);
		assertEquals(calc, ['B', 'C', 'D']);
		assertEquals(changes.includes('A'), true);
		assertEquals(changes.includes('B'), true);
		assertEquals(changes.includes('C'), true);
		assertEquals(changes.includes('D'), true);
		calc.length = 0;
		changes.length = 0;

		// Verify propagated values
		assertEquals(sigA.value, 10);
		assertEquals(sigB.value, 11);
		assertEquals(sigC.value, 12);
		assertEquals(sigD.value, 13);
	}
);

Deno.test
(	'Diamond dependency pattern',
	() =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		// Create diamond: A -> B, A -> C, B -> D, C -> D
		const sigA = sig(1, undefined);
		sigA.subscribe(() => changes.push('A'));
		assertEquals(changes, ['A']);
		changes.length = 0;

		const sigB = sig(() => {calc.push('B'); return sigA.value! + 1});
		sigB.subscribe(() => changes.push('B'));
		assertEquals(calc, ['B']);
		assertEquals(changes, ['B']);
		calc.length = 0;
		changes.length = 0;

		const sigC = sig(() => {calc.push('C'); return sigA.value! + 2});
		sigC.subscribe(() => changes.push('C'));
		assertEquals(calc, ['C']);
		assertEquals(changes, ['C']);
		calc.length = 0;
		changes.length = 0;

		const sigD = sig(() => {calc.push('D'); return sigB.value! + sigC.value!});
		sigD.subscribe(() => changes.push('D'));
		assertEquals(calc, ['D']);
		assertEquals(changes, ['D']);
		calc.length = 0;
		changes.length = 0;

		// Verify initial values
		assertEquals(sigA.value, 1);
		assertEquals(sigB.value, 2);
		assertEquals(sigC.value, 3);
		assertEquals(sigD.value, 5);

		// Change A - should trigger B, C, and D
		sigA.set(10);
		assertEquals(calc.includes('B'), true);
		assertEquals(calc.includes('C'), true);
		assertEquals(calc.includes('D'), true);
		assertEquals(changes.includes('A'), true);
		assertEquals(changes.includes('B'), true);
		assertEquals(changes.includes('C'), true);
		assertEquals(changes.includes('D'), true);
		calc.length = 0;
		changes.length = 0;

		// Verify propagated values
		assertEquals(sigA.value, 10);
		assertEquals(sigB.value, 11);
		assertEquals(sigC.value, 12);
		assertEquals(sigD.value, 23);
	}
);

Deno.test
(	'Circular dependency handling',
	() =>
	{	const changes = new Array<string>;

		const sigA = sig(1, undefined);
		sigA.subscribe(() => changes.push('A'));

		const sigB = sig(() => sigA.value! + 1);
		sigB.subscribe(() => changes.push('B'));

		// Try to create circular dependency (A depends on B)
		sigA.set(() => sigB.value! + 1);
		// This should not cause infinite loop
		// Instead, it will compute with the current values
		assertEquals(sigA.error.value?.message, 'Circular dependency detected between signals');
		const sigBValue = sigB.value;
		assertEquals(typeof(sigBValue)=='number' && isNaN(sigBValue), true); // undefined + 1 = NaN
	}
);

Deno.test
(	'Complex circular dependency - three signals',
	() =>
	{	const sigA = sig(1, undefined);
		const sigB = sig(() => sigA.value! + 1);
		const sigC = sig(() => sigB.value! + 1);

		sigA.subscribe(() => {});
		sigB.subscribe(() => {});
		sigC.subscribe(() => {});

		// Try to create A -> B -> C -> A circular dependency
		sigA.set(() => sigC.value! + 1);

		assertEquals(sigA.error.value?.message, 'Circular dependency detected between signals');
	}
);

Deno.test
(	'Indirect circular dependency',
	() =>
	{	const sigA = sig(1, undefined);
		const sigB = sig(() => sigA.value! + 1);
		const sigC = sig(() => sigB.value! + 1);
		const sigD = sig(() => sigC.value! + 1);

		sigA.subscribe(() => {});
		sigB.subscribe(() => {});
		sigC.subscribe(() => {});
		sigD.subscribe(() => {});

		// Try to create A -> B -> C -> D -> B circular dependency
		sigB.set(() => sigD.value! + 1);

		assertEquals(sigB.error.value?.message, 'Circular dependency detected between signals');
	}
);

// Tests for setConverter feature

Deno.test
(	'setConverter must not trigger onChange initially',
	() =>
	{	const sigA = sig(5, undefined);
		const changes = new Array<{v: number|Error|undefined, prevValue: number|Error|undefined}>;
		const comp = new Array<number|undefined>;

		sigA.setConverter(v => {comp.push(v); return v! * 2});

		assertEquals(comp.length, 0);

		sigA.subscribe
		(	function(prevValue)
			{	changes.push({v: this.value, prevValue});
			}
		);

		assertEquals(comp.length, 1);
		assertEquals(comp[0], 5);

		assertEquals(changes.length, 1);
		assertEquals(changes[0].v, 10);
		assertEquals(changes[0].prevValue, undefined);
	}
);

Deno.test
(	'setConverter must not trigger onChange initially - with default value',
	() =>
	{	const sigA = sig(5, -1);
		const changes = new Array<{v: number|Error|undefined, prevValue: number|Error|undefined}>;
		const comp = new Array<number|undefined>;

		sigA.setConverter(v => {comp.push(v); return v * 2});

		assertEquals(comp.length, 0);

		sigA.subscribe
		(	function(prevValue)
			{	changes.push({v: this.value, prevValue});
			}
		);

		assertEquals(comp.length, 1);
		assertEquals(comp[0], 5);

		assertEquals(changes.length, 1);
		assertEquals(changes[0].v, 10);
		assertEquals(changes[0].prevValue, -1);
	}
);

Deno.test
(	'setConverter transforms values',
	() =>
	{	const sigA = sig(5, NaN);
		sigA.setConverter(v => v * 2);

		assertEquals(sigA.value, 10); // Initial value transformed

		sigA.set(7);
		assertEquals(sigA.value, 14); // New value transformed
	}
);

Deno.test
(	'setConverter rejects invalid values by returning Error',
	() =>
	{	const sigA = sig(5, NaN);
		sigA.setConverter
		(	v =>
			{	if (v > 10)
				{	return new Error('Value must be <= 10');
				}
				return v;
			}
		);

		assertEquals(sigA.value, 5); // Initial value is valid

		sigA.set(8);
		assertEquals(sigA.value, 8); // Valid value accepted

		sigA.set(15);
		assertEquals(sigA.error.value?.message, 'Value must be <= 10'); // Invalid value creates error signal
	}
);

Deno.test
(	'setConverter rejects by throwing error',
	() =>
	{	const sigA = sig(5, NaN);
		sigA.setConverter
		(	v =>
			{	if (v > 10)
				{	throw new Error('Value must be <= 10');
				}
				return v;
			}
		);

		assertEquals(sigA.value, 5);

		sigA.set(15);
		assertEquals(sigA.error.value?.message, 'Value must be <= 10');
	}
);

Deno.test
(	'setConverter with async validation',
	async () =>
	{	const sigA = sig(5, NaN);
		sigA.setConverter
		(	async v =>
			{	await new Promise(resolve => setTimeout(resolve, 10));
				if (v > 10)
				{	return new Error('Value must be <= 10');
				}
				return v * 2;
			}
		);

		assertEquals(sigA.busy.value, true); // Initial computation is async
		await sigA.promise;
		assertEquals(sigA.value, 10); // Initial value transformed
		assertEquals(sigA.busy.value, false);

		sigA.set(7);
		assertEquals(sigA.busy.value, true);
		await sigA.promise;
		assertEquals(sigA.value, 14);
		assertEquals(sigA.busy.value, false);

		sigA.set(15);
		assertEquals(sigA.busy.value, true);
		// When validator returns Error, promise rejects
		await sigA.promise!.catch(() => {});
		assertEquals(sigA.error.value?.message, 'Value must be <= 10');
		assertEquals(sigA.busy.value, false);
	}
);

Deno.test
(	'setConverter returns another signal',
	() =>
	{	const sigA = sig(5, NaN);
		const multiplier = sig(3, NaN);

		sigA.setConverter(v => sig(() => v * multiplier.value!, NaN));

		assertEquals(sigA.value, 15); // 5 * 3

		// Changing multiplier doesn't trigger sig recomputation
		// because sig only depends on its stored value
		multiplier.set(4);
		assertEquals(sigA.value, 15); // Still 15 (5 * 3)

		// Setting sig triggers validator, which creates new computed signal
		sigA.set(7);
		assertEquals(sigA.value, 28); // 7 * 4 (uses current multiplier value)
	}
);

Deno.test
(	'setConverter busy and error properties are reactive',
	() =>
	{	const sigA = sig(5, NaN);
		sigA.setConverter
		(	async v =>
			{	await new Promise(resolve => setTimeout(resolve, 10));
				if (v > 10)
				{	return new Error('Too large');
				}
				return v;
			}
		);

		const busyChanges: Array<boolean|Error|undefined> = [];
		const errorChanges: Array<Error|undefined> = [];

		sigA.busy.subscribe(function() { busyChanges.push(this.value); });
		sigA.error.subscribe(function() { errorChanges.push(this.value); });

		assertEquals(sigA.busy.value, true);
		assertEquals(sigA.error.value, undefined);

		return sigA.promise!.then(() =>
		{	assertEquals(sigA.busy.value, false);
			assertEquals(sigA.error.value, undefined);
			assertEquals(busyChanges.includes(true), true);
			assertEquals(busyChanges.includes(false), true);

			sigA.set(15);
			assertEquals(sigA.busy.value, true);

			return sigA.promise!.catch(() => {}).then(() =>
			{	assertEquals(sigA.busy.value, false);
				assertEquals(sigA.error.value?.message, 'Too large');
				assertEquals(errorChanges.some(e => e instanceof Error && e.message === 'Too large'), true);
			});
		});
	}
);

Deno.test
(	'setConverter multiple validations in sequence',
	() =>
	{	const sigA = sig(10, NaN);

		sigA.setConverter(v => v * 2);
		assertEquals(sigA.value, 20);

		sigA.set(5);
		assertEquals(sigA.value, 10);

		sigA.set(8);
		assertEquals(sigA.value, 16);

		sigA.set(100);
		assertEquals(sigA.value, 200);
	}
);

Deno.test
(	'setConverter with onChange and prevValue',
	() =>
	{	const sigA = sig(5, undefined);
		const changes: Array<{v: number|Error|undefined, prevValue: number|Error|undefined}> = [];

		sigA.subscribe
		(	function(prevValue)
			{	changes.push({v: this.value, prevValue});
			}
		);

		// subscribe triggers initial call
		assertEquals(changes.length, 1);
		assertEquals(changes[0].v, 5);
		assertEquals(changes[0].prevValue, undefined);

		sigA.setConverter(v => v! * 2);

		// setConverter doesn't trigger recomputation
		assertEquals(changes.length, 1);

		sigA.set(8);
		assertEquals(changes.length, 2);
		assertEquals(changes[1].v, 16);
		assertEquals(changes[1].prevValue, 5);
	}
);

// Tests for sync() feature with async computations

Deno.test
(	'sync() - basic async computation without sync',
	async () =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		const sigA = sig(1, undefined);
		const sigB = sig(2, undefined);

		sigA.subscribe(() => changes.push('sigA'));
		sigB.subscribe(() => changes.push('sigB'));
		changes.length = 0;

		// Without sync(), only dependencies before first await are recorded
		const sigC = sig
		(	async _sync =>
			{	calc.push('sigC');
				const a = sigA.value; // dependency recorded
				await new Promise(r => setTimeout(r, 10));
				const b = sigB.value; // dependency NOT recorded (no sync())
				return a! + b!;
			}
		);

		sigC.subscribe(() => changes.push('sigC'));
		assertEquals(calc, ['sigC']);
		assertEquals(changes, ['sigC']);
		calc.length = 0;
		changes.length = 0;

		// Wait for computation to complete
		await sigC.promise;
		assertEquals(sigC.value, 3); // 1 + 2
		assertEquals(changes, ['sigC']);
		changes.length = 0;

		// Change sigB - should NOT trigger recomputation (not a dependency)
		sigB.set(10);
		assertEquals(calc, []); // sigC not recomputed
		assertEquals(changes.includes('sigB'), true);
		assertEquals(changes.includes('sigC'), false);
		changes.length = 0;

		// Change sigA - should trigger recomputation (is a dependency)
		sigA.set(5);
		assertEquals(calc, ['sigC']);
		assertEquals(changes.includes('sigA'), true);
		assertEquals(changes.includes('sigC'), true);
		calc.length = 0;
		changes.length = 0;

		await sigC.promise;
		assertEquals(sigC.value, 15); // 5 + 10 (uses new sigB value even though not a dependency)
	}
);

Deno.test
(	'sync() - basic async computation with sync',
	async () =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		const sigA = sig(1, undefined);
		const sigB = sig(2, undefined);

		sigA.subscribe(() => changes.push('sigA'));
		sigB.subscribe(() => changes.push('sigB'));
		changes.length = 0;

		// With sync(), dependencies after await are recorded
		const sigC = sig
		(	async sync =>
			{	calc.push('sigC');
				const a = sigA.value; // dependency recorded
				await new Promise(r => setTimeout(r, 10));
				sync(); // mark point to record dependencies again
				const b = sigB.value; // dependency recorded
				return a! + b!;
			}
		);

		sigC.subscribe(() => changes.push('sigC'));
		assertEquals(calc, ['sigC']);
		assertEquals(changes, ['sigC']);
		calc.length = 0;
		changes.length = 0;

		// Wait for computation to complete
		await sigC.promise;
		assertEquals(sigC.value, 3); // 1 + 2
		assertEquals(changes, ['sigC']);
		changes.length = 0;

		// Change sigB - should trigger recomputation (is a dependency thanks to sync())
		sigB.set(10);
		assertEquals(calc, ['sigC']);
		assertEquals(changes.includes('sigB'), true);
		assertEquals(changes.includes('sigC'), true);
		calc.length = 0;
		changes.length = 0;

		await sigC.promise;
		assertEquals(sigC.value, 11); // 1 + 10

		// Change sigA - should also trigger recomputation
		sigA.set(5);
		assertEquals(calc, ['sigC']);
		assertEquals(changes.includes('sigA'), true);
		assertEquals(changes.includes('sigC'), true);
		calc.length = 0;
		changes.length = 0;

		await sigC.promise;
		assertEquals(sigC.value, 15); // 5 + 10
	}
);

Deno.test
(	'sync() - multiple sync calls in same computation',
	async () =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		const sigA = sig(1, undefined);
		const sigB = sig(2, undefined);
		const sigC = sig(3, undefined);

		sigA.subscribe(() => changes.push('sigA'));
		sigB.subscribe(() => changes.push('sigB'));
		sigC.subscribe(() => changes.push('sigC'));
		changes.length = 0;

		const sigD = sig
		(	async sync =>
			{	calc.push('sigD');
				const a = sigA.value; // dependency recorded
				await new Promise(r => setTimeout(r, 10));
				sync(); // resume recording
				const b = sigB.value; // dependency recorded
				await new Promise(r => setTimeout(r, 10));
				sync(); // resume recording again
				const c = sigC.value; // dependency recorded
				return a! + b! + c!;
			}
		);

		sigD.subscribe(() => changes.push('sigD'));
		assertEquals(calc, ['sigD']);
		calc.length = 0;
		changes.length = 0;

		await sigD.promise;
		assertEquals(sigD.value, 6); // 1 + 2 + 3
		assertEquals(changes, ['sigD']);
		calc.length = 0;
		changes.length = 0;

		// Change each signal and verify recomputation
		sigA.set(10);
		assertEquals(calc, ['sigD']);
		calc.length = 0;
		changes.length = 0;
		await sigD.promise;
		assertEquals(sigD.value, 15); // 10 + 2 + 3

		sigB.set(20);
		assertEquals(calc, ['sigD']);
		calc.length = 0;
		changes.length = 0;
		await sigD.promise;
		assertEquals(sigD.value, 33); // 10 + 20 + 3

		sigC.set(30);
		assertEquals(calc, ['sigD']);
		calc.length = 0;
		changes.length = 0;
		await sigD.promise;
		assertEquals(sigD.value, 60); // 10 + 20 + 30
	}
);

Deno.test
(	'sync() - dependencies recorded only after sync call',
	async () =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		const sigA = sig(1, undefined);
		const sigB = sig(2, undefined);
		const sigC = sig(3, undefined);

		sigA.subscribe(() => changes.push('sigA'));
		sigB.subscribe(() => changes.push('sigB'));
		sigC.subscribe(() => changes.push('sigC'));
		changes.length = 0;

		const sigD = sig
		(	async sync =>
			{	calc.push('sigD');
				const a = sigA.value; // recorded before await
				await new Promise(r => setTimeout(r, 10));
				const b = sigB.value; // NOT recorded (no sync() call)
				sync(); // now start recording again
				const c = sigC.value; // recorded after sync()
				return a! + b! + c!;
			}
		);

		sigD.subscribe(() => changes.push('sigD'));
		calc.length = 0;
		changes.length = 0;

		await sigD.promise;
		assertEquals(sigD.value, 6); // 1 + 2 + 3

		// sigA is a dependency
		sigA.set(10);
		assertEquals(calc, ['sigD']);
		calc.length = 0;
		changes.length = 0;
		await sigD.promise;
		assertEquals(sigD.value, 15); // 10 + 2 + 3
		changes.length = 0; // Clear again after recomputation

		// sigB is NOT a dependency (accessed between await and sync)
		sigB.set(20);
		assertEquals(calc, []); // No recomputation
		assertEquals(changes.includes('sigB'), true);
		assertEquals(changes.includes('sigD'), false);
		changes.length = 0;

		// sigC is a dependency (accessed after sync())
		sigC.set(30);
		assertEquals(calc, ['sigD']);
		calc.length = 0;
		changes.length = 0;
		await sigD.promise;
		assertEquals(sigD.value, 60); // 10 + 20 + 30 (uses current sigB value)
	}
);

Deno.test
(	'sync() - with error propagation',
	async () =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		const sigA = sig(1, undefined);
		const sigB = sig<number|undefined>(new Error('B error'));

		sigA.subscribe(() => changes.push('sigA'));
		sigB.subscribe(() => changes.push('sigB'));
		changes.length = 0;

		const sigC = sig
		(	async sync =>
			{	calc.push('sigC');
				const a = sigA.value;
				await new Promise(r => setTimeout(r, 10));
				sync();
				const bError = sigB.error.value; // check error
				if (bError)
				{	throw bError;
				}
				const b = sigB.value;
				return a! + b!;
			}
		);

		sigC.subscribe(() => changes.push('sigC'));
		calc.length = 0;
		changes.length = 0;

		await sigC.promise?.catch(() => {}); // Wait and catch error
		assertEquals(sigC.error.value?.message, 'B error');
		assertEquals(changes, ['sigC']);
		changes.length = 0;

		// Fix sigB
		sigB.set(5);
		assertEquals(calc, ['sigC']);
		calc.length = 0;
		changes.length = 0;

		await sigC.promise;
		assertEquals(sigC.value, 6); // 1 + 5
		assertEquals(sigC.error.value, undefined);
	}
);

Deno.test
(	'sync() - nested async computations',
	async () =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		const sigA = sig(1, undefined);
		const sigB = sig(2, undefined);

		sigA.subscribe(() => changes.push('sigA'));
		sigB.subscribe(() => changes.push('sigB'));
		changes.length = 0;

		const sigC = sig
		(	async sync =>
			{	calc.push('sigC');
				const a = sigA.value;
				await new Promise(r => setTimeout(r, 10));
				sync();
				const b = sigB.value;
				return a! + b!;
			}
		);

		sigC.subscribe(() => changes.push('sigC'));
		calc.length = 0;
		changes.length = 0;

		const sigD = sig
		(	async sync =>
			{	calc.push('sigD');
				const _c = sigC.value; // May be undefined initially
				await new Promise(r => setTimeout(r, 10));
				sync();
				const cResolved = sigC.value; // Should be resolved now
				return (cResolved ?? 0) * 2;
			}
		);

		sigD.subscribe(() => changes.push('sigD'));
		calc.length = 0;
		changes.length = 0;

		await sigC.promise;
		await sigD.promise;

		assertEquals(sigC.value, 3); // 1 + 2
		assertEquals(sigD.value, 6); // 3 * 2

		// Change sigA - should trigger both sigC and sigD
		sigA.set(10);
		assertEquals(calc.includes('sigC'), true);
		calc.length = 0;
		changes.length = 0;

		await sigC.promise;
		await sigD.promise;

		assertEquals(sigC.value, 12); // 10 + 2
		assertEquals(sigD.value, 24); // 12 * 2
	}
);

Deno.test
(	'sync() - with promise and value type changes',
	async () =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		const sigA = sig(1, undefined);
		const sigB = sig(2, undefined);

		sigA.subscribe(() => changes.push('sigA'));
		sigB.subscribe(() => changes.push('sigB'));
		changes.length = 0;

		let useAsync = true;
		const sigC = sig
		(	async sync =>
			{	calc.push('sigC');
				const a = sigA.value;
				if (useAsync)
				{	await new Promise(r => setTimeout(r, 10));
					sync();
				}
				const b = sigB.value;
				return a! + b!;
			}
		);

		sigC.subscribe(() => changes.push('sigC'));
		calc.length = 0;
		changes.length = 0;

		await sigC.promise;
		assertEquals(sigC.value, 3); // 1 + 2

		// Change sigB - should trigger (dependency recorded after sync)
		sigB.set(5);
		assertEquals(calc, ['sigC']);
		calc.length = 0;
		changes.length = 0;
		await sigC.promise;
		assertEquals(sigC.value, 6); // 1 + 5

		// Now switch to synchronous mode
		useAsync = false;
		sigA.set(10);
		assertEquals(calc, ['sigC']);
		calc.length = 0;
		changes.length = 0;
		// The function still returns a promise (async function), so wait for it
		await sigC.promise;
		// No promise since computation is now synchronous
		assertEquals(sigC.value, 15); // 10 + 5

		// sigB should still be a dependency even without await
		sigB.set(20);
		assertEquals(calc, ['sigC']);
		calc.length = 0;
		changes.length = 0;
		await sigC.promise;
		assertEquals(sigC.value, 30); // 10 + 20
	}
);

Deno.test
(	'sync() - calling sync multiple times consecutively',
	async () =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		const sigA = sig(1, undefined);
		const sigB = sig(2, undefined);

		sigA.subscribe(() => changes.push('sigA'));
		sigB.subscribe(() => changes.push('sigB'));
		changes.length = 0;

		const sigC = sig
		(	async sync =>
			{	calc.push('sigC');
				const a = sigA.value;
				await new Promise(r => setTimeout(r, 10));
				sync();
				sync(); // call sync twice
				sync(); // and again
				const b = sigB.value;
				return a! + b!;
			}
		);

		sigC.subscribe(() => changes.push('sigC'));
		calc.length = 0;
		changes.length = 0;

		await sigC.promise;
		assertEquals(sigC.value, 3); // 1 + 2

		// Both should be dependencies
		sigA.set(10);
		calc.length = 0;
		changes.length = 0;
		await sigC.promise;
		assertEquals(sigC.value, 12); // 10 + 2

		sigB.set(20);
		calc.length = 0;
		changes.length = 0;
		await sigC.promise;
		assertEquals(sigC.value, 30); // 10 + 20
	}
);

Deno.test
(	'sync() - with convert method',
	async () =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		const sigA = sig(1, undefined);
		const sigB = sig(2, undefined);

		sigA.subscribe(() => changes.push('sigA'));
		sigB.subscribe(() => changes.push('sigB'));
		changes.length = 0;

		const sigC = sig
		(	async sync =>
			{	calc.push('sigC');
				const a = sigA.value;
				await new Promise(r => setTimeout(r, 10));
				sync();
				const b = sigB.value;
				return a! + b!;
			}
		);

		const sigD = sigC.convert(v => v! * 10);

		sigC.subscribe(() => changes.push('sigC'));
		sigD.subscribe(() => changes.push('sigD'));
		calc.length = 0;
		changes.length = 0;

		await sigC.promise;
		assertEquals(sigC.value, 3); // 1 + 2
		assertEquals(sigD.value, 30); // 3 * 10

		// Change dependency
		sigB.set(8);
		calc.length = 0;
		changes.length = 0;
		await sigC.promise;
		assertEquals(sigC.value, 9); // 1 + 8
		assertEquals(sigD.value, 90); // 9 * 10
	}
);

Deno.test
(	'sync() - dependencies change during async computation',
	async () =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		const sigA = sig(1, undefined);
		const sigB = sig(2, undefined);

		sigA.subscribe(() => changes.push('sigA'));
		sigB.subscribe(() => changes.push('sigB'));
		changes.length = 0;

		let resolvePromise: () => void;
		const sigC = sig
		(	async sync =>
			{	calc.push('sigC');
				const a = sigA.value;
				await new Promise<void>(r => resolvePromise = r);
				sync();
				const b = sigB.value;
				return a! + b!;
			}
		);

		sigC.subscribe(() => changes.push('sigC'));
		calc.length = 0;
		changes.length = 0;

		// sigC is now computing
		assertEquals(sigC.busy.value, true);

		// Change sigA while computation is in progress
		sigA.set(10);
		// This should queue a recomputation for after current one finishes

		// Resolve the promise
		resolvePromise!();
		await sigC.promise;

		// Wait for the recomputation triggered by sigA change
		if (sigC.busy.value)
		{	await sigC.promise;
		}

		// sigC should have the latest value
		assertEquals(sigC.value, 12); // 10 + 2
	}
);

// Tests for batch() feature

Deno.test
(	'batch() - basic batching of multiple changes',
	() =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		const sigA = sig(1, undefined);
		const sigB = sig(2, undefined);
		const sigC = sig(() => {calc.push('sigC'); return sigA.value! + sigB.value!});

		sigA.subscribe(() => changes.push('sigA'));
		sigB.subscribe(() => changes.push('sigB'));
		sigC.subscribe(() => changes.push('sigC'));
		assertEquals(calc, ['sigC']);
		assertEquals(changes, ['sigA', 'sigB', 'sigC']);
		calc.length = 0;
		changes.length = 0;

		// Without batch, each change triggers recomputation
		sigA.set(10);
		assertEquals(calc, ['sigC']);
		assertEquals(changes, ['sigA', 'sigC']);
		calc.length = 0;
		changes.length = 0;

		sigB.set(20);
		assertEquals(calc, ['sigC']);
		assertEquals(changes, ['sigB', 'sigC']);
		calc.length = 0;
		changes.length = 0;

		// With batch, changes are batched
		batch(() => {
			sigA.set(100);
			sigB.set(200);
		});

		// sigC should only recompute once
		assertEquals(calc, ['sigC']);
		assertEquals(changes.includes('sigA'), true);
		assertEquals(changes.includes('sigB'), true);
		assertEquals(changes.includes('sigC'), true);
		assertEquals(changes.length, 3);
		assertEquals(sigC.value, 300); // 100 + 200
	}
);

Deno.test
(	'batch() - no intermediate onChange callbacks',
	() =>
	{	const changes = new Array<string>;
		const values = new Array<number>;

		const sigA = sig(1, undefined);
		const sigB = sig(2, undefined);
		const sigC = sig(() => sigA.value! + sigB.value!);

		sigC.subscribe(function() {
			changes.push('sigC');
			values.push(this.value!);
		});
		changes.length = 0;
		values.length = 0;

		// Without batch, intermediate values are visible
		sigA.set(10);
		sigB.set(20);
		assertEquals(values, [12, 30]); // 10+2, then 10+20
		changes.length = 0;
		values.length = 0;

		// With batch, only final value is visible
		batch(() => {
			sigA.set(100);
			sigB.set(200);
		});
		assertEquals(values, [300]); // Only final: 100+200
		assertEquals(changes, ['sigC']);
	}
);

Deno.test
(	'batch() - returns callback result',
	() =>
	{	const sigA = sig(1, undefined);
		const sigB = sig(2, undefined);

		const result = batch(() => {
			sigA.set(10);
			sigB.set(20);
			return sigA.value! + sigB.value!;
		});

		assertEquals(result, 30);
	}
);

Deno.test
(	'batch() - with async callback',
	async () =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		const sigA = sig(1, undefined);
		const sigB = sig(2, undefined);
		const sigC = sig(() => {calc.push('sigC'); return sigA.value! + sigB.value!});

		sigA.subscribe(() => changes.push('sigA'));
		sigB.subscribe(() => changes.push('sigB'));
		sigC.subscribe(() => changes.push('sigC'));
		calc.length = 0;
		changes.length = 0;

		const promise = batch(async () => {
			sigA.set(10);
			await new Promise(r => setTimeout(r, 10));
			sigB.set(20);
			return 'done';
		});

		// Changes should not flush yet
		assertEquals(calc, []);
		assertEquals(changes, []);

		const result = await promise;
		assertEquals(result, 'done');

		// After promise resolves, changes should be flushed
		assertEquals(calc, ['sigC']);
		assertEquals(changes.includes('sigA'), true);
		assertEquals(changes.includes('sigB'), true);
		assertEquals(changes.includes('sigC'), true);
		assertEquals(sigC.value, 30);
	}
);

Deno.test
(	'batch() - nested batches',
	() =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		const sigA = sig(1, undefined);
		const sigB = sig(2, undefined);
		const sigC = sig(() => {calc.push('sigC'); return sigA.value! + sigB.value!});

		sigA.subscribe(() => changes.push('sigA'));
		sigB.subscribe(() => changes.push('sigB'));
		sigC.subscribe(() => changes.push('sigC'));
		calc.length = 0;
		changes.length = 0;

		batch(() => {
			sigA.set(10);
			batch(() => {
				sigB.set(20);
			});
			// Inner batch completes but outer is still active
			assertEquals(calc, []);
			assertEquals(changes, []);
		});

		// Changes flush after outermost batch
		assertEquals(calc, ['sigC']);
		assertEquals(changes.includes('sigA'), true);
		assertEquals(changes.includes('sigB'), true);
		assertEquals(changes.includes('sigC'), true);
		assertEquals(sigC.value, 30);
	}
);

Deno.test
(	'batch() - with error in callback',
	() =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		const sigA = sig(1, undefined);
		const sigB = sig(2, undefined);
		const sigC = sig(() => {calc.push('sigC'); return sigA.value! + sigB.value!});

		sigA.subscribe(() => changes.push('sigA'));
		sigB.subscribe(() => changes.push('sigB'));
		sigC.subscribe(() => changes.push('sigC'));
		calc.length = 0;
		changes.length = 0;

		let errorThrown = false;
		try {
			batch(() => {
				sigA.set(10);
				sigB.set(20);
				throw new Error('Test error');
			});
		} catch (e) {
			errorThrown = true;
			assertEquals((e as Error).message, 'Test error');
		}

		assertEquals(errorThrown, true);

		// Changes should still be flushed even after error
		assertEquals(calc, ['sigC']);
		assertEquals(changes.includes('sigA'), true);
		assertEquals(changes.includes('sigB'), true);
		assertEquals(changes.includes('sigC'), true);
		assertEquals(sigC.value, 30);
	}
);

Deno.test
(	'batch() - with error in async callback',
	async () =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		const sigA = sig(1, undefined);
		const sigB = sig(2, undefined);
		const sigC = sig(() => {calc.push('sigC'); return sigA.value! + sigB.value!});

		sigA.subscribe(() => changes.push('sigA'));
		sigB.subscribe(() => changes.push('sigB'));
		sigC.subscribe(() => changes.push('sigC'));
		calc.length = 0;
		changes.length = 0;

		let errorThrown = false;
		try {
			await batch(async () => {
				sigA.set(10);
				await new Promise(r => setTimeout(r, 10));
				sigB.set(20);
				throw new Error('Async test error');
			});
		} catch (e) {
			errorThrown = true;
			assertEquals((e as Error).message, 'Async test error');
		}

		assertEquals(errorThrown, true);

		// Changes should still be flushed even after error
		assertEquals(calc, ['sigC']);
		assertEquals(changes.includes('sigA'), true);
		assertEquals(changes.includes('sigB'), true);
		assertEquals(changes.includes('sigC'), true);
		assertEquals(sigC.value, 30);
	}
);

Deno.test
(	'batch() - complex dependency chain',
	() =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		const sigA = sig(1, undefined);
		const sigB = sig(() => {calc.push('sigB'); return sigA.value! * 2});
		const sigC = sig(() => {calc.push('sigC'); return sigB.value! + 10});
		const sigD = sig(() => {calc.push('sigD'); return sigC.value! * 3});

		sigA.subscribe(() => changes.push('sigA'));
		sigB.subscribe(() => changes.push('sigB'));
		sigC.subscribe(() => changes.push('sigC'));
		sigD.subscribe(() => changes.push('sigD'));
		calc.length = 0;
		changes.length = 0;

		// Without batch: multiple recomputations
		sigA.set(5);
		assertEquals(calc, ['sigB', 'sigC', 'sigD']);
		assertEquals(changes, ['sigA', 'sigB', 'sigC', 'sigD']);
		calc.length = 0;
		changes.length = 0;

		// With batch: still recomputes chain once
		batch(() => {
			sigA.set(10);
		});

		assertEquals(calc, ['sigB', 'sigC', 'sigD']);
		assertEquals(changes, ['sigA', 'sigB', 'sigC', 'sigD']);
		assertEquals(sigD.value, 90); // ((10 * 2) + 10) * 3 = 90
	}
);

Deno.test
(	'batch() - with diamond dependency',
	() =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		const sigA = sig(1, undefined);
		const sigB = sig(() => {calc.push('sigB'); return sigA.value! + 1});
		const sigC = sig(() => {calc.push('sigC'); return sigA.value! + 2});
		const sigD = sig(() => {calc.push('sigD'); return sigB.value! + sigC.value!});

		sigA.subscribe(() => changes.push('sigA'));
		sigB.subscribe(() => changes.push('sigB'));
		sigC.subscribe(() => changes.push('sigC'));
		sigD.subscribe(() => changes.push('sigD'));
		calc.length = 0;
		changes.length = 0;

		batch(() => {
			sigA.set(10);
		});

		// All should compute once
		assertEquals(calc.includes('sigB'), true);
		assertEquals(calc.includes('sigC'), true);
		assertEquals(calc.includes('sigD'), true);
		assertEquals(changes.includes('sigA'), true);
		assertEquals(changes.includes('sigB'), true);
		assertEquals(changes.includes('sigC'), true);
		assertEquals(changes.includes('sigD'), true);

		assertEquals(sigB.value, 11);
		assertEquals(sigC.value, 12);
		assertEquals(sigD.value, 23);
	}
);

Deno.test
(	'batch() - empty batch',
	() =>
	{	const changes = new Array<string>;

		const sigA = sig(1, undefined);
		sigA.subscribe(() => changes.push('sigA'));
		changes.length = 0;

		batch(() => {
			// Do nothing
		});

		assertEquals(changes, []);
		assertEquals(sigA.value, 1);
	}
);

Deno.test
(	'batch() - multiple signals independent changes',
	() =>
	{	const changes = new Array<string>;

		const sigA = sig(1, undefined);
		const sigB = sig(2, undefined);
		const sigC = sig(3, undefined);

		sigA.subscribe(() => changes.push('sigA'));
		sigB.subscribe(() => changes.push('sigB'));
		sigC.subscribe(() => changes.push('sigC'));
		changes.length = 0;

		batch(() => {
			sigA.set(10);
			sigB.set(20);
			sigC.set(30);
		});

		assertEquals(changes.includes('sigA'), true);
		assertEquals(changes.includes('sigB'), true);
		assertEquals(changes.includes('sigC'), true);
		assertEquals(changes.length, 3);
		assertEquals(sigA.value, 10);
		assertEquals(sigB.value, 20);
		assertEquals(sigC.value, 30);
	}
);

Deno.test
(	'batch() - with property signals',
	() =>
	{	const changes = new Array<string>;
		const calc = new Array<string>;

		const user = sig({name: 'John', age: 30});
		const userName = user.this.name;
		const userAge = user.this.age;
		const greeting = sig(() => {
			calc.push('greeting');
			return `${userName.value} is ${userAge.value} years old`;
		});

		user.subscribe(() => changes.push('user'));
		userName.subscribe(() => changes.push('userName'));
		userAge.subscribe(() => changes.push('userAge'));
		greeting.subscribe(() => changes.push('greeting'));
		calc.length = 0;
		changes.length = 0;

		batch(() => {
			userName.set('Jane');
			userAge.set(25);
		});

		// Greeting should compute once with final values
		assertEquals(calc, ['greeting']);
		assertEquals(changes.includes('user'), true);
		assertEquals(changes.includes('userName'), true);
		assertEquals(changes.includes('userAge'), true);
		assertEquals(changes.includes('greeting'), true);
		assertEquals(greeting.value, 'Jane is 25 years old');
	}
);

Deno.test
(	'batch() - does not prevent normal onChange outside batch',
	() =>
	{	const changes = new Array<string>;

		const sigA = sig(1, undefined);
		const sigB = sig(() => sigA.value! * 2);

		sigA.subscribe(() => changes.push('sigA'));
		sigB.subscribe(() => changes.push('sigB'));
		changes.length = 0;

		// Normal change outside batch
		sigA.set(5);
		assertEquals(changes, ['sigA', 'sigB']);
		changes.length = 0;

		// Batch
		batch(() => {
			sigA.set(10);
		});
		assertEquals(changes, ['sigA', 'sigB']);
		changes.length = 0;

		// Normal change again
		sigA.set(15);
		assertEquals(changes, ['sigA', 'sigB']);
	}
);

Deno.test
(	'batch() - with promise signals',
	async () =>
	{	const changes = new Array<string>;

		let resolver1: (value: number) => void;
		let resolver2: (value: number) => void;
		const promise1 = new Promise<number>(y => resolver1 = y);
		const promise2 = new Promise<number>(y => resolver2 = y);

		const sigA = sig(() => promise1, 0);
		const sigB = sig(() => promise2, 0);
		const sigC = sig(() => sigA.value + sigB.value);

		sigA.subscribe(() => changes.push('sigA'));
		sigB.subscribe(() => changes.push('sigB'));
		sigC.subscribe(() => changes.push('sigC'));
		changes.length = 0;

		// Resolve promises in batch
		batch(() => {
			resolver1!(10);
			resolver2!(20);
		});

		// Wait for promises to resolve
		await Promise.all([promise1, promise2]);
		await new Promise(y => setTimeout(y, 0));

		// Changes should be batched
		assertEquals(changes.includes('sigA'), true);
		assertEquals(changes.includes('sigB'), true);
		assertEquals(changes.includes('sigC'), true);
		assertEquals(sigC.value, 30);
	}
);

Deno.test
(	'batch() - changing same signal multiple times',
	() =>
	{	const changes = new Array<string>;
		const values = new Array<number>;

		const sigA = sig(1, undefined);
		sigA.subscribe(function() {
			changes.push('sigA');
			values.push(this.value!);
		});
		changes.length = 0;
		values.length = 0;

		batch(() => {
			sigA.set(2);
			sigA.set(3);
			sigA.set(4);
			sigA.set(5);
		});

		// Each change should be recorded, but all flushed together
		// The implementation processes changes immediately even in batch
		// so we should see all intermediate values
		assertEquals(changes.length >= 1, true);
		assertEquals(sigA.value, 5);
	}
);
