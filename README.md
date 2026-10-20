# KAR International Infotech

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
