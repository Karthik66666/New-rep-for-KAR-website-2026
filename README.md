# KAR International Infotech

KAR International Infotech's responsive, buildless website with a native WebGL sculpture, layered service cards, light/dark themes, optional ambient motion and English/Tamil content. A separate Node backend provides the local CMS and CRM.

## Develop

Requires Node.js 20 or later. Install the cloud runtime dependencies with `npm ci`; the HTML, CSS and browser JavaScript need no build step. Local development keeps using the file-backed CMS and does not connect to cloud storage.

```sh
npm run dev
```

Open http://127.0.0.1:4173 and http://127.0.0.1:4173/admin. Set `PORT` to change the local port. Static assets are in `dist/`; the Vercel API entry and shared backend remain outside that public directory.

```sh
npm run check
npm test
```

## Appearance and languages

Use the floating controls to switch light/dark appearance, turn the ambient backgrounds off, or choose English/Tamil. Choices persist in the visitor's browser. Backgrounds pause outside the viewport and while the page is hidden; the existing motion control and reduced-motion preference also stop them. The background effect lives in `dist/preferences.js` and `dist/appearance.css` and can be removed independently.

The Our works client showcase uses three columns of rounded tiles, centered logos in their original brand colours and a soft orange hover glow. Tile backgrounds follow the theme: warm white and ivory in light mode, charcoal and slate in dark mode. With more than nine published logos, all nine tiles fade to a fresh arrangement about every three seconds while visible. Phones use two columns. The motion pause control and reduced-motion preference show the complete, stationary client grid. Uploaded artwork is displayed without colour filters or blend effects.

`dist/locales/ta.json` contains the Tamil copy for the public website, accessibility labels and form controls. No visitor text is sent to a translation service. The admin workspace and its content editors use English; separate Tamil editing fields are not required. Existing saved Tamil content is preserved for compatibility, while new job and project copy uses the English content when viewing Tamil. Brand names and technical product names keep their spelling.

## Local CMS and CRM

