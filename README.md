# RepTrack

On-device counter for push-ups, squats, and pull-ups. The camera or an uploaded clip stays in the browser. Pose estimation uses a MediaPipe model shipped with this app.

## Run

```bash
npm install
npm run dev
npm test
npm run build
```

`npm test` checks joint angles, the letterboxed skeleton mapping, rep fixtures, set closing, and the person-outline match. Dependencies are pinned in `package-lock.json`. `npm sbom --sbom-format cyclonedx` prints a software bill of materials from that lockfile.

## How a frame is counted

The video frame goes to the local pose runtime. Joint angles are taken from the 2D image, smoothed, and fed to a small state machine per movement. A rest timer closes a set. History is kept in `localStorage` until you export or clear it.

Auto detect is a heuristic. The movement menu can lock push-ups, squats, or pull-ups.

## What this does not claim

There is no labelled accuracy table. 2D angles move when the camera angle changes, and occlusion or partial range of motion will miscount. “Select person” matches a body outline; it is not face recognition. The counter is not a military or clinical test. See the in-app limitations page for the failure cases.
