import { useEffect, useRef } from "react";

interface Props {
  data: number[];
  height?: number;
  color?: string;
}

export default function Sparkline({
  data,
  height = 56,
  color = "#4f9dff",
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = canvas.clientWidth || 1;
    const ch = height;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    if (data.length < 2) return;

    const max = Math.max(1, ...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const dx = cw / (data.length - 1);
    const pad = 3;
    const usable = ch - pad * 2;
    const yOf = (val: number) => pad + usable * (1 - (val - min) / range);

    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = i * dx;
      const y = yOf(data[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.stroke();

    // Soft fill under the line.
    ctx.lineTo((data.length - 1) * dx, ch);
    ctx.lineTo(0, ch);
    ctx.closePath();
    ctx.fillStyle = color + "22";
    ctx.fill();
  }, [data, height, color]);

  return <canvas ref={ref} className="sparkline" style={{ height }} />;
}
