/* eslint-disable @next/next/no-img-element -- ImageResponse renders this
   through satori, not the DOM, so next/image does not apply. */
import { ImageResponse } from "next/og";
import { markDataUri } from "../../logoMark";

const SIZES = [192, 512];

export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.includes(size)) return new Response("Not found", { status: 404 });
  return new ImageResponse(
    <img src={markDataUri()} width={size} height={size} alt="" style={{ width: "100%", height: "100%" }} />,
    { width: size, height: size },
  );
}
