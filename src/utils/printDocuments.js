import {
  buildBatchSummary,
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

function getLogoSrc() {
  return `${window.location.origin}/modhani-logo.svg`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatAddressBlock(name, location) {
  return [
    name,
    location?.addressLine1,
    location?.addressLine2,
    [location?.city, location?.province, location?.postalCode].filter(Boolean).join(' '),
    location?.country,
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join('<br />');
}

export function printPackingSlip({ order, clients, locations, products, batches }) {
  const clientName = getClientName(clients, order.clientId);
  const locationName = getLocationName(locations, order.locationId);
  const logoSrc = getLogoSrc();
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
          <header style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:28px;">
            <div style="display:flex;align-items:center;gap:18px;">
              <img src="${logoSrc}" alt="Modhani" style="width:168px;height:auto;object-fit:contain;" />
              <div>
              <div style="font-size:28px;font-weight:700;">Packing Slip</div>
              <div style="margin-top:6px;color:#6b7280;">ModhaniOS Shipment Document</div>
              </div>
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

export function printInvoice({ order, clients, locations, products, batches = [] }) {
  const client = clients.find((entry) => entry.id === order.clientId);
  const location = locations.find((entry) => entry.id === order.locationId);
  const clientName = getClientName(clients, order.clientId);
  const locationName = getLocationName(locations, order.locationId);
  const logoSrc = getLogoSrc();
  const invoiceLines = order.items.filter((item) => item.fulfilledQty > 0);
  const invoiceTotal = order.invoiceTotal ?? invoiceLines.reduce((sum, item) => sum + (item.invoiceQty ?? item.fulfilledQty) * getEffectiveItemPrice(item), 0);
  const rows = invoiceLines
    .map((item) => {
      const product = getProduct(products, item.productId);
      const unitPrice = getEffectiveItemPrice(item);
      const invoiceQty = item.invoiceQty ?? item.fulfilledQty;
      const lineTotal = unitPrice * invoiceQty;
      const lotCode =
        item.assignedBatches
          ?.map((assigned) => batches.find((batch) => batch.id === assigned.batchId)?.batchNumber ?? assigned.batchId)
          .filter(Boolean)
          .join(', ') || '';
      const description = product ? getProductDisplayName(product) : item.productId;

      return `
        <tr>
          <td>${escapeHtml(product?.qbItemName || '')}</td>
          <td class="description">${escapeHtml(description)}</td>
          <td>${escapeHtml(lotCode)}</td>
          <td class="number">${invoiceQty.toLocaleString()}</td>
          <td>${escapeHtml(product?.unitSize || '')}</td>
          <td></td>
          <td class="number">${Number(unitPrice).toFixed(2)}</td>
          <td class="number">${Number(lineTotal).toFixed(2)}</td>
          <td>E</td>
        </tr>
      `;
    })
    .join('');
  const blankRows = Array.from({ length: Math.max(8, 14 - invoiceLines.length) })
    .map(() => '<tr class="blank-row"><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>')
    .join('');
  const invoiceTo = formatAddressBlock(clientName, location);
  const shipTo = formatAddressBlock(locationName, location);
  const totalLabel = Number(invoiceTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  openPrintableWindow(
    `Invoice ${order.invoiceNumber ?? order.orderNumber}`,
    `
      <style>
        @page { size: letter; margin: 0.35in; }
        * { box-sizing: border-box; }
        body { background: #fff !important; }
        .invoice-sheet {
          width: 8in;
          min-height: 10.2in;
          margin: 0 auto;
          padding: 0.15in;
          font-family: Georgia, "Times New Roman", serif;
          color: #111;
          background: #fff;
        }
        .invoice-top { display: grid; grid-template-columns: 1fr 2.25in; gap: 0.25in; align-items: start; }
        .brand-logo { width: 1.55in; height: auto; object-fit: contain; }
        .company-address { margin-top: 0.22in; font-size: 14px; line-height: 1.75; }
        .invoice-title { text-align: right; font: 700 18px Arial, sans-serif; margin-bottom: 0.15in; }
        table { border-collapse: collapse; width: 100%; }
        .box-table td, .box-table th, .address-box td, .meta-table td, .line-table th, .line-table td, .totals-table td { border: 1px solid #111; }
        .box-table th, .box-table td { padding: 8px 10px; text-align: center; font-size: 13px; }
        .box-table th, .address-heading, .line-table th { background: #f4f4f4; font-family: Arial, sans-serif; font-weight: 600; }
        .po-box { margin-top: 0.07in; }
        .address-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.85in; margin: 0.12in 0; }
        .address-box td { height: 0.78in; vertical-align: top; padding: 6px 8px; font-size: 12px; line-height: 1.25; }
        .address-heading { height: auto !important; padding: 6px 8px !important; font-size: 13px !important; }
        .meta-table td { padding: 8px; text-align: center; font-size: 13px; }
        .line-table { table-layout: fixed; margin-top: -1px; }
        .line-table th { padding: 8px 4px; font-size: 12px; }
        .line-table td { padding: 10px 5px; vertical-align: top; font-size: 12px; height: 0.46in; }
        .line-table .description { font-size: 12px; line-height: 1.25; }
        .line-table .number { text-align: right; }
        .blank-row td { height: 0.56in; }
        .bottom-grid { display: grid; grid-template-columns: 1fr 2.85in; align-items: stretch; }
        .signature-space { border: 1px solid #111; border-top: 0; min-height: 0.95in; }
        .totals-table td { padding: 8px 10px; font-size: 14px; }
        .totals-table .label { font: 700 18px Arial, sans-serif; }
        .totals-table .amount { text-align: right; white-space: nowrap; }
        @media print {
          body { margin: 0; }
          .invoice-sheet { width: auto; margin: 0; padding: 0; }
        }
      </style>
      <main class="invoice-sheet">
        <section class="invoice-top">
          <div>
            <img class="brand-logo" src="${logoSrc}" alt="Modhani" />
            <div class="company-address">
              <div>21 Regan Road, Unit F and G</div>
              <div>Phone #&nbsp;&nbsp; (905) 495-3842</div>
            </div>
          </div>
          <div>
            <div class="invoice-title">Invoice</div>
            <table class="box-table">
              <tr><th>Date</th><th>Invoice #</th></tr>
              <tr><td>${escapeHtml(formatDate(order.invoicedAt ?? new Date().toISOString()))}</td><td>${escapeHtml(order.invoiceNumber ?? `MOD-${order.orderNumber}`)}</td></tr>
            </table>
            <table class="box-table po-box">
              <tr><th style="width:50%;">P.O. No.</th><td>${escapeHtml(order.poNumber ?? '')}</td></tr>
            </table>
          </div>
        </section>

        <section class="address-grid">
          <table class="address-box">
            <tr><td class="address-heading">Invoice To</td></tr>
            <tr><td>${invoiceTo}</td></tr>
          </table>
          <table class="address-box">
            <tr><td class="address-heading">Ship To</td></tr>
            <tr><td>${shipTo}</td></tr>
          </table>
        </section>

        <table class="meta-table">
          <tr>
            <td style="width:12%;">E-mail</td>
            <td style="width:20%;">${escapeHtml(client?.invoiceEmail || client?.packingSlipEmail || 'vsehdev@modhani.ca')}</td>
            <td style="width:12%;">Terms</td>
            <td></td>
            <td style="width:12%;">GST/HST No.</td>
            <td style="width:19%;">784999898</td>
          </tr>
        </table>

        <table class="line-table">
          <colgroup>
            <col style="width:7%;" />
            <col style="width:42%;" />
            <col style="width:10%;" />
            <col style="width:7%;" />
            <col style="width:7%;" />
            <col style="width:7%;" />
            <col style="width:6%;" />
            <col style="width:8%;" />
            <col style="width:4%;" />
          </colgroup>
          <thead>
            <tr>
              <th>Item No.</th>
              <th>Description with bar code</th>
              <th>Lot Code</th>
              <th>Qty</th>
              <th>U/M</th>
              <th>Unit</th>
              <th>Rate</th>
              <th>Amount</th>
              <th>Tax</th>
            </tr>
          </thead>
          <tbody>${rows}${blankRows}</tbody>
        </table>

        <section class="bottom-grid">
          <div class="signature-space"></div>
          <table class="totals-table">
            <tr><td class="label">Total</td><td class="amount">CAD ${totalLabel}</td></tr>
            <tr><td class="label" style="font-weight:400;">Payments/Credits</td><td class="amount">CAD 0.00</td></tr>
            <tr><td class="label">Balance Due</td><td class="amount">CAD ${totalLabel}</td></tr>
          </table>
        </section>
      </main>
    `
  );
}

export function getPackingSlipPreview(order, batches) {
  return buildBatchSummary(order, batches)
    .map((entry) => `${entry.batchNumber}: ${entry.qty}`)
    .join(', ');
}
