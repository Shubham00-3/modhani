import { CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function CustomerThankYou() {
  return (
    <section className="cp-thankyou">
      <CheckCircle2 className="cp-thankyou-icon" />
      <h1>Thank you for your order!</h1>
      <p>
        Your order has been submitted and the Modhani team will begin processing it shortly.
        You will be notified once it is ready for delivery.
      </p>
      <Link to="/" className="cp-thankyou-btn">Back to Catalogue</Link>
    </section>
  );
}
