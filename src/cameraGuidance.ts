import type { Landmark } from "./landmarks";
import { Pose, lm } from "./landmarks";

export function cameraGuidance(landmarks: Landmark[] | undefined): string {
  if (!landmarks?.length) return "No person detected — step into frame";

  const ls = lm(landmarks, Pose.L_SHOULDER, 0.2);
  const rs = lm(landmarks, Pose.R_SHOULDER, 0.2);
  const la = lm(landmarks, Pose.L_ANKLE, 0.2);
  const ra = lm(landmarks, Pose.R_ANKLE, 0.2);

  if (!ls || !rs) return "Upper body not visible — move camera back";

  const xs = [ls.x, rs.x];
  const ys = [ls.y, rs.y];
  if (la) {
    xs.push(la.x);
    ys.push(la.y);
  }
  if (ra) {
    xs.push(ra.x);
    ys.push(ra.y);
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  if (minX < 0.05) return "Move right — body clipped on left";
  if (maxX > 0.95) return "Move left — body clipped on right";
  if (maxY > 0.95) return "Step back — feet out of frame";
  if (maxX - minX < 0.15) return "Move closer — person too small";

  return "Good framing";
}
