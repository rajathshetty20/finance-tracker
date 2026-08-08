import { ImageResponse } from "next/og";
import { markDataUri } from "./logoMark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Home-screen icon, full-bleed since iOS applies its own corner mask.
export default function AppleIcon() {
  return new ImageResponse(
    <img src={markDataUri()} width={size.width} height={size.height} alt="" style={{ width: "100%", height: "100%" }} />,
    { ...size },
  );
}
