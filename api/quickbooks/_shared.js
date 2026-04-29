import { createClient } from '@supabase/supabase-js';

const APP_NAME = 'ModhaniOS QuickBooks Connector';

export function getAdminClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Missing Supabase server configuration.');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function getConnectorPassword() {
  return process.env.QUICKBOOKS_CONNECTOR_PASSWORD || '';
}

export function getPublicBaseUrl(req) {
  if (process.env.QUICKBOOKS_CONNECTOR_BASE_URL) {
    return process.env.QUICKBOOKS_CONNECTOR_BASE_URL.replace(/\/$/, '');
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

export function soapEnvelope(body) {
  return `<?xml version="1.0" encoding="utf-8"?>${''}
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns="http://developer.intuit.com/">
  <soap:Body>${body}</soap:Body>
</soap:Envelope>`;
}

export function soapString(method, value) {
  return soapEnvelope(`<${method}Response><${method}Result>${escapeXml(value)}</${method}Result></${method}Response>`);
}

export function soapArray(method, values) {
  return soapEnvelope(
    `<${method}Response><${method}Result>${values
      .map((value) => `<string>${escapeXml(value)}</string>`)
      .join('')}</${method}Result></${method}Response>`
  );
}

export function getTagValue(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match ? unescapeXml(match[1].trim()) : '';
}

export function getTagValues(xml, tagName) {
  return Array.from(xml.matchAll(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'gi'))).map(
    (match) => unescapeXml(match[1].trim())
  );
}

export function getSoapMethod(xml) {
  const match = xml.match(/<([A-Za-z0-9_]+)\s+xmlns="http:\/\/developer\.intuit\.com\/"/i);
  if (match) return match[1];

  const bodyMatch = xml.match(/<soap:Body>\s*<([A-Za-z0-9_]+)/i) || xml.match(/<Body>\s*<([A-Za-z0-9_]+)/i);
  return bodyMatch?.[1] ?? '';
}

export function buildQbwcFile({ baseUrl, username }) {
  return `<?xml version="1.0"?>
<QBWCXML>
  <AppName>${APP_NAME}</AppName>
  <AppID></AppID>
  <AppURL>${baseUrl}/api/quickbooks/qbwc</AppURL>
  <AppDescription>Queues ModhaniOS invoices into QuickBooks Desktop Enterprise.</AppDescription>
  <AppSupport>${baseUrl}</AppSupport>
  <UserName>${escapeXml(username)}</UserName>
  <OwnerID>{57F3B9B8-54F8-43B1-8D0D-9D7A8E1FAE10}</OwnerID>
  <FileID>{C7CE1A5E-1E13-49C7-9894-14909B0D7E24}</FileID>
  <QBType>QBFS</QBType>
  <Scheduler>
    <RunEveryNMinutes>10</RunEveryNMinutes>
  </Scheduler>
  <IsReadOnly>false</IsReadOnly>
</QBWCXML>`;
}

export async function hasPendingQuickBooksWork(supabase) {
  const { count, error } = await supabase
    .from('quickbooks_sync_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (error) throw error;
  return Number(count ?? 0) > 0;
}

export async function lockNextQuickBooksJob(supabase, ticket) {
  const { data: jobs, error } = await supabase
    .from('quickbooks_sync_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) throw error;
  const job = [...(jobs ?? [])].sort((a, b) => getJobPriority(a) - getJobPriority(b))[0];
  if (!job) return null;

  const requestXml = await buildQuickBooksRequest(supabase, job);
  const now = new Date().toISOString();

  const { data: lockedJob, error: updateError } = await supabase
    .from('quickbooks_sync_jobs')
    .update({
      status: 'syncing',
      request_xml: requestXml,
      attempts: Number(job.attempts ?? 0) + 1,
      locked_by_ticket: ticket,
      locked_at: now,
      error_message: null,
    })
    .eq('id', job.id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (updateError) throw updateError;
  if (!lockedJob) return null;

  if (job.job_type === 'invoice') {
    await supabase.from('orders').update({ qb_sync_status: 'syncing' }).eq('id', job.order_id);
  }

  await supabase.from('quickbooks_settings').update({
    connected: true,
    status: 'connected',
    connector_last_seen_at: now,
  }).eq('id', 'singleton');

  return { ...lockedJob, request_xml: requestXml };
}

function getJobPriority(job) {
  if (job.job_type === 'customer') return 1;
  if (job.job_type === 'item') return 2;
  return 3;
}

export async function completeInvoiceJob(supabase, ticket, responseXml) {
  const { data: job, error } = await supabase
    .from('quickbooks_sync_jobs')
    .select('*')
    .eq('locked_by_ticket', ticket)
    .eq('status', 'syncing')
    .order('locked_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!job) return 100;

  const qbStatus = getQuickBooksStatus(responseXml, job.job_type);
  if (qbStatus.statusCode && qbStatus.statusCode !== '0') {
    if (isAlreadyExistsStatus(job, qbStatus)) {
      await markJobPushed(supabase, job, responseXml, null, getReferenceNumber(job));
      return 100;
    }

    await failInvoiceJob(supabase, ticket, qbStatus.message || `QuickBooks rejected the ${job.job_type} job with status ${qbStatus.statusCode}.`);
    return 100;
  }

  if (job.job_type !== 'invoice') {
    await markJobPushed(supabase, job, responseXml, getTagValue(responseXml, 'ListID'), getReferenceNumber(job));
    return 100;
  }

  const qbTxnId = getTagValue(responseXml, 'TxnID');
  const qbRefNumber = getTagValue(responseXml, 'RefNumber');
  if (!qbTxnId) {
    await failInvoiceJob(supabase, ticket, 'QuickBooks did not return an invoice transaction ID.');
    return 100;
  }

  await markJobPushed(supabase, job, responseXml, qbTxnId, qbRefNumber || `QB-${job.order_id}`);
  return 100;
}

async function markJobPushed(supabase, job, responseXml, qbId, qbReference) {
  const now = new Date().toISOString();

  await supabase.from('quickbooks_sync_jobs').update({
    status: 'pushed',
    response_xml: responseXml,
    qb_txn_id: qbId || null,
    qb_invoice_number: qbReference || null,
    error_message: null,
    locked_by_ticket: null,
    locked_at: null,
  }).eq('id', job.id);

  await supabase.from('quickbooks_sync_attempts').insert({
    job_id: job.id,
    status: 'pushed',
    request_xml: job.request_xml,
    response_xml: responseXml,
  });

  if (job.job_type === 'invoice') {
    await supabase.from('orders').update({
      qb_invoice_number: qbReference,
      qb_sync_status: 'pushed',
      qb_synced_at: now,
    }).eq('id', job.order_id);
  }

  await supabase.from('quickbooks_settings').update({
    connected: true,
    status: 'connected',
    last_sync_at: now,
    connector_last_seen_at: now,
  }).eq('id', 'singleton');
}

function getQuickBooksStatus(responseXml, jobType) {
  const responseTag = {
    customer: 'CustomerAddRs',
    item: 'ItemNonInventoryAddRs',
    invoice: 'InvoiceAddRs',
  }[jobType] || 'InvoiceAddRs';
  const statusCodeMatch = responseXml.match(new RegExp(`<${responseTag}\\b[^>]*\\bstatusCode="([^"]*)"`, 'i'));
  const statusMessageMatch = responseXml.match(new RegExp(`<${responseTag}\\b[^>]*\\bstatusMessage="([^"]*)"`, 'i'));

  return {
    statusCode: statusCodeMatch?.[1] ?? '',
    message: statusMessageMatch?.[1] ? unescapeXml(statusMessageMatch[1]) : '',
  };
}

function isAlreadyExistsStatus(job, qbStatus) {
  if (!['customer', 'item'].includes(job.job_type)) return false;
  return qbStatus.statusCode === '3100' || /already exists|already in use/i.test(qbStatus.message);
}

function getReferenceNumber(job) {
  return job.entity_id || job.order_id || job.id;
}

export async function failInvoiceJob(supabase, ticket, message) {
  const { data: job, error } = await supabase
    .from('quickbooks_sync_jobs')
    .select('*')
    .eq('locked_by_ticket', ticket)
    .eq('status', 'syncing')
    .order('locked_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!job) return;

  const safeMessage = message || 'QuickBooks Web Connector reported an error.';

  await supabase.from('quickbooks_sync_jobs').update({
    status: 'failed',
    error_message: safeMessage,
    locked_by_ticket: null,
    locked_at: null,
  }).eq('id', job.id);

  await supabase.from('quickbooks_sync_attempts').insert({
    job_id: job.id,
    status: 'failed',
    request_xml: job.request_xml,
    error_message: safeMessage,
  });

  if (job.job_type === 'invoice') {
    await supabase.from('orders').update({ qb_sync_status: 'failed' }).eq('id', job.order_id);
  }

  const { data: settings } = await supabase
    .from('quickbooks_settings')
    .select('failed_sync_count')
    .eq('id', 'singleton')
    .maybeSingle();

  await supabase.from('quickbooks_settings').update({
    connected: true,
    status: 'connected',
    connector_last_seen_at: new Date().toISOString(),
    failed_sync_count: Number(settings?.failed_sync_count ?? 0) + 1,
  }).eq('id', 'singleton');
}

async function buildInvoicePayload(supabase, orderId) {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*, clients(*), locations(*)')
    .eq('id', orderId)
    .single();

  if (orderError) throw orderError;

  const { data: items, error: itemError } = await supabase
    .from('order_items')
    .select('*, products(*)')
    .eq('order_id', orderId);

  if (itemError) throw itemError;

  const { data: assignments, error: assignmentError } = await supabase
    .from('batch_assignments')
    .select('*, batches(batch_number)')
    .in('order_item_id', (items ?? []).map((item) => item.id));

  if (assignmentError) throw assignmentError;

  return {
    order,
    lines: (items ?? [])
      .filter((item) => Number(item.fulfilled_qty) > 0)
      .map((item) => ({
        item,
        product: item.products,
        batches: (assignments ?? []).filter((assignment) => assignment.order_item_id === item.id),
      })),
  };
}

async function buildQuickBooksRequest(supabase, job) {
  if (job.job_type === 'customer') {
    const payload = await buildCustomerPayload(supabase, job.entity_id);
    return buildCustomerAddRequest(payload);
  }

  if (job.job_type === 'item') {
    const payload = await buildItemPayload(supabase, job.entity_id);
    return buildItemAddRequest(payload);
  }

  const payload = await buildInvoicePayload(supabase, job.order_id);
  return buildInvoiceAddRequest(payload);
}

async function buildCustomerPayload(supabase, clientId) {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single();

  if (clientError) throw clientError;

  const { data: location, error: locationError } = await supabase
    .from('locations')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  if (locationError) throw locationError;
  return { client, location };
}

async function buildItemPayload(supabase, productId) {
  const { data: product, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .single();

  if (error) throw error;
  return product;
}

function buildCustomerAddRequest({ client, location }) {
  const fullName = client.qb_customer_name || client.name;
  const address = location || {};

  return `<?xml version="1.0" encoding="utf-8"?>
<?qbxml version="16.0"?>
<QBXML>
  <QBXMLMsgsRq onError="stopOnError">
    <CustomerAddRq requestID="${escapeXml(client.id)}">
      <CustomerAdd>
        <Name>${escapeXml(fullName)}</Name>
        <CompanyName>${escapeXml(client.name)}</CompanyName>
        <BillAddress>
          <Addr1>${escapeXml(fullName)}</Addr1>
          <Addr2>${escapeXml(address.address_line1 || '')}</Addr2>
          <City>${escapeXml(address.city || '')}</City>
          <State>${escapeXml(address.province || '')}</State>
          <PostalCode>${escapeXml(address.postal_code || '')}</PostalCode>
          <Country>${escapeXml(address.country || 'Canada')}</Country>
        </BillAddress>
        <ShipAddress>
          <Addr1>${escapeXml(address.qb_ship_to_name || address.name || fullName)}</Addr1>
          <Addr2>${escapeXml(address.address_line1 || '')}</Addr2>
          <City>${escapeXml(address.city || '')}</City>
          <State>${escapeXml(address.province || '')}</State>
          <PostalCode>${escapeXml(address.postal_code || '')}</PostalCode>
          <Country>${escapeXml(address.country || 'Canada')}</Country>
        </ShipAddress>
      </CustomerAdd>
    </CustomerAddRq>
  </QBXMLMsgsRq>
</QBXML>`;
}

function buildItemAddRequest(product) {
  const itemName = product.qb_item_name || `${product.name} ${product.unit_size}`.trim();

  return `<?xml version="1.0" encoding="utf-8"?>
<?qbxml version="16.0"?>
<QBXML>
  <QBXMLMsgsRq onError="stopOnError">
    <ItemNonInventoryAddRq requestID="${escapeXml(product.id)}">
      <ItemNonInventoryAdd>
        <Name>${escapeXml(itemName)}</Name>
        <SalesOrPurchase>
          <Desc>${escapeXml(`${product.name} ${product.unit_size}`.trim())}</Desc>
          <Price>${Number(product.base_catalogue_price ?? 0).toFixed(2)}</Price>
          <AccountRef>
            <FullName>Sales</FullName>
          </AccountRef>
        </SalesOrPurchase>
      </ItemNonInventoryAdd>
    </ItemNonInventoryAddRq>
  </QBXMLMsgsRq>
</QBXML>`;
}

function buildInvoiceAddRequest({ order, lines }) {
  const client = order.clients;
  const location = order.locations;

  return `<?xml version="1.0" encoding="utf-8"?>
<?qbxml version="16.0"?>
<QBXML>
  <QBXMLMsgsRq onError="stopOnError">
    <InvoiceAddRq requestID="${escapeXml(order.id)}">
      <InvoiceAdd>
        <CustomerRef>
          <FullName>${escapeXml(client.qb_customer_name || client.name)}</FullName>
        </CustomerRef>
        <TxnDate>${escapeXml(toDate(order.invoiced_at || order.created_at))}</TxnDate>
        <RefNumber>${escapeXml(order.invoice_number)}</RefNumber>
        <ShipAddress>
          <Addr1>${escapeXml(location.qb_ship_to_name || location.name)}</Addr1>
          <Addr2>${escapeXml(location.address_line1 || '')}</Addr2>
          ${location.address_line2 ? `<Addr3>${escapeXml(location.address_line2)}</Addr3>` : ''}
          <City>${escapeXml(location.city || '')}</City>
          <State>${escapeXml(location.province || '')}</State>
          <PostalCode>${escapeXml(location.postal_code || '')}</PostalCode>
          <Country>${escapeXml(location.country || 'Canada')}</Country>
        </ShipAddress>
        <Memo>${escapeXml(`ModhaniOS Order #${order.order_number}`)}</Memo>
        ${lines.map(buildInvoiceLine).join('')}
      </InvoiceAdd>
    </InvoiceAddRq>
  </QBXMLMsgsRq>
</QBXML>`;
}

function buildInvoiceLine({ item, product, batches }) {
  const unitPrice = item.override_price ?? item.client_price ?? item.base_price ?? 0;
  const batchText = batches
    .map((assignment) => `${assignment.batches?.batch_number ?? assignment.batch_id}: ${Number(assignment.qty).toLocaleString()} units`)
    .join(', ');

  return `<InvoiceLineAdd>
          <ItemRef>
            <FullName>${escapeXml(product.qb_item_name || `${product.name} ${product.unit_size}`.trim())}</FullName>
          </ItemRef>
          <Desc>${escapeXml(batchText ? `${product.name} ${product.unit_size} | Batches: ${batchText}` : `${product.name} ${product.unit_size}`)}</Desc>
          <Quantity>${Number(item.fulfilled_qty)}</Quantity>
          <Rate>${Number(unitPrice).toFixed(2)}</Rate>
        </InvoiceLineAdd>`;
}

function toDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

export function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function unescapeXml(value) {
  return String(value ?? '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}
