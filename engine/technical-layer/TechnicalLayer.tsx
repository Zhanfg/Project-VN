import React, { useEffect, useMemo, useState } from 'react';
import { useStageState } from '@/hooks/useStageState';
import styles from './TechnicalLayer.module.scss';

type TerminalLineKind = 'command' | 'stdout' | 'stderr' | 'warning' | 'comment';

interface BaseStep {
  caption?: string;
}

interface CodeStep extends BaseStep {
  html: string;
}

interface TerminalStep extends BaseStep {
  lines: Array<{ kind: TerminalLineKind; text: string }>;
}

interface AlgorithmStep extends BaseStep {
  items: Array<string | number>;
  active?: number[];
  labels?: Record<string, string>;
}

interface SvgStep extends BaseStep {
  svg: string;
}

interface TechnicalPayload {
  kind: 'code' | 'terminal' | 'algorithm' | 'plot' | 'diagram';
  title?: string;
  steps: Array<CodeStep | TerminalStep | AlgorithmStep | SvgStep>;
}

function safeStepIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

function CodeView({ step }: { step: CodeStep }) {
  return <div className={styles.codeView} dangerouslySetInnerHTML={{ __html: step.html }} />;
}

function TerminalView({ step }: { step: TerminalStep }) {
  return (
    <div className={styles.terminalView}>
      {step.lines.map((line, index) => (
        <div key={index} className={styles['terminal_' + line.kind]}>
          {line.text}
        </div>
      ))}
    </div>
  );
}

function AlgorithmView({ step }: { step: AlgorithmStep }) {
  const active = new Set(step.active ?? []);
  return (
    <div className={styles.algorithmView}>
      <div className={styles.algorithmItems}>
        {step.items.map((item, index) => (
          <div key={index} className={active.has(index) ? styles.algorithmItemActive : styles.algorithmItem}>
            <span className={styles.algorithmIndex}>{index}</span>
            <span>{item}</span>
          </div>
        ))}
      </div>
      {step.labels && (
        <div className={styles.algorithmLabels}>
          {Object.entries(step.labels).map(([key, value]) => (
            <span key={key}>
              <strong>{key}</strong> {value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SvgView({ step }: { step: SvgStep }) {
  return <div className={styles.svgView} dangerouslySetInnerHTML={{ __html: step.svg }} />;
}

export function TechnicalLayer() {
  const stageState = useStageState();
  const tech = stageState.technicalView ?? {
    visible: false,
    kind: 'code',
    src: '',
    title: '',
    placement: 'right',
    step: 0,
  };

  const [payload, setPayload] = useState<TechnicalPayload | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');

    if (!tech.visible || !tech.src) {
      setPayload(null);
      return () => {
        cancelled = true;
      };
    }

    const url = './game/technical/generated/' + tech.src.replace(/^\/+/, '') + '.json';
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then((data: TechnicalPayload) => {
        if (cancelled) return;
        if (!data || !Array.isArray(data.steps) || data.steps.length === 0) {
          throw new Error('invalid technical payload');
        }
        setPayload(data);
      })
      .catch((reason) => {
        if (cancelled) return;
        setPayload(null);
        setError(String(reason));
      });

    return () => {
      cancelled = true;
    };
  }, [tech.visible, tech.src]);

  const step = useMemo(() => {
    if (!payload) return null;
    return payload.steps[safeStepIndex(tech.step ?? 0, payload.steps.length)];
  }, [payload, tech.step]);

  if (!tech.visible) return null;

  const placementClass = styles[tech.placement] ?? styles.right;
  const kind = payload?.kind ?? tech.kind;

  return (
    <section className={styles.layer + ' ' + placementClass} aria-label={payload?.title ?? 'Technical view'}>
      <div className={styles.panel}>
        {(payload?.title || tech.title) && <div className={styles.title}>{payload?.title ?? tech.title}</div>}
        <div className={styles.body}>
          {error && <div className={styles.error}>Technical view failed to load: {error}</div>}
          {!error && !step && <div className={styles.loading}>Loading…</div>}
          {!error && step && kind === 'code' && <CodeView step={step as CodeStep} />}
          {!error && step && kind === 'terminal' && <TerminalView step={step as TerminalStep} />}
          {!error && step && kind === 'algorithm' && <AlgorithmView step={step as AlgorithmStep} />}
          {!error && step && (kind === 'plot' || kind === 'diagram') && <SvgView step={step as SvgStep} />}
        </div>
        {step?.caption && <div className={styles.caption}>{step.caption}</div>}
      </div>
    </section>
  );
}
