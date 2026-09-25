import { Link } from "react-router-dom";

export function PrivacyPage() {
  return (
    <main id="main-content" className="policy-page">
      <article className="card policy-card">
        <p><Link to="/">← Return to Talon</Link></p>
        <h1>Privacy Notice</h1>
        <p><strong>Last updated:</strong> September 24, 2026</p>

        <p>
          This notice explains how Talon collects, uses, stores, and shares information. Talon is a
          Tennessee Tech payroll and web-clock prototype. It is not approved for production payroll
          or personnel records unless Tennessee Tech completes its institutional security, privacy,
          records-retention, and vendor reviews.
        </p>

        <h2>Information Talon collects</h2>
        <ul>
          <li><strong>Account information:</strong> Tennessee Tech email address, name, role, department, supervisor, employment status, and pay type.</li>
          <li><strong>Payroll information:</strong> hourly rate or annual salary, time entries, correction requests and reasons, approval decisions and reasons, pay periods, calculated hours, gross pay, and report history.</li>
          <li><strong>Optional profile photo:</strong> the uploaded image and the zoom and position selected for the dashboard preview.</li>
          <li><strong>Security and activity information:</strong> login and account activity, audit events, session-token records, timestamps, and the IP address supplied by Cloudflare for audited actions.</li>
          <li><strong>Technical information:</strong> Cloudflare may process request, device, browser, security, performance, and diagnostic information when it delivers the site.</li>
        </ul>
        <p>
          Talon does not ask for Social Security numbers, bank-account details, tax forms, medical or
          disability information, or biometric identifiers. Do not enter those items in free-text fields.
        </p>

        <h2>How information is used</h2>
        <p>
          Information is used to authenticate users, enforce role-based access, record and approve work
          time, calculate and review payroll, create reports, display notifications, investigate errors or
          misuse, and maintain an audit trail. Talon does not use personal information for advertising,
          sell it, or use it for automated decisions or profiling.
        </p>

        <h2>Authority for processing</h2>
        <p>
          Payroll and employment records are processed to carry out authorized university functions,
          meet employment and legal obligations, and administer the user relationship. Optional profile
          photos are processed at the user's choice and can be removed at any time. If another law requires
          consent for a particular use, Talon must obtain that consent before the use begins.
        </p>

        <h2>Who can access information</h2>
        <p>
          Students can access their own records. Supervisors can access records for assigned employees.
          Administrators can manage users, departments, approvals, and payroll. Authorized Tennessee Tech
          personnel may receive information when their work requires it. Cloudflare processes information
          as the hosting, database, security, and delivery provider. Information may also be disclosed when
          required by law, legal process, audit, or a valid institutional investigation.
        </p>
        <p>
          As a public institution, Tennessee Tech may also have to disclose records under the Tennessee
          Public Records Act. Privacy, FERPA, personnel-record, security, and other lawful exceptions still apply.
        </p>

        <h2>Where information is processed</h2>
        <p>
          Talon's application and database run on Cloudflare. The current database is assigned to Cloudflare's
          Eastern North America region, while Cloudflare's delivery and security network may process request
          information in other locations. Any production use must follow Tennessee Tech's approved vendor and
          international-transfer requirements.
        </p>

        <h2>Cookies and session storage</h2>
        <p>
          Talon uses one strictly necessary, secure, HTTP-only session cookie to keep a user signed in.
          The cookie is restricted to authentication requests and expires after seven days. A short-lived
          access token is kept in browser memory and is not placed in local storage. Talon does not include
          advertising cookies or third-party analytics tags.
        </p>

        <h2>Security</h2>
        <p>
          Passwords are stored as salted scrypt hashes rather than readable passwords. Refresh tokens are
          stored as hashes and rotated. Talon also uses encrypted HTTPS connections, short-lived access
          tokens, role-based authorization, input validation, security headers, audit logs, and a database
          that is not exposed through a public network port. No system can guarantee absolute security.
        </p>

        <h2>Retention and deletion</h2>
        <p>
          Session records expire or are revoked. Account, time, payroll, report, photo, notification, and
          audit records remain until an authorized administrator removes them or Tennessee Tech's approved
          records schedule requires disposition. Before production use, the responsible Tennessee Tech
          office must assign a written retention period to every record category and document secure
          deletion and legal-hold procedures.
        </p>

        <h2>Security incidents</h2>
        <p>
          Suspected unauthorized access, loss, or disclosure should be reported immediately through Tennessee
          Tech's approved information-security and incident-response channels. Tennessee Tech will determine
          containment, investigation, documentation, and any notices required by law or policy.
        </p>

        <h2>Your choices and rights</h2>
        <p>
          You may ask the Talon administrator or your supervisor to review or correct your account, time,
          or payroll information. You may replace or remove an optional profile photo from the profile-photo
          viewer. Depending on the record and your relationship with Tennessee Tech, federal or state law
          may provide additional access, correction, restriction, objection, deletion, portability, or
          complaint rights. Some student records may be protected by FERPA.
        </p>
        <p>
          FERPA questions may be directed to the <a href="https://www.tntech.edu/records/ferpa.php">Tennessee Tech Registrar</a>.
          Privacy and GDPR questions may be sent to <a href="mailto:compliance@tntech.edu">compliance@tntech.edu</a>.
        </p>

        <h2>Children</h2>
        <p>Talon is intended for authorized Tennessee Tech students and employees and is not directed to children under 13.</p>

        <h2>Changes to this notice</h2>
        <p>
          This notice will be updated when Talon's data practices change. Material changes should be
          reviewed by the responsible Tennessee Tech privacy, records, security, and legal officials before
          production use. The date at the top shows the latest revision.
        </p>

        <h2>Related notices</h2>
        <ul>
          <li><a href="https://www.tntech.edu/privacy/">Tennessee Tech Privacy Policy</a></li>
          <li><a href="https://www.cloudflare.com/privacypolicy/">Cloudflare Privacy Policy</a></li>
          <li><Link to="/accessibility">Talon Accessibility Statement</Link></li>
        </ul>
      </article>
    </main>
  );
}
