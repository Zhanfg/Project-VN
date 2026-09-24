import React, { useEffect, useMemo, useState } from 'react';
import { useStageState } from '@/hooks/useStageState';
import styles from './TechnicalLayer.module.scss';
import { gamePath } from '@/Core/util/gameAssetsAccess/resourceBase';

type TechnicalKind =
  | 'code'
  | 'terminal'
  | 'algorithm'
  | 'plot'
  | 'diagram'
  | 'circuit'
  | 'instrument'
  | 'protocol';

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

interface InstrumentChannel {
  name: string;
  samples: number[];
  unit?: string;
}

interface InstrumentStep extends BaseStep {
  instrument: 'multimeter' | 'oscilloscope' | 'logic-analyzer';
  mode?: string;
  reading?: string | number;
  unit?: string;
  positiveProbe?: string;
  negativeProbe?: string;
  timebase?: string;
  channels?: InstrumentChannel[];
}

interface ProtocolMessage {
  from: string;
  to: string;
  label: string;
  detail?: string;
  active?: boolean;
}

interface ProtocolField {
  name: string;
  value: string;
}

interface ProtocolStep extends BaseStep {
  participants: string[];
  messages: ProtocolMessage[];
  fields?: ProtocolField[];
}

interface TechnicalPayload {
  kind: TechnicalKind;
  title?: string;
  steps: Array<CodeStep | TerminalStep | AlgorithmStep | SvgStep | InstrumentStep | ProtocolStep>;
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

function makePolyline(samples: number[], width: number, height: number, digital = false): string {
  if (samples.length === 0) return '';
  const min = digital ? 0 : Math.min(...samples);
  const max = digital ? 1 : Math.max(...samples);
  const range = max - min || 1;
  const x = (index: number) => (index / Math.max(1, samples.length - 1)) * width;
  const y = (value: number) => height - ((value - min) / range) * height;

  if (!digital) {
    return samples
      .map((value, index) => x(index).toFixed(2) + ',' + y(value).toFixed(2))
      .join(' ');
  }

  const points: string[] = [];
  samples.forEach((value, index) => {
    const px = x(index);
    const py = y(value > 0 ? 1 : 0);
    if (index > 0) {
      points.push(px.toFixed(2) + ',' + y(samples[index - 1] > 0 ? 1 : 0).toFixed(2));
    }
    points.push(px.toFixed(2) + ',' + py.toFixed(2));
  });
  return points.join(' ');
}

function MultimeterView({ step }: { step: InstrumentStep }) {
  return (
    <div className={styles.multimeter}>
      <div className={styles.instrumentMode}>{step.mode ?? 'DC'}</div>
      <div className={styles.meterReading}>
        <span>{step.reading ?? '—'}</span>
        <small>{step.unit ?? ''}</small>
      </div>
      <div className={styles.probes}>
        <span>＋ {step.positiveProbe ?? 'COM'}</span>
        <span>－ {step.negativeProbe ?? 'COM'}</span>
      </div>
    </div>
  );
}

function OscilloscopeView({ step }: { step: InstrumentStep }) {
  const channels = step.channels ?? [];
  return (
    <div className={styles.scopeView}>
      <div className={styles.scopeMeta}>{step.timebase ?? ''}</div>
      <svg viewBox="0 0 760 360" className={styles.scopeSvg} role="img" aria-label="oscilloscope">
        <g className={styles.scopeGrid}>
          {Array.from({ length: 11 }).map((_, index) => (
            <line key={'v' + index} x1={index * 76} y1="0" x2={index * 76} y2="360" />
          ))}
          {Array.from({ length: 9 }).map((_, index) => (
            <line key={'h' + index} x1="0" y1={index * 45} x2="760" y2={index * 45} />
          ))}
        </g>
        {channels.map((channel, index) => (
          <polyline
            key={channel.name}
            className={styles.scopeTrace}
            points={makePolyline(channel.samples, 740, 260)}
            transform={'translate(10 ' + (45 + index * 22) + ')'}
          />
        ))}
      </svg>
      <div className={styles.channelLegend}>
        {channels.map((channel) => (
          <span key={channel.name}>
            <strong>{channel.name}</strong>
            {channel.unit ? ' / ' + channel.unit : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

function LogicAnalyzerView({ step }: { step: InstrumentStep }) {
  const channels = step.channels ?? [];
  return (
    <div className={styles.logicView}>
      {channels.map((channel) => (
        <div key={channel.name} className={styles.logicRow}>
          <span className={styles.logicName}>{channel.name}</span>
          <svg viewBox="0 0 680 64" preserveAspectRatio="none" aria-label={channel.name}>
            <polyline className={styles.logicTrace} points={makePolyline(channel.samples, 680, 46, true)} />
          </svg>
        </div>
      ))}
      {step.timebase && <div className={styles.scopeMeta}>{step.timebase}</div>}
    </div>
  );
}

function InstrumentView({ step }: { step: InstrumentStep }) {
  if (step.instrument === 'oscilloscope') return <OscilloscopeView step={step} />;
  if (step.instrument === 'logic-analyzer') return <LogicAnalyzerView step={step} />;
  return <MultimeterView step={step} />;
}

function ProtocolView({ step }: { step: ProtocolStep }) {
  return (
    <div className={styles.protocolView}>
      <div className={styles.protocolParticipants}>
        {step.participants.map((participant) => (
          <span key={participant}>{participant}</span>
        ))}
      </div>
      <div className={styles.protocolMessages}>
        {step.messages.map((message, index) => (
          <div key={index} className={message.active ? styles.protocolMessageActive : styles.protocolMessage}>
            <div className={styles.protocolRoute}>
              <strong>{message.from}</strong>
              <span>→</span>
              <strong>{message.to}</strong>
            </div>
            <div>
              <div>{message.label}</div>
              {message.detail && <small>{message.detail}</small>}
            </div>
          </div>
        ))}
      </div>
      {step.fields && step.fields.length > 0 && (
        <div className={styles.protocolFields}>
          {step.fields.map((field) => (
            <div key={field.name}>
              <span>{field.name}</span>
              <code>{field.value}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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

    const url = gamePath('technical/generated/' + tech.src.replace(/^\/+/, '') + '.json');
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
  const kind: TechnicalKind = payload?.kind ?? tech.kind;

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
          {!error && step && (kind === 'plot' || kind === 'diagram' || kind === 'circuit') && (
            <SvgView step={step as SvgStep} />
          )}
          {!error && step && kind === 'instrument' && <InstrumentView step={step as InstrumentStep} />}
          {!error && step && kind === 'protocol' && <ProtocolView step={step as ProtocolStep} />}
        </div>
        {step?.caption && <div className={styles.caption}>{step.caption}</div>}
      </div>
    </section>
  );
}
