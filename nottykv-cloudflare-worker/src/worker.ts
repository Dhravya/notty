interface Env {
	nottykv: KVNamespace;
	SECURITY_KEY: string;
}

const handleResponse = {
	async fetch(request: Request, env: Env) {
		if (!isAuthorized(request, env)) {
			return new Response('Unauthorized', { status: 401 });
		}

		const reqUrl = new URL(request.url);
		const key = reqUrl.searchParams.get('key');
		const getAllFromUser = reqUrl.searchParams.get('getAllFromUser');

		if (getAllFromUser) {
			return await getAllKeys(env, getAllFromUser);
		}

		if (!key) {
			return new Response('No key provided', { status: 400 });
		}

		switch (request.method) {
			case 'PUT':
				return await handlePut(request, env, key);
			case 'DELETE':
				return await handleDelete(env, key);
			default:
				return await handleGet(env, key);
		}
	},
};

function isAuthorized(request: Request, env: Env): boolean {
	return request.headers.get('X-Custom-Auth-Key') === env.SECURITY_KEY;
}

async function getAllKeys(env: Env, prefix: string): Promise<Response> {
	const keys = await env.nottykv.list({ prefix: prefix + '-' });
	const keyValuePairs: Record<string, string | null> = {};
	for (const key of keys.keys) {
		keyValuePairs[key.name] = await env.nottykv.get(key.name);
	}
	return new Response(JSON.stringify(keyValuePairs));
}

async function handlePut(request: Request, env: Env, key: string): Promise<Response> {
	const body = await request.text();
	await env.nottykv.put(key, body);
	return new Response('OK');
}

async function handleDelete(env: Env, key: string): Promise<Response> {
	const data = await env.nottykv.get(key);
	if (!data) {
		return new Response('Not found', { status: 404 });
	}
	await env.nottykv.put('archived-' + key, data);
	await env.nottykv.delete(key);
	return new Response('OK');
}

async function handleGet(env: Env, key: string): Promise<Response> {
	const data = await env.nottykv.get(key);
	if (!data) {
		return new Response('Not found', { status: 404 });
	}
	return new Response(data);
}

export default handleResponse;
