// Vercel's documented Web-signature function shape: `export default { fetch(request) }`.
// route() maps the request method to a handler and answers 405 for anything else.

export function route(handlers) {
  return {
    fetch(request) {
      const handler = handlers[request.method];
      if (handler) return handler(request);
      return new Response(null, {
        status: 405,
        headers: { Allow: Object.keys(handlers).join(', ') },
      });
    },
  };
}
