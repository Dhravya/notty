// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run "npm run dev" in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run "npm run deploy" to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

// eslint-disable-next-line import/no-anonymous-default-export
export default {
	/**
	 * @param {{ url: string | URL; method: string; text: () => Promise<string>; headers: {
	 * 		get: (key: string) => string | null
	 * } }} request
	 * @param {{ nottykv:  {
	 *
	 list({ prefix: string }): unknown;
	 * 		get: (key: string) => Promise<string | null>
	 * 		put: (key: string, value: string) => Promise<void>
	 * }; SECURITY_KEY: string}} env
	 */
	async fetch(request, env) {

		// get key from request url params
		const reqUrl = new URL(request.url)
		const key = reqUrl.searchParams.get("key")
		const getAllFromUser = reqUrl.searchParams.get("getAllFromUser")

		if (!(request.headers.get("X-Custom-Auth-Key") == env.SECURITY_KEY)) {
			return new Response("Unauthorized", { status: 401 })
		}

		if (getAllFromUser) {
			// keys are stored as 'email-id'
			const keys = await env.nottykv.list({ prefix: getAllFromUser + "-" })
			const keyValuePairs = {};
			for (let key of keys.keys) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
				keyValuePairs[key.name] = await env.nottykv.get(key.name);
			}
			return new Response(JSON.stringify(keyValuePairs));
		}

		if (!key || key == null || key == "") {
			return new Response("No key provided", { status: 400 })
		}

		if (request.method == "PUT") {
			const body = await request.text();
			await env.nottykv.put(key, body)
			return new Response("OK")
		}
		const data = await env.nottykv.get(key)
		if (!data) {
			return new Response("Not found", { status: 404 })
		}
		return new Response(data)
	},
};
