import { buildQbwcFile, getPublicBaseUrl } from './_shared.js';

export default function handler(req, res) {
  const username = process.env.QUICKBOOKS_CONNECTOR_USERNAME || 'modhanios-qbwc';
  const baseUrl = getPublicBaseUrl(req);
  const file = buildQbwcFile({ baseUrl, username });

  res.setHeader('Content-Type', 'application/qwc+xml; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="ModhaniOS-QuickBooks.qwc"');
  res.status(200).send(file);
}
