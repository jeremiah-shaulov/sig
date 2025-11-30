// deno-lint-ignore no-explicit-any
type Any = any;

export function deepEquals(a: unknown, b: unknown)
{	return subequals(a, b, false, false, [], []);
}

function subequals(a: unknown, b: unknown, aCircular: boolean, bCircular: boolean, aParents: unknown[], bParents: unknown[])
{	if (a===b || Number.isNaN(a) && Number.isNaN(b))
	{	return true;
	}
	// compare functions by reference only (already compared above)
	// compare nonobjects in regular way (already compared above)
	// compare objects by reference (already compared above), and recursively (see below)
	if (typeof(a)=='object' && a!=null && typeof(b)=='object' && b!=null)
	{	// compare objects recursively
		const aArr = Array.isArray(a);
		if (aArr || Array.isArray(b)) // if any of them is array
		{	if (!aArr || !Array.isArray(b) || a.length!==b.length) // unless both are arrays of equal length
			{	return false;
			}
			if (!aCircular || !bCircular)
			{	for (let i=a.length; --i>=0;)
				{	if (!subequals(a[i], b[i], aCircular, bCircular, aParents, bParents))
					{	return false;
					}
				}
			}
			return true;
		}
		aCircular ||= pushParent(aParents, a);
		bCircular ||= pushParent(bParents, b);
		if (!aCircular || !bCircular)
		{	const aKeys = getKeys(a);
			const bKeys = getKeys(b);
			// Check that a and b have same number of properties
			if (aKeys.length != bKeys.length)
			{	return false;
			}
			// Check that b has all properties of a, and they are equal
			for (const p of aKeys)
			{	if (!bKeys.includes(p) || !subequals((a as Any)[p], (b as Any)[p], aCircular, bCircular, aParents, bParents))
				{	return false;
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
	return false;
}

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
