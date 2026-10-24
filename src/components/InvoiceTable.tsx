import Link from 'next/link';
import type { InvoiceDTO } from '@/lib/types';
import { formatDate, formatUSD } from '@/lib/money';
import StatusBadge from './StatusBadge';

export default function InvoiceTable({ invoices, showClient }: { invoices: InvoiceDTO[]; showClient?: boolean }) {
  if (invoices.length === 0) return <div className="empty">No invoices yet.</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Invoice</th>
            {showClient && <th>Client</th>}
            <th>Issued</th>
            <th>Due</th>
            <th className="num">Amount</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {invoices.map((i) => (
            <tr key={i.id}>
              <td>
                <Link href={`/invoices/${i.id}`}>
                  <strong>{i.number}</strong>
                </Link>
              </td>
              {showClient && <td>{i.clientCompany}</td>}
              <td>{formatDate(i.issueDate)}</td>
              <td>{formatDate(i.dueDate)}</td>
              <td className="num">{formatUSD(i.totalCents)}</td>
              <td>
                <StatusBadge status={i.status} />
              </td>
              <td className="num">
                <Link className="btn small secondary" href={`/invoices/${i.id}`}>
                  {i.status === 'PAID' || showClient ? 'View' : 'Pay now'}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
