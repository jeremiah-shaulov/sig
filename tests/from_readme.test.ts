import {storeExamplesToTmpFiles} from './deps.ts';

for (const {exampleName, filename} of await storeExamplesToTmpFiles(import.meta.url))
{	const func = async function()
	{	await import(filename);
	};
	Object.defineProperty(func, 'name', {value: exampleName, writable: false});
	Deno.test(func);
}
