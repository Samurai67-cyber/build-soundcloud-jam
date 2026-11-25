# SoundCloud Jam

An independent working prototype of shared listening in the SoundCloud web player. Start a track, click **Start Jam**, and open the invite in another browser or private window. Choose **Join & Listen** there. Guests can queue tracks and react. The host controls transport.

## Run and deploy

Use Node.js 22 or later. Run `npm ci`, then `npm start`. The single Node process serves HTTP and WebSockets on port 3000 or the platform-provided PORT. The health endpoint is /health. A Render Blueprint is included. Connect the repository containing these changes in Render and select **New → Blueprint**. Use one service instance. Rooms live in memory, expire ten minutes after the last listener leaves, and reset on restart. A reconnecting host recovers control using a tab-scoped key.

The four bundled electronic sketches, cover art and waveforms were generated for this prototype. A public SoundCloud artist/track URL uses the official Widget API in an iframe and depends on track embeddability and external network access. Custom tracks use a placeholder cover and waveform. The demo and brief are served at /demo.mp4 and /brief.pdf.

## Verification

With the server running, run `python tests/browser_smoke.py` using Python Playwright and system Chromium. Set CHROMIUM or JAM_TEST_URL to override the browser path or origin. The suite uses one desktop host and five fresh mobile-size guest contexts. It samples media-element times after five mid-playback joins and five host seeks, and checks queue additions, waveform reactions, host transport, guest reconnect and host disconnect.

Local testing uses one machine and bundled MP3s. Repeat the ten trials against the deployed URL on separate devices and networks, including Safari on iOS and a playable public SoundCloud URL. Confirm the widget is ready, sound starts after the guest taps Join, seek error settles within 1.5 s in five seconds, and both clients switch at track end.

## Pilot

Run three pairs independently through invite, join, queue and react, without coaching. Record time from opening the invite to audible playback, which steps needed help, and any failed join. Fix the most common observed blocker and repeat that task with a fresh pair. No human usability results are claimed.

## Pitch

Serve public/demo.mp4 and public/brief.pdf from the same public origin as the app. Verify all three links signed out before personalizing pitch/outreach.md.