Start `npm run dev`, then open [KAR Studio](http://127.0.0.1:4173/admin). On the first visit, create your super-administrator account with your own email and a password of at least 12 characters. There are no default credentials. The original administrator account is migrated to super administrator without changing its password or discarding existing records.

- **Job postings:** draft, publish, edit, archive and restore roles. Choose remote/hybrid/on-site work and fresher/experienced/any applicants. Add job-specific text, long-answer, select or checkbox questions. No external application URL is needed.
- **Applications:** applicants use an on-site form linked to the published job. Name, degree, email, country code, phone and address are built in. Experienced applicants also provide years of experience, latest company and notice period; these fields are omitted for freshers. The saved application retains its job-question snapshot and answers. HR staff can review it, update its stage and keep private notes.
- **Client logos:** upload PNG, JPEG or WebP images up to 2 MB. Confirm publication permission before making a logo public.
- **Projects:** publish approved titles, summaries, images, client names and project links.
- **CRM contacts:** maintain private names, contact details, company, deal stage, notes and follow-up dates. Website project enquiries create CRM records automatically. Job applications create linked basic contact records while detailed recruitment answers stay in the HR applications view. Private records never appear in the public content API.
- **Employees:** maintain employee profiles, department, job title, employment type, joining date, manager, status and private notes. This module does not implement payroll or attendance.
- **Team access:** super administrators create or disable staff logins, choose roles, and assign CMS, CRM and HR permissions. Admin defaults to CMS/HR access; sales defaults to CRM access; an employee login starts without administrative resource permissions. Explicit assignments can be changed by a super administrator. Team-access management remains restricted to super administrators.
- **Account:** sign out and change your own password. Permissions are enforced by the server on every request. Disabling an account or changing its access revokes its sessions. Password changes also revoke sessions, and server restarts require signing in again.

Content defaults to draft. Published jobs, logos and projects appear on the public website, which refreshes its published content when revisited. **Careers** in the navigation leads to current job openings and their built-in application forms. Archive is reversible through **Show archived**. Unpublishing or archiving a job prevents new applications to it.

**Let’s talk** and **Let’s start your project** open the same enquiry form. Successful submissions save the enquiry to the CRM through the Node API. The phone input includes a separate country-code field. Submission success is shown only after the backend confirms the save; unavailable services and validation failures preserve the visitor's entries.

Both public forms include consent, the requested “I’m not a robot” checkbox, a hidden honeypot, expiring single-use form tokens and submission rate limits. The checkbox is a basic spam confirmation, not a third-party CAPTCHA or proof that a visitor is human. No external CAPTCHA provider or keys are configured. No email notification is sent by these forms.

The backend stores its database and uploaded images in `.kar-data/`, outside `dist/`. This directory is ignored by Git and is not served as static content. Uploaded images are publicly served only while attached to a published, unarchived record; admin previews use an authenticated route. Back up `.kar-data/` separately; deleting it removes the administrator account, content and CRM records. Stop the server before copying it for a consistent backup. `KAR_DATA_DIR` can point to a dedicated persistent directory.

The API uses salted scrypt password hashes, expiring HttpOnly/SameSite sessions, origin checks, session-specific CSRF tokens, resource permissions, login throttling and validated image uploads. See the [OWASP password guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) and [authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) for the referenced controls. This local implementation has automated integration coverage; it has not had an independent security audit.

## Hosting

Vercel configuration now includes the public website and the Node API used by KAR Studio, enquiries and applications. `api/index.mjs` handles `/api/*` and `/media/*`; `/admin` serves the existing static admin page. PostgreSQL stores the private database, sessions, form challenges and rate limits, and a **private Vercel Blob store** holds uploaded images. A workspace transaction serializes each request and commits before its response or session cookie is sent. Uploaded media remains behind the backend's existing publication and staff-permission checks.

The code is prepared; a live deployment still needs the Vercel account/project connection, storage provisioning, environment configuration, migration and deployment verification. No backend deployment is claimed by this repository change.

### Vercel project and environment

Connect `Karthik66666/New-rep-for-KAR-website-2026` and use `main` as the production branch. Leave Root Directory at the repository root (blank or `.`); `kar-international-infotech` is the local checkout folder, not a folder inside this repository. The Other framework preset (`framework: null`), `npm ci`, an empty build command and `dist` output directory retain the buildless website while Vercel discovers the shared `.mjs` function in `api/`. The configuration uses explicit API, media and admin rewrites, with no catch-all page fallback. See Vercel's [Node.js runtime](https://vercel.com/docs/functions/runtimes/node-js) and [rewrite documentation](https://vercel.com/docs/routing/rewrites).

Provision PostgreSQL and a **private** Blob store, then configure these server-side environment variables separately for Production and Preview:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string, using the provider's required TLS settings. |
| `BLOB_READ_WRITE_TOKEN` | Token for the private Blob store. Alternatively use `BLOB_STORE_ID` with Vercel's managed `VERCEL_OIDC_TOKEN`. |
| `KAR_WORKSPACE` | Optional database/media namespace. Defaults to `kar-production` when `VERCEL_ENV=production`, otherwise `kar-preview`. |
| `PUBLIC_ORIGIN` | Exact HTTPS origin of the custom company domain, with no path. Optional for Vercel's generated deployment/branch/production hostnames. |

Production and Preview defaults keep their records separate. All preview branches share `kar-preview` unless a distinct `KAR_WORKSPACE` is assigned. Use separate storage credentials as well when stronger environment isolation is needed. Do not give a preview deployment the production workspace. A request host must match `PUBLIC_ORIGIN` or Vercel's configured deployment, branch or production hostname; form origin checks then use that exact host, so legitimate preview forms work too. The client IP is taken from Vercel's protected forwarding header only on Vercel; other environments use the socket address. See Vercel's [request-header documentation](https://vercel.com/docs/headers/request-headers).

Keep credentials out of Git and browser files. `.vercelignore` allows only the site/runtime/package files and excludes `.kar-data/`, environment files, `.openai/`, tests and local recordings. The existing `.openai/hosting.json` identity is preserved locally. Sites hosting still publishes the static website only; its identity and a Vercel deployment are separate.

### Transfer the existing local account and content

Cloud account setup is always disabled and cookies are Secure. First create the administrator locally if needed. Stop the local server and back up `.kar-data/` before migration; the migration keeps the original account/password hashes, content, records and media. It starts with empty cloud sessions and never deletes the local source.

Run the default dry run first; it validates the local source without uploading or changing cloud data:

```sh
npm run migrate:vercel -- --dry-run --workspace kar-preview
```

Make the storage variables available to the migration process through a secure shell environment. To transfer the approved source into an **empty** preview workspace for the first deployment, explicitly apply it:

```sh
npm run migrate:vercel -- --apply --workspace kar-preview
```

Use `--source <directory>` for another local data directory and `--workspace <namespace>` for a different target. After preview verification, a separate production transfer uses `npm run migrate:vercel -- --apply --workspace kar-production` with the production storage credentials. Apply refuses an initialized target instead of overwriting it. Keep the backup and original `.kar-data/` after migration. Redeploy with the configured storage, then verify the homepage, published media, admin sign-in, content edits and form submissions before announcing the live site. Missing storage configuration returns an unavailable-service response, not an empty replacement database.

Self-hosting remains possible with one Node process, a persistent `KAR_DATA_DIR`, backups and an HTTPS reverse proxy to `127.0.0.1:4173`. Set `NODE_ENV=production` and the exact HTTPS `PUBLIC_ORIGIN`; transfer the local data securely before starting. Local development does not purchase hosting, change domains, deploy or push Git changes.

## Files

- `dist/index.html`: content, navigation, service accordions and enquiry dialog.
- `dist/styles.css`: responsive layouts, CSS 3D cube, process illustrations and motion preferences.
- `dist/responsive.css`: shared fluid sizing, compact navigation, phone and landscape layouts, accessible touch controls and wide-screen content limits. Loaded after the service styles so its sizing rules apply consistently.
- The mobile menu follows the measured header height, contains keyboard focus while open and keeps covered content out of the focus order. Closing it or returning to desktop restores the page controls.
- `dist/app.js`: WebGL torus knot, scroll parallax and navigation controls.
- `dist/reveals.js` and `dist/reveals.css`: repeatable scroll-linked entrances for the introduction, section headings and About text. Scrolling upward reverses their rise; every return downward plays it again. Layout measurements ignore animated transforms and refresh when sections above change size. Keyboard focus, pause and reduced motion keep content fully visible.
- `dist/process.js` and `dist/process.css`: Discover, Create and Evolve cards with a scroll-linked rise, gentle hover lift and animated icons. Each card follows its own position on stacked mobile layouts. Icon loops pause offscreen, in hidden tabs and with the motion controls; reduced motion displays complete, stationary cards.
- `dist/capabilities.js` and `dist/capabilities.css`: Strategy, Design, Development and Growth rise into their original positions one at a time with page scroll. Scrolling back reverses the entrance, so it replays on every downward visit. Orange separator stars rotate and pulse only while the strip is visible. Pause and reduced motion show the words immediately and stop the stars; phone layouts use two rows.
- `dist/forms.js`: on-site project enquiries and job applications, conditional experience fields and job-specific questions.
- `dist/puzzle.js`: gold mirror puzzle in the services panel; layer turns scramble the cube, then reverse to solve it. Animation pauses offscreen, when the tab is hidden, and with the site's motion controls.

  Gold faces also show approximate single-bounce reflections of neighboring gold panels when the puzzle forms concave shapes. Reflections are projected into face-local SVG overlays, clipped to each panel, and refreshed at most about eight times per second alongside the existing animation loop. The solved convex cube keeps its studio highlights without an artificial reflection underneath it.
- `dist/services.js` and `dist/services.css`: four equally sized service frames that rise over the preceding card during native scrolling. The top gap matches the layout spacing below the heading divider and each card keeps its padding and visible title. Extra document space lets the normal page scrollbar move long descriptions inside the stationary frame before the next card rises. A sticky heading navigator keeps every service available through click, touch and keyboard. Very short viewports, motion pause and reduced motion use full natural document flow. The matching gold objects have transparent backgrounds.
- `dist/service-visuals.js` and `dist/service-visuals.css`: gold 3D gears, app phone and growth illustration, matched to the active service and paused when hidden or offscreen.
- `server.mjs`: loopback-only development server.
- `backend.mjs`: authenticated CMS/CRM/HR APIs, staff permissions, public form submissions, private persistent store and public media routes.
- `api/index.mjs`: Vercel request adapter, trusted-host/IP checks and response buffering until storage commits.
- `cloud-store.mjs`: PostgreSQL workspace transactions and private Vercel Blob media storage.
- `scripts/migrate-vercel.mjs`: local validation and explicit migration into an empty cloud workspace.
- `.vercelignore` and `vercel.json`: deployment upload boundaries, API/admin rewrites and security headers.
- `dist/admin/`: KAR Studio login, CMS editors, CRM, recruitment, employee records and staff access.
- `dist/content.js` and `dist/content.css`: published homepage projects, client logos and careers.
- `dist/client-logos.js`: nine-slot client-logo rotation, stopped offscreen, in hidden tabs and by the motion controls.
- `dist/i18n.js` and `dist/locales/ta.json`: local English/Tamil switching.
- `tests/backend.test.mjs`: authentication, publication, private-data boundaries and persistence tests.
- `.openai/hosting.json`: private Sites project identity and static asset directory.

## Motion and accessibility

The sculpture responds to scroll and pointer movement. Background, label and story artwork move at different scroll rates. Rendering is capped at approximately 30 frames per second with a device pixel ratio cap, and stops when the hero is offscreen or the document is hidden. Visitors can pause motion. The site respects the device’s reduced-motion preference. WebGL failure leaves an SVG sculpture fallback; the content and enquiry flow work without WebGL. Fonts have local fallbacks.

All existing rising entrances follow current scroll position and replay on return visits: the introduction, headings, About text, discipline labels, process cards, service stack and background logo. There are no one-time reveal observers. The page remains readable without the reveal module, and hidden tabs do not run its frames.

Service descriptions and benefit lists are present in the initial HTML. Without JavaScript, all four native disclosure panels start open, and the heading links navigate to them. With JavaScript, all cards stay open while scrolling updates the active heading and matching 3D illustration. Heading links and visual controls navigate to each card. Keyboard focus uncovers a card before interacting with its content.

Short landscape viewports use a single horizontally scrollable service-heading row to preserve reading space. The selected heading stays in view. Stacked cards share a fixed frame height for the current viewport; taller screens also expose the complete headings of earlier cards. Long descriptions follow page scroll inside the frame without a separate nested scrollbar. Keyboard navigation reveals the focused action without moving the card title under the divider. Native scrolling continues to update the active service after using a card action.

## Enquiries and recruitment data

The enquiry and recruitment forms submit to this project's Node API and save private records. CMS content is public only after publication. Project enquiries are visible to staff with CRM permission; application details and employee records require HR permission. Access management requires a super-administrator account. These forms do not send email. The company's full public contact number has not been supplied and is not invented.

## Before public launch

Confirm service copy, company contact details and portfolio permissions. Review the Tamil copy before public release. No sample client names, results, testimonials or metrics are published. Set a privacy policy, retention process and authorized staff access before opening the enquiry and recruitment forms to live public traffic.

## Validation

`npm run check` covers all browser and server JavaScript. `npm test` covers authentication, CSRF checks, publication permissions, private CRM boundaries, archive/restore, image validation, persistence, session revocation, CMS refresh recovery, service-card geometry, mobile-menu focus and process motion. Additional DOM checks exercise public forms against an isolated local backend, admin publication and role access, and concurrent upload handling. Local HTTP checks verify asset delivery. Browser visual verification was stopped because the Computer Use tool could not verify the current browser URL; visual layout, WebGL appearance and physical touch interactions still need a live browser check.

## Repository

The GitHub repository for this website is [Karthik66666/New-rep-for-KAR-website-2026](https://github.com/Karthik66666/New-rep-for-KAR-website-2026).

The existing Sites project identity is retained in `.openai/hosting.json`. Reuse that identity when publishing rather than creating a second Site.
