export default function StatusBadge({ status }: { status: 'PAID' | 'UNPAID' | 'OVERDUE' }) {
  const label = status === 'PAID' ? 'Paid' : status === 'OVERDUE' ? 'Overdue' : 'Unpaid';
  return <span className={`badge ${status}`}>{label}</span>;
}
