export default function Footer() {
  return (
    <footer className="app-footer">
      <div className="app-footer-watermark" aria-hidden="true">QUICKRIDE</div>
      <p>© {new Date().getFullYear()} QuickRide — Ride booking, made simple.</p>
    </footer>
  );
}