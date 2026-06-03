export interface ColorStop { r: number; g: number; b: number; }
export interface GradientKeyframe { hour: number; colors: [ColorStop, ColorStop, ColorStop]; }

export const gradientKeyframes: GradientKeyframe[] = [
  { hour: 2,    colors: [{ r: 5,   g: 7,   b: 10  }, { r: 12,  g: 21,  b: 36  }, { r: 7,   g: 26,  b: 29  }] },
  { hour: 5,    colors: [{ r: 42,  g: 43,  b: 77  }, { r: 142, g: 111, b: 158 }, { r: 255, g: 202, b: 140 }] },
  { hour: 7.5,  colors: [{ r: 255, g: 211, b: 182 }, { r: 214, g: 228, b: 255 }, { r: 168, g: 230, b: 207 }] },
  { hour: 12,   colors: [{ r: 58,  g: 155, b: 213 }, { r: 116, g: 192, b: 232 }, { r: 155, g: 246, b: 255 }] },
  { hour: 15.5, colors: [{ r: 93,  g: 162, b: 213 }, { r: 161, g: 195, b: 209 }, { r: 249, g: 241, b: 240 }] },
  { hour: 18,   colors: [{ r: 74,  g: 53,  b: 79  }, { r: 255, g: 126, b: 103 }, { r: 255, g: 191, b: 105 }] },
  { hour: 19.5, colors: [{ r: 27,  g: 25,  b: 71  }, { r: 92,  g: 42,  b: 117 }, { r: 179, g: 92,  b: 117 }] },
  { hour: 22,   colors: [{ r: 11,  g: 14,  b: 20  }, { r: 19,  g: 34,  b: 55  }, { r: 13,  g: 39,  b: 41  }] },
];

export function getJSTHour(): number {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const jst = new Date(utc + 3600000 * 9);
  return jst.getHours() + jst.getMinutes() / 60 + jst.getSeconds() / 3600;
}

export function interpolateBackground(hour: number): string {
  const sorted = [...gradientKeyframes].sort((a, b) => a.hour - b.hour);
  let startKf = sorted[sorted.length - 1];
  let endKf = sorted[0];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (hour >= sorted[i].hour && hour < sorted[i + 1].hour) {
      startKf = sorted[i];
      endKf = sorted[i + 1];
      break;
    }
  }
  let t = 0;
  if (startKf.hour <= endKf.hour) {
    t = (hour - startKf.hour) / (endKf.hour - startKf.hour);
  } else {
    const totalDist = (24 - startKf.hour) + endKf.hour;
    const currentDist = hour >= startKf.hour ? (hour - startKf.hour) : (24 - startKf.hour + hour);
    t = currentDist / totalDist;
  }
  const stops = startKf.colors.map((sc, i) => {
    const ec = endKf.colors[i];
    const r = Math.round(sc.r + (ec.r - sc.r) * t);
    const g = Math.round(sc.g + (ec.g - sc.g) * t);
    const b = Math.round(sc.b + (ec.b - sc.b) * t);
    return `rgb(${r}, ${g}, ${b})`;
  });
  return `linear-gradient(180deg, ${stops[0]} 0%, ${stops[1]} 50%, ${stops[2]} 100%)`;
}
