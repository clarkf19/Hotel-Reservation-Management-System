/**
 * Opens Razorpay's hosted Checkout for an order created by the HRMS server.
 * Card / UPI details are typed into Razorpay's own window — they never reach the HRMS.
 * Resolves with { razorpay_payment_id, razorpay_order_id, razorpay_signature } on success,
 * rejects with { dismissed: true } if the guest closes the window, or { failed: true, reason } on failure.
 */
let loading = null;

function loadScript() {
  if (window.Razorpay) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = resolve;
      s.onerror = () => { loading = null; reject(new Error('Could not load Razorpay Checkout. Check your internet connection.')); };
      document.body.appendChild(s);
    });
  }
  return loading;
}

export async function openRazorpayCheckout({ keyId, orderId, amountPaise, prefill, description, reference }) {
  await loadScript();
  return new Promise((resolve, reject) => {
    let settled = false;
    const rzp = new window.Razorpay({
      key: keyId,
      order_id: orderId,
      amount: amountPaise,
      currency: 'INR',
      name: 'Solstice Bay Hotel',
      description,
      prefill,
      notes: { reference },
      theme: { color: '#0f1629' },
      handler: (response) => { settled = true; resolve(response); },
      modal: { ondismiss: () => { if (!settled) reject({ dismissed: true, reason: 'Payment window closed' }); } },
    });
    rzp.on('payment.failed', (resp) => {
      // Razorpay lets the guest retry inside the same window, so only record it; dismissal ends the attempt.
      window.__hrmsLastRazorpayError = resp?.error?.description;
    });
    rzp.open();
  });
}
