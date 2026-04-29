import {
  buildBatchSummary,
  formatCurrency,
  formatDate,
  getClientName,
  getEffectiveItemPrice,
  getLocationName,
  getProduct,
  getProductDisplayName,
} from '../data/phaseOneData';

function openPrintableWindow(title, markup) {
  const printWindow = window.open('', '_blank', 'width=900,height=700');

  if (!printWindow) return false;

  const printableMarkup = `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
      </head>
      <body style="margin:0;background:#f3f4f6;">
        ${markup}
      </body>
    </html>
  `;

  const triggerPrint = () => {
    printWindow.focus();
    printWindow.print();
  };

  printWindow.document.open();
  printWindow.document.write(printableMarkup);
  printWindow.document.close();

  if (printWindow.document.readyState === 'complete') {
    setTimeout(triggerPrint, 150);
  } else {
    printWindow.addEventListener(
      'load',
      () => {
        setTimeout(triggerPrint, 150);
      },
      { once: true }
    );
  }

  return true;
}

export function printPackingSlip({ order, clients, locations, products, batches }) {
  const clientName = getClientName(clients, order.clientId);
  const locationName = getLocationName(locations, order.locationId);
  const rows = order.items
    .map((item) => {
      const product = getProduct(products, item.productId);
      const batchLines = item.assignedBatches
        .map((assigned) => {
          const batch = batches.find((entry) => entry.id === assigned.batchId);
          return `<li>${batch?.batchNumber ?? assigned.batchId}: ${assigned.qty.toLocaleString()} units</li>`;
        })
        .join('');

      return `
        <section style="margin-bottom:18px;padding:16px;border:1px solid #e5e7eb;border-radius:10px;">
          <div style="display:flex;justify-content:space-between;gap:12px;font-weight:600;">
            <span>${getProductDisplayName(product)}</span>
            <span>${item.fulfilledQty.toLocaleString()} units</span>
          </div>
          <ul style="margin:10px 0 0 18px;padding:0;color:#4b5563;">
            ${batchLines || '<li>No batch assignment</li>'}
          </ul>
        </section>
      `;
    })
    .join('');

  openPrintableWindow(
    `Packing Slip ${order.packingSlipNumber ?? order.orderNumber}`,
    `
      <main style="font-family:Segoe UI,Arial,sans-serif;padding:32px;color:#111827;">
          <header style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;">
            <div>
              <div style="font-size:28px;font-weight:700;">Packing Slip</div>
              <div style="margin-top:6px;color:#6b7280;">ModhaniOS Shipment Document</div>
            </div>
            <div style="text-align:right;">
              <div><strong>Slip #:</strong> ${order.packingSlipNumber ?? `PS-${order.orderNumber}`}</div>
              <div><strong>Order #:</strong> ${order.orderNumber}</div>
              <div><strong>Date:</strong> ${formatDate(order.shippedAt ?? new Date().toISOString())}</div>
            </div>
          </header>

          <section style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px;">
            <div style="padding:16px;border:1px solid #e5e7eb;border-radius:10px;">
              <div style="font-size:12px;text-transform:uppercase;color:#6b7280;">Client</div>
              <div style="font-size:18px;font-weight:600;margin-top:4px;">${clientName}</div>
            </div>
            <div style="padding:16px;border:1px solid #e5e7eb;border-radius:10px;">
              <div style="font-size:12px;text-transform:uppercase;color:#6b7280;">Location</div>
              <div style="font-size:18px;font-weight:600;margin-top:4px;">${locationName}</div>
            </div>
          </section>

          ${rows}

          <section style="margin-top:44px;border-top:1px solid #d1d5db;padding-top:32px;">
            <div style="font-size:12px;text-transform:uppercase;color:#6b7280;margin-bottom:28px;">Driver Signature</div>
            <div style="height:56px;border-bottom:1px solid #111827;"></div>
          </section>
      </main>
    `
  );
}

export function printInvoice({ order, clients, locations, products }) {
  const clientName = getClientName(clients, order.clientId);
  const locationName = getLocationName(locations, order.locationId);
  const rows = order.items
    .filter((item) => item.fulfilledQty > 0)
    .map((item) => {
      const product = getProduct(products, item.productId);
      const unitPrice = getEffectiveItemPrice(item);
      const lineTotal = unitPrice * item.fulfilledQty;

      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${getProductDisplayName(product)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${item.fulfilledQty.toLocaleString()}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${formatCurrency(unitPrice)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${formatCurrency(lineTotal)}</td>
        </tr>
      `;
    })
    .join('');

  openPrintableWindow(
    `Invoice ${order.invoiceNumber ?? order.orderNumber}`,
    `
      <main style="font-family:Segoe UI,Arial,sans-serif;padding:32px;color:#111827;">
          <header style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;">
            <div>
              <div style="font-size:28px;font-weight:700;">Invoice</div>
              <div style="margin-top:6px;color:#6b7280;">ModhaniOS Billing Document</div>
            </div>
            <div style="text-align:right;">
              <div><strong>Invoice #:</strong> ${order.invoiceNumber ?? `MOD-${order.orderNumber}`}</div>
              <div><strong>Order #:</strong> ${order.orderNumber}</div>
              <div><strong>Date:</strong> ${formatDate(order.invoicedAt ?? new Date().toISOString())}</div>
            </div>
          </header>

          <section style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px;">
            <div style="padding:16px;border:1px solid #e5e7eb;border-radius:10px;">
              <div style="font-size:12px;text-transform:uppercase;color:#6b7280;">Client</div>
              <div style="font-size:18px;font-weight:600;margin-top:4px;">${clientName}</div>
            </div>
            <div style="padding:16px;border:1px solid #e5e7eb;border-radius:10px;">
              <div style="font-size:12px;text-transform:uppercase;color:#6b7280;">Location</div>
              <div style="font-size:18px;font-weight:600;margin-top:4px;">${locationName}</div>
            </div>
          </section>

          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="text-align:left;background:#f9fafb;">
                <th style="padding:10px 12px;">Product</th>
                <th style="padding:10px 12px;">Qty</th>
                <th style="padding:10px 12px;">Unit Price</th>
                <th style="padding:10px 12px;">Line Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <div style="display:flex;justify-content:flex-end;margin-top:18px;">
            <div style="padding:16px 20px;background:#f9fafb;border-radius:10px;">
              <div><strong>Total:</strong> ${formatCurrency(order.invoiceTotal ?? 0)}</div>
            </div>
          </div>
      </main>
    `
  );
}

export function getPackingSlipPreview(order, batches) {
  return buildBatchSummary(order, batches)
    .map((entry) => `${entry.batchNumber}: ${entry.qty}`)
    .join(', ');
}
