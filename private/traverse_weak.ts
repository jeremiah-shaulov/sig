export function *traverseWeak<T extends object>(items: Array<T|WeakRef<T>>)
{	for (let i=items.length; --i>=0;)
	{	const itemOrRef = items[i];
		const item = itemOrRef instanceof WeakRef ? itemOrRef.deref() : itemOrRef;
		if (!item)
		{	items[i] = items[items.length - 1];
			items.length--;
		}
		else
		{	yield item;
		}
	}
}
