# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Mac owners who have Windows games, or want to, and no Windows PC to play them on. Two groups weigh equally:

- Everyday players who are not technical. They own games on Steam, Epic Games or GOG, or have a Windows game from somewhere else, and want them to run on their Mac without learning Wine, Terminal or what DirectX is.
- Technical players who already know CrossOver, Whisky or Highball and compare tools. They look for what runs, how (Wine build, DXMT, DXVK), and what it costs.

The home page serves the everyday player first; store pages carry the detail the technical player looks for.

## Product Purpose

Game Bridger is a paid macOS app that runs Windows games through Wine. One app holds four libraries, each on its own page: Steam (the official Windows Steam client), Epic Games (through Legendary), GOG (through gogdl) and Other games (any .exe or installer). The site's job is to make a visitor understand that in seconds, find their store, and start the free trial.

## Positioning

One Mac app for every Windows game library, set up with one Install button, with no Windows licence, virtual machine or Terminal. Paid ($6 a month or $50 a year, 10 days free) against a free open-source rival (Highball); the case for paying is that it does the setup and upkeep for you, covers every store under one subscription, and keeps working after store updates.

## Operating Context

Visitors arrive from search ("play Steam games on Mac", "Epic games on Mac"), from invite links (`/?invite=CODE`) and from links inside the app (`/#deals`). They decide on a Mac or read on a phone and come back on the Mac. The download is a signed, notarized DMG from GitHub releases; purchases go through Polar.

## Capabilities and Constraints

- Runs DirectX 9, 10 and 11 games (DXMT to Metal on macOS 15+, DXVK otherwise). No DirectX 12 (D3DMetal is not used).
- Games whose anti-cheat blocks Wine on Mac (for example Fortnite, Apex Legends, Rainbow Six Siege) do not run; the app marks known ones.
- macOS 13 or later, Apple Silicon and Intel. One subscription works on 2 Macs.
- Epic sign-in happens on Epic's own page in an app window; GOG sign-in on GOG's page in the browser. Tokens stay on the Mac.
- Hosted as a static site on Vercel with `cleanUrls`; `/api/*` serverless functions supply founders seats, deals, ratings, invites and licences.
- The site must not imitate Valve, Epic Games or GOG branding (no store logos, no copied layouts); store names are used descriptively, with "not affiliated" notices.

## Brand Commitments

- Name: Game Bridger.
- The gamepad mark (`site/mark.svg`, same shapes as the app icon) stays.
- The pink-to-violet gradient of the app icon and download button (#f876da to #9358e8) stays as the brand color.
- English site copy; the app itself also ships Arabic.

## Evidence on Hand

- Real player ratings from the app via `/api/works` (shown only when votes exist).
- Founders offer with live seat counts via `/api/founders`.
- Footage: `site/media/` (game trailer clips and Pexels clips), Steam CDN cover art for Steam games.
- An app screenshot (`site/media/app-home.jpg`) that predates the store pages; a current screenshot of the store pages is not available yet.
- No testimonials, press, user counts or benchmarks exist. Do not invent them.

## Product Principles

1. Say what it is and what happens next in plain words before anything else.
2. Be honest about what won't run; the free trial is the proof.
3. One app, one price, every store.
4. Each store's page speaks to that store's owners in their own terms, without borrowing the store's brand.
