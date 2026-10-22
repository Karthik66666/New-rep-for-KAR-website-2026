# KAR International Infotech

A responsive, single-page website for KAR International Infotech. It uses native HTML, CSS, browser JavaScript and WebGL, with no application framework or runtime package dependencies. The Node.js development server serves the generated static site locally; Vercel publishes the same `dist/` output.

## Requirements

- Node.js 20.12 or later
- npm

## Setup

```sh
npm install
```

Copy `.env.example` to `.env` to configure local environment variables. The current optional setting is `PORT` (defaults to `4173`). Keep secrets out of source control; `.env` is ignored.

## Run and validate
npm run dev
npm run build
npm run check
npm run lint
npm test
```

Open http://127.0.0.1:4173 after starting the development server. `npm run dev` builds the current sources before serving. `npm run build` can also be run on its own. `npm start` serves the existing `dist/` output without rebuilding it.

## Architecture

```text
src/
  index.html             Single-page content and semantic page sections
  assets/                Logos and static image assets
  scripts/               Browser behavior, split by interaction/domain
  styles/                Global and feature-specific stylesheets
scripts/
  build.mjs              Dependency-free source-to-dist build
tests/
  build.test.mjs         Static output smoke test
dist/                    Generated deployable site; do not edit by hand
server.mjs               Loopback-only static development server
eslint.config.js         Browser and Node.js lint configuration
```

The existing homepage remains a single semantic HTML page. Its independently loaded browser scripts own the sculpture, puzzle, service visuals and service navigation behavior. Styles are grouped by site-wide and service features. `src/` is authoritative; the build copies it to `dist/` without a bundler, preserving the existing static-hosting contract.

There is currently no backend, API, database, client-side router, shared application state layer or TypeScript. The site creates enquiry briefs locally in the visitor's browser and does not submit them. Those architectural layers should be introduced only alongside a feature that needs them.

## Design decisions

- Keep the existing framework-free technology stack and avoid runtime dependencies.
- Use Node.js built-ins for the static build, local server and smoke test.
- Keep deployable output in `dist/` for the current Vercel configuration.
- Restrict the development server to loopback, serve only `GET` and `HEAD`, validate the port, and return basic browser security headers.
- Use ESLint for JavaScript linting and EditorConfig for consistent text-file conventions. Type checking is not applicable to the current plain JavaScript application.
- Do not add placeholder APIs, business logic, pages or unused abstractions.

## Existing experience

The site includes the hero, services, approach, about and project-enquiry sections, a WebGL sculpture with a non-WebGL fallback, motion controls, reduced-motion support and browser-local enquiry brief generation. The form does not send email or collect leads remotely.

## Deployment

The initial 3D parallax homepage for KAR International Infotech. Warm white, charcoal and lime; native WebGL sculpture; responsive sections for services, approach, about and project enquiries.

## Develop

Requires Node.js 20 or later. No dependency installation or build is needed.

```sh
npm run dev
```

Open http://127.0.0.1:4173. Set `PORT` to change the local port. All deployable assets are in `dist/`.

```sh
npm run check
```

## Vercel hosting

Connect `Karthik66666/New-rep-for-KAR-website-2026` and use `main` as the production branch. Leave Root Directory at the repository root (blank or `.`); `kar-international-infotech` is the local checkout folder, not a folder inside this repository.

The root `vercel.json` selects the Other framework preset, skips install and build commands, and publishes `dist/` directly. This site needs no build step. After changing settings, redeploy the latest commit from Vercel's Deployments tab. If pushes do not create deployments, check that the Vercel GitHub app has access to this repository and the project is connected to this repository and branch.

## Files

- `dist/index.html`: content, navigation, service accordions and enquiry dialog.
- `dist/styles.css`: responsive layouts, CSS 3D cube, process illustrations and motion preferences.
- `dist/app.js`: WebGL torus knot, scroll parallax, progressive reveals and browser-local enquiry brief.
- `dist/puzzle.js`: gold mirror puzzle in the services panel; layer turns scramble the cube, then reverse to solve it. Animation pauses offscreen, when the tab is hidden, and with the site's motion controls.

  Gold faces also show approximate single-bounce reflections of neighboring gold panels when the puzzle forms concave shapes. Reflections are projected into face-local SVG overlays, clipped to each panel, and refreshed at most about eight times per second alongside the existing animation loop. The solved convex cube keeps its studio highlights without an artificial reflection underneath it.
- `dist/services.js` and `dist/services.css`: scroll-driven service chapters, native disclosure headings and previous/next controls. A sticky presentation is used when the descriptions fit the viewport; smaller screens use a stable-height reading sequence. Short landscape screens keep the illustration in normal flow so it cannot cover the text.
- `dist/service-visuals.js` and `dist/service-visuals.css`: gold 3D gears, app phone and growth illustration, matched to the active service and paused when hidden or offscreen.
- `server.mjs`: loopback-only development server.
- `.openai/hosting.json`: private Sites project identity and static asset directory.

## Motion and accessibility

The sculpture responds to scroll and pointer movement. Background, label and story artwork move at different scroll rates. Rendering is capped at approximately 30 frames per second with a device pixel ratio cap, and stops when the hero is offscreen or the document is hidden. Visitors can pause motion. The site respects the device’s reduced-motion preference. WebGL failure leaves an SVG sculpture fallback; the content and enquiry flow work without WebGL. Fonts have local fallbacks.

Service descriptions and benefit lists are present in the initial HTML. Without JavaScript, all four native disclosure panels start open. With JavaScript, scrolling selects one service and its matching 3D illustration; headings and visual controls also support direct navigation. Focus inside a service description prevents automatic closing while a keyboard user is interacting with it.

## Enquiry status

The enquiry form creates a brief on the visitor’s device. Copy and text download are available. It does not send email, collect leads remotely or claim submission. Connect the company’s verified email/phone and a submission endpoint before making it the public enquiry channel. No full contact number was supplied for this initial version.

## Before public launch

Confirm the visual direction and replace the temporary K monogram with the approved KAR logo. Confirm service copy, company contact details and any portfolio permissions. The initial version contains no invented client results, testimonials or metrics. A privacy policy is needed if remote enquiry collection or analytics are added.

## Validation

JavaScript syntax and static document links/assets can be checked locally. Browser QA was blocked in the initial environment by local socket restrictions and an unavailable in-app browser session. Desktop/mobile layout, WebGL appearance, keyboard behavior and form interactions still need a browser check.

## Repository

The GitHub repository for this website is [Karthik66666/New-rep-for-KAR-website-2026](https://github.com/Karthik66666/New-rep-for-KAR-website-2026).

The existing Sites project identity is retained in `.openai/hosting.json`. Reuse that identity when publishing rather than creating a second Site.
