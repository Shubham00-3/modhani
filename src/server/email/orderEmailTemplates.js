const EVENT_LABELS = {
  order_received: 'Order received',
  order_shipped: 'Order shipped',
  order_delivered: 'Order delivered',
  order_updated: 'Order updated',
  invoice_ready: 'Invoice ready',
};

export function buildOrderEmail({ eventType, order, client, location, items }) {
  const label = EVENT_LABELS[eventType] ?? 'Order update';
  const orderNumber = order.order_number ?? order.orderNumber ?? order.id;
  const clientName = client?.operating_as || client?.name || 'your company';
  const locationName = location?.name ? ` - ${location.name}` : '';
  const subject = `${label}: Order #${orderNumber}`;
  const intro = buildIntro(eventType, order, clientName);
  const rowsHtml = items.map((item) => renderItemRow(item)).join('');
  const rowsText = items.map((item) => {
    const product = item.product;
    const name = [product?.name, product?.unit_size].filter(Boolean).join(' ');
    return `- ${name || item.product_id}: ordered ${formatQty(item.quantity)}, fulfilled ${formatQty(item.fulfilled_qty)}`;
  }).join('\n');
  const details = buildDetails(eventType, order);

  const html = `
<!doctype html>
<html>
  <body style="margin:0;background:#f4f7f4;font-family:Arial,sans-serif;color:#17211b;">
    <div style="max-width:640px;margin:0 auto;padding:28px 18px;">
      <div style="background:#ffffff;border:1px solid #dfe7e2;border-radius:10px;overflow:hidden;">
        <div style="background:#10261a;color:#ffffff;padding:20px 24px;">
          <div style="font-size:13px;letter-spacing:.04em;text-transform:uppercase;opacity:.78;">Modhani</div>
          <h1 style="margin:6px 0 0;font-size:24px;line-height:1.25;">${escapeHtml(label)}</h1>
        </div>
        <div style="padding:24px;">
          <p style="font-size:16px;line-height:1.55;margin:0 0 18px;">${escapeHtml(intro)}</p>
          <div style="background:#f7faf8;border:1px solid #e4ece6;border-radius:8px;padding:14px 16px;margin-bottom:18px;">
            <div><strong>Order:</strong> #${escapeHtml(orderNumber)}</div>
            <div><strong>Client:</strong> ${escapeHtml(clientName)}${escapeHtml(locationName)}</div>
            ${details.map((entry) => `<div><strong>${escapeHtml(entry.label)}:</strong> ${escapeHtml(entry.value)}</div>`).join('')}
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <thead>
              <tr>
                <th style="text-align:left;border-bottom:1px solid #dfe7e2;padding:8px;">Product</th>
                <th style="text-align:right;border-bottom:1px solid #dfe7e2;padding:8px;">Ordered</th>
                <th style="text-align:right;border-bottom:1px solid #dfe7e2;padding:8px;">Fulfilled</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <p style="font-size:13px;line-height:1.5;color:#5d6b62;margin:20px 0 0;">
            This is an automated notification from ModhaniOS. Reply to this email if you need help with this order.
          </p>
        </div>
      </div>
    </div>
  </body>
</html>`;

  const text = [
    `${label}: Order #${orderNumber}`,
    '',
    intro,
    '',
    `Client: ${clientName}${locationName}`,
    ...details.map((entry) => `${entry.label}: ${entry.value}`),
    '',
    rowsText,
    '',
    'This is an automated notification from ModhaniOS.',
  ].join('\n');

  return { subject, html, text, label };
}

function buildIntro(eventType, order, clientName) {
  const orderNumber = order.order_number ?? order.orderNumber ?? order.id;
  switch (eventType) {
    case 'order_received':
      return `We received order #${orderNumber} for ${clientName}. Our team will review it shortly.`;
    case 'order_shipped':
      return `Order #${orderNumber} has been shipped and is on the way.`;
    case 'order_delivered':
      return `Order #${orderNumber} has been delivered.`;
    case 'invoice_ready':
      return `Invoice ${order.invoice_number || ''} is ready for order #${orderNumber}.`;
    case 'order_updated':
      return `Order #${orderNumber} has been updated.`;
    default:
      return `There is an update for order #${orderNumber}.`;
  }
}

function buildDetails(eventType, order) {
  const details = [];
  if (eventType === 'order_shipped' && order.shipped_at) {
    details.push({ label: 'Shipped', value: formatDate(order.shipped_at) });
  }
  if (eventType === 'order_delivered' && order.pod_signed_at) {
    details.push({ label: 'Delivered', value: formatDate(order.pod_signed_at) });
  }
  if (eventType === 'order_delivered' && order.pod_signed_by) {
    details.push({ label: 'Signed by', value: order.pod_signed_by });
  }
  if (eventType === 'invoice_ready' && order.invoice_number) {
    details.push({ label: 'Invoice', value: order.invoice_number });
  }
  if (eventType === 'order_updated' && order.decline_reason) {
    details.push({ label: 'Reason', value: order.decline_reason });
  }
  return details;
}

function renderItemRow(item) {
  const product = item.product;
  const name = [product?.name, product?.unit_size].filter(Boolean).join(' ') || item.product_id;
  return `
    <tr>
      <td style="border-bottom:1px solid #edf2ee;padding:8px;">${escapeHtml(name)}</td>
      <td style="border-bottom:1px solid #edf2ee;padding:8px;text-align:right;">${escapeHtml(formatQty(item.quantity))}</td>
      <td style="border-bottom:1px solid #edf2ee;padding:8px;text-align:right;">${escapeHtml(formatQty(item.fulfilled_qty))}</td>
    </tr>`;
}

function formatQty(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString('en-CA') : String(value ?? 0);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Toronto',
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
