export const LIVE_CAMERA_CHANNEL = "live-agent-camera";
export const LIVE_CAMERA_FRAME_KEY = "live_agent_camera_frame";

export type LiveCameraPayload =
  | {
      type: "camera-frame";
      imageUrl: string;
      updatedAt: number;
    }
  | {
      type: "camera-stop";
      updatedAt: number;
    };

export function readLiveCameraFrame(maxAgeMs = 3500): string {
  const rawPayload = localStorage.getItem(LIVE_CAMERA_FRAME_KEY);
  if (!rawPayload) {
    return "";
  }

  try {
    const payload = JSON.parse(rawPayload) as LiveCameraPayload;
    if (payload.type !== "camera-frame" || Date.now() - payload.updatedAt > maxAgeMs) {
      return "";
    }
    return payload.imageUrl;
  } catch {
    return "";
  }
}
