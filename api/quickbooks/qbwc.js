import {
  completeInvoiceJob,
  failInvoiceJob,
  getAdminClient,
  getConnectorPassword,
  getSoapMethod,
  getTagValue,
  getTagValues,
  hasPendingQuickBooksWork,
  lockNextInvoiceJob,
  soapArray,
  soapString,
} from './_shared.js';

export default async function handler(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send('ModhaniOS QuickBooks Web Connector endpoint is available.');
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, HEAD, POST');
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const body = await readBody(req);
    const method = getSoapMethod(body);
    const supabase = getAdminClient();

    res.setHeader('Content-Type', 'text/xml; charset=utf-8');

    switch (method) {
      case 'serverVersion':
        res.status(200).send(soapString('serverVersion', 'ModhaniOS QBWC 1.0'));
        return;

      case 'clientVersion':
        res.status(200).send(soapString('clientVersion', ''));
        return;

      case 'authenticate': {
        const [username, password] = getTagValues(body, 'string');
        const expectedPassword = getConnectorPassword();

        if (!expectedPassword || password !== expectedPassword) {
          res.status(200).send(soapArray('authenticate', ['', 'nvu']));
          return;
        }

        const hasWork = await hasPendingQuickBooksWork(supabase);
        if (!hasWork) {
          res.status(200).send(soapArray('authenticate', [username || `ticket-${Date.now()}`, 'none']));
          return;
        }

        res.status(200).send(soapArray('authenticate', [`ticket-${Date.now()}`, '']));
        return;
      }

      case 'sendRequestXML': {
        const ticket = getTagValue(body, 'ticket');
        const job = await lockNextInvoiceJob(supabase, ticket);
        res.status(200).send(soapString('sendRequestXML', job?.request_xml ?? ''));
        return;
      }

      case 'receiveResponseXML': {
        const ticket = getTagValue(body, 'ticket');
        const response = getTagValue(body, 'response');
        const hresult = getTagValue(body, 'hresult');
        const message = getTagValue(body, 'message');

        if (hresult || message) {
          await failInvoiceJob(supabase, ticket, message || hresult);
          res.status(200).send(soapString('receiveResponseXML', '100'));
          return;
        }

        const percentage = await completeInvoiceJob(supabase, ticket, response);
        res.status(200).send(soapString('receiveResponseXML', String(percentage)));
        return;
      }

      case 'getLastError': {
        res.status(200).send(soapString('getLastError', 'QuickBooks sync failed. Check ModhaniOS sync job details.'));
        return;
      }

      case 'connectionError': {
        const ticket = getTagValue(body, 'ticket');
        const hresult = getTagValue(body, 'hresult');
        const message = getTagValue(body, 'message');
        await failInvoiceJob(supabase, ticket, message || hresult || 'QuickBooks connection error.');
        res.status(200).send(soapString('connectionError', 'done'));
        return;
      }

      case 'closeConnection':
        res.status(200).send(soapString('closeConnection', 'OK'));
        return;

      default:
        res.status(200).send(soapString(method || 'unknown', ''));
    }
  } catch (error) {
    res.setHeader('Content-Type', 'text/xml; charset=utf-8');
    res.status(200).send(soapString('getLastError', error.message));
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
