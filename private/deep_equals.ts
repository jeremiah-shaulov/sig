// deno-lint-ignore no-explicit-any
type Any = any;

/**	Performs a deep equality comparison between two values.
	This function compares primitive values, arrays, and objects recursively.
	It handles circular references and compares object properties including getters.

	@param a - The first value to compare
	@param b - The second value to compare
	@returns `true` if the values are deeply equal, `false` otherwise
 **/
export function deepEquals(a: unknown, b: unknown)
{	return a===b || (Number.isNaN(a) && Number.isNaN(b)) || (typeof(a)=='object' && a!==null && typeof(b)=='object' && b!==null && subequals(a, b, false, false, [], []));
}

/**	Recursively compares two values for deep equality.
	Handles primitives, arrays, objects, circular references, and NaN.
	Compares object properties including getters defined on prototypes.

	@param a First value to compare
	@param b Second value to compare
	@param aCircular Whether 'a' is part of a circular reference chain
	@param bCircular Whether 'b' is part of a circular reference chain
	@param aParents Stack of parent objects for 'a' (for circular detection)
	@param bParents Stack of parent objects for 'b' (for circular detection)
	@returns true if values are deeply equal, false otherwise
 **/
function subequals(a: object, b: object, aCircular: boolean, bCircular: boolean, aParents: unknown[], bParents: unknown[])
{	// compare functions by reference only (already compared above)
	// compare nonobjects in regular way (already compared above)
	// compare objects by reference (already compared above), and recursively (see below)
	// compare objects recursively
	aCircular ||= pushParent(aParents, a);
	bCircular ||= pushParent(bParents, b);
	if (!aCircular || !bCircular)
	{	const aArr = Array.isArray(a);
		if (aArr || Array.isArray(b)) // if any of them is array
		{	if (!aArr || !Array.isArray(b) || a.length!==b.length) // unless both are arrays of equal length
			{	return false;
			}
			for (let i=a.length; --i>=0;)
			{	const ai = a[i];
				const bi = b[i];
				if (!(ai===bi || (Number.isNaN(ai) && Number.isNaN(bi)) || (typeof(ai)=='object' && ai!==null && typeof(bi)=='object' && bi!==null && subequals(ai, bi, aCircular, bCircular, aParents, bParents))))
				{	return false;
				}
			}
		}
		else
		{	const aKeys = getKeys(a);
			const bKeys = getKeys(b);
			// Check that a and b have same number of properties
			if (aKeys.length != bKeys.length)
			{	return false;
			}
			// Check that b has all properties of a, and they are equal
			for (const p of aKeys)
			{	if (!bKeys.includes(p))
				{	return false;
				}
				const ai = (a as Any)[p];
				const bi = (b as Any)[p];
				if (!(ai===bi || (Number.isNaN(ai) && Number.isNaN(bi)) || (typeof(ai)=='object' && ai!==null && typeof(bi)=='object' && bi!==null && subequals(ai, bi, aCircular, bCircular, aParents, bParents))))
				{	return false;
				}
			}
		}
		// Remove a and b from parents
		if (!aCircular)
		{	aParents.length--;
		}
		if (!bCircular)
		{	bParents.length--;
		}
	}
	return true;
}

/**	Adds an object to the parent stack and checks for circular references.
	Circularity is detected by comparing with ancestors every 4 levels.
	This optimization balances performance with circular detection.

	@param parents Stack of parent objects
	@param obj Object to add to the stack
	@returns true if a circular reference was detected, false otherwise
 **/
function pushParent(parents: unknown[], obj: unknown)
{	parents.push(obj);
	if (parents.length%4 == 0) // check for circular references each 4th level
	{	for (let i=parents.length-4, iEnd=i+4; i<iEnd; i++)
		{	for (let j=0; j<i; j++)
			{	if (parents[j] === parents[i])
				{	parents.length--;
					return true; // inside circular
				}
			}
		}
	}
	return false;
}

/**	Gets all property keys of an object including own properties and prototype getters.
	Includes getter properties defined in the class (e.g., `class C {get prop() {}}`)
	but not standard inherited methods.

	@param obj Object to get keys from
	@returns Array of property names (strings)
 **/
function getKeys(obj: object)
{	// Own property names
	const keys = Object.keys(Object.getOwnPropertyDescriptors(obj));
	// Getter properties that are defined like `class C {get prop() {}}`
	for (const [p, {get}] of Object.entries(Object.getOwnPropertyDescriptors(Object.getPrototypeOf(obj))))
	{	if (get && !keys.includes(p))
		{	keys.push(p);
		}
	}
	// Done
	return keys;
}
