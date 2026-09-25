import { Link } from "react-router-dom";

export function AccessibilityPage() {
  return (
    <main id="main-content" className="policy-page">
      <article className="card policy-card">
        <p><Link to="/">← Return to Talon</Link></p>
        <h1>Accessibility Statement</h1>
        <p><strong>Last updated:</strong> September 24, 2026</p>

        <p>
          Talon is designed to meet the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA.
          Accessibility is an ongoing responsibility, so the team tests new features and corrects barriers
          as the application changes.
        </p>

        <h2>Accessibility features</h2>
        <ul>
          <li>Keyboard access, a skip link, visible focus indicators, and logical focus order.</li>
          <li>Semantic headings, landmarks, forms, tables, buttons, dialogs, and status messages.</li>
          <li>Accessible names and instructions for interactive controls.</li>
          <li>Text and controls designed for sufficient color contrast and browser zoom.</li>
          <li>Layouts that adapt to smaller screens and tables that can be scrolled without widening the page.</li>
          <li>Reduced animation when the device requests reduced motion.</li>
        </ul>

        <h2>Get help or report a barrier</h2>
        <p>
          If you cannot use part of Talon, tell your supervisor or Talon administrator what page and task
          caused the problem and what browser or assistive technology you were using. For disability-related
          accommodations, contact the Tennessee Tech Accessible Education Center at
          <a href="mailto:disability@tntech.edu"> disability@tntech.edu</a> or
          <a href="tel:+19313726119"> 931-372-6119</a>.
        </p>
        <p>
          Visit the <a href="https://www.tntech.edu/disability/">Accessible Education Center website</a> for
          office hours, accommodation information, and additional ways to connect.
        </p>

        <h2>Compatibility</h2>
        <p>
          Talon is built with standard HTML, CSS, and JavaScript and is intended to work with current
          versions of major browsers, screen readers, screen magnifiers, speech-input software, and keyboard-only navigation.
        </p>
      </article>
    </main>
  );
}
