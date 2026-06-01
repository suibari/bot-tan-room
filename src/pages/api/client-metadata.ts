import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? 'https';
  const host = req.headers.host!;
  const base = `${proto}://${host}`;

  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    client_id: `${base}/api/client-metadata`,
    client_name: 'bot-tanのお部屋',
    client_uri: base,
    application_type: 'web',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    dpop_bound_access_tokens: true,
    scope: 'atproto',
    redirect_uris: [`${base}/`],
  });
}
