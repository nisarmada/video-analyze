# RepTrack

On-device counter for push-ups, squats, and pull-ups. The camera or an uploaded clip stays in the browser. Pose estimation uses a MediaPipe model shipped with this app.

## Run

```bash
npm install
npm run dev
npm test
npm run build
```

`npm test` checks joint angles in the image and in 3D, the letterboxed skeleton mapping, rep fixtures, set closing, and the person-outline match. Dependencies are pinned in `package-lock.json`. `npm sbom --sbom-format cyclonedx` prints a software bill of materials from that lockfile.

## How a frame is counted

The video frame goes to the local pose runtime. Elbow, knee, and torso angles come from the 3D world pose (meters, hip-centered). How wide the body looks in the frame still comes from the image, because that is what distinguishes a side view from a front view. Those signals are smoothed and fed to a small state machine per movement. A rest timer closes a set. The 3D pose is drawn under the video. History is kept in `localStorage` until you export or clear it.

Auto detect is a heuristic. The movement menu can lock push-ups, squats, or pull-ups.

## What this does not claim

There is no labelled accuracy table. 3D angles are steadier when the camera is not side-on, and a hidden joint or a partial rep will still miscount. “Select person” matches a body outline; it is not face recognition. The counter is not a military or clinical test. See the in-app limitations page for the failure cases.
