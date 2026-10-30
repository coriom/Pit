// Temporary fail-closed Worker. Never serves PIT assets.
export default {
  fetch() {
    return new Response('Forbidden', {
      status: 403,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  },
};
