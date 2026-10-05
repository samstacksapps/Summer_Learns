import type { CSSProperties, ReactNode, Ref } from 'react';
import { ArrowUpRight } from 'lucide-react';

export function PageTitle({ first, second, headingRef, children }: { first: string; second: string; headingRef?: Ref<HTMLHeadingElement>; children?: ReactNode }) {
  return <div className="page-intro"><h1 ref={headingRef} tabIndex={-1}><span className="title-line">{first}</span><span className="title-italic">{second}</span></h1>{children}</div>;
}

export function ArrowCircle() {
  return <span className="arrow-circle" aria-hidden="true"><ArrowUpRight size={24} strokeWidth={1.8} /></span>;
}

export function Illustration({ name, className = '', alt = '', width = 320, height = 240 }: { name: string; className?: string; alt?: string; width?: number; height?: number }) {
  return <img src={`/illustrations/${name}.png`} className={className} alt={alt} width={width} height={height} />;
}

export function ProgressRing({ value, total, label }: { value: number; total: number; label: string }) {
  const fraction = Math.min(1, Math.max(0, total ? value / total : 0));
  return <div className="progress-ring" role="img" aria-label={`${label}: ${value} of ${total}`} style={{ '--progress': fraction } as CSSProperties}>
    <svg viewBox="0 0 80 80" aria-hidden="true"><circle className="ring-track" cx="40" cy="40" r="34" /><circle className="ring-fill" cx="40" cy="40" r="34" pathLength="100" strokeDasharray={`${fraction * 100} 100`} /></svg>
    <span>{value}/{total}</span>
  </div>;
}

export function ProgressTrack({ value, total, label, className = '' }: { value: number; total: number; label: string; className?: string }) {
  const percent = Math.min(100, Math.max(0, total ? value / total * 100 : 0));
  return <div className={`progress-track ${className}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={value} aria-valuetext={`${value} of ${total}`}><span style={{ width: `${percent}%` }} /></div>;
}
